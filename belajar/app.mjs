/**
 * CariHukum Belajar — perilaku halaman /belajar/.
 *
 * Empat panel di atas data yang sama (/api/belajar/):
 *   Peta Pasal   — Buku → Bab → rentang, dengan status hidup/dinaungi/kosong/dicabut
 *   Lokasi       — dari bunyi pasal ke buku / bab / rentang / nomor, ≤ 10 detik
 *   Instrumen    — "pasal ini dinaungi instrumen apa?" — jawabannya dari anotasi, bukan tebakan
 *   Kartu        — isi→nomor & istilah→definisi dijadwalkan FSRS, keyakinan dicatat sebelum dibuka
 *
 * Fungsi pembangkit soal di bawah murni (menerima rng) supaya bisa diuji Node;
 * bagian DOM hanya berjalan bila `document` ada. Progres: localStorage, dan
 * disinkronkan ke Supabase (RLS) bila pembaca masuk akun — tanpa akun semuanya
 * tetap berfungsi dan tak ada satu pun permintaan ke Supabase.
 */
import { NILAI } from "./fsrs.mjs";
import { muat, simpan, antrean, catatUlasan, catatGame, kalibrasi, gabungLWW, pangkas, kunciDek, kunciKartu, uraiKunci,
  keBaris, dariBaris, P_SLIDER, stateBaru, hariLokal } from "./state.mjs";

