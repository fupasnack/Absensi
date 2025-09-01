/* Presensi FUPA — Single global script
   Fitur utama: PWA init, SW update banner, animasi latar hemat baterai,
   Firebase Auth+Firestore, guard role+routing, rate limit login,
   sinkron waktu server (offsetMs), evaluasi jendela presensi,
   kamera+lokasi on-demand, liveness ringan, Cloudinary unsigned upload
   (kompres, hapus EXIF), idempoten presensi (transaksi),
   notifikasi, cuti, pengumuman, admin CRUD (hapus aman, koreksi audit),
   offline queue (IndexedDB), CSV export, analytics event minimal. */

(() => {
  'use strict';

  // -----------------------------
  // Konstanta & Konfigurasi
  // -----------------------------
  const ADMIN_WHITELIST = new Set([
    'odO8ZtMgTKeao0SDuy9L3gUmkx02',
    'ujHnWTnftGh6scTI8cQyN8fhmOB2',
  ]);

  const DEFAULT_EMP_UIDS = new Set([
    'HD4EsoL2ykgwQeBl6RP1WfrcCKw1',
    'FD69ceLyhqedlBfhbLb2I0TljY03',
    'h5aw8ppJSgP9PQM0Oc2HtugUAH02',
  ]);

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyA-xV3iuv-KAE_-xhiXZSPCTn54EgYUD40',
    authDomain: 'presensi-online-f0964.firebaseapp.com',
    projectId: 'presensi-online-f0964',
    storageBucket: 'presensi-online-f0964.firebasestorage.app',
    messagingSenderId: '895308244103',
    appId: '1:895308244103:web:ab240a8be762a44f49c422',
    measurementId: 'G-E9C7760C2S',
  };

  const CLOUDINARY = {
    cloud: 'dn2o2vf04',
    preset: 'presensiunsigned',
    uploadUrl: 'https://api.cloudinary.com/v1_1/dn2o2vf04/auto/upload',
  };

  const FLAGS_DEFAULT = { offlineQueue: true, geoFence: true, liveness: true };

  const ROLE_CACHE_VERSION = '1';
  const APP_VERSION = window.APP_VERSION || '1.0.0';

  const COLORS = {
    green: '#16a34a',
    yellow: '#eab308',
    red: '#ef4444',
  };

  // -----------------------------
  // Util DOM & UI
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

  const toastEl = $('#toast');
  function showToast(msg, ms = 3000) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  const overlayEl = $('#overlay');
  function overlay(onoff) {
    if (!overlayEl) return;
    overlayEl.classList.toggle('hidden', !onoff);
  }

  // SW update banner
  const swBanner = $('#sw-update');
  const reloadBtn = $('#reloadBtn');
  on(reloadBtn, 'click', () => window.location.reload());

  // -----------------------------
  // PWA: register service worker
  // -----------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('service-worker.js', { scope: './' });
        // Listen update
        if (reg.waiting) swBanner?.classList.remove('hidden');
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              swBanner?.classList.remove('hidden');
            }
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // New SW took control
        });
      } catch (e) {
        // Silent
      }
    });
  }

  // -----------------------------
  // Background animasi hemat baterai
  // -----------------------------
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function animatedBackground() {
    if (prefersReduced) return; // hormati prefers-reduced-motion
    const canvas = document.getElementById('bg-light');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w, h, raf, t = 0;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // efek “cahaya bernafas” + partikel daun translusen sangat pelan
    const particles = Array.from({ length: 18 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 20 + Math.random() * 60,
      a: 0.04 + Math.random() * 0.06,
      vx: -0.05 + Math.random() * 0.1,
      vy: -0.02 + Math.random() * 0.04,
      o: 0.06 + Math.random() * 0.08,
    }));

    function loop() {
      t += 0.005;
      ctx.clearRect(0, 0, w, h);

      // cahaya bernafas
      const cx = w * (0.5 + 0.05 * Math.sin(t));
      const cy = h * (0.4 + 0.06 * Math.cos(t * 0.8));
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.6);
      grd.addColorStop(0, 'rgba(147,197,253,0.22)');
      grd.addColorStop(1, 'rgba(147,197,253,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // partikel daun
      ctx.fillStyle = 'rgba(96,165,250,0.10)';
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -100) p.x = w + 80;
        if (p.x > w + 100) p.x = -80;
        if (p.y < -100) p.y = h + 80;
        if (p.y > h + 100) p.y = -80;

        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, Math.sin(t + p.a) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });

      // kilat mikro (sangat jarang)
      if (Math.random() < 1 / (60 * 75)) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    });
  })();

  // -----------------------------
  // Firebase init
  // -----------------------------
  // Hosted SDKs
  const fbScripts = [
    'https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.3/firebase-analytics-compat.js',
  ];
  let firebaseApp, auth, db, analytics;

  async function loadScripts(urls) {
    for (const u of urls) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = u; s.defer = true; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
  }

  function logEvent(name, params = {}) {
    try { analytics && firebase.analytics().logEvent(name, params); } catch {}
  }

  (async function initFirebase() {
    await loadScripts(fbScripts);
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    analytics = firebase.analytics ? firebase.analytics() : null;

    // Firestore settings (timestamps)
    db.settings({ ignoreUndefinedProperties: true });

    initApp();
  })();

  // -----------------------------
  // IndexedDB untuk offset dan queue
  // -----------------------------
  let idb;
  async function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('fupa-presensi', 3);
      req.onupgradeneeded = (e) => {
        const dbx = req.result;
        if (!dbx.objectStoreNames.contains('offset')) dbx.createObjectStore('offset');
        if (!dbx.objectStoreNames.contains('queue')) {
          const qs = dbx.createObjectStore('queue', { keyPath: 'id' });
          qs.createIndex('byNext', 'nextTryAt');
        }
        if (!dbx.objectStoreNames.contains('meta')) dbx.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbTx(store, mode = 'readonly') {
    const tx = idb.transaction(store, mode);
    return { tx, st: tx.objectStore(store) };
  }

  // -----------------------------
  // Waktu server: offset
  // -----------------------------
  let offsetMs = 0;
  async function refreshOffset() {
    // tulis doc ping dan baca serverTimestamp
    const pingRef = db.collection('_ping').doc('offset');
    const start = Date.now();
    await pingRef.set({ t: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await pingRef.get({ source: 'server' });
    const srv = snap.get('t');
    if (srv && srv.toMillis) {
      // offset = server - clientNow
      const roundTrip = Date.now() - start;
      const approxServerNow = srv.toMillis() + Math.floor(roundTrip / 2);
      offsetMs = approxServerNow - Date.now();
      await idbPut('offset', 'offsetMs', { value: offsetMs, at: Date.now(), v: APP_VERSION });
    }
  }
  async function idbPut(store, key, val) {
    const { tx, st } = idbTx(store, 'readwrite');
    st.put(val, key);
    return new Promise((res, rej) => {
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(store, key) {
    const { tx, st } = idbTx(store, 'readonly');
    const req = st.get(key);
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  }

  function nowServer() { return Date.now() + offsetMs; }

  // -----------------------------
  // Evaluasi jendela presensi
  // -----------------------------
  // Windows default (akan dioverride oleh settings/presensi)
  let presensiConfig = {
    requiredByWeekdayDefault: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 0: false },
    overridesByDate: {}, // { ymd: { required: boolean } }
    windows: {
      in: { start: '04:30', end: '05:30' },
      out: { start: '10:00', end: '11:00' },
      grace: 30, // menit
    },
    allowedRadius: null,
    officeLatLng: null,
    retentionDays: 90,
  };

  function parseHM(hm) {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
    // returns minutes of day
  }
  function ymdFromTs(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function weekday(ts) { return new Date(ts).getDay(); }

  function evaluateWindow(ts, type) {
    // returns { windowState, statusColor, nextChangeAt }
    const wm = presensiConfig.windows;
    const graceMin = wm.grace;
    const minutes = new Date(ts).getHours() * 60 + new Date(ts).getMinutes();

    const start = parseHM(wm[type].start);
    const end = parseHM(wm[type].end);
    const graceEnd = end + graceMin;

    let windowState = 'closed';
    let statusColor = 'red';
    let nextChangeAt = null;

    if (minutes < start) {
      windowState = 'closed';
      statusColor = 'red';
      nextChangeAt = atMinutes(ts, start);
    } else if (minutes >= start && minutes <= end) {
      windowState = 'open';
      statusColor = 'green';
      nextChangeAt = atMinutes(ts, end + 1);
    } else if (minutes > end && minutes <= graceEnd) {
      windowState = 'grace';
      statusColor = 'yellow';
      nextChangeAt = atMinutes(ts, graceEnd + 1);
    } else {
      windowState = 'closed';
      statusColor = 'red';
      nextChangeAt = tomorrowStart(ts);
    }
    return { windowState, statusColor, nextChangeAt };
  }
  function atMinutes(ts, minutesOfDay) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(minutesOfDay, 0, 0);
    return d.getTime();
  }
  function tomorrowStart(ts) {
    const d = new Date(ts);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  function isRequiredToday(ts) {
    const ymd = ymdFromTs(ts);
    if (presensiConfig.overridesByDate[ymd] != null) {
      return !!presensiConfig.overridesByDate[ymd].required;
    }
    return !!presensiConfig.requiredByWeekdayDefault[weekday(ts)];
  }

  // -----------------------------
  // Role guard & routing
  // -----------------------------
  function roleCacheKey(uid) { return `role:${ROLE_CACHE_VERSION}:${uid}`; }
  async function getRole(uid) {
    const cached = sessionStorage.getItem(roleCacheKey(uid));
    if (cached) return cached;
    const doc = await db.collection('roles').doc(uid).get();
    const role = doc.exists ? doc.data().role : 'karyawan';
    sessionStorage.setItem(roleCacheKey(uid), role);
    return role;
  }
  function resetRoleCache(uid) {
    sessionStorage.removeItem(roleCacheKey(uid));
  }

  function redirect(href) { window.location.replace(href); }

  async function guardRoute(user) {
    const page = document.body.getAttribute('data-page');
    if (!user) {
      if (page !== 'login') redirect('index.html');
      return;
    }
    const role = await getRole(user.uid);
    const isAdmin = ADMIN_WHITELIST.has(user.uid) && role === 'admin';

    if (page === 'login') {
      // sudah login: arahkan ke halaman sesuai
      redirect(isAdmin ? 'admin.html' : 'karyawan.html');
      return;
    }
    if (page === 'employee') {
      if (isAdmin) { /* admin boleh melihat? requirement: role salah -> redirect */
        redirect('admin.html');
        return;
      }
    }
    if (page === 'admin') {
      if (!isAdmin) {
        // selain whitelist admin => paksa keluar
        await auth.signOut();
        redirect('index.html');
        return;
      }
    }
  }

  // -----------------------------
  // Rate limit login
  // -----------------------------
  const RL_KEY = 'rl:login';
  function getIpHash() {
    // tanpa panggil jaringan, approximasi device/IP key via UA+platform+screen
    const s = [navigator.userAgent, navigator.platform, screen.width, screen.height].join('|');
    let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
    return `h${h}`;
  }
  function loadRate() {
    try {
      const obj = JSON.parse(localStorage.getItem(RL_KEY) || '{}');
      return obj[getIpHash()] || { tries: [], lockUntil: 0, backoffIndex: 0 };
    } catch { return { tries: [], lockUntil: 0, backoffIndex: 0 }; }
  }
  function saveRate(state) {
    const all = JSON.parse(localStorage.getItem(RL_KEY) || '{}');
    all[getIpHash()] = state;
    localStorage.setItem(RL_KEY, JSON.stringify(all));
  }
  function canLogin() {
    const s = loadRate();
    const now = Date.now();
    s.tries = s.tries.filter(t => now - t < 15 * 60 * 1000);
    const locked = now < s.lockUntil;
    saveRate(s);
    return !locked && s.tries.length < 5;
  }
  function recordLoginFail() {
    const s = loadRate();
    const now = Date.now();
    s.tries.push(now);
    const idx = Math.min(s.backoffIndex, 2);
    const backoffs = [30e3, 60e3, 120e3];
    if (s.tries.length >= 5) {
      s.lockUntil = now + backoffs[idx];
      s.backoffIndex = Math.min(s.backoffIndex + 1, 2);
    }
    saveRate(s);
  }
  function recordLoginSuccess() {
    const s = { tries: [], lockUntil: 0, backoffIndex: 0 };
    const all = JSON.parse(localStorage.getItem(RL_KEY) || '{}');
    all[getIpHash()] = s;
    localStorage.setItem(RL_KEY, JSON.stringify(all));
  }

  // -----------------------------
  // Kamera & Foto utils
  // -----------------------------
  let mediaStream = null;
  async function startCamera(previewEl) {
    if (mediaStream) return;
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    previewEl.srcObject = mediaStream;
    await previewEl.play();
  }
  function stopCamera(previewEl) {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (previewEl) previewEl.srcObject = null;
  }

  async function takePhoto(previewEl, targetW = 720) {
    const track = mediaStream?.getVideoTracks?.()[0];
    if (!track) throw new Error('error.camera');
    const cap = new ImageCapture(track);
    let bmp = await cap.grabFrame().catch(async () => {
      // fallback draw current frame from <video>
      const c = document.createElement('canvas');
      c.width = previewEl.videoWidth;
      c.height = previewEl.videoHeight;
      c.getContext('2d').drawImage(previewEl, 0, 0);
      return createImageBitmap(c);
    });
    // liveness ringan: ambil 2 frame cepat
    const bmp2 = await cap.grabFrame().catch(async () => {
      const c = document.createElement('canvas');
      c.width = previewEl.videoWidth;
      c.height = previewEl.videoHeight;
      c.getContext('2d').drawImage(previewEl, 0, 0);
      return createImageBitmap(c);
    });
    const delta = pixelDelta(bmp, bmp2, 1000);
    if (flags.liveness && delta < 0.002) {
      throw new Error('error.validation.liveness');
    }
    // kompres dan bersihkan EXIF: gambar -> canvas -> blob (strip metadata)
    const cnv = document.createElement('canvas');
    const scale = targetW / bmp.width;
    cnv.width = targetW;
    cnv.height = Math.round(bmp.height * scale);
    cnv.getContext('2d').drawImage(bmp, 0, 0, cnv.width, cnv.height);
    const blob = await new Promise(res => cnv.toBlob(res, 'image/jpeg', 0.82));
    return blob;
  }
  function pixelDelta(b1, b2, sample = 1500) {
    const w = Math.min(b1.width, b2.width);
    const h = Math.min(b1.height, b2.height);
    const cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');
    ctx.drawImage(b1, 0, 0, w, h);
    const d1 = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(b2, 0, 0, w, h);
    const d2 = ctx.getImageData(0, 0, w, h).data;
    let diff = 0;
    const total = Math.min(sample, w * h);
    for (let i = 0; i < total; i++) {
      const idx = (Math.random() * (w * h) | 0) * 4;
      const da = Math.abs(d1[idx] - d2[idx]) + Math.abs(d1[idx+1] - d2[idx+1]) + Math.abs(d1[idx+2] - d2[idx+2]);
      diff += da / 765;
    }
    return diff / total; // 0..1
  }

  async function compressFileBlob(file, targetKB = 160, maxW = 720) {
    const img = await blobToImage(file);
    const ratio = Math.min(1, maxW / img.width);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h;
    cnv.getContext('2d').drawImage(img, 0, 0, w, h);
    let q = 0.82, out;
    for (let i = 0; i < 5; i++) {
      out = await new Promise(res => cnv.toBlob(res, 'image/jpeg', q));
      if ((out.size / 1024) <= targetKB) break;
      q -= 0.1;
    }
    return out;
  }
  function blobToImage(blob) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(blob);
    });
  }

  // -----------------------------
  // Geolokasi
  // -----------------------------
  async function getLocationWithRetry(max = 3) {
    const delays = [1000, 2000, 4000];
    for (let i = 0; i < max; i++) {
      try {
        const pos = await new Promise((res, rej) => {
          const ctl = new AbortController();
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          });
          setTimeout(() => ctl.abort(), 9000);
        });
        const { latitude, longitude, accuracy } = pos.coords;
        return { lat: latitude, lng: longitude, accuracy };
      } catch (e) {
        if (i === max - 1) throw e;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  }

  // -----------------------------
  // Cloudinary upload
  // -----------------------------
  async function uploadToCloudinary(blob) {
    const form = new FormData();
    form.append('file', blob);
    form.append('upload_preset', CLOUDINARY.preset);
    form.append('folder', 'presensi');
    // strip EXIF by re-encoding already done; Cloudinary will also strip if needed

    const resp = await fetch(CLOUDINARY.uploadUrl, { method: 'POST', body: form });
    if (!resp.ok) throw new Error('error.serviceunavailable');
    const data = await resp.json();
    return {
      url: data.secure_url,
      deleteToken: data.delete_token,
      publicId: data.public_id,
    };
  }

  // -----------------------------
  // Offline queue
  // -----------------------------
  let flags = { ...FLAGS_DEFAULT };
  async function queueAdd(task) {
    if (!flags.offlineQueue) throw new Error('queue disabled');
    const id = `${task.kind}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    task.id = id; task.attempts = 0; task.nextTryAt = Date.now();
    const { tx, st } = idbTx('queue', 'readwrite'); st.put(task);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function queueListDue() {
    const { tx, st } = idbTx('queue', 'readonly');
    const ix = st.index('byNext');
    const req = ix.getAll(IDBKeyRange.upperBound(Date.now()));
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); });
  }
  async function queueDelete(id) {
    const { tx, st } = idbTx('queue', 'readwrite'); st.delete(id);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function queueBackoff(task) {
    task.attempts++;
    const wait = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, task.attempts));
    task.nextTryAt = Date.now() + wait;
    const { tx, st } = idbTx('queue', 'readwrite'); st.put(task);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function queueWorker() {
    if (!navigator.onLine) return;
    const due = await queueListDue();
    for (const t of due) {
      try {
        if (t.kind === 'presenceData') {
          await saveAttendanceOnline(t.payload);
          await queueDelete(t.id);
        } else if (t.kind === 'presencePhoto')) {
          // foto dulu, lalu data
          const up = await uploadToCloudinary(t.payload.blob);
          // simpan hasil ke payload (tanpa menghapus dari queue data)
          t.payload.photo = up; // {url, deleteToken, publicId}
          // Ganti task menjadi presenceData, jangan unggah foto ulang nanti
          await queueDelete(t.id);
          await queueAdd({ kind: 'presenceData', payload: t.payload });
        } else if (t.kind === 'leaveRequest') {
          await createLeaveOnline(t.payload);
          await queueDelete(t.id);
        } else if (t.kind === 'announcement') {
          await createAnnouncementOnline(t.payload);
          await queueDelete(t.id);
        } else {
          await queueDelete(t.id); // tidak dikenal, buang
        }
      } catch (e) {
        if (t.kind === 'presencePhoto') {
          logEvent('photouploadretrycount', { attempts: (t.attempts || 0) + 1 });
        }
        await queueBackoff(t);
      }
    }
  }
  setInterval(queueWorker, 4000);
  window.addEventListener('online', queueWorker);

  // -----------------------------
  // Firestore helpers
  // -----------------------------
  function userDoc(uid) { return db.collection('users').doc(uid); }
  function roleDoc(uid) { return db.collection('roles').doc(uid); }
  function attKey(uid, ymd, type) { return `${uid}_${ymd}_${type}`; }
  function attendanceDoc(uid, ymd, type) { return db.collection('attendance').doc(attKey(uid, ymd, type)); }
  function leavesCol() { return db.collection('leaves'); }
  function announcementsCol() { return db.collection('announcements'); }
  function auditCol() { return db.collection('audit'); }
  function settingsDoc() { return db.collection('settings').doc('presensi'); }
  function flagsDoc() { return db.collection('settings').doc('flags'); }

  async function loadSettings() {
    const s = await settingsDoc().get();
    if (s.exists) {
      const d = s.data();
      presensiConfig = { ...presensiConfig, ...d };
    }
    const f = await flagsDoc().get();
    if (f.exists) flags = { ...flags, ...f.data() };
  }

  async function saveAttendanceOnline(payload) {
    // payload: { uid, nameLower, type, tsClient, lat, lng, photo{url,deleteToken,publicId}, statusColorComputed? }
    const tsNow = nowServer();
    const ymd = ymdFromTs(tsNow);
    const docRef = attendanceDoc(payload.uid, ymd, payload.type);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) throw new Error('error.validation.duplicate');
      const evalRes = evaluateWindow(tsNow, payload.type); // {windowState,statusColor,nextChangeAt}
      const data = {
        uid: payload.uid,
        nameLower: payload.nameLower || '',
        ymd,
        type: payload.type,
        tsServer: firebase.firestore.Timestamp.fromMillis(tsNow),
        status: evalRes.statusColor,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        photo: payload.photo || null,
        year: Number(ymd.slice(0,4)),
        month: Number(ymd.slice(5,7)),
        week: weekOfYear(tsNow),
        dayOfWeek: weekday(tsNow),
      };
      tx.set(docRef, data);
    });
  }

  function weekOfYear(ts) {
    const d = new Date(ts);
    d.setHours(0,0,0,0);
    // Thursday in current week decides the year
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(),0,4);
    return 1 + Math.round(((d.getTime() - week1.getTime())/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  }

  async function createLeaveOnline(payload) {
    const ref = leavesCol().doc();
    await db.runTransaction(async (tx) => {
      tx.set(ref, {
        uid: payload.uid,
        type: payload.type,
        fromYmd: payload.fromYmd,
        toYmd: payload.toYmd,
        reason: payload.reason || '',
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        unread: { admin: true, user: false },
      });
    });
  }

  async function createAnnouncementOnline(payload) {
    const ref = announcementsCol().doc();
    await db.runTransaction(async (tx) => {
      tx.set(ref, {
        message: payload.message,
        effectiveDate: payload.effectiveDate ? firebase.firestore.Timestamp.fromDate(new Date(payload.effectiveDate)) : null,
        createdBy: payload.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        unreadFor: payload.unreadFor || [], // array uid
      });
    });
    logEvent('announcementcreate', {});
  }

  async function deleteCloudinaryByToken(token) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloud}/delete_by_token`;
    const form = new FormData();
    form.append('token', token);
    const r = await fetch(url, { method: 'POST', body: form });
    if (!r.ok) throw new Error('error.serviceunavailable');
    return r.json();
  }

  async function adminDeleteAttendance(docId, photo) {
    // reauth for sensitive action
    await ensureReauth();
    // hapus foto dulu
    if (photo?.deleteToken) {
      await deleteCloudinaryByToken(photo.deleteToken);
    }
    // lalu hapus dokumen
    await db.runTransaction(async tx => {
      const ref = db.collection('attendance').doc(docId);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      tx.delete(ref);
    });
    // audit
    const user = auth.currentUser;
    await auditCol().add({
      actorUid: user?.uid || null,
      action: 'attendance.delete',
      target: docId,
      details: { withPhoto: !!photo },
      at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // -----------------------------
  // Reauth (aksi admin sensitif)
  // -----------------------------
  async function ensureReauth() {
    const user = auth.currentUser;
    if (!user) throw new Error('error.permission');
    const last = Number(sessionStorage.getItem('reauthAt') || 0);
    if (Date.now() - last < 10 * 60 * 1000) return; // 10 menit
    const email = prompt('Reautentikasi: masukkan email Anda');
    const pass = prompt('Reautentikasi: masukkan kata sandi');
    if (!email || !pass) throw new Error('error.validation');
    const cred = firebase.auth.EmailAuthProvider.credential(email.trim(), pass);
    await user.reauthenticateWithCredential(cred);
    sessionStorage.setItem('reauthAt', String(Date.now()));
  }

  // -----------------------------
  // Auth state + per-page init
  // -----------------------------
  async function initApp() {
    idb = await idbOpen();

    // load cached offset if same app version
    const off = await idbGet('offset', 'offsetMs');
    if (off && off.v === APP_VERSION) offsetMs = off.value || 0;

    await loadSettings();
    await refreshOffset();
    setInterval(refreshOffset, 10 * 60 * 1000);
    window.addEventListener('focus', () => { refreshOffset().catch(()=>{}); });

    auth.onAuthStateChanged(async (user) => {
      await guardRoute(user);
      if (!user) {
        initLoginPage();
      } else {
        const role = await getRole(user.uid);
        if (document.body.dataset.page === 'employee') {
          initEmployeePage(user, role);
        } else if (document.body.dataset.page === 'admin') {
          initAdminPage(user, role);
        }
      }
    });

    // server time ticker
    const timeEl = document.getElementById('serverTime');
    if (timeEl) {
      setInterval(() => {
        const d = new Date(nowServer());
        timeEl.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      }, 500);
    }
  }

  // -----------------------------
  // Login page
  // -----------------------------
  function initLoginPage() {
    if (document.body.dataset.page !== 'login') return;
    const form = document.getElementById('loginForm');
    const email = document.getElementById('email');
    const pass = document.getElementById('password');
    const toggle = document.getElementById('togglePassword');
    const btn = document.getElementById('btnLogin');
    const forgot = document.getElementById('forgotBtn');
    const captchaWrap = document.getElementById('captchaWrap');
    const captchaQ = document.getElementById('captchaQuestion');
    const captchaAns = document.getElementById('captchaAnswer');

    let fails = Number(sessionStorage.getItem('loginFails') || 0);
    let captcha = null;

    function updateBtn() {
      btn.disabled = !(email.value && pass.value && canLogin() && (!captcha || (captcha && captchaAns.value.trim() === String(captcha.answer))));
    }
    email.addEventListener('input', updateBtn);
    pass.addEventListener('input', updateBtn);
    on(toggle, 'click', () => {
      pass.type = pass.type === 'password' ? 'text' : 'password';
      toggle.querySelector('.material-symbols-rounded').textContent = pass.type === 'password' ? 'visibility' : 'visibility_off';
    });

    function genCaptcha() {
      const a = 10 + Math.floor(Math.random() * 40);
      const b = 1 + Math.floor(Math.random() * 9);
      captcha = { q: `Berapa ${a} + ${b}?`, answer: a + b };
      captchaQ.textContent = `Verifikasi: ${captcha.q}`;
      captchaWrap.classList.remove('hidden');
    }
    if (fails >= 3) genCaptcha();

    on(forgot, 'click', async () => {
      const mail = email.value.trim();
      if (!mail) return showToast('Masukkan email untuk reset sandi.');
      try {
        overlay(true);
        await auth.sendPasswordResetEmail(mail);
        showToast('Email reset telah dikirim.');
      } catch {
        showToast('Gagal mengirim reset sandi.');
      } finally { overlay(false); }
    });

    on(form, 'submit', async (e) => {
      e.preventDefault();
      if (!canLogin()) {
        showToast('Terlalu banyak percobaan. Coba lagi nanti.');
        return;
      }
      if (fails >= 3 && (!captcha || captchaAns.value.trim() !== String(captcha.answer))) {
        showToast('Verifikasi tidak valid.');
        return;
      }
      btn.disabled = true; overlay(true);
      try {
        const userCred = await auth.signInWithEmailAndPassword(email.value.trim(), pass.value);
        sessionStorage.setItem('loginFails', '0');
        recordLoginSuccess();
        logEvent('loginsuccess', {});
        // route by role handled by guardRoute in onAuthStateChanged
      } catch (err) {
        fails += 1; sessionStorage.setItem('loginFails', String(fails));
        recordLoginFail();
        logEvent('loginfail', {});
        if (fails === 3) genCaptcha();
        showToast('Tidak dapat masuk. Periksa kredensial Anda.');
      } finally {
        overlay(false); updateBtn();
      }
    });

    updateBtn();
  }

  // -----------------------------
  // Employee page
  // -----------------------------
  function initEmployeePage(user, role) {
    if (document.body.dataset.page !== 'employee') return;

    const profileBtn = document.getElementById('profileBtn');
    const profileDialog = document.getElementById('profileDialog');
    const profileForm = document.getElementById('profileForm');
    const profilePhotoInput = document.getElementById('profilePhotoInput');
    const profilePhoto = document.getElementById('profilePhoto');
    const displayName = document.getElementById('displayName');
    const address = document.getElementById('address');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const fabLeave = document.getElementById('fabLeave');
    const leaveDialog = document.getElementById('leaveDialog');
    const leaveType = document.getElementById('leaveType');
    const fromDate = document.getElementById('fromDate');
    const toDate = document.getElementById('toDate');
    const leaveReason = document.getElementById('leaveReason');
    const sendLeaveBtn = document.getElementById('sendLeaveBtn');

    const btnGetLocation = document.getElementById('btnGetLocation');
    const locStatus = document.getElementById('locStatus');
    const coordText = document.getElementById('coordText');
    const miniMap = document.getElementById('miniMap');

    const cameraPreview = document.getElementById('cameraPreview');
    const btnSnap = document.getElementById('btnSnap');
    const galleryInput = document.getElementById('galleryInput');
    const photoPreview = document.getElementById('photoPreview');

    const typeIn = document.getElementById('typeIn');
    const typeOut = document.getElementById('typeOut');
    const windowLabel = document.getElementById('windowLabel');
    const nextChangeText = document.getElementById('nextChangeText');
    const requireBadge = document.getElementById('requireBadge');
    const dayLabel = document.getElementById('dayLabel');
    const btnSubmitPresence = document.getElementById('btnSubmitPresence');
    const recentList = document.getElementById('recentList');

    // Header notifications (basic)
    const notifBtn = document.getElementById('notifBtn');
    const notifBadge = document.getElementById('notifBadge');
    const notifList = document.getElementById('notifList');

    let loc = null;
    let photoBlob = null;

    // Load profile
    userDoc(user.uid).get().then(s => {
      const d = s.data() || {};
      profilePhoto.src = d.photoUrl || 'https://ui-avatars.com/api/?background=1E40AF&color=fff&name=' + encodeURIComponent(user.email[0] || 'U');
      displayName.value = d.displayName || user.email.split('@')[0];
      address.value = d.address || '';
    });

    // Server day label + required badge
    function refreshWindowUI() {
      const ts = nowServer();
      const type = typeIn.checked ? 'in' : 'out';
      const ev = evaluateWindow(ts, type);
      windowLabel.className = `chip ${ev.statusColor === 'green' ? 'green' : ev.statusColor === 'yellow' ? 'yellow' : 'red'}`;
      windowLabel.textContent = ev.windowState === 'open' ? 'Buka' : ev.windowState === 'grace' ? 'Masa terlambat' : 'Tutup';
      nextChangeText.textContent = `Perubahan status pada ${new Date(ev.nextChangeAt).toLocaleTimeString()}.`;
      const ymd = ymdFromTs(ts);
      const required = isRequiredToday(ts);
      requireBadge.textContent = required ? 'Wajib' : 'Tidak wajib';
      dayLabel.textContent = new Date(ts).toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      validateSubmit();
    }
    setInterval(refreshWindowUI, 1000);
    refreshWindowUI();

    function validateSubmit() {
      const ts = nowServer();
      const type = typeIn.checked ? 'in' : 'out';
      const ev = evaluateWindow(ts, type);
      const okWindow = ev.windowState !== 'closed';
      btnSubmitPresence.disabled = !(loc && photoBlob && okWindow);
    }

    // Lazy start camera when card in view
    const attCard = document.querySelector('.attendance-card');
    const io = new IntersectionObserver(async (entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting) {
          try { await startCamera(cameraPreview); } catch {}
        } else {
          stopCamera(cameraPreview);
        }
      }
    }, { threshold: 0.25 });
    attCard && io.observe(attCard);

    on(btnGetLocation, 'click', async () => {
      locStatus.textContent = 'Mengambil lokasi…';
      try {
        loc = await getLocationWithRetry(3);
        coordText.textContent = `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} (±${Math.round(loc.accuracy)} m)`;
        drawMiniMap(miniMap, loc.lat, loc.lng);
        locStatus.textContent = 'Lokasi siap';
      } catch {
        loc = null;
        coordText.textContent = 'Gagal mengambil lokasi. Pastikan GPS aktif, lalu coba lagi.';
        locStatus.textContent = 'Gagal';
      } finally {
        validateSubmit();
      }
    });

    function drawMiniMap(el, lat, lng) {
      const w = el.clientWidth || 300, h = el.clientHeight || 160;
      const cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h;
      const ctx = cnv.getContext('2d');
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = 'rgba(96,165,250,0.35)';
      ctx.beginPath(); ctx.arc(w/2, h/2, 28, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(37,99,235,0.9)';
      ctx.beginPath(); ctx.arc(w/2, h/2, 6, 0, Math.PI*2); ctx.fill();
      el.innerHTML = ''; el.appendChild(cnv);
    }

    on(btnSnap, 'click', async () => {
      try {
        const b = await takePhoto(cameraPreview, 720);
        photoBlob = b;
        const url = URL.createObjectURL(b);
        photoPreview.src = url; photoPreview.classList.remove('hidden');
        validateSubmit();
      } catch (e) {
        if (String(e?.message || '').includes('liveness')) {
          showToast('Deteksi liveness rendah. Silakan coba lagi.');
        } else {
          showToast('Gagal mengambil foto.');
        }
      }
    });

    on(galleryInput, 'change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const c = await compressFileBlob(f, 180, 720);
        photoBlob = c;
        photoPreview.src = URL.createObjectURL(c); photoPreview.classList.remove('hidden');
        validateSubmit();
      } catch { showToast('Gagal memproses gambar.'); }
    });

    on(typeIn, 'change', refreshWindowUI);
    on(typeOut, 'change', refreshWindowUI);

    on(btnSubmitPresence, 'click', async () => {
      const type = typeIn.checked ? 'in' : 'out';
      btnSubmitPresence.disabled = true; overlay(true);
      try {
        // dua fase: foto -> data
        const nameLower = (displayName.value || user.email.split('@')[0] || '').toLowerCase();
        const payload = {
          uid: user.uid,
          nameLower,
          type,
          tsClient: Date.now(),
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        };
        if (navigator.onLine) {
          // upload foto
          const up = await uploadToCloudinary(photoBlob);
          payload.photo = up;
          // simpan data
          await saveAttendanceOnline(payload);
        } else {
          await queueAdd({ kind: 'presencePhoto', payload: { ...payload, blob: photoBlob } });
        }
        showToast('Presensi terkirim.');
        logEvent('presencesubmit_success', { type });
        loadRecent();
      } catch (e) {
        logEvent('presencesubmit_fail', { type });
        showToast('Gagal mengirim presensi. Telah diantrikan jika offline.');
        try { await queueAdd({ kind: 'presencePhoto', payload: { uid: user.uid, nameLower: (displayName.value||'').toLowerCase(), type, tsClient: Date.now(), lat: loc?.lat ?? null, lng: loc?.lng ?? null, blob: photoBlob } }); } catch {}
      } finally {
        overlay(false); validateSubmit();
      }
    });

    // Recent 3
    async function loadRecent() {
      const qs = await db.collection('attendance')
        .where('uid','==',user.uid)
        .orderBy('tsServer','desc').limit(3).get();
      recentList.innerHTML = '';
      qs.forEach(d => {
        const a = d.data();
        const row = document.createElement('div');
        row.className = 'item';
        const date = a.tsServer?.toDate?.() || new Date();
        const st = a.status === 'green' ? 'Tepat' : a.status === 'yellow' ? 'Terlambat' : 'Alpa';
        row.innerHTML = `<div><strong>${a.type==='in'?'Berangkat':'Pulang'}</strong><div class="meta">${date.toLocaleString('id-ID')}</div></div><span class="chip ${a.status}">${st}</span>`;
        recentList.appendChild(row);
      });
    }
    loadRecent();

    // Notifications (announcements + leaves)
    async function loadNotifs() {
      let totalUnread = 0;
      notifList.innerHTML = '';
      const ann = await announcementsCol().orderBy('createdAt','desc').limit(10).get();
      ann.forEach(s => {
        const d = s.data();
        const row = document.createElement('div'); row.className = 'rowi';
        row.innerHTML = `<div><strong>Pengumuman</strong><div class="muted small">${d.message}</div></div><div class="muted small">${d.createdAt?.toDate?.().toLocaleString('id-ID')||''}</div>`;
        notifList.appendChild(row);
      });
      const lv = await leavesCol().where('uid','==',user.uid).orderBy('createdAt','desc').limit(10).get();
      lv.forEach(s => {
        const d = s.data();
        const read = !d.unread?.user;
        if (!read) totalUnread++;
        const row = document.createElement('div'); row.className = 'rowi' + (read?' read':'');
        row.innerHTML = `<div><strong>Cuti ${d.status}</strong><div class="muted small">${d.type} ${d.fromYmd} s/d ${d.toYmd}</div></div>`;
        notifList.appendChild(row);
      });
      notifBadge.classList.toggle('hidden', totalUnread === 0);
    }
    loadNotifs();
    on(document.getElementById('notifBtn'), 'click', loadNotifs);

    // Profile dialog
    on(profileBtn, 'click', () => profileDialog.showModal());
    on(saveProfileBtn, 'click', async (e) => {
      e.preventDefault();
      overlay(true);
      try {
        let photoUrl = profilePhoto.src;
        const f = profilePhotoInput.files?.[0];
        if (f) {
          const b = await compressFileBlob(f, 180, 480);
          const up = await uploadToCloudinary(b);
          photoUrl = up.url;
        }
        await userDoc(user.uid).set({
          uid: user.uid,
          displayName: displayName.value.trim(),
          address: address.value.trim(),
          photoUrl,
          role: 'karyawan',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        showToast('Profil tersimpan.');
        profileDialog.close();
      } catch { showToast('Gagal menyimpan profil.'); }
      finally { overlay(false); }
    });
    on(logoutBtn, 'click', async () => {
      if (!confirm('Keluar dari sesi?')) return;
      await auth.signOut();
    });

    // Leave dialog
    on(fabLeave, 'click', () => leaveDialog.showModal());
    on(sendLeaveBtn, 'click', async (e) => {
      e.preventDefault();
      const payload = {
        uid: user.uid,
        type: leaveType.value,
        fromYmd: fromDate.value,
        toYmd: toDate.value || fromDate.value,
        reason: leaveReason.value.trim(),
      };
      try {
        overlay(true);
        if (navigator.onLine) await createLeaveOnline(payload);
        else await queueAdd({ kind: 'leaveRequest', payload });
        showToast('Permintaan cuti dikirim.');
        leaveDialog.close();
        logEvent('leaverequest', {});
      } catch {
        showToast('Gagal mengirim cuti.');
      } finally { overlay(false); }
    });
  }

  // -----------------------------
  // Admin page
  // -----------------------------
  function initAdminPage(user, role) {
    if (document.body.dataset.page !== 'admin') return;

    const profileBtn = document.getElementById('profileBtn');
    const profileDialog = document.getElementById('profileDialog');
    const adminProfileForm = document.getElementById('adminProfileForm');
    const profilePhotoInput = document.getElementById('profilePhotoInput');
    const profilePhoto = document.getElementById('profilePhoto');
    const displayName = document.getElementById('displayName');
    const address = document.getElementById('address');
    const logoutBtn = document.getElementById('logoutBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    const newUserEmail = document.getElementById('newUserEmail');
    const newUserPass = document.getElementById('newUserPass');
    const createUserBtn = document.getElementById('createUserBtn');
    const assignUid = document.getElementById('assignUid');
    const assignLabel = document.getElementById('assignLabel');
    const assignRoleBtn = document.getElementById('assignRoleBtn');

    const adminLeaveList = document.getElementById('adminLeaveList');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const filterName = document.getElementById('filterName');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const presetRange = document.getElementById('presetRange');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const attendanceTbody = document.getElementById('attendanceTbody');
    const summaryRow = document.getElementById('summaryRow');

    const fabAnnouncement = document.getElementById('fabAnnouncement');
    const announceDialog = document.getElementById('announceDialog');
    const announceMessage = document.getElementById('announceMessage');
    const effectiveDate = document.getElementById('effectiveDate');
    const requiredByDate = document.getElementById('requiredByDate');
    const sendAnnouncementBtn = document.getElementById('sendAnnouncementBtn');

    const editAttendanceDialog = document.getElementById('editAttendanceDialog');
    const editAttendanceForm = document.getElementById('editAttendanceForm');
    const saveEditAttendanceBtn = document.getElementById('saveEditAttendanceBtn');

    // Load admin profile
    userDoc(user.uid).get().then(s => {
      const d = s.data() || {};
      profilePhoto.src = d.photoUrl || 'https://ui-avatars.com/api/?background=1E40AF&color=fff&name=' + encodeURIComponent(user.email[0] || 'A');
      displayName.value = d.displayName || user.email.split('@')[0];
      address.value = d.address || '';
    });

    on(profileBtn, 'click', () => profileDialog.showModal());
    on(saveProfileBtn, 'click', async (e) => {
      e.preventDefault();
      overlay(true);
      try {
        let photoUrl = profilePhoto.src;
        const f = profilePhotoInput.files?.[0];
        if (f) {
          const b = await compressFileBlob(f, 180, 480);
          const up = await uploadToCloudinary(b);
          photoUrl = up.url;
        }
        await userDoc(user.uid).set({
          uid: user.uid,
          displayName: displayName.value.trim(),
          address: address.value.trim(),
          photoUrl,
          role: 'admin',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        showToast('Profil admin tersimpan.');
        profileDialog.close();
      } catch { showToast('Gagal menyimpan profil.'); }
      finally { overlay(false); }
    });
    on(logoutBtn, 'click', async () => { if (confirm('Keluar dari sesi?')) await auth.signOut(); });

    // Create user (email+pass) — catatan: butuh admin SDK di server untuk produksi;
    // di client, ini menswitch sesi. Solusi: popup credential link? Untuk demo, kita tetap jalankan lalu login ulang admin.
    on(createUserBtn, 'click', async () => {
      const em = newUserEmail.value.trim(), pw = newUserPass.value;
      if (!em || !pw) { showToast('Isi email dan sandi.'); return; }
      try {
        overlay(true);
        const cur = auth.currentUser;
        const curEmail = cur[43dcd9a7-70db-4a1f-b0ae-981daa162054](https://github.com/dakechan/simple-forum/tree/897e29381d4f7572bbdac0bc837676bdf5f59c7f/main.js?citationMarker=43dcd9a7-70db-4a1f-b0ae-981daa162054 "1")
        // Simpan kredensial admin untuk kembali login
        await ensureReauth();
        const adminEmail = cur.email;
        const adminPass = prompt('Masukkan sandi admin untuk kembali ke sesi setelah pembuatan akun');
        if (!adminPass) { overlay(false); return; }

        // Buat akun baru (akan mengganti sesi menjadi user baru)
        const uc = await auth.createUserWithEmailAndPassword(em, pw);
        const newUid = uc.user.uid;

        // Siapkan dokumen awal pengguna
        await userDoc(newUid).set({
          uid: newUid,
          displayName: em.split('@')[0],
          address: '',
          photoUrl: '',
          role: 'karyawan',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Logout akun baru dan login kembali sebagai admin
        await auth.signOut();
        await auth.signInWithEmailAndPassword(adminEmail, adminPass);

        // Auto-isi UID untuk tahap 2
        assignUid.value = newUid;
        assignLabel.value = em.split('@')[0];
        showToast('Akun dibuat. UID telah diisikan untuk tahap berikutnya.');
      } catch (e) {
        showToast('Gagal membuat akun.');
      } finally {
        overlay(false);
      }
    });

    // Tetapkan role / label
    on(assignRoleBtn, 'click', async () => {
      const uid = assignUid.value.trim();
      const label = assignLabel.value.trim();
      if (!uid) { showToast('Masukkan UID.'); return; }
      try {
        overlay(true);
        await ensureReauth();
        await roleDoc(uid).set({ uid, role: 'karyawan' }, { merge: true });
        await userDoc(uid).set({
          uid,
          displayName: label || '',
          nameLower: (label || '').toLowerCase(),
          role: 'karyawan',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await auditCol().add({
          actorUid: user.uid,
          action: 'role.assign',
          target: uid,
          details: { role: 'karyawan', label },
          at: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast('Role/label ditetapkan.');
      } catch {
        showToast('Gagal menetapkan role.');
      } finally { overlay(false); }
    });

    // Pending leave list (approve/deny)
    async function loadPendingLeaves() {
      adminLeaveList.innerHTML = '';
      const qs = await leavesCol().where('status','==','pending').orderBy('createdAt','asc').limit(50).get();
      qs.forEach(doc => {
        const d = doc.data();
        const row = document.createElement('div');
        row.className = 'rowi';
        row.innerHTML = `
          <div>
            <strong>Cuti ${d.type}</strong>
            <div class="muted small">${d.fromYmd} s/d ${d.toYmd}</div>
            <div class="muted small">${d.reason || ''}</div>
          </div>
          <div class="row">
            <button class="btn small outline" data-act="deny">Tolak</button>
            <button class="btn small" data-act="approve">Setujui</button>
          </div>`;
        adminLeaveList.appendChild(row);

        const approveBtn = row.querySelector('[data-act="approve"]');
        const denyBtn = row.querySelector('[data-act="deny"]');

        approveBtn.addEventListener('click', () => decide('approved'));
        denyBtn.addEventListener('click', () => decide('denied'));

        async function decide(status) {
          try {
            overlay(true);
            await ensureReauth();
            const batch = db.batch();
            const ref = leavesCol().doc(doc.id);
            batch.update(ref, {
              status,
              decidedBy: user.uid,
              decidedAt: firebase.firestore.FieldValue.serverTimestamp(),
              unread: { admin: false, user: true },
            });
            // Notifikasi sederhana via announcements (opsional)
            const msg = status === 'approved' ? 'Permintaan cuti disetujui.' : 'Permintaan cuti ditolak.';
            const annRef = announcementsCol().doc();
            batch.set(annRef, {
              message: `[Cuti] ${msg}`,
              effectiveDate: null,
              createdBy: user.uid,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              unreadFor: [d.uid],
            });
            await batch.commit();

            await auditCol().add({
              actorUid: user.uid,
              action: 'leave.decide',
              target: doc.id,
              details: { status },
              at: firebase.firestore.FieldValue.serverTimestamp(),
            });
            row.remove();
            logEvent(status === 'approved' ? 'leaverequest_approve' : 'leaverequest_deny', {});
            showToast(`Cuti ${status}.`);
          } catch {
            showToast('Gagal memproses cuti.');
          } finally { overlay(false); }
        }
      });

      // Badge notifikasi admin (jumlah pending)
      const notifBadge = document.getElementById('notifBadge');
      notifBadge && notifBadge.classList.toggle('hidden', adminLeaveList.children.length === 0);
    }
    loadPendingLeaves();

    // Pengumuman (FAB)
    on(fabAnnouncement, 'click', () => announceDialog.showModal());
    on(sendAnnouncementBtn, 'click', async (e) => {
      e.preventDefault();
      const msg = announceMessage.value.trim();
      const eff = effectiveDate.value || null;
      const reqDate = requiredByDate.value || null;
      if (!msg) { showToast('Isi pengumuman.'); return; }
      try {
        overlay(true);
        await createAnnouncementOnline({ uid: user.uid, message: msg, effectiveDate: eff, unreadFor: [] });

        // Override wajib/tidak per tanggal bila diisi
        if (reqDate) {
          await db.runTransaction(async tx => {
            const sref = settingsDoc();
            const snap = await tx.get(sref);
            const cur = snap.exists ? (snap.data() || {}) : {};
            const overrides = cur.overridesByDate || {};
            overrides[reqDate] = { required: true };
            tx.set(sref, { overridesByDate: overrides }, { merge: true });
          });
        }
        logEvent('announcementcreate', {});
        showToast('Pengumuman terkirim.');
        announceDialog.close();
      } catch {
        showToast('Gagal mengirim pengumuman.');
      } finally { overlay(false); }
    });

    // Filter preset utility
    function applyPreset(p) {
      const d = new Date(nowServer());
      if (p === 'H') {
        const ymd = ymdFromTs(d.getTime());
        dateFrom.value = ymd;
        dateTo.value = ymd;
      } else if (p === 'M') {
        const day = d.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        const start = new Date(d); start.setDate(d.getDate() - diff);
        const end = new Date(start); end.setDate(start.getDate() + 6);
        dateFrom.value = ymdFromTs(start.getTime());
        dateTo.value = ymdFromTs(end.getTime());
      } else if (p === 'B') {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        dateFrom.value = ymdFromTs(start.getTime());
        dateTo.value = ymdFromTs(end.getTime());
      } else if (p === 'T') {
        const start = new Date(d.getFullYear(), 0, 1);
        const end = new Date(d.getFullYear(), 11, 31);
        dateFrom.value = ymdFromTs(start.getTime());
        dateTo.value = ymdFromTs(end.getTime());
      }
    }
    on(presetRange, 'change', () => applyPreset(presetRange.value));
    applyPreset(presetRange.value);

    // Load attendance with filters
    async function loadAttendance() {
      attendanceTbody.innerHTML = '';
      summaryRow.textContent = 'Ringkasan: memuat…';

      let q = db.collection('attendance').orderBy('tsServer', 'desc').limit(100);
      const f = dateFrom.value ? new Date(dateFrom.value + 'T00:00:00') : null;
      const t = dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;
      if (f) q = q.where('tsServer', '>=', firebase.firestore.Timestamp.fromDate(f));
      if (t) q = q.where('tsServer', '<=', firebase.firestore.Timestamp.fromDate(t));
      const nameFilter = (filterName.value || '').trim().toLowerCase();

      const snap = await q.get();
      let cGreen = 0, cYellow = 0, cRed = 0;
      snap.forEach(d => {
        const a = d.data();
        if (nameFilter && !(a.nameLower || '').includes(nameFilter)) return;

        if (a.status === 'green') cGreen++;
        else if (a.status === 'yellow') cYellow++;
        else cRed++;

        const tr = document.createElement('tr');
        const dt = a.tsServer?.toDate?.() || new Date();
        tr.innerHTML = `
          <td>${a.ymd}</td>
          <td>${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}</td>
          <td>${(a.nameLower || '').replace(/\b\w/g, c => c.toUpperCase())}</td>
          <td>${a.type === 'in' ? 'Berangkat' : 'Pulang'}</td>
          <td>${(a.lat!=null && a.lng!=null) ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : '-'}</td>
          <td><span class="chip ${a.status}">${a.status==='green'?'Tepat':a.status==='yellow'?'Terlambat':'Alpa'}</span></td>
          <td>${a.photo?.url ? `<a href="${a.photo.url}" target="_blank">Lihat</a>` : '-'}</td>
          <td>
            <button class="btn small outline" data-act="edit">Edit</button>
            <button class="btn small" data-act="delete">Hapus</button>
          </td>
        `;
        attendanceTbody.appendChild(tr);

        const delBtn = tr.querySelector('[data-act="delete"]');
        const editBtn = tr.querySelector('[data-act="edit"]');

        delBtn.addEventListener('click', async () => {
          if (!confirm('Hapus catatan presensi ini?')) return;
          try {
            overlay(true);
            await adminDeleteAttendance(d.id, a.photo || null);
            tr.remove();
            showToast('Catatan dihapus.');
          } catch {
            showToast('Gagal menghapus. Coba lagi.');
          } finally { overlay(false); }
        });

        editBtn.addEventListener('click', () => {
          // buka dialog dengan nilai awal
          $('#editDocId').value = d.id;
          $('#editType').value = a.type;
          $('#editStatus').value = a.status;
          const dt0 = a.tsServer?.toDate?.() || new Date();
          $('#editDate').value = ymdFromTs(dt0.getTime());
          $('#editTime').value = `${String(dt0.getHours()).padStart(2,'0')}:${String(dt0.getMinutes()).padStart(2,'0')}`;
          $('#editLat').value = a.lat ?? '';
          $('#editLng').value = a.lng ?? '';
          editAttendanceDialog.showModal();
        });
      });

      summaryRow.textContent = `Ringkasan: Tepat ${cGreen}, Terlambat ${cYellow}, Alpa ${cRed}`;
    }

    on(applyFilterBtn, 'click', loadAttendance);
    on(exportCsvBtn, 'click', exportCsv);
    // load awal
    loadAttendance();

    // Simpan koreksi presensi
    on(saveEditAttendanceBtn, 'click', async (e) => {
      e.preventDefault();
      const docId = $('#editDocId').value;
      const type = $('#editType').value;
      const status = $('#editStatus').value;
      const reason = $('#editReason').value.trim();
      const date = $('#editDate').value;
      const time = $('#editTime').value;
      const lat = $('#editLat').value ? Number($('#editLat').value) : null;
      const lng = $('#editLng').value ? Number($('#editLng').value) : null;
      if (!reason) { showToast('Alasan wajib diisi.'); return; }
      try {
        overlay(true);
        await ensureReauth();
        const ref = db.collection('attendance').doc(docId);
        const newTs = firebase.firestore.Timestamp.fromDate(new Date(`${date}T${time}:00`));
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error('notfound');
          const old = snap.data();
          tx.update(ref, { type, status, tsServer: newTs, lat, lng });
          // Notifikasi untuk karyawan
          const annRef = announcementsCol().doc();
          tx.set(annRef, {
            message: `[Koreksi] Presensi Anda telah dikoreksi (${type==='in'?'Berangkat':'Pulang'}).`,
            effectiveDate: null,
            createdBy: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            unreadFor: [old.uid],
          });
        });
        await auditCol().add({
          actorUid: user.uid,
          action: 'attendance.edit',
          target: docId,
          details: { reason, type, status, date, time, lat, lng },
          at: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast('Koreksi tersimpan.');
        editAttendanceDialog.close();
        loadAttendance();
      } catch {
        showToast('Gagal menyimpan koreksi.');
      } finally { overlay(false); }
    });

    // Ekspor CSV (paginasi)
    async function exportCsv() {
      overlay(true);
      try {
        logEvent('csvexport', {});
        const rows = [['Tanggal','Waktu','Nama','Jenis','Koordinat','Status','Foto']];
        const batchSize = 800;
        let last = null;
        const f = dateFrom.value ? new Date(dateFrom.value + 'T00:00:00') : null;
        const t = dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;

        while (true) {
          let q = db.collection('attendance').orderBy('tsServer','desc').limit(batchSize);
          if (f) q = q.where('tsServer','>=',firebase.firestore.Timestamp.fromDate(f));
          if (t) q = q.where('tsServer','<=',firebase.firestore.Timestamp.fromDate(t));
          if (last) q = q.startAfter(last);
          const snap = await q.get();
          if (snap.empty) break;
          snap.forEach(d => {
            const a = d.data();
            const dt = a.tsServer?.toDate?.() || new Date();
            const koor = (a.lat!=null && a.lng!=null) ? `${a.lat},${a.lng}` : '';
            rows.push([
              a.ymd,
              `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`,
              (a.nameLower || ''),
              a.type,
              koor,
              a.status,
              a.photo?.url || '',
            ]);
          });
          last = snap.docs[snap.docs.length - 1];
          if (snap.size < batchSize) break;
        }

        // CSV build
        const csv = rows.map(r => r.map(x => {
          const s = String(x ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
        }).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `presensi_${dateFrom.value||'all'}_${dateTo.value||'all'}.csv`;
        a.click();
      } catch {
        showToast('Gagal ekspor CSV.');
      } finally { overlay(false); }
    }
  }

  // -----------------------------
  // Notifikasi sederhana: klik ikon memuat ulang panel cuti
  // -----------------------------
  const adminNotifBtn = document.getElementById('notifBtn');
  adminNotifBtn && adminNotifBtn.addEventListener('click', () => {
    if (document.body.dataset.page === 'admin') {
      // muat ulang pending leaves
      const card = document.getElementById('adminLeaveList');
      if (card) {
        card.innerHTML = '';
        // panggil ulang loader yang ada pada scope admin init jika tersedia
        // fallback: trigger applyFilter to refresh tables as well
        const btn = document.getElementById('applyFilterBtn');
        btn && btn.click();
      }
    }
  });

})();
// -----------------------------
// Versioning: reset cache saat APP_VERSION berubah
// -----------------------------
(function handleVersioning() {
  try {
    const KEY = 'app:version';
    const prev = localStorage.getItem(KEY);
    if (prev && prev !== APP_VERSION) {
      // Reset offset cache dan role cache saat versi berganti
      (async () => {
        try {
          idb = idb || await idbOpen();
          // hapus offset
          const { tx, st } = idb.transaction('offset', 'readwrite');
          st.delete('offsetMs');
          tx.oncomplete = () => {};
        } catch {}
        // bersihkan session role cache
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith(`role:${ROLE_CACHE_VERSION}:`)) sessionStorage.removeItem(k);
        });
      })();
    }
    localStorage.setItem(KEY, APP_VERSION);
  } catch {}
})();

// -----------------------------
// Employee: tandai notifikasi terbaca saat panel dibuka
// -----------------------------
function markEmployeeNotifsRead(user) {
  // leaves: set unread.user=false
  db.collection('leaves').where('uid','==',user.uid).where('unread.user','==',true).limit(20).get()
    .then(snap => {
      const batch = db.batch();
      snap.forEach(doc => {
        batch.update(doc.ref, { unread: { admin: false, user: false } });
      });
      return batch.commit();
    }).catch(()=>{});

  // announcements: hapus uid dari unreadFor
  announcementsCol().where('unreadFor','array-contains',user.uid).limit(20).get()
    .then(snap => {
      const batch = db.batch();
      snap.forEach(doc => {
        batch.update(doc.ref, { unreadFor: firebase.firestore.FieldValue.arrayRemove(user.uid) });
      });
      return batch.commit();
    }).catch(()=>{});
}

// Hook ke employee init: klik ikon notifikasi -> tandai terbaca dan sembunyikan badge
(function wireEmployeeNotifRead() {
  if (document.body.dataset.page !== 'employee') return;
  const btn = document.getElementById('notifBtn');
  const badge = document.getElementById('notifBadge');
  if (!btn) return;
  auth && auth.onAuthStateChanged(u => {
    if (!u) return;
    btn.addEventListener('click', async () => {
      try { markEmployeeNotifsRead(u); } catch {}
      badge && badge.classList.add('hidden');
    });
  });
})();

// -----------------------------
// Admin: refresh pending badge saat klik notif
// -----------------------------
(function wireAdminNotifBadge() {
  if (document.body.dataset.page !== 'admin') return;
  const notifBtn = document.getElementById('notifBtn');
  const badge = document.getElementById('notifBadge');
  if (!notifBtn || !badge) return;

  notifBtn.addEventListener('click', async () => {
    try {
      const qs = await db.collection('leaves').where('status','==','pending').limit(1).get();
      badge.classList.toggle('hidden', qs.empty);
    } catch {}
  });
})();
// -----------------------------
// Realtime: sinkron badge notifikasi (employee & admin)
// -----------------------------
(function wireRealtimeBadges() {
  const page = document.body.dataset.page;
  const badge = document.getElementById('notifBadge');
  if (!badge) return;

  // util: set badge visible/hidden secara idempotent
  const setBadge = (show) => {
    if (show) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  };

  let unsub1 = null;
  let unsub2 = null;

  const attachEmployeeStreams = (uid) => {
    // leaves unread untuk user
    unsub1 = db.collection('leaves')
      .where('uid', '==', uid)
      .where('unread.user', '==', true)
      .limit(1)
      .onSnapshot(
        (snap) => setBadge(!snap.empty),
        () => {}
      );

    // announcements unreadFor berisi uid
    unsub2 = announcementsCol()
      .where('unreadFor', 'array-contains', uid)
      .limit(1)
      .onSnapshot(
        (snap) => {
          // jika salah satu stream ada item, tampilkan badge
          const hasUnreadAnn = !snap.empty;
          // gabungkan dengan stream leaves melalui state sederhana
          badge.dataset.hasAnn = hasUnreadAnn ? '1' : '';
          const hasUnreadLeaves = badge.dataset.hasLeave === '1';
          setBadge(hasUnreadAnn || hasUnreadLeaves);
        },
        () => {}
      );

    // mirror state dari leaves stream
    db.collection('leaves')
      .where('uid', '==', uid)
      .where('unread.user', '==', true)
      .limit(1)
      .get()
      .then(s => {
        badge.dataset.hasLeave = (!s.empty) ? '1' : '';
      }).catch(()=>{});
  };

  const attachAdminStreams = () => {
    unsub1 = db.collection('leaves')
      .where('status', '==', 'pending')
      .limit(1)
      .onSnapshot(
        (snap) => setBadge(!snap.empty),
        () => {}
      );
  };

  // auth-aware attach
  auth && auth.onAuthStateChanged(u => {
    // cleanup sebelumnya
    if (typeof unsub1 === 'function') { try { unsub1(); } catch {} }
    if (typeof unsub2 === 'function') { try { unsub2(); } catch {} }
    unsub1 = unsub2 = null;

    if (!u) { setBadge(false); return; }
    if (page === 'employee') attachEmployeeStreams(u.uid);
    if (page === 'admin') attachAdminStreams();
  });

  // cleanup saat unload
  window.addEventListener('beforeunload', () => {
    if (typeof unsub1 === 'function') { try { unsub1(); } catch {} }
    if (typeof unsub2 === 'function') { try { unsub2(); } catch {} }
  });
})();

// -----------------------------
// Role cache & route guard berbasis dataset.page
// -----------------------------
(function roleRouteGuard() {
  const page = document.body.dataset.page; // 'employee' | 'admin' | dll
  if (!page) return;

  const KEY = (uid) => `role:${ROLE_CACHE_VERSION}:${uid}`;
  const setRoleCache = (uid, role) => {
    try { sessionStorage.setItem(KEY(uid), role); } catch {}
  };
  const getRoleCache = (uid) => {
    try { return sessionStorage.getItem(KEY(uid)); } catch { return null; }
  };

  const enforce = (role) => {
    // idempotent guard: hanya cek bila page spesifik
    if (page === 'admin' && role !== 'admin') {
      // arahkan ke halaman employee tanpa mengubah desain
      try { location.replace('/employee.html'); } catch { location.href = '/employee.html'; }
      return false;
    }
    if (page === 'employee' && role !== 'employee') {
      try { location.replace('/admin.html'); } catch { location.href = '/admin.html'; }
      return false;
    }
    return true;
  };

  const fetchRole = async (uid) => {
    // asumsi koleksi 'users' memiliki field 'role' = 'admin' | 'employee'
    const doc = await db.collection('users').doc(uid).get();
    const role = doc.exists && doc.data().role ? doc.data().role : 'employee';
    setRoleCache(uid, role);
    return role;
  };

  auth && auth.onAuthStateChanged(async (u) => {
    if (!u) return;
    // cek cache dulu
    let role = getRoleCache(u.uid);
    if (!role) {
      try { role = await fetchRole(u.uid); } catch { role = 'employee'; }
    }
    enforce(role);
  });
})();

// -----------------------------
// Form submit guard: cegah double submit (idempotent)
// -----------------------------
(function preventDoubleSubmit() {
  const forms = document.querySelectorAll('form[data-guard]');
  if (!forms.length) return;

  forms.forEach(form => {
    let busy = false;
    form.addEventListener('submit', (e) => {
      if (busy) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      busy = true;
      // reset saat selesai async via custom event
      form.addEventListener('guard:done', () => { busy = false; }, { once: true });
    });

    // fallback reset jika halaman ganti
    window.addEventListener('beforeunload', () => { busy = false; });
  });
})();

// -----------------------------
// Connectivity hint: jalankan ulang sinkron saat online kembali
// -----------------------------
(function connectivityRehydrate() {
  let pending = false;
  window.addEventListener('offline', () => { pending = true; });
  window.addEventListener('online', async () => {
    if (!pending) return;
    pending = false;
    try {
      // ping read ringan untuk memicu re-auth/snapshot stabil
      await db.collection('_ping').limit(1).get();
    } catch {}
    // broadcast event agar modul lain bisa resync tanpa mengubah UI
    document.dispatchEvent(new CustomEvent('app:resync'));
  });
})();
// -----------------------------
// Clock offset: sinkron waktu server untuk keperluan stempel
// -----------------------------
(function clockOffsetSync() {
  const KEY = 'app:clockOffsetMs';
  let cached = null;

  const set = (ms) => {
    cached = ms;
    try { localStorage.setItem(KEY, String(ms)); } catch {}
    document.dispatchEvent(new CustomEvent('clock:offset', { detail: ms }));
  };

  const get = () => {
    if (cached !== null) return cached;
    try {
      const v = localStorage.getItem(KEY);
      cached = v != null ? Number(v) : 0;
      return cached;
    } catch { return 0; }
  };

  // expose util secara terbatas (tanpa global leak fatal)
  window.getClockOffsetMs = get;

  // initial read
  get();

  // sync ringan: gunakan serverTimestamp roundtrip untuk estimasi offset
  const sample = async () => {
    try {
      const ref = db.collection('_meta').doc('_offsetProbe');
      await ref.set({ t: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      const snap = await ref.get({ source: 'server' });
      const serverTs = snap.get('t');
      if (serverTs && serverTs.toMillis) {
        const now = Date.now();
        const offset = serverTs.toMillis() - now; // positif berarti jam lokal tertinggal
        set(offset);
      }
    } catch {}
  };

  // jalankan saat start dan saat diminta resync
  sample();
  document.addEventListener('app:resync', sample);
})();

// -----------------------------
// Service Worker: soft update + resync saat ada versi baru
// -----------------------------
(function swSoftUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;

    const promptRefresh = () => {
      try {
        // tanpa UI baru: refresh idempotent agar cache terbaru aktif
        location.reload();
      } catch {
        location.href = location.href;
      }
    };

    // dengarkan updatefound
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // versi baru siap—refresh halus
          promptRefresh();
        }
      });
    });

    // trigger check update ringan
    try { reg.update(); } catch {}
  }).catch(() => {});
})();

// -----------------------------
// Helper koleksi: announcements (hindari duplikasi)
// -----------------------------
function announcementsCol() {
  // Asumsi root collection 'announcements'
  return db.collection('announcements');
}

// -----------------------------
// Safe navigation: idempotent toggle kelas & dataset
// -----------------------------
const DomSafe = (() => {
  const add = (el, cls) => { if (el && cls && !el.classList.contains(cls)) el.classList.add(cls); };
  const remove = (el, cls) => { if (el && cls && el.classList.contains(cls)) el.classList.remove(cls); };
  const setData = (el, key, val) => { if (el) el.dataset[key] = val; };
  const getData = (el, key) => el ? el.dataset[key] : undefined;
  return { add, remove, setData, getData };
})();

// -----------------------------
// Admin-only: konsistensi badge setelah approve/deny
// -----------------------------
(function adminActionRebadge() {
  if (document.body.dataset.page !== 'admin') return;
  document.addEventListener('leave:updated', async () => {
    // cek ulang pending minimal
    try {
      const badge = document.getElementById('notifBadge');
      if (!badge) return;
      const qs = await db.collection('leaves').where('status','==','pending').limit(1).get();
      badge.classList.toggle('hidden', qs.empty);
    } catch {}
  });
})();

// -----------------------------
// Employee: stamp waktu berbasis offset untuk submit form
// -----------------------------
(function employeeSubmitStamp() {
  if (document.body.dataset.page !== 'employee') return;
  // cari form yang butuh stamping
  const forms = document.querySelectorAll('form[data-stamp]');
  if (!forms.length) return;

  const nowServerish = () => new Date(Date.now() + (window.getClockOffsetMs ? window.getClockOffsetMs() : 0));

  forms.forEach(form => {
    form.addEventListener('submit', () => {
      try {
        const t = nowServerish();
        const hidden = form.querySelector('input[name="clientStampedAt"]');
        if (hidden) {
          hidden.value = t.toISOString();
        } else {
          const h = document.createElement('input');
          h.type = 'hidden';
          h.name = 'clientStampedAt';
          h.value = t.toISOString();
          form.appendChild(h);
        }
      } catch {}
    });
  });

  // resync akan memperbaiki offset tanpa mengubah UI
  document.addEventListener('app:resync', () => {});
})();

// -----------------------------
// Soft guard: cegah akses langsung URL legacy
// -----------------------------
(function legacyPathRedirect() {
  // Tanpa mengubah desain: arahkan path lama ke halaman yang benar bila terdeteksi
  const path = location.pathname;
  if (path.endsWith('/admin') || path.endsWith('/admin/')) {
    try { history.replaceState(null, '', '/admin.html'); } catch { location.replace('/admin.html'); }
  }
  if (path.endsWith('/employee') || path.endsWith('/employee/')) {
    try { history.replaceState(null, '', '/employee.html'); } catch { location.replace('/employee.html'); }
  }
})();
// -----------------------------
// Defaults: fallback APP_VERSION & ROLE_CACHE_VERSION
// -----------------------------
(function ensureDefaults() {
  try {
    if (typeof window.APP_VERSION === 'undefined') window.APP_VERSION = '0.0.0';
    if (typeof window.ROLE_CACHE_VERSION === 'undefined') window.ROLE_CACHE_VERSION = '1';
  } catch {}
})();

// -----------------------------
// IndexedDB: helper ringan untuk store 'offset'
// -----------------------------
let idb; // shared handle
async function idbOpen() {
  if (idb) return idb;
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('app-local', 1);
      req.onupgradeneeded = (e) => {
        const dbx = e.target.result;
        if (!dbx.objectStoreNames.contains('offset')) {
          dbx.createObjectStore('offset');
        }
      };
      req.onsuccess = () => { idb = req.result; resolve(idb); };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

// -----------------------------
// Event bus sederhana (typed by name)
// -----------------------------
const AppBus = (() => {
  const on = (name, fn, opts) => document.addEventListener(name, fn, opts);
  const off = (name, fn, opts) => document.removeEventListener(name, fn, opts);
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  return { on, off, emit };
})();

// -----------------------------
// Visibility: pause/resume listener realtime saat tab hidden
// -----------------------------
(function visibilityThrottleRealtime() {
  // Modul yang memasang onSnapshot dapat mendengarkan event ini
  let hiddenAt = null;
  const onChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      AppBus.emit('realtime:pause');
    } else {
      const wasHiddenMs = hiddenAt ? (Date.now() - hiddenAt) : 0;
      hiddenAt = null;
      // minta resync agar snapshot kembali segar
      AppBus.emit('realtime:resume', { wasHiddenMs });
      document.dispatchEvent(new CustomEvent('app:resync'));
    }
  };
  document.addEventListener('visibilitychange', onChange);
})();

// -----------------------------
// Helper Firestore: operasi idempotent untuk leave & announcements
// -----------------------------
const Fx = (() => {
  // Tandai leave sebagai dibaca oleh user (safe merge)
  const markLeaveReadForUser = async (docRef) => {
    try {
      await docRef.set({ unread: { user: false } }, { merge: true });
    } catch {}
  };

  // Hapus uid dari unreadFor pengumuman
  const removeUnreadFor = async (docRef, uid) => {
    try {
      await docRef.update({ unreadFor: firebase.firestore.FieldValue.arrayRemove(uid) });
    } catch {}
  };

  // Approve/Deny leave dengan konsistensi minimal dan trigger event
  const setLeaveStatus = async (docRef, status, actorUid) => {
    try {
      await docRef.set({
        status,
        reviewedBy: actorUid || null,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      document.dispatchEvent(new CustomEvent('leave:updated', { detail: { id: docRef.id, status } }));
    } catch {}
  };

  return { markLeaveReadForUser, removeUnreadFor, setLeaveStatus };
})();

// -----------------------------
// Global logout: bersihkan cache & redirect aman
// -----------------------------
async function appLogout(options = {}) {
  const { redirect = '/' } = options;
  try {
    // bersihkan cache ringan
    try { localStorage.removeItem('app:clockOffsetMs'); } catch {}
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith(`role:${ROLE_CACHE_VERSION}:`)) sessionStorage.removeItem(k);
      });
    } catch {}
    // sign out
    await auth.signOut();
  } catch {}
  // redirect idempotent
  try { location.replace(redirect); } catch { location.href = redirect; }
}

// -----------------------------
// Realtime listener registry: mendukung pause/resume
// -----------------------------
const Realtime = (() => {
  const regs = new Set(); // simpan fungsi reattach
  const register = (fnReattach) => { if (typeof fnReattach === 'function') regs.add(fnReattach); return () => regs.delete(fnReattach); };
  const pauseTokens = []; // simpan unsub aktif
  const pauseAll = () => {
    // modul dapat mem-broadcast unsub mereka via event
    const ev = new CustomEvent('realtime:collect-unsub', {
      detail: { push: (unsub) => { if (typeof unsub === 'function') pauseTokens.push(unsub); } }
    });
    document.dispatchEvent(ev);
    while (pauseTokens.length) {
      const u = pauseTokens.pop();
      try { u(); } catch {}
    }
  };
  const resumeAll = () => {
    regs.forEach(fn => { try { fn(); } catch {} });
  };

  AppBus.on('realtime:pause', pauseAll);
  AppBus.on('realtime:resume', resumeAll);

  return { register };
})();

// -----------------------------
// Contoh integrasi registry untuk badge listener sebelumnya
// -----------------------------
(function integrateRealtimeRegistry() {
  // Cari hook dari modul badge (jika tersedia)
  // Kita pasang listener yang mengumpulkan unsub saat pause
  let unsubs = [];
  const collect = () => {
    document.addEventListener('realtime:collect-unsub', (e) => {
      unsubs.forEach(u => e.detail.push(u));
    }, { once: true });
  };

  // Reattach adalah no-op di sini kecuali modul badge expose factory.
  // Jika modul badge mem-publish factory ke window, gunakan.
  const factory = window.__attachBadgeStreams__;
  if (typeof factory === 'function') {
    const reattach = () => {
      // hentikan sebelumnya
      unsubs.forEach(u => { try { u(); } catch {} });
      unsubs = [];
      // attach baru
      try { unsubs = factory(); } catch { unsubs = []; }
      collect();
    };
    Realtime.register(reattach);
    // boot awal
    reattach();
  } else {
    // fallback: tetap dukung pengumpulan unsub manual jika modul lain menambahkannya
    collect();
  }
})();

// -----------------------------
// Token refresh ringan: pancing user token untuk long-lived tabs
// -----------------------------
(function gentleAuthRefresh() {
  if (!auth || !firebase || !firebase.auth) return;
  const REFRESH_MS = 25 * 60 * 1000; // ~25 menit
  let timer = null;

  const tick = async (u) => {
    if (!u) return;
    try { await u.getIdToken(true); } catch {}
  };

  const arm = (u) => {
    if (timer) clearInterval(timer);
    if (!u) return;
    timer = setInterval(() => tick(u), REFRESH_MS);
  };

  auth.onAuthStateChanged(u => {
    arm(u);
  });

  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
})();

// -----------------------------
// Safe query helpers (no throw)
// -----------------------------
const $ = (sel, root = document) => { try { return root.querySelector(sel); } catch { return null; } };
const $$ = (sel, root = document) => { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } };

// -----------------------------
// Console diagnostics minimal (tidak mengubah UI)
// -----------------------------
(function diagnostics() {
  // Peringatan skew waktu ekstrim (>= 5 menit)
  const warnSkew = () => {
    try {
      const off = (window.getClockOffsetMs ? window.getClockOffsetMs() : 0);
      if (Math.abs(off) >= 5 * 60 * 1000) {
        console.warn('[clock] Offset >= 5 menit. Pastikan jam perangkat akurat.');
      }
    } catch {}
  };
  warnSkew();
  document.addEventListener('clock:offset', warnSkew);
})();
// -----------------------------
// Debounce & throttle ringan (idempotent)
// -----------------------------
const Timing = (() => {
  const debounce = (fn, wait = 250) => {
    let t = null;
    const d = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    d.cancel = () => clearTimeout(t);
    return d;
  };
  const throttle = (fn, wait = 250) => {
    let last = 0, id = null, lastArgs = null;
    return (...args) => {
      const now = Date.now();
      const remain = wait - (now - last);
      lastArgs = args;
      if (remain <= 0) {
        last = now;
        fn(...lastArgs);
        lastArgs = null;
      } else if (!id) {
        id = setTimeout(() => {
          last = Date.now();
          fn(...(lastArgs || []));
          lastArgs = null;
          id = null;
        }, remain);
      }
    };
  };
  return { debounce, throttle };
})();

// -----------------------------
// Admin: batch approve/deny leave (idempotent, tanpa ubah UI)
// -----------------------------
(function adminBatchActions() {
  if (document.body.dataset.page !== 'admin') return;
  const btnApprove = document.getElementById('approveSelected');
  const btnDeny = document.getElementById('denySelected');
  const table = document.getElementById('leaveTable');
  if (!table) return;

  const selectedIds = () => {
    // asumsikan tiap row punya checkbox .js-row-select dengan data-id
    const boxes = table.querySelectorAll('.js-row-select:checked');
    return Array.from(boxes).map(b => b.dataset.id).filter(Boolean);
  };

  const perform = async (ids, targetStatus) => {
    if (!ids.length) return;
    const batch = db.batch();
    const actor = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    const seen = new Set();
    ids.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      const ref = db.collection('leaves').doc(id);
      batch.set(ref, {
        status: targetStatus,
        reviewedBy: actor || null,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        unread: { admin: false } // admin sudah memproses
      }, { merge: true });
    });
    try {
      await batch.commit();
      document.dispatchEvent(new CustomEvent('leave:updated', { detail: { ids, status: targetStatus } }));
    } catch {}
  };

  const onApprove = Timing.debounce(async () => { await perform(selectedIds(), 'approved'); document.dispatchEvent(new Event('guard:done')); }, 120);
  const onDeny = Timing.debounce(async () => { await perform(selectedIds(), 'denied'); document.dispatchEvent(new Event('guard:done')); }, 120);

  btnApprove && btnApprove.addEventListener('click', onApprove);
  btnDeny && btnDeny.addEventListener('click', onDeny);
})();

