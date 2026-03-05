/* ============================================================
   BELOVED KIDS CITO — App Logic
   ============================================================ */

// Satu-satunya config yang perlu ada di frontend.
// SPREADSHEET_ID dan API_KEY sudah dipindah ke Apps Script (server-side).
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4AIeYtaSwb4q-2zWoELwer5R81k7qDkfFjSg8Uzt1iQ9r7Xs6jGS5RGEJhreTAWizOg/exec';

const state = {
  kecil:     { students: [], attendance: {} },
  tengah:    { students: [], attendance: {} },
  besar:     { students: [], attendance: {} },
  rekapData: [],
};

/* ============================================================
   CONFIRM MODAL — reusable, gantiin semua confirm() browser
   showConfirm({ title, body, confirmLabel, confirmClass, onConfirm })
   ============================================================ */
function showConfirm({ title = '', body = '', confirmLabel = 'Ya, Lanjutkan', confirmClass = '', onConfirm }) {
  const modal       = document.getElementById('confirmModal');
  const titleEl     = document.getElementById('confirmModal-title');
  const bodyEl      = document.getElementById('confirmModal-body');
  const confirmBtn  = document.getElementById('confirmModal-ok');
  const cancelBtn   = document.getElementById('confirmModal-cancel');

  titleEl.textContent  = title;
  bodyEl.innerHTML     = body;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = `btn ${confirmClass || 'btn-primary'} confirm-btn-ok`;

  // Bersihkan listener lama
  const newOk = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newOk, confirmBtn);
  const newCancel = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

  newOk.textContent = confirmLabel;
  newOk.className   = `btn ${confirmClass || 'btn-primary'} confirm-btn-ok`;

  newOk.addEventListener('click', () => {
    closeConfirmModal();
    onConfirm();
  });
  newCancel.addEventListener('click', closeConfirmModal);

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('show');
  document.body.style.overflow = '';
}

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
  const dari   = document.getElementById('rekap-dari');
  const sampai = document.getElementById('rekap-sampai');
  if (!dari || !sampai) return;
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 24; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('id-ID', { month:'long', year:'numeric' });
    opts.push({ val, lbl });
  }
  [dari, sampai].forEach((sel, idx) => {
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = '— Pilih Bulan —';
    sel.appendChild(placeholder);
    opts.forEach(({ val, lbl }) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = lbl;
      sel.appendChild(opt);
    });
    // default: dari = bulan lalu, sampai = bulan ini
    if (opts.length) {
      sel.value = idx === 0
        ? (opts[1] ? opts[1].val : opts[0].val)  // dari = bulan lalu
        : opts[0].val;                             // sampai = bulan ini
    }
  });
}

// Helper: ambil nilai rekap-bulan (untuk export compatibility)
function _getRekapBulan() {
  const dari = document.getElementById('rekap-dari');
  return dari ? dari.value : '';
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
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=getSiswa`);
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || 'Gagal memuat data');

    ['kecil','tengah','besar'].forEach(k => { state[k].students = []; });

    (data.result || []).forEach(row => {
      const nama  = (row[0]||'').trim();
      const kelas = (row[1]||'').trim().toLowerCase();
      const id    = (row[2]||'').trim();
      if (nama && ['kecil','tengah','besar'].includes(kelas)) {
        const fotoUrl = (row[3]||'').trim() || null;   // kolom ke-4 di sheet Siswa
        state[kelas].students.push({ id, nama, fotoUrl });
      }
    });

    ['kecil','tengah','besar'].forEach(renderStudents);

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
    const foto    = stu.fotoUrl || null;
    const avatarContent = foto
      ? `<img src="${foto}" alt="" class="avatar-img${isHadir?' hadir-dim':''}" onerror="this.parentElement.innerHTML='${isHadir?'✓':initial}';this.parentElement.classList.remove('has-foto')" />${isHadir?'<span class=\"avatar-check\">✓</span>':''}`
      : (isHadir ? '✓' : initial);
    return `
      <div class="student-item ${isHadir ? 'hadir' : ''}"
           onclick="toggleAttendance('${kelas}','${stu.id}')"
           role="button" tabindex="0"
           aria-label="${stu.nama} — ${isHadir ? 'Hadir' : 'Belum absen'}"
           onkeydown="if(event.key==='Enter'||event.key===' ')toggleAttendance('${kelas}','${stu.id}')">
        <div class="student-avatar${foto?' has-foto':''}" aria-hidden="true">${avatarContent}</div>
        <div class="student-name">${escapeHtml(stu.nama)}</div>
        <div class="student-status">${isHadir ? '✓ Hadir' : '— Absen'}</div>
        <div class="student-actions">
          <button class="edit-btn"
                  onclick="event.stopPropagation();openEditModal('${kelas}',${i})"
                  aria-label="Edit ${stu.nama}" title="Edit / Pindah Kelas">✎</button>
          <button class="del-btn"
                  onclick="event.stopPropagation();deleteStudent('${kelas}',${i})"
                  aria-label="Hapus ${stu.nama}" title="Hapus">✕</button>
        </div>
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
  showConfirm({
    title: 'Reset absensi?',
    body: `Semua tanda hadir di <strong>Kelas ${capitalize(kelas)}</strong> akan dihapus.<br>Data yang belum disimpan akan hilang.`,
    confirmLabel: 'Ya, Reset',
    confirmClass: 'btn-danger',
    onConfirm: () => {
      state[kelas].attendance = {};
      renderStudents(kelas);
      showToast('✖ Absensi direset', '');
    },
  });
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
    await fetch(`${APPS_SCRIPT_URL}?action=tambahSiswa&data=${payload}`, { mode:'no-cors' });
    showToast(`✅ ${nama} ditambahkan!`, 'success');
  } catch(err) {
    showToast('⚠️ Gagal simpan ke Sheets', 'error');
  }
}

