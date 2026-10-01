// Prescription upload page: list user's prescriptions + upload new ones.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;

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
      '<p class="muted" style="margin-top:10px">The pharmacist verifies every prescription before Rx medicines can be ordered.</p>' +
      '</div>';

    document.getElementById("rxbtn").onclick = async () => {
      const file = document.getElementById("rxfile").files[0];
      if (!file) return DB.showErr(msg, "Select a photo first.");
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = me.id + "/" + Date.now() + "-" + safe;
      const { error: upErr } = await DB.sb.storage.from("prescriptions").upload(path, file);
      if (upErr) return DB.showErr(msg, upErr.message);
      const { error: insErr } = await DB.sb.from("prescriptions")
        .insert({ customer_id: me.id, image_url: path });
      if (insErr) return DB.showErr(msg, insErr.message);
      DB.toast("Prescription uploaded — pending review");
      render();
    };
  }

  render();
})();