// -----------------------------
// Admin: pagination stateless (cursor in-memory), tanpa mengubah UI
// -----------------------------
const AdminPaging = (() => {
  const state = {
    pageSize: 20,
    stack: [], // stack of cursors (Firestore DocumentSnapshot)
    current: null,
  };

  const queryBase = () => db.collection('leaves').orderBy('createdAt', 'desc');

  const loadPage = async (direction = 'init') => {
    try {
      let q = queryBase().limit(state.pageSize + 1); // overfetch to detect next
      if (direction === 'next' && state.current) q = q.startAfter(state.current);
      if (direction === 'prev' && state.stack.length >= 2) {
        // pop current and previous to move back
        state.stack.pop();
        const prevCursor = state.stack[state.stack.length - 1] || null;
        q = prevCursor ? queryBase().startAfter(prevCursor).limit(state.pageSize + 1) : queryBase().limit(state.pageSize + 1);
      }
      const snap = await q.get();
      const docs = snap.docs.slice(0, state.pageSize);
      state.current = docs[docs.length - 1] || state.current;
      if (direction !== 'prev' && docs.length) state.stack.push(docs[docs.length - 1]);
      // broadcast data untuk modul UI yang sudah ada
      document.dispatchEvent(new CustomEvent('admin:paging:data', { detail: { docs, hasMore: snap.docs.length > state.pageSize } }));
    } catch {}
  };

  const next = () => loadPage('next');
  const prev = () => loadPage('prev');
  const init = () => loadPage('init');

  // resync akan re-init agar konsisten setelah offline/online
  document.addEventListener('app:resync', () => { init(); });

  return { init, next, prev };
})();

