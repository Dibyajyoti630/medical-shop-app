// Customer account: profile (name + phone), addresses, sign out.
(function () {
  "use strict";
  const wrap = document.getElementById("wrap"), msg = document.getElementById("msg");
  const esc = DB.esc;

  function validPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
  }

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(wrap, render);
    const me = chk.profile;

    let addrs = [];
    try {
      const { data, error } = await DB.sb.from("addresses").select("*")
        .eq("customer_id", me.id).order("created_at");
      if (error) throw error;
      addrs = data;
    } catch (e) { return DB.showErr(msg, e.message); }

    wrap.innerHTML =
      '<div class="card">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:12px">' +
          '<b>Account</b>' +
          '<button class="btn secondary small" id="so">Sign out</button>' +
        '</div>' +
        '<label for="pname">Name</label>' +
        '<input id="pname" placeholder="Your name" value="' + esc(me.name || "") + '">' +
        '<label for="pphone">Phone <span class="muted" style="font-weight:400;font-size:12px">(10 digits, starts 6–9)</span></label>' +
        '<input id="pphone" type="tel" placeholder="9876543210" value="' + esc(me.phone || "") + '">' +
        '<div id="pmsg" style="margin-top:4px"></div>' +
        '<button class="btn" id="psave" style="margin-top:10px">Save profile</button>' +
      '</div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Addresses</h2><div id="alist">' +
      (addrs.map(a =>
        '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf1ef"><div><b>' +
        esc(a.label) + "</b><br><span class='muted'>" + esc(a.address_text) +
        (a.landmark ? " (" + esc(a.landmark) + ")" : "") + "</span></div>" +
        '<button class="btn secondary small" data-del="' + a.id + '">Delete</button></div>'
      ).join("") || '<p class="muted">No addresses saved.</p>') + "</div>" +
      '<div class="row" style="margin-top:8px"><input id="nlabel" placeholder="Label (Home)" style="flex:1" aria-label="Label">' +
      '<input id="nland" placeholder="Landmark" style="flex:2" aria-label="Landmark"></div>' +
      '<textarea id="ntext" rows="2" placeholder="Full address" style="margin-top:8px" aria-label="Full address"></textarea>' +
      '<button class="btn" id="add" style="margin-top:8px">Save address</button></div>';

    document.getElementById("so").onclick = async () => { await Auth.signOut(); render(); };

    document.getElementById("psave").onclick = async () => {
      const pmsg = document.getElementById("pmsg");
      pmsg.innerHTML = "";
      const rawPhone = document.getElementById("pphone").value.trim();
      const phone = validPhone(rawPhone);
      if (!phone) {
        DB.showErr(pmsg, "Phone must be exactly 10 digits and start with 6, 7, 8, or 9.");
        return;
      }
      const name = document.getElementById("pname").value.trim();
      const { error } = await DB.sb.from("profiles").update({ name, phone }).eq("id", me.id);
      if (error) return DB.showErr(pmsg, error.message);
      DB.toast("Profile saved");
      render();
    };

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

    wrap.querySelectorAll("[data-del]").forEach(b => (b.onclick = async () => {
      const { error } = await DB.sb.from("addresses").delete().eq("id", b.dataset.del);
      if (error) return DB.showErr(msg, error.message);
      render();
    }));
  }

  render();
})();
