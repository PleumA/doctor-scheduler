# Contributing to the Doctor Scheduler Project

Thank you for your interest in improving the Automatic On-Call & Night Shift Doctor Scheduler! 

As this project is currently maintained by two core contributors—**Arnun Polsuksiri (PleumA)** and **Antigravity** (an AI coding assistant)—we welcome contributions that keep the app performant, secure, and user-friendly.

## 🛠️ Tech Stack & Architecture

The application is built entirely on the client side:
- **Structure:** HTML5 (`index.html`)
- **Styling:** Tailwind CSS — local build (`dist/output.css`) via PostCSS pipeline; CDN fallback during development
- **Logic:** Vanilla JavaScript (`structuredInputs.js`, `translations.js`, `calendarExport.js`, `app.js`, loaded in that order)
- **Excel Exports:** SheetJS (`xlsx.full.min.js` via CDN)
- **Icons:** Lucide Icons 1.55.0 (pinned, via CDN)

For a detailed walkthrough of the Monte Carlo simulation logic and constraints, please review [How the algorithm works (Technical Logic Report)](logic_report.md) before making core changes.

## 🚀 How to Run Locally & Run Tests

### Prerequisites
- **Node.js ≥ 22** (the version CI uses) and **npm ≥ 10**. Install via [nvm](https://github.com/nvm-sh/nvm) or from [nodejs.org](https://nodejs.org).

### Setup
```bash
# 1. Clone the repository
git clone <repo-url> && cd Web

# 2. Install all dependencies (runtime + dev)
npm install
```

### Running locally
```bash
# Serve with a lightweight local server
npx serve .

# Or open index.html directly in any modern browser
```

### Building Tailwind CSS
The production CSS is compiled from `src/input.css` → `dist/output.css`:
```bash
npm run build        # one-shot minified build
npm run build:watch  # watch mode for development
```
`index.html` already links the compiled `dist/output.css` (git-ignored), so run the build before serving.

### Linting & Formatting
```bash
npm run lint      # ESLint check
npm run lint:fix  # ESLint auto-fix
npm run format    # Prettier format all files
```

### Running Tests
```bash
npm test          # Node.js built-in runner (run-tests.js) – fast, no config
```


### Checks to run before every PR
```bash
npm run lint      # must report 0 errors (CI fails otherwise)
npm test          # all suites must pass
npm run build     # Tailwind build must succeed
```
CI (`.github/workflows/ci.yml`) runs the same three.

### Rules enforced by tests
- **Real Tailwind shades only** (`tests/tailwindClasses.test.js`): a class like `bg-slate-150` compiles to nothing and silently breaks styling. Use shades 50-950 of the standard colours.
- **Both languages, no duplicates** (`tests/translationsCopy.test.js`): Thai copy has no `" / English"` duplicate, and visible text and attributes in `index.html` have no bilingual `Thai / English` strings. Always add every key to both `th` and `en` (a missing key shows blank text).
- **Escaping** (`tests/xss.test.js`, `tests/htmlInjection.test.js`): user text in `innerHTML` goes through `esc(...)`; strings in inline handlers go through `jsArg(...)`.
- **A test first for each fix**: write the failing test, then fix. The runner (`run-tests.js`) also fails a suite on `UNHANDLED` or a printed `TypeError`/`ReferenceError`, or on a timeout, so do not swallow errors in tests.

## 📝 Guidelines

### Code Quality & Standards
- Keep the application serverless. All logic should run locally on the client thread.
- Avoid introducing heavy npm packages or build configurations unless absolutely necessary.
- Follow modern JavaScript best practices (clean async loops, $O(1)$ lookups with `Set`, defensive cloning of state).
- **Shared helpers**: Reuse the top-of-`app.js` helpers (`DOC_COLORS`, `parseKV`, `expandSlots`, `dayName`, `monthName`) instead of re-inlining colour palettes, key-value parsers, or weekday/month name arrays.
- **Config passing**: Pass the parsed `config` object explicitly into render/recalculate functions; do not add hidden `parseUIConfig()` fallbacks inside them.
- **Internationalization (i18n)**: All new UI elements must support dual-language toggling via `data-i18n` attributes. Do not hardcode Thai or English text into the HTML structure. Add each key to **both** `th` and `en` in `translations.js`; aria-labels and tooltips use `data-i18n-aria` / `data-i18n-title`.
- **Date Handling**: Respect the `isCustomDateRange` global state. Avoid assuming a rigid 1-to-31 day iteration loop; instead, resolve real calendar `Date` objects using the `scheduleDates` array if custom mode is active, and always output dates in `DD/MM/YYYY` format using `formatShortDate`. Ensure that day labels in views reset at month boundaries when spanning across multiple calendar months.

### UX/UI & Mobile First
- Make sure all controls work perfectly on mobile screens (viewport width $< 768\text{px}$). Use the bottom sheet overlay (`#mobileDoctorSheet`) instead of standard dropdown menus.
- Ensure all interactive elements have touch targets of at least $48\text{px}$.

### Security
- Always pass user-inputted strings (like doctor names and role tags) through the `esc()` sanitizer when dynamically building DOM content.
- Pass strings to inline handlers only through `jsArg(value)`; otherwise use index-based handlers.
- Clean new doctor/role names with `sanitizeName`.

## 📬 Submitting Changes

1. Fork the repo and create your branch from `main`.
2. Write a failing test, then implement the change, ensuring code is documented and clean.
3. Run the three checks above and test on both desktop and mobile layouts.
4. Submit a Pull Request describing your changes clearly.
