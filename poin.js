/* ============================================================
   BELOVED KIDS CITO — Sistem Poin
   ============================================================ */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4AIeYtaSwb4q-2zWoELwer5R81k7qDkfFjSg8Uzt1iQ9r7Xs6jGS5RGEJhreTAWizOg/exec';

// ── Aktivitas default & nilainya ─────────────────────────────
// Format: { id, label, icon, poin }
const DEFAULT_AKTIVITAS = [
  { id: 'doa',       label: 'Mimpin Doa',  icon: '🙏', poin: 1 },
  { id: 'kesaksian', label: 'Kesaksian',   icon: '✝️', poin: 1 },
  { id: 'kuis',      label: 'Jawab Kuis',  icon: '💡', poin: 1 },
];

// State
const state = {
  kecil:  [],
  tengah: [],
  besar:  [],
  activeKelas: 'semua',
  aktivitas: [],   // akan diisi dari sheet + default
  modal: { id: null, nama: null, kelas: null, poin: 0, selected: [] },
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  document.getElementById('headerDate').textContent =
    now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).toUpperCase();
  document.getElementById('yearBadge').textContent = `Tahun ${now.getFullYear()}`;

  loadAll();
});

async function loadAll() {
  showLoading('Memuat data poin...');
  try {
    const [siswRes, aktRes] = await Promise.all([
      fetch(`${APPS_SCRIPT_URL}?action=getSiswaWithPoin`),
      fetch(`${APPS_SCRIPT_URL}?action=getAktivitas`),
    ]);
    const siswData = await siswRes.json();
    const aktData  = await aktRes.json();

    if (!siswData.ok) throw new Error(siswData.error || 'Gagal memuat siswa');

    // Simpan base data siswa (nama, kelas, id) — poin akan dioverride sesuai filter
    state._baseSiswa = [];
    ['kecil', 'tengah', 'besar'].forEach(k => { state[k] = []; });
    (siswData.result || []).forEach(r => {
      const nama  = (r[0] || '').trim();
      const kelas = (r[1] || '').trim().toLowerCase();
      const id    = (r[2] || '').trim();
      const poin  = parseInt(r[3]) || 0;
      if (nama && ['kecil', 'tengah', 'besar'].includes(kelas)) {
        state[kelas].push({ id, nama, poin });
        state._baseSiswa.push({ id, nama, kelas, poin });
      }
    });

    const customAkt = aktData.ok ? (aktData.result || []) : [];
    state.aktivitas = [
      ...DEFAULT_AKTIVITAS,
      ...customAkt.map(r => ({
        id: `custom_${r[0]}`, label: r[0], icon: r[1] || '🌟', poin: 1,
      })),
    ];

    hideLoading();
    renderFilter();
    renderCurrent();
  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }
}

// Render panel sesuai kelas & filter aktif
function renderCurrent() {
  if (state.activeKelas === 'semua') renderPanelSemua();
  else renderPanel(state.activeKelas);
}

// Hitung range tanggal dari mode filter
function getFilterRange(mode) {
  const now   = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (mode === 'semua') return { dari: '', sampai: '' };

  if (mode === 'tahun') {
    return { dari: `${now.getFullYear()}-01-01`, sampai: `${now.getFullYear()}-12-31` };
  }
  if (mode === 'bulan') {
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0);
    return { dari: `${y}-${pad(m+1)}-01`, sampai: fmt(last) };
  }
  if (mode === 'minggu') {
    const day  = now.getDay(); // 0=Sun
    const diff = day === 0 ? 6 : day - 1; // senin = start minggu
    const sen  = new Date(now); sen.setDate(now.getDate() - diff);
    const ming = new Date(sen); ming.setDate(sen.getDate() + 6);
    return { dari: fmt(sen), sampai: fmt(ming) };
  }
  return { dari: '', sampai: '' };
}

async function applyFilter(mode) {
  // Update UI tombol
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${mode}`)?.classList.add('active');

  state.filter.mode = mode;

  if (mode === 'semua') {
    // Restore poin total dari base data
    ['kecil','tengah','besar'].forEach(k => { state[k] = []; });
    state._baseSiswa.forEach(s => state[s.kelas].push({ ...s }));
    renderCurrent();
    return;
  }

  // Fetch log sesuai range
  const { dari, sampai } = getFilterRange(mode);
  showLoading('Memfilter data...');
  try {
    const params = new URLSearchParams({ action: 'getPoinLog', dari, sampai });
    const res  = await fetch(`${APPS_SCRIPT_URL}?${params}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    // Aggregate poin dari log per ID
    const poinMap = {};
    (data.result || []).forEach(r => {
      const id    = r[1];
      const delta = parseInt(r[4]) || 0;
      poinMap[id] = (poinMap[id] || 0) + delta;
    });

    // Update state dengan poin dari periode ini
    ['kecil','tengah','besar'].forEach(k => { state[k] = []; });
    state._baseSiswa.forEach(s => {
      state[s.kelas].push({ ...s, poin: poinMap[s.id] || 0 });
    });

    hideLoading();
    renderCurrent();
  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }
}

