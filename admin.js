// admin.js — logic-only hooks using existing DOM and app.js events

(function adminInit() {
  if (document.body.dataset.page !== 'admin') return;

  // Sync paging buttons to AdminPaging (from app.js)
  const nextBtn = document.getElementById('pageNext');
  const prevBtn = document.getElementById('pagePrev');
  nextBtn && nextBtn.addEventListener('click', () => { try { AdminPaging.next(); } catch {} });
  prevBtn && prevBtn.addEventListener('click', () => { try { AdminPaging.prev(); } catch {} });

  // Batch actions already wired in app.js via #approveSelected and #denySelected.
  // We just ensure forms with data-guard dispatch guard:done after async ops (fallback).
  document.addEventListener('click', (e) => {
    const id = (e.target && e.target.id) || '';
    if (id === 'approveSelected' || id === 'denySelected') {
      setTimeout(() => document.dispatchEvent(new Event('guard:done')), 2000);
    }
  });

  // Export CSV handled in app.js via #exportCsv; here we only ensure filters trigger re-export readiness
  const filterEls = ['filterStart', 'filterEnd', 'filterStatus'].map(id => document.getElementById(id)).filter(Boolean);
  filterEls.forEach(el => el.addEventListener('change', () => {
    document.dispatchEvent(new CustomEvent('admin:filter:changed'));
  }));

  // Render hookups: listen to events, pass data to existing rendering code if any
  document.addEventListener('admin:paging:data', (e) => {
    // e.detail.docs -> Firestore DocumentSnapshots
    // Leave actual rendering to existing scripts/templates.
    // If needed, you can dispatch a simplified payload:
    const docs = (e.detail && e.detail.docs) || [];
    const items = docs.map(d => ({ id: d.id, ...d.data() }));
    document.dispatchEvent(new CustomEvent('admin:paging:items', { detail: { items } }));
  });

  // Ensure badge rebadge on leave updates (already handled in app.js)
})();