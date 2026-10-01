// Prescription upload page: list user's prescriptions + upload new ones.
// Images are compressed in-browser (max 1600px, JPEG ~0.7) before upload.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;

  // Downscale + JPEG-compress. Falls back to the original file if it can't be read (e.g. HEIC).
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

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(wrap, render);
    const me = chk.profile;

    let rxs = [];
    let orderedRx = {};
    try {
      const { data, error } = await DB.sb.from("prescriptions").select("*")
        .eq("customer_id", me.id).order("created_at", { ascending: false });
      if (error) throw error;
      rxs = data;
      // Prescriptions already tied to an open order can't be ordered twice.
      const { data: oo } = await DB.sb.from("orders").select("prescription_id")
        .eq("customer_id", me.id).not("prescription_id", "is", null)
        .not("status", "in", "(cancelled,delivered)");
      (oo || []).forEach(o => { orderedRx[o.prescription_id] = 1; });
    } catch (e) { return DB.showErr(msg, e.message); }

    wrap.innerHTML =
      '<div class="card">' +
      '<h2 style="margin-bottom:12px">Upload New Prescription</h2>' +
      '<label for="rxfile">Photo of prescription</label>' +
      '<input type="file" id="rxfile" accept="image/*" aria-label="Upload prescription">' +
      '<button class="btn" id="rxbtn" style="margin-top:12px">Upload</button>' +
      '<p class="muted" style="margin-top:10px">The photo is compressed on your phone before uploading, so it works even on slow networks. The pharmacist verifies every prescription before Rx medicines can be ordered.</p>' +
      '</div>' +
      '<div class="card"><h2 style="margin-bottom:8px">My Prescriptions</h2>' +
      (rxs.map(r =>
        '<div class="row" style="justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #edf1ef">' +
        '<div><b>Prescription</b><br><span class="muted">' +
        new Date(r.created_at).toLocaleString() + '</span><br>' +
        '<span class="status ' + r.status + '">' + esc(r.status) + '</span></div>' +
        ((r.status === "pending" || r.status === "approved") && !orderedRx[r.id]
          ? '<button class="btn secondary small" data-rxorder="' + r.id + '" data-st="' + r.status + '">Order</button>'
          : (orderedRx[r.id] ? '<span class="muted" style="font-size:13px">Ordered</span>' : '')) +
        '</div>'
      ).join("") || '<p class="muted">No prescriptions uploaded yet.</p>') +
      '<p class="muted" style="margin-top:10px">Want medicines directly from a prescription? Upload it above, then tap <b>Order</b> — the pharmacist will call you to confirm the medicines and total.</p>' +
      '</div>';

    document.getElementById("rxbtn").onclick = async () => {
      const btn = document.getElementById("rxbtn");
      const file = document.getElementById("rxfile").files[0];
      if (!file) return DB.showErr(msg, "Select a photo first.");
      btn.disabled = true;
      try {
        btn.textContent = "Compressing…";
        const small = await compressImage(file);
        btn.textContent = "Uploading…";
        const path = me.id + "/" + Date.now() + ".jpg";
        const { error: upErr } = await DB.sb.storage.from("prescriptions")
          .upload(path, small, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { error: insErr } = await DB.sb.from("prescriptions")
          .insert({ customer_id: me.id, image_url: path });
        if (insErr) throw insErr;
        DB.toast("Prescription uploaded — pending review");
        render();
      } catch (e) {
        DB.showErr(msg, e.message);
        btn.disabled = false;
        btn.textContent = "Upload";
      }
    };

    // Order-by-prescription: one tap on a prescription creates an order for the
    // pharmacist to fulfil (medicines confirmed over a call).
    wrap.onclick = async (e) => {
      const b = e.target.closest("[data-rxorder]");
      if (!b || b.disabled) return;
      b.disabled = true;
      try {
        if (!confirm("Place an order with this prescription? The pharmacist will call you to confirm the medicines and total.")) return;
        const { data: addrs, error: aErr } = await DB.sb.from("addresses").select("id")
          .eq("customer_id", me.id).order("created_at").limit(1);
        if (aErr) throw aErr;
        if (!addrs.length) throw new Error("Add a delivery address in Profile first.");
        const { error } = await DB.sb.from("orders").insert({
          customer_id: me.id, address_id: addrs[0].id, prescription_id: b.dataset.rxorder,
          status: b.dataset.st === "approved" ? "placed" : "awaiting_rx",
          subtotal: 0, delivery_fee: 0, total: 0, payment_method: "cod",
          notes: "Order by prescription — pharmacist to call and confirm medicines.",
        });
        if (error) throw error;
        DB.toast("Order placed — pharmacist will call you");
        location.href = "orders.html";
      } catch (err) { DB.showErr(msg, err.message); }
      finally { b.disabled = false; }
    };
  }

  render();
})();
