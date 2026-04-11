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
- **Auth:** Google service account (key stored via bioenv — Touch ID protected)

## Managed Sites

Sites are stored in SQLite (`data/seo-tools.db`) and managed via the Config tab UI. No site names, domains, or GA4 property IDs are hardcoded in source code.

Use the **Config tab → Managed Sites** section to:
- Add, edit, or delete sites
- Run "Discover sites" to import from Google Search Console + GA4 automatically

Each site record stores: id, name, domain, SC URL override, GA4 property ID, stack, test pages, and skip-checks list.

## Implementation Status

- [x] Core Infrastructure (Google Auth, Site Config)
- [x] GA4 Property Auto-discovery
- [x] Search Console Data Integration (sc-domain: format, all 6 sites)
- [x] Sitemaps submitted to Search Console (all 6 sites)
- [x] Dashboard Overview Page (Real-time metrics)
- [x] Navigation & Routing
- [x] CLI tool (`pnpm seo <command>`: sites, sitemaps, submit-sitemap, stats)
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

## Google Service Account

One service account manages all sites. Key stored in `.env.local` as a single-line JSON string.

```bash
# .env.local format
GOOGLE_SA_KEY_JSON='{"type":"service_account",...}'
```

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

### Audit UX Enhancements
- **Last checked timestamps** — Each site audit card shows relative time (e.g., "Checked 5m ago", "Checked yesterday") so users know data freshness. Uses `formatRelativeTime()` helper for human-readable output. Important given 300s revalidate window.

## Analytics Reporting

**Search Console data:**
- Total clicks, impressions, avg CTR, avg position
- Top queries (20)
- Top pages (20)
- Indexed pages count
- 7-day comparison with trend arrows

**GA4 data:**
- Active users, sessions, page views, bounce rate, avg session duration
- Top pages (15)
- Traffic sources (10)
- 7-day comparison with trend arrows

**GA4 auto-discovery:** The `init` flow calls GA4 Admin API `listAccountSummaries()` to find all properties accessible to the SA, then matches them to configured domains. No manual property ID entry needed.

## Gap Analysis

Compares each site against best practices and outputs recommendations:
- No robots.txt -> "Add robots.txt with Sitemap directive"
- No sitemap -> "Add dynamic sitemap generation"
- Generic meta tags -> "Add bot-aware meta injection"
- No OG images -> "Add dynamic OG image generation (satori)"
- No IndexNow -> "Add IndexNow ping on new content"
- No JSON-LD -> "Add structured data (Product, WebApplication, BreadcrumbList)"
- No noindex on dead content -> "Add noindex for dead/inactive pages"
- Missing image alt text -> "Add alt text to all images"
- Low internal linking -> "Improve internal linking"

## Project Paths

Managed site local paths are specific to each deployment. This project lives at `~/workspace/seo-tools`.

## Dev

```bash
pnpm install
pnpm dev            # Next.js dev server on port 3031
pnpm seo stats      # CLI: 7-day Search Console stats
pnpm seo sitemaps   # CLI: list submitted sitemaps
pnpm seo sites      # CLI: list all SC sites
pnpm seo submit-sitemap <domain> <url>  # CLI: submit a sitemap
pnpm seo snapshot   # CLI: take SC + GA4 snapshot for trend tracking
pnpm type-check     # TypeScript type checking (preferred over pnpm build for quick validation)
```

**Testing with MCP (Playwright):**
- Use `browser_navigate` to visit pages (e.g., `http://localhost:3031/audit/<site-id>`)
- Use `browser_take_screenshot` with `fullPage: true` to capture visual state
- Use `browser_evaluate` with `performance.getEntriesByType('navigation')` to measure real TTFB/FCP/load times
- Use `browser_snapshot` to inspect DOM structure and verify content rendered correctly
- Use `browser_click` with nav link refs to navigate between pages like a real user
- MCP gives real browser metrics — curl only measures server response, not actual render performance

**Notes:**
- The service account private key in `.env.local` has double-escaped `\n` characters. `google-auth.ts` normalizes these to real newlines before passing to GoogleAuth (required for Node 22 / OpenSSL 3).
- Search Console sites use domain properties (`sc-domain:example.com`), not URL-prefix (`https://example.com/`). The `search-console.ts` lib defaults to `sc-domain:` format.
- Service account email is stored in `data/seo-tools.db` (gitignored) — configure via the Config tab.

## Dependencies

Google API clients:
- `@googleapis/searchconsole` — Search Console API
- `@google-analytics/data` — GA4 Data API (traffic reports)
- `@google-analytics/admin` — GA4 Admin API (property discovery)
- `google-auth-library` — Service account authentication

Storage & charting:
- `better-sqlite3` — SQLite for snapshots, trends, and API response caching
- `recharts` — Area charts for trend visualization

## Design Notes

- Server-side API routes for all Google API calls (keys never exposed to client)
- Audit checks run server-side via fetch against live sites (Googlebot UA)
- SQLite caching (30-min TTL) for audit, SC, and GA4 data via `api_cache` table — avoids hammering sites/APIs
- Refresh button in nav clears cache via `DELETE /api/cache` and re-fetches all data
- Historical snapshots stored in `data/seo-tools.db` (excluded from git)
- Content decay detection compares SC page data between two consecutive periods
- Trend charts use `recharts` (AreaChart) — rendered client-side, data passed from server components
- Dark theme default (dark neutrals, monospace accents)

## Performance (measured via Playwright browser metrics, 2026-03-27)

| Page | TTFB | FCP | Full Load | Transfer | Notes |
|------|------|-----|-----------|----------|-------|
| `/` (Overview) | 694ms | 728ms | 732ms | 18KB | GA4 + SC for 6 sites |
| `/audit` | 77ms | 108ms | 112ms | 12KB | Cached after first load |
| `/report` | 1615ms | 1656ms | 1677ms | 14KB | Slowest — SC comparison + GA4 x6 |
| `/decay` | 686ms | 720ms | 731ms | 6KB | SC page queries x2 periods x6 |
| `/trends` | 97ms | 132ms | 131ms | 10KB | SQLite reads, instant |

**Bottleneck:** `/report` and `/decay` are slow on first load due to Google API calls (SC + GA4 for all 6 sites). After caching, all pages serve in <150ms. The 30-min cache TTL balances freshness vs API load.
