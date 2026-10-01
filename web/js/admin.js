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
  render();
})();
