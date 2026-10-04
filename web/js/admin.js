// Admin dashboard — Jiban Jyoti Medical Store. Requires admin role (Auth.requireRole).
(function () {
  "use strict";
  var LOW_STOCK = 10;
  var NEXT = { placed: "confirmed", awaiting_rx: "confirmed", confirmed: "preparing",
    preparing: "out_for_delivery", assigned: "picked_up", picked_up: "out_for_delivery",
    out_for_delivery: "delivered" };
  var LBL = { placed: "Placed", awaiting_rx: "Awaiting Rx", confirmed: "Confirmed",
    preparing: "Preparing", assigned: "Assigned", picked_up: "Picked up",
    out_for_delivery: "Out for Delivery", delivered: "Delivered", cancelled: "Cancelled" };
  var esc = DB.esc;
  var view = document.getElementById("view");
  var foot = document.getElementById("foot");
  var cur = "dashboard", bound = false, orderFilter = "all", medQ = "", medLowOnly = false;

  function inr0(n) { return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
  function shortId(id) { return "ORD-" + String(id).replace(/-/g, "").slice(0, 6).toUpperCase(); }
  function pill(s) { return '<span class="pill ' + s + '">' + esc(LBL[s] || s) + "</span>"; }
  function fmtDate(d) {
    d = new Date(d);
    var date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    var h = d.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return date + ", " + h + ":" + String(d.getMinutes()).padStart(2, "0") + " " + ap;
  }
  function ago(d) {
    var m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    return h < 24 ? h + "h ago" : Math.floor(h / 24) + "d ago";
  }
  function head(title, sub) {
    return '<div class="page-head"><h2>' + esc(title) + "</h2><p>" + sub + "</p></div>";
  }
  function errBox(e) { return '<div class="card empty">Could not load: ' + esc(e.message) + "</div>"; }

  // ── minimal SVG icons (no emoji) ─────────────────────────────────────────
  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    orders: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    rx: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    truck: '<rect x="1" y="4" width="14" height="12" rx="1"/><path d="M15 9h4l4 4v3h-8V9z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-5"/><path d="M13 17V7"/><path d="M18 17v-8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
  };
  function ic(n, s) {
    s = s || 18;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>";
  }
  function paintIcons(root) {
    (root || document).querySelectorAll("[data-ic]").forEach(function (el) {
      if (!el.dataset.done) { el.innerHTML = ic(el.dataset.ic, el.dataset.sz || 18); el.dataset.done = "1"; }
    });
  }

  // ── boot ───────────────────────────────────────────────────────────────
  async function boot() {
    paintIcons(document);
    var r = await Auth.requireRole("admin");
    if (r.reason === "signin") { Auth.gate(view, boot, { showSignup: false }); return; }
    if (r.reason === "forbidden") {
      var who = r.profile ? esc(r.profile.name || r.profile.phone || "this account") : "this account";
      view.innerHTML = '<div class="card empty">Signed in as <b>' + who + '</b> — this page is for shop admins only.<br>' +
        '<span class="muted">Make this account admin with the SQL query, then refresh the page.</span><br><br>' +
        '<button class="btn" id="admSignout" style="max-width:240px;margin:0 auto">Sign out</button></div>';
      document.getElementById("admSignout").onclick = async function () { await Auth.signOut(); location.reload(); };
      return;
    }
    var nm = r.profile.name || "Admin";
    document.getElementById("adminName").textContent = nm;
    document.getElementById("adminAvatar").textContent = nm.trim().charAt(0).toUpperCase();
    if (!bound) { bindChrome(); bound = true; }
    updateBadges();
    subscribeRealtime();
    await show("dashboard");
    setInterval(function () { if (cur === "dashboard") show("dashboard", true); }, 60000);
  }

  function bindChrome() {
    document.getElementById("nav").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]"); if (!b) return;
      show(b.dataset.view);
    });
    document.getElementById("searchBtn").onclick = async function () {
      await show("medicines");
      var s = document.getElementById("medSearch"); if (s) s.focus();
    };
    document.getElementById("bellBtn").onclick = function (e) { e.stopPropagation(); toggleNotifs(); };
    document.getElementById("bellBtn").title = "Notifications";
    document.addEventListener("click", function (e) {
      var d = document.getElementById("notifDrop");
      if (d && !d.hidden && !d.contains(e.target)) d.hidden = true;
    });
    document.getElementById("supportLink").onclick = function (e) { e.preventDefault(); DB.toast("Call the shop owner — support number coming soon"); };
    view.addEventListener("click", onClick);
    view.addEventListener("change", onChange);
    view.addEventListener("input", function (e) {
      if (e.target.id === "medSearch") { medQ = e.target.value.trim(); loadMeds(); }
      if (e.target.id === "itemSearch") {
        var q = e.target.value.trim(), res = document.getElementById("itemResults");
        var host = document.getElementById("itemEditor");
        if (!res || !host) return;
        if (q.length < 2) { res.innerHTML = ""; return; }
        var orderId = host.dataset.order;
        DB.sb.from("medicines").select("id,name,strength,price").ilike("name", "%" + q + "%")
          .eq("is_active", true).limit(8).then(function (r) {
            var el = document.getElementById("itemResults"); if (!el) return;
            el.innerHTML = ((r.data || []).map(function (m) {
              return '<button class="chip" style="margin:4px 6px 0 0" data-act="line-pick" data-id="' + m.id + '" data-order="' + orderId + '">' +
                esc(m.name) + (m.strength ? " " + esc(m.strength) : "") + " — ₹" + m.price + "</button>";
            }).join("") || '<p class="muted">No matches.</p>');
          });
      }
    });
  }

  async function show(name, silent) {
    cur = name;
    document.querySelectorAll("#nav button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    if (!silent) view.innerHTML = '<div class="card empty">Loading…</div>';
    foot.textContent = "";
    try { await VIEWS[name](); }
    catch (e) { if (!silent) view.innerHTML = errBox(e); else DB.toast("Error: " + (e.message || e)); }
    if (name === "dashboard") foot.textContent = "Last updated: " + fmtDate(new Date()) + " • Auto-refresh every 60s";
  }

  // Bell badge: red whenever anything needs attention —
  // pending prescriptions, new/actionable orders, or low-stock medicines.
  async function updateBadges() {
    var res = await Promise.all([
      DB.sb.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      DB.sb.from("orders").select("id", { count: "exact", head: true }).in("status", ["placed", "awaiting_rx"]),
      DB.sb.from("medicines").select("id", { count: "exact", head: true }).eq("is_active", true).lte("stock", LOW_STOCK),
    ]);
    var rxN = res[0].count || 0, ordN = res[1].count || 0, lowN = res[2].count || 0;
    var rxEl = document.getElementById("rxBadge");
    rxEl.hidden = rxN === 0; rxEl.textContent = rxN;
    var n = rxN + ordN + lowN, bell = document.getElementById("bellBadge");
    bell.hidden = n === 0; bell.textContent = n > 99 ? "99+" : n;
  }

  // ── Realtime: orders / prescriptions / stock changes arrive instantly ──
  var rtOn = false;
  function subscribeRealtime() {
    if (rtOn) return; rtOn = true;
    DB.sb.channel("admin-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, function (p) {
        DB.toast("New order " + shortId(p.new.id));
        remoteChanged("orders");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, function () { remoteChanged("orders"); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescriptions" }, function (p) {
        DB.toast(p.new && p.new.image_url ? "New prescription uploaded" : "Customer requested Rx approval");
        remoteChanged("rx");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "medicines" }, function () { remoteChanged("medicines"); })
      .subscribe();
  }
  async function remoteChanged(kind) {
    updateBadges();
    try {
      if (cur === "dashboard") await show("dashboard", true);
      else if (cur === "orders" && kind === "orders") {
        var ed = document.getElementById("itemEditor");
        if (!ed || !ed.innerHTML.trim()) await loadOrders(); // don't wipe an open item editor
      }
      else if (cur === "rx" && kind === "rx") await vRx();
      // medicines view: never auto-refresh (would wipe typed inputs); the badge is enough
    } catch (e) { /* next refresh will catch up */ }
  }

  // ── Notification dropdown ──────────────────────────────────────────────
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  async function toggleNotifs() {
    var d = document.getElementById("notifDrop");
    if (!d) {
      d = document.createElement("div");
      d.id = "notifDrop"; d.className = "notif-drop"; d.hidden = true;
      document.body.appendChild(d);
      d.addEventListener("click", function (e) {
        var b = e.target.closest("[data-nview]"); if (!b) return;
        d.hidden = true;
        medQ = b.dataset.nq || ""; medLowOnly = b.dataset.nlow === "1";
        show(b.dataset.nview);
      });
    }
    if (!d.hidden) { d.hidden = true; return; }
    d.innerHTML = '<div class="notif-head">Notifications</div><div class="empty">Loading…</div>';
    d.hidden = false;
    try {
      var res = await Promise.all([
        DB.sb.from("prescriptions").select("id,created_at,image_url").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        DB.sb.from("orders").select("id,total,status,created_at").in("status", ["placed", "awaiting_rx"]).order("created_at", { ascending: false }).limit(5),
        DB.sb.from("medicines").select("id,name,stock").eq("is_active", true).lte("stock", LOW_STOCK).order("stock").limit(5),
      ]);
      if (res[0].error) throw res[0].error; if (res[1].error) throw res[1].error; if (res[2].error) throw res[2].error;
      var items = [];
      (res[0].data || []).forEach(function (p) {
        items.push({ t: p.image_url ? "Prescription awaiting review" : "Rx approval requested", s: timeAgo(p.created_at), v: "rx" });
      });
      (res[1].data || []).forEach(function (o) {
        items.push({ t: (o.status === "awaiting_rx" ? "Rx order waiting" : "New order") + " " + shortId(o.id) + " • " + DB.money(o.total), s: timeAgo(o.created_at), v: "orders" });
      });
      (res[2].data || []).forEach(function (m) {
        items.push({ t: esc(m.name) + " — only " + m.stock + " left", s: "Low stock", v: "medicines", low: "1" });
      });
      d.innerHTML = '<div class="notif-head">Notifications</div>' + (items.length ? items.map(function (it) {
        return '<button class="notif-item" data-nview="' + it.v + '"' + (it.low ? ' data-nlow="1"' : "") + '><div><b>' + it.t +
          "</b><small>" + it.s + " — tap to view</small></div></button>";
      }).join("") : '<div class="empty">All clear — nothing needs attention.</div>');
    } catch (err) { d.innerHTML = '<div class="notif-head">Notifications</div><div class="empty">Could not load.</div>'; }
  }

  // ── shared order fetch (orders + customer names + item lines) ────────────
  var riderList = [];
  async function loadRiders() {
    var r = await DB.sb.from("profiles").select("id,name,phone").eq("role", "rider").order("name");
    riderList = r.data || [];
  }
  async function enrichOrders(orders) {
    var ids = orders.map(function (o) { return o.id; });
    var cids = [...new Set(orders.map(function (o) { return o.customer_id; }))];
    var out = { names: {}, items: {} };
    if (!ids.length) return out;
    var pr = await DB.sb.from("profiles").select("id,name,phone").in("id", cids);
    (pr.data || []).forEach(function (p) { out.names[p.id] = p; });
    var it = await DB.sb.from("order_items").select("order_id,qty,medicines(name,strength)").in("order_id", ids);
    (it.data || []).forEach(function (row) {
      (out.items[row.order_id] = out.items[row.order_id] || []).push(row);
    });
    return out;
  }
  function itemSummary(lines) {
    if (!lines || !lines.length) return "—";
    var s = lines.slice(0, 2).map(function (l) {
      var m = l.medicines || {};
      return esc(m.name || "?") + (m.strength ? " " + esc(m.strength) : "") + " ×" + l.qty;
    }).join(" • ");
    return lines.length > 2 ? s + ' <span class="muted">+' + (lines.length - 2) + " more</span>" : s;
  }
  function orderRow(o, x) {
    var c = x.names[o.customer_id] || {};
    var adv = NEXT[o.status] ? '<button class="btn sm" data-act="adv" data-id="' + o.id + '" data-to="' + NEXT[o.status] + '">→ ' + esc(LBL[NEXT[o.status]]) + "</button>" : "";
    var cancel = (o.status !== "delivered" && o.status !== "cancelled")
      ? '<button class="btn sm danger" data-act="cancel" data-id="' + o.id + '">Cancel</button>' : "";
    var itemsBtn = (o.status !== "delivered" && o.status !== "cancelled")
      ? '<button class="btn sm" data-act="items" data-id="' + o.id + '">Items</button>' : "";
    var assignSel = (o.status === "preparing" || o.status === "confirmed") && riderList.length
      ? '<select class="mini-input" data-assign="' + o.id + '" aria-label="Assign rider" style="max-width:130px">' +
        '<option value="">Assign rider…</option>' +
        riderList.map(function (rd) {
          return '<option value="' + rd.id + '"' + (o.rider_id === rd.id ? " selected" : "") + ">" + esc(rd.name || rd.phone || "Rider") + "</option>";
        }).join("") + "</select>" : "";
    var rxBtn = o.prescription_id
      ? '<button class="btn sm" data-act="rximg" data-id="' + o.prescription_id + '">View Rx</button>' : "";
    var itemsCell = (x.items[o.id] && x.items[o.id].length) ? itemSummary(x.items[o.id])
      : (o.prescription_id ? "<b>Prescription order</b>" : "—");
    return "<tr><td class='oid'>" + shortId(o.id) + "<br><small class='muted'>" + ago(o.created_at) + "</small>" +
      (o.delivery_otp && o.status !== "delivered" && o.status !== "cancelled" ? "<br><small>Code: <b>" + esc(o.delivery_otp) + "</b></small>" : "") + "</td>" +
      "<td><b>" + esc(c.name || "Customer") + "</b>" + (c.phone ? "<br><small class='muted'>" + esc(c.phone) + "</small>" : "") + "</td>" +
      "<td class='items-cell'>" + itemsCell + "</td>" +
      "<td><b>" + DB.money(o.total) + "</b></td>" +
      "<td>" + pill(o.status) + "</td>" +
      '<td><div class="row-actions">' + adv + itemsBtn + rxBtn + assignSel + cancel + "</div></td></tr>";
  }

  // ── Order items editor (price up a prescription order after the customer call)
  // Adjust one medicine's stock by delta (admin only; keeps inventory honest).
  async function bumpStock(medId, delta) {
    if (!medId || !delta) return;
    var s = await DB.sb.from("medicines").select("stock").eq("id", medId).single();
    if (s.error || !s.data) return;
    await DB.sb.from("medicines").update({ stock: Math.max(0, s.data.stock + delta) }).eq("id", medId);
  }
  // Put back stock for every line of an order (cancel / Rx-strip).
  async function restoreStockForOrder(orderId) {
    var li = await DB.sb.from("order_items").select("qty,medicine_id").eq("order_id", orderId);
    (li.data || []).forEach(function (l) { bumpStock(l.medicine_id, l.qty); });
  }
  async function recalcOrder(orderId) {
    var li = await DB.sb.from("order_items").select("qty,unit_price").eq("order_id", orderId);
    if (li.error) throw li.error;
    var sub = (li.data || []).reduce(function (s, l) { return s + Number(l.qty) * Number(l.unit_price); }, 0);
    var fee = await distFee(orderId, sub);
    var u = await DB.sb.from("orders").update({ subtotal: sub, delivery_fee: fee, total: sub + fee }).eq("id", orderId);
    if (u.error) throw u.error;
  }
  // Distance-based delivery fee for an order (₹30 fallback when the address can't be located).
  async function distFee(orderId, sub) {
    try {
      var o = await DB.sb.from("orders").select("address_id").eq("id", orderId).single();
      if (o.error || !o.data || !o.data.address_id) return 30;
      var a = await DB.sb.from("addresses").select("lat,lon,label,address_text").eq("id", o.data.address_id).single();
      if (a.error || !a.data) return 30;
      var km = null;
      if (a.data.lat != null && a.data.lon != null)
        km = DB.geo.haversineKm(DB.geo.SHOP.lat, DB.geo.SHOP.lon, a.data.lat, a.data.lon);
      else {
        var g = await DB.geo.geocode(a.data.address_text, a.data.label).catch(function () { return null; });
        if (g) km = DB.geo.haversineKm(DB.geo.SHOP.lat, DB.geo.SHOP.lon, g.lat, g.lon);
      }
      return km == null ? 30 : DB.geo.feeForKm(km, sub);
    } catch (e) { return 30; }
  }
  async function editItems(orderId) {
    var host = document.getElementById("itemEditor"); if (!host) return;
    host.dataset.order = orderId;
    var o = await DB.sb.from("orders").select("id,total").eq("id", orderId).single();
    if (o.error) throw o.error;
    var li = await DB.sb.from("order_items").select("id,qty,unit_price,medicines(name,strength)").eq("order_id", orderId);
    if (li.error) throw li.error;
    var rows = (li.data || []).map(function (l) {
      var m = l.medicines || {};
      return "<tr><td><b>" + esc(m.name || "?") + "</b>" + (m.strength ? "<br><small class='muted'>" + esc(m.strength) + "</small>" : "") + "</td>" +
        '<td><input class="mini-input" type="number" min="1" value="' + l.qty + '" data-act="line-qty" data-id="' + l.id + '" data-order="' + orderId + '" style="width:64px"></td>' +
        '<td><input class="mini-input" type="number" min="0" step="0.01" value="' + l.unit_price + '" data-act="line-price" data-id="' + l.id + '" data-order="' + orderId + '" style="width:92px"></td>' +
        "<td><b>" + DB.money(l.qty * l.unit_price) + "</b></td>" +
        '<td><button class="btn sm danger" data-act="line-del" data-id="' + l.id + '" data-order="' + orderId + '">Remove</button></td></tr>';
    }).join("");
    host.innerHTML = '<div class="card" style="border:1px solid var(--brand)"><div class="card-head"><h3>Items — ' + shortId(orderId) + '</h3>' +
      '<button class="btn sm ghost" data-act="items-close">Close</button></div>' +
      '<table class="grid"><tr><th>Medicine</th><th>Qty</th><th>Price ₹</th><th></th><th></th></tr>' +
      (rows || '<tr><td colspan="5" class="muted">No items yet — add medicines below after the customer call.</td></tr>') + "</table>" +
      '<input class="searchbar" id="itemSearch" placeholder="Search medicine to add…" style="margin-top:10px"><div id="itemResults"></div>' +
      '<p class="muted" style="margin-top:10px">Totals update automatically (free delivery on ₹1,000+ orders).</p></div>';
    host.scrollIntoView({ block: "nearest" });
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  async function vDashboard() {
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var t1 = new Date(t0); t1.setDate(t1.getDate() - 1);
    var res = await Promise.all([
      DB.sb.from("orders").select("id,total,status,created_at").gte("created_at", t1.toISOString()),
      DB.sb.from("orders").select("id,customer_id,total,status,created_at").order("created_at", { ascending: false }).limit(6),
      DB.sb.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      DB.sb.from("medicines").select("id,name,strength,stock").eq("is_active", true).lte("stock", LOW_STOCK).order("stock").limit(60),
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    var two = res[0].data || [], recent = res[1].data || [];
    var pendRx = res[2].count || 0, low = res[3].data || [];
    var iso0 = t0.toISOString();
    var t = two.filter(function (o) { return o.created_at >= iso0; });
    var y = two.filter(function (o) { return o.created_at < iso0; });
    var rev = function (arr) { return arr.reduce(function (s, o) { return s + (o.status === "cancelled" ? 0 : Number(o.total)); }, 0); };
    var pct = function (a, b) {
      if (!b) return a ? "new today" : "—";
      var p = Math.round((a - b) / b * 100);
      return (p >= 0 ? "+" : "") + p + "% vs yesterday " + (p >= 0 ? "↑" : "↓");
    };
    var x = await enrichOrders(recent);
    var cards = [
      { ico: "bag", cls: "teal", label: "Today's Orders", num: t.length, sub: pct(t.length, y.length), subCls: "up" },
      { ico: "cash", cls: "teal", label: "Revenue", num: inr0(rev(t)), sub: pct(rev(t), rev(y)), subCls: "up" },
      { ico: "rx", cls: "amber", label: "Pending Rx Verification", num: pendRx, sub: pendRx ? "Requires action" : "All clear", subCls: "warn" },
      { ico: "alert", cls: "red", label: "Low Stock Alerts", num: low.length, sub: low.length ? "Restock recommended" : "Stock healthy", subCls: "bad", go: "medicines", low: "1" },
    ];
    var html = head("Dashboard", "Overview of today's pharmacy operations and deliveries • Today, " +
      new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));
    html += '<div class="stats">' + cards.map(function (c) {
      var go = c.go ? ' data-act="nav" data-view="' + c.go + '"' + (c.low ? ' data-low="1"' : "") + ' style="cursor:pointer"' : "";
      return '<div class="stat"' + go + '><div class="stat-top"><span class="stat-ico ' + c.cls + '">' + ic(c.ico, 22) + "</span>" + esc(c.label) +
        '</div><div class="stat-num">' + c.num + '</div><div class="stat-sub ' + c.subCls + '">' + esc(c.sub) + "</div></div>";
    }).join("") + "</div>";
    html += '<div class="cols"><div class="card"><div class="card-head"><h3>Recent Orders</h3>' +
      '<button class="link" data-act="nav" data-view="orders">View All →</button></div>' +
      (recent.length ? '<table class="grid"><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th></tr>' +
        recent.map(function (o) {
          var c = x.names[o.customer_id] || {};
          return "<tr><td class='oid'>" + shortId(o.id) + "</td><td>" + esc(c.name || "Customer") + "</td>" +
            "<td class='items-cell'>" + itemSummary(x.items[o.id]) + "</td><td><b>" + DB.money(o.total) + "</b></td><td>" + pill(o.status) + "</td></tr>";
        }).join("") + "</table>" : '<div class="empty">No orders yet.</div>') + "</div>";
    html += '<div class="card"><div class="card-head"><h3>' + ic("alert", 20) + ' Low Stock Alerts</h3></div>' +
      (low.length ? low.slice(0, 5).map(function (m) {
        return '<div class="stock-row" data-act="nav" data-view="medicines" data-q="' + esc(m.name) + '" style="cursor:pointer" title="Restock this medicine"><span class="stock-ico">' + ic(m.stock <= 5 ? "alert" : "pill", 18) + "</span><div><b>" +
          esc(m.name) + (m.strength ? " " + esc(m.strength) : "") + "</b><small class='" + (m.stock <= 5 ? "" : "amber") + "'>" +
          m.stock + " left • Reorder at " + LOW_STOCK + "</small></div></div>";
      }).join("") : '<div class="empty">Stock levels look good.</div>') +
      '<button class="btn-outline" data-act="nav" data-view="medicines">' + ic("plus", 16) + ' Manage Inventory</button></div></div>';
    view.innerHTML = html;
    updateBadges();
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  var FILTERS = ["all", "placed", "awaiting_rx", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
  async function vOrders() {
    view.innerHTML = head("Orders", "Tap → to move an order to its next stage.") +
      '<div class="chips">' + FILTERS.map(function (f) {
        return '<button class="chip' + (f === orderFilter ? " active" : "") + '" data-act="filter" data-f="' + f + '">' +
          (f === "all" ? "All" : esc(LBL[f])) + "</button>";
      }).join("") + '</div><div id="itemEditor"></div><div class="card"><div id="olist"><div class="empty">Loading…</div></div></div>';
    await loadRiders();
    await loadOrders();
  }
  async function loadOrders() {
    var q = DB.sb.from("orders").select("id,customer_id,total,status,delivery_slot,prescription_id,rider_id,delivery_otp,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (orderFilter !== "all") q = q.eq("status", orderFilter);
    var r = await q; if (r.error) throw r.error;
    var x = await enrichOrders(r.data || []);
    document.getElementById("olist").innerHTML = (r.data && r.data.length)
      ? '<table class="grid"><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Actions</th></tr>' +
        r.data.map(function (o) { return orderRow(o, x); }).join("") + "</table>"
      : '<div class="empty">No orders in this stage.</div>';
  }

  // Re-sync a single order row from the server (no full-list rebuild needed).
  async function refreshOrderRow(tr, id) {
    if (!tr) { await show(cur, true); return; }
    var r = await DB.sb.from("orders").select("id,customer_id,total,status,delivery_slot,prescription_id,rider_id,delivery_otp,created_at").eq("id", id).single();
    if (r.error) throw r.error;
    var x = await enrichOrders([r.data]);
    var t = document.createElement("table"); t.innerHTML = "<tbody>" + orderRow(r.data, x) + "</tbody>";
    var nr = t.querySelector("tr");
    if (nr) tr.replaceWith(nr);
    updateBadges();
  }

  // ── Medicines ────────────────────────────────────────────────────────────
  async function vMedicines() {
    view.innerHTML = head("Medicines", "Price and stock edits go live on the customer app immediately.") +
      '<div class="form-card"><b>Add medicine</b><div class="form-grid" style="margin-top:10px">' +
      '<input id="mName" placeholder="Name *"><input id="mBrand" placeholder="Brand"><input id="mStrength" placeholder="Strength (500mg)">' +
      '<select id="mForm"><option>Tablet</option><option>Capsule</option><option>Syrup</option><option>Drops</option><option>Injection</option><option>Inhaler</option><option>Ointment</option><option>Other</option></select>' +
      '<input id="mPack" placeholder="Pack (10 tabs)"><input id="mCat" placeholder="Category">' +
      '<input id="mPrice" type="number" min="0" step="0.01" placeholder="Price ₹ *">' +
      '<input id="mStock" type="number" min="0" step="1" placeholder="Stock *">' +
      "</div>" +
      '<div class="row" style="margin-top:10px;align-items:center"><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="mRx"> Rx required</label>' +
      '<span style="flex:1"></span><button class="btn" data-act="med-add">Add medicine</button></div></div>' +
      '<input class="searchbar" id="medSearch" placeholder="Search medicines…" value="' + esc(medQ) + '">' +
      '<div style="margin:10px 0"><button class="chip' + (medLowOnly ? " active" : "") + '" data-act="low-toggle">' +
      (medLowOnly ? "Showing low stock only — tap to show all" : "Show low stock only") + "</button></div>" +
      '<div class="card"><div id="mlist"><div class="empty">Loading…</div></div></div>';
    await loadMeds();
  }
  async function loadMeds() {
    var q = DB.sb.from("medicines").select("id,name,brand,strength,form,pack_size,price,stock,rx_required,is_active")
      .order("name").limit(200);
    if (medQ) q = q.ilike("name", "%" + medQ + "%");
    if (medLowOnly) q = q.lte("stock", LOW_STOCK);
    var r = await q; if (r.error) throw r.error;
    var el = document.getElementById("mlist"); if (!el) return;
    el.innerHTML = (r.data && r.data.length)
      ? '<table class="grid"><tr><th>Medicine</th><th>Price ₹</th><th>Stock</th><th>Rx</th><th>Live</th><th></th></tr>' +
        r.data.map(function (m) {
          return "<tr><td><b>" + esc(m.name) + "</b>" + (m.strength ? " " + esc(m.strength) : "") +
            "<br><small class='muted'>" + esc([m.brand, m.form, m.pack_size].filter(Boolean).join(" • ")) + "</small></td>" +
            '<td><input class="mini-input" data-k="price" data-id="' + m.id + '" type="number" min="0" step="0.01" value="' + (m.price == null ? "" : m.price) + '"></td>' +
            '<td><b>' + m.stock + '</b> <small class="muted">in stock</small><br>' +
            '<input class="mini-input" data-k="stockadd" data-id="' + m.id + '" type="number" min="0" step="1" placeholder="+ Add" style="width:96px;margin-top:4px"></td>' +
            "<td>" + (m.rx_required ? ic("lock", 15) : "—") + "</td>" +
            '<td><input type="checkbox" data-act="med-live" data-id="' + m.id + '"' + (m.is_active ? " checked" : "") + "></td>" +
            '<td><button class="btn sm" data-act="med-save" data-id="' + m.id + '">Save</button></td></tr>';
        }).join("") + "</table>"
      : '<div class="empty">No medicines found.</div>';
  }

  // ── Prescriptions ────────────────────────────────────────────────────────
  async function vRx() {
    var r = await DB.sb.from("prescriptions").select("id,customer_id,image_url,status,created_at")
      .order("created_at", { ascending: false }).limit(40);
    if (r.error) throw r.error;
    var rows = r.data || [];
    var cids = [...new Set(rows.map(function (x) { return x.customer_id; }))];
    var names = {};
    if (cids.length) {
      var pr = await DB.sb.from("profiles").select("id,name,phone").in("id", cids);
      (pr.data || []).forEach(function (p) { names[p.id] = p; });
    }
    var pend = rows.filter(function (x) { return x.status === "pending"; });
    var done = rows.filter(function (x) { return x.status !== "pending"; });
    for (var i = 0; i < pend.length; i++) {
      if (!pend[i].image_url) continue; // approval request — no image to sign
      var s = await DB.sb.storage.from("prescriptions").createSignedUrl(pend[i].image_url, 600);
      pend[i].url = s.data ? s.data.signedUrl : null;
    }
    var card = function (x, actions) {
      var c = names[x.customer_id] || {};
      var imgHtml = x.url
        ? '<img src="' + x.url + '" data-act="rx-view" data-url="' + esc(x.url) + '" alt="prescription">'
        : (x.image_url
          ? '<div class="empty">no image</div>'
          : '<div class="empty">Approval requested — no prescription photo.<br>Call the customer to verify, then approve.</div>');
      return '<div class="rx-card">' + imgHtml +
        '<div class="rx-meta"><b>' + esc(c.name || "Customer") + "</b>" +
        (!x.image_url ? ' <span class="status pending">approval request</span>' : "") +
        (c.phone ? "<small>" + esc(c.phone) + "</small>" : "") +
        "<small>" + (x.image_url ? "Uploaded " : "Requested ") + ago(x.created_at) + "</small>" +
        (actions ? '<div class="row-actions" style="margin-top:8px">' +
          '<button class="btn sm" data-act="rx-ok" data-id="' + x.id + '">Approve</button>' +
          '<button class="btn sm danger" data-act="rx-no" data-id="' + x.id + '">Reject</button></div>'
          : '<div style="margin-top:6px">' + pill(x.status) + "</div>") + "</div></div>";
    };
    view.innerHTML = head("Prescriptions", "Approve a prescription before its medicines can be sold.") +
      '<div class="card"><div class="card-head"><h3>Pending verification (' + pend.length + ")</h3></div>" +
      (pend.length ? pend.map(function (x) { return card(x, true); }).join("") : '<div class="empty">Nothing waiting.</div>') + "</div>" +
      '<div class="card" style="margin-top:18px"><div class="card-head"><h3>Reviewed</h3></div>' +
      (done.length ? done.map(function (x) { return card(x, false); }).join("") : '<div class="empty">No reviewed prescriptions yet.</div>') + "</div>";
  }

  // ── Delivery staff ───────────────────────────────────────────────────────
  async function vStaff() {
    view.innerHTML = head("Delivery Staff", "Create rider logins here, or promote an existing customer. Revoking removes their rider access.") +
      '<div class="card"><b>New rider account</b>' +
      '<p class="muted" style="margin:6px 0">Fill the details, set a temporary password, and share the login with the rider. They sign in on the rider app with email + password.</p>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<input class="input" id="nrName" placeholder="Full name" autocomplete="off" style="max-width:190px">' +
      '<input class="input" id="nrEmail" type="email" placeholder="Email" autocomplete="off" style="max-width:210px">' +
      '<input class="input" id="nrPhone" placeholder="Phone" autocomplete="off" style="max-width:150px">' +
      '<input class="input" id="nrPass" placeholder="Temp password" autocomplete="new-password" style="max-width:160px">' +
      '<button class="btn sm secondary" data-act="gen-pass">Generate</button>' +
      '<button class="btn sm" data-act="nr-create">Create rider</button></div>' +
      '<div id="nrResult" style="margin-top:8px"></div></div>' +
      '<div class="card" id="staffTable"><div class="empty">Loading…</div></div>' +
      '<div class="card" id="payoutBox"><div class="empty">Loading…</div></div>';
    await loadStaffTable();
    await loadPayouts();
  }

  async function loadStaffTable() {
    var box = document.getElementById("staffTable");
    var r = await DB.sb.from("profiles").select("id,name,phone,created_at").eq("role", "rider").order("created_at", { ascending: false });
    if (r.error) { box.innerHTML = '<div class="empty">Error: ' + esc(r.error.message) + "</div>"; return; }
    var riders = r.data || [], stats = {};
    if (riders.length) {
      var o = await DB.sb.from("orders").select("rider_id,status,updated_at")
        .in("rider_id", riders.map(function (x) { return x.id; }));
      var todayS = new Date().toISOString().slice(0, 10);
      (o.data || []).forEach(function (x) {
        var s = stats[x.rider_id] || (stats[x.rider_id] = { active: 0, today: 0, all: 0 });
        if (x.status === "assigned" || x.status === "picked_up" || x.status === "out_for_delivery") s.active++;
        if (x.status === "delivered") { s.all++; if ((x.updated_at || "").slice(0, 10) === todayS) s.today++; }
      });
    }
    box.innerHTML = riders.length
      ? '<table class="grid"><tr><th>Name</th><th>Phone</th><th>Active</th><th>Today</th><th>All time</th><th></th></tr>' + riders.map(function (p) {
          var s = stats[p.id] || { active: 0, today: 0, all: 0 };
          return "<tr><td><b>" + esc(p.name || "—") + "</b></td>" +
            "<td>" + (p.phone ? '<a href="tel:' + esc(p.phone) + '">' + esc(p.phone) + "</a>" : "—") + "</td>" +
            "<td>" + s.active + "</td><td>" + s.today + "</td><td>" + s.all + "</td>" +
            '<td><button class="btn sm danger" data-act="unmake-rider" data-id="' + p.id + '" data-name="' + esc(p.name || "rider") + '">Revoke</button></td></tr>';
        }).join("") + "</table>"
      : '<div class="empty">No riders yet.</div>';
  }

  // Delivery-fee payouts: the fee on each delivered order belongs to its rider.
  // Mark it paid once settled; the rider sees the status live on Earnings.
  async function loadPayouts() {
    var box = document.getElementById("payoutBox");
    var r = await DB.sb.from("orders").select("id,delivery_fee,fee_paid_to_rider,updated_at,rider_id")
      .eq("status", "delivered").not("rider_id", "is", null)
      .order("updated_at", { ascending: false }).limit(100);
    if (r.error) { box.innerHTML = '<div class="empty">Error: ' + esc(r.error.message) + "</div>"; return; }
    var rows = r.data || [], names = {};
    if (rows.length) {
      var p = await DB.sb.from("profiles").select("id,name")
        .in("id", rows.map(function (o) { return o.rider_id; }));
      (p.data || []).forEach(function (x) { names[x.id] = x.name; });
    }
    var pend = rows.filter(function (o) { return !o.fee_paid_to_rider; })
      .reduce(function (a, o) { return a + Number(o.delivery_fee || 0); }, 0);
    box.innerHTML = "<b>Delivery fee payouts</b>" +
      '<p class="muted" style="margin:6px 0">Each order\u2019s delivery fee belongs to its rider. Mark it paid once you settle it — it reflects on the rider\u2019s Earnings page. Pending total: <b>' + DB.money(pend) + "</b></p>" +
      (rows.length ? '<table class="grid"><tr><th>Date</th><th>Rider</th><th>Fee</th><th>Status</th><th></th></tr>' + rows.map(function (o) {
        var paid = !!o.fee_paid_to_rider;
        return "<tr><td>" + new Date(o.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + "</td>" +
          "<td>" + esc(names[o.rider_id] || "—") + "</td>" +
          "<td>" + DB.money(Number(o.delivery_fee || 0)) + "</td>" +
          '<td><span class="pill ' + (paid ? 'delivered">Paid' : 'preparing">Unpaid') + "</span></td>" +
          '<td><button class="btn sm' + (paid ? " secondary" : "") + '" data-act="fee-paid" data-id="' + o.id + '" data-v="' + (paid ? "0" : "1") + '">' +
          (paid ? "Mark unpaid" : "Mark paid") + "</button></td></tr>";
      }).join("") + "</table>" : '<div class="empty">No delivered orders yet.</div>');
  }

  function genPass() {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", p = "";
    for (var i = 0; i < 10; i++) p += c[Math.floor(Math.random() * c.length)];
    document.getElementById("nrPass").value = p;
  }

  // Creates the rider's login with a throwaway client (own session store) so
  // the sign-up session never replaces the admin's session in this browser.
  async function provisionRider() {
    var g = function (id) { return (document.getElementById(id).value || "").trim(); };
    var name = g("nrName"), email = g("nrEmail"), phone = g("nrPhone"), pw = document.getElementById("nrPass").value;
    var box = document.getElementById("nrResult");
    if (!name || !email || pw.length < 6) { box.innerHTML = '<span class="muted">Fill name, email and a password (min 6 chars).</span>'; return; }
    box.innerHTML = '<span class="muted">Creating…</span>';
    var tmp = null;
    try {
      tmp = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY,
        { auth: { storageKey: "jj-rider-provision" } });
      var s = await tmp.auth.signUp({ email: email, password: pw });
      if (s.error) throw s.error;
      var nu = s.data && s.data.user;
      if (!nu) throw new Error("Sign-up returned no user.");
      if (!s.data.session) throw new Error("Email confirmation is ON in Supabase Auth — turn it off, then retry.");
      var ins = await tmp.from("profiles").insert({ id: nu.id, role: "customer", name: name, phone: phone || null, must_change_password: true });
      if (ins.error) {
        if (ins.error.code === "23505") throw new Error("This email already has an account — ask them to use the customer app, or delete that account first.");
        throw ins.error;
      }
      var up = await DB.sb.from("profiles").update({ role: "rider" }).eq("id", nu.id);
      if (up.error) throw up.error;
      box.innerHTML = "<b>Rider created.</b> Share this login with " + esc(name) + ":<br>Email: <b>" + esc(email) + "</b><br>Temp password: <b>" + esc(pw) + "</b>";
      ["nrName", "nrEmail", "nrPhone", "nrPass"].forEach(function (id) { document.getElementById(id).value = ""; });
      await loadStaffTable();
    } catch (e) {
      box.innerHTML = '<span class="muted">Error: ' + esc(e.message) + "</span>";
    } finally {
      try { if (tmp) await tmp.auth.signOut(); } catch (e2) {}
    }
  }

  // ── Delivery-staff actions (delegated) ───────────────────────────────────
  async function unmakeRider(id, name) {
    var o = await DB.sb.from("orders").select("id", { count: "exact", head: true })
      .eq("rider_id", id).in("status", ["assigned", "picked_up", "out_for_delivery"]);
    if (o.error) { DB.toast("Error: " + o.error.message); return; }
    if (o.count) { DB.toast(name + " has " + o.count + " active deliver" + (o.count === 1 ? "y" : "ies") + " — reassign first"); return; }
    if (!confirm("Revoke " + name + "'s rider access? They will no longer be able to use the rider app.")) return;
    var r = await DB.sb.from("profiles").update({ role: "customer" }).eq("id", id);
    DB.toast(r.error ? "Error: " + r.error.message : "Rider access revoked");
    if (!r.error) loadStaffTable();
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  var repPeriod = "day", repDate = new Date().toISOString().slice(0, 10);
  var repCache = { rows: [], label: "", rev: 0, n: 0 };
  function repRange() {
    var start, end, label;
    var todayS = new Date().toISOString().slice(0, 10);
    if (repPeriod === "day") {
      start = repDate; end = repDate;
      label = "Day: " + new Date(repDate + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } else if (repPeriod === "week") {
      var d = new Date(); d.setDate(d.getDate() - 6);
      start = d.toISOString().slice(0, 10); end = todayS;
      label = "Week: " + start + " to " + end;
    } else {
      start = todayS.slice(0, 7) + "-01"; end = todayS;
      label = "Month: " + new Date(start + "T00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }
    return { start: start, end: end, label: label };
  }
  async function vReports() {
    var todayS = new Date().toISOString().slice(0, 10);
    view.innerHTML = head("Reports", "Day-wise sales. Download as Excel or PDF.") +
      '<div class="card"><div class="rep-bar">' +
      '<div class="chips" style="margin:0">' +
      ["day", "week", "month"].map(function (p) {
        return '<button class="chip' + (p === repPeriod ? " active" : "") + '" data-act="rep-p" data-p="' + p + '">' +
          p.charAt(0).toUpperCase() + p.slice(1) + "</button>";
      }).join("") + "</div>" +
      '<input type="date" id="repDate" value="' + repDate + '" max="' + todayS + '"' + (repPeriod === "day" ? "" : ' style="display:none"') + ">" +
      '<span style="flex:1"></span>' +
      '<button class="btn" data-act="rep-xls">' + ic("download", 15) + ' Excel</button>' +
      '<button class="btn ghost" data-act="rep-pdf">' + ic("download", 15) + " PDF</button>" +
      '</div><div id="repBody" style="margin-top:18px"><div class="empty">Loading…</div></div></div>';
    await loadReport();
  }
  async function loadReport() {
    var rg = repRange();
    var r = await DB.sb.from("orders").select("id,total,created_at")
      .neq("status", "cancelled")
      .gte("created_at", rg.start + "T00:00:00").lte("created_at", rg.end + "T23:59:59")
      .order("created_at", { ascending: false }).limit(5000);
    if (r.error) throw r.error;
    var byDay = {};
    (r.data || []).forEach(function (o) {
      var d = o.created_at.slice(0, 10);
      byDay[d] = byDay[d] || { n: 0, rev: 0 };
      byDay[d].n++; byDay[d].rev += Number(o.total);
    });
    var rows = Object.keys(byDay).sort().reverse().map(function (d) {
      return { date: d, n: byDay[d].n, rev: byDay[d].rev };
    });
    var rev = rows.reduce(function (s, x) { return s + x.rev; }, 0);
    var n = rows.reduce(function (s, x) { return s + x.n; }, 0);
    repCache = { rows: rows, label: rg.label, rev: rev, n: n };
    var el = document.getElementById("repBody"); if (!el) return;
    el.innerHTML =
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat"><div class="stat-top"><span class="stat-ico teal">' + ic("cash", 22) + "</span>Revenue</div>" +
      '<div class="stat-num">' + inr0(rev) + "</div><div class='stat-sub up'>" + esc(rg.label) + "</div></div>" +
      '<div class="stat"><div class="stat-top"><span class="stat-ico teal">' + ic("bag", 22) + "</span>Orders</div>" +
      '<div class="stat-num">' + n + "</div></div>" +
      '<div class="stat"><div class="stat-top"><span class="stat-ico amber">' + ic("chart", 22) + "</span>Avg order value</div>" +
      '<div class="stat-num">' + inr0(n ? rev / n : 0) + "</div></div></div>" +
      (rows.length ? '<table class="grid"><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr>' +
        rows.map(function (x) {
          return "<tr><td><b>" + new Date(x.date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
            "</b></td><td>" + x.n + "</td><td><b>" + inr0(x.rev) + "</b></td></tr>";
        }).join("") + "</table>" : '<div class="empty">No sales in this period.</div>');
  }
  function downloadCSV() {
    if (!repCache.rows.length) { DB.toast("Nothing to download"); return; }
    var csv = "Date,Orders,Revenue (INR)\n" + repCache.rows.map(function (x) {
      return x.date + "," + x.n + "," + Math.round(x.rev);
    }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "jj-sales-report-" + repPeriod + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    DB.toast("Excel file downloaded");
  }
  function downloadPDF() {
    if (!repCache.rows.length) { DB.toast("Nothing to download"); return; }
    var rowsHtml = repCache.rows.map(function (x) {
      return "<tr><td>" + x.date + "</td><td>" + x.n + "</td><td>" + inr0(x.rev) + "</td></tr>";
    }).join("");
    var w = window.open("", "_blank");
    w.document.write("<!DOCTYPE html><html><head><title>Sales report</title><style>" +
      "body{font-family:Arial,sans-serif;padding:36px;color:#222;max-width:800px;margin:auto}" +
      "h1{font-size:22px;margin:0}h1 small{display:block;font-size:13px;color:#666;margin-top:4px}" +
      ".sum{display:flex;gap:16px;margin:20px 0}.sum div{background:#f4f6f8;padding:12px 20px;border-radius:8px;flex:1}" +
      ".sum b{font-size:20px;display:block}.sum span{font-size:12px;color:#666}" +
      "table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 10px;text-align:left;font-size:13px}" +
      "th{background:#f0f2f5}</style></head><body>" +
      "<h1>Jiban Jyoti Medical Store<small>Sales report — " + esc(repCache.label) + "</small></h1>" +
      '<div class="sum"><div><b>' + inr0(repCache.rev) + "</b><span>Revenue</span></div><div><b>" + repCache.n +
      "</b><span>Orders</span></div><div><b>" + inr0(repCache.n ? repCache.rev / repCache.n : 0) + "</b><span>Avg order</span></div></div>" +
      "<table><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr>" + rowsHtml + "</table>" +
      "<p style='color:#888;font-size:12px;margin-top:16px'>Generated " + fmtDate(new Date()) + " • Excludes cancelled orders</p>" +
      "<scr" + "ipt>window.onload=function(){window.print()};</scr" + "ipt></body></html>");
    w.document.close();
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  function vSettings() {
    view.innerHTML = head("Settings", "Shop details shown across the app.") +
      '<div class="card"><table class="grid">' +
      "<tr><td><b>Shop name</b></td><td>Jiban Jyoti Medical Store (JJ)</td></tr>" +
      "<tr><td><b>Address</b></td><td>Uttarpada, Jaleswar, Odisha</td></tr>" +
      "<tr><td><b>Payment</b></td><td>Cash on Delivery</td></tr>" +
      "<tr><td><b>Low-stock threshold</b></td><td>" + LOW_STOCK + " units</td></tr>" +
      '</table><div style="margin-top:16px"><button class="btn ghost" data-act="signout">Sign out</button></div></div>';
  }

  var VIEWS = { dashboard: vDashboard, orders: vOrders, medicines: vMedicines, rx: vRx, staff: vStaff, reports: vReports, settings: vSettings };

  // ── actions (delegated) ──────────────────────────────────────────────────
  function rowVals(id) {
    var vals = {};
    view.querySelectorAll("input[data-id='" + id + "']").forEach(function (inp) {
      if (inp.dataset.k) vals[inp.dataset.k] = inp.value === "" ? null : Number(inp.value);
    });
    return vals;
  }
  async function onClick(e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act, id = b.dataset.id;
    try {
      if (act === "nav") { medQ = b.dataset.q || ""; medLowOnly = b.dataset.low === "1"; await show(b.dataset.view); }
      else if (act === "filter") { orderFilter = b.dataset.f; await vOrders(); }
      else if (act === "low-toggle") { medLowOnly = !medLowOnly; await vMedicines(); }
      else if (act === "unmake-rider") { await unmakeRider(id, b.dataset.name || "rider"); }
      else if (act === "fee-paid") {
        b.disabled = true;
        try {
          var fp = await DB.sb.from("orders").update({ fee_paid_to_rider: b.dataset.v === "1" }).eq("id", id);
          if (fp.error) throw fp.error;
          DB.toast(b.dataset.v === "1" ? "Delivery fee marked as paid" : "Delivery fee marked as unpaid");
        } catch (err) { DB.toast("Error: " + err.message); }
        await loadPayouts();
      }
      else if (act === "nr-create") { await provisionRider(); }
      else if (act === "gen-pass") { genPass(); }
      else if (act === "adv") {
        var to = b.dataset.to, tr = b.closest("tr"), pill = tr ? tr.querySelector(".pill") : null;
        if (pill) { pill.className = "pill " + to; pill.textContent = LBL[to]; }
        b.disabled = true;
        try {
          var r = await DB.sb.from("orders").update({ status: to }).eq("id", id);
          if (r.error) throw r.error;
          DB.toast("Order → " + LBL[to]);
        } catch (err) { DB.toast("Error: " + err.message); }
        await refreshOrderRow(tr, id);
      }
      else if (act === "cancel") {
        if (!confirm("Cancel this order?")) return;
        var tr2 = b.closest("tr"), pill2 = tr2 ? tr2.querySelector(".pill") : null;
        if (pill2) { pill2.className = "pill cancelled"; pill2.textContent = LBL.cancelled; }
        b.disabled = true;
        try {
          await restoreStockForOrder(id);
          var c = await DB.sb.from("orders").update({ status: "cancelled" }).eq("id", id);
          if (c.error) throw c.error;
          DB.toast("Order cancelled — stock restored");
        } catch (err) { DB.toast("Error: " + err.message); }
        await refreshOrderRow(tr2, id);
      }
      else if (act === "items") { await editItems(id); }
      else if (act === "items-close") { document.getElementById("itemEditor").innerHTML = ""; }
      else if (act === "line-del") {
        var ln = await DB.sb.from("order_items").select("qty,medicine_id").eq("id", id).single();
        var dd = await DB.sb.from("order_items").delete().eq("id", id);
        if (dd.error) throw dd.error;
        if (ln.data) await bumpStock(ln.data.medicine_id, ln.data.qty);
        await recalcOrder(b.dataset.order);
        DB.toast("Item removed"); await editItems(b.dataset.order); await loadOrders();
      }
      else if (act === "line-pick") {
        var mp = await DB.sb.from("medicines").select("price").eq("id", id).single();
        if (mp.error) throw mp.error;
        var ni = await DB.sb.from("order_items").insert({ order_id: b.dataset.order, medicine_id: id, qty: 1, unit_price: mp.data.price });
        if (ni.error) throw ni.error;
        await bumpStock(id, -1);
        await recalcOrder(b.dataset.order);
        DB.toast("Item added");
        var si = document.getElementById("itemSearch"); if (si) si.value = "";
        var sr = document.getElementById("itemResults"); if (sr) sr.innerHTML = "";
        await editItems(b.dataset.order); await loadOrders();
      }
      else if (act === "med-save") {
        var v = rowVals(id);
        var patch = { price: v.price };
        if (v.stockadd) {
          // Restock adds to current stock: 6 in stock + 4 added = 10.
          var cur = await DB.sb.from("medicines").select("stock").eq("id", id).single();
          if (cur.error) throw cur.error;
          patch.stock = (cur.data.stock || 0) + v.stockadd;
        }
        var u = await DB.sb.from("medicines").update(patch).eq("id", id);
        if (u.error) throw u.error;
        DB.toast(v.stockadd ? "Restocked +" + v.stockadd : "Saved");
        await loadMeds(); updateBadges();
      }
      else if (act === "med-add") {
        var nm = document.getElementById("mName").value.trim();
        var pr = document.getElementById("mPrice").value, st = document.getElementById("mStock").value;
        if (!nm || pr === "" || st === "") { DB.toast("Name, price and stock are required"); return; }
        var ins = await DB.sb.from("medicines").insert({
          name: nm, brand: document.getElementById("mBrand").value.trim(),
          strength: document.getElementById("mStrength").value.trim(),
          form: document.getElementById("mForm").value,
          pack_size: document.getElementById("mPack").value.trim(),
          category: document.getElementById("mCat").value.trim() || "General",
          price: Number(pr), stock: Number(st),
          rx_required: document.getElementById("mRx").checked,
        });
        if (ins.error) throw ins.error;
        DB.toast("Medicine added"); await show("medicines", true);
      }
      else if (act === "rx-ok" || act === "rx-no") {
        var stt = act === "rx-ok" ? "approved" : "rejected";
        var pc = await DB.sb.from("prescriptions").select("customer_id").eq("id", id).single();
        var rr = await DB.sb.from("prescriptions").update({ status: stt, reviewed_at: new Date().toISOString() }).eq("id", id);
        if (rr.error) throw rr.error;
        if (stt === "approved" && pc.data) {
          // Release this customer's waiting orders into the normal flow.
          var rel = await DB.sb.from("orders").update({ status: "confirmed" })
            .eq("customer_id", pc.data.customer_id).eq("status", "awaiting_rx");
          if (rel.error) throw rel.error;
          DB.toast("Prescription approved");
        }
        if (stt === "rejected") {
          // Remove only Rx-required lines from waiting orders tied to this
          // prescription; non-Rx medicines stay and the order proceeds.
          var wo = await DB.sb.from("orders").select("id").eq("prescription_id", id).eq("status", "awaiting_rx");
          if (wo.error) throw wo.error;
          var touched = 0;
          for (var oi = 0; oi < (wo.data || []).length; oi++) {
            var o = wo.data[oi];
            var li = await DB.sb.from("order_items").select("id,qty,unit_price,medicine_id,medicines(rx_required)").eq("order_id", o.id);
            if (li.error) throw li.error;
            var keep = [], drop = [];
            (li.data || []).forEach(function (l) {
              ((l.medicines && l.medicines.rx_required) ? drop : keep).push(l);
            });
            for (var di = 0; di < drop.length; di++) {
              var dr = await DB.sb.from("order_items").delete().eq("id", drop[di].id);
              if (dr.error) throw dr.error;
              await bumpStock(drop[di].medicine_id, drop[di].qty);
            }
            if (drop.length) touched++;
            if (!keep.length) {
              var co = await DB.sb.from("orders").update({ status: "cancelled" }).eq("id", o.id);
              if (co.error) throw co.error;
            } else {
              var sub2 = keep.reduce(function (s, l) { return s + Number(l.qty) * Number(l.unit_price); }, 0);
              var fee2 = await distFee(o.id, sub2);
              var uo = await DB.sb.from("orders").update({ status: "placed", subtotal: sub2, delivery_fee: fee2, total: sub2 + fee2 }).eq("id", o.id);
              if (uo.error) throw uo.error;
            }
          }
          DB.toast("Prescription rejected" + (touched ? " — Rx items removed from " + touched + " order(s)" : ""));
        }
        updateBadges(); await show("rx", true);
      }
      else if (act === "rx-view") { window.open(b.dataset.url, "_blank"); }
      else if (act === "rximg") {
        var pr = await DB.sb.from("prescriptions").select("image_url").eq("id", b.dataset.id).single();
        if (pr.error) throw pr.error;
        var sg = await DB.sb.storage.from("prescriptions").createSignedUrl(pr.data.image_url, 600);
        if (sg.error) throw sg.error;
        window.open(sg.data.signedUrl, "_blank");
      }
      else if (act === "rep-p") { repPeriod = b.dataset.p; await show("reports", true); }
      else if (act === "rep-xls") { downloadCSV(); }
      else if (act === "rep-pdf") { downloadPDF(); }
      else if (act === "signout") { await Auth.signOut(); location.reload(); }
    } catch (err) { DB.toast("Error: " + err.message); }
  }
  function onChange(e) {
    var as = e.target.closest("[data-assign]");
    if (as) {
      if (!as.value) return;
      DB.sb.from("orders").update({ rider_id: as.value, status: "assigned" }).eq("id", as.dataset.assign).then(function (r) {
        DB.toast(r.error ? "Error: " + r.error.message : "Rider assigned");
        if (!r.error) refreshOrderRow(as.closest("tr"), as.dataset.assign).catch(function () {});
      });
      return;
    }
    var b = e.target.closest("[data-act='med-live']");
    if (b) {
      DB.sb.from("medicines").update({ is_active: b.checked }).eq("id", b.dataset.id).then(function (r) {
        DB.toast(r.error ? "Error: " + r.error.message : (b.checked ? "Live on store" : "Hidden from store"));
      });
      return;
    }
    var lq = e.target.closest("[data-act='line-qty']"), lp = e.target.closest("[data-act='line-price']");
    if (lq || lp) {
      var t = lq || lp, patch = {};
      if (lq) patch.qty = Math.max(1, Number(t.value) || 1);
      else patch.unit_price = Math.max(0, Number(t.value) || 0);
      var oldQ = lq ? Number(t.defaultValue) || 0 : 0, medOf = null;
      (async function () {
        if (lq) {
          var cur = await DB.sb.from("order_items").select("qty,medicine_id").eq("id", t.dataset.id).single();
          if (cur.data) { oldQ = cur.data.qty; medOf = cur.data.medicine_id; }
        }
        var r = await DB.sb.from("order_items").update(patch).eq("id", t.dataset.id);
        if (r.error) { DB.toast("Error: " + r.error.message); return; }
        if (lq && medOf) await bumpStock(medOf, oldQ - patch.qty);
        try { await recalcOrder(t.dataset.order); await editItems(t.dataset.order); await loadOrders(); }
        catch (err) { DB.toast("Error: " + err.message); }
      })();
      return;
    }
    if (e.target.id === "repDate") { repDate = e.target.value; loadReport(); }
  }

  boot();
})();
