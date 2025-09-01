// employee.js — logic-only hooks using existing DOM and app.js events

(function employeeInit() {
  if (document.body.dataset.page !== 'employee') return;

  // Guard leave form (already in app.js). Here we wire minor helpers only.
  const form = document.getElementById('leaveForm');
  form && form.addEventListener('submit', () => {
    // Ensure guard:done in case upstream listeners expect it
    setTimeout(() => document.dispatchEvent(new Event('guard:done')), 2000);
  });

  // Notification read: ensure button triggers event already wired in app.js
  const notifBtn = document.getElementById('notifBtn');
  notifBtn && notifBtn.addEventListener('click', () => {
    const u = auth && auth.currentUser;
    if (!u) return;
    // Broadcast to harmonize other modules
    document.dispatchEvent(new CustomEvent('notif:panel:opened', { detail: { uid: u.uid } }));
  });

  // Realtime leaves rendering bridge
  document.addEventListener('employee:leaves', (e) => {
    const items = (e.detail && e.detail.items) || [];
    // Bridge to filtered stream if search active
    document.dispatchEvent(new CustomEvent('employee:leaves:items', { detail: { items } }));
  });

  // Announcement list bridge
  document.addEventListener('ann:list', (e) => {
    const items = (e.detail && e.detail.items) || [];
    document.dispatchEvent(new CustomEvent('ann:list:items', { detail: { items } }));
  });

  // Mark announcement read on open — assume UI will dispatch announcement:open with {id}
  document.addEventListener('announcement:open', (e) => {
    // Handled in app.js (Ann.markReadFor). No duplicate logic here.
  });
})();