// Customer home: search, form chips, promo carousel, product grid, add-to-cart.
(function () {
  "use strict";
  const list = document.getElementById("list"), msg = document.getElementById("msg");
  const catsEl = document.getElementById("cats"), qEl = document.getElementById("q");
  const moreBtn = document.getElementById("more");
  const esc = DB.esc;
  const seen = new Map(), pend = new Map();
  let q = "", form = "", page = 0;

  const FORM_ICON = { Tablet: "💊", Capsule: "💊", Syrup: "🧴", Injection: "💉", Drops: "💧", Ointment: "🩹", Cream: "🧴", Gel: "🩹", Inhaler: "🌬️", Sachet: "✉️", Powder: "🤍", Spray: "💨", Lotion: "🧴", Solution: "🧪" };
  const plural = (f) => f === "Drops" ? "Drops" : f + "s";

  function toast(t) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1800);
  }
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
      const { data, error } = await DB.medicines({ q, form, page });
      if (error) throw error;
      moreBtn.style.display = data.length < DB.PAGE ? "none" : "";
      list.insertAdjacentHTML("beforeend", data.map(cardHTML).join(""));
      page++;
    } catch (e) { DB.showErr(msg, e.message); }
  }
  function reset() { page = 0; list.innerHTML = ""; seen.clear(); pend.clear(); load(); }

  async function loadForms() {
    try {
      const forms = await DB.forms();
      catsEl.innerHTML = '<button class="chip active" data-f=""><span class="e">✨</span>All</button>' +
        forms.map((f) => '<button class="chip" data-f="' + esc(f) + '"><span class="e">' +
          (FORM_ICON[f] || "💊") + "</span>" + esc(plural(f)) + "</button>").join("");
    } catch (e) { DB.showErr(msg, e.message); }
  }
  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    catsEl.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    form = b.dataset.f; reset();
  });
  let t;
  qEl.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { q = qEl.value; reset(); }, 300);
  });
  moreBtn.addEventListener("click", load);
  document.getElementById("seeAll").addEventListener("click", () => {
    q = ""; form = ""; qEl.value = "";
    catsEl.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", !x.dataset.f));
    reset();
    list.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Promo carousel
  const slides = document.getElementById("slides"), sdots = document.getElementById("sdots");
  const sn = slides.children.length;
  let cur = 0;
  sdots.innerHTML = Array.from({ length: sn }, (_, i) =>
    '<button class="sdot' + (i ? "" : " on") + '" data-i="' + i + '" aria-label="Offer ' + (i + 1) + '"></button>').join("");
  function go(i) {
    cur = (i + sn) % sn;
    slides.style.transform = "translateX(-" + cur * 100 + "%)";
    sdots.querySelectorAll(".sdot").forEach((d, j) => d.classList.toggle("on", j === cur));
  }
  sdots.addEventListener("click", (e) => {
    const d = e.target.closest("[data-i]");
    if (d) go(Number(d.dataset.i));
  });
  setInterval(() => go(cur + 1), 4500);

  // Voice search (Chrome/Android); hidden where unsupported
  const micBtn = document.getElementById("micBtn");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) micBtn.style.display = "none";
  else micBtn.addEventListener("click", () => {
    try {
      const r = new SR();
      r.lang = "en-IN";
      r.onresult = (e) => { qEl.value = e.results[0][0].transcript; q = qEl.value; reset(); };
      r.start();
      toast("Listening…");
    } catch (e) { toast("Voice search unavailable"); }
  });

  document.getElementById("bellBtn").addEventListener("click", () => toast("No new notifications"));
  document.getElementById("locBtn").addEventListener("click", () => toast("Delivering in Uttarpada, Jaleswar"));

  loadForms();
  load();
})();
