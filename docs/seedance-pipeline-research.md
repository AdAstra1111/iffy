# Seedance Pipeline Research
**Last updated:** 2026-04-10 | **Author:** Trinity (subagent research)

---

## What Is Seedance?

Seedance is ByteDance's AI video generation platform. It exists in multiple access points:

| Domain | What it is |
|--------|-----------|
| `seed.bytedance.com/en/seedance2_0` | Official ByteDance product page |
| `seedance.io` | Consumer-facing web app (text-to-video tool) |
| `seedance.im` | Mirror / alternate consumer interface |
| `api.byteplus.com/seedance/v1` | Official international API endpoint |

The core product is **Seedance 2.0**, released **February 2026**. It is ByteDance's flagship multimodal AI video generation model.

---

## Seedance 2.0 — Architecture & Capabilities

### Architecture
- **Model:** Dual-Branch Diffusion Transformer
- **Modalities in:** Text, image, audio, video (all simultaneously)
- **Up to 12 reference files** per generation request
- **Audio-video joint generation** — both branches run in parallel, producing natively synchronized output (not audio added in post)
- Physics-aware motion synthesis for realistic motion

### Key Capabilities
| Feature | Detail |
|---------|--------|
| Text-to-video | Detailed prompt understanding, scene composition |
| Image-to-video | Animates stills with natural motion |
| Audio-video joint gen | Synchronized soundtrack + visuals in one pass |
| Multimodal reference mixing | Combine character images, motion references, audio tracks, environment photos |
| Resolution | Up to 2K (720p, 1080p, 2K tiers) |
| Duration | 4–15 seconds per generation |
| Aspect ratios | 16:9, 9:16, 1:1 |

### Competitive Positioning
- Described as **~100× cheaper** than OpenAI's Sora 2 at equivalent resolution ($0.05/5s at 720p via third-party)
- First major video model to accept all four input modalities *simultaneously*
- Motion stability and temporal coherence are primary differentiators vs. older models (jitter-free, ghosting-free)

---

## Pipeline / API Workflow

### Pattern: Async Job-Based
```
Submit job → Poll for status → Download result
```
Generation time: **30–120 seconds** depending on resolution and duration.

### Official API (BytePlus — International)

```python
import requests, time

API_BASE = "https://api.byteplus.com/seedance/v1"
API_KEY = "your-api-key-here"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# 1. Submit generation job
response = requests.post(
    f"{API_BASE}/videos",
    headers=headers,
    json={
        "model": "seedance-2.0",
        "prompt": "A golden retriever running through a sunlit meadow, cinematic lighting, slow motion",
        "resolution": "720p",
        "duration": 5,
        "aspect_ratio": "16:9"
    }
)
job_id = response.json()["id"]

# 2. Poll for completion
while True:
    status = requests.get(f"{API_BASE}/videos/{job_id}", headers=headers).json()
    if status["status"] == "completed":
        video_url = status["output"]["url"]
        break
    time.sleep(5)

# 3. Download result
video_data = requests.get(video_url).content
```

### Access Paths Summary
| Platform | Region | Auth | Notes |
|----------|--------|------|-------|
| **BytePlus** (`api.byteplus.com`) | International | API key (Bearer) | USD billing, international data compliance |
| **Volcengine** (Volcano Ark) | China (mainland) | API key | RMB invoicing, localized support |
| **fal.ai** | Global | API key | OpenAI-compatible endpoint, simpler integration |
| **PiAPI** | Global | API key | OpenAI-compatible, good for existing OpenAI SDK users |
| **imagine.art** | Global | Account | Consumer-grade, via web UI |
| **Dreamina** | Global | Subscription | Consumer app, ~$9.60 USD/month |

### API Parameters (Core)
```json
{
  "model": "seedance-2.0",
  "prompt": "string (text description)",
  "resolution": "720p | 1080p | 2k",
  "duration": 4-15,
  "aspect_ratio": "16:9 | 9:16 | 1:1",
  "reference_files": ["url1", "url2", "...up to 12"]
}
```

### Pricing (as of March 2026, third-party providers)
| Resolution | ~Cost/second | Cost per 5s clip |
|------------|-------------|-----------------|
| 720p | ~$0.01/s | ~$0.05 |
| 1080p | ~$0.03/s | ~$0.15 |
| 2K | ~$0.08/s | ~$0.40 |

Official BytePlus pricing varies; third-party providers typically cheaper for volume.

---

## Comparison: Seedance vs. IFFY's Reverse-Engineering Approach

| Dimension | Seedance | IFFY |
|-----------|----------|------|
| **Direction** | Forward generation (prompt → video) | Reverse engineering (existing content → patterns) |
| **Input** | Text/image/audio/video prompts | Produced scripts, screenplays, market data |
| **Output** | Rendered video clips | Analysis, production intelligence, script scaffolding |
| **LLM Role** | Diffusion model for visual synthesis | LLM for narrative/structural analysis |
| **Use case** | Create new video content | Understand what makes content work |
| **API model** | Cloud API (paid per generation) | Local Ollama inference or Supabase edge |
| **Latency** | 30–120s per clip | Variable (analysis workloads) |
| **Data** | Multimodal content files | Metadata, scraped data, structural features |

### Key Insight for IFFY
Seedance and IFFY operate in **complementary layers of the content pipeline**:
- IFFY analyzes *why* content succeeds → identifies patterns, trends, story structures
- Seedance *generates* content from prompts → could be downstream consumer of IFFY's pattern outputs

A potential integration path: IFFY's pattern analysis → generates structured creative briefs → feeds into Seedance 2.0 as detailed prompts + reference files for prototype scene generation.

---

## LLM / Models Used

Seedance 2.0 does **not** use a conventional LLM (GPT, Llama, etc.) for the video output itself. It uses:
- **Dual-Branch Diffusion Transformer** — proprietary ByteDance architecture
- Likely uses a text encoder (similar to T5/CLIP family) for prompt understanding
- Architecture is comparable to Sora (Diffusion Transformer) and Runway Gen-3

The model is **not open-source** and not locally runnable (too large, proprietary weights).

---

## Known Limitations
- No publicly available open weights — cloud-only
- Maximum 15 seconds per generation (no long-form video)
- International API access requires BytePlus account verification
- Generation is non-deterministic; same prompt can yield different results
- Audio generation quality lags behind specialist audio-only models

---

## Sources
- `seed.bytedance.com/en/seedance2_0` — official product page
- `seedanceapi.com` — third-party API wrapper
- `nxcode.io` — developer guide (March 2026)
- `huggingface.co` — community technical analysis thread
