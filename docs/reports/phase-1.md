# Phase 1 report: project setup + money logic

2026-11-27. There is no UI yet, so there are no screenshots or Impeccable findings.

## What was built
- Vite 8.4, React 19.3, TypeScript 7.0 (strict), Tailwind 4.3, Vitest 5.1, fast-check 4.11. The app is a blank page.
- `docs/SPEC.md` (spec + decision log) and `CLAUDE.md`. `owlet-prompt.md` is unchanged.
- `src/domain`, which imports nothing from React, the DOM or storage:

| File | What it does |
|---|---|
| `types.ts` | Data model |
| `money.ts` | Reading baht input, `฿1,234.00` display, largest-remainder split |
| `split.ts` | Bill calculation, live-preview breakdown, save validation |
| `ledger.ts` | Who owes whom, per-group simplify, overall and per-person balances |
| `promptpay.ts` | ID validation, QR payload, CRC16 |
| `summary.ts` | Month summary, with totals and per-group figures |

zod, qrcode, html-to-image, the Mitr font, lucide-react and the PWA plugin will be installed in the phase that first uses them.

## Decisions
The owner's answers and the choices made around them are in the [decision log](../SPEC.md#decision-log). The main changes from the original prompt: no round-up, no `Bill.paid`, money always shows 2 decimals, and simplify is saved per group.

## Test results
| Check | Result |
|---|---|
| `npm test` | **159 / 159 passed** (money 57, split 28, ledger 27, promptpay 38, summary 9) |
| 30 repeated runs (new random property inputs each time) | 0 failed |
| `npm run coverage` on `src/domain` | **100%** statements 277/277, branches 150/150, functions 83/83, lines 217/217 |
| `npm run typecheck`, `npm run build`, `npm run lint` | Passed |

All the invariants in the spec have property tests: nets sum to 0 per entry and overall, deleting an entry reverts it, and Σpayers − Σowed stays 0. There are also properties for exact splits, home = sum of group views, simplify keeping every net, and entry order not mattering.

## Bugs the tests guard against
- **Satang leak between people.** Splitting each debtor across creditors independently can send every leftover satang to the same creditor, so pair balances stop matching what each person is owed. The ledger splits against what creditors are *still* owed. I put the bug back on purpose: 3 tests failed.
- **Total over the limit** (found by a property test during the build). Each price could be valid while the bill total exceeded the amount limit, so no payer entry could match it. This now has its own error, `total-too-large`.

## Things I'm unsure about
1. **The Thai ID check digit is weaker than I told you.** When I asked, I said it catches single-digit typos. In a simulation of 100,000 IDs it caught about **91%**. It can never catch a wrong **3rd digit** (its weight is 11, and the check is mod 11), and it misses about 1.8% of typos in other digits except the last. It's still worth keeping, but the real safeguard is checking the **payee name** your bank app shows when you scan your own QR. I suggest the settings screen asks you to do that once (a new feature, so only if you say yes).
2. **QR payloads are not yet tested with a bank app.** Phone, e-wallet and amount payloads match the published test vectors of `dtinth/promptpay-qr` exactly. Its two 13-digit examples fail the Thai check digit, so they only test the CRC. The national ID payload is checked for the same layout with a made-up valid ID. Your manual scan in P3 is the real test.
3. **Limits I added:** amounts and bill totals up to ฿999,999,999.99, service charge 0–100%. Say if you want others.
4. **Input is strict about commas:** `1,234.50` is accepted, but `1,5` is rejected so it can't be read as 15.
5. **Leftover satang** always go to the smaller `personId` on a tie, so across many items the same person can pay a few satang more.

## To decide in later phases
- **P2:** OK to install unslop's missing npm dependency (its audit can't pass a project without it), and to let Impeccable download its engine and the `npx impeccable` package.
- **P3:** (a) If you owe each other in different groups, how should paying the **net** amount clear both without inflating "ได้คืน" in the month summary? (b) What happens on overpayment? The automatic oldest-first repayment filing is also built in P3.
- **P4:** Turning simplify **off** after repaying along simplified routes brings back debts that cancel out (a test records this). Warn, or block?

## Notes
- The GitHub repo is **public**. Tests use made-up names and IDs only.
- Lint skips the vendored Impeccable skill under `.claude/`.
