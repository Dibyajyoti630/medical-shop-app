# Build phases

- [x] Foundation — repo scaffolding, Supabase schema + RLS, GEMINI.md, shared CSS/JS
- [x] **A. Admin catalog** — medicine list/edit, CSV bulk import for price/stock, admin login, role-guard migration
- [ ] **B. Customer app** — browse/search/cart/checkout, auth, addresses
- [ ] **C. Prescriptions** — customer upload, admin approve/reject, Rx gate at checkout
- [ ] **D. Admin orders** — status pipeline, rider assignment
- [x] **E. Rider app** — assigned orders, pickup/delivery status updates
- [x] **F. Deploy** — docs/DEPLOY.md: Supabase apply, Vercel deploy, UptimeRobot keep-alive

## Deploy notes (Phase F)

- Serve the `web/` folder as the site root.
- UptimeRobot: create an HTTP(s) monitor hitting
  `https://YOUR-PROJECT.supabase.co/rest/v1/medicines?select=id&limit=1`
  with a custom header `apikey: YOUR-ANON-KEY`, every 5 min. This counts as
  database activity and keeps the free Supabase project from pausing.
  (No server of ours to keep warm — the site is static; Supabase is the only
  backend.)
