/**
 * Mesin ronde latihan adaptif per subtopik (docs/28; spesifikasi pemilik
 * docs/rujukan/2026-09-30-metode-latihan-soal-adaptif.md).
 *
 * Murni: tak menyentuh DOM, jaringan, maupun penyimpanan. Diuji Node
 * (tests/ronde.test.mjs) dan dijalankan peramban apa adanya.
 *
 * Alur: A (20 soal) → lulus ≥ 80 % → LULUS; gagal → PETA (60 detik, tanpa kuis)
 * → B (20 soal baru, sudut berbeda) → lulus → LULUS; gagal → MIKRO (8–10 soal
 * dari KONSEP yang salah, bukan soal yang sama) → LULUS_BERSYARAT.
 *
 * Bank soal = soal editorial `terbit` (bila ada) + soal MEKANIS yang dibangkitkan
 * di sini dari kolam pasal terverifikasi. Konsep soal mekanis = pasalnya sendiri
 * ("ps:<karya>/<pasal>"), jadi remediasi dan SRS bekerja tanpa konten editorial.
 */
import { NILAI } from "./fsrs.mjs";

export const AMBANG = 0.8;
export const UKURAN = Object.freeze({ A: 20, B: 20, MIKRO_MIN: 8, MIKRO_MAKS: 10 });
/** Sudut yang bisa dibangkitkan mesin dari teks pasal — tanpa klaim doktrin. */
export const ANGLE_MEKANIS = ["isi_ke_pasal", "pasal_ke_isi", "lokasi_pasal", "klasifikasi"];
/**
 * Bobot sudut mekanis per ronde (spesifikasi §5, P3): A didominasi isi → pasal,
 * B memutar ke pasal → isi dan klasifikasi agar yang terlatih pemahaman, bukan
 * hafalan posisi jawaban.
 */
export const BOBOT = Object.freeze({
  A: { isi_ke_pasal: 0.4, lokasi_pasal: 0.2, klasifikasi: 0.2, pasal_ke_isi: 0.2 },
  B: { pasal_ke_isi: 0.35, klasifikasi: 0.25, lokasi_pasal: 0.2, isi_ke_pasal: 0.2 }
});

