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
    try {
      const { data, error } = await DB.sb.from("prescriptions").select("*")
        .eq("customer_id", me.id).order("created_at", { ascending: false });
      if (error) throw error;
      rxs = data;
    } catch (e) { return DB.showErr(msg, e.message); }

    wrap.innerHTML =
      '<div class="card"><h2 style="margin-bottom:8px">My Prescriptions</h2>' +
      (rxs.map(r =>
        '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef">' +
        '<div><b>Prescription</b><br><span class="muted">' +
        new Date(r.created_at).toLocaleString() + '</span></div>' +
        '<span class="status ' + r.status + '">' + esc(r.status) + '</span></div>'
      ).join("") || '<p class="muted">No prescriptions uploaded yet.</p>') +
      '</div>' +
      '<div class="card">' +
      '<h2 style="margin-bottom:12px">Upload New Prescription</h2>' +
      '<label for="rxfile">Photo of prescription</label>' +
      '<input type="file" id="rxfile" accept="image/*" aria-label="Upload prescription">' +
      '<button class="btn" id="rxbtn" style="margin-top:12px">Upload</button>' +
      '<p class="muted" style="margin-top:10px">The photo is compressed on your phone before uploading, so it works even on slow networks. The pharmacist verifies every prescription before Rx medicines can be ordered.</p>' +
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
  }

  render();
})();
