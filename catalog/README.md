# Medicine Catalog — Shop Owner Guide

This file (`medicines-seed.csv`) contains ~1,000 real medicines commonly sold in India.
It is a **starting seed** — you only need to fill in YOUR shop's data.

## What you need to do (only 2 columns!)

Open `medicines-seed.csv` in Excel / Google Sheets. Fill in:

| Column | What to enter |
|--------|---------------|
| `price` | YOUR selling price in ₹ (e.g. `32.50`). Leave blank = product hidden from the site |
| `stock` | Quantity you have in hand (e.g. `48`). `0` = shown as "Out of stock" |

**Do not touch** the other columns — name, brand, composition, strength, form, pack_size,
category and rx_required are already filled.

## Tips

- **Delete rows** for medicines you don't stock — fewer rows = cleaner catalog.
- **Add rows** for anything missing: copy a row, change the name/brand/composition,
  keep the same 11-column format. Keep `id` unique (any number is fine).
- **rx_required**: `TRUE` = customer must upload a prescription to buy it.
  Ask your pharmacist to review this column once — a few borderline items
  (some creams, single-dose antifungals) are marked `FALSE` based on common
  OTC practice, but your pharmacist has the final say.
- **Prices change?** Just edit the sheet and re-upload. The admin panel will have
  a "Bulk upload CSV" button for this.

## Product photos

You do NOT need to photograph every medicine. The site shows a generic image
per form (tablet strip, syrup bottle, etc. — see the `images/` folder).
Only upload real photos for your top bestsellers if you want to.

## File specs (for the developer)

- Encoding: UTF-8, comma-separated, 11 columns, header row required
- `rx_required`: exactly `TRUE` or `FALSE`
- `form`: one of Tablet, Capsule, Syrup, Drops, Injection, Ointment, Cream, Gel,
  Spray, Powder, Sachet, Inhaler, Lotion, Solution
- `price`: number in ₹, empty = hidden. `stock`: integer, 0 = out of stock
