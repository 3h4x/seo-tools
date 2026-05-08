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

**Current storage behavior in code:** the app can boot without credentials, the Config tab stores the key in SQLite under `config.google_sa_key`, and that DB value currently takes priority over `GOOGLE_SA_KEY_JSON`. Treat the env var as a bootstrap/fallback path, not the primary source of truth.

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

## Synology NAS Deployment

Deployed to Synology NAS at `marcin@192.168.0.200` under `/volume2/docker/seo-tools/`.

- Image: `ghcr.io/3h4x/seo-tools:latest` (built + pushed by GHA on every release)
- Port: 3031
- Data: `/volume2/docker/seo-tools/data/` (SQLite db persisted here)
- Env: `/volume2/docker/seo-tools/.env` — set `GOOGLE_SA_KEY_JSON` here (or configure via Config tab after boot)

**Update command:**
```bash
ssh marcin@192.168.0.200 "cd /volume2/docker/seo-tools && /usr/local/bin/docker-compose pull && /usr/local/bin/docker-compose up -d"
```

GHA auto-builds on every push to `main` that triggers a semantic-release version bump. Uses `docker-compose` (v1) — not `docker compose`.

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

## Dependency & Supply-Chain Security

1. Always commit `pnpm-lock.yaml` — never delete it or install without it.
2. `pnpm.onlyBuiltDependencies` is locked to `["better-sqlite3"]`. Any new dep that needs a postinstall/build step must be added here explicitly with justification.
3. Run `pnpm audit` after any dependency change; resolve critical/high findings before committing.
4. Verify new packages on npmjs.com (publish date, download count, maintainer history) before adding. Justify every new dep in the commit message.
5. Never add a package not already in `package.json` without explicit user approval.
6. Before adding or updating any package, inspect its lifecycle scripts (`postinstall`, `prepare`, `preinstall`) in the registry tarball or manifest and avoid packages that execute unnecessary install-time code.

## Coding Conventions

1. **TypeScript**: strict mode is enabled (`"strict": true`). `@typescript-eslint/no-explicit-any` is intentionally disabled — use `any` sparingly when necessary.
2. **Runtime/framework versions**: this repo is on Next 16, React 19, TypeScript 6, Tailwind v4, ESLint 9, Vitest 4, and Playwright 1.59. Follow current App Router/server component patterns; do not introduce Pages Router, legacy React class components, or old Tailwind config assumptions.
3. **Path aliases**: use `@/` for imports from `src/` (e.g. `import { db } from '@/lib/db'`). Prefer `@/` over relative `../` imports across directory boundaries.
4. **File layout**:
   - App routes → `app/` (Next.js App Router; note: no `src/app/` — the `app/` dir is at the project root)
   - Business logic / shared utilities → `src/lib/`
   - React components → `app/components/`
   - Unit tests → `src/lib/__tests__/<module>.test.ts` (colocated with the lib they test)
   - E2E tests → `e2e/`
   - CLI scripts → `scripts/`