(function wireAdminPagingControls() {
  if (document.body.dataset.page !== 'admin') return;
  const btnNext = document.getElementById('pageNext');
  const btnPrev = document.getElementById('pagePrev');
  AdminPaging.init();
  btnNext && btnNext.addEventListener('click', () => AdminPaging.next());
  btnPrev && btnPrev.addEventListener('click', () => AdminPaging.prev());
})();

// -----------------------------
// Employee: guard form leave (logic-only, no UI changes)
// -----------------------------
(function employeeLeaveFormGuard() {
  if (document.body.dataset.page !== 'employee') return;
  const form = document.getElementById('leaveForm');
  if (!form) return;

  const getVal = (name) => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? (el.value || '').trim() : '';
    };

  form.addEventListener('submit', (e) => {
    // validasi minimal: dates & reason wajib
    const start = getVal('startDate');
    const end = getVal('endDate');
    const reason = getVal('reason');
    // Tidak ubah UI: hanya cegah submit bila fatal
    const bad = !start || !end || !reason;
    if (bad) {
      e.preventDefault();
      e.stopPropagation();
      console.warn('[leave] Form tidak lengkap. Pastikan tanggal mulai, tanggal selesai, dan alasan terisi.');
      document.dispatchEvent(new Event('guard:done'));
      return;
    }
    // stamp waktu (menggunakan offset yang sudah ada)
    try {
      const off = window.getClockOffsetMs ? window.getClockOffsetMs() : 0;
      const stamp = new Date(Date.now() + off).toISOString();
      let h = form.querySelector('input[name="clientStampedAt"]');
      if (!h) {
        h = document.createElement('input');
        h.type = 'hidden';
        h.name = 'clientStampedAt';
        form.appendChild(h);
      }
      h.value = stamp;
    } catch {}
  });
})();

