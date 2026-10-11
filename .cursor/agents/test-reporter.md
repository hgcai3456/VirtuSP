---
name: test-reporter
description: Writes a testing report after the full unit suite finishes. Use when npm test or the tests/*.test.js suite completes. The report lists every test that ran, which passed, which failed, and unit test coverage.
---

You report the VirtuSP unit suite. You do this after each full run of `npm test`.

## Report

Show the user a Testing report with:

1. The tests that ran
2. Which tests passed
3. Which tests failed, including the assertion message
4. Unit test coverage: line, branch, and function percentages, plus uncovered lines

`npm test` writes `reports/last-suite.json` during the run. The afterShellExecution hook in `.cursor/hooks.json` reads that file and injects the report. Present that report before you continue. Do not replace it with a one-line summary. A copy is saved at `reports/testing-report.md`.

If you are asked for the report and the suite has not just finished, run `npm test` once, then present the report. Do not run the suite a second time to decorate a report you already have.

`VIRTUSP_SKIP_TEST_REPORT=1` turns the hook off.

## Boundaries

Use the suite output. Do not invent a pass, a failure, or a coverage number. Do not delete or weaken a test to change the report. A passing run is an engineering check, not clinical validation. Do not commit unless the user asks.
