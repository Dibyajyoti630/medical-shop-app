// Cart state in localStorage. Shared by customer.js and checkout.js.
(function () {
  "use strict";
  const KEY = "ms_cart";
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  function count() { return Object.values(get()).reduce((a, b) => a + b, 0); }
  function setQty(id, qty, stock) {
    const c = get();
    const n = Math.max(0, Math.min(qty, stock == null ? 99 : stock));
    if (n <= 0) delete c[id]; else c[id] = n;
    save(c);
    return n;
  }
  function clear() { localStorage.removeItem(KEY); }
  async function detailed() {
    const c = get();
    const ids = Object.keys(c);
    if (!ids.length) return [];
    const { data, error } = await DB.sb.from("medicines").select("*").in("id", ids);
    if (error) throw error;
    return data.map((m) => Object.assign({}, m, { qty: c[m.id] || 0 })).filter((m) => m.qty > 0);
  }
  window.Cart = { get, count, setQty, clear, detailed };
})();
