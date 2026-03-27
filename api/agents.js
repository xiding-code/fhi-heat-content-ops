const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

async function callClaude(systemPrompt, userPrompt, model = "claude-sonnet-4-20250514") {
  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return msg.content[0].text;
}

// Vision-capable call for image analysis
async function callClaudeWithImage(systemPrompt, textPrompt, imageBase64, model = "claude-sonnet-4-20250514") {
  // Extract mime type and raw base64 from data URL
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data");
  const mediaType = match[1];
  const data = match[2];

  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data },
        },
        { type: "text", text: textPrompt },
      ],
    }],
  });
  return msg.content[0].text;
}

// Stage 0: Audience Intelligence (with image analysis)
const audienceAgents = {
  imageAnalyst: async (imageBase64) => {
    const system = `You are a beauty product visual analyst. Analyze this product image and identify:
1. Product name / brand (if visible on packaging)
2. Product category (hair styling tools, hair care, skincare, cosmetics, fragrance, nail care, body care)
3. Key visual features (color, shape, materials, packaging style)
4. Target market signals from packaging/design (luxury, budget, professional, youth, etc.)
5. Any text/claims visible on the product
Return JSON: { product_name, category, features: [...], target_signals: [...], visible_text: [...] }`;
    return callClaudeWithImage(system, "Analyze this beauty product image in detail.", imageBase64);
  },

  personaBuilder: async (product, category) => {
    const system = `You are a beauty industry audience strategist. Given a product, identify 3-4 distinct target personas. For each persona, specify:
- Skin/hair type (e.g., oily/dry/combination, fine/thick/curly/straight, cool/warm/deep skin tone)
- Age range and life stage
- Core pain point (what problem they need solved)
- Purchase motivation (why they'd buy this specific product)
- Platform preference (where they spend time: TikTok, Instagram, Amazon search)
Return as JSON array with keys: persona_name, type, age_range, pain_point, motivation, platform.`;
    return callClaude(system, `Product: ${product}\nCategory: ${category}`);
  },

  mismatchDetector: async (content, persona) => {
    const system = `You are a content-audience alignment auditor for beauty brands. Given a piece of marketing content and its intended target persona, check for mismatches:
1. Does the pain point in the content match the persona's actual concern?
2. Does the visual/tone match the demographic?
3. Is the platform appropriate for this audience?
4. Are there any claims that don't apply to this persona's type?
Return JSON: { score: 0-100, issues: [...], recommendation: "pass" | "revise" | "reject" }`;
    return callClaude(system, `Content:\n${content}\n\nTarget Persona:\n${JSON.stringify(persona)}`);
  },
};

// Stage 1: Market Intelligence
const marketAgents = {
  trendScout: async (category, platform) => {
    const system = `You are a ${platform} trend analyst specializing in beauty/cosmetics content. Identify:
1. Top 5 trending content formats right now (e.g., "3-second transformation", "POV morning routine", "before/after")
2. Top 3 trending hooks that stop scrolling
3. Viral sound/music trends relevant to beauty content
4. Hashtag clusters with high engagement
5. What type of beauty content is currently oversaturated (avoid these)
Return as structured JSON.`;
    return callClaude(system, `Category: ${category}\nPlatform: ${platform}\nProvide current trends.`);
  },

  competitorAnalyst: async (product, competitors) => {
    const system = `You are a competitive intelligence analyst for beauty brands. Analyze competitor content strategy:
1. What content themes are competitors posting most?
2. Which of their recent posts got highest engagement and why?
3. What gaps exist in their content (opportunities for us)?
4. What claims are they making that we can counter?
Return as structured JSON with keys: themes, top_content, gaps, counter_claims.`;
    return callClaude(system, `Our product: ${product}\nCompetitors: ${competitors}`);
  },

  performanceDiagnostics: async (metrics) => {
    const system = `You are a social media performance diagnostician for beauty brands. Given account metrics, determine:
1. Is the problem EXPOSURE (low impressions but decent engagement rate) or CONTENT QUALITY (high impressions but low completion/engagement)?
2. What specific metric patterns indicate the root cause?
3. Actionable recommendations (max 3)
Return JSON: { diagnosis: "exposure" | "content_quality" | "both", evidence: [...], recommendations: [...] }`;
    return callClaude(system, `Account metrics:\n${JSON.stringify(metrics)}`);
  },
};

