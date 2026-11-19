# Job Alert Shorts — Scene-wise Poster + Photo Mix

**Date:** 2026-11-19  
**Status:** Draft for approval  
**Choice:** Approach A (scene-wise mix)

## Goal

Make each Job Alert Short feel like an **Education Vibes–style info poster** on some scenes, and a **photo Short** on others — so facts stay clear (posts, dates, eligibility, pattern) while visuals stay related and attractive.

## Scene plan (5–7 scenes)

| # | Layout | On screen |
|---|--------|-----------|
| 1 | **Poster** | Soft white bg + big job name (e.g. रेलवे / RRB NTPC) + “NEW VACANCY” + thematic hero image (train / police / etc.) |
| 2 | **Poster** | White card(s): posts, start/end dates, qualification, age |
| 3–5 | **Photo** | Full-bleed news-related photo + big job name badge + keyword + spoken line |
| 6 (optional) | **Poster** | Exam pattern boxes (CBT questions/marks/time/subjects) when relevant |
| Last | **Poster CTA** | Brand + “Follow for daily job alerts” |

Scene count may shrink if AI returns fewer facts; layout type is forced by index rules so mix always appears.

## Data (AI + fallback)

`prepareNewsShort` returns structured facts when possible:

- `jobName` — short bold name (already exists)
- `facts`: `{ posts?, startDate?, endDate?, qualification?, ageLimit?, pattern?: string[] }`
- `scenes[]` with `say`, `keyword`, `image`, and `layout: "poster" | "photo"`

Fallback: parse/keep existing points + `extractJobLabel`; poster cards show keyword/points if dates missing.

## Visual system

- **Colors:** red `#dc1428`, navy `#0b1736`, yellow `#ffd400`, white cards, light grey borders
- **Poster bg:** soft white / light gradient (not dark full-bleed)
- **Hero image on poster:** related illustration/photo in top or side band (not covering text)
- **Photo scenes:** keep current full-bleed + scrims + yellow job badge
- **Typography:** Baloo 2 / Sora; job name largest; facts in clear rows

## Image generation

- Poster hero: one topic-matched image (e.g. Indian train for railway)
- Photo scenes: unique per-scene `sceneImageQuery` (already in place)
- Still English-only prompts; no random portraits

## Files to change

1. `src/backend/news.functions.ts` — facts + `layout` on scenes  
2. `src/lib/news-render.ts` — `drawPosterFrame` vs photo `drawScene`  
3. `src/components/app/NewsAlertsPanel.tsx` — pass facts; load hero + scene images  
4. Tests for layout assignment / fact shaping if small helpers are added

## Out of scope

- Exact logo cloning of third-party brands  
- Multi-language poster templates beyond current hindi/hinglish/english voice  
- Changing YouTube upload / preview-approve flow

## Success check

Preview Short: first frames look like a clean vacancy poster; middle frames change to different related photos; job name always large and readable; Approve → Upload still works.
