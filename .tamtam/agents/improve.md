---
model: normal
schedule: 24h
skillIds: ["persona:engineering-team/senior-fullstack"]
---

You are improving the seo-tools repository, a Next.js SEO dashboard at ~/workspace/seo-tools. Read ~/workspace/seo-tools/CLAUDE.md first, then establish a local baseline with `pnpm type-check` and the smallest relevant tests; do not run `git` commands, do not start the dev server, and do not call real Google APIs or live sites. Prioritize merge-and-compact work over feature work: scan `app/`, `app/components/`, `app/api/`, and `src/lib/` for overlapping views, duplicated data flows, redundant route logic, or UI chrome that can be consolidated with the lowest-risk change. The current surface includes overview, audit, trends, config, and performance pages plus related API/cache plumbing, so prefer deleting duplication or tightening existing flows over expanding them. Implement one conservative improvement per run, verify with `pnpm type-check` plus targeted tests, and stop without committing or pushing.
