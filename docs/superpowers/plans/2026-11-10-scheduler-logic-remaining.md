# Remaining Scheduler Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining correctness gaps in the v1 solver — relaxation telemetry and scoring, cross-period carry-over, custom-range slot keys, override hard-rule validation, input validation, and the sort-comparator availability cost — without changing the visual design.

**Architecture:** Incremental changes to `parseUIConfig`, `generateSingleScheduleCandidate`, `runScheduleOnce`, `scoreSchedule` and `updateDoctorAssignment`, each pinned by a jsdom test. No new runtime dependencies; the app stays an offline PWA.

**Tech Stack:** Vanilla JavaScript, jsdom (`tests/domHarness.js`), Playwright (`tests/playwrightE2e.test.js`), Node 22.

**Spec:** `docs/superpowers/specs/2026-11-10-scheduler-logic-design.md`

## Global Constraints

- No new runtime dependencies; no backend; the app remains offline-first.
- Never relax: coverage, off requests, rest, role, night→morning, one shift per doctor per day, the night floor.
- Preserve every existing element ID, `data-i18n` key and inline handler.
- All user-facing copy in Thai and English (`translations.js`).
- Same inputs + same seed → identical roster.
- `npm test` must pass at every commit; the Playwright suite runs last.
- Work on branch `solver-logic`; commit after each task.
- Do not change the duty-sheet visual identity.

## Review Focus

These are the inputs most likely to bite a real user; each gets a test in its owning task.

1. A custom-range per-day slot override must change the slots on that date (currently numeric keys never match the lookup).
2. A doctor who worked the last night of the previous month must be blocked on day 1 by the rest/night→morning rules.
3. A manual edit that duplicates a doctor on one day, breaks a conflict pair, or exceeds a quota must be rejected before the schedule mutates.
4. A forced conflict or spacing relaxation must appear as a visible warning and in the toast — never a clean “no shortages” success.
5. An invalid date (31/02), a negative/NaN slot count, or start > end must be rejected with a toast, not rolled over or thrown as `RangeError`.

---

### Task 1: Relaxation telemetry, score and warnings

**Files:**
- Modify: `app.js` (`generateSingleScheduleCandidate`, `scoreSchedule`, `runScheduleOnce`, `renderResults`)
- Modify: `index.html` (warnings panel inside `#resultsContainer`, after the coverage band)
- Modify: `translations.js` (panel title / summary; Thai + English)
- Test: `tests/relaxationReport.test.js`

**Interfaces:**
- `generateSingleScheduleCandidate(...)` returns `{ schedule, summary, wCounts, hCounts, tCounts, nCounts, relaxations, maxSlots, config }`.
- Each relaxation: `{ day: number, slot: number, level: 2|3|4|5, kind: 'spacing'|'conflict'|'dayBeforeOff'|'special', doctors: string[] }`.
- `globalResult.relaxations` is a copy of the chosen candidate's array.
- `renderRelaxations()` reads `globalResult.relaxations` and fills `#relaxationPanel`; hidden when empty.
- `scoreSchedule` subtracts `kind` penalties: conflict 50000, dayBeforeOff 5000, spacing 1000, special 1000.

- [ ] **Step 1: Write the failing test**

Create `tests/relaxationReport.test.js` using `tests/domHarness.js`. Two tests:
1. `reset(w, ['A','B'])`, one slot per day, conflict `A-B`, `allowBlankDays=false`; generate. Assert `globalResult.relaxations.length > 0`, at least one `kind === 'conflict'`, `#relaxationPanel` is visible and contains the day, and the success toast text includes the count.
2. A clean 4-doctor, 2-slot run has `globalResult.relaxations.length === 0`, the panel is hidden, and the toast has no warning count.

Also assert `scoreSchedule(clean)` > `scoreSchedule(relaxed)` for otherwise identical candidates.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/relaxationReport.test.js`
Expected: FAIL — `relaxations` is undefined and `#relaxationPanel` does not exist.

- [ ] **Step 3: Implement the telemetry**

In `generateSingleScheduleCandidate`, create `const relaxations = []`. At each cascade level that relaxes a rule, push one record with the day, slot, level and kind. Cascade level 2 = spacing/holiday; level 3 = conflict; level 4 = day-before-off; level 5 = special-doctor fallback. Do not record a relaxed rule when the strict pick was available.

Return `relaxations`; copy it into `globalResult` in `runScheduleOnce`. In `scoreSchedule`, subtract the penalties above. In `runScheduleOnce`, change the success toast to include `N warnings` when `relaxations.length > 0`.

