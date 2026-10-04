// Customer notifications: live-only, nothing stored.
// Events arrive via realtime; the bell shows what came in this session and
// clears it once seen. (Migration 020 drops the old notifications table.)
(function () {
  "use strict";
  var uid = null, channel = null, open = false, live = [];

  function esc(s) { return DB.esc(s == null ? "" : String(s)); }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function orderMsg(st) {
    switch (st) {
      case "confirmed": return ["Your order is confirmed", "The shop is getting it ready."];
      case "preparing": return ["Your order is being packed", null];
      case "awaiting_rx": return ["Prescription needed", "Please upload your prescription."];
      case "out_for_delivery": return ["Your medicines are on the way", null];
      case "delivered": return ["Order delivered — thank you!", null];
      case "cancelled": return ["Your order was cancelled", null];
      default: return null;
    }
  }

  function push(title, body, link) {
    live.unshift({ title: title, body: body, link: link, at: Date.now() });
    if (live.length > 20) live.length = 20;
    var dot = document.querySelector("#bellBtn .dot-badge");
    if (dot) dot.hidden = false;
    DB.toast(title);
    var d = document.getElementById("notifDrop");
    if (open && d && !d.hidden) renderList(d);
  }

  function onOrder(p) {
    var o = p.new || {}, old = p.old || {};
    if (!o.status || o.status === old.status) return;
    var m = orderMsg(o.status);
    if (m) push(m[0], m[1] || ("Order " + String(o.id).slice(0, 8)), "orders");
  }
  function onAreaReq(p) {
    var q = p.new || {}, old = p.old || {};
    if (!q.status || q.status === old.status) return;
    if (q.status === "approved")
      push("We now deliver to " + q.village_name, "Your address was added — you can order now.", "account");
    else if (q.status === "rejected")
      push("Cannot deliver to " + q.village_name + " yet", q.note || "The shop will review this area again later.", "account");
  }
  function onRx(p) {
    var r = p.new || {}, old = p.old || {};
    if (!r.status || r.status === old.status) return;
    if (r.status === "approved")
      push("Prescription approved", "You can now order these medicines.", "rxupload");
    else if (r.status === "rejected")
      push("Prescription was not approved", "Please upload a clearer photo.", "rxupload");
  }

  function renderList(d) {
    d.innerHTML = '<div class="notif-head"><span>Notifications</span></div>' +
      (live.length ? live.map(function (n) {
        return '<button class="notif-item unread" data-nlink="' + esc(n.link || "") + '"><div><b>' + esc(n.title) + "</b>" +
          (n.body ? "<small>" + esc(n.body) + "</small>" : "") +
          "<small>" + timeAgo(n.at) + "</small></div></button>";
      }).join("") : '<div class="empty">No new notifications.</div>');
  }

  function toggle() {
    var d = document.getElementById("notifDrop");
    if (!d) {
      d = document.createElement("div");
      d.id = "notifDrop"; d.className = "notif-drop"; d.hidden = true;
      document.body.appendChild(d);
      d.addEventListener("click", function (e) {
        var b = e.target.closest("[data-nlink]"); if (!b) return;
        d.hidden = true; open = false;
        if (b.dataset.nlink) location.href = b.dataset.nlink + ".html";
      });
    }
    if (!d.hidden) { d.hidden = true; open = false; return; }
    open = true;
    renderList(d);
    live = []; // seen — clear it
    var dot = document.querySelector("#bellBtn .dot-badge");
    if (dot) dot.hidden = true;
    var bell = document.getElementById("bellBtn"), r = bell.getBoundingClientRect();
    d.style.top = (r.bottom + 8) + "px";
    d.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    d.hidden = false;
  }

  function subscribe() {
    if (channel || !uid) return;
    channel = DB.sb.channel("cust-live-" + uid)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: "customer_id=eq." + uid }, onOrder)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "area_requests", filter: "customer_id=eq." + uid }, onAreaReq)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "prescriptions", filter: "customer_id=eq." + uid }, onRx)
      .subscribe();
  }

  async function init() {
    var btn = document.getElementById("bellBtn");
    if (!btn || !window.DB || !DB.sb) return;
    var dot0 = btn.querySelector(".dot-badge");
    if (dot0) dot0.hidden = true;
    try {
      var u = await DB.sb.auth.getUser();
      uid = u.data && u.data.user ? u.data.user.id : null;
    } catch (e) { uid = null; }
    if (!uid) { btn.style.display = "none"; return; } // signed out: no bell
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener("click", function (e) {
      var d = document.getElementById("notifDrop");
      if (open && d && !d.hidden && !d.contains(e.target)) { d.hidden = true; open = false; }
    });
    subscribe();
  }

  window.Notify = { init: init };
})();
