/* ============================================================
   BELOVED KIDS CITO — App Logic
   ============================================================ */

const CONFIG = {
  SPREADSHEET_ID:  '1tefD06Vf_bBY01BAcWHHas05jUJPmpTStjyh5RGngJY',
  API_KEY:         'AIzaSyBZhVefbJgkvZerFaiBhTvQM2aPtyMAbFQ',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw4AIeYtaSwb4q-2zWoELwer5R81k7qDkfFjSg8Uzt1iQ9r7Xs6jGS5RGEJhreTAWizOg/exec',
  SHEET_ABSENSI:   'Absensi',
  SHEET_SISWA:     'Siswa',
};

const state = {
  kecil:     { students: [], attendance: {} },
  tengah:    { students: [], attendance: {} },
  besar:     { students: [], attendance: {} },
  rekapData: [],
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  ['kecil','tengah','besar'].forEach(k => localStorage.removeItem(`siswa-${k}`));

  const today = new Date().toISOString().split('T')[0];
  ['kecil','tengah','besar'].forEach(k => {
    document.getElementById(`date-${k}`).value = today;
  });

  document.getElementById('headerDate').textContent =
    new Date().toLocaleDateString('id-ID', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    }).toUpperCase();

  populateBulanDropdown();
  loadSiswa();
  switchTab('kecil');
});

