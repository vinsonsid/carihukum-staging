/**
 * State belajar per pengguna — skema, migrasi, antrean, kalibrasi, penggabungan.
 *
 * Berjalan di Node (tes) dan peramban (halaman /belajar/) tanpa salinan.
 * Tidak menyentuh localStorage/jaringan sendiri: `muat`/`simpan` menerima
 * objek penyimpanan sebagai argumen supaya bisa diuji dan supaya kegagalan
 * penyimpanan (mode privat, kuota) tak pernah meruntuhkan halaman.
 *
 * MINIMISASI DATA (UU 27/2022 PDP): yang disimpan hanya kunci kartu, angka
 * penjadwalan, tanggal, dan agregat kalibrasi. Tidak ada teks pasal, nama,
 * email, alamat IP, maupun log per ulasan yang bisa dipakai memprofil orang.
 */
import { kartuBaru, ulas, NILAI, HARI_MS } from "./fsrs.mjs";

export const VERSI_STATE = 1;
export const KUNCI_STORAGE = "ch-belajar-v1";
/** Peluang yang dinyatakan tiap tingkat slider keyakinan 1–5. */
export const P_SLIDER = Object.freeze({ 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.7, 5: 0.9 });
export const ATUR_BAWAAN = Object.freeze({ kapasitas: 20, retensi: 0.9, resetSaatLupa: true });

/** Tanggal lokal "YYYY-MM-DD" dari epoch ms (zona waktu peramban/mesin). */
export function hariLokal(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const kunciKartu = (dek, unit, arah) => `${dek}|${unit}|${arah}`;
export const uraiKunci = (kunci) => { const [dek, unit, arah] = kunci.split("|"); return { dek, unit, arah }; };

export function stateBaru(kiniMs) {
  return {
    v: VERSI_STATE, dibuat: hariLokal(kiniMs), diperbarui: kiniMs,
    atur: { ...ATUR_BAWAAN },
    kartu: {},
    kal: { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0], 5: [0, 0] },
    poin: { total: 0, hari: {} },
    game: { lokasi: { main: 0, benar: 0 }, instrumen: { main: 0, benar: 0 } },
    harian: { tanggal: hariLokal(kiniMs), baru: 0, ulas: 0 }
  };
}

/**
 * Migrasi objek tersimpan ke skema terkini.
 * Versi tak dikenal (lebih baru/rusak) → mulai baru, tetapi salinannya
 * dikembalikan di `cadangan` agar pemanggil bisa menyimpannya di kunci lain;
 * alat tak boleh menghapus pengetahuan (prinsip-kurasi §5).
 */
export function migrasi(obj, kiniMs) {
  if (!obj || typeof obj !== "object") return { state: stateBaru(kiniMs), cadangan: null };
  if (obj.v === VERSI_STATE) {
    const s = stateBaru(kiniMs);
    return { state: { ...s, ...obj, atur: { ...s.atur, ...(obj.atur ?? {}) }, kal: { ...s.kal, ...(obj.kal ?? {}) },
      poin: { ...s.poin, ...(obj.poin ?? {}) }, game: { ...s.game, ...(obj.game ?? {}) }, harian: obj.harian ?? s.harian, kartu: obj.kartu ?? {} }, cadangan: null };
  }
  // v0 = percobaan pra-rilis tanpa nomor versi: hanya kartu yang diselamatkan
  if (obj.v === undefined && obj.kartu && typeof obj.kartu === "object") {
    const s = stateBaru(kiniMs);
    s.kartu = obj.kartu;
    return { state: s, cadangan: null };
  }
  return { state: stateBaru(kiniMs), cadangan: obj };
}

/** Muat dari penyimpanan mirip localStorage; tak pernah melempar. */
export function muat(storage, kiniMs) {
  let mentah = null;
  try { mentah = storage?.getItem(KUNCI_STORAGE); } catch { mentah = null; }
  let obj = null;
  try { obj = mentah ? JSON.parse(mentah) : null; } catch { obj = null; }
  const { state, cadangan } = migrasi(obj, kiniMs);
  if (cadangan) { try { storage.setItem(`ch-belajar-cadangan-${String(cadangan.v ?? "tanpa-versi")}`, mentah); } catch { /* abaikan */ } }
  return state;
}

