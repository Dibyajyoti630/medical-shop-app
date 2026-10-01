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
  var cur = "dashboard", bound = false, orderFilter = "all", medQ = "";

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

  // ── boot ───────────────────────────────────────────────────────────────
  async function boot() {
    var r = await Auth.requireRole("admin");
    if (r.reason === "signin") { Auth.gate(view, boot); return; }
    if (r.reason === "forbidden") { view.innerHTML = '<div class="card empty">This page is for shop admins only.</div>'; return; }
    var nm = r.profile.name || "Admin";
    document.getElementById("adminName").textContent = nm;
    document.getElementById("adminAvatar").textContent = nm.trim().charAt(0).toUpperCase();
    if (!bound) { bindChrome(); bound = true; }
    updateBadges();
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
    document.getElementById("bellBtn").onclick = function () { show("rx"); };
    document.getElementById("supportLink").onclick = function (e) { e.preventDefault(); DB.toast("Call the shop owner — support number coming soon"); };
    view.addEventListener("click", onClick);
    view.addEventListener("change", onChange);
    view.addEventListener("input", function (e) {
      if (e.target.id === "medSearch") { medQ = e.target.value.trim(); loadMeds(); }
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
    catch (e) { if (!silent) view.innerHTML = errBox(e); }
    if (name === "dashboard") foot.textContent = "Last updated: " + fmtDate(new Date()) + " • Auto-refresh every 60s";
  }

  async function updateBadges() {
    var r = await DB.sb.from("prescriptions").select("id", { count: "exact", head: true }).eq("status", "pending");
    var n = r.count || 0;
    ["rxBadge", "bellBadge"].forEach(function (id) {
      var el = document.getElementById(id);
      el.hidden = n === 0; el.textContent = n;
    });
  }

  // ── shared order fetch (orders + customer names + item lines) ────────────
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
    return "<tr><td class='oid'>" + shortId(o.id) + "<br><small class='muted'>" + ago(o.created_at) + "</small></td>" +
      "<td><b>" + esc(c.name || "Customer") + "</b>" + (c.phone ? "<br><small class='muted'>" + esc(c.phone) + "</small>" : "") + "</td>" +
      "<td class='items-cell'>" + itemSummary(x.items[o.id]) + "</td>" +
      "<td><b>" + DB.money(o.total) + "</b></td>" +
      "<td>" + pill(o.status) + "</td>" +
      '<td><div class="row-actions">' + adv + cancel + "</div></td></tr>";
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
      { ico: "🛍️", cls: "teal", label: "Today's Orders", num: t.length, sub: pct(t.length, y.length), subCls: "up" },
      { ico: "💵", cls: "teal", label: "Revenue", num: inr0(rev(t)), sub: pct(rev(t), rev(y)), subCls: "up" },
      { ico: "📄", cls: "amber", label: "Pending Rx Verification", num: pendRx, sub: pendRx ? "Requires action" : "All clear", subCls: "warn" },
      { ico: "❗", cls: "red", label: "Low Stock Alerts", num: low.length, sub: low.length ? "Restock recommended" : "Stock healthy", subCls: "bad" },
    ];
    var html = head("Dashboard", "Overview of today's pharmacy operations and deliveries • Today, " +
      new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));
    html += '<div class="stats">' + cards.map(function (c) {
      return '<div class="stat"><div class="stat-top"><span class="stat-ico ' + c.cls + '">' + c.ico + "</span>" + esc(c.label) +
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
    html += '<div class="card"><div class="card-head"><h3>⚠️ Low Stock Alerts</h3></div>' +
      (low.length ? low.slice(0, 5).map(function (m) {
        return '<div class="stock-row"><span class="stock-ico">' + (m.stock <= 5 ? "❗" : "💊") + "</span><div><b>" +
          esc(m.name) + (m.strength ? " " + esc(m.strength) : "") + "</b><small class='" + (m.stock <= 5 ? "" : "amber") + "'>" +
          m.stock + " left • Reorder at " + LOW_STOCK + "</small></div></div>";
      }).join("") : '<div class="empty">Stock levels look good.</div>') +
      '<button class="btn-outline" data-act="nav" data-view="medicines">+ Manage Inventory</button></div></div>';
    view.innerHTML = html;
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  var FILTERS = ["all", "placed", "awaiting_rx", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
  async function vOrders() {
    view.innerHTML = head("Orders", "Tap → to move an order to its next stage.") +
      '<div class="chips">' + FILTERS.map(function (f) {
        return '<button class="chip' + (f === orderFilter ? " active" : "") + '" data-act="filter" data-f="' + f + '">' +
          (f === "all" ? "All" : esc(LBL[f])) + "</button>";
      }).join("") + '</div><div class="card"><div id="olist"><div class="empty">Loading…</div></div></div>';
    await loadOrders();
  }
  async function loadOrders() {
    var q = DB.sb.from("orders").select("id,customer_id,total,status,delivery_slot,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (orderFilter !== "all") q = q.eq("status", orderFilter);
    var r = await q; if (r.error) throw r.error;
    var x = await enrichOrders(r.data || []);
    document.getElementById("olist").innerHTML = (r.data && r.data.length)
      ? '<table class="grid"><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Actions</th></tr>' +
        r.data.map(function (o) { return orderRow(o, x); }).join("") + "</table>"
      : '<div class="empty">No orders in this stage.</div>';
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
      '<input class="searchbar" id="medSearch" placeholder="🔍 Search medicines…" value="' + esc(medQ) + '">' +
      '<div class="card"><div id="mlist"><div class="empty">Loading…</div></div></div>';
    await loadMeds();
  }
  async function loadMeds() {
    var q = DB.sb.from("medicines").select("id,name,brand,strength,form,pack_size,price,stock,rx_required,is_active")
      .order("name").limit(200);
    if (medQ) q = q.ilike("name", "%" + medQ + "%");
    var r = await q; if (r.error) throw r.error;
    var el = document.getElementById("mlist"); if (!el) return;
    el.innerHTML = (r.data && r.data.length)
      ? '<table class="grid"><tr><th>Medicine</th><th>Price ₹</th><th>Stock</th><th>Rx</th><th>Live</th><th></th></tr>' +
        r.data.map(function (m) {
          return "<tr><td><b>" + esc(m.name) + "</b>" + (m.strength ? " " + esc(m.strength) : "") +
            "<br><small class='muted'>" + esc([m.brand, m.form, m.pack_size].filter(Boolean).join(" • ")) + "</small></td>" +
            '<td><input class="mini-input" data-k="price" data-id="' + m.id + '" type="number" min="0" step="0.01" value="' + (m.price == null ? "" : m.price) + '"></td>' +
            '<td><input class="mini-input" data-k="stock" data-id="' + m.id + '" type="number" min="0" step="1" value="' + m.stock + '"></td>' +
            "<td>" + (m.rx_required ? "🔒" : "—") + "</td>" +
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
      var s = await DB.sb.storage.from("prescriptions").createSignedUrl(pend[i].image_url, 600);
      pend[i].url = s.data ? s.data.signedUrl : null;
    }
    var card = function (x, actions) {
      var c = names[x.customer_id] || {};
      return '<div class="rx-card">' +
        (x.url ? '<img src="' + x.url + '" data-act="rx-view" data-url="' + esc(x.url) + '" alt="prescription">' : '<div class="empty">no image</div>') +
        '<div class="rx-meta"><b>' + esc(c.name || "Customer") + "</b>" +
        (c.phone ? "<small>" + esc(c.phone) + "</small>" : "") +
        "<small>Uploaded " + ago(x.created_at) + "</small>" +
        (actions ? '<div class="row-actions" style="margin-top:8px">' +
          '<button class="btn sm" data-act="rx-ok" data-id="' + x.id + '">Approve</button>' +
          '<button class="btn sm danger" data-act="rx-no" data-id="' + x.id + '">Reject</button></div>'
          : '<div style="margin-top:6px">' + pill(x.status) + "</div>") + "</div></div>";
    };
    view.innerHTML = head("Prescriptions", "Approve a prescription before its medicines can be sold.") +
      '<div class="card"><div class="card-head"><h3>Pending verification (' + pend.length + ")</h3></div>" +
      (pend.length ? pend.map(function (x) { return card(x, true); }).join("") : '<div class="empty">Nothing waiting. 🎉</div>') + "</div>" +
      '<div class="card" style="margin-top:18px"><div class="card-head"><h3>Reviewed</h3></div>' +
      (done.length ? done.map(function (x) { return card(x, false); }).join("") : '<div class="empty">No reviewed prescriptions yet.</div>') + "</div>";
  }

  // ── Delivery staff ───────────────────────────────────────────────────────
  async function vStaff() {
    var r = await DB.sb.from("profiles").select("id,name,phone,created_at").eq("role", "rider").order("created_at", { ascending: false });
    if (r.error) throw r.error;
    view.innerHTML = head("Delivery Staff", "Riders sign up in the app; their role is set to “rider” in Supabase → Table Editor → profiles.") +
      '<div class="card">' + ((r.data && r.data.length)
        ? '<table class="grid"><tr><th>Name</th><th>Phone</th><th>Since</th></tr>' + r.data.map(function (p) {
            return "<tr><td><b>" + esc(p.name || "—") + "</b></td><td>" + esc(p.phone || "—") + "</td><td>" + fmtDate(p.created_at) + "</td></tr>";
          }).join("") + "</table>"
        : '<div class="empty">No riders yet.</div>') + "</div>";
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  async function vReports() {
    var o = await DB.sb.from("orders").select("id,total,status").neq("status", "cancelled").limit(2000);
    if (o.error) throw o.error;
    var rows = o.data || [];
    var rev = rows.reduce(function (s, x) { return s + Number(x.total); }, 0);
    var it = await DB.sb.from("order_items").select("qty,medicines(name)").limit(2000);
    if (it.error) throw it.error;
    var byMed = {};
    (it.data || []).forEach(function (rr) {
      var n = (rr.medicines && rr.medicines.name) || "?";
      byMed[n] = (byMed[n] || 0) + rr.qty;
    });
    var top = Object.keys(byMed).sort(function (a, b) { return byMed[b] - byMed[a]; }).slice(0, 5);
    view.innerHTML = head("Reports", "All-time, excluding cancelled orders.") +
      '<div class="stats" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat"><div class="stat-top"><span class="stat-ico teal">💵</span>Total revenue</div><div class="stat-num">' + inr0(rev) + "</div></div>" +
      '<div class="stat"><div class="stat-top"><span class="stat-ico teal">🛍️</span>Total orders</div><div class="stat-num">' + rows.length + "</div></div>" +
      '<div class="stat"><div class="stat-top"><span class="stat-ico amber">📊</span>Avg order value</div><div class="stat-num">' + inr0(rows.length ? rev / rows.length : 0) + "</div></div></div>" +
      '<div class="card"><div class="card-head"><h3>Top medicines by quantity</h3></div>' +
      (top.length ? '<table class="grid"><tr><th>Medicine</th><th>Qty sold</th></tr>' +
        top.map(function (n) { return "<tr><td>" + esc(n) + "</td><td><b>" + byMed[n] + "</b></td></tr>"; }).join("") + "</table>"
        : '<div class="empty">No sales yet.</div>') + "</div>";
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
      if (act === "nav") { await show(b.dataset.view); }
      else if (act === "filter") { orderFilter = b.dataset.f; await vOrders(); }
      else if (act === "adv") {
        var r = await DB.sb.from("orders").update({ status: b.dataset.to }).eq("id", id);
        if (r.error) throw r.error;
        DB.toast("Order → " + LBL[b.dataset.to]); await show(cur, true);
      }
      else if (act === "cancel") {
        if (!confirm("Cancel this order?")) return;
        var c = await DB.sb.from("orders").update({ status: "cancelled" }).eq("id", id);
        if (c.error) throw c.error;
        DB.toast("Order cancelled"); await show(cur, true);
      }
      else if (act === "med-save") {
        var v = rowVals(id);
        var u = await DB.sb.from("medicines").update({ price: v.price, stock: v.stock == null ? 0 : v.stock }).eq("id", id);
        if (u.error) throw u.error;
        DB.toast("Saved");
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
        var rr = await DB.sb.from("prescriptions").update({ status: stt, reviewed_at: new Date().toISOString() }).eq("id", id);
        if (rr.error) throw rr.error;
        DB.toast("Prescription " + stt); updateBadges(); await show("rx", true);
      }
      else if (act === "rx-view") { window.open(b.dataset.url, "_blank"); }
      else if (act === "signout") { await Auth.signOut(); location.reload(); }
    } catch (err) { DB.toast("Error: " + err.message); }
  }
  function onChange(e) {
    var b = e.target.closest("[data-act='med-live']"); if (!b) return;
    DB.sb.from("medicines").update({ is_active: b.checked }).eq("id", b.dataset.id).then(function (r) {
      DB.toast(r.error ? "Error: " + r.error.message : (b.checked ? "Live on store" : "Hidden from store"));
    });
  }

  boot();
})();
