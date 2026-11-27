---
version: 1
slug: "src-features-bill"
primary_target: "src/features/bill"
related_targets: []
---

# Bill screen (หารบิล)

Mode: Operate. Confirmed brief; the behaviour is in docs/SPEC.md, screen 2.

- Job: the owner types a bill from its paper receipt, usually at home, for 9 to 30 people.
- Success: the grand total matches the receipt, every item has someone sharing it, and it saves.
- Order of work: type every item first, then say who shares. A new item has nobody.

## Direction contract

THESIS: Two steps on one screen, "รายการ" then "ใครหาร", with the grand total always in view to check against paper. It refuses the wizard that hides the total until the end.

OWN-WORLD: The world pinned in the spec: parchment, espresso ink, owl-brown actions, thermal receipt with dashed rules and a zigzag edge, Mitr text, Noto Sans Thai amounts, coloured name chips. Light only.

STORY: Type the lines, tick who had what (several lines at once if alike), say who paid, read the receipt, save.

FIRST VIEWPORT: Step tabs on top, then title, date, people and the item lines. Pinned at the bottom: grand total large, what still blocks saving, and the save button. From 1024px the live receipt is a right column.

FORM: Step tabs with multi-select assignment, position 1 of 7 on the ordered list; seed:916e87cd994fed4f.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