export const konsepPasal = (p) => `ps:${p.karya}/${p.k}`;
const acak = (rng, n) => Math.floor(rng() * n);
export const kocok = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = acak(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const potong = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const HURUF = ["a", "b", "c", "d"];
const bersihJudul = (j) => String(j ?? "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

// ---------- kalibrasi (spesifikasi §8) ----------

export function calibrationFlag(benar, tingkat) {
  if (benar) return tingkat >= 4 ? "MASTERED" : tingkat === 3 ? "RIGHT_OK" : "RIGHT_UNSURE";
  return tingkat >= 4 ? "WRONG_CONFIDENT" : tingkat === 3 ? "WRONG" : "WRONG_AWARE";
}

/**
 * Penjadwalan tetap FSRS-6; flag hanya memilih NILAI ulasan yang dimasukkan.
 * Salah = Lupa (kembali ke hari ini/besok), ragu tapi benar = Sulit, sisanya Baik.
 * Tak pernah "Mudah": benar di pilihan ganda belum bukti ingatan bebas.
 */
export const nilaiDariFlag = (flag) => flag.startsWith("WRONG") ? NILAI.LUPA : flag === "RIGHT_UNSURE" ? NILAI.SULIT : NILAI.BAIK;

// ---------- pembangkit soal mekanis ----------

/** Pasal tetangga dalam kolam (karya sama, urutan naskah), terdekat dulu. */
function tetangga(kolam, p, n) {
  const satu = kolam.pasal.filter((x) => x.karya === p.karya);
  const i = satu.findIndex((x) => x.k === p.k);
  const urut = satu.map((x, j) => [x, Math.abs(j - i)]).filter(([x]) => x.k !== p.k).sort((a, b) => a[1] - b[1]).map(([x]) => x);
  if (urut.length >= n) return urut.slice(0, n);
  return [...urut, ...kolam.pasal.filter((x) => x.karya !== p.karya)].slice(0, n);
}

const labelPasal = (kolam, p) => `Pasal ${p.n} ${kolam.karya[p.karya]?.nama ?? p.karya}`;
const labelBab = (b) => `Bab ${b.nomor} — ${bersihJudul(b.judul)}${b.awal != null ? ` (Ps. ${b.awal}–${b.akhir})` : ""}`;

/** Bisakah sudut ini dibangkitkan untuk pasal p? (cukup distraktor) */
export function bisaMekanis(kolam, p, angle) {
  if (angle === "lokasi_pasal") return !!p.c && (kolam.babUrut[p.l] ?? []).length >= 4;
  if (angle === "klasifikasi") return (kolam.karyaTopik ?? []).length >= 4;
  if (angle === "pasal_ke_isi") return tetangga(kolam, p, 3).filter((x) => x.t !== p.t).length >= 3;
  return tetangga(kolam, p, 3).length >= 3;
}

/**
 * Satu soal mekanis. Bentuk soal ternormalisasi (sama dengan editorial):
 *   { id, concept_id, angle, prompt, teks?, options[{id,text}], correct_option_id,
 *     explanation, sumber[{label,href}], mekanis:true, verification_status:"verified" }
 * Opsi dikocok di sini; penjelasan tak pernah menyebut huruf.
 */
export function soalMekanis(kolam, p, angle, rng = Math.random) {
  const sumber = [{ label: labelPasal(kolam, p), href: `${p.j}#p-${p.k.replace(/[^a-z0-9]/gi, "_")}` }];
  const dasar = { id: `m:${angle}:${p.karya}/${p.k}`, concept_id: konsepPasal(p), angle, mekanis: true, verification_status: "verified", sumber };
  let prompt, teks = null, benar, salah;
  if (angle === "isi_ke_pasal") {
    prompt = "Bunyi ketentuan berikut adalah pasal berapa?";
    teks = potong(p.t, 420);
    benar = labelPasal(kolam, p);
    salah = tetangga(kolam, p, 3).map((x) => labelPasal(kolam, x));
  } else if (angle === "pasal_ke_isi") {
    prompt = `Manakah bunyi ${labelPasal(kolam, p)}?`;
    benar = potong(p.t, 200);
    salah = tetangga(kolam, p, 6).filter((x) => x.t !== p.t).slice(0, 3).map((x) => potong(x.t, 200));
  } else if (angle === "lokasi_pasal") {
    prompt = `${labelPasal(kolam, p)} terletak di bab mana?`;
    const ids = kolam.babUrut[p.l];
    const i = ids.indexOf(p.c);
    // distraktor = bab tetangga (paling mudah tertukar), bukan bab acak
    const lain = ids.map((id, j) => [id, Math.abs(j - i)]).filter(([id]) => id !== p.c).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([id]) => id);
    benar = labelBab(kolam.bab[`${p.karya}|${p.c}`]);
    salah = lain.map((id) => labelBab(kolam.bab[`${p.karya}|${id}`]));
  } else if (angle === "klasifikasi") {
    prompt = "Ketentuan berikut berasal dari peraturan mana?";
    teks = potong(p.t, 420);
    const nama = (id) => kolam.namaTopik?.[id] ?? kolam.karya[id]?.nama ?? id;
    benar = nama(p.karya);
    salah = kocok(kolam.karyaTopik.filter((id) => id !== p.karya), rng).slice(0, 3).map(nama);
  } else throw new Error(`angle mekanis tak dikenal: ${angle}`);
  const isi = kocok([benar, ...salah], rng);
  const options = isi.map((text, i) => ({ id: HURUF[i], text }));
  const correct_option_id = HURUF[isi.indexOf(benar)];
  const bab = p.c ? kolam.bab[`${p.karya}|${p.c}`] : null;
  const explanation = angle === "klasifikasi"
    ? `Ketentuan ini adalah ${labelPasal(kolam, p)}.`
    : `Jawabannya ${labelPasal(kolam, p)}${bab ? `, ${labelBab(bab)}` : ""}.`;
  return { ...dasar, prompt, teks, options, correct_option_id, explanation };
}

// ---------- susunan ronde ----------

/** Pilih sudut menurut bobot, hanya di antara yang tersedia. */
function pilihAngle(bobot, tersedia, rng) {
  const ada = Object.entries(bobot).filter(([a]) => tersedia.includes(a));
  if (!ada.length) return null;
  const total = ada.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [a, w] of ada) { r -= w; if (r <= 0) return a; }
  return ada[ada.length - 1][0];
}