/** Simpan; mengembalikan true bila berhasil. */
export function simpan(storage, state) {
  try { storage.setItem(KUNCI_STORAGE, JSON.stringify(state)); return true; } catch { return false; }
}

/** Kartu baru boleh ditambah hanya bila antrean jatuh tempo ≤ 2 × kapasitas harian. */
export const bolehKartuBaru = (nDue, kapasitas) => nDue <= 2 * kapasitas;

/** Pastikan penghitung harian menunjuk hari ini. */
export function segarkanHarian(state, kiniMs) {
  const h = hariLokal(kiniMs);
  if (state.harian?.tanggal !== h) state.harian = { tanggal: h, baru: 0, ulas: 0 };
  return state;
}

/**
 * Daftar semua kunci kartu yang ditawarkan sebuah dek (isi→nomor per pasal,
 * istilah→definisi per istilah), dalam urutan naskah.
 */
export function kunciDek(dek) {
  const k = dek.kartu.map((c) => kunciKartu(dek.id, c.k, "isi"));
  for (const i of dek.istilah ?? []) k.push(kunciKartu(dek.id, `${i.k}#${i.i}`, "istilah"));
  return k;
}

/**
 * Antrean sesi untuk sebuah dek pada `kiniMs`:
 *   due  = kartu yang sudah jatuh tempo (due ≤ akhir hari ini), terlama dulu
 *   baru = kartu yang belum pernah diulas, dibatasi sisa jatah harian, dan
 *          dikosongkan bila antrean terkunci (successive relearning menuntut
 *          yang jatuh tempo diselesaikan dulu)
 */
export function antrean(state, dek, kiniMs) {
  segarkanHarian(state, kiniMs);
  const hariIni = hariLokal(kiniMs);
  const semua = kunciDek(dek);
  const due = semua.filter((k) => state.kartu[k] && hariLokal(state.kartu[k].due) <= hariIni)
    .sort((a, b) => state.kartu[a].due - state.kartu[b].due);
  const terkunci = !bolehKartuBaru(due.length, state.atur.kapasitas);
  const sisaJatah = Math.max(0, state.atur.kapasitas - (state.harian.baru ?? 0));
  const baru = terkunci ? [] : semua.filter((k) => !state.kartu[k]).slice(0, sisaJatah);
  const tuntas = semua.filter((k) => state.kartu[k]?.ok).length;
  return { due, baru, nDue: due.length, terkunci, tuntas, total: semua.length, sisaJatah };
}

/**
 * Catat satu ulasan kartu.
 *   nilai   = NILAI.LUPA..MUDAH
 *   tingkat = slider keyakinan 1–5 yang dipilih SEBELUM jawaban dibuka (null bila tak ada)
 * Mengubah `state` di tempat; mengembalikan { hasil (dari fsrs), poin, paparanPertama }.
 */
export function catatUlasan(state, kunci, nilai, tingkat, kiniMs) {
  segarkanHarian(state, kiniMs);
  const lama = state.kartu[kunci];
  const paparanPertama = !lama;
  const dasar = lama ? { s: lama.s, d: lama.d, r: lama.r, l: lama.l, t: lama.t, due: lama.due } : kartuBaru();
  const hasil = ulas(dasar, nilai, kiniMs, { retensi: state.atur.retensi });
  const sukses = nilai >= NILAI.SULIT;
  const h = new Set(lama?.h ?? []);
  let poin = 0;
  if (sukses && !paparanPertama) { h.add(hariLokal(kiniMs)); poin = 1; }
  if (!sukses && state.atur.resetSaatLupa) h.clear();
  const hArr = [...h].sort().slice(-3);
  state.kartu[kunci] = { ...hasil.kartu, h: hArr, ok: hArr.length >= 3, u: kiniMs };
  if (tingkat != null && P_SLIDER[tingkat] !== undefined) {
    const k = state.kal[tingkat] ?? [0, 0];
    state.kal[tingkat] = [k[0] + 1, k[1] + (sukses ? 1 : 0)];
  }
  if (paparanPertama) state.harian.baru++;
  state.harian.ulas++;
  if (poin) { state.poin.total += poin; state.poin.hari[hariLokal(kiniMs)] = (state.poin.hari[hariLokal(kiniMs)] ?? 0) + poin; }
  state.diperbarui = kiniMs;
  return { hasil, poin, paparanPertama, sukses };
}

