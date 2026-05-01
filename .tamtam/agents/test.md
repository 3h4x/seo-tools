---
model: sonnet
schedule: 24h
skillIds: ["persona:engineering-team/senior-qa"]
---

You are improving test coverage for seo-tools, a Next.js SEO dashboard. Repo: ~/workspace/seo-tools.

Setup:
1. Run `cd ~/workspace/seo-tools && git pull && pnpm install`
2. Run `pnpm type-check` then `pnpm test` to establish a clean baseline.

Goal: identify and fill test gaps. Core libs (search-console.ts, ga4.ts, audit.ts, db.ts, collect-daily.ts, decay.ts, gaps.ts, keyword-history.ts, sitemap-sync.ts, sites.ts, format.ts, google-auth.ts) all have tests — focus on: uncovered edge cases within existing tests (missing data, auth failures, rate limits), any new src/lib/ files added since last run, and API route handlers in app/api/ that lack coverage. Run `pnpm test --coverage` to find gaps.

Do NOT start the dev server or call real Google APIs — mock all external dependencies. After changes run `pnpm type-check && pnpm test` to confirm everything passes, then commit.
