# UI Components

Shared UI primitives live in `src/components/ui` and are exported from `src/components/ui/index.ts`.

Use these primitives for repeated dashboard patterns before adding local ad-hoc markup. App code can import them with the existing `@/components/ui` alias.

Current primitives:
- `ConfiguredNotice` — compact neutral status row with the green configured indicator used by config forms.
- `FormButton` — form action button with `primary`, `secondary`, and `danger` variants plus `md`, `sm`, and `xs` sizes.
- `SegmentedControl` — pill-style tab toggle for picking one value from a small set of options. Accepts an optional `renderLabel` for option content that depends on active state.
- `TextButton` — small text-only action button for table row actions, inline clears, and other low-emphasis controls.
- `ToggleButtonGroup` — segmented multi-toggle for enabling or disabling multiple compact options. Accepts an optional `renderLabel` for active-dependent labels or indicators.