// -----------------------------
// Role strict routing: harden rute saat navigasi internal
// -----------------------------
(function strictRoleRouting() {
  const page = document.body.dataset.page;
  if (!page) return;

  const KEY = (uid) => `role:${ROLE_CACHE_VERSION}:${uid}`;
  const getCachedRole = (uid) => { try { return sessionStorage.getItem(KEY(uid)); } catch { return null; } };

  const enforce = (role) => {
    if (page === 'admin' && role !== 'admin') {
      try { location.replace('/employee.html'); } catch { location.href = '/employee.html'; }
      return;
    }
    if (page === 'employee' && role !== 'employee') {
      try { location.replace('/admin.html'); } catch { location.href = '/admin.html'; }
      return;
    }
  };

  const apply = (u) => {
    if (!u) return;
    const role = getCachedRole(u.uid);
    if (role) enforce(role);
  };

  if (auth) {
    const u = auth.currentUser;
    if (u) apply(u);
    auth.onAuthStateChanged(apply);
  }
})();

// -----------------------------
// Announcement helpers: publish & mark read from UI hooks
// -----------------------------
const Ann = (() => {
  const pub = async ({ title, body, audience = 'all' }) => {
    try {
      const doc = {
        title: title || '',
        body: body || '',
        audience,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        unreadFor: audience === 'all' ? [] : [], // server side dapat menambah target secara terkontrol
      };
      await announcementsCol().add(doc);
    } catch {}
  };

  const markReadFor = async (docId, uid) => {
    try {
      await announcementsCol().doc(docId).update({
        unreadFor: firebase.firestore.FieldValue.arrayRemove(uid)
      });
    } catch {}
  };

  return { pub, markReadFor };
})();