Add to `index.html`:
```html
<div id="relaxationPanel" class="hidden sheet p-4 text-[12px] text-signal dark:text-signal-bright"></div>
```
inside `#resultsContainer` after `#statsDashboard`. In `renderResults`, call `renderRelaxations()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/relaxationReport.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html translations.js tests/relaxationReport.test.js
git commit -m "feat: score and surface solver relaxations"
```

---

### Task 2: Cross-period carry-over

**Files:**
- Modify: `app.js` (`parseUIConfig`, `generateSingleScheduleCandidate` strict check, `runScheduleOnce` result)
- Test: `tests/carryOver.test.js`

**Interfaces:**
- `globalResult.carryOver = { dutiesByDoctor: { [doctor]: [{ date: 'YYYY-MM-DD', type: 'duty' }] } }`, holding the last `max(offDutyPeriod, 2)` duty records per doctor.
- `config.carryOver` is that object only when the new period starts the day after `globalResult.dates[last]` and the doctor set is unchanged; otherwise `null`.
- The day-1 strict check uses `config.carryOver` for rest, night→morning and holiday spacing.

- [ ] **Step 1: Write the failing test**

Create `tests/carryOver.test.js`. Generate January 2026 with `['A','B']`, one slot, off-duty gap 1 (one day off). Record who works Jan 31. Generate February 2026 without resetting the app. Assert that doctor is **not** on Feb 1; the other doctor is. A second test changes to April (non-contiguous) and asserts the carry-over is `null` and day 1 is not constrained by January.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/carryOver.test.js`
Expected: FAIL — the Jan-31 doctor can appear on Feb 1.

- [ ] **Step 3: Implement the carry-over**

In `runScheduleOnce`, after committing `globalResult`, compute `carryOver` from the last `max(offDutyPeriod, 2)` days: for each doctor, append `{date:'YYYY-MM-DD', type:'duty'}`. In `parseUIConfig`, set `config.carryOver` when the new start date is contiguous and `doctors` is unchanged. In `strictOk`, for `day === 1`, reject a doctor if any carry-over duty falls inside `< offDutyPeriod` days, or if the previous day was a night and the slot is a morning shift.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/carryOver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/carryOver.test.js
git commit -m "fix: carry rest and night rules across month boundary"
```

---

### Task 3: Custom-range per-day slot keys

**Files:**
- Modify: `app.js` (`parseUIConfig` extra-slot map and lookups)
- Test: `tests/customRangeSlots.test.js`

**Interfaces:**
- `canonicalDayKey(dateObj) -> 'YYYY-MM-DD'`.
- `normalizeSlotKey(raw, config) -> 'YYYY-MM-DD' | null`: accepts `YYYY-MM-DD`, `DD/MM/YYYY`, or a day-of-month number resolved against the range.
- `extraSlotsMap` is keyed only by canonical `YYYY-MM-DD`; `getRoleSlotsForDay` reads it with `canonicalDayKey(scheduleDates[day-1])`.

- [ ] **Step 1: Write the failing test**

Create `tests/customRangeSlots.test.js`: custom range 01/07/2026–31/07/2026, one doctor, default slot 1, `extraSlotsData = [{id:1, date:'15', slots:'3'}]`. Generate; assert day 15 has 3 slots. Repeat with `date:'15/07/2026'`; assert the same.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/customRangeSlots.test.js`
Expected: FAIL — day 15 keeps the default slot count.

- [ ] **Step 3: Implement the canonical key**

Build `extraSlotsMap` by normalizing each `extraSlotsData` entry. In `getRoleSlotsForDay`, use `canonicalDayKey` for custom ranges and the numeric day otherwise. Keep the standard-month behavior unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/customRangeSlots.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/customRangeSlots.test.js
git commit -m "fix: apply custom-range per-day slot overrides"
```

---

### Task 4: Override hard-rule validation

**Files:**
- Modify: `app.js` (`updateDoctorAssignment`, add `validateManualAssignment`)
- Test: `tests/overrideValidation.test.js`