5. **Naming**: source files use kebab-case (`search-console.ts`, `google-auth.ts`). React component files use PascalCase where applicable.
6. **Caching**: use `withCache()` HOF for any new API route calling Google APIs. Do not inline cache logic.
7. **No hardcoded site data**: never hardcode domain names, GA4 property IDs, or SC URLs. All site config comes from SQLite via `src/lib/sites.ts`.
8. **Error handling**: Google/API integrations should catch provider failures, log a short contextual `console.error`, and return neutral data (`null`, empty arrays, or zeroed aggregates) so one bad site does not break the dashboard. API routes should return `NextResponse.json({ error })` with an appropriate 4xx/5xx status for user-fixable failures.
9. **Async patterns**: use `async`/`await` and bounded, obvious `Promise.all` fan-out for independent per-site/API calls. Keep cache reads/writes best-effort; do not make cache failures user-visible.
10. **Lint/format**: run `pnpm lint` and fix reported issues in source rather than disabling rules locally unless the existing file already establishes that exception.
11. **Module exports**: only export what is consumed outside the module. Remove `export` from interfaces, types, and functions that are internal to a file — unexported symbols are easier to refactor and test.
12. **Component size**: inline single-use React components (≤~40 lines, used in exactly one place) directly into the parent file. Only extract to a separate file when the component is reused in 2+ places or is large enough to warrant it. Extend existing flexible components with optional props rather than creating specialized one-off variants.
13. **Imports and barrels**: prefer direct imports from the owning module (`@/lib/foo`, `../components/Bar`) and avoid new barrel files or `export *` aggregators unless the pattern already exists in that folder.
14. **Alias reality check**: `tsconfig.json` currently maps `@/*` only to `src/*`. Use `@/lib/...` for `src/lib/**`, but do not assume `@/app/**` resolves. Inside `app/**`, use relative imports for `app/components/**` until the alias config changes.
15. **Lint baseline**: ESLint extends Next core-web-vitals + TypeScript rules. Repo-level exceptions already exist for `no-explicit-any`, `no-unused-vars`, `react/no-unescaped-entities`, and `react-hooks/set-state-in-effect`; do not add one-off disables when the existing config already defines the intended boundary.
16. **Next 16 request props**: in App Router pages and layouts, treat `searchParams` (and similar request props when typed as promises) as async values and `await` them before reading fields. Follow the existing page patterns instead of accessing them synchronously.
17. **ESM scripts**: this repo uses `"type": "module"`. New Node entrypoints belong in `scripts/*.mjs`, should use ESM `import` syntax, and should not introduce CommonJS `require`/`module.exports` patterns.

## Architecture & Patterns

1. **SQLite access**: centralize schema, migrations, cache helpers, and query helpers in `src/lib/db.ts`; do not create parallel DB/cache modules. Keep CLI schema changes in sync where scripts create the same tables.
2. **Site config**: use `src/lib/sites.ts` as the boundary for managed site CRUD and normalization. UI and route handlers should call that module instead of reading the `sites` table directly.
3. **Google clients**: keep Search Console logic in `src/lib/search-console.ts`, GA4 logic in `src/lib/ga4.ts`, and service account parsing/auth in `src/lib/google-auth.ts`. Do not expose credentials to client components.
4. **Server/client split**: prefer server components for data loading and small client components only for interaction, sorting, charts, form state, refresh state, and clipboard behavior.
5. **Caching strategy**: all Search Console, GA4, and audit fetches should use the SQLite `api_cache` table through `withCache()` unless they are explicit refresh, mutation, or health-check paths.
6. **Background jobs**: long-running recurring work belongs in `src/lib/sitemap-sync.ts` or `src/lib/collect-daily.ts` with CLI wrappers in `scripts/`; keep startup hooks idempotent.
7. **Styling**: use Tailwind v4 classes and the existing dark neutral dashboard style in `app/globals.css` and existing components. Keep operational pages dense and scannable rather than marketing-oriented.
8. **Route handlers**: keep `app/api/**/route.ts` files thin. Parse the request, delegate business logic to `src/lib/**`, and keep response shaping or status-code branching in the handler.
9. **State management**: load dashboard data on the server by default, pass serialized results into client components, and keep client state local to the page or component. Do not introduce a global client state library for fetched data.
10. **Node runtime only**: this app depends on `better-sqlite3`, `node:fs`, `node:path`, and server-only Google clients. Do not move DB/auth/audit code to Edge runtime, client components, or browser bundles.
11. **Page vs lib split**: when page or route code starts accumulating data-massaging logic, move that logic into `src/lib/**` first and test it there. Keep `app/**/page.tsx` focused on orchestration, layout, and rendering.
12. **Shared UI constants**: color palettes and valid parameter sets live in `src/lib/constants.ts` (`CHART_COLORS`, `METRIC_COLORS`, `VALID_DAYS`). Import from there rather than hardcoding hex strings or magic numbers in components or pages.
13. **Domain logic boundaries**: keep audit parsing/scoring in `src/lib/audit.ts`, recommendation generation in `src/lib/gaps.ts`, decay detection in `src/lib/decay.ts`, keyword history math in `src/lib/keyword-history.ts`, and display formatting helpers in `src/lib/format.ts`. Reuse those modules instead of re-implementing the same transformations in pages or components.
14. **Revalidation defaults**: dashboard pages that aggregate cached Google/API data currently use `export const revalidate = 300`. Preserve that five-minute ISR cadence by default and only change it with an explicit freshness or load reason, since manual refresh already exists for forced invalidation.
15. **CLI boundaries**: keep `scripts/*.mjs` focused on argument parsing and orchestration. Put reusable business logic, API calls, and data transforms in `src/lib/**`, then import them into the script instead of duplicating logic across CLI entrypoints.

