# UI Components

Shared UI primitives live in `src/components/ui` and are exported from `src/components/ui/index.ts`.

Use these primitives for repeated dashboard patterns before adding local ad-hoc markup. App code can import them with the existing `@/components/ui` alias.

Current primitives:
- `Badge` — shared compact bordered status badge for operational labels, source tags, small table badges, and dashboard count chips. Supports `xs`, `sm`, `compact`, and `md` sizing, `rounded` or `pill` shape, and optional uppercase tracking.
- `ConfiguredNotice` — compact neutral status row with the green configured indicator used by config forms.
- `FilterChipGroup` — rounded-pill chip filter group with optional per-chip count badges and per-chip active styling. Clicking the active button chip deselects (single-toggle). Options may also provide `href` for URL-backed server filters. Supports `hideZeroCounts` to hide empty options.
- `FormButton` — form action button with `primary`, `secondary`, `danger`, muted low-emphasis, success-state, and transparent `ghost` variants plus `md`, `sm`, `xs`, and row-sized controls. Use `hasIcon` for spinner/icon + text actions that need inline alignment and standard spacing.
- `FormCheckbox` — shared checkbox input for config and manager forms.
- `FormInput` / `FormSelect` / `FormTextarea` — shared dark form controls for config fields and dashboard forms. Use `monospace` for keys, URLs, and other literal values. Use `tone="dense"` with `padding="compact"` or `padding="dense"` for compact controls embedded in dense manager surfaces. Use `FormTextarea padding="roomy"` when preserving larger text-area padding.
- `Notice` — bordered in-page status banner for operational messages. Supports `warning`, `info`, `neutral`, `danger`, and `success` tones plus `sm`, `md`, `panel`, `lg`, and unpadded `none` density.
- `SegmentedControl` — pill-style tab toggle for picking one value from a small set of options. Accepts an optional `renderLabel` for option content that depends on active state.
- `Skeleton` — shared neutral pulse placeholder block for loading states. Pass sizing and shape with `className`; higher-level page skeleton wrappers can compose it locally.
- `Spinner` — decorative animated SVG used inside loading buttons. Accepts a `className` override for sizing and an optional `aria-label` to surface a labelled `role="img"` when standing alone instead of beside button text.
- `Surface` — standard dashboard panel shell (`rounded-lg`, neutral border/background) for standalone card-like sections. Defaults to `p-5`; use `padding="sm"` for compact `p-4` panels and `padding="none"` when the child component owns its spacing.
- `TextButton` / `TextLink` — small text-only actions for table rows, inline clears, and other low-emphasis controls. Use `TextLink` for navigational actions that should render as Next links. Use `size="inherit"` and `variant="inherit"` when migrating an inline link that must keep its existing typography and color classes.
- `ToggleButtonGroup` — segmented multi-toggle for enabling or disabling multiple compact options. Accepts an optional `renderLabel` for active-dependent labels or indicators, plus class overrides for toggle-group controls that need non-segmented styling.
