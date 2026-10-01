// Order history for the signed-in customer.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const esc = DB.esc;

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(list, render);
    try {
      const { data, error } = await DB.sb.from("orders").select(
        "id,status,total,created_at,delivery_slot,order_items(qty,unit_price,medicines(name,strength))"
      ).eq("customer_id", chk.profile.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      if (!data.length) {
        list.innerHTML = '<div class="card"><p>No orders yet. <a href="index.html">Browse medicines →</a></p></div>';
        return;
      }
      list.innerHTML = data.map((o) =>
        '<div class="card"><div class="row" style="justify-content:space-between">' +
        "<b>#" + o.id.slice(0, 8) + "</b>" +
        '<span class="status ' + o.status + '">' + o.status.replace(/_/g, " ") + "</span></div>" +
        '<p class="muted">' + new Date(o.created_at).toLocaleString() + " · " + esc(o.delivery_slot || "") + "</p>" +
        o.order_items.map((i) =>
          "<div class='row' style='justify-content:space-between'><span>" + esc(i.medicines.name) +
          " × " + i.qty + "</span><span>" + DB.money(i.unit_price * i.qty) + "</span></div>"
        ).join("") +
        '<div class="row" style="justify-content:space-between;margin-top:6px"><b>Total</b><b class="price">' +
        DB.money(o.total) + "</b></div></div>"
      ).join("");
    } catch (e) { DB.showErr(msg, e.message); }
  }
  render();
})();
