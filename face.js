/* ============================================================
   BELOVED KIDS CITO — face.js
   Logika halaman Absensi Wajah (face.html)
   ============================================================ */

/* ── CONFIG ── */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4AIeYtaSwb4q-2zWoELwer5R81k7qDkfFjSg8Uzt1iQ9r7Xs6jGS5RGEJhreTAWizOg/exec';

// CDN model @vladmandic (sama format weights dg face-api.js 0.22)
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

// Threshold jarak Euclidean (makin kecil = makin strict)
// 0.50 → cocok jika jarak < 0.50; CONF_HIGH jika jarak < 0.38
const MATCH_THRESHOLD = 0.50;
const CONF_HIGH_DIST  = 0.38;

/* ── STATE ── */
let modelsLoaded  = false;
let cameraActive  = false;
let detectTimer   = null;
let currentMatch  = null;   // { student, distance, capturedDataUrl }

let allStudents   = [];     // { id, nama, kelas, fotoUrl, descriptor }
let pendingQueue  = [];     // menunggu konfirmasi guru
let confirmedList = [];     // sudah dikonfirmasi

/* ── DOM REFS (diisi setelah DOMContentLoaded) ── */
let videoEl, canvasEl;

/* ============================================================
   INIT
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('inputDate').value = new Date().toISOString().split('T')[0];

  videoEl  = document.getElementById('videoEl');
  canvasEl = document.getElementById('canvasEl');

  loadModels();
  loadStudentData();
});

/* ============================================================
   LOAD FACE-API MODELS
============================================================ */
async function loadModels() {
  setModelStatus('loading', 'Memuat model AI wajah… (10–30 detik pertama kali)');
  try {
    await waitForFaceApi();
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    modelsLoaded = true;
    setModelStatus('ready', '✅ Model AI siap — sistem bisa mulai scan wajah');
  } catch (e) {
    console.error('[loadModels]', e);
    setModelStatus('error', '❌ Gagal muat model AI. Cek koneksi & refresh halaman.');
  }
}

/* Tunggu face-api.js selesai di-load dari CDN (defer) */
function waitForFaceApi(timeout = 20000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const check = () => {
      if (typeof faceapi !== 'undefined') return res();
      if (Date.now() - t0 > timeout)     return rej(new Error('face-api timeout'));
      setTimeout(check, 250);
    };
    check();
  });
}

/* Tunggu modelsLoaded = true */
function waitForModels(timeout = 90000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const check = () => {
      if (modelsLoaded)              return res();
      if (Date.now() - t0 > timeout) return rej(new Error('Model timeout'));
      setTimeout(check, 400);
    };
    check();
  });
}

function setModelStatus(type, msg) {
  const el = document.getElementById('modelStatus');
  el.className = `face-model-status face-ms-${type}`;
  document.getElementById('modelStatusText').textContent = msg;
}

