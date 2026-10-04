// Cart page + checkout (COD pilot). Rx items need a prescription on file;
// the order waits in "awaiting_rx" until the pharmacist approves it.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const GEO = DB.geo;
  // Prescription choice for THIS order (per-order Rx requirement): exactly one
  // of — a photo prescription, uploading a new one, or requesting chemist
  // approval (a callback ticket; not orderable). Survives re-renders.
  let rxPick = null;
  let selSlot = "Today 4–6 PM";
  let rxActive = false, rtCh = null;

  // Live prescription status: when the chemist approves/rejects, the picker
  // updates without a manual refresh.
  function watchRx(uid) {
    if (rtCh) return;
    rtCh = DB.sb.channel("cust-rx-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions", filter: "customer_id=eq." + uid },
        function () { if (rxActive) render(); })
      .subscribe();
  }

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
    const me = chk.profile;

    let addrs = [];
    let rxs = [];
    let areas = [];
    const hasRx = items.some(m => m.rx_required);
    try {
      const p = [DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at"),
        (DB.areas ? DB.areas() : Promise.resolve([])).catch(() => [])];
      if (hasRx) p.push(DB.sb.from("prescriptions").select("id,status,image_url,created_at").eq("customer_id", me.id)
        .in("status", ["pending", "approved"]).order("created_at", { ascending: false }).limit(10));
      const results = await Promise.all(p);
      addrs = results[0].data || [];
      areas = results[1] || [];
      if (hasRx) {
        const all = (results[2] && results[2].data) || [];
        rxs = all.filter(r => r.image_url); // requests are callback tickets — never orderable
        if (rxPick && rxPick.t === "rx" && !rxs.some(r => r.id === rxPick.id)) rxPick = null;
        if (rxPick && rxPick.t === "req") rxPick = null;
      }
    } catch (e) { return DB.showErr(msg, e.message); }

    const addr = addrs.find(a => a.is_default) || addrs[0] || null;
    const area = addr && addr.area_id ? areas.find(x => x.id === addr.area_id) : null;

    // Village-wise fee from the delivery table; old geocoded addresses keep
    // the distance path; unknown locations fall back to Rs 30.
    let km = null, fee = 30, zoneOk = true, feeNote = "";
    if (addr) {
      if (area) {
        fee = sub >= GEO.FREE_ABOVE ? 0 : Number(area.fee);
        feeNote = area.name;
      } else {
        if (addr.lat != null && addr.lon != null) {
          km = GEO.haversineKm(GEO.SHOP.lat, GEO.SHOP.lon, addr.lat, addr.lon);
        } else {
          const g = await GEO.geocode(addr.address_text, addr.label).catch(() => null);
          if (g) {
            km = GEO.haversineKm(GEO.SHOP.lat, GEO.SHOP.lon, g.lat, g.lon);
            DB.sb.from("addresses").update({ lat: g.lat, lon: g.lon }).eq("id", addr.id); // backfill
          }
        }
        if (km != null && km > GEO.MAX_KM) zoneOk = false;
        else fee = km == null ? 30 : GEO.feeForKm(km, sub);
      }
    }
    const tot = sub + fee;

    if (addr && !zoneOk) {
      wrap.innerHTML = '<div class="card"><h2 style="margin-bottom:8px">Outside delivery area</h2>' +
        '<p class="muted">Sorry, we currently deliver within ' + GEO.MAX_KM + ' km of our store (Jaleswar–Baliapal area). ' +
        'Please update your delivery address or contact the shop.</p>' +
        '<a href="account.html" class="btn" style="display:inline-block;margin-top:12px">Update address</a></div>';
      return;
    }

    // Prescription picker: exactly one choice per order — a photo prescription,
    // uploading a new one, or requesting chemist approval.
    const rxValOf = (p) => (!p ? null : p.t === "rx" ? "rx:" + p.id : p.t);
    const curRxVal = rxValOf(rxPick);
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
        rxs.map(r => rxOpt("rx:" + r.id, "Prescription",
          new Date(r.created_at).toLocaleString(), r.status)).join("") +
        rxOpt("upload", "Upload a new prescription", "Take a photo of your prescription") +
        rxOpt("request", "No prescription? Order with chemist approval", "Place the order — the chemist will call you to approve it") +
      "</div>" +
      '<div id="rxuploadbox"' + (curRxVal === "upload" ? "" : " hidden") + ' style="margin-top:4px">' +
        '<label for="rxfile">Photo of prescription</label>' +
        '<input type="file" id="rxfile" accept="image/*" aria-label="Upload prescription">' +
        '<button class="btn secondary small" id="rxupbtn" style="margin-top:8px">Upload &amp; attach</button></div>' +
      "</div>";

    wrap.innerHTML =
      '<div class="card">' +
        (addr
          ? '<div class="row" style="align-items:flex-start"><div class="circle-icon" style="background:transparent;color:var(--brand);margin-top:-4px">📍</div><div style="flex:1"><b>' + esc(addr.label) + '</b><div class="muted">' + esc(addr.address_text) + (area ? "<br>" + esc(area.name) + " — " + esc(area.pincode) : "") + '</div></div><a href="account.html" class="btn secondary small" style="color:var(--brand);border:1px solid var(--brand);background:transparent;padding:6px 12px;height:auto">Change</a></div>'
          : '<p class="muted">No saved address.</p><a href="account.html" class="btn secondary small" style="display:inline-block;margin-top:8px">Add Address</a>') +
      '</div>' +
      '<div class="card"><h2 style="font-size:16px;margin-bottom:12px">Delivery Slot</h2>' +
        '<div class="chips" id="slots">' +
          ["Today 4–6 PM", "Today 6–8 PM", "Tomorrow 9–11 AM"].map(s =>
            '<div class="chip' + (s === selSlot ? " active" : "") + '" data-slot="' + s + '">🕒 ' + s + "</div>").join("") +
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
        '<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>Delivery Fee' + (feeNote ? ' <span class="muted">(' + esc(feeNote) + ')</span>' : km != null ? ' <span class="muted">(' + km.toFixed(1) + ' km)</span>' : '') + '</span><b' + (fee === 0 ? ' style="color:var(--brand)"' : '') + '>' + (fee === 0 ? 'FREE' : DB.money(fee)) + '</b></div>' +
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

    wrap.querySelectorAll("#slots .chip").forEach(c => c.onclick = () => {
      wrap.querySelectorAll("#slots .chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      selSlot = c.dataset.slot;
    });

    document.getElementById("pay-upi").onclick = () => DB.toast("UPI payments coming soon");

    if (hasRx) {
      const rxValOf = () => (!rxPick ? null : rxPick.t === "rx" ? "rx:" + rxPick.id : rxPick.t);
      const syncRxBoxes = () => {
        const up = document.getElementById("rxuploadbox");
        if (up) up.hidden = rxValOf(rxPick) !== "upload";
      };
      // Radios can't be unchecked natively — tapping the selected one again clears it.
      wrap.querySelectorAll('input[name="rxsel"]').forEach(r => r.addEventListener("click", (e) => {
        const v = r.value;
        if (rxValOf(rxPick) === v) { e.preventDefault(); r.checked = false; rxPick = null; }
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
    }

    rxActive = hasRx;
    if (hasRx) watchRx(me.id);

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
        const reqApproval = hasRx && rxPick && rxPick.t === "request";
        if (hasRx && !selRx && !reqApproval) return DB.showErr(msg, !rxPick ? "Choose a prescription option for the Rx medicines in your cart."
          : "Upload your prescription photo to continue.");
        // Re-check live stock (page data may be stale if the shop just sold some).
        const fresh = await DB.sb.from("medicines").select("id,name,stock").in("id", items.map(m => m.id));
        if (fresh.error) throw fresh.error;
        for (const m of items) {
          const f = (fresh.data || []).find(x => x.id === m.id);
          const left = f ? f.stock : 0;
          if (left <= 0) return DB.showErr(msg, esc(m.name) + " just went out of stock. Remove it to continue.");
          if (m.qty > left) return DB.showErr(msg, "Only " + left + " left of " + esc(m.name) + ". Reduce quantity.");
        }
        const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit handoff code
        const { data: order, error } = await DB.sb.from("orders").insert({
          customer_id: me.id, address_id: addr.id,
          prescription_id: selRx ? selRx.id : null,
          status: reqApproval || (selRx && selRx.status !== "approved") ? "awaiting_rx" : "placed",
          subtotal: sub, delivery_fee: fee, total: tot,
          payment_method: "cod", delivery_slot: selSlot,
          notes: reqApproval ? "No prescription — customer requested chemist approval over a call." : null,
          delivery_otp: deliveryOtp,
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
