# Film/TV Trend Detection Research
**Last updated:** 2026-04-10 | **Author:** Trinity (subagent research)

---

## Overview

Film/TV trend detection in 2026 combines multiple signal types: theatrical box office data, streaming engagement metrics, social media virality, and awards circuit patterns. The best implementations fuse several of these rather than relying on a single source.

---

## Signal Categories & Best Practices

### 1. Theatrical Release Data

**What it captures:** Opening weekend performance, cumulative box office, market share by genre, regional performance variance.

**Primary sources:**
- **Box Office Mojo** (IMDbPro/Amazon) — domestic + international grosses, real-time weekend tracking
- **The Numbers** (Nash Information Services) — historical data, budget vs. revenue, franchise tracking
- **TMDB** (The Movie Database) — release schedules, popularity scoring, genre tagging

**API Access:**
| Source | API | Notes |
|--------|-----|-------|
| TMDB | `https://api.themoviedb.org/3/` | Free tier; requires API key registration |
| Box Office Mojo | No public API | Scraping or IMDbPro subscription |
| The Numbers | No public API | Scraping permitted for non-commercial |

**TMDB Key Endpoints for Trend Detection:**
```
GET /movie/popular          — Current popularity rank (relative, not absolute numbers)
GET /movie/now_playing      — Current theatrical releases
GET /movie/upcoming         — Pre-release trend prediction window
GET /trending/movie/{timeWindow}  — Day or week trending (uses internal engagement signals)
GET /discover/movie?sort_by=popularity.desc&with_genres=X  — Genre-filtered trend discovery
```

**Best practice:** TMDB's `popularity` score combines views, ratings, watchlist adds, and release recency — useful as a composite signal but not a raw viewership count.

---

### 2. Streaming Engagement Metrics

**What it captures:** Hours viewed, completion rates, day-1 vs day-7 audience decay, rewatch rates, regional engagement variance.

**Landscape:**
- Netflix, Disney+, HBO Max, Amazon Prime do **not** expose engagement APIs publicly
- Netflix introduced quarterly public viewership reporting in 2023 (aggregated, delayed ~6 months)
- Actual engagement data requires third-party measurement

**Available data signals:**
| Source | Signal Type | Access |
|--------|------------|--------|
| **Parrot Analytics** | "Demand Expressions®" — cross-platform audience demand | Paid API (enterprise) |
| **JustWatch** | Streaming availability tracking across platforms | Unofficial/scraping; Trakt API has similar |
| **Trakt API** | User watch activity, trending, ratings | Free for non-commercial; OAuth2 for user data |
| **Simkl API** | Watch tracking incl. anime, web shows | Free tier available |
| **Reelgood** | US streaming catalogue + ratings | API available (limited) |

**Netflix Engagement Reports:**
Netflix publishes engagement data at: `https://about.netflix.com/en/news/what-we-watched-a-netflix-engagement-report`
Data is semi-annual, covers titles >50K hours watched. Not real-time but useful for retrospective trend validation.

**Trakt API Key Endpoints:**
```
GET /movies/trending          — Current trending movies (by unique viewers)
GET /movies/popular           — All-time popularity rank
GET /shows/trending           — TV equivalent
GET /movies/{id}/ratings      — Distribution of ratings over time
GET /users/{username}/watched — User watch history (OAuth required)
```
Base URL: `https://api.trakt.tv`
Requires: `trakt-api-key` header (free registration)

---

### 3. Social Media Virality Signals

**What it captures:** Search volume spikes, social mentions, clip virality, cast/director trending, fandom activation.

**Best Sources:**

| Platform | Signal | Access |
|----------|--------|--------|
| **Google Trends** | Search volume over time, geographic breakdown | Free; no API key (Pytrends library) |
| **Reddit** | Subreddit growth, post velocity in r/movies, r/television | Reddit API (OAuth2, rate-limited post-2023) |
| **Twitter/X** | Hashtag volume, engagement velocity | Basic tier API ($100/mo); very limited |
| **TikTok** | Viral clip tracking, challenge spread | No public API; TikTok Research API (academic) |
| **YouTube** | Trailer views, official channel engagement | YouTube Data API v3 (free quota available) |

**Pytrends (Google Trends) — Practical:**
```python
from pytrends.request import TrendReq
pytrends = TrendReq(hl='en-US', tz=0)
pytrends.build_payload(['Severance', 'The Bear'], cat=35, timeframe='now 7-d', geo='US')
interest_df = pytrends.interest_over_time()
```

**YouTube Data API — Trailer Performance:**
```
GET https://www.googleapis.com/youtube/v3/videos?id={videoId}&part=statistics
```
Returns: viewCount, likeCount, commentCount — early trailer engagement predicts opening weekend performance.

---

### 4. Awards Patterns & Awards-Circuit Signals

**What it captures:** Festival buzz (Sundance, TIFF, Cannes), precursor awards (Critics Choice, Golden Globes), Oscar/BAFTA nominations as proxy for prestige content trending.

