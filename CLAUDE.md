# Owlet

Thai bill-split + debt-tracker PWA for a single user. Read these before working:

1. [docs/SPEC.md](docs/SPEC.md): the spec and its decision log (source of truth).
2. [PRODUCT.md](PRODUCT.md): product context, from `/impeccable init`. `DESIGN.md` doesn't exist yet.
3. Latest phase report: [docs/reports/phase-2.md](docs/reports/phase-2.md) (Phase 2 is not finished). Phase 1 review: [docs/reviews/phase-1-review.md](docs/reviews/phase-1-review.md).

Work in phases. After each one: run all tests, show the results, commit, push to `origin main`, then stop and wait for the owner's OK. Ask when something is ambiguous. When a decision changes, update `docs/SPEC.md` and its decision log in the same commit as the code.

Never delete or overwrite `owlet-prompt.md`. The repo is public: use made-up names, phone numbers and IDs only.

```
npm test
npm run coverage    # src/domain must stay at 100%
npm run typecheck
npm run build
```