**Interfaces:**
- `validateManualAssignment(config, day, slotIndex, newDoctor) -> { ok: boolean, reason: 'duplicate'|'conflict'|'role'|'off'|'rest'|'nightToMorning'|'quota'|'floor'|null, detail?: string }`.
- `updateDoctorAssignment` calls it before `pushToUndoStack` and before mutating `globalResult.schedule`; on `ok:false` it shows a toast and returns unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/overrideValidation.test.js`, one test per rule:
- duplicate: assign a doctor already on that day;
- conflict: assign one of a conflicting pair already on that day;
- role: assign a doctor to a role slot they do not hold;
- off: assign a doctor on a requested off day;
- rest: assign a doctor inside the rest window;
- quota: assign above a configured quota.
Each asserts the schedule cell is unchanged and the toast contains the reason. Keep the existing floor test in `tests/nightFloor.test.js`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/overrideValidation.test.js`
Expected: FAIL — invalid edits are accepted.

- [ ] **Step 3: Implement the validator**

Reuse the config helpers already used by `strictOk` (`offMap`, `areConflicting`, `doctorRoles`, quota, `offDutyPeriod`, shift indices). Return the first failing rule. In `updateDoctorAssignment`, replace the ad-hoc floor check with a call to the validator plus the floor check.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/overrideValidation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/overrideValidation.test.js
git commit -m "fix: validate manual overrides against hard rules"
```

---

### Task 5: Input validation and date parsing

**Files:**
- Modify: `app.js` (`parseUIConfig`, `expandSlots`, `parseDateDDMMYYYY`)
- Test: `tests/inputValidation.test.js`

**Interfaces:**
- `parseUIConfig` throws/short-circuits with a toast for invalid input; `expandSlots(count)` returns `[]` for non-finite or `count < 0`.
- `parseDateDDMMYYYY` returns `null` for impossible dates (31/02, 31/04, 00/01) and preserves valid leap days.

- [ ] **Step 1: Write the failing test**

Create `tests/inputValidation.test.js`:
- default slots `-1`, `NaN`, `0`; shift slots `-2`; assert no `RangeError`, the run is rejected or clamped, and the UI stays responsive.
- custom start `31/02/2026`, `31/04/2026`, start > end; assert a toast and no schedule.
- duplicate doctor names are already sanitized; assert the count stays correct.

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/inputValidation.test.js`
Expected: FAIL — `Array(-1)` throws or the invalid date rolls over.

- [ ] **Step 3: Implement the guards**

Clamp numeric inputs in `parseUIConfig` (`defaultSlots` 1..10, shift slots 0..10, floor 0..60) and reject non-finite values. Guard `expandSlots`. Replace the date-rollover check in `parseDateDDMMYYYY` with a component round-trip (`new Date(y,m-1,d)` must match d/m/y).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/inputValidation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/inputValidation.test.js
git commit -m "fix: validate slot counts and impossible dates"
```

---

### Task 6: Sort-comparator availability cost

**Files:**
- Modify: `app.js` (`generateSingleScheduleCandidate` sort comparator)
- Test: `tests/solverPerformance.test.js`

**Interfaces:**
- Precompute `remainingAvailable[doctor]` as a suffix array for the current day before sorting; the comparator reads it in O(1). No change to the chosen roster for small instances (deterministic tie-break preserved).

- [ ] **Step 1: Write the failing test**

Create `tests/solverPerformance.test.js`: 90-day custom range, 10 doctors, 3 slots, no quotas; generate and assert a valid schedule and that the run completes under 20 s on the CI machine. Also compare the first 4 doctors' totals against the pre-change algorithm for a 4-doctor/31-day config if a golden file exists; otherwise assert `max(total) - min(total) <= 2`.

- [ ] **Step 2: Run it to verify it fails or is too slow**

Run: `node tests/solverPerformance.test.js`
Expected: the 90-day case is slow (or the test asserts a timing budget it exceeds).

- [ ] **Step 3: Replace the scan**

Before `sortDoctors` is used for a day, compute each doctor's remaining available days from that day forward once, respecting off requests. Use that array in the quota-density branch. Keep the comparator deterministic.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/solverPerformance.test.js`
Expected: PASS under the budget.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/solverPerformance.test.js
git commit -m "perf: precompute remaining availability in the solver"
```

---

### Task 7: Documentation and full-suite close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-11-10-scheduler-logic-design.md` (mark tasks implemented)
- Modify: `CHANGELOG.md`
- Test: full `npm test`

- [ ] **Step 1: Update docs**

Record the new `relaxations`, `carryOver`, canonical slot keys, override validator and input guards in the design doc's implementation notes and the changelog.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: every suite passes, `playwrightE2e` last.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-10-scheduler-logic-design.md CHANGELOG.md
git commit -m "docs: close out scheduler logic v2"
```
