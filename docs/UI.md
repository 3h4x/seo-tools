# UI Components

Shared UI primitives live in `src/components/ui` and are exported from `src/components/ui/index.ts`.

Use these primitives for repeated dashboard patterns before adding local ad-hoc markup. App code can import them with the existing `@/components/ui` alias.

Current primitives:
- `ConfiguredNotice` — compact neutral status row with the green configured indicator used by config forms.
- `FilterChipGroup` — rounded-pill chip filter group with optional per-chip count badges and per-chip active styling. Clicking the active chip deselects (single-toggle). Supports `hideZeroCounts` to hide empty options.
- `FormButton` — form action button with `primary`, `secondary`, `danger`, and transparent `ghost` variants plus `md`, `sm`, `xs`, and row-sized controls.
- `SegmentedControl` — pill-style tab toggle for picking one value from a small set of options. Accepts an optional `renderLabel` for option content that depends on active state.
- `TextButton` — small text-only action button for table row actions, inline clears, and other low-emphasis controls.
- `ToggleButtonGroup` — segmented multi-toggle for enabling or disabling multiple compact options. Accepts an optional `renderLabel` for active-dependent labels or indicators, plus class overrides for toggle-group controls that need non-segmented styling.