// ---------- fungsi murni ----------
export const anchorPasal = (id) => "#p-" + id.replace(/[^a-z0-9]/gi, "_");
/** Judul bab tanpa keterangan golongan kolonial "(Tidak Berlaku Bagi …)" dan ekor "Ketentuan Umum". */
export const bersihkanJudul = (j) => String(j ?? "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+(BAGIAN|Bagian)\s+\d+.*$/, "").replace(/\s+Ketentuan Umum$/i, "").replace(/\s+/g, " ").trim();
const acak = (rng, n) => Math.floor(rng() * n);
const kocok = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = acak(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const potong = (t, n = 420) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const nomorAngka = (n) => { const m = /^\d+/.exec(String(n)); return m ? +m[0] : null; };
const babDari = (dek, id) => dek.bab.find((b) => b.id === id);
const LABEL_STATUS = { h: "berlaku menurut data CariHukum", d: "dinaungi instrumen pencabutan sebagian/bersyarat", k: "naskah sendiri menyatakan dihapus", c: "dicabut" };

/**
 * Soal Lokasi. mode ∈ buku | bab | rentang | nomor.
 *   dekList = satu dek (mode bab/rentang/nomor) atau beberapa dek satu karya (mode buku)
 * Kembali { teks, kartu, dek, jawaban, pilihan[] (untuk mode pilihan ganda) }
 */
export function soalLokasi(dekList, mode, rng = Math.random) {
  const dek = dekList[acak(rng, dekList.length)];
  const kandidat = dek.kartu.filter((k) => k.s === "h" || k.s === "d");
  const kartu = kandidat[acak(rng, kandidat.length)];
  const bab = babDari(dek, kartu.c);
  const dasar = { teks: potong(kartu.t), kartu, dek, bab };
  if (mode === "buku") {
    const pilihan = kocok(dekList.map((d) => ({ id: d.id, label: d.nama })), rng);
    return { ...dasar, mode, jawaban: dek.id, pilihan };
  }
  if (mode === "bab") {
    const lain = kocok(dek.bab.filter((b) => b.id !== bab.id && b.awal != null), rng).slice(0, 3);
    const pilihan = kocok([bab, ...lain].map((b) => ({ id: b.id, label: `Bab ${b.nomor} — ${bersihkanJudul(b.judul)}` })), rng);
    return { ...dasar, mode, jawaban: bab.id, pilihan };
  }
  if (mode === "rentang") {
    const lain = kocok(dek.bab.filter((b) => b.id !== bab.id && b.awal != null), rng).slice(0, 3);
    const pilihan = kocok([bab, ...lain].map((b) => ({ id: b.id, label: `Pasal ${b.awal}–${b.akhir}` })), rng)
      .sort((a, b) => nomorAngka(a.label.slice(6)) - nomorAngka(b.label.slice(6)));
    return { ...dasar, mode, jawaban: bab.id, pilihan };
  }
  return { ...dasar, mode: "nomor", jawaban: kartu.n, pilihan: null };
}

/** Nilai jawaban Lokasi: 2 poin tepat, 1 poin bab benar (mode nomor), 0 selain itu. */
export function nilaiLokasi(soal, jawab) {
  if (soal.mode !== "nomor") return jawab === soal.jawaban ? 2 : 0;
  const n = nomorAngka(jawab);
  if (n === null) return 0;
  if (String(jawab).trim().toLowerCase() === String(soal.jawaban).toLowerCase()) return 2;
  return soal.bab.awal != null && n >= soal.bab.awal && n <= soal.bab.akhir ? 1 : 0;
}

export const JAWAB_TIDAK = "__tidak-dinaungi__";
/**
 * Soal Instrumen: berimbang antara pasal dinaungi dan hidup. Pilihan = semua
 * instrumen yang pernah menaungi karya (dari peta) + "Tidak dinaungi".
 */
export function soalInstrumen(dek, peta, rng = Math.random) {
  const d = dek.kartu.filter((k) => k.s === "d"), h = dek.kartu.filter((k) => k.s === "h");
  const kumpulan = d.length && h.length ? (rng() < 0.5 ? d : h) : d.length ? d : h;
  const kartu = kumpulan[acak(rng, kumpulan.length)];
  const instrumen = Object.entries(peta.instrumen ?? {}).map(([id, v]) => ({ id, label: `${v.nama}${v.dasar ? ` — ${v.dasar}` : ""}`, info: v }));
  const pilihan = [...kocok(instrumen, rng), { id: JAWAB_TIDAK, label: "Tidak dinaungi — berlaku penuh menurut data CariHukum" }];
  const jawaban = kartu.s === "d" ? kartu.i.slice().sort() : [JAWAB_TIDAK];
  return { kartu, bab: babDari(dek, kartu.c), pilihan, jawaban, teks: potong(kartu.t, 300) };
}
export const benarInstrumen = (soal, pilih) => soal.jawaban.includes(pilih);

// ---------- DOM ----------
function init() {
  const IDX = window.DATA_BELAJAR;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  const kini = () => Date.now();
  let state = muat(store, kini());
  const simpanState = () => { simpan(store, state); jadwalkanDorong(); };
  const cache = new Map();
  const ambil = async (url) => { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); })); return cache.get(url); };
  const dekInfo = (id) => IDX.dek.find((d) => d.id === id);
  const muatDek = (id) => ambil(dekInfo(id).berkas);
  const muatPeta = (karya) => ambil(IDX.dek.find((d) => d.karya === karya).peta);
  const karyaList = [...new Map(IDX.dek.map((d) => [d.karya, d])).values()];
  const tautanPasal = (dek, k) => `${dek.jalur}${anchorPasal(k.k)}`;
  const pitaStatus = (s) => `<span class="pita ${s}">${s === "h" ? "berlaku" : s === "d" ? "dinaungi" : s === "k" ? "kosong" : "dicabut"}</span>`;

  // hash: #panel=kartu&dek=…
  const hashObj = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const setHash = (obj) => { const h = { ...hashObj(), ...obj }; history.replaceState(null, "", "#" + new URLSearchParams(h).toString()); };
  const dekPilihan = () => hashObj().dek && dekInfo(hashObj().dek) ? hashObj().dek : IDX.dek[0]?.id;

  const selectDek = (id, aktif, filter = () => true) =>
    `<label class="pilih">Dek <select id="${id}">${IDX.dek.filter(filter).map((d) => `<option value="${esc(d.id)}" ${d.id === aktif ? "selected" : ""}>${esc(d.nama)} (${d.n.kartu} kartu)</option>`).join("")}</select></label>`;

  // ----- tab -----
  const tabs = document.querySelectorAll('nav.tabs [role="tab"]');
  const tampil = { peta: renderPeta, lokasi: renderLokasi, instrumen: renderInstrumen, kartu: renderKartu };
  function bukaPanel(nama) {
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.panel === nama)));
    for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `panel-${nama}`;
    setHash({ panel: nama });
    hentikanTimer();
    tampil[nama]();
  }
  tabs.forEach((b) => b.addEventListener("click", () => bukaPanel(b.dataset.panel)));

  // ----- Peta -----
  async function renderPeta() {
    const el = $("#panel-peta");
    const karya = hashObj().karya && karyaList.some((k) => k.karya === hashObj().karya) ? hashObj().karya : karyaList[0].karya;
    el.innerHTML = `<label class="pilih">Peraturan <select id="peta-karya">${karyaList.map((k) => `<option value="${esc(k.karya)}" ${k.karya === karya ? "selected" : ""}>${esc(k.karya === "kuhperdata-1847" ? "KUHPerdata (1847)" : k.nama)}</option>`).join("")}</select></label>
      <div class="legenda"><span><i style="background:var(--accent)"></i>berlaku menurut data</span><span><i style="background:var(--amber)"></i>dinaungi instrumen pencabutan sebagian/bersyarat</span><span><i style="background:var(--abu)"></i>kosong (naskah: "dihapus dengan S. …")</span><span><i style="background:var(--merah)"></i>dicabut</span></div>
      <div id="peta-isi" class="kosong">Memuat…</div>`;
    $("#peta-karya").addEventListener("change", (e) => { setHash({ karya: e.target.value }); renderPeta(); });
    const peta = await muatPeta(karya);
    const n = peta.n;
    const isi = peta.buku.map((bk) => {
      const kelas = (x) => (x.hidup && (x.dinaungi || x.dicabut) ? "m" : x.dinaungi ? "d" : x.hidup ? "h" : x.dicabut ? "c" : "k");
      const babs = bk.bab.map((b) => `<button class="bab ${kelas(b.n)}" data-bab="${esc(b.id)}" aria-pressed="false"><b>Bab ${esc(b.nomor)}</b>${esc(bersihkanJudul(b.judul)) || "(tanpa bab)"}<span class="r"><br>${b.awal != null ? `Ps. ${b.awal}–${b.akhir}` : ""} · ${b.n.hidup}/${b.n.dinaungi}/${b.n.kosong}${b.n.dicabut ? "/" + b.n.dicabut : ""}</span></button>`).join("");
      const judul = bk.id ? `Buku ${esc(bk.nomor)} — ${esc(bk.judul ?? "")}` : esc(peta.nama);
      return `<div class="buku" data-buku="${esc(bk.id ?? "")}"><div class="kepala"><span>${bk.jalur ? `<a href="${esc(bk.jalur)}">${judul}</a>` : `<strong>${judul}</strong>`} <span class="meta">Ps. ${bk.awal}–${bk.akhir}</span></span>
        <span class="meta">${bk.n.hidup} berlaku · ${bk.n.dinaungi} dinaungi · ${bk.n.kosong} kosong${bk.n.dicabut ? ` · ${bk.n.dicabut} dicabut` : ""}${bk.naungan.length ? ` · naungan: ${bk.naungan.map((i) => esc(peta.instrumen[i]?.nama ?? i)).join(", ")}` : ""}</span></div>
        <div class="bab-grid">${babs}</div><div class="rinci" hidden></div></div>`;
    }).join("");
    $("#peta-isi").className = "";
    $("#peta-isi").innerHTML = `<div class="stat"><span><b>${n.hidup}</b> berlaku</span><span><b>${n.dinaungi}</b> dinaungi</span><span><b>${n.kosong}</b> kosong</span><span><b>${n.dicabut}</b> dicabut</span><span class="meta">angka per bab: berlaku/dinaungi/kosong</span></div>${isi}`;
    $("#peta-isi").addEventListener("click", (e) => {
      const btn = e.target.closest(".bab"); if (!btn) return;
      const bukuEl = btn.closest(".buku");
      const bk = peta.buku.find((x) => String(x.id ?? "") === bukuEl.dataset.buku);
      const b = bk.bab.find((x) => x.id === btn.dataset.bab);
      bukuEl.querySelectorAll(".bab").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      const naungan = [...new Set([...(bk.naungan ?? []), ...(b.naungan ?? [])])];
      const r = bukuEl.querySelector(".rinci");
      r.hidden = false;
      r.innerHTML = `<h3>Bab ${esc(b.nomor)} — ${esc(bersihkanJudul(b.judul)) || "(tanpa bab)"}</h3>
        <div class="meta">${b.awal != null ? `Pasal ${b.awal}–${b.akhir}` : ""} · ${b.n.hidup} berlaku · ${b.n.dinaungi} dinaungi · ${b.n.kosong} kosong${b.n.dicabut ? ` · ${b.n.dicabut} dicabut` : ""}
        ${bk.jalur && b.awal != null ? ` · <a href="${esc(bk.jalur)}#p-pasal_${b.awal}">baca dari Pasal ${b.awal} →</a>` : ""}</div>
        ${naungan.length ? naungan.map((i) => { const v = peta.instrumen[i]; return `<div class="kutip"><strong>${esc(v?.nama ?? i)}</strong>${v?.dasar ? ` · ${esc(v.dasar)}` : ""}${v?.tanggal ? ` · berlaku ${esc(v.tanggal)}` : ""}<br>${esc(v?.kutipan ?? "")}${v?.jalur ? ` <a href="${esc(v.jalur)}">buka →</a>` : ""}</div>`; }).join("")
          : `<p class="kecil">Tidak ada instrumen pencabutan sebagian/bersyarat yang tercatat menaungi bab ini. Itu pernyataan tentang <em>data CariHukum</em>, bukan jaminan hukum.</p>`}
        ${b.n.kosong ? `<p class="kecil meta">${b.n.kosong} pasal di bab ini naskahnya sendiri berbunyi "dihapus/dicabut dengan Staatsblad" dan tidak dijadikan kartu.</p>` : ""}`;
      r.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  // ----- timer bersama -----
  let timerId = null;
  function hentikanTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function mulaiTimer(detik, elTeks, elBar, saatHabis) {
    hentikanTimer();
    const t0 = kini();
    const tick = () => {
      const sisa = Math.max(0, detik - (kini() - t0) / 1000);
      elTeks.textContent = sisa.toFixed(1) + " s";
      elBar.style.width = (100 * sisa / detik) + "%";
      if (sisa <= 0) { hentikanTimer(); elTeks.classList.add("habis"); saatHabis(); }
    };
    tick();
    timerId = setInterval(tick, 100);
  }

  // ----- Lokasi -----
  async function renderLokasi() {
    const el = $("#panel-lokasi");
    const aktif = dekPilihan();
    const mode = hashObj().mode ?? "bab";
    const kodif = IDX.dek.filter((d) => d.karya === dekInfo(aktif).karya && d.buku);
    el.innerHTML = `<div class="sub">Dari bunyi pasal, tebak <em>di mana</em> ia berada. Sepuluh detik per soal — lokasi harus refleks, bukan perenungan. Tombol <kbd>1</kbd>–<kbd>4</kbd> memilih; <kbd>Enter</kbd> soal berikutnya.</div>
      ${selectDek("lokasi-dek", aktif)}
      <label class="pilih">Mode <select id="lokasi-mode">
        ${kodif.length > 1 ? `<option value="buku" ${mode === "buku" ? "selected" : ""}>Buku (semua buku ${esc(dekInfo(aktif).karya === "kuhperdata-1847" ? "KUHPerdata" : "")})</option>` : ""}
        <option value="bab" ${mode === "bab" ? "selected" : ""}>Bab</option>
        <option value="rentang" ${mode === "rentang" ? "selected" : ""}>Rentang nomor pasal</option>
        <option value="nomor" ${mode === "nomor" ? "selected" : ""}>Ketik nomor pasal</option></select>
        <span class="meta" id="lokasi-skor"></span></label>
      <div id="lokasi-soal" class="kosong">Memuat dek…</div>`;
    $("#lokasi-dek").addEventListener("change", (e) => { setHash({ dek: e.target.value }); renderLokasi(); });
    $("#lokasi-mode").addEventListener("change", (e) => { setHash({ mode: e.target.value }); renderLokasi(); });
    const dekList = mode === "buku" ? await Promise.all(kodif.map((d) => muatDek(d.id))) : [await muatDek(aktif)];
    soalLokasiBaru(dekList, $("#lokasi-mode").value);
  }
  function skorLokasi() { const g = state.game.lokasi; $("#lokasi-skor").textContent = `Sesi ini: ${g.benar} benar dari ${g.main} soal · poin ${state.poin.total}`; }
  function soalLokasiBaru(dekList, mode) {
    const soal = soalLokasi(dekList, mode);
    const wadah = $("#lokasi-soal");
    wadah.className = "";
    let selesai = false;
    skorLokasi();
    const jawab = (nilai, pilihId) => {
      if (selesai) return; selesai = true; hentikanTimer();
      catatGame(state, "lokasi", nilai > 0, kini()); simpanState(); skorLokasi();
      wadah.querySelectorAll("button.opsi").forEach((b) => {
        if (b.dataset.id === soal.jawaban) b.classList.add("benar");
        else if (b.dataset.id === pilihId) b.classList.add("salah");
        b.disabled = true;
      });
      $("#lokasi-hasil").innerHTML = `${nilai === 2 ? "✔ Tepat." : nilai === 1 ? "◐ Bab benar, nomor meleset." : "✘ Belum."} Jawaban: <strong>Pasal ${esc(soal.kartu.n)}</strong> — Bab ${esc(soal.bab.nomor)} ${esc(bersihkanJudul(soal.bab.judul))} (Pasal ${soal.bab.awal}–${soal.bab.akhir}) · ${esc(soal.dek.nama)} ${pitaStatus(soal.kartu.s)} <a href="${tautanPasal(soal.dek, soal.kartu)}">baca →</a>
        <div style="margin-top:8px"><button class="aksi" id="lokasi-lanjut">Soal berikutnya (Enter)</button></div>`;
      $("#lokasi-lanjut").addEventListener("click", () => soalLokasiBaru(dekList, mode));
      $("#lokasi-lanjut").focus();
    };
    wadah.innerHTML = `<div class="soal">
      <div class="meta" style="display:flex;justify-content:space-between"><span>${soal.mode === "buku" ? "Buku mana?" : soal.mode === "bab" ? "Bab mana?" : soal.mode === "rentang" ? "Rentang pasal mana?" : "Pasal berapa?"}</span><span class="timer" id="lokasi-timer">10.0 s</span></div>
      <div class="bar"><i id="lokasi-bar" style="width:100%"></i></div>
      <div class="teks">${esc(soal.teks)}</div>
      <div id="lokasi-opsi" style="margin-top:12px">${soal.pilihan
        ? soal.pilihan.map((p, i) => `<button class="opsi" data-id="${esc(p.id)}"><span class="no">${i + 1}</span>${esc(p.label)}</button>`).join("")
        : `<form id="lokasi-form" style="display:flex;gap:8px"><input type="text" inputmode="numeric" id="lokasi-nomor" placeholder="mis. 1320" aria-label="Nomor pasal" autocomplete="off"><button class="aksi" type="submit">Jawab</button></form>`}</div>
      <div id="lokasi-hasil" style="margin-top:10px;font-size:.9rem"></div></div>`;
    if (soal.pilihan) wadah.querySelectorAll("button.opsi").forEach((b) => b.addEventListener("click", () => jawab(nilaiLokasi(soal, b.dataset.id), b.dataset.id)));
    else { $("#lokasi-form").addEventListener("submit", (e) => { e.preventDefault(); jawab(nilaiLokasi(soal, $("#lokasi-nomor").value), null); }); $("#lokasi-nomor").focus(); }
    mulaiTimer(10, $("#lokasi-timer"), $("#lokasi-bar"), () => jawab(0, null));
    wadah.onkeydown = (e) => {
      if (!selesai && soal.pilihan && /^[1-4]$/.test(e.key)) { const b = wadah.querySelectorAll("button.opsi")[+e.key - 1]; if (b) b.click(); }
      else if (selesai && e.key === "Enter") { e.preventDefault(); soalLokasiBaru(dekList, mode); }
    };
    wadah.setAttribute("tabindex", "-1"); if (soal.pilihan) wadah.focus();
  }

  // ----- Instrumen -----
  async function renderInstrumen() {
    const el = $("#panel-instrumen");
    const berNaungan = IDX.dek.filter((d) => d.n.dinaungi > 0).map((d) => d.id);
    const aktif = hashObj().dek && dekInfo(hashObj().dek) ? hashObj().dek : (berNaungan[0] ?? IDX.dek[0].id);
    el.innerHTML = `<div class="sub">Sebuah pasal ditampilkan; jawab <em>instrumen apa</em> yang tercatat menaunginya — atau bahwa tidak ada. Jawabannya selalu diambil dari anotasi pencabutan yang terarsip, bukan dari penilaian siapa pun. Dek tanpa naungan tetap bisa dimainkan: jawabannya selalu "tidak dinaungi", dan itu sendiri pelajaran.</div>
      ${selectDek("instrumen-dek", aktif)}<span class="meta" id="instrumen-skor"></span>
      <div id="instrumen-soal" class="kosong">Memuat…</div>`;
    $("#instrumen-dek").addEventListener("change", (e) => { setHash({ dek: e.target.value }); renderInstrumen(); });
    const [dek, peta] = await Promise.all([muatDek(aktif), muatPeta(dekInfo(aktif).karya)]);
    soalInstrumenBaru(dek, peta);
  }
  function soalInstrumenBaru(dek, peta) {
    const soal = soalInstrumen(dek, peta);
    const wadah = $("#instrumen-soal");
    wadah.className = "";
    const g = state.game.instrumen; $("#instrumen-skor").textContent = `Sesi ini: ${g.benar} benar dari ${g.main} soal`;
    let selesai = false;
    wadah.innerHTML = `<div class="soal">
      <div class="meta">Pasal <strong>${esc(soal.kartu.n)}</strong> · Bab ${esc(soal.bab.nomor)} ${esc(bersihkanJudul(soal.bab.judul))} · ${esc(dek.nama)}</div>
      <div class="teks" style="margin-top:6px">${esc(soal.teks)}</div>
      <div style="margin-top:12px">${soal.pilihan.map((p, i) => `<button class="opsi" data-id="${esc(p.id)}"><span class="no">${i + 1}</span>${esc(p.label)}</button>`).join("")}</div>
      <div id="instrumen-hasil" style="margin-top:10px;font-size:.9rem"></div></div>`;
    const jawab = (pilih) => {
      if (selesai) return; selesai = true;
      const benar = benarInstrumen(soal, pilih);
      catatGame(state, "instrumen", benar, kini()); simpanState();
      wadah.querySelectorAll("button.opsi").forEach((b) => { if (soal.jawaban.includes(b.dataset.id)) b.classList.add("benar"); else if (b.dataset.id === pilih) b.classList.add("salah"); b.disabled = true; });
      const ket = soal.kartu.s === "d"
        ? soal.kartu.i.map((i) => { const v = dek.instrumen[i] ?? peta.instrumen[i]; return `<div class="kutip"><strong>${esc(v?.nama ?? i)}</strong>${v?.dasar ? ` · ${esc(v.dasar)}` : ""}<br>${esc(v?.kutipan ?? "")}${v?.jalur ? ` <a href="${esc(v.jalur)}">buka →</a>` : ""}</div>`; }).join("")
        : `<p class="kecil">Tidak ada anotasi pencabutan sebagian/bersyarat pada pasal ini maupun bab/bukunya. ${soal.kartu.mk ? "Ada anotasi putusan MK — lihat halaman baca." : ""}</p>`;
      $("#instrumen-hasil").innerHTML = `${benar ? "✔ Benar." : "✘ Belum."} ${pitaStatus(soal.kartu.s)} <a href="${tautanPasal(dek, soal.kartu)}">baca Pasal ${esc(soal.kartu.n)} →</a>${ket}
        <button class="aksi" id="instrumen-lanjut">Soal berikutnya (Enter)</button>`;
      $("#instrumen-lanjut").addEventListener("click", () => soalInstrumenBaru(dek, peta)); $("#instrumen-lanjut").focus();
      $("#instrumen-skor").textContent = `Sesi ini: ${g.benar} benar dari ${g.main} soal`;
    };
    wadah.querySelectorAll("button.opsi").forEach((b) => b.addEventListener("click", () => jawab(b.dataset.id)));
    wadah.onkeydown = (e) => {
      if (!selesai && /^[1-9]$/.test(e.key)) { const b = wadah.querySelectorAll("button.opsi")[+e.key - 1]; if (b) b.click(); }
      else if (selesai && e.key === "Enter") { e.preventDefault(); soalInstrumenBaru(dek, peta); }
    };
    wadah.setAttribute("tabindex", "-1"); wadah.focus();
  }

  // ----- Kartu -----
  async function renderKartu() {
    const el = $("#panel-kartu");
    const aktif = dekPilihan();
    el.innerHTML = `<div class="sub">Kartu arah <em>isi → nomor</em> (dan <em>istilah → definisi</em> bila peraturannya punya Pasal 1 Ketentuan Umum). Nyatakan dulu seberapa yakin Anda ingat, baru buka — skor kalibrasi ditampilkan setara akurasi. Kartu dianggap tuntas setelah tiga kali berhasil diingat pada tiga hari berbeda.</div>
      ${selectDek("kartu-dek", aktif)}
      <label class="pilih kecil">Kartu baru per hari <input type="number" id="kartu-kap" min="1" max="200" value="${state.atur.kapasitas}" style="width:80px"></label>
      <div id="kartu-stat"></div><div id="kartu-isi" class="kosong">Memuat dek…</div><div id="kartu-sinkron"></div>`;
    $("#kartu-dek").addEventListener("change", (e) => { setHash({ dek: e.target.value }); renderKartu(); });
    $("#kartu-kap").addEventListener("change", (e) => { state.atur.kapasitas = Math.max(1, Math.min(200, +e.target.value || 20)); simpanState(); renderKartu(); });
    const dek = await muatDek(aktif);
    // pangkas state kartu yang unitnya sudah tak ada di dek terbit
    if (pangkas(state, dek.id, kunciDek(dek))) simpanState();
    kartuBerikut(dek);
    renderSinkron();
  }
  function statKartu(dek) {
    const q = antrean(state, dek, kini());
    const kal = kalibrasi(state.kal);
    $("#kartu-stat").innerHTML = `<div class="stat"><span>Jatuh tempo <b>${q.nDue}</b></span><span>Baru tersedia <b>${q.baru.length}</b></span><span>Tuntas <b>${q.tuntas}</b>/${q.total}</span>
      <span>Akurasi <b>${kal.akurasi == null ? "–" : Math.round(kal.akurasi * 100) + "%"}</b></span><span>Kalibrasi (Brier) <b>${kal.brier == null ? "–" : kal.brier.toFixed(2)}</b> <span class="meta">makin kecil makin baik</span></span><span>Poin <b>${state.poin.total}</b></span></div>
      ${q.terkunci ? `<div class="notice">Kartu baru dikunci: ${q.nDue} kartu jatuh tempo, lebih dari dua kali kapasitas harian (${state.atur.kapasitas}). Ini disengaja — selesaikan yang jatuh tempo dulu.</div>` : ""}
      <details><summary>Tabel keandalan keyakinan</summary><table class="kal"><tr><th>Keyakinan</th><th>Diprediksi</th><th>Diulas</th><th>Berhasil</th><th>Terjadi</th></tr>
      ${kal.perTingkat.map((t) => `<tr><td>${t.tingkat}</td><td>${Math.round(t.p * 100)}%</td><td>${t.n}</td><td>${t.sukses}</td><td>${t.rasio == null ? "–" : Math.round(t.rasio * 100) + "%"}</td></tr>`).join("")}</table>
      <p class="kecil meta">Kalibrasi baik = kolom "terjadi" mendekati "diprediksi". Keyakinan 5 yang ternyata salah adalah sinyal paling berharga.</p></details>`;
    return q;
  }
  function kartuBerikut(dek) {
    const q = statKartu(dek);
    const wadah = $("#kartu-isi");
    const kunci = q.due[0] ?? q.baru[0];
    wadah.className = "";
    if (!kunci) { wadah.innerHTML = `<div class="kosong">Tidak ada kartu jatuh tempo${q.terkunci ? "" : " dan jatah kartu baru hari ini sudah terpakai"}. Kembali besok, atau naikkan kapasitas harian.</div>`; return; }
    const { unit, arah } = uraiKunci(kunci);
    const baru = !state.kartu[kunci];
    let depan, belakang, status = "h";
    if (arah === "istilah") {
      const [k, nama] = unit.split("#");
      const ist = (dek.istilah ?? []).find((i) => i.k === k && i.i === nama);
      depan = `<div class="meta">Istilah · ${esc(dek.nama)}</div><div class="teks" style="font-size:1.2rem;font-weight:700">${esc(nama)}</div><div class="meta">Apa definisinya menurut Pasal 1?</div>`;
      belakang = `<div class="teks">${esc(ist?.d ?? "")}</div><div class="meta" style="margin-top:6px">Pasal 1 angka ${esc(ist?.n ?? "")} · <a href="${esc(dek.jalur)}${anchorPasal("pasal-1")}">baca →</a></div>`;
    } else {
      const k = dek.kartu.find((c) => c.k === unit);
      const bab = babDari(dek, k.c);
      status = k.s;
      depan = `<div class="meta">${esc(dek.nama)}${baru ? " · <em>kartu baru</em>" : ""}</div><div class="teks">${esc(k.t)}</div><div class="meta" style="margin-top:6px">Pasal berapa, bab apa?</div>`;
      belakang = `<div style="font-size:1.15rem"><strong>Pasal ${esc(k.n)}</strong> — Bab ${esc(bab.nomor)} ${esc(bersihkanJudul(bab.judul))} <span class="meta">(Pasal ${bab.awal}–${bab.akhir})</span></div>
        <div style="margin-top:6px">${pitaStatus(k.s)}${k.v === "o" ? `<span class="pita o" title="Teks unit ini hasil reparasi cacat OCR yang bercatatan kurasi">teks reparasi bercatatan</span>` : ""}${k.mk ? `<span class="pita o">ada anotasi putusan MK</span>` : ""} <a href="${tautanPasal(dek, k)}">baca →</a></div>
        ${k.s === "d" ? k.i.map((i) => { const v = dek.instrumen[i]; return `<div class="kutip"><strong>${esc(v?.nama ?? i)}</strong>${v?.dasar ? ` · ${esc(v.dasar)}` : ""}<br>${esc(v?.kutipan ?? "")}</div>`; }).join("") : ""}`;
    }
    let tingkat = null;
    wadah.innerHTML = `<div class="soal">${depan}
      <div class="keyakinan" role="radiogroup" aria-label="Seberapa yakin Anda ingat jawabannya?">${[1, 2, 3, 4, 5].map((t) => `<label><input type="radio" name="yakin" value="${t}">${t} · ${Math.round(P_SLIDER[t] * 100)}%</label>`).join("")}</div>
      <button class="aksi" id="kartu-buka" disabled>Buka jawaban</button> <span class="meta">pilih keyakinan dulu (tombol 1–5, lalu Spasi)</span>
      <div id="kartu-belakang" hidden style="margin-top:14px;border-top:1px dashed var(--line);padding-top:12px">${belakang}
        <div class="nilai">${[["Lupa", "ulang hari ini"], ["Sulit", ""], ["Baik", ""], ["Mudah", ""]].map(([n, k], i) => `<button data-nilai="${i + 1}">${i + 1} · ${n}<small>${k}</small></button>`).join("")}</div></div></div>`;
    const radios = wadah.querySelectorAll('input[name="yakin"]');
    radios.forEach((r) => r.addEventListener("change", () => { tingkat = +r.value; radios.forEach((x) => x.parentElement.classList.toggle("aktif", x.checked)); $("#kartu-buka").disabled = false; }));
    const buka = () => { if (tingkat == null) return; $("#kartu-belakang").hidden = false; $("#kartu-buka").disabled = true; radios.forEach((r) => (r.disabled = true)); wadah.querySelector(".nilai button[data-nilai='3']").focus(); };
    $("#kartu-buka").addEventListener("click", buka);
    let dinilai = false;
    wadah.querySelectorAll(".nilai button").forEach((b) => b.addEventListener("click", () => {
      if (dinilai || $("#kartu-belakang").hidden) return; dinilai = true;
      const r = catatUlasan(state, kunci, +b.dataset.nilai, tingkat, kini());
      simpanState();
      const ket = r.hasil.intervalHari === 0 ? "diulang lagi hari ini" : `berikutnya ${r.hasil.intervalHari} hari lagi`;
      wadah.insertAdjacentHTML("beforeend", `<div class="meta" style="margin:6px 4px">${ket}${r.poin ? " · +1 poin" : ""}${state.kartu[kunci].ok ? " · ✔ tuntas (3 hari berbeda)" : ""}</div>`);
      setTimeout(() => kartuBerikut(dek), 650);
    }));
    wadah.onkeydown = (e) => {
      const belakangTerbuka = !$("#kartu-belakang").hidden;
      if (!belakangTerbuka && /^[1-5]$/.test(e.key)) { e.preventDefault(); radios[+e.key - 1].click(); wadah.focus(); }
      else if (!belakangTerbuka && (e.key === " " || e.code === "Space" || e.key === "Spacebar" || e.key === "Enter" || e.key === "Return") && tingkat != null) { e.preventDefault(); buka(); }
      else if (belakangTerbuka && /^[1-4]$/.test(e.key)) { wadah.querySelector(`.nilai button[data-nilai='${e.key}']`).click(); }
    };
    wadah.setAttribute("tabindex", "-1"); wadah.focus();
  }

  // ----- sinkron Supabase -----
  const sb = window.carihukumAuth ?? null;
  let sesiUser = null;
  const kotor = new Set();
  let dorongTimer = null;
  const tulisStatusSinkron = (t) => { const el = $("#sinkron-status"); if (el) el.textContent = t; };
  async function renderSinkron() {
    const el = $("#kartu-sinkron"); if (!el) return;
    if (!sb) { el.innerHTML = `<p class="kecil meta">Progres tersimpan di peramban ini. <a href="/akun/">Masuk</a> untuk menyinkronkan antar-perangkat.</p>${tombolEkspor()}`; pasangEkspor(); return; }
    const { data } = await sb.auth.getSession();
    sesiUser = data?.session?.user ?? null;
    if (!sesiUser) { el.innerHTML = `<p class="kecil meta">Progres tersimpan di peramban ini. <a href="/akun/">Masuk</a> untuk menyinkronkan antar-perangkat.</p>${tombolEkspor()}`; pasangEkspor(); return; }
    el.innerHTML = `<p class="kecil meta">Sinkron sebagai akun Anda · <span id="sinkron-status">memeriksa…</span> · <button class="opsi" style="display:inline;width:auto;padding:3px 9px;margin:0" id="sinkron-hapus">Hapus data belajar di server</button></p>${tombolEkspor()}`;
    pasangEkspor();
    $("#sinkron-hapus").addEventListener("click", hapusServer);
    await tarik();
  }
  const tombolEkspor = () => `<p class="kecil"><button class="opsi" style="display:inline;width:auto;padding:3px 9px;margin:0" id="sinkron-ekspor">Ekspor progres (JSON)</button> <button class="opsi" style="display:inline;width:auto;padding:3px 9px;margin:0" id="sinkron-reset">Hapus progres di peramban ini</button></p>`;
  function pasangEkspor() {
    $("#sinkron-ekspor")?.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }));
      a.download = `carihukum-belajar-${hariLokal(kini())}.json`; a.click(); URL.revokeObjectURL(a.href);
    });
    $("#sinkron-reset")?.addEventListener("click", () => { if (confirm("Hapus seluruh progres belajar di peramban ini?")) { state = stateBaru(kini()); simpan(store, state); renderKartu(); } });
  }
  const tabelTiada = (err) => err && (err.code === "42P01" || err.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(err.message ?? ""));
  async function tarik() {
    try {
      const { data: baris, error } = await sb.from("belajar_kartu").select("*");
      if (error) { tulisStatusSinkron(tabelTiada(error) ? "sinkron belum diaktifkan di server (tabel belum dibuat — docs/07)" : `gagal menarik: ${error.message}`); return; }
      const { data: ringkas, error: e2 } = await sb.from("belajar_ringkas").select("*").maybeSingle();
      if (e2 && !tabelTiada(e2)) { tulisStatusSinkron(`gagal menarik ringkasan: ${e2.message}`); return; }
      const jauh = { ...stateBaru(kini()), kartu: {}, diperbarui: ringkas?.u ? new Date(ringkas.u).getTime() : 0 };
      for (const b of baris ?? []) jauh.kartu[b.kunci] = dariBaris(b);
      if (ringkas) Object.assign(jauh, { atur: ringkas.atur, kal: ringkas.kal, poin: ringkas.poin, game: ringkas.game, harian: ringkas.harian ?? jauh.harian });
      const sebelum = JSON.stringify(state.kartu);
      state = gabungLWW(state, jauh);
      simpan(store, state);
      // kunci lokal yang lebih baru daripada server → dorong
      for (const [k, v] of Object.entries(state.kartu)) if (!jauh.kartu[k] || (jauh.kartu[k].u ?? 0) < (v.u ?? 0)) kotor.add(k);
      if (kotor.size) await dorong();
      tulisStatusSinkron(`tersinkron · ${Object.keys(state.kartu).length} kartu`);
      if (sebelum !== JSON.stringify(state.kartu)) renderKartu();
    } catch (e) { tulisStatusSinkron(`gagal: ${e.message}`); }
  }
  function jadwalkanDorong() {
    if (!sb || !sesiUser) return;
    for (const k of Object.keys(state.kartu)) if ((state.kartu[k].u ?? 0) >= state.diperbarui - 1) kotor.add(k);
    clearTimeout(dorongTimer); dorongTimer = setTimeout(dorong, 3000);
  }
  async function dorong() {
    if (!sb || !sesiUser) return;
    try {
      const kunci = [...kotor];
      for (let i = 0; i < kunci.length; i += 200) {
        const potongan = kunci.slice(i, i + 200).filter((k) => state.kartu[k]).map((k) => keBaris(sesiUser.id, k, state.kartu[k]));
        if (!potongan.length) continue;
        const { error } = await sb.from("belajar_kartu").upsert(potongan, { onConflict: "user_id,kunci" });
        if (error) { tulisStatusSinkron(tabelTiada(error) ? "sinkron belum diaktifkan di server" : `gagal mendorong: ${error.message}`); return; }
      }
      const { error: e2 } = await sb.from("belajar_ringkas").upsert({ user_id: sesiUser.id, atur: state.atur, kal: state.kal, poin: state.poin, game: state.game, harian: state.harian, u: new Date(state.diperbarui).toISOString() });
      if (e2 && !tabelTiada(e2)) { tulisStatusSinkron(`gagal mendorong ringkasan: ${e2.message}`); return; }
      kotor.clear();
      tulisStatusSinkron(`tersinkron ${new Date().toLocaleTimeString("id-ID")} · ${Object.keys(state.kartu).length} kartu`);
    } catch (e) { tulisStatusSinkron(`gagal: ${e.message}`); }
  }
  async function hapusServer() {
    if (!sb || !sesiUser || !confirm("Hapus seluruh data belajar Anda di server? Data di peramban ini tetap ada.")) return;
    await sb.from("belajar_kartu").delete().eq("user_id", sesiUser.id);
    await sb.from("belajar_ringkas").delete().eq("user_id", sesiUser.id);
    tulisStatusSinkron("data server dihapus; sinkron berhenti sampai halaman dimuat ulang");
    sesiUser = null;
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && kotor.size) dorong(); });

  // mulai
  const awal = hashObj().panel && tampil[hashObj().panel] ? hashObj().panel : "peta";
  bukaPanel(awal);
}

if (typeof document !== "undefined" && typeof window !== "undefined" && window.DATA_BELAJAR) init();
