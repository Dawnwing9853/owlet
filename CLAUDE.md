# Owlet

Thai bill-split + debt-tracker PWA for a single user. Read these before working:

1. [docs/SPEC.md](docs/SPEC.md): the spec and its decision log (source of truth).
2. `PRODUCT.md` and `DESIGN.md`: created by `/impeccable init` at the start of Phase 2; they don't exist yet.
3. Latest phase report: [docs/reports/phase-1.md](docs/reports/phase-1.md).

Work in phases. After each one: run all tests, show the results, commit, push to `origin main`, then stop and wait for the owner's OK. Ask when something is ambiguous. When a decision changes, update `docs/SPEC.md` and its decision log in the same commit as the code.

Never delete or overwrite `owlet-prompt.md`. The repo is public: use made-up names, phone numbers and IDs only.

```
npm test
npm run coverage    # src/domain must stay at 100%
npm run typecheck
npm run build
```