function deleteStudent(kelas, idx) {
  const stu = state[kelas].students[idx];
  showConfirm({
    title: 'Hapus anak?',
    body: `<strong>${escapeHtml(stu.nama)}</strong> akan dihapus dari daftar kelas.<br>Riwayat absensi lama tetap tersimpan.`,
    confirmLabel: 'Hapus',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      state[kelas].students.splice(idx, 1);
      delete state[kelas].attendance[stu.id];
      renderStudents(kelas);
      try {
        const payload = encodeURIComponent(JSON.stringify({ nama: stu.nama, kelas, id: stu.id }));
        await fetch(`${APPS_SCRIPT_URL}?action=hapusSiswa&data=${payload}`, { mode:'no-cors' });
        showToast(`🗑 ${stu.nama} dihapus`, '');
      } catch(err) {
        showToast('⚠️ Gagal hapus dari Sheets', 'error');
      }
    },
  });
}

/* ============================================================
   EDIT SISWA (Nama & Pindah Kelas)
   ============================================================ */
function openEditModal(kelas, idx) {
  const stu = state[kelas].students[idx];
  document.getElementById('editModal-nama').value      = stu.nama;
  document.getElementById('editModal-kelas').value     = kelas;
  document.getElementById('editModal-origKelas').value = kelas;
  document.getElementById('editModal-idx').value       = idx;
  document.getElementById('editModal-id').value        = stu.id;
  document.getElementById('editModal-title').textContent = stu.nama;

  // Reset foto state
  window._fotoState = { changed: false, newDataUrl: null, deleteExisting: false };

  // Show existing foto or placeholder
  if (stu.fotoUrl) {
    _showFotoPreview(stu.fotoUrl);
  } else {
    _clearFotoPreview();
  }

  document.getElementById('editModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('editModal-nama').focus(), 120);
}

/* ============================================================
   HELP MODAL
   ============================================================ */
function openHelp() {
  document.getElementById('helpModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeHelp() {
  document.getElementById('helpModal').classList.remove('show');
  document.body.style.overflow = '';
}
function switchHelp(panel, btn) {
  document.querySelectorAll('.help-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.help-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('help-' + panel).classList.add('active');
  btn.classList.add('active');
}

function toggleEditInfoBox() {
  const kelas = document.getElementById('editModal-kelas').value;
  const orig  = document.getElementById('editModal-origKelas').value;
  document.getElementById('editModal-infobox').style.display = (kelas !== orig) ? 'flex' : 'none';
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.remove('show');
  document.body.style.overflow = '';
}

async function saveEditModal() {
  const namaBaru    = document.getElementById('editModal-nama').value.trim();
  const kelasBaru   = document.getElementById('editModal-kelas').value;
  const kelasLama   = document.getElementById('editModal-origKelas').value;
  const idx         = parseInt(document.getElementById('editModal-idx').value);
  const id          = document.getElementById('editModal-id').value;

  if (!namaBaru) {
    document.getElementById('editModal-nama').focus();
    document.getElementById('editModal-nama').style.borderColor = 'var(--maroon-light)';
    setTimeout(() => document.getElementById('editModal-nama').style.borderColor = '', 1500);
    return;
  }

  const stu      = state[kelasLama].students[idx];
  const namaLama = stu.nama;
  const pindah   = kelasBaru !== kelasLama;

  // Update state
  stu.nama = namaBaru;

  if (pindah) {
    // Hapus dari kelas lama
    state[kelasLama].students.splice(idx, 1);
    delete state[kelasLama].attendance[id];
    // Tambah ke kelas baru (pertahankan ID yang sama)
    state[kelasBaru].students.push({ id, nama: namaBaru });
    renderStudents(kelasLama);
    renderStudents(kelasBaru);
  } else {
    renderStudents(kelasLama);
  }

  document.getElementById('editModal').classList.remove('show');
  document.body.style.overflow = '';
  document.getElementById('fotoInlineConfirm')?.remove();

  const fs          = window._fotoState;
  const namaChanged = namaBaru !== namaLama;
  const fotoChanged = fs && fs.changed;

  // Toast — hanya tampil kalau nama/kelas berubah, bukan kalau cuma foto
  if (namaChanged || pindah) {
    const label = pindah
      ? `✅ ${namaBaru} dipindah ke Kelas ${capitalize(kelasBaru)}!`
      : `✅ Nama diperbarui!`;
    showToast(label, 'success');
  }

  // Simpan perubahan nama/kelas ke Apps Script
  if (namaChanged || pindah) {
    try {
      const payload = encodeURIComponent(JSON.stringify({
        id, namaLama, namaBaru, kelasLama, kelasBaru
      }));
      await fetch(`${APPS_SCRIPT_URL}?action=editSiswa&data=${payload}`, { mode: 'no-cors' });
    } catch(err) {
      showToast('⚠️ Gagal sinkron nama ke Sheets', 'error');
    }
  }

  // Upload / hapus foto ke GitHub (async, non-blocking)
  if (fotoChanged) {
    const btn = document.getElementById('btnSaveEdit');
    if (fs.deleteExisting) {
      _uploadFotoDrive(id, null, kelasBaru);
    } else if (fs.newDataUrl) {
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Mengupload...'; }
      _uploadFotoDrive(id, fs.newDataUrl, kelasBaru).finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4BE; Simpan'; }
      });
    }
  }
}

/* ============================================================
   FOTO — Upload via Apps Script (token aman di server)
   ============================================================ */

// _fotoState: { changed, newDataUrl, deleteExisting }
window._fotoState = { changed: false, newDataUrl: null, deleteExisting: false };

/* ---- Handle file input change ---- */
function handleFotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ Ukuran foto maks 5MB ya!', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    _resizeImage(e.target.result, 300, dataUrl => {
      window._fotoState = { changed: true, newDataUrl: dataUrl, deleteExisting: false };
      _showFotoPreview(dataUrl);
    });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

