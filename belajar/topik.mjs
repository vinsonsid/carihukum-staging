/**
 * Perilaku halaman Topik (docs/28): /belajar/topik/<t>/ (progres per subtopik)
 * dan /belajar/topik/<t>/<s>/ (ronde adaptif A → Peta 60 Detik → B → Mikro,
 * plus ulangan konsep terjadwal FSRS).
 *
 * Logika ada di ronde.mjs (murni, diuji Node); berkas ini hanya DOM. Progres:
 * localStorage lewat state.mjs — `game.topik` untuk tahap ronde dan kartu
 * berkunci "topik:<t>/<s>|<konsep>|konsep" untuk jadwal ulang. Tak ada log
 * per jawaban yang disimpan atau dikirim (docs/20 §6).
 */
import { muat, simpan, catatUlasan, catatKeyakinan, uraiKunci, hariLokal, P_SLIDER } from "./state.mjs";
import { susunRonde, ringkasRonde, transisi, calibrationFlag, nilaiDariFlag, petaPrimer, soalMekanis,
  bisaMekanis, siapkanEditorial, konsepPasal, kocok, gabungSalah, ANGLE_MEKANIS } from "./ronde.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const NAMA_TAHAP = { A: "Ronde A", B: "Ronde B", MIKRO: "Soal Mikro", PETA: "Peta 60 Detik", LULUS: "Lulus", LULUS_BERSYARAT: "Lulus bersyarat", ULANG: "Ulangan" };
const NAMA_FLAG = { WRONG_CONFIDENT: "salah padahal yakin", WRONG: "salah", WRONG_AWARE: "salah dan sadar ragu", RIGHT_UNSURE: "benar tapi ragu", RIGHT_OK: "benar", MASTERED: "benar dan yakin" };
const NAMA_ANGLE = { isi_ke_pasal: "isi → pasal", pasal_ke_isi: "pasal → isi", lokasi_pasal: "lokasi pasal", klasifikasi: "asal peraturan",
  definisi: "definisi", kasus_hitungan: "kasus hitungan", kasus_penerapan: "kasus penerapan", negasi: "negasi", jebakan: "jebakan", pasangan_tertukar: "pasangan tertukar" };
const URUT_FLAG = ["WRONG_CONFIDENT", "WRONG", "WRONG_AWARE", "RIGHT_UNSURE", "RIGHT_OK", "MASTERED"];

const store = (() => { try { return window.localStorage; } catch { return null; } })();
const kini = () => Date.now();
let state = muat(store, kini());
const simpanState = () => { state.diperbarui = kini(); simpan(store, state); };
const progresDari = (kunci) => state.game.topik?.[kunci] ?? null;
const ringkasTahap = (p) => !p ? "belum dimulai" : p.tahap === "LULUS" || p.tahap === "LULUS_BERSYARAT"
  ? `${NAMA_TAHAP[p.tahap]}${p.skor?.B != null ? ` · B ${Math.round(p.skor.B * 100)}%` : p.skor?.A != null ? ` · A ${Math.round(p.skor.A * 100)}%` : ""}`
  : `sedang: ${NAMA_TAHAP[p.tahap] ?? p.tahap}`;

const data = (() => { const el = document.getElementById("data-topik"); return el ? JSON.parse(el.textContent) : null; })();
if (data?.halaman === "topik") halamanTopik();
if (data?.halaman === "subtopik") halamanSubtopik().catch((e) => { const el = $("#latihan-isi"); if (el) el.innerHTML = `<p class="kosong">Gagal memuat latihan: ${esc(e.message)}</p>`; });

function halamanTopik() {
  for (const li of document.querySelectorAll("[data-sub]")) {
    const p = progresDari(li.dataset.sub);
    const el = li.querySelector("[data-progres]");
    if (el) { el.textContent = ringkasTahap(p); if (p) el.classList.add(p.tahap.startsWith("LULUS") ? "lulus" : "jalan"); }
  }
}

