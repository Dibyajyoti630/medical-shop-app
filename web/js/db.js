// Shared Supabase client + tiny helpers. Loaded after the supabase-js CDN script.
(function () {
  "use strict";
  if (!window.supabase) throw new Error("supabase-js CDN not loaded");
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PAGE = 20;

  async function medicines({ q = "", category = "", form = "", page = 0 } = {}) {
    let query = sb.from("medicines").select("*", { count: "exact" })
      .eq("is_active", true).not("price", "is", null)
      .order("name").range(page * PAGE, page * PAGE + PAGE - 1);
    if (q) query = query.ilike("name", `%${q.trim()}%`);
    if (category) query = query.eq("category", category);
    if (form) query = query.eq("form", form);
    return query;
  }

  async function categories() {
    const { data, error } = await sb.from("medicines")
      .select("category").eq("is_active", true).not("price", "is", null);
    if (error) throw error;
    return [...new Set(data.map(r => r.category))].sort();
  }

  async function forms() {
    const { data, error } = await sb.from("medicines")
      .select("form").eq("is_active", true).not("price", "is", null);
    if (error) throw error;
    return [...new Set(data.map(r => r.form))].sort();
  }

  // Generic form placeholder per medicine form (see catalog/images/)
  const FORM_IMG = {
    Tablet: "form-tablet.webp", Syrup: "form-syrup.webp", Capsule: "form-capsule.webp",
    Injection: "form-injection.webp", Ointment: "form-ointment.webp", Drops: "form-drops.webp",
    Inhaler: "form-inhaler.webp", Sachet: "form-sachet.webp"
  };
  function medImage(m) {
    // ponytail: images ship with the site under web/images; same relative URL in dev and prod
    return m.image_url || ("images/" + (FORM_IMG[m.form] || FORM_IMG.Tablet));
  }

  function money(n) { return "₹" + Number(n || 0).toFixed(2); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showErr(box, msg) {
    box.innerHTML = '<div class="err">' + esc(msg) + "</div>";
  }

  function toast(t) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1800);
  }

  window.DB = { sb, PAGE, medicines, categories, forms, medImage, money, esc, showErr, toast };
})();
