// Customer home: search, category chips, paginated grid, add-to-cart steppers.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const catsEl = document.getElementById("cats"), qEl = document.getElementById("q");
  const moreBtn = document.getElementById("more"), cartCount = document.getElementById("cartCount");
  const esc = DB.esc;
  const seen = new Map();
  let q = "", category = "", page = 0;

  function badge() {
    const n = Cart.count();
    cartCount.textContent = n ? "🛒 " + n : "";
  }
  function actHTML(m) {
    const n = Cart.get()[m.id] || 0;
    if (m.stock <= 0) return '<span class="muted">Out of stock</span>';
    if (!n) return '<button class="btn small" data-add="' + m.id + '">Add</button>';
    return '<div class="qty"><button data-a="-1" data-id="' + m.id + '" aria-label="Decrease quantity">−</button>' +
      "<b>" + n + "</b>" +
      '<button data-a="1" data-id="' + m.id + '" aria-label="Increase quantity">+</button></div>';
  }
  function cardHTML(m) {
    seen.set(m.id, m);
    return '<div class="card"><div class="med">' +
      '<img src="' + esc(DB.medImage(m)) + '" alt="" loading="lazy">' +
      '<div class="info"><div class="name">' + esc(m.name) + "</div>" +
      '<div class="muted">' + esc(m.brand) + " · " + esc(m.strength) + "</div>" +
      '<div class="row" style="margin-top:4px"><span class="price">' + DB.money(m.price) + "</span>" +
      (m.rx_required ? '<span class="rx-badge">Rx</span>' : "") + "</div></div>" +
      '<div id="act-' + m.id + '">' + actHTML(m) + "</div></div></div>";
  }
  function paintAct(id) {
    const el = document.getElementById("act-" + id);
    if (el && seen.has(id)) el.innerHTML = actHTML(seen.get(id));
    badge();
  }

  list.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    const step = e.target.closest("[data-a]");
    if (add) {
      const m = seen.get(add.dataset.add);
      Cart.setQty(m.id, (Cart.get()[m.id] || 0) + 1, m.stock);
      paintAct(m.id);
    } else if (step) {
      const m = seen.get(step.dataset.id);
      Cart.setQty(m.id, (Cart.get()[m.id] || 0) + Number(step.dataset.a), m.stock);
      paintAct(m.id);
    }
  });

  async function load() {
    try {
      const { data, error } = await DB.medicines({ q, category, page });
      if (error) throw error;
      moreBtn.style.display = data.length < DB.PAGE ? "none" : "";
      list.insertAdjacentHTML("beforeend", data.map(cardHTML).join(""));
      page++;
      badge();
    } catch (e) { DB.showErr(msg, e.message); }
  }
  async function loadCats() {
    try {
      const cats = await DB.categories();
      catsEl.innerHTML = '<button class="chip active" data-c="">All</button>' +
        cats.map((c) => '<button class="chip" data-c="' + esc(c) + '">' + esc(c) + "</button>").join("");
    } catch (e) { DB.showErr(msg, e.message); }
  }
  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    catsEl.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    category = b.dataset.c; page = 0; list.innerHTML = ""; seen.clear(); load();
  });
  let t;
  qEl.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { q = qEl.value; page = 0; list.innerHTML = ""; seen.clear(); load(); }, 300);
  });
  moreBtn.addEventListener("click", load);

  loadCats();
  load();
})();
