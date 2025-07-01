/* public/js/api.js
   -----------------------------------------------
   Helper genérico para hacer peticiones fetch
*/
export const api = (url, opts = {}) =>
  fetch(url, opts).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