/** Editorial → bentuk ternormalisasi (opsi dikocok, id dipertahankan). */
export function siapkanEditorial(s, rng) {
  return { ...s, options: kocok(s.options, rng), mekanis: false };
}

/**
 * Susun satu ronde.
 *   kolam   = API subtopik (pasal, bab, babUrut, karya, karyaTopik, bank[])
 *   jenis   = "A" | "B" | "MIKRO"
 *   riwayat = { A: [{concept_id, angle}] , salah: [{c, f}] }  (untuk B/MIKRO)
 * Ronde B tak memakai ulang pasangan (konsep, sudut) Ronde A; MIKRO membidik
 * konsep salah dengan WRONG_CONFIDENT didahulukan, 2 soal per konsep.
 */
export function susunRonde(kolam, jenis, riwayat = {}, rng = Math.random) {
  const bank = (kolam.bank ?? []).filter((s) => s.verification_status !== "konflik_sumber" || s.trap_tag);
  const keluar = [];
  const dipakai = new Set();
  const kunci = (c, a) => `${c}|${a}`;
  const larangA = new Set((riwayat.A ?? []).map((x) => kunci(x.concept_id, x.angle)));
  const tambah = (s) => { keluar.push(s); dipakai.add(kunci(s.concept_id, s.angle)); };

  if (jenis === "MIKRO") {
    const URUT = { WRONG_CONFIDENT: 0, WRONG: 1, WRONG_AWARE: 2 };
    const target = [...new Map((riwayat.salah ?? []).slice().sort((a, b) => (URUT[a.f] ?? 3) - (URUT[b.f] ?? 3)).map((x) => [x.c, x])).keys()];
    for (const c of target) {
      if (keluar.length >= UKURAN.MIKRO_MAKS) break;
      let n = 0;
      for (const s of kocok(bank.filter((x) => x.concept_id === c), rng)) {
        if (n >= 2 || keluar.length >= UKURAN.MIKRO_MAKS) break;
        tambah(siapkanEditorial(s, rng)); n++;
      }
      const p = kolam.pasal.find((x) => konsepPasal(x) === c);
      if (p) for (const a of kocok(ANGLE_MEKANIS, rng)) {
        if (n >= 2 || keluar.length >= UKURAN.MIKRO_MAKS) break;
        if (dipakai.has(kunci(c, a)) || !bisaMekanis(kolam, p, a)) continue;
        tambah(soalMekanis(kolam, p, a, rng)); n++;
      }
    }
    // isi sampai minimum dengan konsep lain dari subtopik (ulangan selingan)
    for (const p of kocok(kolam.pasal, rng)) {
      if (keluar.length >= UKURAN.MIKRO_MIN) break;
      const a = ANGLE_MEKANIS.find((x) => !dipakai.has(kunci(konsepPasal(p), x)) && bisaMekanis(kolam, p, x));
      if (a) tambah(soalMekanis(kolam, p, a, rng));
    }
    return keluar;
  }

  const n = UKURAN[jenis];
  for (const s of kocok(bank.filter((x) => x.ronde === jenis), rng)) { if (keluar.length >= n) break; tambah(siapkanEditorial(s, rng)); }
  // Putaran: tiap lintasan menelusuri kolam yang dikocok, satu soal per pasal,
  // supaya cakupan konsep selebar mungkin sebelum ada pasal yang muncul dua kali.
  let maju = true;
  while (keluar.length < n && maju) {
    maju = false;
    for (const p of kocok(kolam.pasal, rng)) {
      if (keluar.length >= n) break;
      const c = konsepPasal(p);
      const tersedia = ANGLE_MEKANIS.filter((a) => !dipakai.has(kunci(c, a)) && !(jenis === "B" && larangA.has(kunci(c, a))) && bisaMekanis(kolam, p, a));
      const a = pilihAngle(BOBOT[jenis], tersedia, rng);
      if (!a) continue;
      tambah(soalMekanis(kolam, p, a, rng));
      maju = true;
    }
  }
  return kocok(keluar, rng);
}

