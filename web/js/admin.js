// Admin panel — Phase A: catalog (list, inline price/stock edit, CSV import).
// Order / prescription / rider tabs land in later phases.
(function () {
  "use strict";
  const panel = document.getElementById("panel");
  const msg = document.getElementById("msg");
  const tabs = document.getElementById("tabs");
  const esc = DB.esc;
  let tab = "catalog"; // default to the working tab
  let q = "", page = 0, total = 0;
  const PAGE = DB.PAGE;

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tabs.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    b.classList.add("active");
    tab = b.dataset.tab;
    render();
  });

  async function render() {
    msg.innerHTML = "";
    const chk = await Auth.requireRole("admin").catch((e) => ({ ok: false, reason: "error", e }));
    if (chk.reason === "signin") return Auth.gate(panel, render);
    if (!chk.ok) {
      panel.innerHTML = '<div class="card">' +
        (chk.reason === "forbidden"
          ? "This account is not an admin. <button class='btn secondary small' id='so'>Sign out</button>"
          : "Error: " + esc(chk.e ? chk.e.message : "unknown")) + "</div>";
      const so = document.getElementById("so");
      if (so) so.onclick = async () => { await Auth.signOut(); render(); };
      return;
    }
    if (tab === "catalog") return catalogView(chk.profile);
    if (tab === "rx") return rxView();
    if (tab === "orders") return ordersView();
    if (tab === "riders") return ridersView();
    const names = { orders: "Order management", rx: "Prescription review", riders: "Rider management" };
    panel.innerHTML = '<div class="card"><p class="muted">' + names[tab] +
      " lands in a later phase. <button class='btn secondary small' id='so'>Sign out</button></p></div>";
    document.getElementById("so").onclick = async () => { await Auth.signOut(); render(); };
  }

  // ── Catalog ──────────────────────────────────────────────────────────────
  function catalogView(me) {
    panel.innerHTML =
      '<div class="card"><div class="row"><div style="flex:1"><b>Catalog</b> <span class="muted" id="cnt"></span></div>' +
      '<button class="btn secondary small" id="so">Sign out</button></div>' +
      '<div class="searchbar" style="margin-top:10px"><input id="cq" type="search" placeholder="Search medicines…" aria-label="Search catalog"></div>' +
      '<div class="row"><input type="file" id="csv" accept=".csv" aria-label="CSV file" style="flex:1">' +
      '<button class="btn small" id="imp" style="width:auto">Import CSV</button></div>' +
      '<p class="muted" style="margin-top:6px">CSV columns: name, strength, price, stock. ' +
      'Matches on name + strength, updates price/stock only. <a href="../catalog/medicines-seed.csv">seed file</a></p>' +
      '<div id="imsg"></div></div>' +
      '<div class="card" style="padding:6px"><table class="data"><thead><tr>' +
      "<th>Medicine</th><th>Price ₹</th><th>Stock</th></tr></thead><tbody id='rows'></tbody></table>" +
      '<div class="row" style="justify-content:space-between;padding:8px 6px">' +
      '<button class="btn secondary small" id="prev">← Prev</button>' +
      '<span class="muted" id="pg"></span>' +
      '<button class="btn secondary small" id="next">Next →</button></div></div>';
    document.getElementById("so").onclick = async () => { await Auth.signOut(); render(); };
    document.getElementById("imp").onclick = importCSV;
    const cq = document.getElementById("cq");
    cq.value = q;
    let t;
    cq.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = cq.value; page = 0; loadRows(); }, 300); };
    document.getElementById("prev").onclick = () => { if (page > 0) { page--; loadRows(); } };
    document.getElementById("next").onclick = () => { if ((page + 1) * PAGE < total) { page++; loadRows(); } };
    loadRows();
  }

  async function loadRows() {
    const tb = document.getElementById("rows");
    try {
      let query = DB.sb.from("medicines").select("*", { count: "exact" }).order("name");
      if (q) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error, count } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      total = count || 0;
      document.getElementById("cnt").textContent = total + " items";
      document.getElementById("pg").textContent = "Page " + (page + 1) + " of " + Math.max(1, Math.ceil(total / PAGE));
      tb.innerHTML = data.map((m) =>
        "<tr><td><b>" + esc(m.name) + "</b><br><span class='muted'>" + esc(m.strength) + " · " + esc(m.form) +
        (m.rx_required ? ' <span class="rx-badge">Rx</span>' : "") + "</span></td>" +
        "<td><input type='number' min='0' step='0.01' data-id='" + m.id + "' data-f='price' value='" +
        (m.price == null ? "" : m.price) + "' style='width:84px;min-height:36px' aria-label='Price for " + esc(m.name) + "'></td>" +
        "<td><input type='number' min='0' step='1' data-id='" + m.id + "' data-f='stock' value='" + m.stock +
        "' style='width:70px;min-height:36px' aria-label='Stock for " + esc(m.name) + "'></td></tr>"
      ).join("") || "<tr><td colspan='3' class='muted'>No medicines found.</td></tr>";
      tb.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("change", async () => {
          const v = inp.value === "" ? null : Number(inp.value);
          if (v !== null && (isNaN(v) || v < 0)) { DB.showErr(msg, "Enter a non-negative number."); loadRows(); return; }
          const { error } = await DB.sb.from("medicines")
            .update({ [inp.dataset.f]: v }).eq("id", inp.dataset.id);
          if (error) { DB.showErr(msg, error.message); return; }
          inp.style.borderColor = "var(--brand)";
          setTimeout(() => (inp.style.borderColor = ""), 800);
        });
      });
    } catch (e) { DB.showErr(msg, e.message); }
  }

  // ── CSV import ───────────────────────────────────────────────────────────
  function parseCSV(text) {
    const rows = [];
    let row = [], val = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false; }
        else val += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(val); val = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(val); rows.push(row); row = []; val = "";
      } else val += c;
    }
    if (val !== "" || row.length) { row.push(val); rows.push(row); }
    return rows.filter((r) => r.length > 1 || r[0].trim() !== "");
  }

  async function importCSV() {
    const file = document.getElementById("csv").files[0];
    const box = document.getElementById("imsg");
    if (!file) { DB.showErr(box, "Choose a CSV file first."); return; }
    box.innerHTML = '<p class="muted">Reading file…</p>';
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { DB.showErr(box, "CSV is empty."); return; }
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const need = ["name", "strength", "price", "stock"];
    const idx = {};
    for (const n of need) { idx[n] = head.indexOf(n); if (idx[n] < 0) { DB.showErr(box, "Missing column: " + n); return; } }

    // one fetch of id/name/strength for matching (catalog ~1000 rows)
    const { data: all, error } = await DB.sb.from("medicines").select("id,name,strength").limit(2000);
    if (error) { DB.showErr(box, error.message); return; }
    const byKey = new Map(all.map((m) => [m.name.trim().toLowerCase() + "|" + (m.strength || "").trim().toLowerCase(), m.id]));

    const updates = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const key = (r[idx.name] || "").trim().toLowerCase() + "|" + (r[idx.strength] || "").trim().toLowerCase();
      const id = byKey.get(key);
      const price = r[idx.price].trim() === "" ? null : Number(r[idx.price]);
      const stock = r[idx.stock].trim() === "" ? null : parseInt(r[idx.stock], 10);
      if (!id || (price === null && stock === null) ||
          (price !== null && (isNaN(price) || price < 0)) ||
          (stock !== null && (isNaN(stock) || stock < 0))) { skipped++; continue; }
      const u = { id };
      if (price !== null) u.price = price;
      if (stock !== null) u.stock = stock;
      updates.push(u);
    }

    let done = 0, failed = 0;
    for (let i = 0; i < updates.length; i += 25) { // chunked to stay light
      const chunk = updates.slice(i, i + 25);
      const res = await Promise.all(chunk.map((u) => {
        const patch = {};
        if (u.price !== undefined) patch.price = u.price;
        if (u.stock !== undefined) patch.stock = u.stock;
        return DB.sb.from("medicines").update(patch).eq("id", u.id);
      }));
      res.forEach((r) => (r.error ? failed++ : done++));
      box.innerHTML = '<p class="muted">Importing… ' + (done + failed) + " / " + updates.length + "</p>";
    }
    box.innerHTML = '<div class="ok">Import done: <b>' + done + "</b> updated" +
      (skipped ? ", " + skipped + " skipped (no match / bad value)" : "") +
      (failed ? ", " + failed + " failed" : "") + ".</div>";
    page = 0; loadRows();
  }

  tabs.querySelectorAll(".chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.tab === tab));
  // ── Prescriptions: pharmacist review ─────────────────────────────────────
  async function rxView() {
    panel.innerHTML = '<div class="card"><b>Prescriptions</b><div id="rxlist" style="margin-top:8px"></div></div>';
    const box = document.getElementById("rxlist");
    try {
      const { data, error } = await DB.sb.from("prescriptions")
        .select("*,profiles(name)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      if (!data.length) { box.innerHTML = '<p class="muted">No prescriptions yet.</p>'; return; }
      box.innerHTML = data.map((p) =>
        '<div class="card"><div class="row" style="justify-content:space-between"><div><b>' +
        esc((p.profiles && p.profiles.name) || "Customer") + "</b><br><span class='muted'>" +
        new Date(p.created_at).toLocaleString() + "</span></div>" +
        '<span class="status ' + p.status + '">' + p.status + "</span></div>" +
        '<div class="row" style="margin-top:8px;gap:8px">' +
        '<button class="btn secondary small" data-view="' + esc(p.image_url) + '">View</button>' +
        (p.status === "pending"
          ? '<button class="btn small" data-ap="' + p.id + '">Approve</button>' +
            '<button class="btn danger small" data-rj="' + p.id + '">Reject</button>'
          : "") + "</div></div>"
      ).join("");
      box.querySelectorAll("[data-view]").forEach((b) => (b.onclick = async () => {
        const { data: s, error: e } = await DB.sb.storage.from("prescriptions").createSignedUrl(b.dataset.view, 600);
        if (e) return DB.showErr(msg, e.message);
        window.open(s.signedUrl, "_blank");
      }));
      const review = async (id, status) => {
        const { error } = await DB.sb.from("prescriptions")
          .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
        if (error) return DB.showErr(msg, error.message);
        rxView();
      };
      box.querySelectorAll("[data-ap]").forEach((b) => (b.onclick = () => review(b.dataset.ap, "approved")));
      box.querySelectorAll("[data-rj]").forEach((b) => (b.onclick = () => review(b.dataset.rj, "rejected")));
    } catch (e) { DB.showErr(msg, e.message); }
  }

  // ── Orders: status pipeline + rider assignment ────────────────────────────
  let ostat = "";
  async function ordersView() {
    panel.innerHTML =
      '<div class="card"><b>Orders</b><div class="chips" id="of" style="margin-top:8px"></div>' +
      '<div id="olist"></div></div>';
    const statuses = ["", "placed", "confirmed", "preparing", "assigned",
      "picked_up", "out_for_delivery", "delivered", "cancelled"];
    const of = document.getElementById("of");
    of.innerHTML = statuses.map((s) =>
      '<button class="chip' + (s === ostat ? " active" : "") + '" data-s="' + s + '">' +
      (s || "All").replace(/_/g, " ") + "</button>").join("");
    of.onclick = (e) => {
      const b = e.target.closest("[data-s]");
      if (b) { ostat = b.dataset.s; ordersView(); }
    };
    const box = document.getElementById("olist");
    try {
      let qy = DB.sb.from("orders").select(
        "*,order_items(qty,unit_price,medicines(name))," +
        "customer:profiles!orders_customer_id_fkey(name,phone)," +
        "rider:profiles!orders_rider_id_fkey(name)," +
        "addresses(address_text,landmark)"
      ).order("created_at", { ascending: false }).limit(50);
      if (ostat) qy = qy.eq("status", ostat);
      const { data, error } = await qy;
      if (error) throw error;
      const { data: riders } = await DB.sb.from("profiles").select("id,name").eq("role", "rider");
      box.innerHTML = data.map((o) => orderCard(o, riders || [])).join("") ||
        '<p class="muted">No orders.</p>';
      box.onclick = async (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const id = b.dataset.id;
        const card = b.closest("[data-order]");
        try {
          if (b.dataset.act === "assign") {
            const sel = card.querySelector("[data-rider]");
            if (!sel.value) return DB.showErr(msg, "Pick a rider first.");
            await setStatus(id, "assigned", { rider_id: sel.value });
          } else {
            await setStatus(id, b.dataset.act);
          }
          ordersView();
        } catch (err) { DB.showErr(msg, err.message); }
      };
    } catch (e) { DB.showErr(msg, e.message); }
  }

  async function setStatus(id, status, extra) {
    const { error } = await DB.sb.from("orders").update(Object.assign({ status }, extra)).eq("id", id);
    if (error) throw error;
  }

  function orderCard(o, riders) {
    const items = o.order_items.map((i) =>
      "<div class='row' style='justify-content:space-between'><span>" + esc(i.medicines.name) +
      " × " + i.qty + "</span><span>" + DB.money(i.unit_price * i.qty) + "</span></div>").join("");
    let actions = "";
    if (o.status === "placed")
      actions = btn("confirmed", "Confirm", o.id) + btn("cancelled", "Cancel", o.id, "danger");
    else if (o.status === "confirmed")
      actions = btn("preparing", "Start preparing", o.id) + btn("cancelled", "Cancel", o.id, "danger");
    else if (o.status === "preparing")
      actions = '<select data-rider aria-label="Rider"><option value="">— rider —</option>' +
        riders.map((r) => "<option value='" + r.id + "'>" + esc(r.name || "Rider") + "</option>").join("") +
        "</select>" + btn("assign", "Assign rider", o.id);
    else if (!["delivered", "cancelled"].includes(o.status))
      actions = btn("cancelled", "Cancel", o.id, "danger");
    return '<div class="card" data-order><div class="row" style="justify-content:space-between">' +
      "<b>#" + o.id.slice(0, 8) + "</b>" +
      '<span class="status ' + o.status + '">' + o.status.replace(/_/g, " ") + "</span></div>" +
      '<p class="muted">' + new Date(o.created_at).toLocaleString() +
      (o.customer ? " · " + esc(o.customer.name || "") + (o.customer.phone ? " · " + esc(o.customer.phone) : "") : "") +
      (o.rider ? " · 🛵 " + esc(o.rider.name || "") : "") + "</p>" +
      (o.addresses ? '<p class="muted">📍 ' + esc(o.addresses.address_text) +
        (o.addresses.landmark ? " (" + esc(o.addresses.landmark) + ")" : "") + "</p>" : "") +
      items +
      '<div class="row" style="justify-content:space-between;margin-top:6px"><span>' +
      esc(o.delivery_slot || "") + " · " + o.payment_method.toUpperCase() + "</span><b class='price'>" +
      DB.money(o.total) + "</b></div>" +
      (actions ? '<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">' + actions + "</div>" : "") +
      "</div>";
  }
  function btn(act, label, id, kind) {
    return '<button class="btn small ' + (kind || "") + '" data-act="' + act + '" data-id="' + id + '">' + label + "</button>";
  }

  // ── Riders ─────────────────────────────────────────────────────────────────
  async function ridersView() {
    panel.innerHTML = '<div class="card"><b>Riders</b><div id="rlist" style="margin-top:8px"></div>' +
      '<p class="muted" style="margin-top:8px">To add a rider: they create an account in the rider app, then run ' +
      "<code>update profiles set role='rider' where id='&lt;their-uuid&gt;';</code> in Supabase SQL.</p></div>";
    const box = document.getElementById("rlist");
    try {
      const { data, error } = await DB.sb.from("profiles").select("id,name,phone").eq("role", "rider");
      if (error) throw error;
      box.innerHTML = data.map((r) =>
        '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef"><div><b>' +
        esc(r.name || "Rider") + "</b><br><span class='muted'>" + esc(r.phone || "") + "</span></div></div>"
      ).join("") || '<p class="muted">No riders yet.</p>';
    } catch (e) { DB.showErr(msg, e.message); }
  }

  render();
})();
