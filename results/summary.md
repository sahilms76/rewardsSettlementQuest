# Test run summary

Generated 2026-11-21T07:47:07.119Z on Node v24.19.0.

| Case | Faulty build (settlement.buggy.js) | Fixed build (settlement.fixed.js) |
|---|---|---|
| TC-01 | PASS | PASS |
| TC-02 | PASS | PASS |
| TC-03 | PASS | PASS |
| TC-04 | PASS | PASS |
| TC-05 | PASS | PASS |
| TC-06 | PASS | PASS |
| TC-07 | FAIL | PASS |
| TC-08 | FAIL | PASS |
| TC-09 | FAIL | PASS |
| TC-10 | FAIL | PASS |
| TC-11 | PASS | PASS |
| TC-12 | PASS | PASS |
| TC-13 | FAIL | PASS |

- Faulty build failures: TC-07, TC-08, TC-09, TC-10, TC-13 (expected TC-07, TC-08, TC-09, TC-10, TC-13)
- Fixed build failures: none
- Verdict: PASS: the regression detects DEF-001 and the fix resolves it