// -----------------------------
// Hook sederhana untuk tombol publish (admin) & mark as read (employee)
// -----------------------------
(function wireAnnouncementButtons() {
  const page = document.body.dataset.page;
  if (page === 'admin') {
    const btn = document.getElementById('announcePublish');
    const titleEl = document.getElementById('announceTitle');
    const bodyEl = document.getElementById('announceBody');
    btn && btn.addEventListener('click', async () => {
      const title = titleEl ? (titleEl.value || '').trim() : '';
      const body = bodyEl ? (bodyEl.value || '').trim() : '';
      if (!title || !body) return;
      try { await Ann.pub({ title, body }); } catch {}
    });
  }
  if (page === 'employee') {
    document.addEventListener('announcement:open', async (e) => {
      const id = e.detail && e.detail.id;
      const u = auth && auth.currentUser;
      if (!id || !u) return;
      try { await Ann.markReadFor(id, u.uid); } catch {}
    });
  }
})();

// -----------------------------
// Hash sync ringan: dukung navigasi anchor tanpa mengubah UI
// -----------------------------
(function hashSync() {
  const onHashChange = () => {
    document.dispatchEvent(new CustomEvent('nav:hash', { detail: { hash: location.hash || '' } }));
  };
  window.addEventListener('hashchange', onHashChange);
  // init
  onHashChange();
})();
// -----------------------------
// Offline write queue: retry idempotent untuk operasi Firestore
// -----------------------------
const WriteQueue = (() => {
  const KEY = 'app:writeQueue:v1';
  let queue = [];

  const load = () => {
    try { queue = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { queue = []; }
  };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch {}
  };

  // job: { id, op, path, data, opts }
  // op: 'add'|'set'|'update'|'delete'
  const enqueue = (job) => {
    if (!job || !job.id) return;
    // dedup by id
    const i = queue.findIndex(j => j.id === job.id);
    if (i >= 0) queue[i] = job; else queue.push(job);
    save();
    processSoon();
  };

  const refFromPath = (path) => {
    // path: "collection/doc/collection/doc..."
    const segs = path.split('/').filter(Boolean);
    let r = db;
    for (let i = 0; i < segs.length; i++) {
      r = (i % 2 === 0) ? r.collection(segs[i]) : r.doc(segs[i]);
    }
    return r;
  };

  let ticking = false;
  const processSoon = () => {
    if (ticking) return;
    ticking = true;
    setTimeout(process, 250);
  };

  const process = async () => {
    ticking = false;
    if (!queue.length) return;
    if (!navigator.onLine) { return; }
    const next = [...queue]; // shallow copy
    for (const job of next) {
      try {
        const ref = refFromPath(job.path);
        if (job.op === 'add') {
          await ref.add(job.data);
        } else if (job.op === 'set') {
          await ref.set(job.data, job.opts || {});
        } else if (job.op === 'update') {
          await ref.update(job.data);
        } else if (job.op === 'delete') {
          await ref.delete();
        }
        // remove on success
        queue = queue.filter(j => j.id !== job.id);
        save();
      } catch {
        // stop early; wait for next online tick
        break;
      }
    }
  };

  window.addEventListener('online', () => processSoon());
  document.addEventListener('app:resync', () => processSoon());

  load();
  return { enqueue, process };
})();

