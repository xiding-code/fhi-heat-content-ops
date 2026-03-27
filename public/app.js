// --- Image Upload Handling ---
const uploadZone = document.getElementById("upload-zone");
const imageInput = document.getElementById("image-input");
let uploadedImageBase64 = null;

// Drag & drop
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) handleImageFile(file);
});

imageInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleImageFile(e.target.files[0]);
});

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageBase64 = e.target.result; // data:image/...;base64,...
    document.getElementById("preview-img").src = uploadedImageBase64;
    document.getElementById("upload-placeholder").classList.add("hidden");
    document.getElementById("upload-preview").classList.remove("hidden");
    uploadZone.classList.add("has-image");
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedImageBase64 = null;
  imageInput.value = "";
  document.getElementById("preview-img").src = "";
  document.getElementById("upload-placeholder").classList.remove("hidden");
  document.getElementById("upload-preview").classList.add("hidden");
  uploadZone.classList.remove("has-image");
}

// --- Pipeline Launch ---
async function launchPipeline() {
  const product = document.getElementById("product").value.trim();
  const category = document.getElementById("category").value;
  const competitors = document.getElementById("competitors").value.trim();
  const avgViews = document.getElementById("avg-views").value;

  // Need at least image or product name
  if (!product && !uploadedImageBase64) {
    alert("Please upload a product image or enter a product name.");
    return;
  }

  const btn = document.getElementById("launch-btn");
  btn.disabled = true;
  btn.textContent = "Running Pipeline...";
  btn.classList.add("running");

  const pipeline = document.getElementById("pipeline");
  pipeline.classList.remove("hidden");

  // Reset all states
  document.querySelectorAll(".stage").forEach(s => s.classList.remove("active", "done", "error"));
  document.querySelectorAll(".agent-card").forEach(a => {
    a.classList.remove("running", "done", "error");
    const st = a.querySelector(".agent-status");
    if (st) st.textContent = "idle";
    const sc = a.querySelector(".agent-score");
    if (sc) sc.textContent = "";
  });
  document.querySelectorAll(".stage-output").forEach(o => { o.classList.remove("visible"); o.textContent = ""; });
  document.getElementById("content-package").innerHTML = "";

  pipeline.scrollIntoView({ behavior: "smooth" });

  const metrics = avgViews ? {
    avg_views: parseInt(avgViews),
    avg_completion_rate: "45%",
    avg_engagement_rate: "3.2%",
    follower_count: 10000,
  } : null;

  const payload = {
    product: product || "",
    category,
    competitors: competitors || "",
    metrics,
    image: uploadedImageBase64 || null,
  };

  try {
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          handleEvent(evt);
        } catch {}
      }
    }
  } catch (err) {
    console.error(err);
    alert("Pipeline error: " + err.message);
  }

  btn.disabled = false;
  btn.textContent = "Generate Content Strategy";
  btn.classList.remove("running");
}

