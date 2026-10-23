# NOVA repository instructions

- Use the existing checkout. Do not create a Git worktree unless the user explicitly requests one.
- Read `docs/SPEC.md` before changing user-visible behavior. It is the living functional specification, based on the originally supplied v0.24 document.
- The user requires ongoing specification maintenance: update the relevant SPEC rules, flows, and acceptance criteria in the same change and commit as every behavior change. For requirements changes, increment the SPEC version, set its update date in Asia/Seoul, and append a concise revision-history entry. Do not record a new feature only in the history while leaving contradictory older rules in the body.
- Keep specification, application, and JSON schema versions distinct. Update `docs/SCHEMA.md`, `docs/VALIDATION.md`, and `README.md` when affected. Preserve existing agreed exclusions unless the user changes scope.
- Ship a self-contained offline `dist/NOVA.html`, rebuilt from source. Preserve compatibility with existing user JSON and the boundary between popup drafts, session edits, manual file saving, and startup cleanup.
- Run checks appropriate to the behavior changed. Documentation-only edits need consistency and diff checks; do not claim new application/VDI verification. Cloud tests do not establish Windows VDI validation.
- Keep user data (`nova-data.json`), dependencies, and test outputs out of Git. Never publish user data as a fixture without explicit authorization.
