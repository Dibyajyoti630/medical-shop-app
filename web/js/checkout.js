// Cart page + checkout (COD pilot). Rx items need a prescription on file;
// the order waits in "awaiting_rx" until the pharmacist approves it.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const FREE_ABOVE = 499, FEE = 30;
  // Prescription choice for THIS order (per-order Rx requirement): exactly one
  // of — an existing prescription, uploading a new one, or a chemist-approval
  // request. Survives re-renders; validated against the fresh list each render.
  let rxPick = null;

  async function render() {
    msg.innerHTML = "";
    // Fire cart fetch + auth check concurrently — independent calls.
    let items, chk;
    try {
      [items, chk] = await Promise.all([
        Cart.detailed(),
        Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" })),
      ]);
    } catch (e) { return DB.showErr(msg, e.message); }
    if (!items.length) {
      wrap.innerHTML = '<div class="card"><p>Your cart is empty.</p>' +
        '<p style="margin-top:10px"><a href="index.html">Browse medicines →</a></p></div>';
      return;
    }
    if (!chk.ok) {
      wrap.innerHTML = '<div id="gate"></div>';
      return Auth.gate(document.getElementById("gate"), render);
    }
    const sub = items.reduce((a, m) => a + m.price * m.qty, 0);
    const fee = sub >= FREE_ABOVE ? 0 : FEE;
    const tot = sub + fee;
    const me = chk.profile;

    let addrs = [];
    let rxs = [];
    const hasRx = items.some(m => m.rx_required);
    try {
      const p = [DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at")];
      if (hasRx) p.push(DB.sb.from("prescriptions").select("id,status,image_url,created_at").eq("customer_id", me.id)
        .in("status", ["pending", "approved"]).order("created_at", { ascending: false }).limit(10));
      const results = await Promise.all(p);
      addrs = results[0].data || [];
      if (hasRx) {
        rxs = (results[1] && results[1].data) || [];
        if (rxPick && rxPick.t === "rx" && !rxs.some(r => r.id === rxPick.id)) rxPick = null;
      }
    } catch (e) { return DB.showErr(msg, e.message); }

    const addr = addrs.length ? addrs[0] : null;

    // Prescription picker: exactly one choice per order — an existing
    // prescription, uploading a new one, or a chemist-approval request.
    const curRxVal = !rxPick ? null : rxPick.t === "rx" ? "rx:" + rxPick.id : rxPick.t;
    const rxOpt = function (val, title, sub, status) {
      return '<label class="rx-opt"><input type="radio" name="rxsel" value="' + val + '"' + (curRxVal === val ? " checked" : "") + ">" +
        '<span class="rx-opt-body"><b>' + title + "</b>" +
        (sub ? '<span class="muted">' + sub + "</span>" : "") +
        (status ? '<span class="status ' + status + '">' + esc(status) + "</span>" : "") + "</span></label>";
    };
    const rxSec = !hasRx ? "" :
      '<div class="card"><h2 style="font-size:16px;margin-bottom:4px">Prescription for Rx medicines</h2>' +
      '<p class="muted" style="margin-bottom:10px">Choose one option — required for every order with Rx medicines.</p>' +
      "<div>" +
        rxs.map(r => rxOpt("rx:" + r.id, r.image_url ? "Prescription" : "Chemist approval",
          new Date(r.created_at).toLocaleString(), r.status)).join("") +
        rxOpt("upload", "Upload a new prescription", "Take a photo of your prescription") +
        rxOpt("request", "No prescription? Request chemist approval", "The chemist will call you to verify") +
      "</div>" +
      '<div id="rxuploadbox"' + (curRxVal === "upload" ? "" : " hidden") + ' style="margin-top:4px">' +
        '<label for="rxfile">Photo of prescription</label>' +
        '<input type="file" id="rxfile" accept="image/*" aria-label="Upload prescription">' +
        '<button class="btn secondary small" id="rxupbtn" style="margin-top:8px">Upload &amp; attach</button></div>' +
      '<div id="rxreqbox"' + (curRxVal === "request" ? "" : " hidden") + ' style="margin-top:4px">' +
        '<button class="btn secondary small" id="rxreqbtn">Send approval request</button></div>' +
      "</div>";

    wrap.innerHTML =
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
        '<div class="card row" style="align-items:flex-start"><div class="circle-icon">💊</div><div style="flex:1"><b>' + esc(m.name) + '</b>' + (m.rx_required ? '<span class="rx-tag">Rx</span>' : '') + '<div class="muted">' + esc(m.strength) + (m.pack_size ? ' • ' + esc(m.pack_size) : '') + '</div></div>' +
        '<div style="text-align:right"><div class="stepper" style="justify-content:flex-end"><button data-a="-1" data-id="' + m.id + '">−</button><b class="sqty">' + m.qty + '</b><button data-a="1" data-id="' + m.id + '">+</button></div><b style="display:block;margin-top:8px">' + DB.money(m.price * m.qty) + '</b></div></div>'
      ).join('') +
      rxSec +
      '<div class="card">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>Subtotal</span><b>' + DB.money(sub) + '</b></div>' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>Delivery Fee</span><b' + (fee === 0 ? ' style="color:var(--brand)"' : '') + '>' + (fee === 0 ? 'FREE' : DB.money(fee)) + '</b></div>' +
        '<hr style="border:0;border-top:1px dashed #d4dcd9;margin:12px 0">' +
        '<div class="row" style="justify-content:space-between;font-size:17px"><b>Total</b><b class="price">' + DB.money(tot) + '</b></div>' +
      '</div>' +
      '<h2 style="font-size:16px;margin:16px 4px 8px">Payment Method</h2>' +
      '<div class="pay-card" id="pay-upi"><div class="circle-icon" style="background:transparent;font-size:24px">📱</div><div style="flex:1 1 auto;min-width:0"><b>UPI</b><div class="muted">PhonePe • GPay • Paytm</div></div><span class="pay-radio"></span></div>' +
      '<div class="pay-card pay-card--active" id="pay-cod"><div class="circle-icon" style="background:transparent;font-size:24px">💵</div><div style="flex:1 1 auto;min-width:0"><b>Cash on Delivery</b><div class="muted">Pay when delivery arrives</div></div><span class="pay-radio pay-radio--on"></span></div>' +
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

    if (hasRx) {
      const rxValOf = () => (!rxPick ? null : rxPick.t === "rx" ? "rx:" + rxPick.id : rxPick.t);
      const syncRxBoxes = () => {
        const cv = rxValOf();
        const up = document.getElementById("rxuploadbox"), rq = document.getElementById("rxreqbox");
        if (up) up.hidden = cv !== "upload";
        if (rq) rq.hidden = cv !== "request";
      };
      // Radios can't be unchecked natively — tapping the selected one again clears it.
      wrap.querySelectorAll('input[name="rxsel"]').forEach(r => r.addEventListener("click", (e) => {
        const v = r.value;
        if (rxValOf() === v) { e.preventDefault(); r.checked = false; rxPick = null; }
        else rxPick = v === "upload" ? { t: "upload" } : v === "request" ? { t: "request" } : { t: "rx", id: v.slice(3) };
        msg.innerHTML = "";
        syncRxBoxes();
      }));
      const upBtn = document.getElementById("rxupbtn");
      upBtn.onclick = async () => {
        const file = document.getElementById("rxfile").files[0];
        if (!file) return DB.showErr(msg, "Select a photo first.");
        upBtn.disabled = true;
        try {
          upBtn.textContent = "Uploading…";
          const small = await DB.compressImage(file);
          const path = me.id + "/" + Date.now() + ".jpg";
          const { error: upErr } = await DB.sb.storage.from("prescriptions")
            .upload(path, small, { contentType: "image/jpeg" });
          if (upErr) throw upErr;
          const { data: ins, error: insErr } = await DB.sb.from("prescriptions")
            .insert({ customer_id: me.id, image_url: path }).select("id").single();
          if (insErr) throw insErr;
          rxPick = { t: "rx", id: ins.id };
          DB.toast("Prescription uploaded — attached to this order");
          render();
        } catch (e) { DB.showErr(msg, e.message); upBtn.disabled = false; upBtn.textContent = "Upload & attach"; }
      };
      const reqBtn = document.getElementById("rxreqbtn");
      reqBtn.onclick = async () => {
        try {
          const existing = rxs.find(r => r.status === "pending" && !r.image_url);
          if (existing) { rxPick = { t: "rx", id: existing.id }; DB.toast("Using your pending approval request"); render(); return; }
          reqBtn.disabled = true;
          const { data, error } = await DB.sb.from("prescriptions")
            .insert({ customer_id: me.id, image_url: null, status: "pending" }).select("id").single();
          if (error) throw error;
          rxPick = { t: "rx", id: data.id };
          DB.toast("Request sent — the chemist will call you");
          render();
        } catch (e) { DB.showErr(msg, e.message); reqBtn.disabled = false; }
      };
    }

    document.getElementById("place").onclick = async () => {
      const btn = document.getElementById("place");
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        if (!me.phone) {
          msg.innerHTML = '<div class="err">Add your phone number in Profile to place orders. ' +
            '<a href="account.html" style="color:var(--brand);font-weight:700">Go to Profile →</a></div>';
          return;
        }
        if (!addr) return DB.showErr(msg, "Please add a delivery address in Profile.");
        const selRx = hasRx && rxPick && rxPick.t === "rx" ? rxs.find(r => r.id === rxPick.id) : null;
        if (hasRx && !selRx) return DB.showErr(msg, !rxPick ? "Choose a prescription option for the Rx medicines in your cart."
          : rxPick.t === "upload" ? "Upload your prescription photo to continue."
          : "Send the chemist approval request to continue.");
        // Re-check live stock (page data may be stale if the shop just sold some).
        const fresh = await DB.sb.from("medicines").select("id,name,stock").in("id", items.map(m => m.id));
        if (fresh.error) throw fresh.error;
        for (const m of items) {
          const f = (fresh.data || []).find(x => x.id === m.id);
          const left = f ? f.stock : 0;
          if (left <= 0) return DB.showErr(msg, esc(m.name) + " just went out of stock. Remove it to continue.");
          if (m.qty > left) return DB.showErr(msg, "Only " + left + " left of " + esc(m.name) + ". Reduce quantity.");
        }
        const { data: order, error } = await DB.sb.from("orders").insert({
          customer_id: me.id, address_id: addr.id,
          prescription_id: selRx ? selRx.id : null,
          status: selRx && selRx.status !== "approved" ? "awaiting_rx" : "placed",
          subtotal: sub, delivery_fee: fee, total: tot,
          payment_method: "cod", delivery_slot: selSlot,
        }).select("id").single();
        if (error) throw error;
        const lines = items.map(m => ({ order_id: order.id, medicine_id: m.id, qty: m.qty, unit_price: m.price }));
        const { error: e2 } = await DB.sb.from("order_items").insert(lines);
        if (e2) throw e2;
        // Reserve stock atomically; cancel the order if stock ran out in the meantime.
        const { error: e3 } = await DB.sb.rpc("decrement_stock_for_order", { p_order_id: order.id });
        if (e3) {
          await DB.sb.from("orders").update({ status: "cancelled" }).eq("id", order.id);
          throw e3;
        }
        Cart.clear();
        location.href = "orders.html";
      } catch (e) { DB.showErr(msg, e.message); }
      finally { btn.disabled = false; }
    };
  }

  render();
})();
