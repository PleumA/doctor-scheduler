# Scheduler Logic Redesign — Night Floor, Extra Coverage, and Fairness

Date: 2026-11-10
Status: implemented (v1 + remaining-logic close-out, 2026-11-10)
Scope: scheduler logic only. The duty-sheet visual redesign is separate and already implemented.

## 1. Intent and why

The real roster is night-heavy and small-team:

- 2 doctors on nights every night (base coverage).
- 5 doctors in a normal month; 4 in some months.
- **Every doctor must have at least 14 night shifts per month.** More is allowed; less is a contract breach.
- Each doctor has 2 requested days off per month.
- The department wants the workload balanced — not a mathematically exact quota.

The current solver fails this case in ways that are not visible in the UI:

- Its feasibility pre-check for shift mode assumes a doctor can cover all three shifts in a day, so small teams pass a check they cannot satisfy.
- When the floor cannot be met it relaxes the rest rule on every day, fills the slots, and reports “no shortages.” A 31-consecutive-night roster can be presented as successful.
- The score ignores conflict, day-before-off and holiday-spacing relaxations, so a violating roster can score the same as a clean one.
- “300 Monte Carlo iterations” are 300 near-duplicate greedy passes with unseeded noise; results are not reproducible.

The arithmetic is the core design constraint. For N nights and D doctors:

- base slots = N × 2
- required = D × 14
- with the extra-doctor option, max slots = N × 3

| Case | Base | Required | Feasible? |
|---|---:|---:|---|
| 4 doctors, 30 nights | 60 | 56 | yes, no extras (15 each) |
| 4 doctors, 28 nights | 56 | 56 | yes, exactly 14 each |
| 5 doctors, 30 nights | 60 | 70 | only with 10 extra-doctor nights |
| 5 doctors, 31 nights | 62 | 70 | only with 8 extra-doctor nights |
| 7 doctors, 30 nights | 60 | 98 | no, even with 30 extras |

## 2. Goals

1. Never produce a roster that violates a hard rule (coverage, off days, rest, conflicts, roles, one shift per doctor per day).
2. Enforce the night floor (≥14) or refuse with the exact arithmetic.
3. Use the extra-doctor option only when needed, at most one extra per night, distributed fairly.
4. Produce a deterministic roster for the same inputs; a visible “regenerate” action may change the seed.
5. Show a per-doctor ledger and the reason for every shortfall or relaxation.
6. Keep manual overrides safe: an override may not break a hard rule or drop a doctor below the floor.

## 3. Non-goals

- No backend, no OR-Tools/CP-SAT service in this iteration. The solver stays vanilla JS and offline-capable.
- No multi-month global optimisation. Carry-over only feeds the first days of the next run.
- No change to the visual design system.
- No new preference weighting beyond off requests and the night/weekend balance.

## 4. Anti-goals (a failure even if it “works”)

- Producing 12 nights each for 5 doctors and calling it success.
- Silently adding a third doctor on every night.
- Silently relaxing rest or off days to hit 14.
- A different roster on every keystroke for identical inputs.
- A fairness strip that compares raw totals when totals are equal by construction.

## 5. Model

### 5.1 Hard constraints

- Exactly `baseDoctorsPerNight` (2) doctors on each night, plus an optional extra doctor where the plan requires it.
- Each doctor at most one shift on a day.
- The same doctor cannot appear twice in one night.
- Off-request dates: no duty. Off requests are hard and are not relaxed.
- Rest: after a night, no duty for `offDutyPeriod - 1` days (1 = no rest, 2 = one day off).
- Night → morning is forbidden in shift-based mode.
- Conflict pairs never share a day by default (see 5.4 for the explicit opt-in relaxation).
- Role groups: a doctor may only fill a slot for their role.
- Night floor: every active doctor has at least `minNightShiftsPerDoctor` (default 14). No upper bound. The value applies to one generated roster; a custom range does not auto-prorate it, and the banner states the target it used.
- A “night” for the floor: in standard mode every duty slot; in shift mode only the night (N) slots; in role mode every duty slot, with roles restricting eligibility. The extra doctor is always a night slot.
- Off days and post-night rest overlap: the 2 requested off days are counted among the days a doctor is already resting after a night. The capacity check merges them, so a 14-night month with one rest day per night fits (14 nights + 14 rest days = 28 days, of which up to 2 are the requested off days).
- Off-duty setting: the UI is **0-based** — `0` = no gap, `1` = one day off after a night, and so on. Internally the solver keeps its existing 1-based `offDutyPeriod` (`gap + 1`) so saved configs and the rest of the code remain compatible; the UI and the exported `inputs.inputOffDutyPeriod` use the gap value.

