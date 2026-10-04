// Rider app: today's deliveries, order detail, status stepper, earnings, profile.
// Orange theme per the delivery mockup. Plain static JS, like the rest of the pilot.
(function () {
  "use strict";
  const app = document.getElementById("app"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const SHOP = "Jiban Jyoti Medical Store";
  const NEXT = { assigned: "picked_up", picked_up: "out_for_delivery", out_for_delivery: "delivered" };
  const STAGE = { assigned: "Ready for Pickup", picked_up: "Picked Up", out_for_delivery: "Out for Delivery", delivered: "Delivered" };
  const FLOW = ["assigned", "picked_up", "out_for_delivery", "delivered"];
  const STEPS = [
    { to: "picked_up", label: "Mark Picked Up" },
    { to: "out_for_delivery", label: "Out for Delivery" },
    { to: "delivered", label: "Delivered" },
  ];
  let me = null, tab = "deliveries", managedId = null, orders = [], navBound = false;

  function shortId(id) { return "ORD-" + String(id).replace(/-/g, "").slice(0, 6).toUpperCase(); }
  function ago(ts) {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function initials(n) { return (n || "R").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(); }
  function pin(color) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + color + '"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  }
  function plus(color) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  }

  async function boot() {
    const chk = await Auth.requireRole("rider").catch(() => ({ ok: false, reason: "signin" }));
    if (chk.reason === "signin") { app.innerHTML = ""; return Auth.gate(app, boot, { showSignup: false, google: false, note: "Rider accounts are created by the shop — ask for your login." }); }
    if (!chk.ok) {
      app.innerHTML = '<div class="r-body"><div class="card r-empty">This account is not a rider.<br><span class="muted">Riders sign up in the app — the shop sets the rider role.</span></div></div>';
      return;
    }
    me = chk.profile;
    if (me.must_change_password) return vNewPassword();
    document.getElementById("rnav").hidden = false;
    if (!navBound) {
      navBound = true;
      document.querySelectorAll("#rnav button").forEach(b => b.onclick = () => {
        tab = b.dataset.tab;
        document.querySelectorAll("#rnav button").forEach(x => x.classList.toggle("on", x === b));
        refresh();
      });
    }
    watchOrders();
    await refresh();
  }

  async function refresh() {
    msg.innerHTML = "";
    try {
      if (tab === "deliveries") await vDeliveries();
      else if (tab === "earnings") await vEarnings();
      else vProfile();
    } catch (e) { DB.showErr(msg, e.message); }
  }

  // ── Deliveries ─────────────────────────────────────────────────────────
  async function vDeliveries() {
    const { data, error } = await DB.sb.from("orders")
      .select("id,status,total,payment_method,delivery_slot,created_at,updated_at,notes,delivery_otp," +
        "customer:profiles!orders_customer_id_fkey(name,phone)," +
        "addr:addresses!orders_address_id_fkey(label,address_text,landmark)," +
        "order_items(qty,medicines(name))")
      .eq("rider_id", me.id)
      .in("status", ["assigned", "picked_up", "out_for_delivery"])
      .order("created_at");
    if (error) throw error;
    orders = data || [];
    if (!orders.some(o => o.id === managedId)) managedId = orders.length ? orders[0].id : null;
    paintDeliveries();
  }

  function paintDeliveries() {
    const m = orders.find(o => o.id === managedId);
    app.innerHTML =
      '<div class="r-head"><div class="r-head-top"><div class="r-cross">+</div><h1>My Deliveries - Today</h1>' +
      '<div class="r-ava">' + esc(initials(me.name)) + '</div></div>' +
      '<div class="r-rider">Rider: ' + esc(me.name || "Rider") + '</div>' +
      '<div class="r-strip"><span>' + esc(SHOP) + ' • Rider App</span><span class="r-online">Online • Active</span></div></div>' +
      '<div class="r-body"><h2>Active Deliveries (' + orders.length + ")</h2>" +
      (orders.length ? orders.map(cardHtml).join("") : '<div class="r-empty">No deliveries assigned.<br>All caught up.</div>') +
      (m ? manageHtml(m) : "") + "</div>";
    app.querySelectorAll("[data-manage]").forEach(b => b.onclick = () => { managedId = b.dataset.manage; paintDeliveries(); });
    app.querySelectorAll("[data-adv]").forEach(b => {
      if (b.disabled) return;
      b.onclick = () => {
        if (b.dataset.to === "delivered") { // handled through the OTP box
          const box = document.getElementById("otpBox"), inp = document.getElementById("otpIn");
          if (box) { box.hidden = false; inp.focus(); box.scrollIntoView({ block: "nearest" }); }
          return;
        }
        advance(b.dataset.adv, b.dataset.to, b);
      };
    });
    const otpGo = document.getElementById("otpGo");
    if (otpGo) otpGo.onclick = () => verifyOtp(orders.find(o => o.id === managedId));
    if (m && m.addr && m.addr.address_text) enhanceMap(m.addr.address_text, m.id);
  }

  function cardHtml(o) {
    const pay = (o.payment_method === "cod" ? "COD " : "Prepaid ") + DB.money(o.total);
    const a = o.addr || {};
    return '<button class="r-del' + (o.id === managedId ? " sel" : "") + '" data-manage="' + o.id + '">' +
      '<span class="r-del-top"><b>#' + shortId(o.id) + "</b><span>•</span><b>" + esc(pay) + "</b>" +
      '<span class="pill st-' + o.status + '">' + esc(STAGE[o.status] || o.status) + "</span></span>" +
      '<span class="r-row">' + pin("#f2731d") + "<span>" + esc(a.address_text || "Address not available") + "</span></span>" +
      '<span class="r-row shop">' + plus("#f2731d") + "<span>" + esc(SHOP) + " • Order placed " + ago(o.created_at) + "</span></span>" +
      "</button>";
  }

  function mapSvg() {
    const drop = (x, y, color, label) =>
      '<g transform="translate(' + x + "," + y + ')">' +
      '<path d="M0,0 C-8,-9 -12,-14 -12,-20 A12,12 0 1,1 12,-20 C12,-14 8,-9 0,0 Z" fill="' + color + '"/>' +
      '<circle cx="0" cy="-20" r="4.5" fill="#fff"/>' +
      '<text x="16" y="-14" font-size="12" font-weight="700" fill="#5b6472">' + label + "</text></g>";
    return '<svg class="r-map" viewBox="0 0 300 140" role="img" aria-label="Route map">' +
      '<rect width="300" height="140" fill="#edf1ec"/>' +
      '<g stroke="#ffffff" stroke-width="11"><path d="M-10,42 H310"/><path d="M-10,96 H310"/><path d="M72,-10 V150"/><path d="M202,-10 V150"/></g>' +
      '<g stroke="#dfe5df" stroke-width="3"><path d="M-10,68 H310"/><path d="M137,-10 V150"/><path d="M266,-10 V150"/></g>' +
      '<path d="M48,108 C105,98 155,92 232,48" stroke="#f2731d" stroke-width="3.5" stroke-dasharray="8 6" fill="none" stroke-linecap="round"/>' +
      drop(48, 108, "#f2731d", "Shop") + drop(232, 48, "#1e2a3a", "Customer") +
      "</svg>";
  }

  function manageHtml(o) {
    const c = o.customer || {}, a = o.addr || {};
    const items = (o.order_items || []).map(i =>
      "<div><span>" + esc((i.medicines && i.medicines.name) || "Item") + " × " + i.qty + "</span></div>").join("");
    const navUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(a.address_text || "");
    const idx = FLOW.indexOf(o.status);
    const needOtp = NEXT[o.status] === "delivered";
    const steps = STEPS.map(s => {
      const si = FLOW.indexOf(s.to);
      const cls = si <= idx ? "done" : (NEXT[o.status] === s.to ? "next" : "");
      const dis = cls === "next" ? "" : " disabled";
      return '<button class="' + cls + '" data-adv="' + o.id + '" data-to="' + s.to + '"' + dis + ">" +
        (cls === "done" ? "✓ " : "") + esc(s.label) + "</button>";
    }).join("");
    return '<div class="r-manage">' +
      '<span class="r-manage-pill">Now Managing • #' + shortId(o.id) + "</span><h3>Order Details</h3>" +
      '<div class="r-mapwrap"><div id="rmap">' + mapSvg() + "</div>" +
      '<a class="r-mapgo" href="' + navUrl + '" target="_blank" rel="noopener" aria-label="Open navigation">' +
      '<span class="r-mapbadge">Open in Maps</span></a></div>' +
      '<div class="r-cust"><b>' + esc(c.name || "Customer") + "</b>" +
        (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + "</a>" : '<span class="muted">No phone</span>') + "</div>" +
      '<div class="r-row">' + pin("#f2731d") + "<span>" + esc(a.address_text || "") +
        (a.landmark ? " (" + esc(a.landmark) + ")" : "") + "</span></div>" +
      (o.delivery_slot ? '<p class="muted" style="margin:8px 0 0">Delivery slot: <b>' + esc(o.delivery_slot) + "</b></p>" : "") +
      (items ? '<div class="r-items">' + items + "</div>" : "") +
      (o.notes ? '<div class="muted" style="margin-top:8px">' + esc(o.notes) + "</div>" : "") +
      (o.payment_method === "cod"
        ? '<div class="r-collect"><span>Collect on delivery</span><b>' + DB.money(o.total) + "</b></div>" : "") +
      '<div class="r-actions">' +
        (c.phone ? '<a class="r-call" href="tel:' + esc(c.phone) + '">Call Customer</a>' : "") +
        '<a class="r-navbtn" href="' + navUrl + '" target="_blank" rel="noopener">Start Navigation</a></div>' +
      '<h3 style="text-align:left;margin:18px 0 10px">Update Status</h3>' +
      '<div class="r-steps">' + steps + "</div>" +
      (needOtp
        ? '<div class="r-otp" id="otpBox" hidden><b>Delivery code</b>' +
          '<p class="muted" style="margin:4px 0 0">Ask the customer for their 4-digit code, then complete the delivery.</p>' +
          '<div class="row"><input class="input" id="otpIn" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">' +
          '<button class="btn" id="otpGo">Verify & complete</button></div></div>'
        : "") + "</div>";
  }

  async function verifyOtp(o) {
    const inp = document.getElementById("otpIn");
    const code = (inp.value || "").trim();
    try {
      if (!o.delivery_otp) {
        if (!confirm("Mark delivered? (No code on this order.)")) return; // pre-OTP orders
      } else {
        if (code !== o.delivery_otp) { DB.showErr(msg, "Wrong code — ask the customer again."); inp.select(); return; }
        if (o.payment_method === "cod" && !confirm("Code OK. Collected " + DB.money(o.total) + "?")) return;
      }
      inp.disabled = true;
      const { error } = await DB.sb.from("orders").update({ status: "delivered" }).eq("id", o.id);
      if (error) throw error;
      DB.toast("Delivered");
      await vDeliveries();
    } catch (e) { DB.showErr(msg, e.message); inp.disabled = false; }
  }

  async function advance(id, to, btn) {
    try {
      btn.disabled = true;
      const { error } = await DB.sb.from("orders").update({ status: to }).eq("id", id);
      if (error) throw error;
      DB.toast("Status updated");
      await vDeliveries();
    } catch (e) { DB.showErr(msg, e.message); btn.disabled = false; }
  }

  // ── First sign-in: replace the temporary password ──────────────────────
  function vNewPassword() {
    document.getElementById("rnav").hidden = true;
    app.innerHTML = '<div class="r-body"><div class="r-earn" style="margin-top:24px">' +
      "<h3 style='font-size:20px;color:#1e2a3a'>Set your password</h3>" +
      '<p class="muted">First sign-in — choose a new password to replace the temporary one.</p>' +
      '<div id="pwmsg"></div>' +
      '<label for="npw1">New password</label><input class="input" id="npw1" type="password" autocomplete="new-password">' +
      '<label for="npw2">Confirm password</label><input class="input" id="npw2" type="password" autocomplete="new-password">' +
      '<button class="btn" id="npwGo" style="width:100%;margin-top:12px">Save password</button>' +
      "</div></div>";
    document.getElementById("npwGo").onclick = async () => {
      const box = document.getElementById("pwmsg");
      const p1 = document.getElementById("npw1").value, p2 = document.getElementById("npw2").value;
      try {
        if (p1.length < 6) throw new Error("Password must be at least 6 characters.");
        if (p1 !== p2) throw new Error("Passwords don't match.");
        const { error } = await DB.sb.auth.updateUser({ password: p1 });
        if (error) throw error;
        const r = await DB.sb.from("profiles").update({ must_change_password: false }).eq("id", me.id);
        if (r.error) throw r.error;
        location.reload();
      } catch (e) { DB.showErr(box, e.message); }
    };
  }

  // ── Real map when the address can be located (free OSM, no key) ─────────
  // Falls back to the drawn map for vague addresses or offline use.
  const geoCache = {};
  async function enhanceMap(addrText, orderId) {
    const box = document.getElementById("rmap");
    if (!box || !addrText || geoCache[addrText] === "fail") return;
    if (geoCache[addrText]) { box.innerHTML = geoCache[addrText]; return; }
    try {
      const q = encodeURIComponent(addrText + ", Jaleswar, Odisha, India");
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + q,
        { headers: { Accept: "application/json" } });
      const j = await r.json();
      if (!j || !j[0]) { geoCache[addrText] = "fail"; return; }
      const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon), d = 0.008;
      const html = '<iframe class="r-mapframe" loading="lazy" title="Map" src="https://www.openstreetmap.org/export/embed.html?bbox=' +
        (lon - d) + "," + (lat - d) + "," + (lon + d) + "," + (lat + d) +
        "&layer=mapnik&marker=" + lat + "," + lon + '"></iframe>';
      geoCache[addrText] = html;
      const live = document.getElementById("rmap");
      if (live && managedId === orderId) live.innerHTML = html; // rider may have switched orders
    } catch (e) { geoCache[addrText] = "fail"; }
  }

  // ── Earnings ───────────────────────────────────────────────────────────
  async function vEarnings() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [t, all, fees] = await Promise.all([
      DB.sb.from("orders").select("total,payment_method,delivery_fee").eq("rider_id", me.id).eq("status", "delivered").gte("updated_at", start.toISOString()),
      DB.sb.from("orders").select("id", { count: "exact", head: true }).eq("rider_id", me.id).eq("status", "delivered"),
      DB.sb.from("orders").select("id,delivery_fee,fee_paid_to_rider,updated_at").eq("rider_id", me.id).eq("status", "delivered").order("updated_at", { ascending: false }).limit(40),
    ]);
    if (t.error) throw t.error;
    if (fees.error) throw fees.error;
    const rows = t.data || [], fr = fees.data || [];
    const num = o => Number(o.delivery_fee || 0);
    const cod = rows.filter(o => o.payment_method === "cod").reduce((a, o) => a + Number(o.total || 0), 0);
    const feeToday = rows.reduce((a, o) => a + num(o), 0);
    const feeAll = fr.reduce((a, o) => a + num(o), 0);
    const feePaid = fr.filter(o => o.fee_paid_to_rider).reduce((a, o) => a + num(o), 0);
    const dstr = ts => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    app.innerHTML = '<div class="r-body"><h2>Earnings</h2>' +
      '<div class="r-earn"><h3>Today</h3>' +
      '<div class="row"><span>Deliveries completed</span><b>' + rows.length + "</b></div>" +
      '<div class="row"><span>Delivery fees earned</span><b>' + DB.money(feeToday) + "</b></div>" +
      '<div class="row"><span>Cash collected (COD)</span><b>' + DB.money(cod) + "</b></div></div>" +
      '<div class="r-earn"><h3>Delivery fee payouts</h3>' +
      '<div class="row"><span>Deliveries completed</span><b>' + (all.count || 0) + "</b></div>" +
      '<div class="row"><span>Total fees earned</span><b>' + DB.money(feeAll) + "</b></div>" +
      '<div class="row"><span>Paid by shop</span><b>' + DB.money(feePaid) + "</b></div>" +
      '<div class="row"><span>Pending payout</span><b>' + DB.money(feeAll - feePaid) + "</b></div></div>" +
      '<div class="r-earn"><h3>Recent deliveries</h3>' + (fr.length ? fr.map(o =>
        '<div class="row"><span>' + dstr(o.updated_at) + " · " + DB.money(num(o)) + "</span>" +
        '<span class="pill ' + (o.fee_paid_to_rider ? 'st-paid">Paid' : 'st-pending">Pending') + "</span></div>").join("")
        : '<div class="muted">No deliveries yet.</div>') + "</div></div>";
  }

  // ── Profile ────────────────────────────────────────────────────────────
  function vProfile() {
    app.innerHTML = '<div class="r-body"><h2>Profile</h2><div class="r-earn r-prof">' +
      '<div class="r-ava">' + esc(initials(me.name)) + "</div>" +
      '<h3 style="font-size:20px;color:#1e2a3a;margin:6px 0 2px">' + esc(me.name || "Rider") + "</h3>" +
      '<div class="muted">' + esc(me.phone || "") + "</div>" +
      '<div style="margin-top:10px"><span class="pill st-picked_up">Rider</span></div>' +
      '<div class="muted" style="margin-top:10px">' + esc(SHOP) + "</div>" +
      '<button class="btn r-signout" id="riderOut">Sign out</button></div></div>';
    document.getElementById("riderOut").onclick = async () => { await Auth.signOut(); location.reload(); };
  }

  // ── Realtime: new assignments arrive live ──────────────────────────────
  function watchOrders() {
    DB.sb.channel("rider-" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "rider_id=eq." + me.id },
        function (p) {
          if (p.eventType === "INSERT") DB.toast("New delivery assigned");
          refresh().catch(function (e) { DB.showErr(msg, e.message); });
        })
      .subscribe();
  }

  boot();
})();