// Stage 2: Platform Content Crews
const platformAgents = {
  tiktokLead: async (brief, persona, trends) => {
    const system = `You are a TikTok creative director for a beauty brand. Your job:
1. Define account positioning for this product line (niche, tone, recurring series)
2. Generate a TikTok script based on the content brief, adapted from trending formats
3. The script must: hook in first 1.5 seconds, address the persona's specific pain point, show product in action by second 3, include a clear CTA
4. Adapt a currently trending format/structure to fit this brand (cite which trend you're adapting)
Return JSON: { positioning: {...}, script: { hook, body, cta, duration_seconds, trend_adapted }, hashtags: [...] }`;
    return callClaude(system, `Content Brief:\n${brief}\n\nTarget Persona:\n${JSON.stringify(persona)}\n\nCurrent Trends:\n${trends}`);
  },

  amazonLead: async (brief, persona) => {
    const system = `You are an Amazon product listing specialist for beauty products. Generate:
1. Optimized product title (max 200 chars, keyword-rich)
2. 5 bullet points highlighting benefits mapped to persona pain points
3. A+ Content description (emotional + technical)
4. Backend search keywords (comma-separated)
Writing style must match Amazon's conversion-optimized format — benefits before features, address objections.
Return JSON: { title, bullets: [...], description, keywords }`;
    return callClaude(system, `Content Brief:\n${brief}\n\nTarget Persona:\n${JSON.stringify(persona)}`);
  },

  instagramLead: async (brief, persona, trends) => {
    const system = `You are an Instagram content strategist for a beauty brand. Generate:
1. Carousel post concept (5-7 slides outline with hook on slide 1)
2. Caption with storytelling hook, value, and CTA
3. Reel concept (different from TikTok — Instagram favors polished aesthetic over raw)
4. Hashtag strategy (mix of high-volume and niche)
Return JSON: { carousel: { slides: [...], caption }, reel: { concept, hook, duration }, hashtags: [...] }`;
    return callClaude(system, `Content Brief:\n${brief}\n\nTarget Persona:\n${JSON.stringify(persona)}\n\nCurrent Trends:\n${trends}`);
  },
};

// Stage 3: Review Board
const reviewAgents = {
  brandReviewer: async (content, brandGuidelines) => {
    const system = `You are a brand compliance reviewer for a premium beauty brand. Evaluate content against brand guidelines:
1. Tone of voice consistency (professional yet approachable)
2. Visual direction alignment
3. Brand promise accuracy
4. Consistency across platforms
Score 0-100. Return JSON: { score, issues: [...], pass: boolean }`;
    return callClaude(system, `Content:\n${content}\n\nBrand Guidelines:\n${brandGuidelines}`);
  },

  legalReviewer: async (content) => {
    const system = `You are an FDA/FTC compliance reviewer for beauty product marketing. Check for:
1. Prohibited medical claims (e.g., "heals", "treats", "cures", "repairs damage")
2. Unsubstantiated performance claims
3. Required disclaimers missing
4. Competitor disparagement
5. Before/after claims without proper disclosure
Score 0-100. Return JSON: { score, violations: [...], required_changes: [...], pass: boolean }`;
    return callClaude(system, `Review this beauty product marketing content for compliance:\n${content}`);
  },

  algorithmReviewer: async (content, platform) => {
    const system = `You are a ${platform} algorithm optimization expert. Evaluate content for platform-specific performance:
For TikTok: hook strength (first 1.5s), completion rate potential, shareability, trend alignment
For Instagram: carousel swipe-through rate, caption engagement, hashtag relevance, aesthetic quality
For Amazon: keyword density, bullet readability, A+ content structure, conversion triggers
Score 0-100. Return JSON: { score, platform, strengths: [...], weaknesses: [...], pass: boolean }`;
    return callClaude(system, `Platform: ${platform}\nContent:\n${content}`);
  },

  judge: async (brandScore, legalScore, algoScore) => {
    const system = `You are the final judge on a content review board. Given scores from 3 reviewers (brand, legal, algorithm), make a final decision:
- ALL PASS (all scores >= 70): approve
- ANY legal violation: reject with required changes
- Brand or algorithm below 70: revise with specific notes
Return JSON: { decision: "approve" | "revise" | "reject", summary, revision_notes: [...] }`;
    return callClaude(system, `Brand Review:\n${brandScore}\n\nLegal Review:\n${legalScore}\n\nAlgorithm Review:\n${algoScore}`);
  },
};

module.exports = { audienceAgents, marketAgents, platformAgents, reviewAgents };
