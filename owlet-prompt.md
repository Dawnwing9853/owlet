# Build "Owlet" — Thai bill-split + debt-tracker PWA (single user)

App name: **Owlet** (owl + wallet). Theme: a detective owl who never forgets who owes whom.

You are building a mobile-first PWA for ONE user (me) to split restaurant/trip bills with friends and track who owes whom. Think "Jabont CheckBill (https://jabont.com/checkbill/) + Splitwise", fully in Thai. Friends never use the app; they only receive text/image summaries and pay me via PromptPay.

Work in phases (below). **After each phase: run all tests, show me the results, commit, push to `origin main`, then STOP and wait for my OK.**

This folder already contains files (this spec, git). **Never delete or overwrite existing files.** When scaffolding Vite, choose "Ignore files and continue" (or scaffold in a temp folder and move the files in) — never "Remove existing files". Do not add features outside this spec. If something is ambiguous, ask instead of guessing. Start Phase 1 in plan mode.

---

## Setup before P1 (I run these myself, then start you)
```bash
npx skills add pbakaus/impeccable --skill impeccable --agent claude-code   # design skill: /impeccable <command>
claude mcp add playwright npx @playwright/mcp@latest                       # lets you open the dev server and take screenshots
claude plugin marketplace add 0design/unslop-skill && claude plugin install unslop@unslop   # independent AI-slop auditor (audit only, needs Node 20+)
```
If `/impeccable` or Playwright is missing when you start, tell me — don't fake the UI review steps.
Do NOT also install Anthropic's `frontend-design` plugin: it overlaps with Impeccable and the two give conflicting instructions.

## Stack
- React + Vite + TypeScript (strict), Tailwind CSS
- Vitest for unit tests + `fast-check` for property-based tests on money logic
- `zod` for validating stored/imported data
- `qrcode` (npm) to render QR, `html-to-image` to export the receipt as PNG
- `vite-plugin-pwa` for manifest + offline
- Font: **Mitr** (rounded, loopless Thai) self-hosted via `@fontsource/mitr` so it works offline
- Deploy: GitHub Pages via GitHub Actions

## Folder layout
```
src/domain/     pure TS, no React: money, split, ledger, promptpay, summary  (100% unit-tested)
src/storage/    localStorage repository, zod schemas, migrations
src/features/   bill, balances, groups, summary, settings
src/ui/         shared components (Receipt, Chip, MoneyInput, BottomNav…)
```

## Money rules (non-negotiable)
- All money is **integer satang** (`type Satang = number`). Never floats. Convert only at input/display.
- Display: `฿1,234` or `฿1,234.50` (en-US digits, Thai UI text).
- Every split uses **largest-remainder** distribution so parts always sum exactly to the whole.
- Balances are **never stored**; they are always derived from entries.

## Data model
```ts
Person   { id, name, isMe: boolean, archived?: boolean }
Group    { id, name, memberIds: string[], createdAt, archived?: boolean }
BillItem { id, name, price: Satang, sharedBy: string[] }   // personIds
Bill     { kind:'bill', id, title, date, groupId?: string,
           items: BillItem[], payers: Record<personId, Satang>,
           servicePct: number /*default 10, toggle*/, vat: boolean /*7%*/,
           discount: Satang, roundUp: boolean, note?: string,
           // snapshot computed at save time — ledger uses this, so history never changes if the algorithm changes:
           owed: Record<personId, Satang>, paid: Record<personId, Satang> }
Loan     { kind:'loan', id, date, lenderId, borrowerId, amount: Satang, groupId?, note? }
Repay    { kind:'repay', id, date, fromId, toId, amount: Satang, groupId?, note? }
Settings { myPromptPayId?: string, lastBackupAt?: number, schemaVersion: number }
```
Groups are optional: an entry with no `groupId` is "ไม่มีกลุ่ม".

## Bill calculation (src/domain/split.ts)
Order, per person:
1. Each item's price split equally among `sharedBy` (largest remainder) → subtotal.
2. Discount spread proportionally to subtotals.
3. Service charge % on (subtotal − discount), if enabled.
4. VAT 7% on (subtotal − discount + service), if enabled.
5. If `roundUp`: ceil each person's owed to whole baht. The surplus (Σowed − real total) goes to the **payers, proportional to what each paid** (largest remainder), so Σpaid === Σowed always.
- Multiple payers: user enters how much each paid. Default = me paid everything. Block save if Σpayers ≠ real bill total, showing the difference.
- Items with nobody in `sharedBy` → warning, block save.
- No separate "equal split" mode: one item shared by everyone covers it. Add a quick action "หารเท่าทั้งบิล" that creates one item with all participants.

## Ledger (src/domain/ledger.ts)
- Per entry, compute each person's net (paid − owed). Within a bill, debtors owe creditors proportionally to creditors' positive net (deterministic). Loans/repays are direct pairs.
- Aggregate into pairwise debts, net each pair. Optional "ลดจำนวนการโอน" (greedy debt simplification), applied **within a group only**.
- Invariants to property-test: Σ net of all people = 0 for every entry and overall; deleting an entry fully reverts its effect; rounding never changes Σpaid − Σowed (= 0).