### 5.2 Soft objectives (lexicographic)

1. Zero hard violations.
2. Zero floor shortfall.
3. Minimise max−min nights above the floor.
4. Minimise max−min weekend/holiday nights.
5. Minimise max−min total duties.
6. Deterministic tie-break by a fixed doctor order + rotation index.

Off requests are hard constraints, so there is no “satisfy as many as possible” objective.

The solver accepts a move only if it improves the first non-equal component of this ordering.

### 5.3 Extra-doctor plan

`allowExtraNightDoctor` defaults on.

- Compute `base = N × S`, `required = D × F`, `max = N × (S + 1)`.
- If `required ≤ base`: no extras are used, whatever the option says.
- If `base < required ≤ max`: extras needed `K = required − base`; place one extra on exactly K nights. Choose nights spread across the range, prefer weekdays first, then rotate weekend extras so no doctor is always on the extra weekend night. If a planned night has no eligible third doctor, move that extra to another night with the same spread rule; refuse only if no night can take it.
- In role-based mode the extra slot takes the role of the night slot it is added to; if that role has no eligible doctor, try another night before refusing.
- If `required > max`: infeasible even with extras. Refuse and show the gap.
- If the option is off and `required > base`: refuse and show “D × F required / base available”, with the two remedies: turn extras on, or lower the floor.

A feasibility banner is shown before generation and repeated after: “60 base + 10 extra = 70 → 14 each; extra on 10 nights.” It names the nights and doctors.

### 5.4 Relaxations

The cascade must be explicit, scored and surfaced. The default policy:

- **Never relaxed:** coverage (at least S per night), one shift per doctor per day, same-night uniqueness, off requests, rest, role, night→morning, the night floor.
- **Conflicts:** hard by default. A per-run opt-in `allowConflictRelaxation` (default off) permits a conflict only with a high-severity per-day warning and a score penalty.
- **Day-before-off and holiday spacing:** soft. They may be relaxed with a warning and a score penalty.
- **The floor is never relaxed.** A shortfall is a refusal; no roster is rendered.
- **The generator never emits `SHORTAGE_MARKER` or blank slots.** `allowBlankDays` remains only for manual clearing; a manual blank is shown as a deliberate gap and is not a solver output.
- **Phase 3 aborts on any hard violation.** Soft relaxations render with warnings; the toast says “generated with N warnings” rather than “no shortages”.
- Every relaxation is recorded in `globalResult.relaxations` and rendered in the warnings panel.

### 5.5 Determinism

- A seeded PRNG (e.g. mulberry32) replaces `Math.random()` in the solver.
- The seed is stored in `globalResult.seed` and shown in the ledger/footer.
- Same inputs + same seed → identical roster. The “Calculate”/“Regenerate” action produces a new seed and shows it.
- Tests assert byte-identical schedules for the same seed and different schedules across two seeds (for a config with more than one optimum).

## 6. Solver architecture

### Phase 0 — validate and plan

- Normalise inputs, clamp counts, reject NaN/negative counts with a toast.
- Build the date list for the month or custom range; compute N.
- Compute per-doctor capacity: a greedy check of how many nights each doctor can physically do given off dates and rest. If any doctor’s capacity < F, refuse with the doctor and the number.
- Compute the totals table and the extra-doctor plan.
- Return a plan object; never start construction if the plan is infeasible.

### Phase 1 — deterministic constructive

- Order nights by scarcity: weekends/holidays first, then chronological.
- For each night, create S base slots (+1 on planned extra nights).
- For each slot, filter eligible doctors: not off, no conflict with already assigned, role match, rest satisfied, not already on this night, floor not exceeded only if the doctor is already above F and another eligible doctor is below F (a soft preference, see Phase 2).
- Choose by: nights so far ascending, weekend/holiday nights ascending, days since last night descending, rotation index ascending.
- Record the assignment; if no eligible doctor, leave the slot unfilled in the working candidate and record the reason. Repair must fill it; if it remains unfilled, Phase 3 refuses.

### Phase 2 — repair and balance

