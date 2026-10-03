// Customer account: profile (name + phone), addresses, sign out.
// View-first layout: cards with edit pencils; forms appear only while editing.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;
  let mode = "profile"; // 'profile' | 'profileEdit' | 'addrAdd' | { addrEdit: <uuid> }

  function validPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
  }
  function initials(name) {
    const s = (name || "").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return s || "–";
  }

  const svgEdit = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
  const svgTrash = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const svgPin = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>';

  function addrFormHTML(a) {
    a = a || {};
    return '<div class="row" style="margin-top:8px">' +
      '<input id="nlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label" value="' + esc(a.label || "") + '">' +
      '<input id="nland" placeholder="Landmark" style="flex:2" aria-label="Landmark" value="' + esc(a.landmark || "") + '"></div>' +
      '<textarea id="ntext" rows="2" placeholder="Full address" style="margin-top:8px" aria-label="Full address">' + esc(a.address_text || "") + "</textarea>" +
      '<div class="row" style="margin-top:8px"><button class="btn" id="asave" style="flex:1">Save address</button>' +
      '<button class="btn secondary" id="acancel" style="flex:1">Cancel</button></div>';
  }

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(wrap, render);
    const me = chk.profile;

    let addrs = [], email = "";
    try {
      const [u, r] = await Promise.all([
        Auth.user().catch(() => null),
        DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at"),
      ]);
      if (r.error) throw r.error;
      addrs = r.data;
      email = (u && u.email) || "";
    } catch (e) { return DB.showErr(msg, e.message); }

    // ── profile card: view or edit ──
    let prof;
    if (mode === "profileEdit") {
      prof = '<div class="card"><b>Edit profile</b>' +
        '<label for="pname" style="margin-top:10px">Name</label>' +
        '<input id="pname" placeholder="Your name" value="' + esc(me.name || "") + '">' +
        '<label for="pphone">Phone <span class="muted" style="font-weight:400;font-size:12px">(10 digits, starts 6–9)</span></label>' +
        '<input id="pphone" type="tel" placeholder="9876543210" value="' + esc(me.phone || "") + '">' +
        '<div id="pmsg" style="margin-top:4px"></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn" id="psave" style="flex:1">Save</button>' +
        '<button class="btn secondary" id="pcancel" style="flex:1">Cancel</button></div></div>';
    } else {
      prof = '<div class="card profcard">' +
        '<button class="iconbtn" id="pedit" aria-label="Edit profile">' + svgEdit + "</button>" +
        '<div class="row"><div class="avatar">' + esc(initials(me.name)) + "</div><div>" +
        "<b>" + esc(me.name || "Your name") + "</b><br>" +
        '<span class="muted">' + esc(me.phone || "Add phone number") + "</span><br>" +
        '<span class="muted">' + esc(email) + "</span></div></div></div>";
    }

    // ── addresses card ──
    const editing = mode && mode.addrEdit;
    const rows = addrs.map(a => {
      if (editing && editing === a.id)
        return '<div style="padding:8px 0">' + addrFormHTML(a) + "</div>";
      return '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef">' +
        '<div class="row" style="flex:1"><span style="color:var(--brand);line-height:0">' + svgPin + "</span><div><b>" +
        esc(a.label) + "</b><br><span class='muted'>" + esc(a.address_text) +
        (a.landmark ? " (" + esc(a.landmark) + ")" : "") + "</span></div></div>" +
        '<button class="iconbtn" data-edit="' + a.id + '" aria-label="Edit address">' + svgEdit + "</button>" +
        '<button class="iconbtn" data-del="' + a.id + '" aria-label="Delete address">' + svgTrash + "</button></div>";
    }).join("");

    let addrCard = '<div class="card"><h2 style="margin-bottom:8px">My Addresses</h2><div id="alist">' +
      (rows || '<p class="muted">No addresses saved.</p>') + "</div>";
    if (mode === "addrAdd") addrCard += addrFormHTML();
    else if (!editing) addrCard += '<button class="btn" id="aaddshow" style="margin-top:8px">+ Add New Address</button>';
    addrCard += "</div>";

    wrap.innerHTML = prof + addrCard +
      '<div class="card"><button class="btn secondary" id="so">Sign out</button></div>';

    document.getElementById("so").onclick = async () => { await Auth.signOut(); mode = "profile"; render(); };

    const pe = document.getElementById("pedit");
    if (pe) pe.onclick = () => { mode = "profileEdit"; render(); };
    const pc = document.getElementById("pcancel");
    if (pc) pc.onclick = () => { mode = "profile"; render(); };

    const ps = document.getElementById("psave");
    if (ps) ps.onclick = async () => {
      const pmsg = document.getElementById("pmsg");
      pmsg.innerHTML = "";
      const phone = validPhone(document.getElementById("pphone").value.trim());
      if (!phone) {
        DB.showErr(pmsg, "Phone must be exactly 10 digits and start with 6, 7, 8, or 9.");
        return;
      }
      const name = document.getElementById("pname").value.trim();
      const { error } = await DB.sb.from("profiles").update({ name, phone }).eq("id", me.id);
      if (error) return DB.showErr(pmsg, error.message);
      // Guard: an older cached db.js may not have DB.toast yet — never let
      // a missing toast kill the handler silently.
      if (DB.toast) DB.toast("Profile saved");
      mode = "profile";
      render();
    };

    const aadd = document.getElementById("aaddshow");
    if (aadd) aadd.onclick = () => { mode = "addrAdd"; render(); };
    const ac = document.getElementById("acancel");
    if (ac) ac.onclick = () => { mode = "profile"; render(); };

    const as = document.getElementById("asave");
    if (as) as.onclick = async () => {
      const text = document.getElementById("ntext").value.trim();
      if (!text) return DB.showErr(msg, "Enter the full address.");
      const payload = {
        label: document.getElementById("nlabel").value.trim() || "Home",
        landmark: document.getElementById("nland").value.trim(),
        address_text: text,
      };
      // Locate the address once; refuse saves outside the delivery zone.
      // (If the geocoder can't place it, save anyway — checkout retries.)
      as.disabled = true;
      try {
        const g = await DB.geo.geocode(text).catch(() => null);
        if (g) {
          const km = DB.geo.haversineKm(DB.geo.SHOP.lat, DB.geo.SHOP.lon, g.lat, g.lon);
          if (km > DB.geo.MAX_KM)
            return DB.showErr(msg, "This address is about " + km.toFixed(0) + " km away — we deliver within " +
              DB.geo.MAX_KM + " km of our store (Jaleswar–Baliapal area).");
          payload.lat = g.lat; payload.lon = g.lon;
        }
      } finally { as.disabled = false; }
      let error;
      if (editing) ({ error } = await DB.sb.from("addresses").update(payload).eq("id", editing));
      else ({ error } = await DB.sb.from("addresses").insert(Object.assign({ customer_id: me.id }, payload)));
      if (error) return DB.showErr(msg, error.message);
      if (DB.toast) DB.toast(editing ? "Address updated" : "Address saved");
      mode = "profile";
      render();
    };

    wrap.querySelectorAll("[data-del]").forEach(b => (b.onclick = async () => {
      const { error } = await DB.sb.from("addresses").delete().eq("id", b.dataset.del);
      if (error) return DB.showErr(msg, error.message);
      render();
    }));
    wrap.querySelectorAll("[data-edit]").forEach(b => (b.onclick = () => {
      mode = { addrEdit: b.dataset.edit };
      render();
    }));
  }

  render();
})();