/* ============================================================
   TABS
   ============================================================ */
function switchPoinTab(kelas) {
  ['semua', 'kecil', 'tengah', 'besar'].forEach(k => {
    document.getElementById(`ptab-${k}`).classList.remove('active');
  });
  document.getElementById(`ptab-${kelas}`).classList.add('active');
  state.activeKelas = kelas;
  renderCurrent();
}

/* ============================================================
   RENDER PANEL
   ============================================================ */
function renderPanel(kelas) {
  const panel = document.getElementById('poin-panel');
  const siswa = [...state[kelas]].sort((a, b) => b.poin - a.poin);
  const kelasLabel = { kecil: 'Kelas Kecil', tengah: 'Kelas Tengah', besar: 'Kelas Besar' }[kelas];
  const kelasIcon  = { kecil: '🐣', tengah: '🌿', besar: '⭐' }[kelas];

  if (!siswa.length) {
    panel.innerHTML = `
      <div class="panel-card">
        <div class="poin-panel-header">
          <div class="panel-badge ${kelas}-badge">${kelasIcon}</div>
          <div><h2>${kelasLabel}</h2><p>Papan Peringkat</p></div>
          <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
        </div>
        <div class="empty-state">
          <div class="empty-icon">🏅</div>
          <p>Belum ada anak di kelas ini.</p>
        </div>
      </div>`;
    return;
  }

  const maxPoin = siswa[0].poin || 1;

  const cards = siswa.map((stu, i) => {
    const rank = i + 1;
    const pct  = maxPoin > 0 ? Math.round((stu.poin / maxPoin) * 100) : 0;
    const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const initial = stu.nama.trim().charAt(0).toUpperCase();
    return `
      <div class="poin-card" onclick="openPoinModal('${stu.id}', '${escapeAttr(stu.nama)}', '${kelas}', ${stu.poin})"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')openPoinModal('${stu.id}', '${escapeAttr(stu.nama)}', '${kelas}', ${stu.poin})">
        <div class="poin-rank">${rankBadge}</div>
        <div class="poin-avatar">${initial}</div>
        <div class="poin-info">
          <div class="poin-nama">${escapeHtml(stu.nama)}</div>
          <div class="poin-bar-wrap">
            <div class="poin-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="poin-score">
          <span class="poin-angka">${stu.poin}</span>
          <span class="poin-label-pts">poin</span>
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <div class="poin-panel-header">
        <div class="panel-badge ${kelas}-badge">${kelasIcon}</div>
        <div>
          <h2>${kelasLabel}</h2>
          <p>Papan Peringkat · ${siswa.length} anak</p>
        </div>
        <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
      </div>
      <div class="poin-list">${cards}</div>
    </div>`;
}

/* ============================================================
   HELP MODAL POIN
   ============================================================ */
function openPoinHelp() {
  document.getElementById('poinHelpModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closePoinHelp() {
  document.getElementById('poinHelpModal').classList.remove('show');
  document.body.style.overflow = '';
}
function switchPoinHelp(panel, btn) {
  document.querySelectorAll('#poinHelpModal .help-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#poinHelpModal .help-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`phelp-${panel}`).classList.add('active');
  btn.classList.add('active');
}

/* ============================================================
   FILTER BAR
   ============================================================ */
function renderFilter() {
  // Inject filter bar ke DOM kalau belum ada
  if (document.getElementById('filterBar')) return;
  const bar = document.createElement('div');
  bar.id = 'filterBar';
  bar.className = 'filter-bar';
  bar.innerHTML = `
    <span class="filter-label">Periode:</span>
    <button class="filter-btn active" id="filter-semua" onclick="applyFilter('semua')">Semua</button>
    <button class="filter-btn" id="filter-tahun"  onclick="applyFilter('tahun')">Tahun Ini</button>
    <button class="filter-btn" id="filter-bulan"  onclick="applyFilter('bulan')">Bulan Ini</button>
    <button class="filter-btn" id="filter-minggu" onclick="applyFilter('minggu')">Minggu Ini</button>
  `;
  // Sisipkan sebelum poin-panel
  const panel = document.getElementById('poin-panel');
  panel.parentNode.insertBefore(bar, panel);
}

/* ============================================================
   RENDER PANEL SEMUA KELAS
   ============================================================ */
function renderPanelSemua() {
  const panel = document.getElementById('poin-panel');

  // Gabung semua siswa dari semua kelas, tandai kelasnya
  const semua = [
    ...state.kecil.map(s  => ({ ...s, kelas: 'kecil'  })),
    ...state.tengah.map(s => ({ ...s, kelas: 'tengah' })),
    ...state.besar.map(s  => ({ ...s, kelas: 'besar'  })),
  ].sort((a, b) => b.poin - a.poin);

  if (!semua.length) {
    panel.innerHTML = `
      <div class="panel-card">
        <div class="poin-panel-header">
          <div class="panel-badge" style="background:linear-gradient(145deg,#D4A017,#F0C842);font-size:1.4rem">🏆</div>
          <div><h2>Papan Peringkat Global</h2><p>Semua Kelas</p></div>
          <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
        </div>
        <div class="empty-state"><div class="empty-icon">🏅</div><p>Belum ada data poin.</p></div>
      </div>`;
    return;
  }

  const maxPoin   = semua[0].poin || 1;
  const kelasInfo = {
    kecil:  { label: 'Kecil',  icon: '🐣', color: '#E8A87C' },
    tengah: { label: 'Tengah', icon: '🌿', color: '#7CB87C' },
    besar:  { label: 'Besar',  icon: '⭐', color: '#D4A017' },
  };

  const cards = semua.map((stu, i) => {
    const rank      = i + 1;
    const pct       = maxPoin > 0 ? Math.round((stu.poin / maxPoin) * 100) : 0;
    const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const ki        = kelasInfo[stu.kelas];
    const initial   = stu.nama.trim().charAt(0).toUpperCase();
    return `
      <div class="poin-card poin-card-global" onclick="openPoinModal('${stu.id}','${escapeAttr(stu.nama)}','${stu.kelas}',${stu.poin})"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')openPoinModal('${stu.id}','${escapeAttr(stu.nama)}','${stu.kelas}',${stu.poin})">
        <div class="poin-rank">${rankBadge}</div>
        <div class="poin-avatar">${initial}</div>
        <div class="poin-info">
          <div class="poin-nama">${escapeHtml(stu.nama)}</div>
          <div class="poin-kelas-badge" style="background:${ki.color}22;color:${ki.color};border-color:${ki.color}44">
            ${ki.icon} ${ki.label}
          </div>
          <div class="poin-bar-wrap" style="margin-top:5px">
            <div class="poin-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="poin-score">
          <span class="poin-angka">${stu.poin}</span>
          <span class="poin-label-pts">poin</span>
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="panel-card">
      <div class="poin-panel-header">
        <div class="panel-badge" style="background:linear-gradient(145deg,#D4A017,#F0C842);font-size:1.4rem;color:white">🏆</div>
        <div>
          <h2>Papan Peringkat Global</h2>
          <p>Semua Kelas · ${semua.length} anak</p>
        </div>
        <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
      </div>
      <div class="poin-list">${cards}</div>
    </div>`;
}

/* ============================================================
   MODAL POIN
   ============================================================ */
function openPoinModal(id, nama, kelas, poin) {
  state.modal = { id, nama, kelas, poin, selected: [] };
  document.getElementById('poinModal-avatar').textContent = nama.charAt(0).toUpperCase();
  document.getElementById('poinModal-nama').textContent   = nama;
  document.getElementById('poinModal-total').textContent  = poin;
  renderAktivitasGrid();
  updateSubmitBar();
  document.getElementById('poinModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function renderAktivitasGrid() {
  const grid = document.getElementById('aktivitasGrid');
  grid.innerHTML = state.aktivitas.map(a => {
    const sel = state.modal.selected.includes(a.id);
    return `
    <button class="aktivitas-btn ${sel ? 'selected' : ''}" onclick="toggleAktivitas('${a.id}')">
      <span class="aktivitas-icon">${a.icon}</span>
      <span class="aktivitas-label">${escapeHtml(a.label)}</span>
      <span class="aktivitas-poin">+1</span>
    </button>`;
  }).join('');
  grid.innerHTML += `
    <button class="aktivitas-btn aktivitas-add-btn" onclick="openAddAktivitas()">
      <span class="aktivitas-icon">＋</span>
      <span class="aktivitas-label">Tambah Aktivitas</span>
    </button>`;
}

function toggleAktivitas(id) {
  const idx = state.modal.selected.indexOf(id);
  if (idx === -1) state.modal.selected.push(id);
  else            state.modal.selected.splice(idx, 1);
  renderAktivitasGrid();
  updateSubmitBar();
}

function updateSubmitBar() {
  const bar   = document.getElementById('poinSubmitBar');
  const count = document.getElementById('poinSubmitCount');
  const total = state.modal.selected.length;
  bar.classList.toggle('visible', total > 0);
  count.textContent = total;
}

function closePoinModal() {
  document.getElementById('poinModal').classList.remove('show');
  document.body.style.overflow = '';
}

async function submitAktivitasPoin() {
  const { id, nama, kelas, selected } = state.modal;
  if (!selected.length) return;
  const delta  = selected.length;
  const labels = selected.map(sid => {
    const a = state.aktivitas.find(x => x.id === sid);
    return a ? a.label : sid;
  }).join(', ');
  await simpanPoinDelta(id, nama, kelas, delta, labels);
}

async function simpanPoinDelta(id, nama, kelas, delta, label) {
  closePoinModal();
  showLoading('Menyimpan poin...');
  try {
    const payload = encodeURIComponent(JSON.stringify({ id, nama, kelas, delta }));
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=tambahPoin&data=${payload}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    // Update state lokal
    const stu  = state[kelas].find(s => s.id === id);
    const base = (state._baseSiswa || []).find(s => s.id === id);
    if (stu)  stu.poin  += delta;
    if (base) base.poin += delta;
    hideLoading();
    showToast(`⭐ +${delta} poin untuk ${nama} (${label})`, 'success');
    renderCurrent();
  } catch (err) {
    hideLoading();
    showToast('❌ Gagal simpan: ' + err.message, 'error');
  }
}

/* ============================================================
   TAMBAH AKTIVITAS CUSTOM
   ============================================================ */
function openAddAktivitas() {
  // Tutup modal poin dulu, buka modal form
  document.getElementById('poinModal').classList.remove('show');
  document.getElementById('addAktModal').classList.add('show');
  document.getElementById('newAktNama').value  = '';
  document.getElementById('newAktIcon').value  = '🌟';
  setTimeout(() => document.getElementById('newAktNama').focus(), 100);
}

function closeAddAktModal() {
  document.getElementById('addAktModal').classList.remove('show');
  // Buka kembali modal poin
  document.getElementById('poinModal').classList.add('show');
}

function pickIcon(emoji) {
  const inp = document.getElementById('newAktIcon');
  inp.value = '';           // kosongkan dulu biar maxlength ga blokir
  inp.removeAttribute('maxlength');
  inp.value = emoji;
}

function saveNewAktivitas() {
  const nama = document.getElementById('newAktNama').value.trim();
  const icon = document.getElementById('newAktIcon').value.trim() || '🌟';
  if (!nama) {
    document.getElementById('newAktNama').focus();
    document.getElementById('newAktNama').style.borderColor = 'var(--maroon)';
    return;
  }
  document.getElementById('addAktModal').classList.remove('show');
  document.body.style.overflow = 'hidden'; // poin modal masih open
  saveAktivitasCustom(nama, icon);
}

async function saveAktivitasCustom(namaAkt, icon) {
  showLoading('Menyimpan aktivitas...');
  try {
    const payload = encodeURIComponent(JSON.stringify({ nama: namaAkt, icon, poin: 1 }));
    await fetch(`${APPS_SCRIPT_URL}?action=tambahAktivitas&data=${payload}`, { mode: 'no-cors' });

    state.aktivitas.push({
      id: `custom_${namaAkt}`, label: namaAkt, icon, poin: 1,
    });
    hideLoading();
    showToast(`✅ Aktivitas "${namaAkt}" ditambahkan!`, 'success');
    // Re-render grid di modal poin yang sudah terbuka
    renderAktivitasGrid();
  } catch (err) {
    hideLoading();
    showToast('⚠️ Gagal simpan aktivitas', 'error');
  }
}

/* ============================================================
   RESET POIN
   ============================================================ */
function openResetModal() {
  const tahun = new Date().getFullYear();
  document.getElementById('resetModal-tahun').textContent = tahun;
  document.getElementById('resetModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeResetModal() {
  document.getElementById('resetModal').classList.remove('show');
  document.body.style.overflow = '';
}

async function doResetPoin() {
  closeResetModal();
  showLoading('Mereset poin...');
  try {
    const tahun = new Date().getFullYear();
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=resetPoin&tahun=${tahun}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    // Reset state lokal
    ['kecil', 'tengah', 'besar'].forEach(k => {
      state[k].forEach(s => { s.poin = 0; });
    });
    hideLoading();
    showToast('✅ Semua poin berhasil direset!', 'success');
    renderCurrent();
  } catch (err) {
    hideLoading();
    showToast('❌ Gagal reset: ' + err.message, 'error');
  }
}

/* ============================================================
   UTILS (sama seperti di app.js)
   ============================================================ */
function showLoading(msg = 'Memuat...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast show${type ? ' toast-' + type : ''}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}