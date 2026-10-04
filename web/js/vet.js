// Veterinary page: search + product grid + add-to-cart, locked to the "Veterinary" category.
// Card/stepper markup mirrors customer.js so the shop feels like one store.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const qEl = document.getElementById("q"), moreBtn = document.getElementById("more");
  const esc = DB.esc, toast = DB.toast;
  const seen = new Map(), pend = new Map();
  let q = "", page = 0;

  function price(n) {
    const p = Number(n || 0);
    return "₹" + (Number.isInteger(p) ? p : p.toFixed(2));
  }
  function actHTML(m) {
    if (m.stock <= 0) return '<span class="muted">Out of stock</span>';
    const n = pend.get(m.id) || 1;
    return '<div class="stepper"><button data-a="-1" data-id="' + m.id + '" aria-label="Decrease quantity">−</button>' +
      '<span class="sqty">' + n + "</span>" +
      '<button data-a="1" data-id="' + m.id + '" aria-label="Increase quantity">+</button></div>' +
      '<button class="addbtn" data-add="' + m.id + '">Add ' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>';
  }
  function cardHTML(m) {
    seen.set(m.id, m);
    if (!pend.has(m.id)) pend.set(m.id, 1);
    return '<article class="pcard">' +
      '<div class="pimg"><img src="' + esc(DB.medImage(m)) + '" alt="" loading="lazy"></div>' +
      '<div class="pname">' + esc(m.name) + (m.strength ? " " + esc(m.strength) : "") + "</div>" +
      (m.pack_size ? '<div class="ppack">' + esc(m.pack_size) + "</div>" : "") +
      '<div class="prow"><span class="pprice">' + price(m.price) + "</span>" +
      (m.rx_required ? '<span class="rx-badge">Rx</span>' : "") + "</div>" +
      '<div class="pact" id="act-' + m.id + '">' + actHTML(m) + "</div></article>";
  }
  function paintAct(id) {
    const m = seen.get(id), el = document.getElementById("act-" + id);
    if (m && el) el.innerHTML = actHTML(m);
    if (window.Nav) Nav.badge();
  }

  list.addEventListener("click", (e) => {
    const step = e.target.closest("[data-a]");
    const add = e.target.closest("[data-add]");
    if (step) {
      const m = seen.get(step.dataset.id);
      const n = Math.min(m.stock, Math.max(1, (pend.get(m.id) || 1) + Number(step.dataset.a)));
      pend.set(m.id, n);
      paintAct(m.id);
    } else if (add) {
      const m = seen.get(add.dataset.add);
      Cart.setQty(m.id, (Cart.get()[m.id] || 0) + (pend.get(m.id) || 1), m.stock);
      pend.set(m.id, 1);
      paintAct(m.id);
      toast("Added to cart");
    }
  });

  async function load() {
    try {
      const { data, error } = await DB.medicines({ q, category: "Veterinary", page });
      if (error) throw error;
      moreBtn.style.display = data.length < DB.PAGE ? "none" : "";
      if (!data.length && !page) {
        list.innerHTML = '<div class="card"><p class="muted">No veterinary medicines yet — the shop is adding them. Check back soon.</p></div>';
        return;
      }
      list.insertAdjacentHTML("beforeend", data.map(cardHTML).join(""));
      page++;
    } catch (e) { DB.showErr(msg, e.message); }
  }
  function reset() { page = 0; list.innerHTML = ""; seen.clear(); pend.clear(); load(); }

  let t;
  qEl.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { q = qEl.value; reset(); }, 300);
  });
  moreBtn.addEventListener("click", load);
  if (window.Notify) Notify.init();
  document.getElementById("locBtn").addEventListener("click", () => toast("Delivering in Uttarpada, Jaleswar"));

  load();
})();
