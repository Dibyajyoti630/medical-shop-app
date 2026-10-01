// Shared customer bottom nav: Home, Upload Rx, Cart, Orders, Profile.
(function () {
  "use strict";
  const el = document.getElementById("bnav");
  if (!el) return;
  const page = (location.pathname.split("/").pop() || "index.html").split("#")[0];
  const tabs = [
    { href: "index.html", label: "Home", on: page === "index.html",
      svg: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h5v-6h2v6h5V9.5"/>' },
    { href: "account.html#rxupload", label: "Upload Rx", on: false,
      svg: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a3 3 0 016 0M9.5 12h5M9.5 15.5h3"/>' },
    { href: "cart.html", label: "Cart", on: page === "cart.html", badge: true,
      svg: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11h10.4l2-8H7"/>' },
    { href: "orders.html", label: "Orders", on: page === "orders.html",
      svg: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>' },
    { href: "account.html", label: "Profile", on: page === "account.html",
      svg: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5"/>' },
  ];
  function badge() {
    const b = el.querySelector("[data-badge]");
    if (!b || !window.Cart) return;
    const n = Cart.count();
    b.innerHTML = n ? '<span class="n">' + n + "</span>" : "";
  }
  el.innerHTML = tabs.map((t) =>
    '<a href="' + t.href + '"' + (t.on ? ' class="active" aria-current="page"' : "") + ">" +
    '<span class="bnav-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    t.svg + "</svg>" + (t.badge ? '<span data-badge></span>' : "") + "</span>" + t.label + "</a>"
  ).join("");
  badge();
  window.Nav = { badge };
})();
