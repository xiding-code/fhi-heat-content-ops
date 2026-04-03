# Beauty Content Ops

An AI-powered multi-agent content pipeline that turns a single product photo into platform-ready marketing content for TikTok, Amazon, and Instagram — with built-in brand, legal, and algorithm review.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-Anthropic-6B4FBB?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## What It Does

Upload a beauty product image. **11 specialized AI agents** take over and run a 5-stage pipeline:

| Stage | Agents | What Happens |
|-------|--------|-------------|
| **0 — Audience Intelligence** | Image Analyst, Persona Builder | Analyzes product visuals, builds target customer personas |
| **1 — Market Intelligence** | Trend Scout, Competitor Analyst, Performance Diagnostics | Scans TikTok trends, maps competitor gaps, diagnoses metrics (parallel) |
| **2 — Content Creation** | TikTok Lead, Amazon Lead, Instagram Lead | Writes platform-native content simultaneously (parallel) |
| **2.5 — Mismatch Detection** | Mismatch Detector | Catches drift between generated content and target persona |
| **3 — Review Board** | Brand Reviewer, Legal/FDA Reviewer, Algorithm Reviewer, Final Judge | Multi-dimensional compliance check → approve / revise / reject |

Everything streams in real time via Server-Sent Events — you watch each agent reason through its task, not just a loading spinner.

## Why Stage 2.5 Matters

Most AI content tools generate and ship. This pipeline has a **mismatch detector** between creation and review that catches persona-content drift — the kind of subtle misalignment that a single-prompt approach would never flag. In testing, adding this layer meaningfully improved content quality scores across the board.

## Quick Start

```bash
git clone https://github.com/xiding-code/fhi-heat-content-ops.git
cd fhi-heat-content-ops
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_api_key_here
```

Run:

```bash
node server.js
```

Open `http://localhost:3000` in your browser.

## How to Use

1. **Upload a product image** — the Image Analyst will identify the product, category, and visual features
2. **Or type a product name** — e.g. "Dyson Airwrap", "NARS Radiant Creamy Concealer", "Olaplex No.3"
3. **Click Generate** — watch the pipeline run through all 5 stages in real time
4. **Review the output** — the Review Board will approve, request revision, or reject with specific notes

### Advanced Options

- **Category** — auto-detected from image, or manually select (hair tools, skincare, cosmetics, etc.)
- **Competitors** — name specific competitor brands for the Competitor Analyst to evaluate
- **Avg. Views** — provide existing performance metrics for the Diagnostics agent

## Architecture

```
Product Image / Name
        │
        ▼
┌─ Stage 0 ────────────────────┐
│  Image Analyst → Persona     │
│  Builder                     │
└──────────────┬───────────────┘
               ▼
┌─ Stage 1 ────────────────────┐
│  Trend Scout ─┐              │
│  Competitor ──┼─ (parallel)  │
│  Diagnostics ─┘              │
└──────────────┬───────────────┘
               ▼
┌─ Stage 2 ────────────────────┐
│  TikTok Lead ─┐              │
│  Amazon Lead ──┼─ (parallel) │
│  Instagram Lead┘             │
└──────────────┬───────────────┘
               ▼
┌─ Stage 2.5 ──────────────────┐
│  Mismatch Detector           │
└──────────────┬───────────────┘
               ▼
┌─ Stage 3 ────────────────────┐
│  Brand ──┐                   │
│  Legal ──┼─ (parallel)       │
│  Algo ───┘                   │
│       ▼                      │
│  Final Judge (sequential)    │
└──────────────┬───────────────┘
               ▼
        Content Package
    (approve / revise / reject)
```

## Tech Stack

- **Runtime**: Node.js + Express
- **AI**: Claude API via `@anthropic-ai/sdk`
- **Streaming**: Server-Sent Events (SSE)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Deployment**: Vercel

## Project Structure

```
├── server.js          # Express server, SSE pipeline orchestration
├── api/
│   └── agents.js      # All 11 agent definitions + Claude API calls
├── public/
│   ├── index.html     # Pipeline UI with stage visualization
│   ├── app.js         # Frontend SSE client + rendering logic
│   └── style.css      # Styling
├── vercel.json        # Vercel deployment config
└── package.json
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set `ANTHROPIC_API_KEY` in your Vercel project's Environment Variables.

## License

MIT

## Author

**Xincheng (George) Ding**

Built with Claude API | Inspired by CrewAI multi-agent patterns
