# Deploy guide (all free tier)

## 1. Supabase (database + auth + storage)

1. Create a free project at supabase.com (region closest to you, e.g. Mumbai).
2. Open the SQL editor and run, in order:
   - `supabase/schema.sql`
   - `supabase/002_profile_role_guard.sql`
   - `supabase/003_rider_visibility.sql`
3. Copy the project URL and **anon** key (Project Settings → API).

## 2. Point the app at Supabase

Edit `web/js/config.js` — paste the URL and anon key. Never use the
service_role key in the app.

## 3. First admin account

1. Open `web/admin.html`, create an account.
2. In Supabase SQL, find your user id and promote it:
   `update profiles set role='admin' where id='<your-uuid>';`
3. Sign in again — the admin panel unlocks.

Riders: same flow, with `role='rider'`.

## 4. Seed the catalog

Fill `price` and `stock` in `catalog/medicines-seed.csv`, then in the admin
panel → Catalog → Import CSV. Only rows matching name + strength are updated.

## 5. Host the site (Vercel)

1. Push this repo to GitHub, import it in Vercel.
2. Set the **root directory to `web/`** (or deploy `web/` via drag-drop).
3. You get `https://<name>.vercel.app` free. `index.html` = customer app,
   `/admin.html` = admin, `/rider.html` = rider.

Netlify works the same (publish directory `web/`).

## 6. Keep Supabase awake (UptimeRobot)

Free Supabase projects pause after inactivity. Create a free UptimeRobot
HTTP(s) monitor:

- URL: `https://YOUR-PROJECT.supabase.co/rest/v1/medicines?select=id&limit=1`
- Custom header: `apikey: YOUR-ANON-KEY`
- Interval: 5 minutes

This counts as database activity. (There is no server of ours to keep warm —
the site is static; Supabase is the only backend.)

## Pilot checklist before first real order

- [ ] Pharmacist reviewed the catalog's `rx_required` flags
- [ ] Prices + stock filled via CSV import
- [ ] Test order placed end-to-end (customer → admin → rider)
- [ ] Prescription approve/reject tried once