// -----------------------------
// Realtime: daftar pengumuman (employee & admin, read-only)
// -----------------------------
const AnnRealtime = (() => {
  let unsub = null;

  const attach = (limitN = 20) => {
    detach();
    try {
      unsub = announcementsCol()
        .orderBy('createdAt', 'desc')
        .limit(limitN)
        .onSnapshot((snap) => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          document.dispatchEvent(new CustomEvent('ann:list', { detail: { items } }));
        }, () => {});
    } catch {}
    // izinkan registry mengumpulkan unsub
    document.addEventListener('realtime:collect-unsub', (e) => {
      if (typeof unsub === 'function') e.detail.push(unsub);
    }, { once: true });
    return () => detach();
  };

  const detach = () => {
    if (typeof unsub === 'function') { try { unsub(); } catch {} }
    unsub = null;
  };

  // resync rebuild
  document.addEventListener('app:resync', () => {
    if (!unsub) return;
    attach();
  });

  return { attach, detach };
})();

(function wireAnnouncementsForPage() {
  const page = document.body.dataset.page;
  if (!page) return;
  // pasang hanya jika konten pengumuman ada di halaman
  const container = document.getElementById('annList');
  if (!container) return;

  const detach = AnnRealtime.attach(30);
  // Hanya broadcast data; UI rendering di modul/HTML yang sudah ada
  window.addEventListener('beforeunload', () => { try { detach(); } catch {} });
})();

