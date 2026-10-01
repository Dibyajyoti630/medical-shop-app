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
    const tot = sub + fee;

    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) {
      // ponytail: simplest fallback for unauth cart
      wrap.innerHTML = '<div id="gate"></div>';
      return Auth.gate(document.getElementById("gate"), render);
    }
    const me = chk.profile;

    let addrs = [];
    let rxStatusHtml = '';
    const hasRx = items.some(m => m.rx_required);
    try {
      const p = [DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at")];
      if (hasRx) p.push(DB.sb.from("prescriptions").select("id").eq("customer_id", me.id).eq("status", "approved").limit(1));
      const results = await Promise.all(p);
      addrs = results[0].data || [];
      if (hasRx) {
        if (results[1] && results[1].data.length) rxStatusHtml = '<div class="pill rx-ok">✓ Prescription attached</div>';
        else rxStatusHtml = '<div class="card err">Order contains Rx medicines. Prescription required to place order.</div>';
      }
    } catch (e) { return DB.showErr(msg, e.message); }

    const addr = addrs.length ? addrs[0] : null;

    wrap.innerHTML = rxStatusHtml +
      '<div class="card">' +
        (addr
          ? '<div class="row" style="align-items:flex-start"><div class="circle-icon" style="background:transparent;color:var(--brand);margin-top:-4px">📍</div><div style="flex:1"><b>' + esc(addr.label) + '</b><div class="muted">' + esc(addr.address_text) + '</div></div><a href="account.html" class="btn secondary small" style="color:var(--brand);border:1px solid var(--brand);background:transparent;padding:6px 12px;height:auto">Change</a></div>'
          : '<p class="muted">No saved address.</p><a href="account.html" class="btn secondary small" style="display:inline-block;margin-top:8px">Add Address</a>') +
      '</div>' +
      '<div class="card"><h2 style="font-size:16px;margin-bottom:12px">Delivery Slot</h2>' +
        '<div class="chips" id="slots">' +
          '<div class="chip active">🕒 Today 4–6 PM</div>' +
          '<div class="chip">🕒 Today 6–8 PM</div>' +
          '<div class="chip">🕒 Tomorrow 9–11 AM</div>' +
        '</div>' +
      '</div>' +
      '<h2 style="font-size:16px;margin:16px 4px 8px">Order Summary</h2>' +
      items.map(m =>
        '<div class="card row" style="align-items:flex-start"><div class="circle-icon">💊</div><div style="flex:1"><b>' + esc(m.name) + '</b><div class="muted">' + esc(m.strength) + ' • ' + esc(m.pack) + '</div></div>' +
        '<div style="text-align:right"><div class="stepper" style="justify-content:flex-end"><button data-a="-1" data-id="' + m.id + '">−</button><b class="sqty">' + m.qty + '</b><button data-a="1" data-id="' + m.id + '">+</button></div><b style="display:block;margin-top:8px">' + DB.money(m.price * m.qty) + '</b></div></div>'
      ).join('') +
      '<div class="card">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>Subtotal</span><b>' + DB.money(sub) + '</b></div>' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>Delivery Fee</span><b' + (fee === 0 ? ' style="color:var(--brand)"' : '') + '>' + (fee === 0 ? 'FREE' : DB.money(fee)) + '</b></div>' +
        '<hr style="border:0;border-top:1px dashed #d4dcd9;margin:12px 0">' +
        '<div class="row" style="justify-content:space-between;font-size:17px"><b>Total</b><b class="price">' + DB.money(tot) + '</b></div>' +
      '</div>' +
      '<h2 style="font-size:16px;margin:16px 4px 8px">Payment Method</h2>' +
      '<div class="card row" id="pay-upi" style="cursor:pointer"><div class="circle-icon" style="background:transparent;font-size:24px">📱</div><div style="flex:1"><b>UPI</b><div class="muted">PhonePe • GPay • Paytm</div></div><input type="radio" name="pay" disabled></div>' +
      '<div class="card row active-pay" id="pay-cod" style="cursor:pointer;border:2px solid var(--brand)"><div class="circle-icon" style="background:transparent;font-size:24px">💵</div><div style="flex:1"><b>Cash on Delivery</b><div class="muted">Pay when delivery arrives</div></div><input type="radio" name="pay" checked></div>' +
      '<button class="btn" id="place" style="margin-top:14px;height:52px;font-size:17px">🔒 Place Order</button>' +
      '<p class="muted" style="text-align:center;margin-top:12px;font-size:12px">You can review and cancel before the rider is assigned.</p>';

    wrap.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const m = items.find(x => x.id === b.dataset.id);
      Cart.setQty(m.id, m.qty + Number(b.dataset.a), m.stock);
      render();
    });

    let selSlot = "Today 4–6 PM";
    wrap.querySelectorAll("#slots .chip").forEach(c => c.onclick = () => {
      wrap.querySelectorAll("#slots .chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      selSlot = c.innerText.replace('🕒 ', '');
    });

    document.getElementById("pay-upi").onclick = () => DB.toast("UPI payments coming soon");

    document.getElementById("place").onclick = async () => {
      if (!addr) return DB.showErr(msg, "Please add a delivery address in Profile.");
      if (hasRx && !rxStatusHtml.includes("rx-ok")) return DB.showErr(msg, "Prescription required. Please upload in Account.");
      for (const m of items) {
        if (m.qty > m.stock) return DB.showErr(msg, esc(m.name) + " only has " + m.stock + " in stock. Adjust quantity.");
      }
      try {
        const { data: order, error } = await DB.sb.from("orders").insert({
          customer_id: me.id, address_id: addr.id,
          status: "placed", subtotal: sub, delivery_fee: fee, total: tot,
          payment_method: "cod", delivery_slot: selSlot,
        }).select("id").single();
        if (error) throw error;
        const lines = items.map(m => ({ order_id: order.id, medicine_id: m.id, qty: m.qty, unit_price: m.price }));
        const { error: e2 } = await DB.sb.from("order_items").insert(lines);
        if (e2) throw e2;
        Cart.clear();
        location.href = "orders.html";
      } catch (e) { DB.showErr(msg, e.message); }
    };
  }

  render();
})();