/* ---- Resize ke max N px sebelum upload ---- */
function _resizeImage(dataUrl, maxSize, callback) {
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

/* ---- Show preview image in upload area ---- */
function _showFotoPreview(url) {
  document.getElementById('fotoPreview').src = url;
  document.getElementById('fotoPreview').classList.remove('hidden');
  document.getElementById('fotoPlaceholder').classList.add('hidden');
  document.getElementById('btnRemoveFoto').classList.remove('hidden');
  document.getElementById('fotoUploadArea').classList.add('has-foto');
}
function _clearFotoPreview() {
  document.getElementById('fotoPreview').src = '';
  document.getElementById('fotoPreview').classList.add('hidden');
  document.getElementById('fotoPlaceholder').classList.remove('hidden');
  document.getElementById('btnRemoveFoto').classList.add('hidden');
  document.getElementById('fotoUploadArea').classList.remove('has-foto');
}

/* ---- Confirm remove — pakai inline confirm biar gak ketimpa editModal ---- */
function confirmRemoveFoto() {
  // Inject inline confirm bar ke dalam editModal
  const area = document.getElementById('fotoUploadArea');
  const existing = document.getElementById('fotoInlineConfirm');
  if (existing) { existing.remove(); return; }

  const bar = document.createElement('div');
  bar.id = 'fotoInlineConfirm';
  bar.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;gap:10px;
    background:rgba(192,57,43,0.08);border:1.5px solid rgba(192,57,43,0.3);
    border-radius:12px;padding:10px 14px;margin-top:8px;
    font-size:0.82rem;font-weight:700;color:#922B21;
  `;
  bar.innerHTML = `
    <span>🗑 Hapus foto ini?</span>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('fotoInlineConfirm').remove()"
        style="padding:5px 12px;border-radius:20px;border:1.5px solid rgba(192,57,43,0.3);
               background:white;color:#922B21;font-weight:800;font-size:0.78rem;cursor:pointer;">
        Batal
      </button>
      <button onclick="_doRemoveFoto()"
        style="padding:5px 12px;border-radius:20px;border:none;
               background:#C0392B;color:white;font-weight:800;font-size:0.78rem;cursor:pointer;">
        Hapus
      </button>
    </div>
  `;
  area.parentElement.insertBefore(bar, area.nextSibling);
}

function _doRemoveFoto() {
  document.getElementById('fotoInlineConfirm')?.remove();
  window._fotoState = { changed: true, newDataUrl: null, deleteExisting: true };
  _clearFotoPreview();
}

/* ---- Upload / delete foto — semua lewat Apps Script sebagai proxy ---- */
async function _uploadFotoDrive(stuId, dataUrl, kelas) {
  try {
    const isDelete = !dataUrl;

    if (isDelete) {
      showToast('🗑 Menghapus foto...', '');
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'uploadFoto',
          data: JSON.stringify({ id: stuId, kelas, delete: true })
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Gagal hapus foto');
      _updateFotoState(stuId, null);
      showToast('🗑 Foto dihapus', 'success');
      return;
    }

    // ---- UPLOAD ----
    showToast('📤 Mengupload foto...', '');
    const base64 = dataUrl.split(',')[1];

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'uploadFoto',
        data: JSON.stringify({ id: stuId, base64, kelas })
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Upload gagal');

    // Apps Script return fotoUrl + cache-buster
    const fotoUrl = data.result ? data.result + `?t=${Date.now()}` : null;
    _updateFotoState(stuId, fotoUrl);
    showToast('✅ Foto tersimpan!', 'success');

  } catch (err) {
    console.error('[uploadFoto]', err);
    showToast('❌ Gagal upload foto: ' + err.message, 'error');
  }
}

/* ---- Update fotoUrl di state & re-render ---- */
function _updateFotoState(stuId, fotoUrl) {
  ['kecil','tengah','besar'].forEach(k => {
    const stu = state[k].students.find(s => s.id === stuId);
    if (stu) {
      stu.fotoUrl = fotoUrl;
      renderStudents(k);
    }
  });
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

  // Hanya kirim yang hadir - yang absen tidak perlu dicatat di sheet
  const rows = s.students
    .filter(stu => s.attendance[stu.id])
    .map(stu => ({ tanggal, sesi: `Sesi ${sesi}`, kelas, nama: stu.nama, status: 'Hadir' }));

  // Helper: jalankan simpan yang sebenarnya
  const doSimpan = async () => {
    showLoading(`Menyimpan absensi Kelas ${capitalize(kelas)} Sesi ${sesi}...`);
    try {
      const encoded = encodeURIComponent(JSON.stringify(rows));
      await fetch(`${APPS_SCRIPT_URL}?action=absensi&data=${encoded}`, { mode:'no-cors' });
      hideLoading();
      showToast(`✅ Tersimpan! ${hadir}/${total} hadir — Sesi ${sesi}`, 'success');
      clearAll_silent(kelas);
    } catch(err) {
      hideLoading();
      showToast('❌ Gagal menyimpan, cek koneksi!', 'error');
    }
  };

  // Konfirmasi kalau 0 hadir
  if (rows.length === 0) {
    showConfirm({
      title: 'Tidak ada yang hadir',
      body: `Kamu belum menandai anak mana pun sebagai hadir di Kelas <strong>${capitalize(kelas)}</strong>.<br><br>Tetap simpan? Data hadir sebelumnya (jika ada) akan terhapus.`,
      confirmLabel: 'Ya, Tetap Simpan',
      confirmClass: 'btn-danger',
      onConfirm: doSimpan,
    });
    return;
  }

  // Cek duplikat per nama — apakah ada nama yang mau disimpan sudah tercatat di sesi ini?
  showLoading('Mengecek data sebelumnya...');
  try {
    const bulanCek  = tanggal.slice(0, 7);
    const sesiLabel = `Sesi ${sesi}`;
    const cekParams = new URLSearchParams({ action: 'getRekap', bulan: bulanCek, sesi: sesiLabel });
    const cekRes    = await fetch(`${APPS_SCRIPT_URL}?${cekParams}`);
    const cekData   = await cekRes.json();
    hideLoading();

    if (cekData.ok) {
      // Nama yang sudah ada di tanggal + sesi + kelas ini
      const namaLama = new Set(
        (cekData.result || [])
          .filter(r => r[0] === tanggal && r[1] === sesiLabel && r[2] === kelas)
          .map(r => r[3])
      );

      // Nama yang mau disimpan sekarang yang sudah ada sebelumnya
      const namaBentrok = rows.filter(r => namaLama.has(r.nama)).map(r => r.nama);

      if (namaBentrok.length > 0) {
        const namaBaru = rows.filter(r => !namaLama.has(r.nama)).map(r => r.nama);

        const bentrokPills = namaBentrok.map(n =>
          `<span class="name-pill" style="border-color:rgba(192,57,43,0.35);background:rgba(192,57,43,0.08);color:#922B21">${escapeHtml(n)}</span>`
        ).join('');
        const baruPills = namaBaru.length
          ? namaBaru.map(n => `<span class="name-pill">${escapeHtml(n)}</span>`).join('')
          : '<span style="font-size:0.8rem;color:var(--text-muted);font-style:italic">—</span>';

        showConfirm({
          title: '⚠️ Sebagian sudah diabsen',
          body: `<strong>Kelas ${capitalize(kelas)} ${sesiLabel}</strong> tanggal ini:<br><br>
                 <div style="margin:0 0 4px;font-size:0.74rem;font-weight:800;color:#922B21;letter-spacing:0.4px">SUDAH ADA — AKAN DITIMPA</div>
                 <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${bentrokPills}</div>
                 <div style="margin:0 0 4px;font-size:0.74rem;font-weight:800;color:var(--text-muted);letter-spacing:0.4px">BARU — AKAN DITAMBAHKAN</div>
                 <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">${baruPills}</div>`,
          confirmLabel: 'Lanjutkan',
          confirmClass: 'btn-danger',
          onConfirm: doSimpan,
        });
        return;
      }
    }
  } catch(_) {
    hideLoading();
  }

  await doSimpan();
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
  const dari   = document.getElementById('rekap-dari').value;
  const sampai = document.getElementById('rekap-sampai').value;
  const sesi   = document.getElementById('rekap-sesi').value;
  if (!dari || !sampai) { showToast('⚠️ Pilih rentang bulan dulu!', 'error'); return; }
  if (dari > sampai) { showToast('⚠️ Bulan awal harus sebelum bulan akhir!', 'error'); return; }

  // dari = YYYY-MM → dari-01, sampai = YYYY-MM → sampai-31
  const dariDate   = dari + '-01';
  const sampaiDate = sampai + '-31';

  showLoading('Memuat rekap...');
  try {
    const params = new URLSearchParams({ action: 'getRekap', dari: dariDate, sampai: sampaiDate });
    if (sesi) params.set('sesi', `Sesi ${sesi}`);
    const res  = await fetch(`${APPS_SCRIPT_URL}?${params}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Gagal memuat rekap');
    hideLoading();

    state.rekapData = data.result || [];
    renderRekap(state.rekapData, dari, sampai, sesi);
  } catch(err) {
    hideLoading();
    showToast('❌ Gagal memuat: ' + err.message, 'error');
  }
}

/* Chart instances — simpan biar bisa di-destroy sebelum re-render */
const _charts = {};

function switchChart(type, btn) {
  ['bar','line','pie'].forEach(t => {
    document.getElementById(`chart-${t}-wrap`).style.display = t === type ? 'flex' : 'none';
  });
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _destroyChart(key) {
  if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; }
}

function renderRekap(rows, dari, sampai, sesi) {
  const contentEl = document.getElementById('rekap-content');
  const chartsEl  = document.getElementById('rekap-charts');

  const labelDari   = new Date(dari+'-01').toLocaleDateString('id-ID',{month:'short',year:'numeric'});
  const labelSampai = new Date(sampai+'-01').toLocaleDateString('id-ID',{month:'short',year:'numeric'});
  const rangeLabel  = dari === sampai ? labelDari : `${labelDari} – ${labelSampai}`;
  const sesiLabel   = sesi ? ` · Sesi ${sesi}` : ' · Semua Sesi';

  if (!rows.length) {
    chartsEl.style.display = 'none';
    contentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Tidak ada data untuk periode ini</p></div>`;
    return;
  }

  const byKelas = { kecil: { hadir: 0 }, tengah: { hadir: 0 }, besar: { hadir: 0 } };
  const byDate  = {};
  const byMonth = {};

  rows.forEach(r => {
    const tgl   = r[0];
    const sesiR = r[1] || '';
    const kelas = (r[2] || '').toLowerCase();
    const nama  = (r[3] || '').trim();
    if (byKelas[kelas]) byKelas[kelas].hadir++;

    // per date
    const key = `${tgl}||${sesiR}`;
    if (!byDate[key]) byDate[key] = { tgl, sesi: sesiR, kecil:[], tengah:[], besar:[] };
    if (byDate[key][kelas] !== undefined) byDate[key][kelas].push(nama);

    // per month (for line chart)
    const month = tgl.slice(0,7);
    if (!byMonth[month]) byMonth[month] = { kecil:0, tengah:0, besar:0 };
    if (byMonth[month][kelas] !== undefined) byMonth[month][kelas]++;
  });

  const totalHadir  = byKelas.kecil.hadir + byKelas.tengah.hadir + byKelas.besar.hadir;
  const sortedDates = Object.values(byDate).sort((a,b) => a.tgl.localeCompare(b.tgl) || a.sesi.localeCompare(b.sesi));

  // ── Table HTML ──
  const tableRows = sortedDates.map((d, i) => {
    const total  = d.kecil.length + d.tengah.length + d.besar.length;
    const key    = `detail-${i}`;
    const tglFmt = new Date(d.tgl).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'});
    const pills  = (arr, icon) => arr.length
      ? `<div class="detail-kelas"><span class="detail-kelas-label">${icon}</span><div class="detail-names">${arr.map(n=>`<span class="name-pill">${escapeHtml(n)}</span>`).join('')}</div></div>`
      : '';
    return `
      <tr class="summary-row" onclick="toggleDetail('${key}')" role="button" tabindex="0"
          onkeydown="if(event.key==='Enter')toggleDetail('${key}')">
        <td>${tglFmt}</td>
        <td><span class="sesi-badge">${d.sesi}</span></td>
        <td>${d.kecil.length}</td><td>${d.tengah.length}</td><td>${d.besar.length}</td>
        <td><strong>${total}</strong> <span class="expand-icon" id="icon-${key}">›</span></td>
      </tr>
      <tr class="detail-row" id="${key}">
        <td colspan="6"><div class="detail-panel">
          ${pills(d.kecil,'🐣 Kecil')}${pills(d.tengah,'🌿 Tengah')}${pills(d.besar,'⭐ Besar')}
        </div></td>
      </tr>`;
  }).join('');

  contentEl.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;font-weight:700;letter-spacing:0.3px">
      ${rangeLabel.toUpperCase()}${sesiLabel} · Total: <span style="color:var(--maroon)">${totalHadir} anak</span>
    </p>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${byKelas.kecil.hadir}</div><div class="lbl">🐣 Kecil</div></div>
      <div class="stat-card"><div class="num">${byKelas.tengah.hadir}</div><div class="lbl">🌿 Tengah</div></div>
      <div class="stat-card"><div class="num">${byKelas.besar.hadir}</div><div class="lbl">⭐ Besar</div></div>
    </div>
    <p class="rekap-section-title">📆 Per Tanggal & Sesi</p>
    <p class="rekap-tap-hint">👆 Ketuk baris untuk lihat nama lengkap</p>
    <div class="rekap-table-wrap">
      <table class="rekap-table">
        <thead><tr><th>Tanggal</th><th>Sesi</th><th>🐣</th><th>🌿</th><th>⭐</th><th>Total</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  // ── Show charts ──
  chartsEl.style.display = 'block';

  // Warna tema
  const C = {
    maroon:  '#7B1120', maroonA: 'rgba(123,17,32,0.75)',
    gold:    '#D4A017', goldA:   'rgba(212,160,23,0.75)',
    green:   '#27AE60', greenA:  'rgba(39,174,96,0.75)',
    muted:   'rgba(123,17,32,0.08)',
  };
  const fontOpts = { family: "'Nunito', sans-serif", size: 11, weight: '700' };

  // ── BAR CHART: kehadiran per tanggal (stacked) ──
  _destroyChart('bar');
  const barLabels = sortedDates.map(d => {
    const dt = new Date(d.tgl);
    return dt.toLocaleDateString('id-ID',{day:'numeric',month:'short'}) + ' ' + d.sesi.replace('Sesi ','S');
  });
  _charts.bar = new Chart(document.getElementById('chartBar'), {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [
        { label:'🐣 Kecil',  data: sortedDates.map(d=>d.kecil.length),  backgroundColor: C.maroonA, borderRadius:4 },
        { label:'🌿 Tengah', data: sortedDates.map(d=>d.tengah.length), backgroundColor: C.goldA,   borderRadius:4 },
        { label:'⭐ Besar',  data: sortedDates.map(d=>d.besar.length),  backgroundColor: C.greenA,  borderRadius:4 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins: { legend:{ labels:{ font:fontOpts, color:'#2C1810' } }, tooltip:{ mode:'index', intersect:false } },
      scales: {
        x: { stacked:true, ticks:{ font:fontOpts, color:'#6B3A2A', maxRotation:45 }, grid:{ color: C.muted } },
        y: { stacked:true, ticks:{ font:fontOpts, color:'#6B3A2A', stepSize:1 },     grid:{ color: C.muted }, beginAtZero:true },
      }
    }
  });

  // ── LINE CHART: trend per bulan ──
  _destroyChart('line');
  const monthKeys   = Object.keys(byMonth).sort();
  const monthLabels = monthKeys.map(m => new Date(m+'-01').toLocaleDateString('id-ID',{month:'short',year:'numeric'}));
  _charts.line = new Chart(document.getElementById('chartLine'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label:'📊 Total',  data: monthKeys.map(m=>byMonth[m].kecil+byMonth[m].tengah+byMonth[m].besar), borderColor:'#555', backgroundColor:'rgba(80,80,80,0.06)', tension:0.4, fill:false, pointBackgroundColor:'#555', pointRadius:5, borderWidth:2.5, borderDash:[] },
        { label:'🐣 Kecil',  data: monthKeys.map(m=>byMonth[m].kecil),  borderColor:C.maroon, backgroundColor:'rgba(123,17,32,0.08)', tension:0.4, fill:true, pointBackgroundColor:C.maroon, pointRadius:5 },
        { label:'🌿 Tengah', data: monthKeys.map(m=>byMonth[m].tengah), borderColor:C.gold,   backgroundColor:'rgba(212,160,23,0.08)', tension:0.4, fill:true, pointBackgroundColor:C.gold,   pointRadius:5 },
        { label:'⭐ Besar',  data: monthKeys.map(m=>byMonth[m].besar),  borderColor:C.green,  backgroundColor:'rgba(39,174,96,0.08)',  tension:0.4, fill:true, pointBackgroundColor:C.green,  pointRadius:5 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins: { legend:{ labels:{ font:fontOpts, color:'#2C1810' } }, tooltip:{ mode:'index', intersect:false } },
      scales: {
        x: { ticks:{ font:fontOpts, color:'#6B3A2A' }, grid:{ color:C.muted } },
        y: { ticks:{ font:fontOpts, color:'#6B3A2A', stepSize:1 }, grid:{ color:C.muted }, beginAtZero:true },
      }
    }
  });

  // ── PIE/DONUT CHART: per kelas ──
  _destroyChart('pie');
  _charts.pie = new Chart(document.getElementById('chartPie'), {
    type: 'doughnut',
    data: {
      labels: ['🐣 Kecil','🌿 Tengah','⭐ Besar'],
      datasets: [{
        data: [byKelas.kecil.hadir, byKelas.tengah.hadir, byKelas.besar.hadir],
        backgroundColor: [C.maroonA, C.goldA, C.greenA],
        borderColor:     ['white','white','white'],
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      cutout: '58%',
      plugins: {
        legend:{ position:'bottom', labels:{ font:fontOpts, color:'#2C1810', padding:16 } },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${ctx.raw} anak (${Math.round(ctx.raw/totalHadir*100)}%)` } }
      }
    }
  });
}

function toggleDetail(key) {
  const detailRow = document.getElementById(key);
  const summaryRow = detailRow ? detailRow.previousElementSibling : null;
  const open = detailRow.classList.toggle('open');
  if (summaryRow) summaryRow.classList.toggle('is-open', open);
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
  const dari   = (document.getElementById('rekap-dari')   || {}).value || '';
  const sampai = (document.getElementById('rekap-sampai') || {}).value || '';
  const sesi   = document.getElementById('rekap-sesi').value;
  const lblDari   = dari   ? new Date(dari+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'})   : '';
  const lblSampai = sampai ? new Date(sampai+'-01').toLocaleDateString('id-ID',{month:'long',year:'numeric'}) : '';
  const namaBulan = dari === sampai || !sampai ? (lblDari || 'Rekap') : `${lblDari} – ${lblSampai}`;
  const sesiLabel = sesi ? `Sesi ${sesi}` : 'Semua Sesi';
  const filename  = `absensi_bkc_${dari||new Date().toISOString().split('T')[0]}${sampai&&sampai!==dari?'_sd_'+sampai:''}`;
  return { namaBulan, sesiLabel, filename };
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCSV() {
  closeExportModal();
  const { filename } = getExportMeta();
  const csv  = ['Tanggal,Sesi,Kelas,Nama,Timestamp',
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
  // Kolom sheet: Tanggal | Sesi | Kelas | Nama | Timestamp (semua baris = Hadir)
  const rawHeaders = ['Tanggal','Sesi','Kelas','Nama','Timestamp'];
  const rawData    = [rawHeaders, ...state.rekapData];
  const wsRaw      = XLSX.utils.aoa_to_sheet(rawData);
  wsRaw['!cols']   = [14,10,10,24,20].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Data Absensi');

  /* --- Sheet 2: Ringkasan per tanggal --- */
  // Setiap baris = 1 siswa hadir, tidak ada kolom Status
  const byDate = {};
  state.rekapData.forEach(r => {
    const tgl=r[0],sesiR=r[1],kelas=(r[2]||'').toLowerCase();
    const key=`${tgl}||${sesiR}`;
    if (!byDate[key]) byDate[key]={tgl,sesi:sesiR,kecil:0,tengah:0,besar:0};
    if (byDate[key][kelas]!==undefined) byDate[key][kelas]++;
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

  const byKelas={kecil:{hadir:0},tengah:{hadir:0},besar:{hadir:0}};
  const byDate={};
  // Setiap baris = 1 siswa hadir, tidak ada kolom Status
  state.rekapData.forEach(r=>{
    const tgl=r[0],sesiR=r[1]||'',kelas=(r[2]||'').toLowerCase();
    if(byKelas[kelas]) byKelas[kelas].hadir++;
    const key=`${tgl}||${sesiR}`;
    if(!byDate[key])byDate[key]={tgl,sesi:sesiR,kecil:0,tengah:0,besar:0};
    if(byDate[key][kelas]!==undefined)byDate[key][kelas]++;
  });

  const totalHadir=byKelas.kecil.hadir+byKelas.tengah.hadir+byKelas.besar.hadir;
  const totalAll=totalHadir;

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
  <div class="stat-box"><div class="stat-num">${byKelas.kecil.hadir}</div><div class="stat-lbl">🐣 Kelas Kecil</div></div>
  <div class="stat-box"><div class="stat-num">${byKelas.tengah.hadir}</div><div class="stat-lbl">🌿 Kelas Tengah</div></div>
  <div class="stat-box"><div class="stat-num">${byKelas.besar.hadir}</div><div class="stat-lbl">⭐ Kelas Besar</div></div>
  <div class="stat-box"><div class="stat-num">${totalHadir}</div><div class="stat-lbl">📊 Total Hadir</div></div>
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
const _loadingEmojis = ['🐣','🌿','⭐','🙏','💛','🐣'];
let _loadingEmojiIdx = 0;
let _loadingEmojiTimer = null;
const _loadingSubs = [
  'Bentar ya, lagi ngambil daftar anak...',
  'Konek ke Google Sheets...',
  'Hampir selesai nih!',
];

function showLoading(msg='Memuat...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.add('show');
  // cycle emoji
  _loadingEmojiIdx = 0;
  const emojiEl = document.getElementById('loadingEmoji');
  const subEl   = document.getElementById('loadingSub');
  if (emojiEl) emojiEl.textContent = _loadingEmojis[0];
  if (subEl)   subEl.textContent   = _loadingSubs[0];
  _loadingEmojiTimer = setInterval(() => {
    _loadingEmojiIdx = (_loadingEmojiIdx + 1) % _loadingEmojis.length;
    if (emojiEl) {
      emojiEl.style.animation = 'none';
      emojiEl.textContent = _loadingEmojis[_loadingEmojiIdx];
      void emojiEl.offsetWidth;
      emojiEl.style.animation = '';
    }
    if (subEl) subEl.textContent = _loadingSubs[Math.min(_loadingEmojiIdx, _loadingSubs.length-1)];
  }, 1200);
  // show skeletons
  ['kecil','tengah','besar'].forEach(k => {
    const sk = document.getElementById(`skeleton-${k}`);
    const li = document.getElementById(`list-${k}`);
    if (sk) sk.style.display = 'block';
    if (li) li.style.display = 'none';
  });
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
  clearInterval(_loadingEmojiTimer);
  // hide skeletons, show lists
  ['kecil','tengah','besar'].forEach(k => {
    const sk = document.getElementById(`skeleton-${k}`);
    const li = document.getElementById(`list-${k}`);
    if (sk) sk.style.display = 'none';
    if (li) li.style.display = '';
  });
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