/** Catat hasil satu soal game (lokasi/instrumen). Poin hanya bila benar. */
export function catatGame(state, nama, benar, kiniMs) {
  const g = state.game[nama] ?? (state.game[nama] = { main: 0, benar: 0 });
  g.main++;
  if (benar) { g.benar++; state.poin.total++; const h = hariLokal(kiniMs); state.poin.hari[h] = (state.poin.hari[h] ?? 0) + 1; }
  state.diperbarui = kiniMs;
}

/**
 * Kalibrasi dari agregat per tingkat: Brier = Σ[suk·(p−1)² + (n−suk)·p²] / N.
 * Makin kecil makin baik; 0 = sempurna, 0,25 = setara menebak 50/50.
 */
export function kalibrasi(kal) {
  let N = 0, S = 0, jumlahBrier = 0;
  const perTingkat = [];
  for (const t of [1, 2, 3, 4, 5]) {
    const [n, suk] = kal?.[t] ?? [0, 0];
    const p = P_SLIDER[t];
    N += n; S += suk;
    jumlahBrier += suk * (p - 1) ** 2 + (n - suk) * p ** 2;
    perTingkat.push({ tingkat: t, p, n, sukses: suk, rasio: n ? suk / n : null });
  }
  return { n: N, akurasi: N ? S / N : null, brier: N ? jumlahBrier / N : null, perTingkat };
}

/**
 * Gabung state lokal dan jauh: per kartu, pembaruan (`u`) terbesar menang;
 * kunci yang hanya ada di satu sisi dipertahankan. Bagian ringkas (atur, kal,
 * poin, game, harian) diambil UTUH dari sisi yang `diperbarui`-nya lebih baru
 * — sederhana dan dapat diprediksi, bukan penjumlahan.
 */
export function gabungLWW(lokal, jauh) {
  if (!jauh) return lokal;
  const kartu = { ...lokal.kartu };
  for (const [k, v] of Object.entries(jauh.kartu ?? {})) {
    if (!kartu[k] || (v.u ?? 0) > (kartu[k].u ?? 0)) kartu[k] = v;
  }
  const ringkasDari = (jauh.diperbarui ?? 0) > (lokal.diperbarui ?? 0) ? jauh : lokal;
  return { ...lokal, atur: ringkasDari.atur ?? lokal.atur, kal: ringkasDari.kal ?? lokal.kal, poin: ringkasDari.poin ?? lokal.poin,
    game: ringkasDari.game ?? lokal.game, harian: ringkasDari.harian ?? lokal.harian,
    diperbarui: Math.max(lokal.diperbarui ?? 0, jauh.diperbarui ?? 0), kartu };
}

/** Buang state kartu sebuah dek yang unitnya sudah tak ada lagi di dek terbit. */
export function pangkas(state, dekId, kunciAda) {
  const ada = new Set(kunciAda);
  let n = 0;
  for (const k of Object.keys(state.kartu)) {
    if (k.startsWith(dekId + "|") && !ada.has(k)) { delete state.kartu[k]; n++; }
  }
  return n;
}

/** Baris tabel Supabase dari state kartu (untuk upsert). */
export function keBaris(userId, kunci, k) {
  return { user_id: userId, kunci, s: k.s, d: k.d, r: k.r, l: k.l,
    t: k.t == null ? null : new Date(k.t).toISOString(), due: k.due == null ? null : hariLokal(k.due),
    h: k.h ?? [], ok: !!k.ok, u: new Date(k.u ?? 0).toISOString() };
}

/** Kebalikan keBaris: baris Supabase → entri state kartu (due dipulihkan ke tengah hari lokal). */
export function dariBaris(b) {
  const dueMs = b.due ? new Date(`${b.due}T12:00:00`).getTime() : null;
  return { s: b.s, d: b.d, r: b.r ?? 0, l: b.l ?? 0, t: b.t ? new Date(b.t).getTime() : null, due: dueMs,
    h: b.h ?? [], ok: !!b.ok, u: b.u ? new Date(b.u).getTime() : 0 };
}

export { NILAI, HARI_MS };
