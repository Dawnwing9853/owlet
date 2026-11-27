# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: the owner, a Thai university student, on their own phone.

- Mostly enters a bill **at home, later**, from the paper receipt or a photo of it.
- Sometimes enters it at the restaurant table, one-handed and in a hurry. This must still work well.
- A typical bill is for **9 or more people**.
- Splitting is **mixed**: most items are shared by everyone, and some, such as drinks, only by the people who had them.

Friends never use the app. They only receive text or image summaries and pay the owner by PromptPay.

## Product Purpose

Split restaurant and trip bills with friends, and keep track of who owes whom. Everything is in Thai. It succeeds when the owner can enter a whole bill, see that it matches the receipt, and later know exactly who still owes how much.

## Positioning

A private ledger for one person, not a shared account: no sign-up, no friends to invite, data stays on the phone. Each friend gets a summary and a PromptPay QR for the exact amount they owe the owner. Balances are always derived from the entries, never typed in or stored.

## Operating Context

- The source of truth at entry time is a printed receipt with item prices, often with a service charge, and VAT either already included or added on top.
- Several people may have paid parts of one bill.
- Summaries leave the app as copied text, a LINE share, or an image.
- Payment happens outside the app, in a Thai banking app.

## Capabilities and Constraints

- Bills, loans and repayments, optionally in groups. A bill has items, who shares each item, payers, service %, "บวก VAT 7%" (off by default) and a discount.
- No accounts, backend, sync, other currencies, OCR, notifications, or percentage or share-based splits.
- Offline PWA. Data lives in `localStorage`, with export and import as backup.
- Money is integer satang, always shown with 2 decimals: `฿1,234.00`.
- The detailed behaviour, screens and phases are in [docs/SPEC.md](docs/SPEC.md).

## Brand Commitments

- Name: **Owlet** (owl + wallet). Theme: a detective owl who never forgets who owes whom.
- Voice: a Thai friend, short and casual ("ใครจ่าย?", "ต้นติดเรา ฿240.00"). Never formal or translated-sounding. No slogans or marketing lines. Empty states say what to do next in one line.
- The fixed visual constraints (palette, light mode only, Mitr, icon rules and the list of rejected looks) are the "Design brief" and "Anti-slop gate" sections of [docs/SPEC.md](docs/SPEC.md). **Light mode only is intentional**: don't report a missing dark mode.

## Evidence on Hand

There is no real data, testimonials or artwork. The repository is public, so examples use made-up names, phone numbers and IDs. Never show made-up numbers as if they were the owner's.

## Product Principles

1. **The total must be checkable against the receipt.** While entering a bill, the owner can always compare what they typed with the paper.
2. **A big group stays easy.** Nine or more people is normal, so choosing who shares must not take one tap per person per item.
3. **Shared by everyone is the common case.** It should cost the least effort; leaving some people out should still be quick.
4. **Money is never silently changed.** Invalid input is shown as invalid, never blanked or read as zero, and saving is blocked until the numbers add up.
5. **Complete first, then fast.** Optimise for entering at home without losing one-handed use at the table.

## Accessibility & Inclusion

WCAG AA contrast, touch targets of at least 44px, 16px inputs (so iOS doesn't zoom), a decimal keypad for money, visible focus, safe-area insets, and Thai text with no clipped vowels or tone marks.