function handleEvent({ stage, agent, status, data }) {
  if (stage === "complete") {
    document.querySelectorAll(".stage").forEach(s => s.classList.add("done"));
    return;
  }

  if (stage === "error") {
    alert("Error: " + (data?.message || "Unknown error"));
    return;
  }

  const stageKey = String(stage).replace(".", "-");
  const stageEl = document.querySelector(`.stage[data-stage="${stage}"]`);
  if (stageEl) {
    stageEl.classList.add("active");
    stageEl.classList.remove("done");
  }

  // Update agent card
  const agentId = stage === 2.5 ? "mismatch_detector_active" : agent;
  const agentEl = document.getElementById(`agent-${agentId}`);
  if (agentEl) {
    const statusEl = agentEl.querySelector(".agent-status");

    if (status === "running") {
      agentEl.classList.add("running");
      agentEl.classList.remove("done");
      if (statusEl) statusEl.textContent = "running...";
    } else if (status === "done") {
      agentEl.classList.remove("running");
      agentEl.classList.add("done");
      if (statusEl) statusEl.textContent = "complete";

      // Extract score for reviewers
      if (data && agentEl.classList.contains("reviewer")) {
        try {
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          const score = parsed.score || parsed.decision;
          const scoreEl = agentEl.querySelector(".agent-score");
          if (scoreEl && score !== undefined) {
            if (typeof score === "number") {
              scoreEl.textContent = score + "/100";
              scoreEl.style.color = score >= 70 ? "var(--green)" : score >= 50 ? "var(--orange)" : "var(--red)";
            } else {
              scoreEl.textContent = score.toUpperCase();
              scoreEl.style.color = score === "approve" ? "var(--green)" : score === "revise" ? "var(--orange)" : "var(--red)";
            }
          }
        } catch {}
      }

      // If image analyst returns product info, auto-fill the product name
      if (agent === "image_analyst" && data) {
        try {
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          if (parsed.product_name) {
            const productInput = document.getElementById("product");
            if (!productInput.value.trim()) {
              productInput.value = parsed.product_name;
            }
          }
        } catch {}
      }
    }
  }

  // Update stage output
  if (status === "done" && data) {
    const outputEl = document.getElementById(`output-${stageKey}`);
    if (outputEl) {
      const formatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      const label = agent.replace(/_/g, " ").toUpperCase();
      outputEl.textContent += `\n--- ${label} ---\n${formatted}\n`;
      outputEl.classList.add("visible");
    }

    if (stage === 4) {
      buildContentPackage(data);
      if (stageEl) {
        stageEl.classList.remove("active");
        stageEl.classList.add("done");
      }
    }
  }

  // Update stage status text
  const statusTextEl = document.getElementById(`status-${stageKey}`);
  if (statusTextEl) {
    if (status === "running") statusTextEl.textContent = "running";
    if (status === "done" && agent === "judge") statusTextEl.textContent = "complete";
    if (status === "done" && stage === 4) statusTextEl.textContent = "ready";
  }
}