/* ============================================================
   LOAD DATA SISWA + BUILD DESCRIPTORS
============================================================ */
async function loadStudentData() {
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=getSiswa`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Gagal memuat siswa');

    // Hanya siswa yang punya foto
    allStudents = (data.result || [])
      .filter(r => (r[3] || '').trim())
      .map(r => ({
        id:         (r[2] || '').trim(),
        nama:       (r[0] || '').trim(),
        kelas:      (r[1] || '').trim().toLowerCase(),
        fotoUrl:    (r[3] || '').trim(),
        descriptor: null,
      }));

    showToast(`📋 ${allStudents.length} anak dengan foto ditemukan`, 'success');
    buildDescriptors(); // proses di background
  } catch (e) {
    console.error('[loadStudentData]', e);
    showToast('⚠️ Gagal muat data siswa dari Sheets', 'error');
  }
}

async function buildDescriptors() {
  await waitForModels();
  let built = 0;
  for (const stu of allStudents) {
    try {
      const img = await loadCrossOriginImage(stu.fotoUrl);
      const det = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.30 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (det) { stu.descriptor = det.descriptor; built++; }
    } catch (_) { /* skip foto error */ }
  }
  showToast(`🧠 ${built} descriptor wajah siap dicocokkan`, 'success');
}

/* Load gambar dengan crossOrigin — pakai proxy URL untuk Google Drive */
function loadCrossOriginImage(url) {
  return new Promise((res, rej) => {
    const img  = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error('Gagal load gambar: ' + url));
    img.src = driveProxyUrl(url);
  });
}

/* Konversi URL Google Drive ke URL thumbnail langsung (bypass CORS Drive preview) */
function driveProxyUrl(url) {
  if (!url) return '';
  // GitHub raw URLs — langsung bisa dipakai di <img src>
  if (url.includes('raw.githubusercontent.com')) return url;
  // Legacy Google Drive — konversi ke lh3 proxy agar bisa ditampilkan
  if (url.includes('drive.google.com')) {
    const id = extractDriveId(url);
    return id ? `https://lh3.googleusercontent.com/d/${id}=s300` : url;
  }
  return url;
}

function extractDriveId(url) {
  const m = url.match(/\/d\/([^/?&#]+)/);
  if (m) return m[1];
  const m2 = url.match(/id=([^&]+)/);
  return m2 ? m2[1] : '';
}

/* ============================================================
   KAMERA
============================================================ */
async function toggleCamera() {
  cameraActive ? stopCamera() : await startCamera();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    cameraActive = true;

    document.getElementById('camPlaceholder').style.display = 'none';
    document.getElementById('camStatus').textContent = 'Kamera aktif — arahkan wajah ke oval';
    document.getElementById('btnCamera').textContent = '⏹ Matikan Kamera';
    document.getElementById('btnScan').disabled      = false;

    startLiveDetection();
  } catch (e) {
    console.error('[startCamera]', e);
    showToast('❌ Izin kamera ditolak atau tidak tersedia', 'error');
  }
}

function stopCamera() {
  const stream = videoEl.srcObject;
  if (stream) stream.getTracks().forEach(t => t.stop());
  videoEl.srcObject = null;
  cameraActive = false;
  stopLiveDetection();

  document.getElementById('camPlaceholder').style.display = 'flex';
  document.getElementById('camStatus').textContent = 'Kamera dimatikan';
  document.getElementById('btnCamera').textContent = '🎥 Aktifkan Kamera';
  document.getElementById('btnScan').disabled      = true;
  document.getElementById('faceOval').classList.remove('detected');
}

/* Live detection — hanya untuk feedback oval hijau/kuning, tidak untuk matching */
function startLiveDetection() {
  if (!modelsLoaded) return;
  stopLiveDetection();
  detectTimer = setInterval(async () => {
    if (!cameraActive || videoEl.readyState < 2) return;
    try {
      const det = await faceapi.detectSingleFace(
        videoEl,
        new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.40, inputSize: 224 })
      );
      const oval = document.getElementById('faceOval');
      if (det) {
        oval.classList.add('detected');
        document.getElementById('camStatus').textContent = '✅ Wajah terdeteksi — siap scan!';
      } else {
        oval.classList.remove('detected');
        document.getElementById('camStatus').textContent = 'Kamera aktif — arahkan wajah ke oval';
      }
    } catch (_) {}
  }, 650);
}

function stopLiveDetection() {
  if (detectTimer) { clearInterval(detectTimer); detectTimer = null; }
}

