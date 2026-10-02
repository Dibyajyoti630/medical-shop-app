// Order history for the signed-in customer.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const LBL = { awaiting_rx: "Awaiting prescription approval", placed: "Placed", confirmed: "Confirmed",
    preparing: "Preparing", assigned: "Assigned", picked_up: "Picked up",
    out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };

  async function render() {
    const chk = await Auth.requireRole("customer").catch(() => ({ ok: false, reason: "signin" }));
    if (!chk.ok) return Auth.gate(list, render);
    watchOrders(chk.profile.id);
    try {
      const { data, error } = await DB.sb.from("orders").select(
        "id,status,total,created_at,delivery_slot,notes,prescription_id,order_items(qty,unit_price,medicines(name,strength))"
      ).eq("customer_id", chk.profile.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      if (!data.length) {
        list.innerHTML = '<div class="card"><p>No orders yet. <a href="index.html">Browse medicines →</a></p></div>';
        return;
      }
      list.innerHTML = data.map((o) =>
        '<div class="card"><div class="row" style="justify-content:space-between">' +
        "<b>#" + o.id.slice(0, 8) + "</b>" +
        '<span class="status ' + o.status + '">' + (LBL[o.status] || o.status.replace(/_/g, " ")) + "</span></div>" +
        '<p class="muted">' + new Date(o.created_at).toLocaleString() + " · " + esc(o.delivery_slot || "") + "</p>" +
        (o.prescription_id && !o.order_items.length ? '<p><b>Prescription order</b></p>' : "") +
        (o.notes ? '<p class="muted">' + esc(o.notes) + "</p>" : "") +
        o.order_items.map((i) =>
          "<div class='row' style='justify-content:space-between'><span>" + esc(i.medicines.name) +
          " × " + i.qty + "</span><span>" + DB.money(i.unit_price * i.qty) + "</span></div>"
        ).join("") +
        '<div class="row" style="justify-content:space-between;margin-top:6px"><b>Total</b><b class="price">' +
        DB.money(o.total) + "</b></div></div>"
      ).join("");
    } catch (e) { DB.showErr(msg, e.message); }
  }

  // Order status flips live (e.g. chemist approves → Confirmed) without refresh.
  let watchOn = false;
  function watchOrders(uid) {
    if (watchOn) return; watchOn = true;
    DB.sb.channel("cust-orders-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "customer_id=eq." + uid },
        () => render())
      .subscribe();
  }

  render();
})();
