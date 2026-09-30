# Source coverage and 100-promotion evaluation

Authorized 2026-09-30: implement the remaining source coverage and expand the reviewed extraction sample to at least 100 promotions. User permits verified replacements within the same market category. Preserve retired identities and exactly 50 active sources.

- [x] Recheck all existing website channels through the production HTTPS and robots boundaries.
- [x] Investigate alternative permitted listing paths and verified comparable replacements; nine replacements verified and enabled.
- [x] Add thirteen further supported adapters with recorded evidence, regression tests and live verification (22 total).
- [ ] Complete all 50 active integrations; 28 still require extraction contracts or verified comparable replacements.
- [x] Expand independently reviewed annotations to at least 100 distinct promotions, including campaign dates/terms and negative examples.
- [x] Make evaluation reject duplicate annotations and measure false positives as well as missing/incorrect fields.
- [x] Verify deterministic quality gates and PostgreSQL publication/idempotency.
- [x] Update the source assessment with enabled replacements and concrete remaining blockers.

Do not count an accessible website, historical campaign, or unsupported adapter as working coverage. Do not invent current promotion data or relax fetch protections to reach the target.

Verification: 135 reviewed promotions, 1,351 matching fields and 18 excluded negative examples. PostgreSQL publication/idempotency covers 289 offers from all 22 adapters in three bounded groups. Integration coverage passes all eight tests at 90.47% lines. Full coverage is an outstanding requirement, not marked complete.

Final deterministic gate: `corepack pnpm check` passed 268 tests with 94.84% total line coverage and all per-file gates. Registry validation passed with exactly 50 active sources among 59 records. No dependency or quality-threshold changes were introduced.