- Repeat until no improving move or a fixed pass cap (e.g. 5 × N):
  - **Floor repair:** if a doctor is below F, move a night from a doctor above F or add an unused planned extra; accept only if all hard rules hold. Prefer swaps over moves.
  - **Balance repair:** swap two nights between doctors when it reduces max−min nights, then weekend/holiday spread, then total spread.
  - **Hole repair:** try to fill an unfilled slot by moving an eligible doctor from another night, preserving every hard rule.
- Every accepted move must improve the lexicographic score; no random walk.
- Deterministic tie-break; no `Math.random()`.

### Phase 3 — verify and render

- Independently re-scan the final schedule and count every hard violation. If any exist, do not render; show an error.
- Build the ledger: per doctor — nights, weekend nights, holiday nights, extra nights, rest days, off days, total, floor gap.
- Build `relaxations` with reasons. Any remaining unfilled slot is a refusal, not a rendered gap.
- Render; the success toast includes the warning count.

## 7. Data and UI

New config fields (persisted and exported/imported, with `sanitizeConfig` defaults):

- `minNightShiftsPerDoctor`: number, default 14, 0 disables the floor.
- `allowExtraNightDoctor`: boolean, default true.
- `baseDoctorsPerNight`: already exists as the per-day slot count; reuse it for night coverage.
- `seeded`: internal; `seed` stored on the result, not the config.

UI additions:

- Settings: “ขั้นต่ำเวรดึกต่อคน” number input (default 14) and “อนุญาตแพทย์เสริมในเวรดึก” toggle, with inline help and the computed plan.
- A feasibility banner above the schedule; red if refused, neutral if a plan is available.
- Ledger table (or expand the existing per-doctor details) with nights/weekend/holiday/extra/rest/off/floor-gap.
- Warnings panel for relaxations and refusals, per day, with the reason; no generator-produced shortage badges.
- Manual override rejection toast naming the rule and the doctor.

Compatibility:

- Existing config files without the new fields load with the defaults above. A config that becomes infeasible shows the banner instead of a roster.
- The old `quota` (total duties / per-role cap) remains an optional **hard cap**, not a target. If a quota is below the floor, the config is contradictory: refuse with a configuration error naming the doctor. Ordering is: hard constraints → floor → quota caps → fairness.
- Solver-planned extra nights are stored only in `globalResult.extraNightDoctors` (date + slot). They do not mutate `extraSlotsData` or the saved config; user per-day slot overrides remain separate.

## 8. Carry-over and boundaries

- Persist `carryOver = { dutiesByDoctor: { [doctor]: [{ date, type }, ...] } }`, keeping the last `max(offDutyPeriod, 2)` duty records per doctor. One “last night” is not enough for rest periods of 3–7 days or for night→morning when the previous duty was a day shift.
- When generating a period that starts the day after that period, day 1 filters use the carry-over for rest, night→morning and holiday spacing.
- If the period is not contiguous or the doctor set changed (any add/remove), ignore the carry-over and say so once in the warnings panel.
- Custom-range day numbering and extra-slot keys must use one canonical `YYYY-MM-DD` key; the UI date input and the lookup must agree.

## 9. Manual overrides

- `updateDoctorAssignment`, drag/drop and the mobile sheet call one validator.
- Reject if: doctor is off, rest violated, duplicate on the same night, role mismatch, conflict with the other assigned doctor, or the move would drop a doctor below the floor. There is no “confirm and proceed” for a hard rule.
- A rejected override leaves the schedule unchanged and shows the exact reason.
- Accepted overrides are recorded in the undo stack and re-validated on the next generation; if the new inputs make an old override invalid, drop it with a toast.

## 10. Tests to add

1. Feasibility matrix: D ∈ {4,5,6,7}, N ∈ {28,30,31}, extras on/off, F=14; assert the exact plan or refusal.
2. 5 doctors, 30 nights, extras on → 10 extra nights, every doctor 14, every night ≥2.
3. 4 doctors, 30 nights → no extras, 15 each; 28 nights → 14 each.
4. Extras off + 5 doctors → refusal with the gap; no rendered roster.
5. Rest capacity: F=14 with `offDutyPeriod` 3 and a 30-day month → refusal with the doctor/count.
6. Determinism: same seed → deep-equal schedule; second seed → different schedule where an alternative exists.
7. Boundaries: off request on day 1 + carry-over from the previous month → day 31 night is blocked; without carry-over, it is not.
8. Overrides: quota, conflict, duplicate and rest rejections; accepted overrides survive regenerate only when valid.
9. Custom range: extra-slot override keyed `YYYY-MM-DD` is applied; numeric key is ignored or migrated.
10. Relaxations: an opt-in conflict relaxation produces a warning and a non-zero count; an unrelaxable shortage produces a refusal, never a rendered roster.
11. E2E (Playwright): toggle extras off → banner/refusal; toggle on → generate → ledger shows 14 each and the extra count.

