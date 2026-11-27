---
version: 1
slug: "src-features-settings"
primary_target: "src/features/settings"
related_targets: []
---

# Settings screen (ตั้งค่า), Phase 2 scope

Mode: Operate. Confirmed brief; the behaviour is in docs/SPEC.md, screen 5. Not a new world and not an open composition: it reuses the bill screen's parts.

- Job: find a saved bill to read, fix or delete; give a friend a better name.
- Success: the right bill is found by date and title; nothing is deleted or lost by accident.
- Out of scope now: PromptPay, backup, archiving friends, loans and repayments.

## Direction contract

THESIS: A plain ledger of past bills, newest first, each opening into the same receipt it was saved as. It refuses cards, stats and anything that isn't finding or fixing a bill.

OWN-WORLD: The incumbent system: same tabs, buttons, fields, name chips, thermal receipt and attention style as the bill screen.

STORY: Open ตั้งค่า, spot the bill, open it, then fix or delete it. Or switch to เพื่อน and rename someone.

FIRST VIEWPORT: Sub-tabs ประวัติ and เพื่อน, then the bill rows: title, date and head count left, total right. Bottom navigation below.

FORM: Narrow, precisely specified extension; shaped directly. seed: none (pinned) "same tabs, buttons, chips and receipt as the bill screen".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
