# Developer Guide

Quick-start guide for working on **ระบบจัดตารางเวรอัตโนมัติ** (Automatic Duty Schedule Generator).

---

## Prerequisites

| Tool | Minimum Version | Install |
|------|-----------------|---------|
| Node.js | 22 | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| npm | 10 | bundled with Node |
| Git | any | [git-scm.com](https://git-scm.com) |

---

## Setup

```bash
git clone <repo-url>
cd Web
npm install        # installs runtime + all devDependencies
```

---

## Development Workflow

### 1. Serve locally

```bash
npx serve .
# → http://localhost:3000
```

Open `index.html` directly in a browser as a zero-config alternative.

### 2. Edit & watch Tailwind

```bash
npm run build:watch
# Watches src/input.css → rebuilds dist/output.css on every save
```

`index.html` links `dist/output.css`, so build once before serving. Only classes that exist in Tailwind's default palette work (guarded by `tests/tailwindClasses.test.js`).

### 3. Run tests

```bash
npm test           # built-in runner (run-tests.js) — runs all 43 tests/*.test.js suites
```

### 4. Lint & format

```bash
npm run lint       # ESLint — check for errors
npm run lint:fix   # ESLint — auto-fix safe issues
npm run format     # Prettier — reformat all files
```

### 5. Build for production

```bash
npm run build      # generates dist/output.css (minified)
```

---

## Project Structure

```
Web/
├── index.html          # Single-page app entry point
├── app.js              # Core scheduler logic & UI handlers (~5 400 lines)
├── structuredInputs.js # Structured input components (tag chips, steppers, …), jsArg
├── translations.js     # i18n dictionaries (Thai / English), esc, sanitizeName
├── calendarExport.js   # .ics builder + duty-event collection
├── sw.js               # Service Worker (PWA offline support)
├── manifest.json       # PWA manifest
│
├── src/
│   └── input.css       # Tailwind CSS entry point (@tailwind directives)
├── dist/
│   └── output.css      # ⬅ Generated — do not edit manually
│
├── tests/              # Test suites (*.test.js, run via `npm test`) + domHarness.js helper
│
├── tailwind.config.js  # Tailwind config (darkMode: class, custom colours)
├── postcss.config.js   # PostCSS config (tailwindcss + autoprefixer)
├── .eslintrc.cjs       # ESLint config
├── .prettierrc         # Prettier config
│
├── .github/
│   └── workflows/
│       └── ci.yml      # GitHub Actions: lint → test → build
│
├── DESIGN_SYSTEM.md    # Component classes & design tokens
├── CHANGELOG.md        # Keep-a-Changelog format
├── CONTRIBUTING.md     # Contribution guidelines
├── logic_report.md     # Solver and state deep-dive
└── run-tests.js        # Test runner
```

---

## Key Architectural Rules

1. **Serverless** — All logic runs client-side. No backend, no database.
2. **i18n** — Every UI string uses `data-i18n` (text), `data-i18n-aria` or `data-i18n-title` attributes and a key in `translations.js`. Never hardcode Thai or English text in HTML.
3. **Sanitisation** — Pass user inputs through `esc()` before inserting into the DOM, and strings in inline handlers through `jsArg()`.
4. **Date handling** — Use the `scheduleDates` array, not raw day numbers. Output via `formatShortDate()` → `DD/MM/YYYY`; day/month labels come from the shared `dayName()` / `monthName()` locale helpers.
5. **Dark mode** — Implemented via Tailwind's `darkMode: 'class'`; toggled by `toggleDarkMode()`.
6. **Accessibility** — All icon-only buttons need `aria-label`; all decorative icons get `aria-hidden="true"`.
7. **Config object** — Functions that render or recalculate take the parsed `config` explicitly (from `parseUIConfig()`); they never re-parse the DOM behind the caller's back.

8. **Result snapshot** — The displayed schedule is a self-contained snapshot: `globalResult` holds the config, doctors, dates, month/year it was built with. Anything that renders, exports or edits the displayed result reads it through `resultCtx()` (or `resultConfig()`), never from live inputs, which may have changed since.
9. **Commit-only state** — State tied to a period or doctor list changes only when a solver run commits its result (`runScheduleOnce`): clearing overrides on a period change, adopting `pendingOverrides` from an import, and pruning overrides of removed doctors (`pruneOverrides`). A failed or aborted run leaves the old state intact.

---

## Architecture Notes

### Script load order
`index.html` loads, all `defer`: `structuredInputs.js`, `translations.js`, `calendarExport.js`, `app.js`. Scripts share globals, so `app.js` may use everything from the earlier ones (`esc` and `sanitizeName` are in `translations.js`; `jsArg` is in `structuredInputs.js`, resolved at call time).

### Regenerate queue
`window.generateSchedule()` runs `runScheduleOnce()` in a loop. A call made while a run is in progress sets `regenPending` and returns the running promise; the loop re-runs once with the latest inputs. Do not start a second solver run yourself.

### Undo and overrides
`manualOverrides` is `{day: {slot: name}}`. `pushToUndoStack()` snapshots it (max 20); `undoLastAction()` pops, prunes removed doctors, and `applyManualOverrides()` rebuilds every row from `globalResult.originalSchedule` plus the overrides, so a removed override reverts to the solver's pick. Reset-all (`clearManualOverrides`) does the same locally, with no solver run. Removing a doctor is not undoable.

### Import sanitising and rollback
`importConfigJSON` parses the file, runs `sanitizeConfig(raw)` (shape check, value coercion, `sanitizeName`, id renumbering) and returns `{ok, error}` or `{ok, config}`. It snapshots `getCurrentConfig()` first; if `applyConfig(config)` throws, it re-applies the snapshot and restores `pendingOverrides`. Imported overrides sit in `pendingOverrides` until the next solver run commits.

### Service worker (`sw.js`)
Install pre-caches the local files and pinned CDN files (`Promise.allSettled`, so one failed request does not abort). Same-origin GETs are **network-first** (`cache: 'no-cache'`), falling back to the cache; CDN files are cache-first. Only `http(s)` GETs are handled. On activate, caches starting with `doctor-scheduler-` other than `CACHE_NAME` are deleted. **Bump `CACHE_NAME` and the precache list whenever you add or rename a shipped file.**

### Tests
Each `tests/*.test.js` is a standalone Node script. Older suites mock `document` and eval `app.js`; newer ones boot the real `index.html` plus the four scripts in jsdom via `tests/domHarness.js` (`loadApp()`), which is not itself a test. `run-tests.js` runs every suite in a child process and fails it on a non-zero exit, a `FAILED` line, `UNHANDLED`, a line-start `TypeError`/`ReferenceError`, or a timeout (180 s, override with `TEST_TIMEOUT_MS`). Any suite that evals app code must also load `calendarExport.js`.

### Adding a translation key
1. Add `key: '…'` to **both** the `th` and `en` objects in `translations.js`.
2. Use it with `data-i18n="key"` (text), `data-i18n-aria="key"` or `data-i18n-title="key"` in HTML, or `translations[currentLang].key` in JS.
3. Keep Thai copy free of `" / English"` duplicates (`tests/translationsCopy.test.js` fails otherwise); one language per string.

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically on every push and PR:

1. `npm ci` — clean install
2. `npm run lint` — ESLint check (fails on error)
3. `npm test` — full test suite (fails on any failing test)
4. `npm run build` — Tailwind CSS build (fails if config is broken)

---

## Releasing

```bash
git tag -a v1.7.0 -m "chore: SEO, Tailwind refactor, accessibility, CI"
git push origin v1.7.0
```

Update `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) before tagging.
