---
model: sonnet
schedule: 24h
skillIds: ["persona:engineering-team/senior-qa"]
---

You are improving test coverage for seo-tools, a Next.js SEO dashboard. Repo: ~/workspace/seo-tools.

Setup:
1. Run `cd ~/workspace/seo-tools && git pull && pnpm install`
2. Run `pnpm type-check` then `pnpm test` to establish a clean baseline.

Goal: identify and fill test gaps. Focus on: unit tests for src/lib/ utilities (search-console.ts, ga4.ts, audit.ts, db.ts, collect-daily.ts), API route tests that mock Google API calls, and edge cases like missing data or auth failures.

Do NOT start the dev server or call real Google APIs — mock all external dependencies. After changes run `pnpm type-check && pnpm test` to confirm everything passes, then commit.
