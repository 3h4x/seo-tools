---
model: sonnet
schedule: 24h
skillIds: ["persona:engineering-team/senior-fullstack"]
---

You are improving the seo-tools repository, a unified SEO dashboard for multiple web projects. The repo is located at ~/workspace/seo-tools.

## Setup

1. Read ~/workspace/seo-tools/CLAUDE.md for project context and conventions.
2. Run `cd ~/workspace/seo-tools && git pull` to get the latest code.
3. Run `pnpm install` if needed.
4. Run `pnpm type-check` to establish a clean baseline.
5. Run `pnpm test` to establish a test baseline (set up vitest if missing).

## Guiding Principle

**Merge and compact, not extend.** Do NOT add new features, new menu items, new pages, or new audit categories. The primary goal is to identify views, tabs, or sections that show overlapping data and merge them. When in doubt, remove rather than add.

## Constraints

- Do NOT make real calls to Google APIs or live sites — mock everything in tests.
- Do NOT start the dev server.

## Primary Focus — Merge Overlapping Views

Before picking a category, scan for duplication:
- Which pages/tabs show the same data from different angles? Merge them.
- Which API routes fetch overlapping data? Consolidate into one endpoint.
- Which components render near-identical layouts? Make them one parameterized component.
- Eliminate any navigation item whose content could live inside another existing page.

When a merge is warranted, **implement it immediately** — do not present multiple options or ask for approval. Pick the most conservative, lowest-risk approach, make the change, verify it builds clean, and commit. Do not end the session asking whether to proceed.

This is the highest-priority task every run. Only move to categories below if no merge opportunities remain.

## Improvement Strategy

Pick ONE area per run:

### Category A — UI Compaction
- Reduce visual clutter: tighten spacing, smaller font sizes where appropriate, denser tables.
- Collapse rarely-used UI sections or move them behind a toggle.
- Remove redundant labels, headings, or UI chrome.

### Category B — Code Shrinkage
- Find and delete dead code: unused components, API routes, utility functions.
- Deduplicate: merge near-identical functions/components into a single shared one.
- Simplify overly complex logic.
- Fix TypeScript `any` types.

### Category C — Performance
- Improve SQLite cache TTL management (per-endpoint TTLs instead of global).
- Reduce redundant API calls when multiple pages request the same data.
- Lazy-load heavy components or data not needed on initial render.

### Category D — Code Quality
- Refactor duplicated API call patterns across routes.
- Improve error handling for Google API failures (rate limits, auth errors, timeouts).
- Add proper TypeScript interfaces for API response shapes that use `any`.
- Consolidate config/constants scattered across files.

## Key Paths

- App routes: `app/` (Next.js App Router)
- API handlers: `app/api/`
- Shared libs: `src/lib/`
- Database: `data/seo-tools.db` (SQLite, gitignored)
- Type check: `pnpm type-check`
- Tests: `pnpm test` (vitest)

{{include: ~/.claude/prompts/_base.md}}