function buildContentPackage(data) {
  const pkg = document.getElementById("content-package");
  if (!data || !data.content) return;

  // Parse verdict (using safeParse to handle markdown fences)
  let verdict = "approve";
  let verdictSummary = "";
  let revisionNotes = [];
  try {
    const v = safeParse(data.verdict);
    verdict = v.decision || "approve";
    verdictSummary = v.summary || "";
    revisionNotes = v.revision_notes || [];
  } catch {}

  // Parse review scores (using safeParse to handle markdown fences)
  let reviewHTML = "";
  try {
    const reviews = [
      { name: "Brand", data: data.reviews.brand, icon: "&#127912;" },
      { name: "FDA/Legal", data: data.reviews.legal, icon: "&#9878;" },
      { name: "Algorithm", data: data.reviews.algo, icon: "&#9881;" },
    ];
    reviewHTML = reviews.map(r => {
      const parsed = safeParse(r.data);
      if (parsed._raw) return ""; // skip if unparseable
      const score = parsed.score || 0;
      const pass = parsed.pass !== false;
      const color = score >= 70 ? "var(--green)" : score >= 50 ? "var(--orange)" : "var(--red)";
      const issues = parsed.issues || parsed.violations || [];
      return `<div class="review-chip">
        <span class="review-icon">${r.icon}</span>
        <span class="review-name">${r.name}</span>
        <span class="review-score" style="color:${color}">${score}/100</span>
        ${issues.length > 0 ? `<div class="review-issues">${issues.slice(0, 2).map(i => `<span class="issue-tag">${esc(typeof i === 'string' ? i.slice(0, 60) : JSON.stringify(i).slice(0, 60))}</span>`).join("")}</div>` : ""}
      </div>`;
    }).join("");
  } catch {}

  pkg.innerHTML = `
    <div class="verdict-banner verdict-${verdict}">
      ${verdict === "approve" ? "&#10003; APPROVED" : verdict === "revise" ? "&#9888; NEEDS REVISION" : "&#10007; REJECTED"}
      ${verdictSummary ? `<div class="verdict-summary">${esc(verdictSummary)}</div>` : ""}
    </div>

    ${reviewHTML ? `<div class="reviews-row">${reviewHTML}</div>` : ""}

    ${revisionNotes.length > 0 ? `<div class="revision-notes"><strong>Revision Notes:</strong><ul>${revisionNotes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}

    <div class="content-card platform-card-tiktok">
      <div class="card-header">
        <h4><span style="color:var(--tiktok)">&#127916;</span> TikTok Script</h4>
        <span class="card-badge">Ready to Film</span>
      </div>
      ${renderTikTok(data.content.tiktok)}
    </div>

    <div class="content-card platform-card-amazon">
      <div class="card-header">
        <h4><span style="color:var(--amazon)">&#128230;</span> Amazon Listing</h4>
        <span class="card-badge">Ready to Publish</span>
      </div>
      ${renderAmazon(data.content.amazon)}
    </div>

    <div class="content-card platform-card-instagram">
      <div class="card-header">
        <h4><span style="color:var(--instagram)">&#128247;</span> Instagram Content</h4>
        <span class="card-badge">Ready to Post</span>
      </div>
      ${renderInstagram(data.content.instagram)}
    </div>
  `;
}

function esc(str) {
  if (!str) return "";
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeParse(data) {
  if (!data) return {};
  if (typeof data === "object") return data;
  try {
    // Strip markdown code fences if present
    let clean = data.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(clean);
  } catch {
    return { _raw: data };
  }
}

function renderTikTok(raw) {
  const d = safeParse(raw);
  if (d._raw) return `<div class="fallback-text">${esc(d._raw)}</div>`;

  const script = d.script || {};
  const pos = d.positioning || {};
  const hashtags = d.hashtags || [];

  return `
    ${pos.niche ? `<div class="content-section"><label>Positioning</label><p>${esc(pos.niche)}</p></div>` : ""}
    ${pos.tone ? `<div class="content-section"><label>Tone</label><p>${esc(pos.tone)}</p></div>` : ""}
    <div class="script-block">
      <label>Script</label>
      ${script.hook ? `<div class="script-line"><span class="script-tag">HOOK</span><p>${esc(script.hook)}</p></div>` : ""}
      ${script.body ? `<div class="script-line"><span class="script-tag body-tag">BODY</span><p>${esc(script.body)}</p></div>` : ""}
      ${script.cta ? `<div class="script-line"><span class="script-tag cta-tag">CTA</span><p>${esc(script.cta)}</p></div>` : ""}
      ${script.duration_seconds ? `<div class="script-meta">Duration: ${script.duration_seconds}s</div>` : ""}
      ${script.trend_adapted ? `<div class="script-meta">Trend: ${esc(script.trend_adapted)}</div>` : ""}
    </div>
    ${hashtags.length > 0 ? `<div class="hashtags">${hashtags.map(h => `<span class="hashtag">${esc(h.startsWith("#") ? h : "#" + h)}</span>`).join(" ")}</div>` : ""}
  `;
}

function renderAmazon(raw) {
  const d = safeParse(raw);
  if (d._raw) return `<div class="fallback-text">${esc(d._raw)}</div>`;

  const bullets = d.bullets || [];

  return `
    ${d.title ? `<div class="content-section"><label>Product Title</label><p class="amazon-title">${esc(d.title)}</p></div>` : ""}
    ${bullets.length > 0 ? `<div class="content-section"><label>Bullet Points</label><ul class="amazon-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>` : ""}
    ${d.description ? `<div class="content-section"><label>A+ Description</label><p>${esc(d.description)}</p></div>` : ""}
    ${d.keywords ? `<div class="content-section"><label>Backend Keywords</label><p class="keywords-text">${esc(d.keywords)}</p></div>` : ""}
  `;
}

function renderInstagram(raw) {
  const d = safeParse(raw);
  if (d._raw) return `<div class="fallback-text">${esc(d._raw)}</div>`;

  const carousel = d.carousel || {};
  const slides = carousel.slides || [];
  const reel = d.reel || {};
  const hashtags = d.hashtags || [];

  return `
    ${slides.length > 0 ? `
      <div class="content-section">
        <label>Carousel (${slides.length} slides)</label>
        <div class="slides-list">${slides.map((s, i) => {
          const text = typeof s === "string" ? s : (s.hook || s.content || s.visual || JSON.stringify(s));
          return `<div class="slide-item"><span class="slide-num">${i + 1}</span><p>${esc(text)}</p></div>`;
        }).join("")}</div>
      </div>` : ""}
    ${carousel.caption ? `<div class="content-section"><label>Caption</label><p class="ig-caption">${esc(carousel.caption)}</p></div>` : ""}
    ${reel.concept ? `<div class="content-section"><label>Reel Concept</label><p>${esc(reel.concept)}</p></div>` : ""}
    ${reel.hook ? `<div class="content-section"><label>Reel Hook</label><p>${esc(reel.hook)}</p></div>` : ""}
    ${hashtags.length > 0 ? `<div class="hashtags">${hashtags.map(h => `<span class="hashtag">${esc(h.startsWith("#") ? h : "#" + h)}</span>`).join(" ")}</div>` : ""}
  `;
}
