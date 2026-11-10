# Research Log — doctor-scheduler

## 2026-11-10 — Literature review: algorithms for small physician duty rostering

- Query: algorithms for a 4–6 doctor, 2-per-night, 28–31 night roster with a ≥14-night floor, rest/off constraints, optional extra doctor, fairness, manual overrides, vanilla JS.
- Scope: operations research / healthcare scheduling, 1998–2026, English; search only (no PDFs).
- Databases: OpenAlex, Crossref, PubMed, arXiv. Semantic Scholar rate-limited; CORE/BASE not queried (API keys). No shared library available.
- Result: 30 candidates — A 16, B 11, C 3; 23 peer-reviewed journal articles, 4 conference/proceedings, 1 preprint.
- Guide: `input/bibliography/literaturguide.md`
- BibTeX: `output/bibtex/references.bib` (30 entries)
- Audit log: `input/bibliography/audit-log-2026-11-10.json`
- Key finding: the ≥14-night floor is arithmetically tight (4 doctors need 56 of 56–62 slots; 5 need 70; 6 need 84), so the optional extra-doctor plan or a scaled floor is required. Recommended in-browser method: deterministic construct + repair/local search; CP-SAT is the exact fallback, with thin peer-reviewed evidence for small wards.

## [2026-11-10] acquire | A+B sources
- Downloaded 9, already present 0, manual 18, skipped 0 (of 27 A+B)
- Manual worklist: [[acquisition-todo]] (18 items)
- Audit: input/bibliography/acquisition-log-2026-11-10.json
- Library: `input/library/pdf/` (project-local; configured in `.research-library`)
