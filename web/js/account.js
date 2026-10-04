// Customer account: profile (name + phone), addresses, sign out.
// View-first layout: cards with edit pencils; forms appear only while editing.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;
  let mode = "profile"; // 'profile' | 'profileEdit' | 'addrAdd' | 'areaReq' | { addrEdit: <uuid> }
  let reqPrefill = "", selAreaId = null, reqSub = null, reqUid = null;

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

  const areaLabel = x => x.name + " — " + x.pincode + " (delivery ₹" + Number(x.fee) + ")";

  // Live decision updates: approve/reject reflects without refresh.
  function watchAreaRequests(uid) {
    if (reqSub && reqUid === uid) return;
    if (reqSub) { try { DB.sb.removeChannel(reqSub); } catch (e) {} reqSub = null; }
    reqUid = uid;
    reqSub = DB.sb.channel("area-req-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "area_requests", filter: "customer_id=eq." + uid }, () => render())
      .subscribe();
  }

  function addrFormHTML(a, areas) {
    a = a || {};
    const cur = a.area_id && areas ? areas.find(x => x.id === a.area_id) : null;
    selAreaId = (cur && cur.id) || null;
    return '<label for="narea">Village / PIN</label>' +
      '<input id="narea" placeholder="Type village name or PIN…" autocomplete="off" aria-label="Village or PIN" value="' + esc(cur ? areaLabel(cur) : "") + '">' +
      '<div id="areaMatches" class="amatch" hidden></div>' +
      '<div class="row" style="margin-top:8px">' +
      '<input id="nlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label" value="' + esc(a.label || "") + '">' +
      '<input id="nland" placeholder="Landmark" style="flex:2" aria-label="Landmark" value="' + esc(a.landmark || "") + '"></div>' +
      '<textarea id="ntext" rows="2" placeholder="House no, street…" style="margin-top:8px" aria-label="House details">' + esc(a.address_text || "") + "</textarea>" +
      '<div class="row" style="margin-top:8px"><button class="btn" id="asave" style="flex:1">Save address</button>' +
      '<button class="btn secondary" id="acancel" style="flex:1">Cancel</button></div>';
  }

  // Search-as-you-type village picker; selection is mandatory.
  function bindAreaPicker(areas) {
    const inp = document.getElementById("narea"), box = document.getElementById("areaMatches");
    if (!inp || !box) return;
    const show = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { box.hidden = true; box.innerHTML = ""; return; }
      const hits = areas.filter(x => x.name.toLowerCase().includes(q) || x.pincode.includes(q)).slice(0, 8);
      let h = hits.map(x => '<button type="button" data-area="' + x.id + '">' + esc(areaLabel(x)) + "</button>").join("");
      if (!hits.length)
        h = '<div class="muted" style="padding:10px 12px">No match for "' + esc(inp.value.trim()) + '".</div>' +
          '<button type="button" id="reqArea" style="color:var(--brand);font-weight:700">+ Request this area</button>';
      box.hidden = false;
      box.innerHTML = h;
      box.querySelectorAll("[data-area]").forEach(b => (b.onclick = () => {
        selAreaId = b.dataset.area;
        const x = areas.find(a => a.id === selAreaId);
        inp.value = areaLabel(x);
        box.hidden = true; box.innerHTML = "";
      }));
      const rq = document.getElementById("reqArea");
      if (rq) rq.onclick = () => { reqPrefill = inp.value.trim(); mode = "areaReq"; render(); };
    };
    inp.addEventListener("input", () => { selAreaId = null; show(); });
    inp.addEventListener("focus", show);
  }

  function areaReqFormHTML() {
    const isPin = /^\d{4,6}$/.test(reqPrefill || "");
    return '<p class="muted" style="margin:0 0 8px">Village not in our list? Send a request — the shop sets the fee and you\u2019ll see the decision here.</p>' +
      '<label for="rvillage">Village name</label>' +
      '<input id="rvillage" placeholder="e.g. Baliapal Chowk" value="' + esc(isPin ? "" : reqPrefill) + '">' +
      '<label for="rpin">PIN code</label>' +
      '<input id="rpin" placeholder="e.g. 756026" inputmode="numeric" value="' + esc(isPin ? reqPrefill : "") + '">' +
      '<div class="row" style="margin-top:8px">' +
      '<input id="rlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label">' +
      '<input id="rland" placeholder="Landmark" style="flex:2" aria-label="Landmark"></div>' +
      '<textarea id="rtext" rows="2" placeholder="House no, street…" style="margin-top:8px" aria-label="House details"></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="btn" id="rsave" style="flex:1">Send request</button>' +
      '<button class="btn secondary" id="acancel" style="flex:1">Cancel</button></div>';
  }

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(wrap, render);
    const me = chk.profile;

    let addrs = [], email = "", areas = [], reqs = [];
    try {
      const [u, r, ar, qr] = await Promise.all([
        Auth.user().catch(() => null),
        DB.sb.from("addresses").select("*").eq("customer_id", me.id).order("created_at"),
        (DB.areas ? DB.areas() : Promise.resolve([])).catch(() => []),
        DB.sb.from("area_requests").select("*").eq("customer_id", me.id).order("created_at", { ascending: false }).then(x => x.data || [], () => []),
      ]);
      if (r.error) throw r.error;
      addrs = r.data;
      email = (u && u.email) || "";
      areas = ar || [];
      reqs = qr || [];
    } catch (e) { return DB.showErr(msg, e.message); }
    watchAreaRequests(me.id);
    const areaById = {};
    areas.forEach(x => { areaById[x.id] = x; });

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
        return '<div style="padding:8px 0">' + addrFormHTML(a, areas) + "</div>";
      const an = a.area_id && areaById[a.area_id];
      return '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef">' +
        '<div class="row" style="flex:1">' +
        '<input type="radio" name="defAddr" data-def="' + a.id + '"' + (a.is_default ? " checked" : "") +
        ' aria-label="Use as delivery address" title="Deliver here" style="accent-color:var(--brand);width:18px;height:18px;flex:none">' +
        '<span style="color:var(--brand);line-height:0">' + svgPin + "</span><div><b>" +
        esc(a.label) + "</b><br><span class='muted'>" + esc(a.address_text) +
        (a.landmark ? " (" + esc(a.landmark) + ")" : "") +
        (an ? "<br>" + esc(an.name) + " — " + esc(an.pincode) : "") + "</span></div></div>" +
        '<button class="iconbtn" data-edit="' + a.id + '" aria-label="Edit address">' + svgEdit + "</button>" +
        '<button class="iconbtn" data-del="' + a.id + '" aria-label="Delete address">' + svgTrash + "</button></div>";
    }).join("");

    // Pending requests live inside the address list; approved ones arrive as
    // addresses automatically, rejected ones surface via the bell.
    const pendRows = reqs.filter(q => q.status === "pending").map(q =>
      '<div style="padding:10px 0;border-top:1px solid #edf1ef"><b>' + esc(q.village_name) + '</b> <span class="muted">— ' +
      esc(q.pincode) + '</span><br><span style="background:#fdeeda;color:#d97a06;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px">Pending approval</span></div>'
    ).join("");

    let addrCard = '<div class="card"><h2 style="margin-bottom:8px">My Addresses</h2><div id="alist">' +
      (rows || '<p class="muted">No addresses saved.</p>') + pendRows + "</div>";
    if (mode === "addrAdd") addrCard += addrFormHTML(null, areas);
    else if (mode === "areaReq") addrCard += areaReqFormHTML();
    else if (!editing) addrCard += '<button class="btn" id="aaddshow" style="margin-top:8px">+ Add New Address</button>';
    addrCard += "</div>";

    wrap.innerHTML = prof + addrCard +
      '<div class="card"><button class="btn secondary" id="so">Sign out</button></div>';

    document.getElementById("so").onclick = async () => { await Auth.signOut(); mode = "profile"; render(); };
    bindAreaPicker(areas);

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
      if (!selAreaId || !areas.some(x => x.id === selAreaId))
        return DB.showErr(msg, "Select your village from the list.");
      const text = document.getElementById("ntext").value.trim();
      if (!text) return DB.showErr(msg, "Enter your house no / street.");
      const payload = {
        label: document.getElementById("nlabel").value.trim() || "Home",
        landmark: document.getElementById("nland").value.trim(),
        address_text: text,
        area_id: selAreaId,
        lat: null,
        lon: null,
      };
      as.disabled = true;
      let error;
      try {
        if (editing) ({ error } = await DB.sb.from("addresses").update(payload).eq("id", editing));
        else ({ error } = await DB.sb.from("addresses").insert(Object.assign({ customer_id: me.id }, payload)));
      } finally { as.disabled = false; }
      if (error) return DB.showErr(msg, error.message);
      if (DB.toast) DB.toast(editing ? "Address updated" : "Address saved");
      mode = "profile";
      render();
    };

    const rs = document.getElementById("rsave");
    if (rs) rs.onclick = async () => {
      const vn = document.getElementById("rvillage").value.trim();
      const pc = document.getElementById("rpin").value.trim();
      const tx = document.getElementById("rtext").value.trim();
      if (!vn) return DB.showErr(msg, "Enter the village name.");
      if (!/^\d{6}$/.test(pc)) return DB.showErr(msg, "Enter a valid 6-digit PIN.");
      if (!tx) return DB.showErr(msg, "Enter your house no / street.");
      rs.disabled = true;
      const ins = await DB.sb.from("area_requests").insert({
        customer_id: me.id,
        village_name: vn,
        pincode: pc,
        label: document.getElementById("rlabel").value.trim() || "Home",
        landmark: document.getElementById("rland").value.trim(),
        address_text: tx,
      });
      rs.disabled = false;
      if (ins.error) return DB.showErr(msg, ins.error.message);
      if (DB.toast) DB.toast("Request sent — the shop will review it soon.");
      mode = "profile"; reqPrefill = "";
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
    wrap.querySelectorAll("[data-def]").forEach(r => (r.onchange = async () => {
      var u1 = await DB.sb.from("addresses").update({ is_default: false }).eq("customer_id", me.id).eq("is_default", true);
      if (u1.error) return DB.showErr(msg, u1.error.message);
      var u2 = await DB.sb.from("addresses").update({ is_default: true }).eq("id", r.dataset.def);
      if (u2.error) return DB.showErr(msg, u2.error.message);
      if (DB.toast) DB.toast("Delivery address selected");
      render();
    }));
  }

  render();
})();
