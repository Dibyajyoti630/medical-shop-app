# Medical Shop Delivery App

Mobile-first medicine delivery website for a local medical shop — customer
storefront, admin panel, and delivery rider app. Pilot runs entirely on free
tiers.

## Quick start

1. **Database** — create a free Supabase project, then run
   `supabase/schema.sql` once in the SQL editor.
2. **Seed catalog** — import `catalog/medicines-seed.csv` via the admin panel
   (Phase A), or insert directly. Price/stock columns start blank for the shop.
3. **Configure** — copy `web/js/config.js`, fill in your Supabase URL + anon key.
4. **Run** — serve the `web/` folder (`npx serve web`, VS Code Live Server, or
   any static host). Deploy `web/` to Vercel or Netlify.

## Layout

- `web/index.html` — customer app
- `web/admin.html` — admin panel
- `web/rider.html` — rider app
- `web/css/` `web/js/` — shared styles and logic
- `supabase/` — schema + migrations
- `catalog/` — 1000-medicine seed data and form images
- `docs/PHASES.md` — build phases

## Rules for contributors (human or agent)

Read `GEMINI.md` first. Ponytail discipline: simplest working code, no
framework, mobile-first, never cut validation/security/accessibility.
