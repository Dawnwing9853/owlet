# Phase 1 review (independent, from the chat side)

Read this BEFORE starting P2. Reviewer re-ran the suite in a clean copy: 159/159 pass, matches `docs/reports/phase-1.md`.
Rules still apply: don't add features outside `docs/SPEC.md`; anything marked "needs owner OK" must be asked, not assumed.

## Verdict
P1 is trustworthy. Strongest: `ledger.test.ts` (satang-leak case, order independence, delete reverts, home = sum of groups).
PromptPay uses published reference vectors, not self-made ones. Weakest: `summary.test.ts`.
A float oracle over 5,000 random bills found no wrong per-person amounts; the worst gap to the exact value was ~5 satang on a 6-item bill, which is the expected effect of rounding each item (per spec).

## Must do in P2 (storage layer)
1. **Never let a corrupted entry crash the app.** `entryDebts` throws `RangeError` when a bill does not balance. One bad record in localStorage or an imported file would break the home screen.
   - zod refinement on load AND import: Σ`payers` = Σ`owed` for every bill; `date` matches `^\d{4}-\d{2}-\d{2}$` and is a real calendar date; every amount passes `isAmount`.
   - Tests: a corrupted bill is rejected or quarantined with a clear Thai message, and the rest of the data still loads.
   - Add an error boundary so a thrown error shows a recovery screen (export raw data, reset), not a white page.
2. **MoneyInput must not fail silently.** `parseBaht('1,5')` returns `null`. Some Android keyboards send `,` as the decimal mark under `inputmode="decimal"`.
   - Show an inline error for invalid input; never leave the field blank or treat it as 0.
   - Decide (and test) whether a lone `,` followed by 1–2 digits is accepted as a decimal. Needs owner OK if you change `parseBaht`.
   - Real-device check on Android is on the owner's list for P2 review.
3. **`finalizeBill` must still be the only way a bill gets saved.** The UI may not build `owed` itself.

## Test gaps to close (domain only, no behaviour change)
4. **Independent oracle for per-person amounts.** Existing properties are mostly "sums stay equal", which largest-remainder satisfies by construction. Add a property: each person's `owed` is within `items.length + 4` satang of the exact rational value (BigInt or fraction arithmetic, not floats; skip huge totals if you use floats). Expect it to pass today; it exists to catch a future wrong proportion.
5. **Mutation testing on `src/domain`.** Add Stryker (dev dependency, phase-gated install is fine). Report the mutation score and list surviving mutants in `docs/reports/phase-2.md`. Kill the ones that matter (money, split, ledger); explain the rest. Coverage is 100% but coverage is not strength.
6. **Check-digit test depends on one sample ID.** The "9 typos pass" assertions only hold for `1234567890121`. Replace them with a property over generated valid IDs: a wrong 13th digit is always rejected; any typo in the 3rd digit (weight 11) is always accepted; every other single-digit typo is accepted only when the mod-11 sum lands on a residue pair that maps to the same check digit (residues 0 and 10 both give 1). Measure the real accepted rate over many IDs and put the number in the report, so the decision-log figure ("about 9%") is checked, not copied.
7. **`summary.test.ts` property is weak.** It only runs for `2026-01` and the generator dates cover 3 months. Run it for each month the generator can produce, and add: entries outside the month never change the totals; totals equal a naive recomputation from `entries.filter(...)`.

## Spec questions that surfaced (do not build until the owner answers)
- A. **Cash out ("เงินที่ควักออกไป")** ignores money I pay back to others, though real cash left my account. Option: show it as a separate line in สรุปเดือน. Needs owner OK.
- B. **Prices that already include VAT.** Many Thai shops print VAT-inclusive prices; the app only adds VAT on top. Decide before the หารบิล UI is shaped. Needs owner OK.

## Decisions waiting for the owner (from phase-1 report). Ask, don't assume.
| Item | Reviewer's recommendation | Status |
|---|---|---|
| Install the npm dependency unslop is missing; let Impeccable download its engine | OK if from the normal registry | pending owner |
| Limits ฿999,999,999.99 per amount and bill; service 0–100% | Keep | pending owner |
| Payee-name check field in settings (new feature, softens the check-digit gap) | Add | pending owner |
| P3: net repayment across groups vs. "ได้คืน" inflation; overpayment; oldest-first filing | decide at start of P3 | later |
| P4: turning simplify off after repaying along simplified routes brings debts back; warn or block | decide at start of P4 | later |

## Phase 2 report must include
Mutation score + survivors, the new oracle property result, how corrupted data is handled (with the test names), and the answers recorded in the Decision log of `docs/SPEC.md` (date · decision · reason).
