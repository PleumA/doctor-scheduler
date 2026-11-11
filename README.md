# PleumA.github.io
## Automatic On-Call & Night Shift Doctor Scheduler

> **This website was developed by Vibe Code using Antigravity model Gemini 3.1 Pro, combined with Claude Sonnet 4.6 (Thinking) for allocating night-shift doctor duties.**

📖 **[How the algorithm works (Technical Logic Report)](logic_report.md)** — A detailed, deep-dive technical reference on the seeded greedy solver, constraint cascades, scoring metrics, and system architecture. Essential reading for anyone auditing or extending this medical scheduling tool.

📖 **[Link to web](https://pleuma.github.io/doctor-scheduler/)**

## 🌟 Core Features

### 1. Smart Solver (Seeded Greedy Search)
- Runs one baseline greedy pass plus **300 seeded candidate schedules**, scores each, and keeps the best.
- **Deterministic**: the random generator (mulberry32) is seeded from the inputs, so identical inputs always give an identical roster.
- Scores evaluate:
  - **Shortages**: Penalizes unassigned slots.
  - **Workload Balance**: Minimizes the Standard Deviation of weekday and holiday duties (can be toggled on/off).
  - **Gaps**: Penalizes shifts with only a 1-day rest period in between to prevent fatigue.
  - **Relaxations**: Every rule the Must-Fill cascade had to relax is recorded and penalized (conflict 50000, day-before-off 5000, spacing 1000, special doctor 1000).
- **Remaining-availability cache**: roughly 3x faster on 90-day ranges with quotas.

### 2. Constraints & Rules Engine
- **Role-Based Calculation (Toggleable)**: When **ON**, maps doctors to roles (e.g., `A:R1, B:R2`) and calculates duty separately for each role pool. When **OFF**, treats all doctors as a single pool.
  - **Dynamic Role Header Promotion**: When Role-Based Mode is enabled, the assigned role label is moved up to the column header (e.g. Duty 1 (R1) or a sub-header `R1`), leaving individual cell doctor chips completely free of role suffixes. Suffixes are also moved to headers in exported Excel spreadsheets and copied clipboard data.
  - **Dynamic Role Badges (Person-Centric View)**: In the Person-Centric grid, doctor names in the left-hand column are decorated with color-coded, dynamic role badges mapping to their roles.
- **Exact Shift Quotas (Unified Quota System)**: Enforces exact shift quotas per role when Role-Based mode is ON (e.g., `R1:12, R2:10`), or per doctor when Role-Based mode is OFF (e.g., `A:5, B:4`).
  - **Pre-Flight Check**: Aborts computation if the sum of all active doctor quotas does not perfectly match the total available slots for the schedule range (unless **Allow Blank Days** is toggled ON).
  - **Strict Quota Enforcement**: Doctors (or roles) who have reached their exact quota are immediately removed from the available pool for all subsequent shifts.
  - **Graceful Dead-end Fallback**: If a slot cannot be filled due to quota lockouts, the system outputs `ขาดคน` (Missing) without crashing and displays a warning toast.
- **Dynamic Doctors per Day**: Allows defining a global default slot count (clamped 1-10) or custom slot numbers for specific days (a per-day number is capped at 50; custom-range days match by `YYYY-MM-DD`, `DD/MM/YYYY` or a day number). Seamlessly collapses role-specific slot configurations into general pool slots when Role-Based Mode is toggled off.
- **Custom Date Ranges**: Easily pivot from generating rigid month-based schedules to arbitrary custom date ranges (e.g. Mid-month to mid-month, or quarterly schedules up to 90 days), with the core solver array seamlessly expanding or contracting. Day labels in Calendar and Person views automatically reset at month boundaries for chronological clarity instead of continuous index increments.
- **Night Floor (Minimum shifts per doctor)**: `#inputMinNightShifts` (default 14, `0` disables, clamped 0-60) guarantees every doctor at least that many shifts. Applies to standard, role-based and shift-night (non-role) rosters; role + shift and quota modes use the legacy solver and show a warning toast.
  - **Allow an extra doctor on a night** (`#chkAllowExtraNightDoctor`, default on): adds at most one extra doctor per night, only on as many nights as needed, spread across the month and allocated by role need. A plan note above the results reads `N slots + M extras = total shifts -> X each`.
  - **Exact feasibility refusals**: the run is refused with the arithmetic when the calendar cannot supply the floor (e.g. 70 required / 60 available), or on per-doctor capacity or role-need shortfalls.
  - **Rest is never relaxed in floor mode**: if a slot cannot be filled without breaking the rest rule, the run is refused and names the days. Shift-night floor ranking is by slot kind, so day slots keep below-floor doctors free for nights.
  - With floor `0` the legacy cascade (below) applies; its relaxations are listed per day in the warnings panel (`#relaxationPanel`) and the success toast shows the warning count.
- **Off Duty Period (0-based)**: `0` = no gap, `1` = one day off after a duty (UI range 0-6, default 1). Exports carry `configVersion: 2`; older configs are migrated by subtracting one on import.
- **Cross-Period Carry-Over**: the next contiguous period inherits each doctor's last duties (rest, night-to-morning, holiday spacing on day 1), rebuilt from the live schedule including manual edits. Ignored if the periods are not contiguous or the doctor set changed.
- **Allow Blank Days (Toggleable)**: When **ON**, allows unassigned slots (`ขาดคน`) if no eligible doctor is available due to constraints. When **OFF** (default), a 5-level **Must-Fill cascade** progressively relaxes spacing, conflict, and off-request rules to force-fill the slot.
- **Strict Deduplication**: Enforces a strict uniqueness check to ensure the exact same doctor cannot be scheduled for multiple slots on the same day, even during forced Must-Fill cascades.
- **Conflict / Hate List**: Excludes incompatible doctors (e.g., `A:B` or `A conflicts with B`) from working the same shift.
- **Off Requests**: Enforces days off; no shifts are allocated on requested off days or on the day prior to an off day.
- **Holiday Spacing**: Prevents doctors from working consecutive weekend/holiday shifts.
- **Queue Locking**: Supports locking a specific group of doctors to cover special slots in two modes:
  - **First N Days (default)**: Locks the group to a contiguous day range. A configurable *Start Day* allows partial-month windows (e.g. days 7 – 14) — not just "from day 1". Locked doctors are exempt from off-duty period constraints so they work every day in the range without gaps.
  - **Every [Weekday]**: Locks the group onto every occurrence of a chosen weekday (e.g. every Sunday) within the schedule range, correctly spanning custom multi-month ranges. A warning toast is displayed if no matching weekdays exist.
- **Shift-Based Mode (Morning, Afternoon, Night)**: Organizes the daily schedule into three distinct, consecutive shifts with adjustable slot counts (Morning: 08:00 - 16:00, Afternoon: 16:00 - 24:00, and Night: 24:00 - 08:00).
  - **Night-to-Morning Spacing Safeguard**: Strictly prevents a doctor assigned to any Night shift slot on Day $d-1$ from working a Morning shift slot on Day $d$.
  - **Off Requests (Off Period) Integration**: If a doctor has Day $d$ off, they are blocked from all slots on Day $d$, and blocked from **Night shift slots only** on Day $d-1$ (permitting Morning and Afternoon shifts on the day before requested off).
  - **Shift Alternation & Rotation**: Employs a shift type variance penalty to ensure that doctors rotate and alternate shifts fairly rather than getting stuck on a single type.
  - **Concurrency & Role-Based Compatibility**: Shift-Based Mode and Role-Based Mode can run concurrently, mapping role requirements onto the shifts.
  - **Detailed Individual Summary Table**: Displays Morning (M), Afternoon (A), and Night (N) counts for each doctor under Shift-Based Mode. Supported in exports and copy commands.
  - **No Numbers in Table**: Shift slot suffix numbers (e.g. `1`, `2`) are removed from headers and badges to keep layout cells clean.

### 3. Interactive UI & Customization
- **Structured Interactive Inputs**: All configuration settings (Doctor Roles, Quotas, Conflict Lists, Holidays, Off Requests) use intuitive structured components (steppers, dropdowns, and chips) to eliminate formatting errors, syncing seamlessly to the internal scheduling engine.
- **Table, Calendar, & Person Views**: View duties in a clean date-list format, an interactive month calendar, or a pivoted person-centric grid.
- **Validated Manual Edits**: Every manual edit (dropdown, drag/drop, person view, mobile sheet, reset-to-auto) is checked before anything changes: duplicate, conflict, role, off request, rest, holiday, night-to-morning, quota and floor. A rejection shows a translated (Thai/English) toast naming the rule. Overrides are re-validated on regenerate, import and undo; invalid ones are dropped with one toast.
- **Manual Overrides & Drag-and-Drop**: Easily correct schedules manually. You can **drag and drop** a doctor's name from one slot to another in the calendar for 2-way swaps; the final state of the whole swap is validated.
- **Duty-Sheet Design**: Anuphan font, ink masthead, paper/sheet surfaces, a 4px colour spine per doctor chip, a red edge on weekends/holidays, a coverage band (total / shortages / average), a print header with title and period, and an app icon. Toasts and the warnings panel are `aria-live`.
- **Undo / History Stack**: Safely navigate manual corrections. The app tracks a 20-step stack of manual edits; press `Ctrl+Z` or the **Undo** button (shown once there is something to undo) to revert cell edits and Reset-all. Undo rebuilds the schedule from the solver's original picks, so it never needs a new solver run. Removing a doctor is not undoable.
- **Workbench Layout & Settings Panel**: On wide screens (>= 1024px) settings sit in their own independently scrolling column beside the schedule; "Doctors per day" and "Advanced rules" are collapsible. Below 1024px the settings open in a native `popover` panel from the header button. On phones each schedule row becomes a card and the header scrolls away instead of sticking.
- **Fairness Row**: A strip of per-doctor totals with a red ring on the doctor(s) furthest from the mean and the min-max spread. The per-doctor details table below it is collapsible and starts open.
- **Calendar Export (Apple / Google)**: Download an `.ics` file (RFC 5545) or open Google Calendar for **everyone**, a **role group**, or **one person** (pick the scope next to the buttons).
- **Print Stylesheet & In-App Manual**: A print stylesheet hides the controls; a 9-section manual (header button) explains setup, editing, save/load and offline use.
- **Targeted DOM Updates & Real-Time Sync**: The core rendering engine is optimized so that manual cell updates do not repaint the surrounding grid. The global Stats Dashboard and Individual Duty Summary table update automatically and immediately in real time, keeping the interface responsive and metrics instantly accurate.
- **Real-Time Recalculation**: Schedule configurations (e.g., month, year, doctors per day, constraints) immediately trigger the smart solver to re-calculate the ideal schedule without needing manual confirmations. Recalculation automatically fires when both custom range dates are filled or changed.
- **Save/Load Configuration**: Export all application settings, quotas, constraints, and **manual cell overrides** into a `.json` backup file, and instantly import them later to restore your precise environment without re-typing.
- **Excel Export**: Quick copy or `.xlsx` download support (via SheetJS).
- **Clipping-Free Sidebar Dropdowns**: Removed container overflow boundaries on the Off Requests list, allowing dropdown menus to render cleanly on top of other sidebar panels rather than clipping.
- **Localization & Theme**: Supports dynamic switching between Thai (TH) and English (EN) languages, along with a sleek system-synced Dark Mode. Automatically detects browser/system language and system dark mode preferences on initial load, while strictly preserving manual user overrides via `localStorage`.

### 4. Installable PWA & Offline Support
- **Offline Capability**: A service worker (`sw.js`) and a web app manifest (`manifest.json`) cache the app files, the locally compiled stylesheet (`dist/output.css`), fonts, and the version-pinned third-party libraries (SheetJS, Lucide 1.55.0) for offline use in hospital wards with spotty Wi-Fi. The app's own files are fetched **network-first** (a new deploy shows on the next load; offline falls back to the cache); CDN files are cache-first.
- **Installable App**: Fully compliant standard web app configurations allow installing the scheduler directly onto mobile and desktop home screens.

---

## 🚀 Quick Start

```bash
git clone https://github.com/PleumA/doctor-scheduler
cd PleumA.github.io
npm install          # install all dependencies
npm run build        # compile Tailwind CSS → dist/output.css
npm test             # run all 52 test suites (Playwright e2e runs last; needs system Chrome)
npm run lint         # ESLint + Prettier check (0 errors expected)
npx serve .          # serve locally at http://localhost:3000
```

The last suite (`tests/playwrightE2e.test.js`) drives a real browser through `playwright-core` and uses system Chrome at `/usr/bin/google-chrome`, or the path in `CHROME_PATH`.

For a full contributor setup guide, see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

---

## 📱 Mobile Performance Optimizations

Designed with mobile first-class support in mind to ensure zero stutters on phone browsers:
1. **Config Parser Extraction (`parseUIConfig`)**: All DOM elements, rules, arrays, and quotas are compiled exactly once into a static state block (`parseUIConfig`) before the calculation runs. This prevents thousands of slow, redundant DOM lookups and key array allocations from occurring inside the solver's hot inner loop or rendering loops.
2. **Native SVG Rendering**: Inside dynamic loops like `renderTableView` and `renderCalendarView`, standard inline `<svg>` strings are utilized. This eliminates reliance on automatic DOM-scanning icon libraries (e.g., Lucide) which are notorious for causing layout thrashing and application freezing during table updates.
3. **Deferred Stats Dashboard Recalculation**: Changing a doctor assignment bypasses global array counting overheads until the user is finished editing and actively requests a UI state sync.
4. **$O(1)$ Lookups**: Utilizes JavaScript `Set` structures for conflict checking, holiday checking, and off-day requests instead of traversing nested arrays, improving search execution speeds.
5. **Main Thread Yielding**: The solver operates asynchronously in batches. It yields control back to the browser event loop (`setTimeout(..., 0)`) sequentially after chunks of iteration logic, maintaining a fluid 60FPS UI and allowing loaders to spin.
6. **Input Guards**: Default slots are clamped to 1-10 and per-day slot numbers to 50, so typos cannot create endless loops. Negative or NaN counts never throw, impossible dates (e.g. 31/02) and start > end are rejected.
7. **Touch-Scrolling**: Containers support horizontal swiping with `-webkit-overflow-scrolling: touch` and minimum viewport widths to prevent layout squishing on mobile portrait screens.
8. **Deterministic & Stable Sorting**: The doctor sorting algorithm assigns a pre-calculated noise value (from the seeded generator) to each doctor at the start of a sort operation. This ensures transitive and deterministic sort comparisons (avoiding unstable inline `Math.random()` tie-breakers in the `.sort()` callback), which prevents infinite loops or crashes in modern browser sorting engines.
9. **Touch-Optimized Bottom Sheet (Viewport `< 768px`)**: Replaces cramped inline absolute cell dropdowns on mobile screens with a full-screen blurred Bottom Sheet. Doctor selection elements inside are scaled to a minimum of 48px height with generous touch padding for error-free mobile interaction.
10. **Mobile-First Responsive Calendar**: The 7-column Calendar View dynamically collapses into a highly readable, vertical daily-scroll list layout on narrow mobile viewports, entirely eliminating horizontal overflow zooming.

---

## 🛡️ Robustness & Web Standards

Built for high reliability, clean execution, and security:
1. **Escaping & XSS Sanitization**: Doctor and role names and imported text are treated as user input; every `innerHTML` insertion (schedule cells, calendar grid, stats, fairness row, `title` attributes) goes through `esc(...)`, or the value is bound via `textContent`.
2. **Robust Event Handlers (No String Eval)**: Inline handlers either take stable doctor indices (integers) or pass strings through `jsArg(...)` (a JSON literal, HTML-escaped), so names containing quotes or apostrophes (e.g., O'Connor) cannot break out of the attribute.
3. **Modern Clipboard Integration**: Replaced deprecated `document.execCommand` methods with the modern, asynchronous `navigator.clipboard.writeText` API, assuring future-proof support and clean error handling via toasts.
4. **Config Import Validation & Rollback**: `sanitizeConfig` checks the shape of an imported JSON file, coerces values and cleans names (`sanitizeName`) before anything is applied. If applying still fails, the app is restored from a `getCurrentConfig()` snapshot, so a bad file never leaves a half-imported state.
5. **Circular Dependency Prevention**: Decoupled dynamic list rendering from global DOM translation sweeps (`applyTranslations()`), resolving potential browser-freezing infinite recursion loops.

---

## 📂 Architecture

| File | Purpose |
|------|---------|
| `index.html` | Single-page app shell — layout, Tailwind classes, modals, PWA manifest link, service worker registration |
| `app.js` | Scheduling state, seeded greedy solver, UI handlers, calendar-export UI, focus-trap utility (~6 100 lines) |
| `structuredInputs.js` | Dynamic structured components — chips, dropdowns, steppers |
| `translations.js` | Dual-language (Thai / English) dictionaries plus shared helpers (`esc`, `sanitizeName`) |
| `calendarExport.js` | `.ics` builder and duty-event collection for calendar export |
| `sw.js` | Service worker — network-first for app files, cache-first for pinned CDN files |
| `manifest.json` | PWA manifest — install config, theme colour |
| `src/input.css` | Tailwind CSS entry point (`@tailwind` directives) |
| `dist/output.css` | **Generated** — compiled & minified Tailwind CSS (run `npm run build`); committed because GitHub Pages serves it |
| `tailwind.config.js` | Tailwind config: `darkMode: 'class'`, extended colours |
| `postcss.config.js` | PostCSS pipeline: tailwindcss + autoprefixer |
| `.eslintrc.cjs` | ESLint rules (eslint:recommended + prettier); `npm run lint` must pass |
| `.prettierrc` | Prettier formatting config |
| `.github/workflows/ci.yml` | GitHub Actions CI: lint → test → build |
| `sitemap.xml` | Single-page sitemap for SEO |
| `robots.txt` | Crawler permission file |
| `tests/*.test.js` | **52 test suites** covering solver logic, night floor, carry-over, override validation, relaxation report, toast a11y, UI DOM (jsdom, via `tests/domHarness.js`), quotas, XSS, import rollback, undo/overrides, calendar export, service worker, and guard tests for Tailwind classes and translation copy. `tests/playwrightE2e.test.js` (real Chrome via `playwright-core`) runs last. Run with `npm test`. |
| `run-tests.js` | Built-in test runner — no Jest required; runs the e2e suite last; fails on `UNHANDLED`/`TypeError` output and on timeouts |
| `DESIGN_SYSTEM.md` | Reusable component classes and colour tokens |
| `DEVELOPER_GUIDE.md` | Full contributor setup, build, lint, test, and release guide |
| `CONTRIBUTING.md` | Contribution guidelines |
| `CHANGELOG.md` | Version history (Keep a Changelog format) |
| `logic_report.md` | Deep-dive technical reference on the solver |
| `docs/superpowers/specs/2026-11-10-scheduler-logic-design.md` | Solver design spec (night floor, relaxations, carry-over) |
| `docs/superpowers/plans/2026-11-10-scheduler-logic-remaining.md` | Implementation plan for the remaining solver work |
| `input/bibliography/literaturguide.md` | Literature guide (30 sources) |
| `output/bibtex/references.bib` | BibTeX for the literature guide |
| `input/`, `output/`, `knowledge/` | Research workspace folders (bibliography, BibTeX output, wiki metadata); `input/library/` is git-ignored |
