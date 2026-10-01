// Customer account: profile, addresses, sign out.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(wrap, render);
    const me = chk.profile;
    let addrs = [];
    let rxs = [];
    try {
      const { data, error } = await DB.sb.from("addresses").select("*")
        .eq("customer_id", me.id).order("created_at");
      if (error) throw error;
      addrs = data;
      const rx = await DB.sb.from("prescriptions").select("*")
        .eq("customer_id", me.id).order("created_at", { ascending: false });
      if (rx.error) throw rx.error;
      rxs = rx.data;
    } catch (e) { return DB.showErr(msg, e.message); }

    wrap.innerHTML =
      '<div class="card"><div class="row" style="justify-content:space-between"><div><b>Account</b>' +
      '<p class="muted">' + esc(me.name || "Customer") + "</p></div>" +
      '<button class="btn secondary small" id="so">Sign out</button></div></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Addresses</h2><div id="alist">' +
      (addrs.map((a) =>
        '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef"><div><b>' +
        esc(a.label) + "</b><br><span class='muted'>" + esc(a.address_text) +
        (a.landmark ? " (" + esc(a.landmark) + ")" : "") + "</span></div>" +
        '<button class="btn secondary small" data-del="' + a.id + '">Delete</button></div>'
      ).join("") || '<p class="muted">No addresses saved.</p>') + "</div>" +
      '<div class="row" style="margin-top:8px"><input id="nlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label">' +
      '<input id="nland" placeholder="Landmark" style="flex:2" aria-label="Landmark"></div>' +
      '<textarea id="ntext" rows="2" placeholder="Full address" style="margin-top:8px" aria-label="Full address"></textarea>' +
      '<button class="btn" id="add" style="margin-top:8px">Save address</button></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">My prescriptions</h2>' +
      (rxs.map((r) =>
        '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef"><div><b>Prescription</b><br><span class="muted">' +
        new Date(r.created_at).toLocaleString() + '</span></div><span class="status ' + r.status + '">' + r.status + "</span></div>"
      ).join("") || '<p class="muted">No prescriptions uploaded.</p>') +
      '<label for="rxfile">Upload prescription (photo)</label>' +
      '<input type="file" id="rxfile" accept="image/*" aria-label="Upload prescription">' +
      '<p class="muted" style="margin-top:6px">The pharmacist verifies every prescription before Rx medicines can be ordered.</p></div>';

    document.getElementById("so").onclick = async () => { await Auth.signOut(); render(); };
    document.getElementById("add").onclick = async () => {
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
    wrap.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      const { error } = await DB.sb.from("addresses").delete().eq("id", b.dataset.del);
      if (error) return DB.showErr(msg, error.message);
      render();
    }));
    document.getElementById("rxfile").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = me.id + "/" + Date.now() + "-" + safe;
      const { error: upErr } = await DB.sb.storage.from("prescriptions").upload(path, file);
      if (upErr) return DB.showErr(msg, upErr.message);
      const { error: insErr } = await DB.sb.from("prescriptions")
        .insert({ customer_id: me.id, image_url: path });
      if (insErr) return DB.showErr(msg, insErr.message);
      render();
    };
  }
  render();
})();