// -----------------------------
// Admin: Export CSV leave (range waktu & status filter via input)
// -----------------------------
const Csv = (() => {
  const toCsv = (rows) => {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  };

  const download = (name, text) => {
    try {
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch {}
  };

  return { toCsv, download };
})();

(function adminExportCsv() {
  if (document.body.dataset.page !== 'admin') return;
  const btn = document.getElementById('exportCsv');
  if (!btn) return;

  const inputStart = document.getElementById('filterStart'); // yyyy-mm-dd
  const inputEnd = document.getElementById('filterEnd');     // yyyy-mm-dd
  const inputStatus = document.getElementById('filterStatus'); // pending|approved|denied|all

  const buildQuery = () => {
    let q = db.collection('leaves').orderBy('createdAt', 'desc').limit(1000);
    const s = inputStatus ? (inputStatus.value || 'all') : 'all';
    if (s !== 'all') q = q.where('status', '==', s);
    // rentang tanggal opsional
    const start = inputStart && inputStart.value ? new Date(inputStart.value + 'T00:00:00Z') : null;
    const end = inputEnd && inputEnd.value ? new Date(inputEnd.value + 'T23:59:59Z') : null;
    if (start) q = q.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(start));
    if (end) q = q.where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(end));
    return q;
  };

  const mapDoc = (d) => {
    const x = d.data();
    const ts = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : null;
    return {
      id: d.id,
      uid: x.uid || '',
      name: x.name || '',
      status: x.status || '',
      startDate: x.startDate || '',
      endDate: x.endDate || '',
      reason: x.reason || '',
      createdAt: ts ? ts.toISOString() : '',
      reviewedBy: x.reviewedBy || '',
    };
  };

  btn.addEventListener('click', async () => {
    try {
      const snap = await buildQuery().get();
      const rows = snap.docs.map(mapDoc);
      const csv = Csv.toCsv(rows);
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      Csv.download(`leaves-${stamp}.csv`, csv);
    } catch {}
  });
})();

// -----------------------------
// Audit log ringan (logic-only, no UI)
// -----------------------------
const Audit = (() => {
  const log = async (event, data = {}) => {
    try {
      const uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
      await db.collection('_audit').add({
        event,
        data,
        uid,
        at: firebase.firestore.FieldValue.serverTimestamp(),
        ua: navigator.userAgent || ''
      });
    } catch {
      // fallback: enqueue untuk offline
      WriteQueue.enqueue({
        id: `audit:${event}:${Date.now()}`,
        op: 'add',
        path: '_audit', // add pada collection (_audit)
        data: {
          event, data, uid: ((auth && auth.currentUser) ? auth.currentUser.uid : null),
          at: firebase.firestore.FieldValue.serverTimestamp(),
          ua: navigator.userAgent || ''
        }
      });
    }
  };
  return { log };
})();

// Contoh: log saat export CSV dan batch approve/deny
document.addEventListener('leave:updated', (e) => {
  Audit.log('leave_updated', e.detail || {});
});
document.addEventListener('admin:paging:data', (e) => {
  // jejak ringan, tanpa PII berlebih
  Audit.log('admin_paging', { count: (e.detail && e.detail.docs ? e.detail.docs.length : 0) });
});