## 11. What is left to the builder

- Exact Thai/English copy for the new controls, banner and warnings.
- Storage location for the seed and carry-over (localStorage keys, export shape).
- Whether the ledger replaces or extends the existing per-doctor details table.
- Performance tuning for 90-day ranges (cache remaining capacity; avoid set scans in sort comparators).
- Visual treatment inside the existing duty-sheet system.

## 12. Existing tests that will need updating

- `solver.test.js`, `quotaFeasibility.test.js`, `shiftBased.test.js`, `constraintCoverage.test.js`, `scoring.test.js`, `softAlternate.test.js`, `specialDoctor.test.js`, `lockSpecialDuty.test.js` — any assertion tied to the old cascade order or the 300-iteration search.
- `resultSnapshot.test.js` if the result shape gains `seed`, `relaxations`, `ledger` or `carryOver`.
- `workbenchLayout.test.js` if the ledger changes the summary markup.

## 13. Open decisions (owner)

**A. Do the 2 requested off days include the post-night rest day?**
Resolved: **yes — they overlap.** The capacity check merges them. This is the only reading under which the department’s 14-night months are feasible with a rest day after each night.

**B. Does the new core replace the solver for every mode?**
Resolved: **night/default first.** Build the generic night core for the default roster and shift-night mode; keep the old solver for role/custom/lock modes behind a visible “legacy solver” warning, then migrate those once the core is proven.


## 14. Implementation notes (v1)

- `minShiftsPerDoctor` is read from `#inputMinNightShifts` (default 14 in the UI; 0 in legacy/imported configs).
- The floor applies to **standard, role-based and shift-night (non-role) rosters**. Role+shift and quota-driven rosters keep the legacy solver and show a warning that the floor is not applied.
- Extras are at most one per night. In role mode they go to the role whose own floor need is largest; if one role cannot reach its floor, the run refuses with a role-specific message.
- The plan note above the results reads “N slots + M extras = total shifts → X each”.
- `offDutyPeriod` is 1-based internally; the UI and exported `inputs.inputOffDutyPeriod` are 0-based gap days (`0` = no gap). Old configs (no `configVersion`, or `configVersion < 2`) are migrated by subtracting one.
- The solver RNG is seeded from the inputs (`mulberry32`), so identical inputs produce an identical roster.
- `checkQuotaFeasibility` now assumes one shift per doctor per day and excludes no-duty days.
- Tests added: `tests/nightFloor.test.js` (12 checks) and a floor assertion in `tests/playwrightE2e.test.js`.
- Manual overrides that would drop a doctor below the floor are rejected with a toast (standard, role-based and shift-night).
- v1 keeps the existing greedy + 300-candidate search, adding a floor-first sort, a floor score term, a seeded RNG and a final floor audit. The dedicated construct-then-repair pass and the full relaxation scoring remain future work.

## 15. Implementation notes (v2 — remaining logic close-out)

Plan: `docs/superpowers/plans/2026-11-10-scheduler-logic-remaining.md` (Tasks 1–6, all committed on `solver-logic`). No new dependencies; the app stays offline-first.

### 15.1 Relaxation telemetry, scoring and warnings

- `generateSingleScheduleCandidate` returns `relaxations` alongside the schedule and counts. After a doctor is placed, the solver records their **actual** violations, one record per violated kind at the same day/slot: `{ day, slot, level: 2|3|4|5, kind: 'spacing'|'conflict'|'dayBeforeOff'|'special', doctors: string[] }`. A multi-violation pick (for example a level-4 pick that also conflicts) records every kind, not one.
- `scoreSchedule` subtracts `RELAX_PENALTY` per record: conflict 50 000, dayBeforeOff 5 000, spacing 1 000, special 1 000. This sits after the floor term, so a violating roster no longer scores like a clean one.
- `globalResult.relaxations` is a deep copy of the chosen candidate's array. `renderRelaxations()` fills `#relaxationPanel` (hidden when empty) from the day, kind and doctors; it is called by `renderResults` and by the language toggle. The success toast appends the warning count (`(N warnings)` / `(คำเตือน N รายการ)`).
- The panel reflects solver output. Accepted manual edits cannot introduce a relaxation by definition (the override validator enforces the hard rules), so it is not recomputed after edits.

