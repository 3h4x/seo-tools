# seo-tools

Unified SEO dashboard for all projects. Next.js web app that audits, reports, and identifies SEO gaps across multiple sites from a single interface.

## What This Is

A multi-project SEO manager that:
1. **Audits** each site's SEO health (robots.txt, sitemap, OG images, meta tags, JSON-LD)
2. **Reports** Search Console + GA4 data for all projects in one dashboard
3. **Identifies** what's missing or broken so we can improve

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind v4
- **APIs:** Google Search Console API, GA4 Data API, GA4 Admin API
- **Auth:** Google service account (key stored in SQLite via Config tab, or `GOOGLE_SA_KEY_JSON` env var)

## Managed Sites

Sites are stored in SQLite (`data/seo-tools.db`) and managed via the Config tab UI. No site names, domains, or GA4 property IDs are hardcoded in source code.

Use the **Config tab → Managed Sites** section to add, edit, delete, or discover sites from Google Search Console + GA4.

## Implementation Status

- [x] Core Infrastructure (Google Auth, Site Config)
- [x] GA4 Property Auto-discovery
- [x] Search Console Data Integration (sc-domain: format)
- [x] Sitemaps submitted to Search Console
- [x] Dashboard Overview Page (Real-time metrics)
- [x] Navigation & Routing
- [x] CLI tool (`pnpm seo <command>`: sites, sitemaps, submit-sitemap, stats, snapshot, check)
- [x] GA4 Analytics on Dashboard (active users, sessions, page views, traffic sources)
- [x] SEO Health Audit Logic (robots.txt, Sitemap, Meta tags)
- [x] Detailed Analytics Reporting Pages
- [x] Gap Analysis Recommendations Engine
- [x] Content Decay Detection (7d/30d comparison, cross-site declining pages)
- [x] Image SEO Audit (alt text coverage, lazy loading)
- [x] Internal Linking Audit (per-page link count analysis)
- [x] Historical Snapshots (SQLite storage, `pnpm seo snapshot` CLI)
- [x] Trends Page (SC + GA4 + audit score over time, recharts area charts)
- [x] SQLite Caching (30-min TTL for audit, SC, GA4 data via `api_cache` table)
- [x] Refresh Button (global nav, clears cache + refreshes page)
- [x] DB-Managed Sites (sites stored in SQLite, Config UI for CRUD + discovery, no hardcoded domains)
- [x] SA key stored in SQLite via Config tab (DB takes priority over env var)
- [x] Skip checks per site — checkbox list in Config UI
- [x] Husky pre-commit hooks (lint + type-check + test)

## Google Service Account

One service account manages all sites. Paste the JSON key in the **Config tab** — it's stored in SQLite and never committed.

Alternatively, set `GOOGLE_SA_KEY_JSON` as an environment variable (Config tab DB key takes priority).

**Required API scopes:**
- `https://www.googleapis.com/auth/webmasters` (Search Console)
- `https://www.googleapis.com/auth/webmasters.readonly` (Search Console read)
- `https://www.googleapis.com/auth/analytics.readonly` (GA4 Data API)
- `https://www.googleapis.com/auth/analytics.edit` (GA4 Admin API — for property discovery)

**Setup requirements per site:**
- Search Console: service account email added as Owner under Settings > Users and permissions
- GA4: service account email added as Viewer (or higher) in Property Access Management
- The SA has Administrator access and can auto-discover GA4 properties via `listAccountSummaries()`

## Dashboard Pages

- `/` — Overview: all sites summary (health score, key metrics, trend arrows)
- `/audit` — SEO health audit results per site (with "Last checked" timestamps)
- `/audit/[site]` — Redirects to `/{site}` for detailed audit and analytics
- `/report` — Combined Search Console + GA4 analytics
- `/report/[site]` — Per-site analytics detail with daily trends
- `/decay` — Content decay detection (declining pages across all sites, 7d/30d toggle)
- `/trends` — Historical trend data from SQLite snapshots (SC + GA4 + audit scores)
- `/config` — Service account key management + managed sites CRUD

## Audit Checks

Each site gets checked for:

1. **robots.txt** — exists, has Sitemap directive
2. **Sitemap** — valid XML, URL count, recent lastmod dates
3. **Meta tags** — fetch test pages as Googlebot UA, verify:
   - `<title>` (not generic/default)
   - `<meta name="description">`
   - `og:title`, `og:image`, `og:description`
   - `twitter:card`
   - `<link rel="canonical">`
   - JSON-LD `<script type="application/ld+json">`