// -----------------------------
// Error boundary minimal: tangkap error agar tidak membatalkan mekanisme lain
// -----------------------------
(function errorBoundary() {
  window.addEventListener('error', (e) => {
    try { Audit.log('window_error', { message: e.message, src: e.filename, line: e.lineno, col: e.colno }); } catch {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { Audit.log('unhandled_rejection', { reason: (e.reason && (e.reason.message || String(e.reason))) || '' }); } catch {}
  });
})();

// -----------------------------
// Integrasi WriteQueue: helper enqueue publik
// -----------------------------
window.enqueueWrite = function enqueueWrite(job) {
  WriteQueue.enqueue(job);
};

// -----------------------------
// Final hooks: refresh halus saat kembali online setelah lama idle
// -----------------------------
(function softWakeOnline() {
  let lastOfflineAt = null;
  window.addEventListener('offline', () => { lastOfflineAt = Date.now(); });
  window.addEventListener('online', () => {
    const gap = lastOfflineAt ? (Date.now() - lastOfflineAt) : 0;
    lastOfflineAt = null;
    if (gap > 5 * 60 * 1000) {
      // setelah >5 menit offline, lakukan resync menyeluruh
      document.dispatchEvent(new CustomEvent('app:resync'));
    }
  });
})();
// -----------------------------
// Realtime: daftar cuti milik user (employee)
// -----------------------------
const MyLeavesRealtime = (() => {
  let unsub = null;

  const attach = (uid, limitN = 25) => {
    detach();
    if (!uid) return () => {};
    try {
      unsub = db.collection('leaves')
        .where('uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limitN)
        .onSnapshot((snap) => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          document.dispatchEvent(new CustomEvent('employee:leaves', { detail: { items } }));
        }, () => {});
    } catch {}

    document.addEventListener('realtime:collect-unsub', (e) => {
      if (typeof unsub === 'function') e.detail.push(unsub);
    }, { once: true });

    return () => detach();
  };

  const detach = () => {
    if (typeof unsub === 'function') { try { unsub(); } catch {} }
    unsub = null;
  };

  document.addEventListener('app:resync', () => {
    // otomatis attach ulang bila masih ada user
    const u = auth && auth.currentUser;
    if (!u) return;
    if (unsub) attach(u.uid);
  });

  return { attach, detach };
})();

(function wireMyLeavesForEmployee() {
  if (document.body.dataset.page !== 'employee') return;
  const container = document.getElementById('myLeaves'); // opsional; hanya untuk memutuskan attach
  if (!container) return;
  auth && auth.onAuthStateChanged(u => {
    if (!u) return;
    const off = MyLeavesRealtime.attach(u.uid, 30);
    window.addEventListener('beforeunload', () => { try { off(); } catch {} });
  });
})();

// -----------------------------
// Prefetch ringan berbasis role (read-only, cache hangat)
// -----------------------------
(function rolePrefetchWarmup() {
  const warmEmployee = async (uid) => {
    try {
      // hangatkan 1 read agar list cepat muncul
      await db.collection('leaves').where('uid','==',uid).orderBy('createdAt','desc').limit(5).get();
      await announcementsCol().orderBy('createdAt','desc').limit(5).get();
    } catch {}
  };
  const warmAdmin = async () => {
    try {
      await db.collection('leaves').where('status','==','pending').orderBy('createdAt','desc').limit(5).get();
      await announcementsCol().orderBy('createdAt','desc').limit(5).get();
    } catch {}
  };

  const key = (uid) => `warm:${APP_VERSION}:${uid || 'anon'}`;
  const mark = (uid) => { try { sessionStorage.setItem(key(uid), '1'); } catch {} };
  const seen = (uid) => { try { return sessionStorage.getItem(key(uid)) === '1'; } catch { return false; } };

  auth && auth.onAuthStateChanged(async (u) => {
    if (!u || seen(u.uid)) return;
    // gunakan cache role jika ada
    let role = null;
    try { role = sessionStorage.getItem(`role:${ROLE_CACHE_VERSION}:${u.uid}`); } catch {}
    try {
      if (role === 'admin') await warmAdmin(); else await warmEmployee(u.uid);
      mark(u.uid);
    } catch {}
  });
})();

// -----------------------------
// Hash guard: cegah akses anchor yang tidak sesuai role
// -----------------------------
(function routeHashGuard() {
  const page = document.body.dataset.page;
  if (!page) return;

  const isAllowed = (role, hash) => {
    if (!hash) return true;
    // contoh harden: blokir #admin-only bila role bukan admin
    if (/^#admin-/.test(hash) && role !== 'admin') return false;
    if (/^#employee-/.test(hash) && role !== 'employee') return false;
    return true;
  };

  const enforceHash = (role) => {
    const h = location.hash || '';
    if (!isAllowed(role, h)) {
      try { history.replaceState(null, '', (page === 'admin' ? '/admin.html' : '/employee.html')); }
      catch { location.replace(page === 'admin' ? '/admin.html' : '/employee.html'); }
    }
  };

  const cachedRole = (uid) => {
    try { return sessionStorage.getItem(`role:${ROLE_CACHE_VERSION}:${uid}`); } catch { return null; }
  };

  const apply = (u) => { if (!u) return; const role = cachedRole(u.uid) || 'employee'; enforceHash(role); };
  if (auth) {
    const u = auth.currentUser; if (u) apply(u);
    auth.onAuthStateChanged(apply);
  }

  window.addEventListener('hashchange', () => {
    const u = auth && auth.currentUser; if (!u) return;
    const role = cachedRole(u.uid) || 'employee';
    enforceHash(role);
  });
})();

// -----------------------------
// Firestore safe-get helper: prefer server, fallback cache
// -----------------------------
const FSafe = (() => {
  const getDocPreferServer = async (ref) => {
    try {
      const s = await ref.get({ source: 'server' });
      if (s.exists) return s;
    } catch {}
    try {
      return await ref.get({ source: 'cache' });
    } catch {
      return await ref.get(); // final fallback default
    }
  };

  const getQueryPreferServer = async (q) => {
    try {
      const s = await q.get({ source: 'server' });
      return s;
    } catch {}
    try {
      return await q.get({ source: 'cache' });
    } catch {
      return await q.get();
    }
  };

  return { getDocPreferServer, getQueryPreferServer };
})();

// -----------------------------
// Perf probe ringan: waktu first read & first snapshot
// -----------------------------
(function perfProbe() {
  const mark = (name) => { try { performance.mark(name); } catch {} };
  const measure = (name, start, end) => { try { performance.measure(name, start, end); } catch {} };

  mark('app:start');

  // probe leaves/ann once to gauge readiness
  document.addEventListener('ann:list', () => {
    mark('probe:ann:ready');
    measure('ann_ready', 'app:start', 'probe:ann:ready');
  }, { once: true });

  document.addEventListener('employee:leaves', () => {
    mark('probe:leaves:ready');
    measure('leaves_ready', 'app:start', 'probe:leaves:ready');
  }, { once: true });

  // optional: log ringkas
  setTimeout(() => {
    try {
      const entries = performance.getEntriesByType('measure')
        .filter(m => /_(ready)$/.test(m.name))
        .map(m => ({ name: m.name, ms: Math.round(m.duration) }));
      if (entries.length) Audit.log('perf_measures', { entries });
    } catch {}
  }, 4000);
})();
// -----------------------------
// Storage retry queue: upload file dengan retry offline/online
// -----------------------------
const StorageQueue = (() => {
  const KEY = 'app:storageQueue:v1';
  let q = [];

  const load = () => { try { q = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { q = []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {} };

  // job: { id, path, fileMeta: { name, type, size }, dataUrl | blobBase64 }
  const enqueue = (job) => {
    if (!job || !job.id || !job.path) return;
    const i = q.findIndex(x => x.id === job.id);
    if (i >= 0) q[i] = job; else q.push(job);
    save();
    tickSoon();
  };

  const decodeBlob = async (job) => {
    if (job.dataUrl) {
      // dataURL -> Blob
      try {
        const res = await fetch(job.dataUrl);
        return await res.blob();
      } catch { return null; }
    }
    if (job.blobBase64) {
      try {
        const byteChars = atob(job.blobBase64);
        const arr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) arr[i] = byteChars.charCodeAt(i);
        return new Blob([arr], { type: job.fileMeta && job.fileMeta.type || 'application/octet-stream' });
      } catch { return null; }
    }
    return null;
  };

  let ticking = false;
  const tickSoon = () => { if (!ticking) { ticking = true; setTimeout(process, 350); } };

  const process = async () => {
    ticking = false;
    if (!q.length || !navigator.onLine || !firebase || !firebase.storage) return;
    const next = [...q];
    for (const job of next) {
      try {
        const blob = await decodeBlob(job);
        if (!blob) continue;
        const ref = firebase.storage().ref(job.path);
        await ref.put(blob, { contentType: job.fileMeta && job.fileMeta.type || blob.type });
        // Optional: simpan downloadURL ke Firestore jika diminta
        if (job.writeBackPath) {
          const url = await ref.getDownloadURL();
          WriteQueue.enqueue({
            id: `st:wb:${job.id}`,
            op: 'set',
            path: job.writeBackPath,
            data: { url, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() },
            opts: { merge: true }
          });
        }
        q = q.filter(x => x.id !== job.id);
        save();
      } catch {
        // hentikan; coba lagi saat online berikutnya
        break;
      }
    }
  };

  window.addEventListener('online', tickSoon);
  document.addEventListener('app:resync', tickSoon);

  load();
  return { enqueue, process };
})();

// -----------------------------
// Realtime: pending count badge per role (ringan)
// -----------------------------
(function rolePendingCount() {
  const page = document.body.dataset.page;
  const badge = document.getElementById('notifBadge');
  if (!badge) return;

  let unsub = null;
  const setBadge = (show) => { show ? badge.classList.remove('hidden') : badge.classList.add('hidden'); };

  const attachAdmin = () => {
    detach();
    try {
      unsub = db.collection('leaves').where('status','==','pending').limit(1).onSnapshot(s => {
        setBadge(!s.empty);
      }, () => {});
    } catch {}
    document.addEventListener('realtime:collect-unsub', (e) => { if (typeof unsub === 'function') e.detail.push(unsub); }, { once: true });
  };

  const attachEmployee = (uid) => {
    detach();
    let u1 = null, u2 = null;
    try {
      u1 = db.collection('leaves').where('uid','==',uid).where('unread.user','==',true).limit(1).onSnapshot(s => {
        badge.dataset.hasLeave = (!s.empty) ? '1' : '';
        const any = badge.dataset.hasLeave === '1' || badge.dataset.hasAnn === '1';
        setBadge(any);
      }, () => {});
      u2 = announcementsCol().where('unreadFor','array-contains',uid).limit(1).onSnapshot(s => {
        badge.dataset.hasAnn = (!s.empty) ? '1' : '';
        const any = badge.dataset.hasLeave === '1' || badge.dataset.hasAnn === '1';
        setBadge(any);
      }, () => {});
    } catch {}
    unsub = () => {
      if (typeof u1 === 'function') { try { u1(); } catch {} }
      if (typeof u2 === 'function') { try { u2(); } catch {} }
    };
    document.addEventListener('realtime:collect-unsub', (e) => { if (typeof unsub === 'function') e.detail.push(unsub); }, { once: true });
  };

  const detach = () => { if (typeof unsub === 'function') { try { unsub(); } catch {} } unsub = null; };

  auth && auth.onAuthStateChanged(u => {
    if (!u) { detach(); setBadge(false); return; }
    // cek cache role
    let role = null;
    try { role = sessionStorage.getItem(`role:${ROLE_CACHE_VERSION}:${u.uid}`); } catch {}
    if (page === 'admin') attachAdmin();
    if (page === 'employee') attachEmployee(u.uid);
  });

  window.addEventListener('beforeunload', () => { detach(); });
})();

// -----------------------------
// Pencarian lokal: filter daftar cuti & pengumuman
// -----------------------------
const LocalSearch = (() => {
  // sederhana: normalisasi untuk pencocokan
  const norm = (s) => (s || '').toString().toLowerCase();

  const filterLeaves = (items, q) => {
    const k = norm(q);
    if (!k) return items;
    return items.filter(x =>
      norm(x.name).includes(k) ||
      norm(x.reason).includes(k) ||
      norm(x.status).includes(k) ||
      norm(x.startDate).includes(k) ||
      norm(x.endDate).includes(k) ||
      (x.id && norm(x.id).includes(k))
    );
  };

  const filterAnnouncements = (items, q) => {
    const k = norm(q);
    if (!k) return items;
    return items.filter(x =>
      norm(x.title).includes(k) ||
      norm(x.body).includes(k) ||
      norm(x.audience).includes(k) ||
      (x.id && norm(x.id).includes(k))
    );
  };

  return { filterLeaves, filterAnnouncements };
})();

(function wireLocalSearchInputs() {
  const leavesInput = document.getElementById('searchLeaves');
  const annInput = document.getElementById('searchAnnouncements');

  if (leavesInput) {
    let lastItems = [];
    document.addEventListener('employee:leaves', (e) => { lastItems = e.detail && e.detail.items || []; apply(); });
    const apply = () => {
      const q = (leavesInput.value || '').trim();
      const filtered = LocalSearch.filterLeaves(lastItems, q);
      document.dispatchEvent(new CustomEvent('employee:leaves:filtered', { detail: { q, items: filtered } }));
    };
    leavesInput.addEventListener('input', Timing ? Timing.debounce(apply, 150) : apply);
  }

  if (annInput) {
    let lastItems = [];
    document.addEventListener('ann:list', (e) => { lastItems = e.detail && e.detail.items || []; applyAnn(); });
    const applyAnn = () => {
      const q = (annInput.value || '').trim();
      const filtered = LocalSearch.filterAnnouncements(lastItems, q);
      document.dispatchEvent(new CustomEvent('ann:list:filtered', { detail: { q, items: filtered } }));
    };
    annInput.addEventListener('input', Timing ? Timing.debounce(applyAnn, 150) : applyAnn);
  }
})();

// -----------------------------
// Teardown halus saat navigasi halaman penuh
// -----------------------------
(function gracefulTeardown() {
  // kumpulkan dan hentikan seluruh listener realtime melalui registry
  window.addEventListener('beforeunload', () => {
    try {
      const ev = new CustomEvent('realtime:collect-unsub', { detail: { push(){} } });
      document.dispatchEvent(ev);
    } catch {}
  });
})();

// -----------------------------
// Safeguard konfigurasi minimal (env)
// -----------------------------
(function configSafeguard() {
  const must = [
    'firebase',
    'db',
    'auth'
  ];
  const missing = must.filter(k => typeof window[k] === 'undefined' || window[k] == null);
  if (missing.length) {
    console.warn('[config] Variabel penting belum terinisialisasi:', missing.join(', '));
  }
})();
