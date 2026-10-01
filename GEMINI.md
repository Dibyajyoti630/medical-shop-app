# Medical Shop Delivery — project brain for AI agents

You are working on a mobile-first medicine delivery website for a local medical
shop (pilot, free-tier only). Three roles, one codebase:

- `web/index.html` — customer storefront (browse, search, cart, checkout)
- `web/admin.html` — admin panel (catalog, orders, prescriptions, riders)
- `web/rider.html` — delivery rider app (assigned orders, status updates)

## Stack (do not change without asking)

- Static HTML/CSS/JS. **No build step, no npm, no framework.** Deploys to
  Vercel/Netlify as-is. This is deliberate: free tier, ~100 orders/day.
- Supabase for Postgres + Auth + Storage. Client via CDN:
  `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- Keys live in `web/js/config.js` (anon key only — never the service key).

## How to work here

- Apply the ponytail skill at full intensity: YAGNI ladder, stdlib/native
  first, shortest working diff. Mark deliberate deferrals with
  `// ponytail: <what> deferred because <why>`.
- Never cut: input validation, error handling, RLS/security, accessibility
  (44px touch targets, labels on inputs, focus states).
- Mobile-first: design at 360px width first. Keep each page under ~150KB
  total. Paginate the catalog (20/page), search server-side.
- Shared code goes in `web/js/` and `web/css/`. No duplicated logic across
  the three pages — extract a helper instead.
- Database changes go in `supabase/` as new numbered migration files
  (`002_*.sql`), never by editing `schema.sql` after it's applied.

## Domain rules (from the PRD — enforce in UI and logic)

- Medicines with `price = null` are NOT sellable and must not render in the store.
- `rx_required = true` items need an approved prescription before checkout.
  The pharmacist verifies every prescription in the admin panel.
- Order status flow: placed → awaiting_rx → confirmed → preparing → assigned →
  picked_up → out_for_delivery → delivered. Customers may only cancel before
  `preparing`. Riders only touch their assigned orders.
- Pilot is COD-first. UPI is a fast follow — don't build payment plumbing yet.

## File layout

```
catalog/            1000-medicine seed CSV + generic form images
supabase/schema.sql full DB schema + RLS (run once in Supabase SQL editor)
web/                the app (index/admin/rider + shared css/js)
docs/PHASES.md      build phases and what's done
```
