// Shared auth helpers for admin.html / rider.html (customer auth lands in Phase B).
(function () {
  "use strict";
  async function user() {
    const { data } = await DB.sb.auth.getUser();
    return data.user || null;
  }
  async function profile() {
    const u = await user();
    if (!u) return null;
    const { data, error } = await DB.sb.from("profiles").select("*").eq("id", u.id).single();
    if (error && error.code === "PGRST116") { // first login: create customer row
      const r = await DB.sb.from("profiles").insert({
        id: u.id, role: "customer",
        name: (u.user_metadata || {}).full_name || null, // prefilled by Google OAuth
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
    if (error) throw error;
    return data;
  }
  // Admins pass every role check.
  async function requireRole(role) {
    const p = await profile();
    if (!p) return { ok: false, reason: "signin" };
    if (p.role !== role && p.role !== "admin") return { ok: false, reason: "forbidden", profile: p };
    return { ok: true, profile: p };
  }
  async function signIn(email, password) {
    const { error } = await DB.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async function signUp(email, password) {
    const { error } = await DB.sb.auth.signUp({ email, password });
    if (error) throw error;
  }
  async function signInWithGoogle() {
    // Redirects to Google; on return Supabase picks the session up from the URL
    // (needs detectSessionInUrl: true) and lands back on this same page.
    const { error } = await DB.sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  }
  async function signOut() { await DB.sb.auth.signOut(); }
  // Renders a minimal email/password gate into `el`, then calls `next()`.
  // opts.showSignup (default true) — set false to hide "Create account" (e.g. admin page).
  // opts.google (default true) — set false to hide the Google button.
  // opts.note — helper text shown under the form when signup is hidden.
  function gate(el, next, opts) {
    var showSignup = !opts || opts.showSignup !== false;
    var showGoogle = !opts || opts.google !== false;
    var note = (opts && opts.note) || "Admin accounts are assigned — contact the shop owner.";
    el.innerHTML =
      '<div class="card"><h2 style="margin-bottom:8px">Sign in</h2>' +
      '<div id="amsg"></div>' +
      (showGoogle ? '<button class="btn secondary" id="agoogle" style="width:100%;margin:6px 0 4px">Continue with Google</button>' +
      '<div class="muted" style="text-align:center;margin:8px 0">or</div>' : "") +
      '<label for="aemail">Email</label><input id="aemail" type="email" autocomplete="email">' +
      '<label for="apass">Password</label><input id="apass" type="password" autocomplete="current-password">' +
      '<div class="row" style="margin-top:14px">' +
      '<button class="btn" id="ago">Sign in</button>' +
      (showSignup ? '<button class="btn secondary" id="areg">Create account</button>' : '') + '</div>' +
      (!showSignup ? '<p class="muted" style="margin-top:10px;text-align:center">' + DB.esc(note) + '</p>' : '') +
      '</div>';
    const go = async (fn) => {
      const box = document.getElementById("amsg");
      try {
        await fn(document.getElementById("aemail").value, document.getElementById("apass").value);
        next();
      } catch (e) { DB.showErr(box, e.message); }
    };
    document.getElementById("ago").onclick = () =>
      go(async (em, pw) => signIn(em.trim(), pw));
    var gBtn = document.getElementById("agoogle");
    if (gBtn) gBtn.onclick = () => go(() => signInWithGoogle());
    var regBtn = document.getElementById("areg");
    if (regBtn) regBtn.onclick = () =>
      go(async (em, pw) => { await signUp(em.trim(), pw); await signIn(em.trim(), pw); });
  }
  window.Auth = { user, profile, requireRole, signIn, signUp, signInWithGoogle, signOut, gate };
})();
