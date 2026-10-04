// Customer notification center: bell badge, dropdown, live updates.
// Backed by the notifications table (migration 018) — triggers fill it on
// order status changes, area-request decisions and prescription decisions.
(function () {
  "use strict";
  var uid = null, channel = null, open = false;

  function esc(s) { return DB.esc(s == null ? "" : String(s)); }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  async function refreshBadge() {
    var dot = document.querySelector("#bellBtn .dot-badge");
    if (!dot || !uid) return;
    var n = 0;
    try {
      var r = await DB.sb.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("is_read", false);
      n = r.count || 0;
    } catch (e) { n = 0; /* table may not exist yet — stay quiet */ }
    dot.hidden = n === 0;
  }

  function itemHTML(n) {
    return '<button class="notif-item' + (n.is_read ? "" : " unread") + '" data-nid="' + n.id +
      '" data-nlink="' + esc(n.link || "") + '"><div><b>' + esc(n.title) + "</b>" +
      (n.body ? "<small>" + esc(n.body) + "</small>" : "") +
      "<small>" + timeAgo(n.created_at) + "</small></div></button>";
  }

  async function loadList(d) {
    try {
      var q = await DB.sb.from("notifications").select("*").eq("user_id", uid)
        .order("created_at", { ascending: false }).limit(20);
      if (q.error) throw q.error;
      var rows = q.data || [];
      d.innerHTML = '<div class="notif-head"><span>Notifications</span>' +
        (rows.some(function (x) { return !x.is_read; }) ? '<button id="notifReadAll">Mark all read</button>' : "") +
        "</div>" + (rows.length ? rows.map(itemHTML).join("") : '<div class="empty">No notifications yet.</div>');
      var ra = document.getElementById("notifReadAll");
      if (ra) ra.onclick = async function (e) {
        e.stopPropagation();
        await DB.sb.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
        d.hidden = true; open = false; refreshBadge();
      };
    } catch (err) {
      d.innerHTML = '<div class="notif-head"><span>Notifications</span></div><div class="empty">Could not load.</div>';
    }
  }

  function toggle() {
    var d = document.getElementById("notifDrop");
    if (!d) {
      d = document.createElement("div");
      d.id = "notifDrop"; d.className = "notif-drop"; d.hidden = true;
      document.body.appendChild(d);
      d.addEventListener("click", async function (e) {
        var b = e.target.closest("[data-nid]"); if (!b) return;
        d.hidden = true; open = false;
        DB.sb.from("notifications").update({ is_read: true }).eq("id", b.dataset.nid).then(refreshBadge);
        if (b.dataset.nlink) location.href = b.dataset.nlink + ".html";
      });
    }
    if (!d.hidden) { d.hidden = true; open = false; return; }
    open = true;
    d.innerHTML = '<div class="notif-head"><span>Notifications</span></div><div class="empty">Loading…</div>';
    var bell = document.getElementById("bellBtn"), r = bell.getBoundingClientRect();
    d.style.top = (r.bottom + 8) + "px";
    d.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    d.hidden = false;
    loadList(d);
  }

  function subscribe() {
    if (channel || !uid) return;
    channel = DB.sb.channel("cust-notif-" + uid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid },
        function (p) {
          refreshBadge();
          if (p.new) DB.toast(p.new.title);
          var d = document.getElementById("notifDrop");
          if (open && d && !d.hidden) loadList(d);
        })
      .subscribe();
  }

  async function init() {
    var btn = document.getElementById("bellBtn");
    if (!btn || !window.DB || !DB.sb) return;
    var dot0 = btn.querySelector(".dot-badge");
    if (dot0) dot0.hidden = true; // never show the dot until we know there's something unread
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
    refreshBadge();
    subscribe();
  }

  window.Notify = { init: init, refresh: refreshBadge };
})();