### 15.2 Cross-period carry-over

- `buildCarryOver(result)` keeps each doctor's last `max(offDutyPeriod, 2)` duty records: `{ dutiesByDoctor: { [doctor]: [{ date: 'YYYY-MM-DD', type: 'night'|'duty', holiday: boolean }] } }`, stored as `globalResult.carryOver`. `type` is `night` only for night slots in shift mode.
- `parseUIConfig` sets `config.carryOver` when the new period starts exactly one day after the displayed result's last date **and** the doctor set is identical. Regenerating the same period reuses its own carry-in; a non-contiguous period or a changed doctor set yields `null`.
- The carry-over is built from the live displayed result, so manual edits made after generation are included. Day 1 of the new period uses it in `strictOk` for rest, night→morning (via `isBlockedByNightToMorning`, so every cascade level honours it) and holiday spacing.

### 15.3 Canonical custom-range slot keys

- `canonicalDayKey(dateObj)` (an alias of `isoLocal`) produces `YYYY-MM-DD`.
- `normalizeSlotKey(raw, config)` accepts `YYYY-MM-DD`, `DD/MM/YYYY`, or a bare day number resolved against the range; unresolvable entries are dropped.
- In custom-range mode, `extraSlotsMap` is keyed only by the canonical key and `getRoleSlotsForDay` reads it with `canonicalDayKey(scheduleDates[day-1])`. The standard-month numeric path is unchanged. A bare day number in a cross-month range resolves to its first occurrence (documented in code).

### 15.4 Manual override validator

- `validateEdits(config, edits)` simulates all edits together against the displayed schedule and returns `{ ok, reason, detail }` for the first failing rule, in this order: `duplicate`, `conflict`, `role`, `off`, `rest`, `holiday`, `nightToMorning`, `quota`, `floor`. `validateManualAssignment(config, day, slotIndex, newDoctor)` is the single-edit wrapper.
- Rest and night→morning are checked in both directions (a move can break a later duty), including carried duties before the period. Off requests also check the next day for the night slot (or non-shift mode). Holiday spacing covers adjacent holiday days and a carried holiday before day 1. The floor rule flags only doctors who lose duties and end below the floor.
- `updateDoctorAssignment` validates before pushing undo or mutating the schedule and rejects with a toast naming the rule and detail.
- Drag/drop (table, calendar and mobile sheet) goes through `window.applyPairedEdits(edits)`: the **final** state of the whole move is validated once, then the edits are applied under `isDragAndDropOperation` so the transient intermediate state (for example a same-day duplicate during a swap) is not re-checked. An illegal swap changes nothing and adds no undo entry.

### 15.5 Input and date guards

- `expandSlots` returns `[]` for non-finite, zero or negative counts (floors fractional counts), so `Array(-1)` can no longer throw `RangeError`.
- `parseUIConfig` clamps default slots to 1..10 (NaN/empty → 2), shift slots to 0..10 and the night floor to 0..60.
- `parseDateDDMMYYYY` round-trips the local components, so impossible dates (31/02, 31/04, 00/01) return `null` while valid leap days (29/02/2028) stay valid; start > end is rejected with a toast and no schedule.

### 15.6 Sort-comparator availability cost

- When quotas are active, `generateSingleScheduleCandidate` builds `remainingAvailableByDoctor` once per candidate: a suffix array where `suffix[d]` is the number of days from `d` through the end of the range on which the doctor has no off request (O(days × doctors)).
- The quota-density comparator reads `remainingAvailableByDoctor[doc][currentDay]` in O(1), replacing the per-comparison forward scan. The chosen rosters are unchanged (verified byte-identical for three configurations with the same seed), and the deterministic tie-break is preserved.

### 15.7 Tests added in this close-out

`tests/relaxationReport.test.js`, `tests/carryOver.test.js`, `tests/customRangeSlots.test.js`, `tests/overrideValidation.test.js`, `tests/inputValidation.test.js`, `tests/solverPerformance.test.js`.