4. **OG image** — fetch `og:image` URL, verify valid PNG, 1200x630 dimensions
5. **TTFB** — measure time to first byte (pass: <800ms, warn: 800-2000ms, fail: ≥2000ms)
6. **Image SEO** — count images, alt text coverage ratio, lazy-loading usage
7. **Internal Links** — count internal vs external links per page (3+ internal = pass)
8. **HTTPS** — HTTP redirects to HTTPS
9. **HSTS** — Strict-Transport-Security header present
10. **Favicon** — /favicon.ico reachable
11. **SC Sitemap** — sitemap submitted and downloaded by Google
12. **Indexing** — indexed page count from Search Console

Checks can be skipped per site via the Config tab (checkbox list). Skipped checks show as N/A and don't affect the score.

### Audit UX
- **Last checked timestamps** — Each site audit card shows relative time (e.g., "Checked 5m ago") using `formatRelativeTime()`.

## Analytics Reporting

**Search Console data:**
- Total clicks, impressions, avg CTR, avg position
- Top queries (20), top pages (20), indexed pages count
- 7-day comparison with trend arrows

**GA4 data:**
- Active users, sessions, page views, bounce rate, avg session duration
- Top pages (15), traffic sources (10)
- 7-day comparison with trend arrows

**GA4 auto-discovery:** Config tab → Discover sites pulls from both Search Console and GA4 Admin API, auto-matching properties to domains.

## Gap Analysis

Compares each site against best practices and outputs recommendations:
- No robots.txt → "Add robots.txt with Sitemap directive"
- No sitemap → "Add dynamic sitemap generation"
- Generic meta tags → "Add bot-aware meta injection"
- No OG images → "Add dynamic OG image generation (satori)"
- No IndexNow → "Add IndexNow ping on new content"
- No JSON-LD → "Add structured data (Product, WebApplication, BreadcrumbList)"
- No noindex on dead content → "Add noindex for dead/inactive pages"
- Missing image alt text → "Add alt text to all images"
- Low internal linking → "Improve internal linking"

## Project Paths

This project lives at `~/workspace/seo-tools`. SQLite DB at `data/seo-tools.db` (gitignored).

## Dev

```bash
pnpm install
pnpm dev            # Next.js dev server on port 3031
pnpm seo stats      # CLI: 7-day Search Console stats
pnpm seo sitemaps   # CLI: list submitted sitemaps
pnpm seo sites      # CLI: list all SC sites
pnpm seo submit-sitemap <domain> <url>  # CLI: submit a sitemap
pnpm seo snapshot   # CLI: take SC + GA4 snapshot for trend tracking
pnpm seo check      # CLI: reachability check (Googlebot UA) for all sites
pnpm type-check     # TypeScript type checking
pnpm lint           # ESLint
pnpm test           # vitest
```

**Notes:**
- The service account private key may have double-escaped `\n` characters. `google-auth.ts` normalizes these before passing to GoogleAuth (required for Node 22 / OpenSSL 3).
- Search Console sites use domain properties (`sc-domain:example.com`), not URL-prefix (`https://example.com/`).
- Sites with URL-prefix SC properties (e.g. GitHub Pages) should set the SC URL override in Config.

## Dependencies

Google API clients:
- `@googleapis/searchconsole` — Search Console API
- `@google-analytics/data` — GA4 Data API (traffic reports)
- `@google-analytics/admin` — GA4 Admin API (property discovery)
- `google-auth-library` — Service account authentication

Storage & charting:
- `better-sqlite3` — SQLite for snapshots, trends, and API response caching
- `recharts` — Area charts for trend visualization

Dev tooling:
- `husky` — pre-commit hooks (lint + type-check + test)

## Design Notes

- Server-side API routes for all Google API calls (keys never exposed to client)
- SA key never shown in UI — Config tab shows a status indicator only
- Audit checks run server-side via fetch against live sites (Googlebot UA)
- SQLite caching (30-min TTL) for audit, SC, and GA4 data via `api_cache` table
- Refresh button in nav clears cache via `DELETE /api/cache` and re-fetches all data
- Historical snapshots stored in `data/seo-tools.db` (excluded from git)
- Sitemap sync runs inside the Next.js server process every 6h — no external cron needed
- Dark theme default (dark neutrals, monospace accents)
