// Rider app: assigned deliveries, advance status along the route.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const esc = DB.esc;
  const NEXT = { assigned: "picked_up", picked_up: "out_for_delivery", out_for_delivery: "delivered" };
  const LABEL = { assigned: "Mark picked up", picked_up: "Mark out for delivery", out_for_delivery: "Mark delivered" };

  async function render() {
    const chk = await Auth.requireRole("rider").catch(() => ({ ok: false, reason: "signin" }));
    if (chk.reason === "signin") return Auth.gate(list, render);
    if (!chk.ok) { list.innerHTML = '<div class="card">This account is not a rider.</div>'; return; }
    document.getElementById("riderName").textContent = chk.profile.name || "";
    try {
      const { data, error } = await DB.sb.from("orders").select(
        "*,order_items(qty,unit_price,medicines(name))," +
        "customer:profiles!orders_customer_id_fkey(name,phone)," +
        "addresses(address_text,landmark)"
      ).eq("rider_id", chk.profile.id)
        .in("status", ["assigned", "picked_up", "out_for_delivery"])
        .order("created_at");
      if (error) throw error;
      list.innerHTML = data.length ? data.map(card).join("") :
        '<div class="card"><p class="muted">No deliveries assigned. All caught up. 🎉</p></div>';
      list.querySelectorAll("[data-next]").forEach((b) => (b.onclick = async () => {
        const { error: e2 } = await DB.sb.from("orders")
          .update({ status: b.dataset.next }).eq("id", b.dataset.id);
        if (e2) return DB.showErr(msg, e2.message);
        render();
      }));
    } catch (e) { DB.showErr(msg, e.message); }
  }

  function card(o) {
    return '<div class="card"><div class="row" style="justify-content:space-between">' +
      "<b>#" + o.id.slice(0, 8) + "</b>" +
      '<span class="status ' + o.status + '">' + o.status.replace(/_/g, " ") + "</span></div>" +
      '<p style="margin-top:6px"><b>' + esc((o.customer && o.customer.name) || "Customer") + "</b>" +
      (o.customer && o.customer.phone ? ' · <a href="tel:' + esc(o.customer.phone) + '">' + esc(o.customer.phone) + "</a>" : "") + "</p>" +
      (o.addresses ? "<p>📍 " + esc(o.addresses.address_text) +
        (o.addresses.landmark ? " (" + esc(o.addresses.landmark) + ")" : "") + "</p>" : "") +
      '<div style="margin-top:8px">' + o.order_items.map((i) =>
        "<div class='row' style='justify-content:space-between'><span>" + esc(i.medicines.name) +
        " × " + i.qty + "</span></div>").join("") + "</div>" +
      '<div class="row" style="justify-content:space-between;margin-top:8px"><span>Collect (' +
      o.payment_method.toUpperCase() + ')</span><b class="price">' + DB.money(o.total) + "</b></div>" +
      '<button class="btn" style="margin-top:10px" data-id="' + o.id + '" data-next="' + NEXT[o.status] + '">' +
      LABEL[o.status] + "</button></div>";
  }

  render();
})();