/* ============================================================
   SCAN & MATCHING
============================================================ */
async function doScan() {
  if (!modelsLoaded) { showToast('⏳ Model AI belum siap, tunggu sebentar', 'error'); return; }
  if (!cameraActive)  { showToast('📷 Aktifkan kamera dulu', 'error'); return; }
  if (videoEl.readyState < 2) { showToast('⏳ Video belum siap', 'error'); return; }

  // Flash efek
  triggerFlash();

  // Tampilkan overlay "Mencocokkan wajah…"
  const proc = document.getElementById('processingOverlay');
  proc.classList.add('show');
  stopLiveDetection();
  document.getElementById('btnScan').disabled = true;

  try {
    // Ambil snapshot video ke canvas offscreen
    const snap = document.createElement('canvas');
    snap.width  = videoEl.videoWidth  || 640;
    snap.height = videoEl.videoHeight || 480;
    snap.getContext('2d').drawImage(videoEl, 0, 0);

    const detection = await faceapi
      .detectSingleFace(snap, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      hideProcOverlay();
      showNoMatchModal();
      return;
    }

    // Filter pool siswa sesuai kelas yang dipilih
    const filterKelas = document.getElementById('inputKelas').value;
    const pool = allStudents.filter(s =>
      s.descriptor && (filterKelas === 'semua' || s.kelas === filterKelas)
    );

    if (!pool.length) {
      hideProcOverlay();
      showToast('⚠️ Tidak ada foto siswa yang bisa dicocokkan di kelas ini', 'error');
      return;
    }

    // FaceMatcher — cari jarak terkecil
    const matcher = new faceapi.FaceMatcher(
      pool.map(s => new faceapi.LabeledFaceDescriptors(s.id, [s.descriptor])),
      MATCH_THRESHOLD
    );
    const best = matcher.findBestMatch(detection.descriptor);

    hideProcOverlay();

    if (best.label === 'unknown') {
      showNoMatchModal();
      return;
    }

    const matched = allStudents.find(s => s.id === best.label);
    if (!matched) { showNoMatchModal(); return; }

    // Cek duplikat
    if (confirmedList.some(c => c.id === matched.id)) {
      showToast(`ℹ️ ${matched.nama} sudah tercatat hadir`, '');
      return;
    }
    if (pendingQueue.some(q => q.id === matched.id)) {
      showToast(`ℹ️ ${matched.nama} sudah ada di antrian konfirmasi`, '');
      return;
    }

    // Crop wajah dari snapshot untuk ditampilkan di modal
    const capturedDataUrl = cropFaceFromCanvas(snap, detection.detection.box);

    currentMatch = { student: matched, distance: best.distance, capturedDataUrl };
    showMatchModal(matched, best.distance, capturedDataUrl);

  } catch (e) {
    console.error('[doScan]', e);
    hideProcOverlay();
    showToast('❌ Error saat scan, coba lagi', 'error');
  }
}

function hideProcOverlay() {
  document.getElementById('processingOverlay').classList.remove('show');
  document.getElementById('btnScan').disabled = false;
  startLiveDetection();
}

function triggerFlash() {
  const el = document.getElementById('scanFlash');
  el.classList.remove('flashing');
  void el.offsetWidth; // reflow
  el.classList.add('flashing');
}

/* Crop area wajah + padding dari canvas snapshot */
function cropFaceFromCanvas(canvas, box) {
  const pad = 32;
  const x   = Math.max(0, box.x - pad);
  const y   = Math.max(0, box.y - pad);
  const w   = Math.min(canvas.width  - x, box.width  + pad * 2);
  const h   = Math.min(canvas.height - y, box.height + pad * 2);
  const out = document.createElement('canvas');
  out.width = out.height = 120;
  out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, 120, 120);
  return out.toDataURL('image/jpeg', 0.85);
}