## PromptPay (src/domain/promptpay.ts)
- EMVCo payload: `000201`, `010212` (with amount), tag `29` { `0016A000000677010111`, `01` phone as `0066`+9 digits / `02` national ID 13 digits / `03` e-wallet 15 digits }, `5802TH`, `5303764`, `54` amount `x.xx`, then `6304` + CRC16-CCITT (poly 0x1021, init 0xFFFF, uppercase hex).
- Unit tests: CRC of "123456789" = `29B1`; payload structure for phone and 13-digit ID; reject invalid IDs.
- Solo app → QR is always MY PromptPay (set in ตั้งค่า), amount = what that friend owes me.

## Screens (Thai UI, bottom nav)
1. **ยอดค้าง** (home): two big numbers "คนอื่นติดเรา ฿…" / "เราติดคนอื่น ฿…" (debt rust). List per person (all groups combined). Tap a person → detail: entries, breakdown by group, actions: บันทึกคืนเงิน (partial allowed), แสดง QR, คัดลอกข้อความทวง. Button "+ บันทึกยืมเงิน".
2. **หารบิล**: title, optional group, participants (chips; add new friend inline), items (name, price, who shares — chips + "ทุกคน"), quick chips (อาหาร, เครื่องดื่ม, เบียร์, เหล้า, มิกเซอร์, น้ำแข็ง, ของหวาน), toggles: Service charge %, VAT 7%, ส่วนลด ฿, ปัดเศษขึ้น. Payers section. Live **receipt preview** with per-person totals and per-item breakdown. Save → goes into ledger. Edit/delete from history.
3. **กลุ่ม**: list, create, detail (members, entries, balances inside the group, simplify toggle, archive).
4. **สรุปเดือน**: month picker; numbers + simple CSS/SVG bars: ส่วนที่เรากินจริง (my owed), เงินที่ควักออกไป (my paid in bills + money lent), ให้ยืม / ได้คืน, breakdown by group.
5. **ตั้งค่า**: friends (rename, archive — can't archive with non-zero balance), my PromptPay ID, backup, history list.

## Sharing
- Text: copy to clipboard + LINE share link (check LINE's current share URL format). Text = title, total, each person's amount, my PromptPay.
- Image: render the Receipt component (with QR for my PromptPay) to PNG via `html-to-image`; use Web Share API with file on mobile, download fallback.

## Storage & backup
- localStorage through one repository module; zod-validate on load; `schemaVersion` + migration functions.
- Call `navigator.storage.persist()` on first run.
- Export JSON `{ schemaVersion, exportedAt, data }`; Import: validate, show counts preview, confirm, replace.
- Banner "ยังไม่ได้ backup มา X วัน" when lastBackupAt > 7 days (dismissable for a day).

## Design brief: "detective owl, minimal receipt" (input for Impeccable, not a substitute for it)
Feed this into `/impeccable init` and `/impeccable shape`. Impeccable may refine details, but these are fixed constraints:
- Register: **product** (app UI / tool), not brand/marketing.
- Users: me, a Thai university student, using it on my phone at the restaurant table, often one-handed, in a hurry. Speed of entering a bill matters more than visual flair.
- **Light mode only** (intentional — tell Impeccable so it doesn't flag missing dark mode). Set `color-scheme: light`.
- Palette (owl feathers + gold coins). All text pairs below pass WCAG AA on the background:
  | Token | Hex | Use |
  |---|---|---|
  | bg (parchment) | `#FBF7F1` | page background — near-white, NOT yellow cream |
  | ink (espresso) | `#2B1D14` | body text (15.3:1) |
  | primary (owl brown) | `#6B4A2F` | primary buttons, white text on it (7.9:1) |
  | line (feather tan) | `#B8916A` | borders/dividers ONLY — never text (2.7:1) |
  | gold (coin) | `#D4A017` | coins, highlights, icon accents — shapes ONLY, never text on light bg (2.2:1); espresso text on gold is fine (6.9:1) |
  | gold-text | `#8A6508` | when text must look gold (5.0:1) |
  | debt (rust) | `#B23A1E` | money owed (5.6:1) |
  | paid (olive) | `#4F6B2E` | settled / cleared (5.7:1) |
- Owl lives in the details (mascot, empty states, coin-gold numbers), not in brown everywhere. Avoid the coffee-shop / luxury brown-gold-cream look.
- Big tabular numerals for amounts. The receipt preview looks like a thermal receipt: dashed separators, zigzag bottom edge.
- Typography: **Mitr** for everything. Check line-height for Thai vowels/tone marks (no clipped marks); test real Thai strings, not lorem ipsum.
  - Mitr has look-alike glyphs (ก ถ ภ, บ ป, ข ช). Test short friend names with these letters at 14px; if they're hard to tell apart, tell me and propose LINE Seed Sans TH (OFL, self-host) instead.
  - Check whether Mitr supports tabular figures (`font-variant-numeric: tabular-nums`). If not, use a rounded Latin font that does, for money amounts only, and tell me which one.
- Mobile-first, 44px touch targets, 16px inputs (no iOS zoom), `inputmode="decimal"` for money, visible focus, safe-area insets, WCAG AA contrast.
- No emoji icons in UI; use a small icon set (lucide-react).

## UI/UX workflow with skills
Impeccable's command set changes between versions: run `/impeccable` alone first to see the list, and if a command below is missing, use the closest one and tell me.
| When | Do |
|---|---|
| Start of P2 (once) | `/impeccable init` → writes PRODUCT.md (+ DESIGN.md) from the brief above. Ask me its questions; don't invent answers. |
| Before building each new screen | `/impeccable shape <screen>` → show me the brief, wait for my OK, then build |
| After each screen works | Open it with Playwright at 375px and 1280px, screenshot. Then `/impeccable critique <screen>` and `/impeccable audit <screen>`; fix everything rated high/critical |
| P3 and P5 | `/impeccable harden` on flows with input: empty states, invalid amounts, long Thai names, 0-baht items, huge bills |
| After every UI change | `npx impeccable detect src/` and `npx impeccable detect <dev-server URL>` (deterministic anti-pattern detector). Zero findings, or a written reason for each ignore in `.impeccable/config.json`. If Impeccable's design hooks are available (impeccable.style/docs/hooks), enable them so the detector runs while you edit |
| End of each UI phase | **Anti-slop gate** (below), then `/impeccable polish` → screenshots before/after in the phase report |
Design changes must never touch `src/domain` logic; if a polish pass breaks a test, revert it.

## Anti-slop gate (must pass before a UI phase is "done")
Goal: the app must look like a designer made it for this exact use, not like a generic AI app.
1. **Independent audit.** Spawn a fresh subagent that has NOT seen the design work. It runs `/unslop:audit` and reviews the Playwright screenshots against impeccable.style/slop. It only reports; it does not edit.
2. **Fix with targeted commands, not a redesign:** `/impeccable quieter` (too much decoration), `/impeccable distill` (too many elements), `/impeccable typeset` (generic type), `/impeccable colorize` (generic palette), `/impeccable layout` (template-looking composition). Only use `bolder` if I say the design is too timid.
3. **Re-run** `npx impeccable detect` + the subagent audit until no high/critical findings remain.
4. **Show me** screenshots of every screen (375px) and the findings list. I make the final call.

Known tells to reject on sight: purple/blue gradients, gradient text, glassmorphism, glow shadows, cards nested in cards, every element `rounded-2xl` + shadow, a hero/welcome banner inside an app, emoji used as icons, sparkle ✨ "AI" decorations, stat tiles with made-up numbers, Inter/Roboto as the only font, centered everything, identical card grids, a round cute owl that looks like Duolingo or Hootsuite, shiny gold-coin clip-art, brown-gold "luxury" gradients.

**Thai copy is part of the gate.** UI text must sound like a Thai friend, short and casual ("ใครจ่าย?", "ต้นติดเรา ฿240"), never translated-English or formal ("ยินดีต้อนรับสู่แอปพลิเคชันจัดการค่าใช้จ่าย", "ดำเนินการสำเร็จ"). No slogans, no marketing lines, no exclamation spam. Empty states say what to do next in one line.

## Phases
| Phase | Scope | Done when |
|---|---|---|
| P1 | Project setup + `src/domain` (money, split, ledger, promptpay, summary) | All unit + property tests pass; no UI yet |
| P2 | Storage, migrations, หารบิล screen + receipt preview, save/edit/delete bill | Can create a multi-payer bill with VAT/service/discount/round-up and reload safely |
| P3 | ยอดค้าง, person detail, loans, partial repay, QR, copy reminder | Balances match domain tests; QR scans in a Thai bank app (I'll check manually) |
| P4 | Groups + per-group balances + simplify | Group and overall views agree |
| P5 | สรุปเดือน, text + image share, export/import + backup banner | Import of an exported file round-trips identically |
| P6 | PWA (manifest, icons, offline), GitHub Actions deploy to Pages, README; final `/impeccable audit` of the whole app | Installable on phone, works offline, no high/critical audit issues left |

Phase report format: what was built · test results · screenshots (UI phases) · Impeccable findings fixed / deferred · anything you were unsure about.
Save each report as `docs/reports/phase-N.md` with screenshots in `docs/screenshots/phase-N/`, and commit them.

## Source of truth
- Save this spec as `docs/SPEC.md` in the repo on the first step. Add a short `CLAUDE.md` that points to `docs/SPEC.md`, `PRODUCT.md`, `DESIGN.md` and the latest report, so a new session picks up where the last one stopped.
- When I change a decision (here or in another chat), update `docs/SPEC.md` in the same commit as the code. Keep a `## Decision log` at the bottom of it: date · decision · reason.

## Non-goals (don't build)
Accounts/login, backend, multi-user sync, multiple currencies, receipt OCR, notifications, percentage/share-based splits.