## Scope & Safety Rules

1. Never commit secrets, `.env*` files, `data/seo-tools.db`, Playwright reports, or generated local build artifacts.
2. Do not change SQLite schema, migration behavior, Docker deployment files, release automation, or service account storage semantics without a focused reason in the user request.
3. Do not run destructive database, git, Docker, or deployment commands (`rm` data files, `git reset --hard`, forced pushes, Synology update commands) unless the user explicitly asks for that operation.
4. Work on the current branch unless instructed otherwise. This repo's recent workflow commits directly on `main`; do not create feature branches by default.
5. Before committing, verify `git status --short` and include only relevant files. Leave unrelated user changes untouched.
6. Preserve `pnpm-lock.yaml` and the `pnpm.onlyBuiltDependencies` allowlist when installing or updating dependencies.
7. Do not bypass repo safeguards with `--no-verify`, disabled hooks, force-pushes, or history rewrites unless the user explicitly asks for that exact operation.

## Testing Rules

1. **Runner**: vitest (`pnpm test`). Run after every non-trivial lib change.
2. **Pre-commit hook** (husky) runs `pnpm lint && pnpm type-check && pnpm test` — all three must pass before commit.
3. **Unit tests**: live in `src/lib/__tests__/`, named `<module>.test.ts`. Test new lib functions, data transformations, and edge cases in audit/gap logic. Skip thin API route handlers with no logic of their own. Do test route handlers that contain non-trivial branching, auth validation, credential normalization, or cache management — import the handler directly and mock its dependencies.
4. **Mocking**: mock external Google API clients in unit tests. Do not mock SQLite — use an in-memory or temp-file DB for tests that need persistence. When mocking a class constructor with `vi.mocked(...).mockImplementation(...)`, use a `function` keyword expression, not an arrow function — arrow functions cannot be called as constructors and vitest will throw at runtime.
5. **E2E tests**: Playwright (`pnpm test:e2e`), config in `playwright.config.ts`, tests in `e2e/`. Run manually for UI flow verification; not enforced in pre-commit.
6. **API route tests**: keep route-handler coverage alongside the lib tests in `src/lib/__tests__/api-*.test.ts`, importing `app/api/**/route.ts` directly and asserting status codes plus JSON payloads. Do not create a parallel `app/api/**/__tests__` pattern unless the repo adopts it broadly.
7. **Verification order**: after non-trivial changes, run the smallest relevant targeted test while iterating, then finish with `pnpm lint`, `pnpm type-check`, and `pnpm test` before commit so the husky path matches local verification.
8. **Page orchestration tests**: when changing server-page query parsing, tab/day fallbacks, or data wiring, add or update a direct page test (for example the existing trends-page style tests) so Next 16 request-prop handling and default-state rendering stay covered without requiring full E2E runs.
9. **React test placement**: direct component and page tests follow the same `src/lib/__tests__/` convention as lib tests, using `*.test.tsx` when JSX is involved (for example `data-table.test.tsx` and `trends-page.test.tsx`).

## Commit Style

Conventional commits (matching this repo's history): `type: description`. Types in use: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`. Keep the subject line under 72 characters.

## Performance (measured via Playwright browser metrics, 2026-03-27)

| Page | TTFB | FCP | Full Load | Transfer | Notes |
|------|------|-----|-----------|----------|-------|
| `/` (Overview) | 694ms | 728ms | 732ms | 18KB | GA4 + SC for 6 sites |
| `/audit` | 77ms | 108ms | 112ms | 12KB | Cached after first load |
| `/report` | 1615ms | 1656ms | 1677ms | 14KB | Slowest — SC comparison + GA4 x6 |
| `/decay` | 686ms | 720ms | 731ms | 6KB | SC page queries x2 periods x6 |
| `/trends` | 97ms | 132ms | 131ms | 10KB | SQLite reads, instant |

**Bottleneck:** `/report` and `/decay` are slow on first load due to Google API calls (SC + GA4 for all 6 sites). After caching, all pages serve in <150ms. The 30-min cache TTL balances freshness vs API load.