/* ============================================================
   MATCH MODAL
============================================================ */
function showMatchModal(student, distance, capturedDataUrl) {
  // Gambar hasil scan → canvas di modal
  const cc  = document.getElementById('capturedCanvas');
  const ctx = cc.getContext('2d');
  ctx.clearRect(0, 0, 96, 96);
  const img = new Image();
  img.onload = () => {
    // Clip lingkaran
    ctx.save();
    ctx.beginPath();
    ctx.arc(48, 48, 48, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, 96, 96);
    ctx.restore();
  };
  img.src = capturedDataUrl;

  // Foto profil siswa
  const profilEl = document.getElementById('mfiProfil');
  if (student.fotoUrl) {
    const src = driveProxyUrl(student.fotoUrl);
    profilEl.innerHTML = `<img src="${src}" alt="${escHtml(student.nama)}"
      onerror="this.parentElement.textContent='${escHtml(student.nama.charAt(0))}'" />`;
  } else {
    profilEl.textContent = student.nama.charAt(0).toUpperCase();
  }

  // Nama & kelas
  document.getElementById('modalNama').textContent = student.nama;
  const kelasMap = { kecil: '🐣 Kelas Kecil', tengah: '🌿 Kelas Tengah', besar: '⭐ Kelas Besar' };
  document.getElementById('modalMeta').textContent = kelasMap[student.kelas] || student.kelas;

  // Confidence badge
  const pct    = Math.round((1 - distance) * 100);
  const isHigh = distance < CONF_HIGH_DIST;
  const confEl = document.getElementById('modalConf');
  confEl.className   = `face-conf-badge ${isHigh ? 'high' : 'mid'}`;
  confEl.textContent = `${isHigh ? '🟢' : '🟡'} Kecocokan ${pct}% — ${isHigh ? 'Akurasi Tinggi' : 'Cukup Yakin'}`;

  document.getElementById('matchModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function confirmMatch(ok) {
  document.getElementById('matchModal').classList.remove('show');
  document.body.style.overflow = '';

  if (ok && currentMatch) {
    const { student, distance } = currentMatch;
    confirmedList.push({ ...student, distance, confirmedAt: new Date() });
    renderConfirmed();
    showToast(`✅ ${student.nama} — Hadir dikonfirmasi!`, 'success');
  } else {
    showToast('✕ Ditolak', '');
  }
  currentMatch = null;
}

/* ============================================================
   NO MATCH MODAL
============================================================ */
function showNoMatchModal() {
  document.getElementById('noMatchModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeNoMatchModal() {
  document.getElementById('noMatchModal').classList.remove('show');
  document.body.style.overflow = '';
}

/* ============================================================
   RENDER QUEUE (antrian)
============================================================ */
function renderQueue() {
  const listEl = document.getElementById('queueList');
  document.getElementById('queueCount').textContent = pendingQueue.length;

  if (!pendingQueue.length) {
    listEl.innerHTML = `<div class="face-empty">
      <div class="face-empty-icon">🔍</div>
      <p>Belum ada hasil scan</p>
    </div>`;
    return;
  }

  const kelasMap = { kecil:'🐣 Kecil', tengah:'🌿 Tengah', besar:'⭐ Besar' };
  listEl.innerHTML = pendingQueue.map((q, i) => {
    const pct   = Math.round((1 - q.distance) * 100);
    const level = q.distance < CONF_HIGH_DIST ? 'high' : 'mid';
    const src   = q.fotoUrl ? driveProxyUrl(q.fotoUrl) : null;
    const avatar = src
      ? `<div class="face-q-foto"><img src="${src}" alt=""
           onerror="this.parentElement.innerHTML='${escHtml(q.nama.charAt(0))}'"></div>`
      : `<div class="face-q-foto">${escHtml(q.nama.charAt(0))}</div>`;

    return `<div class="face-queue-item">
      ${avatar}
      <div class="face-q-info">
        <div class="face-q-nama">${escHtml(q.nama)}</div>
        <div class="face-q-meta">${kelasMap[q.kelas] || q.kelas}</div>
      </div>
      <span class="face-q-conf ${level}">${pct}%</span>
      <div class="face-q-actions">
        <button class="face-q-btn face-q-btn-ok" onclick="confirmFromQueue(${i}, true)">✓ Hadir</button>
        <button class="face-q-btn face-q-btn-no" onclick="confirmFromQueue(${i}, false)">✕</button>
      </div>
    </div>`;
  }).join('');
}

function confirmFromQueue(idx, ok) {
  const item = pendingQueue[idx];
  if (!item) return;
  pendingQueue.splice(idx, 1);
  renderQueue();

  if (ok) {
    confirmedList.push({ ...item, confirmedAt: new Date() });
    renderConfirmed();
    showToast(`✅ ${item.nama} — Hadir!`, 'success');
  } else {
    showToast(`✕ ${item.nama} ditolak`, '');
  }
}

/* ============================================================
   RENDER CONFIRMED
============================================================ */
function renderConfirmed() {
  const listEl  = document.getElementById('confirmedList');
  const saveEl  = document.getElementById('saveSection');
  document.getElementById('confirmedCount').textContent = confirmedList.length;

  if (!confirmedList.length) {
    listEl.innerHTML = `<div class="face-empty">
      <div class="face-empty-icon">👼</div>
      <p>Belum ada yang dikonfirmasi</p>
    </div>`;
    saveEl.style.display = 'none';
    return;
  }

  saveEl.style.display = 'block';
  const kelasMap = { kecil:'🐣 Kecil', tengah:'🌿 Tengah', besar:'⭐ Besar' };
  listEl.innerHTML = confirmedList.map(c => {
    const jam = c.confirmedAt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    return `<div class="face-confirmed-item">
      <div class="face-confirmed-check">✓</div>
      <div>
        <div class="face-confirmed-nama">${escHtml(c.nama)}</div>
        <div class="face-confirmed-meta">${kelasMap[c.kelas] || c.kelas} · ${jam}</div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   SIMPAN KE SHEETS
============================================================ */
async function saveAllAttendance() {
  if (!confirmedList.length) { showToast('Belum ada absensi yang dikonfirmasi', ''); return; }

  const tanggal = document.getElementById('inputDate').value;
  const sesi    = document.getElementById('inputSesi').value;
  if (!tanggal) { showToast('⚠️ Pilih tanggal dulu', 'error'); return; }

  const btn = document.getElementById('btnSave');
  btn.disabled  = true;
  btn.innerHTML = '<span class="face-btn-spinner"></span> Menyimpan…';

  // Kelompokan per kelas (format sama dengan submitAbsensi di app.js)
  const byKelas = {};
  confirmedList.forEach(c => {
    if (!byKelas[c.kelas]) byKelas[c.kelas] = [];
    byKelas[c.kelas].push({ nama: c.nama, status: 'Hadir' });
  });

  try {
    const sesiLabel = `Sesi ${sesi}`;
    const promises  = Object.entries(byKelas).map(([kelas, items]) => {
      const rows = items.map(it => ({
        tanggal,
        sesi:   sesiLabel,
        kelas,
        nama:   it.nama,
        status: 'Hadir',
      }));
      const encoded = encodeURIComponent(JSON.stringify(rows));
      return fetch(`${APPS_SCRIPT_URL}?action=absensi&data=${encoded}`, { mode: 'no-cors' });
    });

    await Promise.all(promises);
    showToast(`✅ ${confirmedList.length} absensi tersimpan ke Sheets!`, 'success');

    btn.disabled  = false;
    btn.innerHTML = '✅ Tersimpan! Simpan Lagi';
  } catch (e) {
    console.error('[saveAllAttendance]', e);
    btn.disabled  = false;
    btn.innerHTML = '💾 Simpan Absensi ke Sheets';
    showToast('❌ Gagal simpan, coba lagi', 'error');
  }
}

/* ============================================================
   UI HELPERS
============================================================ */
let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function escHtml(s = '') {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ============================================================
   NO-MATCH MODAL — TAMBAH ANAK BARU
============================================================ */
function openAddStudentModal() {
  // Close no-match first
  document.getElementById('noMatchModal').classList.remove('show');

  // Reset form
  document.getElementById('addStuName').value  = '';
  document.getElementById('addStuKelas').value = 'kecil';

  document.getElementById('addStudentModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('addStuName').focus(), 180);
}

function closeAddStudentModal() {
  document.getElementById('addStudentModal').classList.remove('show');
  document.body.style.overflow = '';
}

async function submitAddStudent() {
  const nama  = document.getElementById('addStuName').value.trim();
  const kelas = document.getElementById('addStuKelas').value;

  if (!nama) {
    const inp = document.getElementById('addStuName');
    inp.style.borderColor = 'var(--maroon-light)';
    inp.focus();
    setTimeout(() => inp.style.borderColor = '', 1500);
    return;
  }

  const btn = document.getElementById('btnSubmitAddStudent');
  btn.disabled  = true;
  btn.innerHTML = '<span class="face-btn-spinner"></span> Menyimpan…';

  const id = `${kelas}_${Date.now()}`;

  try {
    const payload = encodeURIComponent(JSON.stringify({ nama, kelas, id }));
    await fetch(`${APPS_SCRIPT_URL}?action=tambahSiswa&data=${payload}`, { mode: 'no-cors' });

    // Add to local allStudents pool (no descriptor yet — they don't have a photo)
    allStudents.push({ id, nama, kelas, fotoUrl: '', descriptor: null });

    showToast(`✅ ${nama} berhasil ditambahkan!`, 'success');
    closeAddStudentModal();
  } catch (err) {
    console.error('[submitAddStudent]', err);
    showToast('⚠️ Gagal simpan ke Sheets, coba lagi', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '➕ Tambah Anak';
  }
}

/* ============================================================
   NO-MATCH MODAL — ASSIGN FOTO KE ANAK YANG ADA
============================================================ */
let _assignTargetId   = null;  // ID siswa yang dipilih untuk difoto
let _allStudentsCache = [];    // cache flat list untuk search

function openAssignPhotoModal() {
  document.getElementById('noMatchModal').classList.remove('show');
  document.getElementById('assignSearchInput').value = '';

  // Always fetch fresh from server — allStudents only contains kids WITH photos,
  // but here we want ALL kids so the user can assign photos to anyone.
  _fetchAllStudentsForAssign();

  document.getElementById('assignPhotoModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('assignSearchInput').focus(), 180);
}

async function _fetchAllStudentsForAssign() {
  const listEl = document.getElementById('assignStudentList');
  listEl.innerHTML = `<div class="face-assign-loading"><div class="face-proc-spinner" style="width:32px;height:32px"></div><span>Memuat data…</span></div>`;

  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=getSiswa`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Gagal');

    _allStudentsCache = (data.result || []).map(r => ({
      id:      (r[2] || '').trim(),
      nama:    (r[0] || '').trim(),
      kelas:   (r[1] || '').trim().toLowerCase(),
      fotoUrl: (r[3] || '').trim(),
    })).filter(s => s.id && s.nama);

    renderAssignList('');
  } catch (e) {
    listEl.innerHTML = `<div class="face-empty"><div class="face-empty-icon">⚠️</div><p>Gagal muat data, coba lagi.</p></div>`;
  }
}

function closeAssignPhotoModal() {
  document.getElementById('assignPhotoModal').classList.remove('show');
  document.body.style.overflow = '';
  _assignTargetId = null;
}

function filterAssignList(q) {
  renderAssignList(q.trim().toLowerCase());
}

const KELAS_LABEL = { kecil: '🐣 Kecil', tengah: '🌿 Tengah', besar: '⭐ Besar' };

function renderAssignList(q) {
  const listEl = document.getElementById('assignStudentList');
  const items  = q
    ? _allStudentsCache.filter(s => s.nama.toLowerCase().includes(q))
    : _allStudentsCache;

  if (!items.length) {
    listEl.innerHTML = `<div class="face-empty"><div class="face-empty-icon">🔍</div><p>${q ? 'Anak tidak ditemukan' : 'Belum ada data anak'}</p></div>`;
    return;
  }

  listEl.innerHTML = items.map(s => {
    const hasFoto   = !!(s.fotoUrl && s.fotoUrl.trim());
    const src       = hasFoto ? driveProxyUrl(s.fotoUrl) : null;
    const initial   = s.nama.charAt(0).toUpperCase();
    const avatarHtml = src
      ? `<img src="${src}" alt="" onerror="this.parentElement.innerHTML='${escHtml(initial)}'">`
      : initial;

    return `<button class="face-assign-item" onclick="selectStudentForPhoto('${escHtml(s.id)}','${escHtml(s.nama)}')">
      <div class="face-assign-avatar">${avatarHtml}</div>
      <div class="face-assign-info">
        <div class="face-assign-name">${escHtml(s.nama)}</div>
        <div class="face-assign-meta">${KELAS_LABEL[s.kelas] || s.kelas} ${hasFoto ? '· <span class="face-has-foto-tag">Sudah ada foto</span>' : '· <span class="face-no-foto-tag">Belum ada foto</span>'}</div>
      </div>
      <div class="face-assign-action">📷 Pilih</div>
    </button>`;
  }).join('');
}

function selectStudentForPhoto(id, nama) {
  _assignTargetId = id;
  // Trigger file picker
  const inp = document.getElementById('assignFotoInput');
  inp.dataset.stuId   = id;
  inp.dataset.stuNama = nama;
  inp.click();
}

async function handleAssignFotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ Ukuran foto maks 5MB ya!', 'error');
    event.target.value = '';
    return;
  }

  const stuId   = event.target.dataset.stuId;
  const stuNama = event.target.dataset.stuNama;
  event.target.value = '';

  // Close assign modal while uploading
  closeAssignPhotoModal();

  const reader = new FileReader();
  reader.onload = e => {
    _resizeImageFace(e.target.result, 300, async dataUrl => {
      showToast(`📤 Mengupload foto ${stuNama}…`, '');
      try {
        const base64 = dataUrl.split(',')[1];
        // Determine kelas from cache
        const stuData = _allStudentsCache.find(s => s.id === stuId);
        const kelas   = stuData ? stuData.kelas : 'kecil';

        const res = await fetch(APPS_SCRIPT_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'uploadFoto',
            data: JSON.stringify({ id: stuId, base64, kelas }),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Upload gagal');

        const fotoUrl = data.result ? data.result + `?t=${Date.now()}` : null;

        // Update local cache
        if (stuData) stuData.fotoUrl = fotoUrl || '';

        // Update allStudents in memory + rebuild descriptors for this one
        const existing = allStudents.find(s => s.id === stuId);
        if (existing) {
          existing.fotoUrl = fotoUrl || '';
          // Try to re-build descriptor for this student
          if (fotoUrl && modelsLoaded) {
            try {
              const img = await loadCrossOriginImage(fotoUrl);
              const det = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.30 }))
                .withFaceLandmarks(true)
                .withFaceDescriptor();
              if (det) existing.descriptor = det.descriptor;
            } catch (_) {}
          }
        } else if (stuData) {
          // Was not in allStudents (had no photo before) — add it now
          allStudents.push({ ...stuData, fotoUrl: fotoUrl || '', descriptor: null });
        }

        showToast(`✅ Foto ${stuNama} berhasil disimpan!`, 'success');
      } catch (err) {
        console.error('[handleAssignFotoUpload]', err);
        showToast(`❌ Gagal upload foto: ${err.message}`, 'error');
      }
    });
  };
  reader.readAsDataURL(file);
}

/* Simple image resize helper (mirrors app.js _resizeImage) */
function _resizeImageFace(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
    else       { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = dataUrl;
}

