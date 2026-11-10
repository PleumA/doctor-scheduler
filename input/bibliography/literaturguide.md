# Literature Guide — Algorithms for a Small Physician Duty Roster

Scope: physician/nurse duty rostering for a **4–6 doctor, 28–31 night, 2-doctors-per-night** roster with a ≥14-night floor, rest/off constraints, an optional extra night doctor, fairness objectives, manual overrides, and a vanilla-JS browser implementation. English-language operations-research and clinical-informatics literature, 1998–2026. Thai hospital context.

Search date: 2026-11-10. Sources verified against Crossref/OpenAlex; preprints and conference papers flagged.

---

## 1. Weighted source table

| Grade | Autor Jahr | Kurztitel | OA/Zugang | DOI/Link |
|-------|------------|-----------|-----------|----------|
| A | Erhard 2018 | physician-scheduling-review | ○ Fernleihe | [10.1016/j.ejor.2017.06.037](https://doi.org/10.1016/j.ejor.2017.06.037) |
| A | Burke 2004 | nurse-rostering-sota | ✓ OA (Lirias) | [10.1023/b:josh.0000046076.75950.0b](https://doi.org/10.1023/b:josh.0000046076.75950.0b) |
| A | Cheang 2003 | nurse-rostering-survey | ○ Fernleihe (green) | [10.1016/s0377-2217(03)00021-3](https://doi.org/10.1016/s0377-2217(03)00021-3) |
| A | Ernst 2004 | staff-scheduling-review | ○ Fernleihe | [10.1016/s0377-2217(03)00095-x](https://doi.org/10.1016/s0377-2217(03)00095-x) |
| A | Van den Bergh 2013 | personnel-scheduling-review | ✓ OA (Lirias) | [10.1016/j.ejor.2012.11.029](https://doi.org/10.1016/j.ejor.2012.11.029) |
| A | Ngoo 2022 | nurse-rostering-methods | ✓ OA (IEEE) | [10.1109/access.2022.3177280](https://doi.org/10.1109/access.2022.3177280) |
| A | Min 2026 | ai-nurse-scheduling-review | ○ Fernleihe | [10.1016/j.ijnurstu.2026.105656](https://doi.org/10.1016/j.ijnurstu.2026.105656) |
| A | Ceschia 2018 | inrc-ii-benchmark | ○ Fernleihe | [10.1007/s10479-018-2816-0](https://doi.org/10.1007/s10479-018-2816-0) |
| A | Legrain 2020 | rotation-branch-price | ○ Fernleihe (green) | [10.1007/s12532-019-00172-4](https://doi.org/10.1007/s12532-019-00172-4) |
| A | Guo & Bard 2022 | midterm-column-generation | ○ Fernleihe | [10.1016/j.cor.2021.105597](https://doi.org/10.1016/j.cor.2021.105597) |
| A | Bard & Purnomo 2005 | preference-column-generation | ○ Fernleihe | [10.1016/j.ejor.2003.06.046](https://doi.org/10.1016/j.ejor.2003.06.046) |
| A | Dowsland 1998 | tabu-strategic-oscillation | ○ Fernleihe | [10.1016/s0377-2217(97)00281-6](https://doi.org/10.1016/s0377-2217(97)00281-6) |
| A | Ceschia 2020 | sa-large-neighborhoods | ○ Fernleihe | [10.1007/s10479-020-03527-6](https://doi.org/10.1007/s10479-020-03527-6) |
| A | Martin 2013 | fair-nurse-rosters | ✓ OA (Lirias) | [10.1016/j.eswa.2013.06.019](https://doi.org/10.1016/j.eswa.2013.06.019) |
| A | Breugem 2022 | fairness-attractiveness | ○ Fernleihe (green) | [10.1287/mnsc.2021.4005](https://doi.org/10.1287/mnsc.2021.4005) |
| A | Wickert 2019 | nurse-rerostering | ✓ OA (Lirias) | [10.1016/j.cor.2018.12.014](https://doi.org/10.1016/j.cor.2018.12.014) |
| B | Gradišar 2022 | interactive-nurse-scheduling | ○ Fernleihe | [10.1097/cin.0000000000000941](https://doi.org/10.1097/cin.0000000000000941) |
| B | Stolletz & Brunner 2012 | fair-physician-fortnight | ○ Fernleihe | [10.1016/j.ejor.2011.10.038](https://doi.org/10.1016/j.ejor.2011.10.038) |
| B | Zhong 2017 | weekend-fairness-heuristic | ○ Fernleihe | [10.1080/24725579.2017.1356891](https://doi.org/10.1080/24725579.2017.1356891) |
| B | Chia 2026 | cp-sat-fairness | ○ Fernleihe (conference) | [10.1109/icsse70735.2026.11718771](https://doi.org/10.1109/icsse70735.2026.11718771) |
| B | Jiang 2026 | cp-sat-nurse | ✓ OA (MDPI) | [10.3390/engproc2026134032](https://doi.org/10.3390/engproc2026134032) |
| B | Patel 2026 | cp-sat-workforce | ✓ OA (arXiv; preprint) | [10.48550/arxiv.2608.30419](https://doi.org/10.48550/arxiv.2608.30419) |
| B | Böðvarsdóttir 2020 | weight-tuning | ✓ OA (Lirias) | [10.1016/j.orhc.2020.100265](https://doi.org/10.1016/j.orhc.2020.100265) |
| B | Mihaylov 2016 | manual-to-automated | ✓ OA (Lirias) | [10.1057/hs.2015.12](https://doi.org/10.1057/hs.2015.12) |
| B | O'Connell 2024 | e-rostering-review | ○ Fernleihe | [10.1111/jocn.17114](https://doi.org/10.1111/jocn.17114) |
| B | Renggli 2025 | nurse-preferences | ✓ OA (JMIR) | [10.2196/67747](https://doi.org/10.2196/67747) |
| B | Gerlach 2025 | fairness-transparency | ✓ OA (BMC) | [10.1186/s12912-025-03808-0](https://doi.org/10.1186/s12912-025-03808-0) |
| C | Booker 2024 | scheduling-fatigue | ✓ OA (PMC) | [10.1186/s12912-024-01949-2](https://doi.org/10.1186/s12912-024-01949-2) |
| C | Burke 2010 | ip-vns-hybrid | ○ Fernleihe | [10.1016/j.ejor.2009.07.036](https://doi.org/10.1016/j.ejor.2009.07.036) |
| C | Uhde 2020 | fairness-collaborative | ✓ OA (ACM) | [10.1145/3313831.3376656](https://doi.org/10.1145/3313831.3376656) |

Legend — **Grade:** A core/must-read · B supporting · C peripheral/context. **OA/Zugang:** ● Bibliothek (already owned) · ✓ OA (direct PDF) · ◐ UB (university licence) · ○ Fernleihe (paywalled or green landing page only, manual) · ✗ (no copy located). No shared library was available for this review, so every source is net-new. “Green” means a repository copy exists without a stable direct PDF URL; do not guess the URL.

**Counts:** 30 candidates — A 16, B 11, C 3. Peer-reviewed journal articles: 26. Conference/proceedings: 3 (Chia 2026, Jiang 2026, Uhde 2020). Preprint: 1 (Patel 2026).

---

## 2. Research question

Which solution method and fairness formulation fit a monthly roster of **4–6 doctors**, **2 on every night**, **≥14 night shifts per doctor**, one rest day after a night, two requested off days, hard coverage/off/rest/conflict/role rules, an optional **extra doctor** when the floor cannot otherwise be met, and manual drag-and-drop overrides — implemented client-side in vanilla JavaScript with no backend?

The question splits into four decisions:

1. exact (MILP / CP-SAT / column generation) or heuristic (construct + repair / local search);
2. how to define fairness when every doctor must reach a floor;
3. how to treat the extra doctor and the floor arithmetic;
4. how to keep manual overrides valid and explain the result.

---

## 3. The arithmetic that shapes the method

With N nights and 2 doctors per night there are `2N` night slots. The 14-shift floor requires `14 × D` doctor-nights.

| Team | 30-night slots | Floor required | Verdict |
|---|---:|---:|---|
| 4 doctors | 60 | 56 | feasible; no extra doctor |
| 5 doctors | 60 | 70 | needs 10 extra-doctor nights |
| 6 doctors | 60 | 84 | needs 24 extra-doctor nights |
| 4 doctors, 28 nights | 56 | 56 | exactly tight |
| 5 doctors, 31 nights | 62 | 70 | needs 8 extras |

This is the single most important finding for the implementation: **the 14-floor is not a per-doctor constant that fits every team size**. It is feasible only because the optional third doctor supplies the missing slots, or because the team is 4. The scout independently flagged the same arithmetic. Breugem (2022) is the relevant source for whether equal treatment is always desirable; Martin (2013) and Zhong (2017) give the fairness measures to use once totals are fixed.

---

## 4. Primary sources — the core corpus

**Reviews and vocabulary.** Erhard et al. (2018) is the physician-specific review; Burke et al. (2004) and Cheang et al. (2003) define the hard/soft constraint vocabulary; Ernst et al. (2004) and Van den Bergh et al. (2013) place the problem in the wider personnel-scheduling family; Ngoo et al. (2022) updates the method map to 2021; Min et al. (2026) covers the clinical AI literature.

**Exact methods.** Legrain et al. (2020) solve rotations by branch-and-price; Guo & Bard (2022) handle a midterm horizon with preferences and overtime; Bard & Purnomo (2005) is the seminal preference/column-generation formulation. These are the strongest references if the floor and rest rules are encoded exactly.

**Heuristics.** Dowsland (1998) is the foundational tabu/strategic-oscillation paper; Ceschia et al. (2020) is the state-of-the-art large-neighbourhood simulated annealing for the INRC-II benchmark; Burke, Li & Qu (2010) combine integer programming with variable neighbourhood search for highly constrained instances.

**Fairness.** Martin et al. (2013) optimise fairness directly with cooperative search; Zhong et al. (2017) target weekend-workload fairness with a two-stage heuristic; Breugem et al. (2022) formalise the fairness/attractiveness trade-off.

**Overrides and interaction.** Wickert et al. (2019) formalise rerostering after disruption; Gradišar et al. (2022) describe an interactive method for a nurse manager who must intervene.

**Acceptance and explanation.** Mihaylov et al. (2016) on the manual-to-automated transition; Renggli et al. (2025) and Gerlach et al. (2025) on what nurses want from AI scheduling; O'Connell et al. (2024) on e-rostering outcomes; Böðvarsdóttir et al. (2020) on tuning soft-constraint weights.

**Benchmark.** Ceschia et al. (2018) defines INRC-II, the standard public benchmark.

---

## 5. Debates and disagreements

**Exact vs heuristic.** The exact camp (Legrain; Guo & Bard; Bard & Purnomo) argues for optimality and provable feasibility; the heuristic camp (Dowsland; Ceschia; Burke) argues that real rosters have unformalised preferences and that near-optimal local search is more usable. At 4–6 doctors the instances are small enough for exact methods in principle, but a browser cannot run a mature CP-SAT/MILP solver without a backend or WASM build. The literature does not settle a winner; Ngoo (2022) finds no universal best method.

**Equality vs equity.** Breugem (2022) shows that strict equality can reduce individual attractiveness; seniority, part-time contracts and off-day preferences create legitimate differences. A flat "everyone exactly 14" rule is a policy choice, not a mathematical necessity.

**Hard vs soft constraints.** Burke (2004) and the INRC-II rules treat most rules as penalised soft constraints; Erhard (2018) notes that legal rules are hard while preferences are soft. The disagreement matters for the floor: making it hard forces refusal or extra doctors; making it soft allows a near-floor roster with a visible penalty.

**Preferences vs fairness.** Bard & Purnomo optimise preference satisfaction; Martin and Zhong optimise fairness. The clinical studies (Renggli; Gerlach; O'Connell) report that staff value both, but trust fairness and transparency more than a black-box optimum.

**Automation vs control.** Mihaylov and O'Connell document failed or resisted automation; Gradišar and Wickert argue for human-in-the-loop repair rather than full regeneration.

---

## 6. Methods — what fits this problem

### 6.1 Exact: CP-SAT (best exact fit, thin evidence)
CP-SAT handles finite-domain constraints, one-shift-per-day, coverage, off/rest, conflicts and lexicographic objectives well. The peer-reviewed evidence for **small hospital rosters** is thin: Chia et al. (2026, conference) and Jiang et al. (2026, proceedings) are recent and small; Patel et al. (2026) is an arXiv preprint. There is **no mature peer-reviewed CP-SAT reference for 4–6 doctor wards**. OR-Tools has no official JavaScript API; a backend or WASM service is an architectural change. Recommendation: use CP-SAT as a **fallback service** if constraints grow beyond what local search can satisfy, not as the first implementation.

### 6.2 Exact: MILP / column generation
Legrain (2020), Guo & Bard (2022) and Bard & Purnomo (2005) are the strongest formulations. Column generation over rotations is elegant when nights repeat in patterns, but it is overkill for 5 doctors and harder to explain to a head nurse than a local-search move log.

### 6.3 Construct + repair / local search (best in-browser fit)
Dowsland (1998), Ceschia (2020), Burke (2010) and Zhong (2017) support a **deterministic constructive pass followed by local search**:
1. place the scarce nights (weekends/holidays) first;
2. choose the eligible doctor with the lowest night count, then lowest weekend burden, then longest rest;
3. repair floor shortfalls by swapping or relocating;
4. accept only lexicographic improvements.
This is the recommendation for the browser app. It is explainable (a move log), supports manual locks, and is fast at 4–6 doctors. Ceschia (2020) shows that large-neighbourhood local search is competitive with exact methods on monthly instances.

### 6.4 Fairness formulation
- Score **weighted undesirable load**, not raw totals: night > weekend/holiday > ordinary duty.
- Primary: min–max night spread; secondary: CV/Gini; tertiary: weekend/holiday spread.
- Keep a per-doctor ledger (nights, weekends, holidays, extras, rest, off, floor gap).
- If contracts differ, use seniority/part-time weights (Breugem) rather than forcing equality.
- When every doctor has the same total, raw-total variance is meaningless; balance the **composition** of the 14 (Martin; Zhong).

### 6.5 Overrides and rerostering
Wickert (2019) and Gradišar (2022) support the design choice already made: a manual edit should be **validated against every hard rule and the floor**, then the affected cells repaired — not a full regeneration. A rejected edit must name the rule it breaks.

---

## 7. Open access and acquisition

Direct OA PDFs are available for: Burke 2004, Van den Bergh 2013, Ngoo 2022, Martin 2013, Wickert 2019, Böðvarsdóttir 2020, Mihaylov 2016, Jiang 2026, Patel 2026 (preprint), Renggli 2025, Gerlach 2025, Booker 2024, Uhde 2020.

Green repository copies (landing page only, no stable PDF URL): Cheang 2003, Legrain 2020, Breugem 2022.

Paywalled / manual worklist (○ Fernleihe): Erhard 2018, Ernst 2004, Guo & Bard 2022, Bard & Purnomo 2005, Dowsland 1998, Ceschia 2018, Ceschia 2020, Gradišar 2022, Stolletz & Brunner 2012, Zhong 2017, Chia 2026, Min 2026, O'Connell 2024, Burke 2010.

The A+B set is **27 sources**; 11 have direct OA PDFs. `acquire-sources` can fetch those and write the manual worklist for the rest.

---

## 8. Gaps

1. **CP-SAT for small hospital rosters is thin.** Only two recent conference/proceedings papers and one preprint; no mature peer-reviewed reference.
2. **Small-team rostering is under-studied.** Most nurse-rostering instances have 20–60 staff; 4–6 doctors is a different regime.
3. **A hard floor plus extra coverage is under-theorised.** The literature treats quotas as caps or soft targets; a contractual minimum that forces extra staffing is not a standard benchmark.
4. **Fairness with unequal contracts/part-time work** is discussed by Breugem but rarely operationalised in small tools.
5. **Manual overrides under hard constraints** are covered by Wickert/Gradišar, but not with a floor constraint.
6. **Thai / Southeast Asian hospital rostering** is absent from the English OR corpus.
7. **Explainability of the chosen roster** is a clinical-informatics concern (Renggli; Gerlach; Uhde) but not an OR benchmark criterion.

---

## 9. Recommended reading order

1. **Orientation:** Erhard 2018 (physician-specific), Ngoo 2022 (method map).
2. **Vocabulary:** Burke 2004, Cheang 2003.
3. **Fairness:** Martin 2013, Zhong 2017, Breugem 2022.
4. **Construct + repair:** Dowsland 1998, Ceschia 2020, Burke 2010.
5. **Exact methods (if needed):** Legrain 2020, Guo & Bard 2022.
6. **CP-SAT (flagged):** Chia 2026, Jiang 2026, Patel 2026.
7. **Overrides/interaction:** Wickert 2019, Gradišar 2022.
8. **Acceptance/explanation:** Mihaylov 2016, Renggli 2025, Gerlach 2025, O'Connell 2024.
9. **Weight tuning:** Böðvarsdóttir 2020.
10. **Benchmark:** Ceschia 2018 (INRC-II).

---

## 10. Follow-up searches

- German-language OR proceedings (GOR) on physician scheduling — not covered here; the field is English-dominated but a German angle may exist.
- “CP-SAT” + “physician” / “small hospital” — the current query returned only four works; a targeted search of IEEE/INFORMS proceedings may help.
- Thai/Southeast Asian hospital rostering and on-call scheduling.
- Multi-month carry-over and fairness across months (the current corpus is single-horizon).
- Fatigue/rest regulations (Booker 2024 is context, not a method).
- Free-text “on-call” scheduling, which is often indexed differently from “rostering”.

---

## 11. BibTeX overview

All 30 entries are in `output/bibtex/references.bib` with keys `firstauthor+year` (`erhard2018`, `burke2004`, …). `legrain2020` is the 2020 volume (online 2019); `gradisar2022` is cited by online year, with the issue year 2023 noted in the entry. `patel2026` is `@misc` arXiv. `jiang2026` is `@article` in *Engineering Proceedings* (MDPI), not IEEE Xplore. `chia2026` and `uhde2020` are `@inproceedings`.

---

## 12. Bottom line for this project

- **Recommended:** deterministic **construct + repair/local search** in vanilla JS, with hard coverage/off/rest/conflict/role/floor rules, a per-doctor ledger, and a lexicographic score (hard violations → floor → night spread → weekend/holiday spread → total). This matches Dowsland, Ceschia, Burke and Zhong, and is the only approach that stays offline and explainable.
- **Floor:** treat 14 as a hard minimum, compute the extra-doctor plan from `14D − 2N` (or refuse), and never relax rest to hit it. The arithmetic is in §3; Breugem/Martin/Zhong inform the fairness once totals are fixed.
- **CP-SAT:** keep as a fallback behind a small service only if constraints grow; the peer-reviewed evidence for small wards is not yet strong enough to justify the architectural cost.
- **Overrides:** validate and repair locally (Wickert; Gradišar); never regenerate the whole roster for one edit.
