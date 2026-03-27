require("dotenv").config();
const express = require("express");
const path = require("path");
const { audienceAgents, marketAgents, platformAgents, reviewAgents } = require("./api/agents");

const app = express();
app.use(express.json({ limit: "10mb" })); // Allow large base64 images
app.use(express.static(path.join(__dirname, "public")));

// SSE endpoint for streaming pipeline progress
app.post("/api/pipeline", async (req, res) => {
  const { product, category, competitors, metrics, image } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (stage, agent, status, data = null) => {
    res.write(`data: ${JSON.stringify({ stage, agent, status, data })}\n\n`);
  };

  try {
    // Stage 0: Audience Intelligence
    let productName = product;
    let detectedCategory = category;
    let imageAnalysis = null;

    // If image is provided, run image analysis first
    if (image) {
      send(0, "image_analyst", "running");
      const analysis = await audienceAgents.imageAnalyst(image);
      imageAnalysis = analysis;
      send(0, "image_analyst", "done", analysis);

      // Use image analysis to fill in missing info
      try {
        const parsed = JSON.parse(analysis);
        if (!productName && parsed.product_name) productName = parsed.product_name;
        if (detectedCategory === "auto" && parsed.category) detectedCategory = parsed.category;
      } catch {}
    } else {
      // Mark image analyst as skipped
      send(0, "image_analyst", "done", { skipped: true, reason: "No image provided" });
    }

    // Auto-detect category if set to "auto" and no image detected it
    if (detectedCategory === "auto") {
      detectedCategory = "beauty products"; // generic fallback
    }

    // Persona Builder
    send(0, "persona_builder", "running");
    const personaContext = imageAnalysis
      ? `${productName}\n\nImage Analysis:\n${imageAnalysis}`
      : productName;
    const personas = await audienceAgents.personaBuilder(personaContext, detectedCategory);
    send(0, "persona_builder", "done", personas);

    // Pick first persona for demo flow
    let primaryPersona;
    try { primaryPersona = JSON.parse(personas)[0]; } catch { primaryPersona = { persona_name: "Primary", pain_point: "general concerns" }; }

    // Stage 1: Market Intelligence (parallel)
    send(1, "trend_scout", "running");
    send(1, "competitor_analyst", "running");

    const [trends, competitor] = await Promise.all([
      marketAgents.trendScout(detectedCategory, "TikTok"),
      marketAgents.competitorAnalyst(productName, competitors || "Dyson, CHI, BaByliss"),
    ]);
    send(1, "trend_scout", "done", trends);
    send(1, "competitor_analyst", "done", competitor);

    if (metrics) {
      send(1, "performance_diagnostics", "running");
      const diag = await marketAgents.performanceDiagnostics(metrics);
      send(1, "performance_diagnostics", "done", diag);
    }

    // Build content brief
    const brief = `Product: ${productName}\nCategory: ${detectedCategory}\nTarget Persona: ${JSON.stringify(primaryPersona)}\nTrends: ${trends}\nCompetitor Gaps: ${competitor}${imageAnalysis ? `\nProduct Visual Analysis: ${imageAnalysis}` : ""}`;

    // Stage 2: Platform Content Crews (parallel)
    send(2, "tiktok_lead", "running");
    send(2, "amazon_lead", "running");
    send(2, "instagram_lead", "running");

    const [tiktok, amazon, instagram] = await Promise.all([
      platformAgents.tiktokLead(brief, primaryPersona, trends),
      platformAgents.amazonLead(brief, primaryPersona),
      platformAgents.instagramLead(brief, primaryPersona, trends),
    ]);
    send(2, "tiktok_lead", "done", tiktok);
    send(2, "amazon_lead", "done", amazon);
    send(2, "instagram_lead", "done", instagram);

    // Stage 2.5: Mismatch Detection
    send(2.5, "mismatch_detector", "running");
    const mismatch = await audienceAgents.mismatchDetector(tiktok, primaryPersona);
    send(2.5, "mismatch_detector", "done", mismatch);

    // Stage 3: Review Board (parallel reviews, then judge)
    const allContent = `TikTok:\n${tiktok}\n\nAmazon:\n${amazon}\n\nInstagram:\n${instagram}`;
    const brandGuidelines = `Brand: ${productName} by FHI Heat. Tone: professional, innovative, empowering. Premium positioning. Never use: cheap, basic, budget.`;

    send(3, "brand_reviewer", "running");
    send(3, "legal_reviewer", "running");
    send(3, "algorithm_reviewer", "running");

    const [brand, legal, algo] = await Promise.all([
      reviewAgents.brandReviewer(allContent, brandGuidelines),
      reviewAgents.legalReviewer(allContent),
      reviewAgents.algorithmReviewer(tiktok, "TikTok"),
    ]);
    send(3, "brand_reviewer", "done", brand);
    send(3, "legal_reviewer", "done", legal);
    send(3, "algorithm_reviewer", "done", algo);

    send(3, "judge", "running");
    const verdict = await reviewAgents.judge(brand, legal, algo);
    send(3, "judge", "done", verdict);

    // Stage 4: Final output
    send(4, "output", "done", {
      personas,
      trends,
      competitor,
      content: { tiktok, amazon, instagram },
      mismatch,
      reviews: { brand, legal, algo },
      verdict,
    });

    send("complete", "pipeline", "done");
  } catch (err) {
    send("error", "pipeline", "error", { message: err.message });
  }

  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