**Sources:**
| Source | Data | Access |
|--------|------|--------|
| **IMDb Pro** | Awards history, nominations | Subscription (~$20/mo) |
| **TMDB** | Award data (limited, community-sourced) | Free API |
| **Gold Derby** | Predictions/odds for awards races | Scraping only |
| **Awards Circuit** | Contender tracking | No API |
| **Academy Awards** | Official nomination data | HTML scraping |

**Pattern for IFFY:**
- Festival world premiere → 6-8 week window to awards season tracking
- TIFF audience award historically predicts Best Picture shortlists
- Metacritic aggregation scores + opening weekend box office = strong predictor of streaming deal value

---

### 5. Enterprise-Grade Data Providers

These are the sources used by studios, streamers, and major production companies:

#### Parrot Analytics
- **Metric:** Demand Expressions® (DEx) — proprietary composite of streaming engagement, downloads, social activity, and fan engagement signals
- **Coverage:** 100+ countries, all major SVOD/AVOD/TVOD platforms, linear TV
- **API:** Enterprise contract required (no self-serve pricing listed publicly)
- **API base:** Available per `apidocs.parrotanalytics.com` (contract required for keys)
- **Key data:** Daily demand for any title in any market, 5-year history, platform comparison
- **Use case for IFFY:** Validate whether a detected pattern translates to actual audience demand

#### GWI (formerly GlobalWebIndex)
- Audience demographics + content consumption behaviour
- Enterprise surveys, no real-time data

#### Nielsen / Gracenote
- Traditional TV ratings + streaming measurement service
- Enterprise only; integrated into many smart TV ACR data streams

#### Luminate (formerly MRC Data)
- Music + entertainment data company
- Provides streaming consumption data to Billboard, Variety
- Enterprise API available

---

## Recommended Architecture for IFFY Trend Detection

### Tier 1 — Free / Low Cost (immediate implementation)

```
TMDB API          → Genre popularity, upcoming releases, trending titles
Trakt API         → Real user watch activity, trending velocity
Google Trends     → Search interest spikes (Pytrends)
YouTube Data API  → Trailer engagement as leading indicator
Netflix Reports   → Retrospective validation (semi-annual)
```

### Tier 2 — Moderate Cost

```
IMDb Pro          → Awards data, professional-grade metadata
JustWatch/Simkl   → Streaming availability + user engagement signals
Reddit API        → Community sentiment and fandom activation signals
```

### Tier 3 — Enterprise (future)

```
Parrot Analytics  → Cross-platform demand expressions (industry standard)
Luminate          → Streaming consumption raw data
Nielsen Gracenote → Broad audience measurement
```

---

## Signal Fusion: Trend Scoring Model

A practical trend score for a title/genre/pattern combines:

```
TrendScore = (
    0.30 * normalized_tmdb_popularity_velocity +
    0.20 * normalized_trakt_watch_velocity +
    0.25 * normalized_google_trends_spike +
    0.15 * normalized_youtube_trailer_views_day7 +
    0.10 * awards_circuit_score
)
```

Where velocity = rate of change (current value / 7-day-ago value) to detect *rising* content rather than already-peaked.

---

## Specific APIs — Quick Reference

### TMDB
- **Base URL:** `https://api.themoviedb.org/3`
- **Auth:** `?api_key=YOUR_KEY` or `Authorization: Bearer TOKEN`
- **Free tier:** Yes (rate limited)
- **Docs:** `developer.themoviedb.org`

### Trakt
- **Base URL:** `https://api.trakt.tv`
- **Auth:** `trakt-api-key` header; OAuth2 for user data
- **Free tier:** Yes
- **Docs:** `trakt.docs.apiary.io`

### OMDB (Open Movie Database)
- **Base URL:** `http://www.omdbapi.com/`
- **Auth:** `?apikey=YOUR_KEY`
- **Free tier:** 1,000 req/day
- **Includes:** IMDb ratings, box office data, Rotten Tomatoes scores

### YouTube Data API v3
- **Base URL:** `https://www.googleapis.com/youtube/v3`
- **Auth:** API key or OAuth2
- **Free quota:** 10,000 units/day
- **Docs:** `developers.google.com/youtube/v3`

### Parrot Analytics
- **Base URL:** `https://api.parrotanalytics.com/v1` (enterprise contract required)
- **Auth:** API key
- **Key endpoint:** `/shows/{id}/demand` — returns DEx time series per market

---

## Notes for IFFY Integration

1. **TMDB + Trakt** form a solid free baseline for prototype trend detection
2. **Genre velocity** (rising popularity in a genre segment) is more actionable than raw popularity rankings
3. **Social signals lag 2-3 days** behind actual audience behaviour — good for confirming but not predicting
4. **Awards circuit tracking** is underutilised by most tools — festival premiere → streaming deal pipeline is a distinct trend signal
5. **Parrot Analytics** is the industry gold standard but expensive; start with free signals and validate against their public reports before subscribing
6. **Netflix's engagement reports** are free and useful for retrospective calibration — good for training a trend prediction model even if not real-time

---

## Sources
- `developer.themoviedb.org` — TMDB API docs
- `apidocs.parrotanalytics.com` — Parrot Analytics API overview
- `blog.brightcoding.dev` — TV/Movie tracking API guide (Dec 2025)
- `trakt.tv/api-docs` — Trakt API reference