function populateBulanDropdown() {
  const sel = document.getElementById('rekap-bulan');
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('id-ID', { month:'long', year:'numeric' });
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = lbl;
    sel.appendChild(opt);
  }
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(tab) {
  ['kecil','tengah','besar','rekap'].forEach(t => {
    document.getElementById(`panel-${t}`).classList.remove('active');
    const btn = document.getElementById(`tab-${t}`);
    btn.classList.remove('active');
    btn.setAttribute('aria-selected','false');
  });
  document.getElementById(`panel-${tab}`).classList.add('active');
  const activeBtn = document.getElementById(`tab-${tab}`);
  activeBtn.classList.add('active');
  activeBtn.setAttribute('aria-selected','true');

  // Scroll to top smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   LOAD SISWA
   ============================================================ */
async function loadSiswa() {
  showLoading('Memuat daftar anak...');
  try {
    const range = `${CONFIG.SHEET_SISWA}!A2:C1000`;
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
    const res   = await fetch(url);
    const data  = await res.json();

    if (data.error) throw new Error(`${data.error.code}: ${data.error.message}`);

    ['kecil','tengah','besar'].forEach(k => { state[k].students = []; });

    (data.values || []).forEach((row, i) => {
      const nama  = (row[0]||'').trim();
      const kelas = (row[1]||'').trim().toLowerCase();
      const id    = (row[2]||'').trim() || `${kelas}_${i}`;
      if (nama && ['kecil','tengah','besar'].includes(kelas)) {
        state[kelas].students.push({ id, nama });
      }
    });

    ['kecil','tengah','besar'].forEach(renderStudents);

    // Show hint bar setelah siswa ada
    const hasStudents = ['kecil','tengah','besar'].some(k => state[k].students.length > 0);
    if (hasStudents) document.getElementById('hint-bar').classList.add('visible');

    hideLoading();
  } catch (err) {
    hideLoading();
    console.error('[loadSiswa]', err.message);
    showToast(`❌ ${err.message}`, 'error');
    ['kecil','tengah','besar'].forEach(renderStudents);
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function renderStudents(kelas) {
  const listEl = document.getElementById(`list-${kelas}`);
  const hintEl = document.getElementById(`hint-${kelas}`);
  const s      = state[kelas];

  const hadir = Object.values(s.attendance).filter(Boolean).length;
  const total = s.students.length;
  const pct   = total > 0 ? Math.round((hadir/total)*100) : 0;

  // Update live counter
  if (hintEl && total > 0) {
    hintEl.textContent = `${hadir} dari ${total} anak hadir`;
  } else if (hintEl) {
    hintEl.textContent = '';
  }

  // Update progress bar
  const progressWrap = document.getElementById(`progress-wrap-${kelas}`);
  const progressFill = document.getElementById(`progress-fill-${kelas}`);
  const progressText = document.getElementById(`progress-text-${kelas}`);
  if (progressWrap) {
    progressWrap.style.display = total > 0 ? 'block' : 'none';
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${hadir} / ${total} (${pct}%)`;
  }

  if (!total) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👼</div>
        <p>Belum ada anak.<br>Tambah nama di atas atau<br>isi langsung di sheet <strong>Siswa</strong>.</p>
      </div>`;
    updateSummary(kelas);
    return;
  }

  listEl.innerHTML = s.students.map((stu, i) => {
    const isHadir = !!s.attendance[stu.id];
    const initial = stu.nama.trim().charAt(0).toUpperCase();
    return `
      <div class="student-item ${isHadir ? 'hadir' : ''}"
           onclick="toggleAttendance('${kelas}','${stu.id}')"
           role="button" tabindex="0"
           aria-label="${stu.nama} — ${isHadir ? 'Hadir' : 'Belum absen'}"
           onkeydown="if(event.key==='Enter'||event.key===' ')toggleAttendance('${kelas}','${stu.id}')">
        <div class="student-avatar" aria-hidden="true">${isHadir ? '✓' : initial}</div>
        <div class="student-name">${escapeHtml(stu.nama)}</div>
        <div class="student-status">${isHadir ? '✓ Hadir' : '— Absen'}</div>
        <button class="del-btn"
                onclick="event.stopPropagation();deleteStudent('${kelas}',${i})"
                aria-label="Hapus ${stu.nama}">✕</button>
      </div>`;
  }).join('');

  updateSummary(kelas);
}

/* ============================================================
   ATTENDANCE
   ============================================================ */
function toggleAttendance(kelas, id) {
  state[kelas].attendance[id] = !state[kelas].attendance[id];
  renderStudents(kelas);

  // Haptic feedback on mobile (supported on some devices)
  if (navigator.vibrate) navigator.vibrate(30);
}

function selectAll(kelas) {
  state[kelas].students.forEach(s => { state[kelas].attendance[s.id] = true; });
  renderStudents(kelas);
  showToast(`✅ Semua anak ditandai hadir!`, 'success');
}

function clearAll(kelas) {
  if (!Object.values(state[kelas].attendance).some(Boolean)) return;
  if (!confirm('Reset semua absensi kelas ini?')) return;
  state[kelas].attendance = {};
  renderStudents(kelas);
  showToast('✖ Absensi direset', '');
}

/* ============================================================
   TAMBAH / HAPUS SISWA
   ============================================================ */
async function addStudent(kelas) {
  const input = document.getElementById(`newName-${kelas}`);
  const nama  = input.value.trim();
  if (!nama) {
    input.focus();
    input.style.borderColor = 'var(--maroon-light)';
    setTimeout(() => input.style.borderColor = '', 1500);
    return;
  }

  const id = `${kelas}_${Date.now()}`;
  state[kelas].students.push({ id, nama });
  input.value = '';
  renderStudents(kelas);
  input.focus();

  // Show hint if first student
  document.getElementById('hint-bar').classList.add('visible');

  try {
    const payload = encodeURIComponent(JSON.stringify({ nama, kelas, id }));
    await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=tambahSiswa&data=${payload}`, { mode:'no-cors' });
    showToast(`✅ ${nama} ditambahkan!`, 'success');
  } catch(err) {
    showToast('⚠️ Gagal simpan ke Sheets', 'error');
  }
}

async function deleteStudent(kelas, idx) {
  const stu = state[kelas].students[idx];
  if (!confirm(`Hapus "${stu.nama}" dari daftar anak?`)) return;

  state[kelas].students.splice(idx, 1);
  delete state[kelas].attendance[stu.id];
  renderStudents(kelas);

  try {
    const payload = encodeURIComponent(JSON.stringify({ nama: stu.nama, kelas, id: stu.id }));
    await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=hapusSiswa&data=${payload}`, { mode:'no-cors' });
    showToast(`🗑 ${stu.nama} dihapus`, '');
  } catch(err) {
    showToast('⚠️ Gagal hapus dari Sheets', 'error');
  }
}

/* ============================================================
   SUMMARY
   ============================================================ */
function updateSummary(kelas) {
  const s     = state[kelas];
  const total = s.students.length;
  const hadir = Object.values(s.attendance).filter(Boolean).length;
  const absen = total - hadir;
  const pct   = total > 0 ? Math.round((hadir/total)*100) : 0;

  document.getElementById(`summary-${kelas}`).innerHTML = `
    <div class="summary-chip">Total <strong>${total}</strong></div>
    <div class="summary-chip">✅ Hadir <strong>${hadir}</strong></div>
    <div class="summary-chip">❌ Absen <strong>${absen}</strong></div>
    ${total > 0 ? `<div class="summary-chip">📊 <strong>${pct}%</strong></div>` : ''}
  `;
}

/* ============================================================
   SUBMIT ABSENSI
   ============================================================ */
async function submitAbsensi(kelas) {
  const s       = state[kelas];
  const tanggal = document.getElementById(`date-${kelas}`).value;
  const sesi    = document.getElementById(`sesi-${kelas}`).value;

  if (!tanggal)   { showToast('⚠️ Pilih tanggal dulu!', 'error'); return; }
  if (!s.students.length) { showToast('⚠️ Belum ada anak!', 'error'); return; }

  const hadir = Object.values(s.attendance).filter(Boolean).length;
  const total = s.students.length;

  // Konfirmasi kalau 0 yang hadir
  if (hadir === 0) {
    if (!confirm(`Semua ${total} anak ditandai Absen. Yakin simpan?`)) return;
  }

  const rows = s.students.map(stu => ({
    tanggal, sesi: `Sesi ${sesi}`, kelas,
    nama:   stu.nama,
    status: s.attendance[stu.id] ? 'Hadir' : 'Absen',
  }));

  showLoading(`Menyimpan absensi Kelas ${capitalize(kelas)} Sesi ${sesi}...`);
  try {
    const encoded = encodeURIComponent(JSON.stringify(rows));
    await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=absensi&data=${encoded}`, { mode:'no-cors' });
    hideLoading();
    showToast(`✅ Tersimpan! ${hadir}/${total} hadir — Sesi ${sesi}`, 'success');
    clearAll_silent(kelas);
  } catch(err) {
    hideLoading();
    showToast('❌ Gagal menyimpan, cek koneksi!', 'error');
  }
}

// clearAll tanpa confirm/toast (dipanggil setelah simpan)
function clearAll_silent(kelas) {
  state[kelas].attendance = {};
  renderStudents(kelas);
}

/* ============================================================
   REKAP
   ============================================================ */
async function loadRekap() {
  const bulan = document.getElementById('rekap-bulan').value;
  const sesi  = document.getElementById('rekap-sesi').value;
  if (!bulan) { showToast('⚠️ Pilih bulan dulu!', 'error'); return; }

  showLoading('Memuat rekap...');
  try {
    const range = `${CONFIG.SHEET_ABSENSI}!A2:F10000`;
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
    const res   = await fetch(url);
    const data  = await res.json();
    if (data.error) throw new Error(data.error.message);
    hideLoading();

    // rows: [tanggal, sesi, kelas, nama, status, timestamp]
    let rows = (data.values || []).filter(r => r[0] && r[0].startsWith(bulan));
    if (sesi) rows = rows.filter(r => r[1] === `Sesi ${sesi}`);
    state.rekapData = rows;
    renderRekap(rows, bulan, sesi);
  } catch(err) {
    hideLoading();
    showToast('❌ Gagal memuat: ' + err.message, 'error');
  }
}

function renderRekap(rows, bulan, sesi) {
  const content   = document.getElementById('rekap-content');
  const namaBulan = new Date(bulan+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  const sesiLabel = sesi ? ` · Sesi ${sesi}` : ' · Semua Sesi';

  if (!rows.length) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Tidak ada data untuk periode ini</p></div>`;
    return;
  }

  const byKelas = {
    kecil:{total:0,hadir:0},
    tengah:{total:0,hadir:0},
    besar:{total:0,hadir:0}
  };
  const byDate = {};

  rows.forEach(r => {
    const tgl    = r[0], sesiR = r[1]||'', kelas = (r[2]||'').toLowerCase(), status = r[4];
    if (byKelas[kelas]) {
      byKelas[kelas].total++;
      if (status==='Hadir') byKelas[kelas].hadir++;
    }
    const key = `${tgl}||${sesiR}`;
    if (!byDate[key]) byDate[key] = {tgl,sesi:sesiR,kecil:0,tengah:0,besar:0};
    if (status==='Hadir' && byDate[key][kelas]!==undefined) byDate[key][kelas]++;
  });

  const totalHadir = byKelas.kecil.hadir + byKelas.tengah.hadir + byKelas.besar.hadir;
  const totalAll   = byKelas.kecil.total + byKelas.tengah.total + byKelas.besar.total;

  const tableRows = Object.values(byDate)
    .sort((a,b)=>a.tgl.localeCompare(b.tgl)||a.sesi.localeCompare(b.sesi))
    .map(d=>`
      <tr>
        <td>${new Date(d.tgl).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'})}</td>
        <td><span class="sesi-badge">${d.sesi}</span></td>
        <td>${d.kecil}</td><td>${d.tengah}</td><td>${d.besar}</td>
        <td><strong>${d.kecil+d.tengah+d.besar}</strong></td>
      </tr>`).join('');

  content.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;font-weight:700;letter-spacing:0.3px">
      ${namaBulan.toUpperCase()}${sesiLabel} · Total hadir: <span style="color:var(--maroon)">${totalHadir}/${totalAll}</span>
    </p>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${byKelas.kecil.hadir}</div><div class="lbl">🐣 Kecil<br><small style="color:var(--text-muted)">${byKelas.kecil.total} total</small></div></div>
      <div class="stat-card"><div class="num">${byKelas.tengah.hadir}</div><div class="lbl">🌿 Tengah<br><small style="color:var(--text-muted)">${byKelas.tengah.total} total</small></div></div>
      <div class="stat-card"><div class="num">${byKelas.besar.hadir}</div><div class="lbl">⭐ Besar<br><small style="color:var(--text-muted)">${byKelas.besar.total} total</small></div></div>
    </div>
    <p class="rekap-section-title">📆 Per Tanggal & Sesi</p>
    <div class="rekap-table-wrap">
      <table class="rekap-table">
        <thead><tr><th>Tanggal</th><th>Sesi</th><th>🐣</th><th>🌿</th><th>⭐</th><th>Total</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   EXPORT MODAL
   ============================================================ */
function openExportModal() {
  if (!state.rekapData.length) { showToast('⚠️ Muat rekap dulu!','error'); return; }
  document.getElementById('exportModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeExportModal(e) {
  if (e && e.target !== document.getElementById('exportModal')) return;
  document.getElementById('exportModal').classList.remove('show');
  document.body.style.overflow = '';
}

/* ---- Helper: get label bulan aktif ---- */
function getExportMeta() {
  const bulan = document.getElementById('rekap-bulan').value;
  const sesi  = document.getElementById('rekap-sesi').value;
  const namaBulan = bulan
    ? new Date(bulan+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'})
    : 'Rekap';
  const sesiLabel = sesi ? `Sesi ${sesi}` : 'Semua Sesi';
  const filename  = `absensi_bkc_${bulan||new Date().toISOString().split('T')[0]}`;
  return { namaBulan, sesiLabel, filename };
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCSV() {
  closeExportModal();
  const { filename } = getExportMeta();
  const csv  = ['Tanggal,Sesi,Kelas,Nama,Status,Timestamp',
    ...state.rekapData.map(r=>r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  triggerDownload(URL.createObjectURL(blob), filename+'.csv');
  showToast('✅ CSV didownload!','success');
}

/* ============================================================
   EXPORT EXCEL
   ============================================================ */
function exportExcel() {
  closeExportModal();
  if (typeof XLSX === 'undefined') {
    showToast('⚠️ Library Excel belum siap, coba lagi','error'); return;
  }
  const { namaBulan, sesiLabel, filename } = getExportMeta();

  const wb = XLSX.utils.book_new();

  /* --- Sheet 1: Data mentah --- */
  const rawHeaders = ['Tanggal','Sesi','Kelas','Nama','Status','Timestamp'];
  const rawData    = [rawHeaders, ...state.rekapData];
  const wsRaw      = XLSX.utils.aoa_to_sheet(rawData);
  wsRaw['!cols']   = [14,10,10,24,10,20].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Data Absensi');

  /* --- Sheet 2: Ringkasan per tanggal --- */
  const byDate = {};
  state.rekapData.forEach(r => {
    const tgl=r[0],sesiR=r[1],kelas=(r[2]||'').toLowerCase(),status=r[4];
    const key=`${tgl}||${sesiR}`;
    if (!byDate[key]) byDate[key]={tgl,sesi:sesiR,kecil:0,tengah:0,besar:0};
    if (status==='Hadir' && byDate[key][kelas]!==undefined) byDate[key][kelas]++;
  });
  const summaryHeaders = ['Tanggal','Sesi','Kelas Kecil','Kelas Tengah','Kelas Besar','Total'];
  const summaryRows = Object.values(byDate)
    .sort((a,b)=>a.tgl.localeCompare(b.tgl))
    .map(d=>[d.tgl,d.sesi,d.kecil,d.tengah,d.besar,d.kecil+d.tengah+d.besar]);
  const wsSum   = XLSX.utils.aoa_to_sheet([summaryHeaders,...summaryRows]);
  wsSum['!cols'] = [14,10,14,14,14,10].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsSum, 'Ringkasan');

  XLSX.writeFile(wb, filename+'.xlsx');
  showToast('✅ Excel didownload!','success');
}

/* ============================================================
   EXPORT PDF (print)
   ============================================================ */
function exportPDF() {
  closeExportModal();
  const { namaBulan, sesiLabel } = getExportMeta();

  const byKelas={kecil:{total:0,hadir:0},tengah:{total:0,hadir:0},besar:{total:0,hadir:0}};
  const byDate={};
  state.rekapData.forEach(r=>{
    const tgl=r[0],sesiR=r[1]||'',kelas=(r[2]||'').toLowerCase(),status=r[4];
    if(byKelas[kelas]){byKelas[kelas].total++;if(status==='Hadir')byKelas[kelas].hadir++;}
    const key=`${tgl}||${sesiR}`;
    if(!byDate[key])byDate[key]={tgl,sesi:sesiR,kecil:0,tengah:0,besar:0};
    if(status==='Hadir'&&byDate[key][kelas]!==undefined)byDate[key][kelas]++;
  });

  const totalHadir=byKelas.kecil.hadir+byKelas.tengah.hadir+byKelas.besar.hadir;
  const totalAll=byKelas.kecil.total+byKelas.tengah.total+byKelas.besar.total;

  const tableRows=Object.values(byDate)
    .sort((a,b)=>a.tgl.localeCompare(b.tgl)||a.sesi.localeCompare(b.sesi))
    .map(d=>`<tr>
      <td>${new Date(d.tgl).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</td>
      <td>${d.sesi}</td><td>${d.kecil}</td><td>${d.tengah}</td><td>${d.besar}</td>
      <td><strong>${d.kecil+d.tengah+d.besar}</strong></td>
    </tr>`).join('');

  const printHTML=`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"/>
<title>Rekap Absensi — ${namaBulan}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#2C1810;padding:32px;font-size:13px}
  .pdf-header{display:flex;align-items:center;gap:16px;padding-bottom:20px;border-bottom:3px solid #7B1120;margin-bottom:24px}
  .pdf-logo{width:60px;height:60px;background:#7B1120;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:10px;text-align:center;line-height:1.3;padding:4px}
  .pdf-title{font-size:22px;font-weight:800;color:#4A0A13}
  .pdf-sub{font-size:12px;color:#888;margin-top:3px}
  .pdf-meta{font-size:11px;color:#7B1120;font-weight:700;margin-top:2px}
  .stat-row{display:flex;gap:12px;margin-bottom:24px}
  .stat-box{flex:1;border:1.5px solid #EDCCD0;border-radius:12px;padding:16px;text-align:center;background:#FFF4F5}
  .stat-num{font-size:28px;font-weight:800;color:#7B1120;line-height:1}
  .stat-lbl{font-size:11px;color:#888;margin-top:6px;font-weight:700}
  h3{font-size:13px;font-weight:800;color:#4A0A13;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.7px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#7B1120;color:white;padding:10px 12px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.5px}
  td{padding:10px 12px;border-bottom:1px solid #F0E4E4;color:#6B3A2A}
  td:first-child{color:#2C1810;font-weight:700}
  tr:nth-child(even) td{background:#FFF8F8}
  td strong{color:#7B1120}
  .footer{margin-top:28px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px}
  @media print{body{padding:16px}}
</style></head><body>
<div class="pdf-header">
  <div class="pdf-logo">Beloved Kids Cito</div>
  <div>
    <div class="pdf-title">Rekap Kehadiran</div>
    <div class="pdf-sub">Sistem Absensi Jemaat Anak — Beloved Kids Cito</div>
    <div class="pdf-meta">${namaBulan.toUpperCase()} · ${sesiLabel} · Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
  </div>
</div>
<div class="stat-row">
  <div class="stat-box"><div class="stat-num">${byKelas.kecil.hadir}<span style="font-size:16px;color:#bbb">/${byKelas.kecil.total}</span></div><div class="stat-lbl">🐣 Kelas Kecil</div></div>
  <div class="stat-box"><div class="stat-num">${byKelas.tengah.hadir}<span style="font-size:16px;color:#bbb">/${byKelas.tengah.total}</span></div><div class="stat-lbl">🌿 Kelas Tengah</div></div>
  <div class="stat-box"><div class="stat-num">${byKelas.besar.hadir}<span style="font-size:16px;color:#bbb">/${byKelas.besar.total}</span></div><div class="stat-lbl">⭐ Kelas Besar</div></div>
  <div class="stat-box"><div class="stat-num">${totalHadir}<span style="font-size:16px;color:#bbb">/${totalAll}</span></div><div class="stat-lbl">📊 Total Hadir</div></div>
</div>
<h3>Detail Per Tanggal & Sesi</h3>
<table>
  <thead><tr><th>Tanggal</th><th>Sesi</th><th>🐣 Kecil</th><th>🌿 Tengah</th><th>⭐ Besar</th><th>Total</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="footer">Beloved Kids Cito · Melayani dengan Kasih ♥</div>
</body></html>`;

  const win=window.open('','_blank','width=900,height=700');
  win.document.write(printHTML);
  win.document.close();
  win.onload=()=>{ win.focus(); win.print(); };
  showToast('📄 Halaman PDF siap dicetak!','success');
}

/* ---- Helper download ---- */
function triggerDownload(url, filename) {
  const a=Object.assign(document.createElement('a'),{href:url,download:filename});
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function showLoading(msg='Memuat...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

let toastTimer;
function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function capitalize(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
