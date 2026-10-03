// Shared Supabase client + tiny helpers. Loaded after the supabase-js CDN script.
(function () {
  "use strict";
  if (!window.supabase) throw new Error("supabase-js CDN not loaded");
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }, // true: required for OAuth (Google) redirect callback
  });

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
  // Popup alerts, colored by situation: error (red), success (green), info (blue).
  // Used for every app's errors via showErr — impossible to miss on mobile.
  function popup(kind, title, msg) {
    const icons = { error: "!", success: "✓", info: "i" };
    const ov = document.createElement("div");
    ov.className = "popup-ov";
    ov.innerHTML =
      '<div class="popup-card kind-' + kind + '"><div class="popup-ic">' + (icons[kind] || "!") + "</div>" +
      '<div class="popup-title">' + esc(title) + "</div>" +
      '<div class="popup-msg">' + esc(msg) + "</div>" +
      '<button class="btn popup-ok">OK</button></div>';
    ov.querySelector(".popup-ok").onclick = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelector(".popup-ok").focus();
  }
  function showErr(box, msg) {
    popup("error", "Error", msg);
  }

  function toast(t) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1800);
  }

  // Downscale + JPEG-compress an image file in-browser (max 1600px, ~0.7
  // quality) so prescription uploads work on slow networks. Falls back to the
  // original file if it can't be read (e.g. HEIC).
  function compressImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const MAX = 1600;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          c.toBlob((b) => resolve(b || file), "image/jpeg", 0.7);
        } catch (e) { resolve(file); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ── Delivery geography ───────────────────────────────────────────────
  // Base: Jiban Jyoti Medical Store, Uttarpada — exact pin from the shop's
  // Google Maps listing (shared by the owner): 21.698482, 87.246705.
  // Zone: a 20 km "closed circle" around the shop ≈ the Jaleswar → Baliapal span.
  const GEO = {
    SHOP: { lat: 21.6985, lon: 87.2467 },
    MAX_KM: 20,
    FREE_ABOVE: 1000, // subtotal at/above this → free delivery regardless of distance
  };
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, t = Math.PI / 180;
    const h = Math.sin((lat2 - lat1) * t / 2) ** 2 +
      Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin((lon2 - lon1) * t / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Fee tiers: ≤5 km → ₹30, 5–10 km → ₹50, above → ₹80.
  function feeForKm(km, subtotal) {
    if (subtotal <= 0 || subtotal >= GEO.FREE_ABOVE) return 0;
    if (km <= 5) return 30;
    if (km <= 10) return 50;
    return 80;
  }
  // Free geocoder (OpenStreetMap Nominatim, no key). Tries the full text, then the
  // label, then progressively shorter text — first hit wins. Results are biased
  // toward the shop's area with a viewbox (not bounded, so genuinely far addresses
  // still resolve and can be blocked as out-of-zone). Null when unlocatable.
  async function geocode(text, label) {
    const seen = new Set(), tries = [];
    const push = t => { t = (t || "").trim(); const k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); tries.push(t); } };
    push(text); push(label);
    const words = String(text || "").split(/\s+/).filter(Boolean);
    for (let i = words.length - 1; i >= 2; i--) push(words.slice(0, i).join(" "));
    for (const t of tries.slice(0, 6)) {
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1" +
          "&viewbox=87.00,21.95,87.50,21.45" +
          "&q=" + encodeURIComponent(t + ", Odisha, India"),
          { headers: { Accept: "application/json" } });
        const j = await r.json();
        if (j && j[0] && isFinite(+j[0].lat) && isFinite(+j[0].lon))
          return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
      } catch (e) { /* try the next variant */ }
    }
    return null;
  }

  window.DB = { sb, PAGE, medicines, categories, forms, medImage, money, esc, showErr, popup, toast, compressImage,
    geo: { SHOP: GEO.SHOP, MAX_KM: GEO.MAX_KM, FREE_ABOVE: GEO.FREE_ABOVE, haversineKm, feeForKm, geocode } };
})();
