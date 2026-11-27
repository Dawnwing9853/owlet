# Phase 2 mid-phase review (independent, from the chat side)

Read this together with `docs/reviews/phase-1-review.md` before continuing P2.
Reviewer re-ran the suite in a clean copy: 261/261 pass, typecheck and lint clean. Mutation, coverage and build were not re-run.
The interim `docs/reports/phase-2.md` is honest and clear. Storage work is solid; the P2 "done when" is not met yet (no UI).

## Git rule (owner, 2026-11-27)
- **At the end of every phase: run all tests, commit, push to `origin main`, then stop and wait for the owner's OK.** This was already in `docs/SPEC.md`; the owner reaffirmed it. Record it in the Decision log.
- Right now all P2 work is uncommitted and exists only on this laptop. Mid-phase checkpoint commits (e.g. a `p2-wip` branch) were suggested but are **not approved yet**. Ask the owner; don't do it on your own.
- Before the first commit of P2, ask the owner to confirm `git config user.name` / `user.email` show his own name and GitHub noreply email.

## Fix before building UI
1. **Referential integrity on load.** `parseStore` accepts entries that point at people or groups that don't exist. Reviewer test: a loan to `ghost`, a bill whose `owed` names an unknown person, and an unknown `groupId` all loaded with an empty quarantine, and balances showed `ghost: -570`.
   - Every person id in a bill (`items[].sharedBy`, `payers`, `owed`), loan and repay, and every group `memberIds`, must exist in `people`.
   - This is only about damaged stored data. Normal use is unchanged: the people chosen on an item are the people it is split between (3 names → ÷3, 4 names → ÷4), and only people that exist can be chosen.
   - Don't quarantine the entry (that would silently drop money). Recreate the missing person under the same id, the same idea as recreating `me`:
     1. If a quarantined person record has that id and a usable `name` string, reuse that name.
     2. Otherwise name it "(ไม่ทราบชื่อ)" and flag it, so the owner can rename it in ตั้งค่า.
   - An unknown `groupId` → show as "ไม่มีกลุ่ม", keep the raw value.
   - Tests + a property: after `parseStore`, every id the ledger can return has a person record.
2. **Quarantine must be visible wherever money is shown.** A quarantined bill drops out of balances, so home would under-report what people owe. Build in P2 (with the error boundary): a persistent banner "มี X รายการที่อ่านไม่ได้ ยอดอาจไม่ครบ" with a way to see `describeQuarantined` details and export raw data. Include it in `/impeccable shape`.
3. **Mutation testing must cover `src/storage`.** Add `src/storage/**/*.ts` (minus tests) to `mutate` in `stryker.config.json`; report the score and survivors in the phase report. `parse.ts` is now the riskiest code.
4. **Narrow oracle for the common case.** The reviewer's `items + 4` bound was wrong (service/VAT scale per-item rounding); the developer's formula is right. It is loose, though (~24 satang at 8 items). Add a second property: bills with no service and no VAT stay within `items.length + 1` satang of the exact value.

## New feature, owner approved: person colors (up to 30 people)
Owner wants each friend's name in its own color (like Jabont CheckBill) so big groups are easy to tell apart. Plan for up to 30 people. Add to the Decision log.
1. `Person.colorSlot?: number` (integer 0–29, optional). Store the slot, never a hex value, so the palette can change later.
2. 30 slots = 15 hues × 2 styles. Slots 0–14 are **soft** chips (light background, dark text of the same hue). Slots 15–29 are **solid** chips of the same 15 hues (medium-dark background, white text). Soft and solid look clearly different, so two people sharing a hue are still told apart.
3. Assign in `addPerson`: the slot used least among non-archived people; among ties, prefer soft slots (0–14), then random. So the first 15 friends get 15 different soft colors, friends 16–30 get solid ones, and only after 30 active friends do slots repeat. Never pick colors at render time.
4. Missing or invalid `colorSlot` → fall back to `hash(id) % 30`. A decorative field must never send a person to quarantine. No migration needed.
5. Colors are CSS variables in `index.css` (`--person-N-bg`, `--person-N-fg`). Add a test that every pair is at least 6:1 contrast (all pairs below pass).

