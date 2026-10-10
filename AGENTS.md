# VirtuSP project guidance

Read `docs/HANDOFF.md` before continuing implementation. It contains current findings, remaining work and the server disclosure invariants. Read `docs/SETUP.md` for local credentials and run `npm test` after consequential changes.

Use synthetic data. Keep secrets and recovery/evaluation artifacts ignored. Preserve original organizer data and immutable versions. Do not add patient-specific engine code, disclose hidden values to the dialogue model, replace unknown medical information with negatives, or portray automated tests as clinical validation.

Update the handoff when reaching a tested checkpoint. Do not overwrite teammates' uncommitted work or rewrite shared Git history.
