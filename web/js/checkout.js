// Cart page + checkout (COD pilot). Rx items need an approved prescription on file.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const FREE_ABOVE = 499, FEE = 30;

  async function render() {
    msg.innerHTML = "";
    let items;
    try { items = await Cart.detailed(); }
    catch (e) { return DB.showErr(msg, e.message); }
    if (!items.length) {
      wrap.innerHTML = '<div class="card"><p>Your cart is empty.</p>' +
        '<p style="margin-top:10px"><a href="index.html">Browse medicines →</a></p></div>';
      return;
    }
    const sub = items.reduce((a, m) => a + m.price * m.qty, 0);
    const fee = sub >= FREE_ABOVE ? 0 : FEE;
    wrap.innerHTML =
      '<div class="card" style="padding:6px"><table class="data"><tbody>' +
      items.map((m) =>
        "<tr><td><b>" + esc(m.name) + "</b><br><span class='muted'>" + esc(m.strength) +
        " · " + DB.money(m.price) + "</span></td>" +
        "<td><div class='qty'><button data-a='-1' data-id='" + m.id + "'>−</button><b>" + m.qty +
        "</b><button data-a='1' data-id='" + m.id + "'>+</button></div></td>" +
        "<td style='text-align:right'><b>" + DB.money(m.price * m.qty) + "</b></td></tr>"
      ).join("") + "</tbody></table></div>" +
      '<div class="card"><div class="row" style="justify-content:space-between"><span>Subtotal</span><b>' +
      DB.money(sub) + "</b></div>" +
      '<div class="row" style="justify-content:space-between"><span>Delivery</span><b>' +
      (fee ? DB.money(fee) : "Free") + '</b></div><p class="muted">Free delivery above ' +
      DB.money(FREE_ABOVE) + "</p>" +
      '<div class="row" style="justify-content:space-between;font-size:17px"><span>Total</span><b class="price">' +
      DB.money(sub + fee) + "</b></div></div>" +
      '<div id="gate"></div>';

    wrap.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
      const m = items.find((x) => x.id === b.dataset.id);
      Cart.setQty(m.id, m.qty + Number(b.dataset.a), m.stock);
      render();
    }));

    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(document.getElementById("gate"), render);
    checkoutForm(chk.profile, items, sub, fee);
  }

  async function checkoutForm(me, items, sub, fee) {
    const gate = document.getElementById("gate");
    let addrs = [];
    try {
      const { data, error } = await DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at");
      if (error) throw error;
      addrs = data;
    } catch (e) { return DB.showErr(msg, e.message); }

    gate.innerHTML =
      '<div class="card"><h2 style="margin-bottom:8px">Delivery address</h2>' +
      (addrs.length
        ? '<select id="addr" aria-label="Delivery address">' + addrs.map((a) =>
          "<option value='" + a.id + "'>" + esc(a.label) + ": " + esc(a.address_text) + "</option>").join("") + "</select>"
        : '<p class="muted">No saved address yet — add one below.</p><select id="addr" style="display:none"></select>') +
      '<div class="row" style="margin-top:8px"><input id="nlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label">' +
      '<input id="nland" placeholder="Landmark" style="flex:2" aria-label="Landmark"></div>' +
      '<textarea id="ntext" rows="2" placeholder="Full address" style="margin-top:8px" aria-label="Full address"></textarea>' +
      '<button class="btn secondary" id="addaddr" style="margin-top:8px">Save address</button></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Delivery slot</h2>' +
      '<select id="slot" aria-label="Delivery slot"><option>Within 2 hours</option>' +
      "<option>Today evening</option><option>Tomorrow morning</option></select>" +
      '<h2 style="margin:12px 0 8px">Payment</h2>' +
      '<p><b>Cash on Delivery</b> <span class="muted">(UPI coming soon)</span></p>' +
      '<button class="btn" id="place" style="margin-top:14px">Place order · ' + DB.money(sub + fee) + "</button></div>";

    document.getElementById("addaddr").onclick = async () => {
      const text = document.getElementById("ntext").value.trim();
      if (!text) return DB.showErr(msg, "Enter the full address.");
      const { error } = await DB.sb.from("addresses").insert({
        customer_id: me.id,
        label: document.getElementById("nlabel").value.trim() || "Home",
        landmark: document.getElementById("nland").value.trim(),
        address_text: text,
      });
      if (error) return DB.showErr(msg, error.message);
      render();
    };
    document.getElementById("place").onclick = () => placeOrder(me, items, sub, fee);
  }

  async function placeOrder(me, items, sub, fee) {
    msg.innerHTML = "";
    const addrSel = document.getElementById("addr");
    const address_id = addrSel && addrSel.value ? addrSel.value : null;
    if (!address_id) return DB.showErr(msg, "Add a delivery address first.");

    // Rx gate: any Rx item needs an approved prescription on file (upload UI: Phase C)
    if (items.some((m) => m.rx_required)) {
      const { data, error } = await DB.sb.from("prescriptions").select("id")
        .eq("customer_id", me.id).eq("status", "approved").limit(1);
      if (error) return DB.showErr(msg, error.message);
      if (!data.length) {
        return DB.showErr(msg,
          "This order has prescription medicines. Upload a prescription from Account → My prescriptions — the pharmacist will verify it, then you can order.");
      }
    }
    // re-check stock+price before placing
    for (const m of items) {
      if (m.qty > m.stock) return DB.showErr(msg, esc(m.name) + " only has " + m.stock + " in stock. Adjust quantity.");
    }
    try {
      const { data: order, error } = await DB.sb.from("orders").insert({
        customer_id: me.id, address_id,
        status: "placed", subtotal: sub, delivery_fee: fee, total: sub + fee,
        payment_method: "cod", delivery_slot: document.getElementById("slot").value,
      }).select("id").single();
      if (error) throw error;
      const lines = items.map((m) => ({ order_id: order.id, medicine_id: m.id, qty: m.qty, unit_price: m.price }));
      const { error: e2 } = await DB.sb.from("order_items").insert(lines);
      if (e2) throw e2;
      Cart.clear();
      location.href = "orders.html";
    } catch (e) { DB.showErr(msg, e.message); }
  }

  render();
})();
