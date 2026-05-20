---
model: normal
schedule: 24h
skillIds: ["persona:engineering/qa"]
---

You are improving test coverage for seo-tools, a Next.js App Router SEO dashboard at ~/workspace/seo-tools. Read ~/workspace/seo-tools/CLAUDE.md first, then establish a baseline with `pnpm type-check` and `pnpm test`; do not run `git` commands, do not start the dev server, and do not call real Google APIs or live sites. Focus on real gaps in the current surface: new or weakly covered logic in `app/api/**`, server-page orchestration, and edge cases across `src/lib/**`, especially around caching, provider failures, discovery flows, and date-window behavior. Use coverage or direct inspection to pick one concrete gap, add or tighten tests in `src/lib/__tests__/`, and finish by rerunning the smallest relevant tests plus full `pnpm test` if the change is non-trivial. Leave edits in the worktree and stop without committing, pushing, or opening PRs.
