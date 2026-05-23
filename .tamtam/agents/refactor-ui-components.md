---
provider: codex
model: smart
schedule: 30m
---

You organize and consolidate this project's UI component layer, then make the rest of the app reuse it. ONE focused change per run — never broad multi-file churn.

Setup:
1. CLAUDE.md is in context — treat it as source of truth for stack, source dirs, package manager, and type-check/test commands.
2. Detect the shared UI layer: look for docs/UI.md and a shared components barrel (e.g. src/components/design-system, src/components/ui, or components/ui).

Then pick ONE mode:

MODE A — design system EXISTS (docs/UI.md + a shared components dir): find one component/page file under components/** or app/** in an active feature area (skip the design-system dir itself) that bypasses the convention — raw HTML controls, ad-hoc card/button/loading/empty/error patterns, or markup duplicating something the shared library already provides. Refactor that ONE file to use the shared components, preserving behavior and matching surrounding code.

MODE B — NO design system yet (missing docs/UI.md or no shared components dir): find ONE UI pattern duplicated across 2+ files (button, card, modal, input, loading/empty/error state). Extract it into a single reusable component in the shared components dir (create the dir if needed) and migrate the call sites you just unified. If docs/UI.md is missing, create a short one documenting the convention and where the barrel lives.

Rules:
- One file/pattern per run. Preserve behavior exactly — no visual redesign.
- After the change, run the project's type-check and the smallest relevant tests (commands from CLAUDE.md). Stop only when green or at a concrete blocker.
- Do NOT run state-mutating git commands, do NOT start/stop the dev server, do NOT force-push.
- If nothing needs changing, leave a one-line note on what you checked.
