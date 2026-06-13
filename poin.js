/* ============================================================
   BELOVED KIDS CITO — Sistem Poin
   ============================================================ */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4AIeYtaSwb4q-2zWoELwer5R81k7qDkfFjSg8Uzt1iQ9r7Xs6jGS5RGEJhreTAWizOg/exec';

// ── Aktivitas default & nilainya ─────────────────────────────
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
  aktivitas: [],
  searchQuery: '',
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

    state._baseSiswa = [];
    ['kecil', 'tengah', 'besar'].forEach(k => { state[k] = []; });
    (siswData.result || []).forEach(r => {
      const nama    = (r[0] || '').trim();
      const kelas   = (r[1] || '').trim().toLowerCase();
      const id      = (r[2] || '').trim();
      const poin    = parseInt(r[3]) || 0;
      const fotoUrl = (r[4] || '').trim() || null;
      if (nama && ['kecil', 'tengah', 'besar'].includes(kelas)) {
        state[kelas].push({ id, nama, poin, fotoUrl });
        state._baseSiswa.push({ id, nama, kelas, poin, fotoUrl });
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

/* ============================================================
   LIVE SEARCH
   ============================================================ */
function applySearch(q) {
  state.searchQuery = q.trim().toLowerCase();
  const clearBtn = document.getElementById('poinSearchClear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.searchQuery);
  renderCurrent();
}

function clearSearch() {
  state.searchQuery = '';
  const input    = document.getElementById('poinSearchInput');
  const clearBtn = document.getElementById('poinSearchClear');
  if (input)    input.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  renderCurrent();
  if (input) input.focus();
}

/* Filter siswa berdasarkan query — dipanggil setiap render */
function filterBySearch(list) {
  if (!state.searchQuery) return list;
  return list.filter(s =>
    s.nama.toLowerCase().includes(state.searchQuery)
  );
}

function renderCurrent() {
  if (state.activeKelas === 'semua') renderPanelSemua();
  else renderPanel(state.activeKelas);
}

function getFilterRange(mode) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

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
    const day  = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const sen  = new Date(now); sen.setDate(now.getDate() - diff);
    const ming = new Date(sen); ming.setDate(sen.getDate() + 6);
    return { dari: fmt(sen), sampai: fmt(ming) };
  }
  return { dari: '', sampai: '' };
}

async function applyFilter(mode) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${mode}`)?.classList.add('active');
  state.filter.mode = mode;

  if (mode === 'semua') {
    ['kecil','tengah','besar'].forEach(k => { state[k] = []; });
    state._baseSiswa.forEach(s => state[s.kelas].push({ ...s }));
    renderCurrent();
    return;
  }

  const { dari, sampai } = getFilterRange(mode);
  showLoading('Memfilter data...');
  try {
    const params = new URLSearchParams({ action: 'getPoinLog', dari, sampai });
    const res  = await fetch(`${APPS_SCRIPT_URL}?${params}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    const poinMap = {};
    (data.result || []).forEach(r => {
      const id    = r[1];
      const delta = parseInt(r[4]) || 0;
      poinMap[id] = (poinMap[id] || 0) + delta;
    });

    ['kecil','tengah','besar'].forEach(k => { state[k] = []; });
    state._baseSiswa.forEach(s => {
      state[s.kelas].push({ ...s, poin: poinMap[s.id] || 0, fotoUrl: s.fotoUrl });
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
  // Reset search saat pindah tab supaya tidak bingung
  clearSearch();
}

/* ============================================================
   RENDER PANEL
   ============================================================ */
function renderPanel(kelas) {
  const panel = document.getElementById('poin-panel');
  const semua = [...state[kelas]].sort((a, b) => b.poin - a.poin);
  const siswa = filterBySearch(semua);
  const kelasLabel = { kecil: 'Kelas Kecil', tengah: 'Kelas Tengah', besar: 'Kelas Besar' }[kelas];
  const kelasIcon  = { kecil: '🐣', tengah: '🌿', besar: '⭐' }[kelas];

  if (!semua.length) {
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

  if (!siswa.length) {
    panel.innerHTML = `
      <div class="panel-card">
        <div class="poin-panel-header">
          <div class="panel-badge ${kelas}-badge">${kelasIcon}</div>
          <div><h2>${kelasLabel}</h2><p>Papan Peringkat</p></div>
          <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
        </div>
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Tidak ada anak yang cocok dengan "<strong>${escapeHtml(state.searchQuery)}</strong>"</p>
        </div>
      </div>`;
    return;
  }

  const maxPoin = semua[0].poin || 1;

  const cards = siswa.map((stu, i) => {
    // rank tetap berdasarkan posisi global (semua), bukan hasil filter
    const globalRank = semua.findIndex(s => s.id === stu.id) + 1;
    const pct        = maxPoin > 0 ? Math.round((stu.poin / maxPoin) * 100) : 0;
    const rankBadge  = globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : globalRank === 3 ? '🥉' : `#${globalRank}`;
    const initial    = stu.nama.trim().charAt(0).toUpperCase();
    const avatarHtml = stu.fotoUrl
      ? `<img src="${driveProxyUrl(stu.fotoUrl)}" alt="" class="poin-avatar-img" onerror="this.parentElement.innerHTML='${initial}'"/>`
      : initial;
    return `
      <div class="poin-card" onclick="openPoinModal('${stu.id}', '${escapeAttr(stu.nama)}', '${kelas}', ${stu.poin}, '${escapeAttr(stu.fotoUrl || '')}')"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')openPoinModal('${stu.id}', '${escapeAttr(stu.nama)}', '${kelas}', ${stu.poin}, '${escapeAttr(stu.fotoUrl || '')}')">
        <div class="poin-rank">${rankBadge}</div>
        <div class="poin-avatar${stu.fotoUrl ? ' has-foto' : ''}">${avatarHtml}</div>
        <div class="poin-info">
          <div class="poin-nama">${highlightMatch(stu.nama, state.searchQuery)}</div>
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

  const subtitle = state.searchQuery
    ? `${siswa.length} dari ${semua.length} anak`
    : `Papan Peringkat · ${semua.length} anak`;

  panel.innerHTML = `
    <div class="panel-card">
      <div class="poin-panel-header">
        <div class="panel-badge ${kelas}-badge">${kelasIcon}</div>
        <div>
          <h2>${kelasLabel}</h2>
          <p>${subtitle}</p>
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
  const panel = document.getElementById('poin-panel');
  panel.parentNode.insertBefore(bar, panel);
  // Init filter state
  if (!state.filter) state.filter = { mode: 'semua' };
}

/* ============================================================
   RENDER PANEL SEMUA KELAS
   ============================================================ */
function renderPanelSemua() {
  const panel = document.getElementById('poin-panel');

  const semuaRaw = [
    ...state.kecil.map(s  => ({ ...s, kelas: 'kecil'  })),
    ...state.tengah.map(s => ({ ...s, kelas: 'tengah' })),
    ...state.besar.map(s  => ({ ...s, kelas: 'besar'  })),
  ].sort((a, b) => b.poin - a.poin);

  const semua = filterBySearch(semuaRaw);

  if (!semuaRaw.length) {
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

  if (!semua.length) {
    panel.innerHTML = `
      <div class="panel-card">
        <div class="poin-panel-header">
          <div class="panel-badge" style="background:linear-gradient(145deg,#D4A017,#F0C842);font-size:1.4rem">🏆</div>
          <div><h2>Papan Peringkat Global</h2><p>Semua Kelas</p></div>
          <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
        </div>
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Tidak ada anak yang cocok dengan "<strong>${escapeHtml(state.searchQuery)}</strong>"</p>
        </div>
      </div>`;
    return;
  }

  const maxPoin   = semuaRaw[0].poin || 1;
  const kelasInfo = {
    kecil:  { label: 'Kecil',  icon: '🐣', color: '#E8A87C' },
    tengah: { label: 'Tengah', icon: '🌿', color: '#7CB87C' },
    besar:  { label: 'Besar',  icon: '⭐', color: '#D4A017' },
  };

  const cards = semua.map((stu) => {
    const globalRank = semuaRaw.findIndex(s => s.id === stu.id) + 1;
    const pct        = maxPoin > 0 ? Math.round((stu.poin / maxPoin) * 100) : 0;
    const rankBadge  = globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : globalRank === 3 ? '🥉' : `#${globalRank}`;
    const ki         = kelasInfo[stu.kelas];
    const initial    = stu.nama.trim().charAt(0).toUpperCase();
    const avatarHtml = stu.fotoUrl
      ? `<img src="${driveProxyUrl(stu.fotoUrl)}" alt="" class="poin-avatar-img" onerror="this.parentElement.innerHTML='${initial}'"/>`
      : initial;
    return `
      <div class="poin-card poin-card-global" onclick="openPoinModal('${stu.id}','${escapeAttr(stu.nama)}','${stu.kelas}',${stu.poin},'${escapeAttr(stu.fotoUrl || '')}')"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')openPoinModal('${stu.id}','${escapeAttr(stu.nama)}','${stu.kelas}',${stu.poin},'${escapeAttr(stu.fotoUrl || '')}')">
        <div class="poin-rank">${rankBadge}</div>
        <div class="poin-avatar${stu.fotoUrl ? ' has-foto' : ''}">${avatarHtml}</div>
        <div class="poin-info">
          <div class="poin-nama">${highlightMatch(stu.nama, state.searchQuery)}</div>
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

  const subtitle = state.searchQuery
    ? `${semua.length} dari ${semuaRaw.length} anak`
    : `Semua Kelas · ${semuaRaw.length} anak`;

  panel.innerHTML = `
    <div class="panel-card">
      <div class="poin-panel-header">
        <div class="panel-badge" style="background:linear-gradient(145deg,#D4A017,#F0C842);font-size:1.4rem;color:white">🏆</div>
        <div>
          <h2>Papan Peringkat Global</h2>
          <p>${subtitle}</p>
        </div>
        <button class="poin-reset-btn" onclick="openResetModal()">🔄 Reset Tahun</button>
      </div>
      <div class="poin-list">${cards}</div>
    </div>`;
}

/* ============================================================
   MODAL POIN
   ============================================================ */
function openPoinModal(id, nama, kelas, poin, fotoUrl) {
  state.modal = { id, nama, kelas, poin, selected: [] };

  const avatarEl = document.getElementById('poinModal-avatar');
  const initial  = nama.charAt(0).toUpperCase();
  if (fotoUrl) {
    avatarEl.innerHTML = `<img src="${driveProxyUrl(fotoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent='${initial}'"/>`;
    avatarEl.classList.add('has-foto');
  } else {
    avatarEl.textContent = initial;
    avatarEl.classList.remove('has-foto');
  }

  document.getElementById('poinModal-nama').textContent  = nama;
  document.getElementById('poinModal-total').textContent = poin;
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
  document.getElementById('poinModal').classList.remove('show');
  document.getElementById('addAktModal').classList.add('show');
  document.getElementById('newAktNama').value = '';
  document.getElementById('newAktIcon').value = '🌟';
  setTimeout(() => document.getElementById('newAktNama').focus(), 100);
}

function closeAddAktModal() {
  document.getElementById('addAktModal').classList.remove('show');
  document.getElementById('poinModal').classList.add('show');
}

function pickIcon(emoji) {
  const inp = document.getElementById('newAktIcon');
  inp.value = '';
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
  document.body.style.overflow = 'hidden';
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
   UTILS
   ============================================================ */
const _poinLoadingEmojis = ['🏅','🌟','🏆','🙏','💛','🎉'];
const _poinLoadingSubs = [
  'Bentar ya, lagi ngambil data poin...',
  'Konek ke Google Sheets...',
  'Hampir selesai nih!',
];
let _poinEmojiIdx   = 0;
let _poinEmojiTimer = null;

function showLoading(msg = 'Memuat...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.add('show');
  _poinEmojiIdx = 0;
  const emojiEl = document.getElementById('loadingEmoji');
  const subEl   = document.getElementById('loadingSub');
  if (emojiEl) emojiEl.textContent = _poinLoadingEmojis[0];
  if (subEl)   subEl.textContent   = _poinLoadingSubs[0];
  _poinEmojiTimer = setInterval(() => {
    _poinEmojiIdx = (_poinEmojiIdx + 1) % _poinLoadingEmojis.length;
    if (emojiEl) {
      emojiEl.style.animation = 'none';
      emojiEl.textContent = _poinLoadingEmojis[_poinEmojiIdx];
      void emojiEl.offsetWidth;
      emojiEl.style.animation = '';
    }
    if (subEl) subEl.textContent = _poinLoadingSubs[Math.min(_poinEmojiIdx, _poinLoadingSubs.length - 1)];
  }, 1200);
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
  clearInterval(_poinEmojiTimer);
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

/* Highlight bagian nama yang cocok dengan query pencarian */
function highlightMatch(nama, query) {
  if (!query) return escapeHtml(nama);
  const escaped = escapeHtml(nama);
  const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(
    new RegExp(`(${escapedQ})`, 'gi'),
    '<mark class="poin-search-hl">$1</mark>'
  );
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* Google Drive / GitHub thumbnail proxy */
function driveProxyUrl(url) {
  if (!url) return '';
  // GitHub raw URLs — langsung bisa dipakai di <img src>
  if (url.includes('raw.githubusercontent.com')) return url;
  // Legacy Google Drive — konversi ke lh3 proxy
  if (url.includes('drive.google.com')) {
    const m1 = url.match(/[?&]id=([^&]+)/);
    if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}=s80`;
    const m2 = url.match(/\/d\/([^/?&#]+)/);
    if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=s80`;
  }
  return url;
}

/* ============================================================
   SEARCH CSS — injected at runtime if poin.css is missing
   (in production, these styles live in poin.css)
   ============================================================ */
(function injectSearchStyles() {
  if (document.getElementById('poin-search-styles')) return;
  const style = document.createElement('style');
  style.id = 'poin-search-styles';
  style.textContent = `
    .poin-search-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--white, #FBF6F3);
      border: 1.5px solid rgba(123,17,32,0.12);
      border-radius: 14px;
      padding: 10px 14px;
      margin: 0 0 12px;
      max-width: 740px;
      margin-left: auto;
      margin-right: auto;
      box-shadow: 0 2px 10px rgba(74,10,19,0.05);
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .poin-search-wrap:focus-within {
      border-color: rgba(123,17,32,0.40);
      box-shadow: 0 0 0 4px rgba(123,17,32,0.07);
    }
    .poin-search-icon { font-size: 1rem; flex-shrink: 0; opacity: 0.5; }
    .poin-search-input {
      flex: 1;
      border: none;
      background: transparent;
      font-family: var(--font-body, 'Nunito', sans-serif);
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text, #2C1810);
      outline: none;
      min-width: 0;
    }
    .poin-search-input::placeholder { color: var(--text-muted, #A07060); font-weight: 600; }
    .poin-search-clear {
      width: 26px; height: 26px;
      border: none;
      background: rgba(123,17,32,0.08);
      border-radius: 50%;
      font-size: 0.7rem;
      color: var(--text-mid, #6B3A2A);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.12s;
    }
    .poin-search-clear:hover  { background: rgba(123,17,32,0.16); }
    .poin-search-clear:active { transform: scale(0.88); }
    .poin-search-clear.hidden { display: none; }
    mark.poin-search-hl {
      background: rgba(212,160,23,0.30);
      color: inherit;
      border-radius: 3px;
      padding: 0 1px;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);
})();