| Hue | Soft slot: background / text (contrast) | Solid slot: background / text (contrast) |
|---|---|---|
| 60 amber | 0: `#FFE1C7` / `#673200` (8.3) | 15: `#864900` / `#FFFFFF` (7.1) |
| 80 ochre | 1: `#FAE5C3` / `#5E3A00` (8.2) | 16: `#7B5200` / `#FFFFFF` (6.9) |
| 100 mustard | 2: `#EFE9C3` / `#4F4200` (8.1) | 17: `#6A5B00` / `#FFFFFF` (6.8) |
| 155 green | 3: `#CFF2DA` / `#005129` (7.9) | 18: `#106C3E` / `#FFFFFF` (6.5) |
| 175 teal | 4: `#C6F3E6` / `#00533F` (7.5) | 19: `#006E57` / `#FFFFFF` (6.2) |
| 195 cyan | 5: `#C2F3F2` / `#005153` (7.6) | 20: `#006D6E` / `#FFFFFF` (6.2) |
| 215 sky | 6: `#C3F1FD` / `#004E63` (7.6) | 21: `#006981` / `#FFFFFF` (6.3) |
| 235 blue | 7: `#C9EEFF` / `#00496F` (7.9) | 22: `#00638F` / `#FFFFFF` (6.6) |
| 255 indigo | 8: `#D2EAFF` / `#174276` (8.2) | 23: `#2B5C97` / `#FFFFFF` (6.8) |
| 275 violet | 9: `#DEE6FF` / `#343C77` (8.2) | 24: `#4A5498` / `#FFFFFF` (7.0) |
| 295 purple | 10: `#EAE2FF` / `#473571` (8.3) | 25: `#604C91` / `#FFFFFF` (7.1) |
| 315 plum | 11: `#F5DEFF` / `#562F66` (8.4) | 26: `#724685` / `#FFFFFF` (7.2) |
| 335 magenta | 12: `#FEDCF5` / `#612B57` (8.4) | 27: `#7F4073` / `#FFFFFF` (7.3) |
| 355 pink | 13: `#FFDBE9` / `#692845` (8.3) | 28: `#893D5E` / `#FFFFFF` (7.3) |
| 10 rose | 14: `#FFDBE0` / `#6D2736` (8.3) | 29: `#8D3D4D` / `#FFFFFF` (7.2) |

(Soft: `oklch(0.93 0.05 h)` / `oklch(0.38 0.10 h)`. Solid: `oklch(0.47 0.11 h)` / white. Hues 15–50 and 112–140 are left out on purpose: they sit next to debt rust (hue ~34) and paid olive (hue ~130).)

6. Show as chips (thin border of the same hue) in the item "who shares" picker, the payers section and person lists. The name is always shown; minimum 16px. Past about 15 colors some look alike; the name, not the color, is what identifies a person.
7. Me (`me`) is not a slot: owl brown chip with the label "เรา".
8. Never use person colors for amounts or status, and never use debt rust or paid olive for people. Risky slots to screenshot for the owner: 15 (close to owl brown), 18 (green, near "paid"), 29 and 14 (near rust). Put each next to a debt amount, a "paid" state and the "เรา" chip at 375px; if any reads as status or as me, propose a replacement hue and tell the owner.
9. The share image/receipt stays black-and-white (thermal look) for now; the owner decides later.

## Fonts: confirmed, no further review
Owner has seen Mitr (all text) + Noto Sans Thai (money amounts) and confirmed the pair. Don't send another comparison. Owner confirmed: person names are at least 16px everywhere. Still to do: subset both self-hosted fonts to Thai + Latin and report the bundle size (the app must work offline).

## Smaller notes
- Font packages were downloaded outside the approved list (temp folder, install scripts off, disclosed). Low risk; ask first next time.
- The Impeccable design hook runs its engine without a sandbox. The SHA-256 check proves the file wasn't corrupted, not that the source is safe. Owner approved; noted.
- `newId` accepts only `p` / `b` / `i`. P3 needs ids for loans and repays.
- An invalid `myPromptPayId` quarantines the whole settings object and loses `lastBackupAt` too. Quarantine only the bad field. Fix in P3.

## Phase 2 report must add
Integrity handling (test names), the quarantine banner (screenshot), storage mutation score + survivors, the narrow oracle result, the person-color contrast test, and screenshots of the risky color slots.