async function halamanSubtopik() {
  const kunciSub = `${data.topik}/${data.sub}`;
  const dekKonsep = `topik:${kunciSub}`;
  const r = await fetch(data.api);
  if (!r.ok) throw new Error(`${data.api}: ${r.status}`);
  const kolam = await r.json();
  const wadah = $("#latihan-isi");
  const bahan = $("#bahan");

  const prog = () => (state.game.topik[kunciSub] ??= { tahap: "A", skor: {}, salah: [], u: kini() });
  const labelKonsep = (c) => {
    if (kolam.konsep?.[c]) return kolam.konsep[c].judul;
    const p = kolam.pasal.find((x) => konsepPasal(x) === c);
    return p ? `Pasal ${p.n} ${kolam.karya[p.karya]?.nama ?? ""}` : c;
  };
  const tautSumber = (sumber) => (sumber ?? []).map((s) => s.href ? `<a href="${esc(s.href)}">${esc(s.label)}</a>` : esc(s.label)).join(" · ");

  if (!kolam.pasal.length && !kolam.bank.length) { wadah.innerHTML = '<p class="kosong">Belum ada pasal terverifikasi yang dapat dijadikan soal di subtopik ini.</p>'; return; }

  // ---------- layar beranda latihan menurut tahap ----------
  function beranda() {
    bahan.hidden = false;
    const p = state.game.topik[kunciSub];
    const tahap = p?.tahap ?? "A";
    if (tahap === "PETA") return layarPeta();
    if (tahap === "LULUS" || tahap === "LULUS_BERSYARAT") {
      wadah.innerHTML = `<div class="hasil-ronde ${tahap === "LULUS" ? "lulus" : "bersyarat"}"><strong>${NAMA_TAHAP[tahap]}.</strong>
        ${tahap === "LULUS_BERSYARAT" ? "Konsep yang masih meleset sudah dijadwalkan ulang — lihat Ulangan terjadwal." : ""}
        <span class="meta">${["A", "B", "MIKRO"].filter((k) => p.skor?.[k] != null).map((k) => `${NAMA_TAHAP[k]} ${Math.round(p.skor[k] * 100)}%`).join(" · ")}</span></div>
        <button class="aksi" id="ulang-a">Ulangi dari Ronde A</button>`;
      $("#ulang-a").addEventListener("click", () => { state.game.topik[kunciSub] = { tahap: "A", skor: {}, salah: [], u: kini() }; simpanState(); beranda(); });
      return;
    }
    const ket = {
      A: `20 soal dari ${kolam.pasal.length} pasal terverifikasi${kolam.bank.length ? ` dan ${kolam.bank.length} soal editorial` : ""} subtopik ini. Lulus pada ≥ 80 %. Nyatakan keyakinan (1–5) sebelum memilih jawaban; pelajaran disembunyikan selama ronde berjalan.`,
      B: "20 soal baru dari sudut yang berbeda — bukan soal Ronde A yang diulang.",
      MIKRO: `Soal yang membidik ${new Set((p?.salah ?? []).map((x) => x.c)).size} konsep yang meleset, dimulai dari yang salah padahal yakin.`
    }[tahap];
    wadah.innerHTML = `<p>${esc(ket)}</p><button class="aksi" id="mulai">Mulai ${NAMA_TAHAP[tahap]}</button>`;
    $("#mulai").addEventListener("click", () => mulai(tahap));
  }

  function layarPeta() {
    const p = prog();
    const baris = petaPrimer(kolam, p.salah ?? []);
    wadah.innerHTML = `<div class="peta60"><div class="baris-antara"><strong>Peta 60 Detik</strong><span class="timer" id="peta-timer">60 s</span></div>
      <div class="bar"><i id="peta-bar"></i></div>
      <p class="kecil meta">Ronde A belum mencapai 80 %. Baca sekali konsep yang meleset, lalu kerjakan Ronde B. Tombol boleh ditekan lebih cepat.</p>
      <div class="gulir-x"><table class="mx"><thead><tr><th>Kata kunci</th><th>Isi</th><th>Sumber</th></tr></thead><tbody>
      ${baris.map((b) => `<tr><td><strong>${esc(b.kunci)}</strong>${b.lokasi ? `<br><span class="meta">${esc(b.lokasi)}</span>` : ""}</td><td>${b.isi_html ?? esc(b.isi)}</td><td class="kecil">${tautSumber(b.sumber)}</td></tr>`).join("")}
      </tbody></table></div>
      <button class="aksi" id="mulai-b">Mulai Ronde B</button></div>`;
    const t0 = kini();
    const timer = setInterval(() => {
      const sisa = Math.max(0, 60 - (kini() - t0) / 1000);
      const el = $("#peta-timer"); if (!el) { clearInterval(timer); return; }
      el.textContent = `${Math.ceil(sisa)} s`;
      $("#peta-bar").style.width = `${(100 * sisa) / 60}%`;
      if (sisa <= 0) { clearInterval(timer); el.classList.add("habis"); }
    }, 250);
    $("#mulai-b").addEventListener("click", () => { clearInterval(timer); prog().tahap = "B"; simpanState(); mulai("B"); });
  }

  // ---------- menjalankan satu ronde ----------
  function mulai(jenis, soalSiap = null) {
    const p = prog();
    // p.pakaiA = pasangan "konsep|sudut" Ronde A, agar Ronde B tak mengulangnya
    // meski halaman dimuat ulang di antaranya. Bukan log jawaban: tanpa benar/salah.
    const riwayatA = (p.pakaiA ?? []).map((x) => { const i = x.lastIndexOf("|"); return { concept_id: x.slice(0, i), angle: x.slice(i + 1) }; });
    const soal = soalSiap ?? susunRonde(kolam, jenis, { A: riwayatA, salah: p.salah ?? [] });
    if (!soal.length) { wadah.innerHTML = '<p class="kosong">Bahan subtopik ini terlalu sedikit untuk menyusun ronde.</p>'; return; }
    if (jenis === "A") { p.pakaiA = soal.map((s) => `${s.concept_id}|${s.angle}`); simpanState(); }
    bahan.hidden = true;  // P1: retrieval dulu, bahan bacaan disembunyikan selama ronde
    const jawaban = [];
    tampilSoal(0);

    function tampilSoal(i) {
      const s = soal[i];
      let tingkat = null, pakaiHint = false, selesai = false;
      wadah.innerHTML = `<div class="soal">
        <div class="meta baris-antara"><span>${NAMA_TAHAP[jenis]} · soal ${i + 1}/${soal.length} · ${esc(NAMA_ANGLE[s.angle] ?? s.angle)}</span>
          <span>${s.verification_status === "verifikasi" ? '<span class="pita d">perlu verifikasi</span>' : s.verification_status === "konflik_sumber" ? '<span class="pita c">konflik sumber</span>' : ""}${s.mekanis ? "" : '<span class="pita o">editorial</span>'}</span></div>
        <div class="bar"><i id="ronde-bar"></i></div>
        <p class="prompt">${esc(s.prompt)}</p>
        ${s.teks ? `<div class="teks">${esc(s.teks)}</div>` : ""}
        <div class="keyakinan" role="radiogroup" aria-label="Seberapa yakin Anda?">${[1, 2, 3, 4, 5].map((t) => `<label><input type="radio" name="yakin" value="${t}">${t} · ${Math.round(P_SLIDER[t] * 100)}%</label>`).join("")}</div>
        <p class="meta" id="pandu">Pilih keyakinan dulu (tombol 1–5); opsi terbuka sesudahnya.</p>
        ${s.hint ? `<button class="tautan" id="hint">Tampilkan petunjuk</button><p class="kecil" id="hint-isi" hidden>${esc(s.hint)}</p>` : ""}
        <div id="opsi">${s.options.map((o, k) => `<button class="opsi" data-id="${esc(o.id)}" disabled><span class="no">${k + 1}</span>${esc(o.text)}</button>`).join("")}</div>
        <div id="umpan"></div></div>`;
      $("#ronde-bar").style.width = `${(100 * i) / soal.length}%`;
      const radios = wadah.querySelectorAll('input[name="yakin"]');
      const tombol = wadah.querySelectorAll("button.opsi");
      radios.forEach((r) => r.addEventListener("change", () => {
        tingkat = +r.value;
        radios.forEach((x) => x.parentElement.classList.toggle("aktif", x.checked));
        tombol.forEach((b) => (b.disabled = false));
        $("#pandu").textContent = "Pilih jawaban (tombol 1–4).";
      }));
      if (s.hint) $("#hint").addEventListener("click", () => { pakaiHint = true; $("#hint-isi").hidden = false; $("#hint").hidden = true; });
      tombol.forEach((b) => b.addEventListener("click", () => jawab(b.dataset.id)));

      function jawab(pilih) {
        if (selesai || tingkat == null) return;
        selesai = true;
        const benar = pilih === s.correct_option_id;
        const flag = calibrationFlag(benar, tingkat);
        jawaban.push({ soal: s, pilih, tingkat, benar, flag, hint: pakaiHint });
        catatKeyakinan(state, tingkat, benar);
        radios.forEach((r) => (r.disabled = true));
        tombol.forEach((b) => { b.disabled = true; if (b.dataset.id === s.correct_option_id) b.classList.add("benar"); else if (b.dataset.id === pilih) b.classList.add("salah"); });
        const opsiPilih = s.options.find((o) => o.id === pilih);
        const verdik = benar ? (s.correct_feedback ?? "Tepat.") : (opsiPilih?.umpan_balik ?? "Belum tepat.");
        $("#umpan").innerHTML = `<div class="umpan ${benar ? "benar" : "salah"}"><strong>${benar ? "✔" : "✘"} ${esc(verdik)}</strong>
          ${flag === "WRONG_CONFIDENT" ? '<span class="pita c">salah padahal yakin</span>' : flag === "RIGHT_UNSURE" ? '<span class="pita d">benar tapi ragu</span>' : ""}
          <p>${esc(s.explanation)}</p><p class="kecil meta">Sumber: ${tautSumber(s.sumber)}</p></div>
          <button class="aksi" id="lanjut">${i + 1 < soal.length ? "Soal berikutnya (Enter)" : "Lihat ringkasan (Enter)"}</button>`;
        $("#lanjut").addEventListener("click", () => (i + 1 < soal.length ? tampilSoal(i + 1) : akhir()));
        $("#lanjut").focus();
      }
      wadah.onkeydown = (e) => {
        if (!selesai && tingkat == null && /^[1-5]$/.test(e.key)) { e.preventDefault(); radios[+e.key - 1].click(); }
        else if (!selesai && tingkat != null && /^[1-4]$/.test(e.key)) { e.preventDefault(); tombol[+e.key - 1]?.click(); }
        else if (selesai && e.key === "Enter" && document.activeElement?.id !== "lanjut") { e.preventDefault(); $("#lanjut").click(); }
      };
      wadah.setAttribute("tabindex", "-1");
      wadah.focus();
    }

    function akhir() {
      const rk = ringkasRonde(jawaban, P_SLIDER);
      jadwalkan(jawaban);
      let berikut = null;
      if (jenis !== "ULANG") {
        const p = prog();
        p.skor[jenis] = rk.skor;
        if (jenis === "A") p.salah = rk.salah;
        else if (jenis === "B") p.salah = gabungSalah(p.salah ?? [], rk.salah);
        berikut = transisi(jenis, rk);
        p.tahap = berikut;
        p.u = kini();
      }
      simpanState();
      bahan.hidden = false;
      const flagUrut = URUT_FLAG.filter((f) => rk.flag[f]);
      const salahKonsep = Object.entries(rk.salahPerKonsep);
      const wc = [...new Set(jawaban.filter((j) => j.flag === "WRONG_CONFIDENT").map((j) => j.soal.concept_id))];
      wadah.innerHTML = `<div class="hasil-ronde ${rk.lulus ? "lulus" : "belum"}"><strong>${NAMA_TAHAP[jenis]}: ${rk.benar}/${rk.total} (${Math.round(rk.skor * 100)}%)</strong>
          ${jenis === "ULANG" ? "" : rk.lulus ? " — lulus ambang 80 %." : " — belum mencapai 80 %."}</div>
        ${wc.length ? `<div class="notice"><strong>Salah padahal yakin (${wc.length} konsep)</strong> — sinyal paling berharga: miskonsepsi yang tertanam.<ul>${wc.map((c) => `<li>${esc(labelKonsep(c))}</li>`).join("")}</ul></div>` : ""}
        <div class="stat">${flagUrut.map((f) => `<span><b>${rk.flag[f]}</b> ${esc(NAMA_FLAG[f])}</span>`).join("")}
          ${rk.gap != null ? `<span>Selisih kalibrasi <b>${rk.gap >= 0 ? "+" : ""}${Math.round(rk.gap * 100)}</b> poin <span class="meta">${rk.gap > 0.1 ? "terlalu yakin" : rk.gap < -0.1 ? "terlalu ragu" : "terkalibrasi"}</span></span>` : ""}
          ${jawaban.some((j) => j.hint) ? `<span><b>${jawaban.filter((j) => j.hint).length}</b> petunjuk dipakai</span>` : ""}</div>
        ${salahKonsep.length ? `<h3>Yang meleset, per konsep</h3><ul class="kecil">${salahKonsep.map(([c, ids]) => `<li>${esc(labelKonsep(c))}${ids.length > 1 ? ` <span class="meta">(${ids.length} soal)</span>` : ""}</li>`).join("")}</ul>` : ""}
        <h3>Salah per sudut soal</h3><table class="kal"><tr><th>Sudut</th><th>Soal</th><th>Salah</th></tr>
          ${Object.entries(rk.perAngle).map(([a, v]) => `<tr><td>${esc(NAMA_ANGLE[a] ?? a)}</td><td>${v.n}</td><td>${v.salah}</td></tr>`).join("")}</table>
        <p class="kecil meta">Banyak salah di "pasal → isi" atau "isi → pasal" berarti yang lemah hafalan nomor; banyak salah di "asal peraturan" berarti batas antarlembaga jaminan belum tegas.</p>
        <button class="aksi" id="lanjut-tahap">${jenis === "ULANG" ? "Selesai" : berikut === "PETA" ? "Buka Peta 60 Detik" : berikut === "MIKRO" ? "Mulai Soal Mikro" : "Selesai"}</button>`;
      $("#lanjut-tahap").addEventListener("click", () => {
        if (berikut === "MIKRO") mulai("MIKRO");
        else beranda();
        tampilUlangan();
      });
      tampilUlangan();
    }
  }

  /**
   * SRS: tiap konsep yang muncul dijadwalkan ulang FSRS menurut flag TERBURUK-nya
   * di ronde ini. Soal berstatus verifikasi/konflik_sumber tak masuk antrean inti.
   */
  function jadwalkan(jawaban) {
    const terburuk = new Map();
    for (const j of jawaban) {
      if (j.soal.verification_status && j.soal.verification_status !== "verified") continue;
      const lama = terburuk.get(j.soal.concept_id);
      if (!lama || URUT_FLAG.indexOf(j.flag) < URUT_FLAG.indexOf(lama)) terburuk.set(j.soal.concept_id, j.flag);
    }
    // Spesifikasi §11: titik masuk paling cepat H+1. FSRS tanpa learning steps
    // mengembalikan "Lupa" ke hari ini; untuk kartu konsep jatuh tempo ditunda ke
    // besok siang — stabilitas & kesulitan FSRS tak disentuh, hanya tanggalnya.
    const besok = new Date(kini()); besok.setDate(besok.getDate() + 1); besok.setHours(12, 0, 0, 0);
    for (const [c, f] of terburuk) {
      const kunci = `${dekKonsep}|${c}|konsep`;
      catatUlasan(state, kunci, nilaiDariFlag(f), null, kini(), { hitungHarian: false });
      if (state.kartu[kunci].due < besok.getTime()) state.kartu[kunci].due = besok.getTime();
    }
  }

  // ---------- ulangan terjadwal ----------
  function konsepJatuhTempo() {
    const hari = hariLokal(kini());
    return Object.keys(state.kartu).filter((k) => k.startsWith(dekKonsep + "|") && hariLokal(state.kartu[k].due) <= hari)
      .sort((a, b) => state.kartu[a].due - state.kartu[b].due).map((k) => uraiKunci(k).unit);
  }
  function tampilUlangan() {
    const sec = $("#ulangan"), isi = $("#ulangan-isi");
    const jatuh = konsepJatuhTempo();
    const terjadwal = Object.keys(state.kartu).filter((k) => k.startsWith(dekKonsep + "|")).length;
    if (!terjadwal) { sec.hidden = true; return; }
    sec.hidden = false;
    isi.innerHTML = jatuh.length
      ? `<p>${jatuh.length} konsep jatuh tempo hari ini. Tiap konsep ditanyakan dari sudut yang berbeda dari sebelumnya bila tersedia.</p><button class="aksi" id="mulai-ulang">Ulang ${Math.min(jatuh.length, 20)} konsep</button>`
      : `<p class="kecil meta">${terjadwal} konsep terjadwal; tidak ada yang jatuh tempo hari ini.</p>`;
    if (jatuh.length) $("#mulai-ulang").addEventListener("click", () => mulai("ULANG", soalUlangan(jatuh.slice(0, 20))));
  }
  function soalUlangan(konsep) {
    const keluar = [];
    for (const c of konsep) {
      const ed = kolam.bank.filter((s) => s.concept_id === c);
      if (ed.length) { keluar.push(siapkanEditorial(ed[Math.floor(Math.random() * ed.length)], Math.random)); continue; }
      const p = kolam.pasal.find((x) => konsepPasal(x) === c);
      const a = p && kocok(ANGLE_MEKANIS, Math.random).find((x) => bisaMekanis(kolam, p, x));
      if (a) keluar.push(soalMekanis(kolam, p, a));
    }
    return keluar;
  }

  beranda();
  tampilUlangan();
}
