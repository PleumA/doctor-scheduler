# Design System — ใบเวร / The Duty Sheet

The interface is modelled on the document the app produces: a printed, authoritative
ward roster. Ink masthead, ruled sheets, the schedule grid as the hero. One interactive
accent (duty teal); red is semantic only (weekend/holiday edge, shortage, reset).

Tokens live in `tailwind.config.js`; component classes live in `src/input.css`
(compiled to `dist/output.css` with `npm run build`).

---

## Colour Palette

| Token | Value | Usage |
|-------|-------|-------|
| `ink` | `#14252C` | Masthead, headings, primary text, solid buttons |
| `ink-2` | `#3C525B` | Secondary text, labels, hints |
| `paper` | `#F2F5F4` | Page background, nested form panels |
| `sheet` | `#FFFFFF` | Panels (light mode) |
| `rule` | `#D9E1DE` | Dividers, panel and table borders |
| `duty` | `#0F766E` | The single interactive accent (links, focus, active tab) |
| `duty-bright` | `#2DD4BF` | Duty accent on dark surfaces |
| `signal` | `#B42318` | Weekend/holiday edge, shortages, destructive actions |
| `signal-bright` | `#F87171` | Signal on dark surfaces |

Dark mode surfaces: page `#0C171C` (`night`), panels `#112229` (`sheet-dark`),
rules `#233A42` (`rule-dark`). Text uses `slate-100` / `slate-300` / `slate-400`.

**Rules**
- Red is never decorative. It marks weekends/holidays (left edge + 5% tint) and shortages.
- Doctor identity is a 4px left spine on a neutral chip, not a coloured fill.
- Do not introduce another accent for a single section. Role names and section icons are neutral.

---

## Typography

- **Font**: [Anuphan](https://fonts.google.com/specimen/Anuphan) — loopless Thai + Latin,
  400 / 500 / 600 / 700. Loaded from Google Fonts (also precached by `sw.js`).
- Body inherits `font-variant-numeric: tabular-nums` so dates, counts and totals align.
- Scale used: `11px` (meta), `12px` (labels/table meta), `13px` (body/UI),
  `14px` (section titles), `17–20px` (page title), `22–24px` (coverage figures).
- Weights: 400 body, 500 controls/labels, 600 section titles and figures, 700 reserved.
- No all-caps labels, no letter-spacing tricks: Thai has no case and tracked labels
  make English look heavy next to it.

---

## Layout

- Masthead: solid ink bar, `md:sticky`, wordmark + square mark on the left,
  ghost utility buttons and one white primary CTA on the right.
- Desktop (`lg`): 340px settings column + fluid results column, each scrolling
  independently (`h-[calc(100vh-112px)]`). Results stick at `top-[88px]`.
- Phones: settings lives in the native popover drawer; schedule rows become cards
  (see the `<style>` block in `index.html`).
- Alignment: left for text and titles; numeric table columns centre or right as fits.
- Radii: 4px panels/controls (`rounded-[3px]` in tables and nested rows). Shadows only
  on overlays (drawer, dropdown, modal, toast).

---

## Component Classes (`src/input.css`)

### `.sheet`
The only surface: white/dark panel, 1px rule, 4px radius, no shadow.

```html
<div class="sheet overflow-hidden">…</div>
```

### `.sheet-head` / `.sheet-title`
Ruled section header (used as `<div>` for static cards and `<summary>` for collapsible ones).

```html
<div class="sheet-head">
  <h2 class="sheet-title"><i data-lucide="settings" class="w-4 h-4 text-ink-2"></i> Title</h2>
  <!-- header controls -->
</div>
```

### `.field-label`
11px medium ink-2 label above a control.

### `.hint`
11px secondary helper text under a control.

### `.doc-chip`
Neutral tag with a 4px colour spine. Doctor colours (spine only) live in `DOC_COLORS`
in `app.js`; `DOC_COLOR(name)` returns the chip plus its spine.

```html
<span class="doc-chip border-l-teal-600 dark:border-l-teal-400">Name</span>
```

### `.weekend-edge`
Inset 3px `signal` left edge, applied to the date cell of weekend/holiday rows.

### `.reveal`
The single orchestrated motion: a 240ms fade/6px rise when a schedule is generated.
Disabled by the global `prefers-reduced-motion` rule.

---

## Coverage band

The three figures (`#statTotalDuties`, `#statShortages`, `#statAvgDuties`) sit in one
`.sheet` divided by rules — not three icon cards. Values are 22–24px semibold with a
12px unit span. A shortage tints its column with `signal` at 5% and turns the number red.

## Schedule views

- **Table**: sticky ruled header; date cell semibold; weekend rows get `.weekend-edge`
  plus a 5% signal tint; doctor cells are `.doc-chip`; drag cursor is retained.
- **Calendar**: ruled day cells, weekday headers neutral, Sunday/Saturday `signal`.
- **Person**: single-accent duty markers (`duty` at 10%), rule borders between days.
- **Fairness row**: one `.doc-chip` per doctor; doctors furthest from the mean get
  `ring-1 ring-signal/60`; spread shown right-aligned.

## Print

Print is a first-class view: `#printHeader` (title + period) is `hidden print:block`,
navigation/toolbars/fairness row are hidden, and the table is forced back to a real
table layout at full width on white.

---

## Accessibility

- Visible `:focus-visible` outline (2px duty teal, 2px offset).
- Colour is never the only signal: weekend rows also carry the date-cell edge; labels
  are translated text; shares/roles are written out.
- Text colours meet AA on their surfaces (`ink`, `ink-2`, `duty`, `signal` on white/paper).
- Every icon-only button keeps an `aria-label`; decorative icons are `aria-hidden`.

---

## Iconography & app icon

[Lucide Icons](https://lucide.dev) via CDN, pinned (`unpkg.com/lucide@1.55.0`).
Dynamic render loops use inline `<svg>`. The app icon (favicon, apple-touch-icon,
`manifest.json`) is an ink square with a teal spine, three white roster rules and a
red weekend edge — the same mark used in the masthead.

## Dark mode

`darkMode: 'class'` — toggled by adding `class="dark"` to `<html>`. Every light surface
needs its dark counterpart (`dark:bg-sheet-dark`, `dark:border-rule-dark`,
`dark:text-slate-*`). Only real Tailwind shades are allowed; `tests/tailwindClasses.test.js`
guards against nonexistent classes that compile to nothing.