// ---------- ringkasan & transisi ----------

/**
 * jawaban = [{ soal, pilih, tingkat, benar, flag, hint }]
 * → skor, lulus, soal salah per konsep, hitungan flag, distribusi salah per sudut,
 *   dan calibration_gap = mean(P_slider) − akurasi (positif = terlalu yakin).
 */
export function ringkasRonde(jawaban, pSlider) {
  const total = jawaban.length, benar = jawaban.filter((j) => j.benar).length;
  const salahPerKonsep = {}, flag = {}, perAngle = {};
  for (const j of jawaban) {
    flag[j.flag] = (flag[j.flag] ?? 0) + 1;
    const a = (perAngle[j.soal.angle] ??= { n: 0, salah: 0 });
    a.n++;
    if (!j.benar) { a.salah++; (salahPerKonsep[j.soal.concept_id] ??= []).push(j.soal.id); }
  }
  const skor = total ? benar / total : 0;
  const rerataYakin = total ? jawaban.reduce((s, j) => s + (pSlider[j.tingkat] ?? 0), 0) / total : 0;
  return { total, benar, skor, lulus: total > 0 && skor >= AMBANG, salahPerKonsep, flag, perAngle,
    gap: total ? rerataYakin - skor : null,
    salah: salahUnik(jawaban) };
}

const URUT_SALAH = { WRONG_CONFIDENT: 0, WRONG: 1, WRONG_AWARE: 2 };
/** Konsep salah, satu entri per konsep dengan flag TERBURUK (salah-yakin menang). */
function salahUnik(jawaban) {
  const m = new Map();
  for (const j of jawaban) {
    if (j.benar) continue;
    const lama = m.get(j.soal.concept_id);
    if (!lama || URUT_SALAH[j.flag] < URUT_SALAH[lama]) m.set(j.soal.concept_id, j.flag);
  }
  return [...m].map(([c, f]) => ({ c, f }));
}

/** Gabung daftar salah (A ∪ B) tanpa duplikat konsep, flag terburuk dipertahankan. */
export function gabungSalah(...daftar) {
  const m = new Map();
  for (const x of daftar.flat()) { const l = m.get(x.c); if (!l || URUT_SALAH[x.f] < URUT_SALAH[l]) m.set(x.c, x.f); }
  return [...m].map(([c, f]) => ({ c, f }));
}

/** Tahap berikutnya dari tahap sekarang + ringkasan ronde yang baru selesai. */
export function transisi(tahap, ringkas) {
  if (tahap === "A") return ringkas.lulus ? "LULUS" : "PETA";
  if (tahap === "PETA") return "B";
  if (tahap === "B") return ringkas.lulus ? "LULUS" : "MIKRO";
  if (tahap === "MIKRO") return "LULUS_BERSYARAT";
  return tahap;
}

/**
 * Baris Peta 60 Detik (maks. 10): konsep editorial yang salah memakai
 * ringkasan konsep.json; konsep mekanis memakai cuplikan bunyi pasalnya.
 * Dibidik ke yang salah di Ronde A (P5), bukan rangkuman seluruh subtopik.
 */
export function petaPrimer(kolam, salah) {
  const ids = [...new Set(salah.map((x) => x.c))];
  const baris = [];
  for (const c of ids) {
    if (baris.length >= 10) break;
    const k = kolam.konsep?.[c];
    if (k) { baris.push({ kunci: k.judul, isi_html: k.ringkasan_html, sumber: k.sumber ?? [] }); continue; }
    const p = kolam.pasal.find((x) => konsepPasal(x) === c);
    if (p) {
      const bab = p.c ? kolam.bab[`${p.karya}|${p.c}`] : null;
      baris.push({ kunci: labelPasal(kolam, p), isi: potong(p.t, 240), lokasi: bab ? labelBab(bab) : null,
        sumber: [{ label: "baca pasal", href: `${p.j}#p-${p.k.replace(/[^a-z0-9]/gi, "_")}` }] });
    }
  }
  return baris;
}
