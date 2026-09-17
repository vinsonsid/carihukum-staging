/**
 * FSRS (Free Spaced Repetition Scheduler) — implementasi murni untuk CariHukum Belajar.
 *
 * RUJUKAN: py-fsrs v6.3.2 (open-spaced-repetition/py-fsrs, rilis 9 Agu 2026),
 * berkas fsrs/scheduler.py — rumus dan 21 parameter bawaan (FSRS-6) disalin
 * dari sana pada 17 Sep 2026, bukan dari ingatan. Yang SENGAJA berbeda:
 *   - tanpa learning/relearning steps (py-fsrs bawaan [1m, 10m] / [10m]):
 *     sesi belajar di sini bukan Anki; nilai Lupa cukup mengembalikan kartu
 *     ke antrean HARI INI (interval 0), dan ulasan ulang di hari yang sama
 *     memakai rumus stabilitas jangka pendek — sama seperti py-fsrs lakukan
 *     untuk ulasan < 1 hari.
 *   - tanpa fuzz: penjadwalan harus deterministik supaya bisa diuji.
 *
 * Modul ini berjalan di Node (tes) dan di peramban (halaman /belajar/) TANPA
 * salinan: berkas yang sama disalin apa adanya ke build/site/belajar/.
 * Tidak ada I/O, Date.now(), atau Math.random() — waktu selalu argumen.
 */

export const RUJUKAN = "py-fsrs v6.3.2 (FSRS-6), fsrs/scheduler.py";
export const PARAM_DEFAULT = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542
]);
export const NILAI = Object.freeze({ LUPA: 1, SULIT: 2, BAIK: 3, MUDAH: 4 });
export const HARI_MS = 86_400_000;
const S_MIN = 0.001, D_MIN = 1, D_MAX = 10;

const clampS = (s) => Math.max(s, S_MIN);
const clampD = (d) => Math.min(Math.max(d, D_MIN), D_MAX);

/** Konstanta kurva lupa dari parameter ke-21 (decay). */
export function konstanta(w = PARAM_DEFAULT) {
  const DECAY = -w[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  return { DECAY, FACTOR };
}

export function kartuBaru() {
  return { s: null, d: null, r: 0, l: 0, t: null, due: null };
}

/** Hari penuh sejak ulasan terakhir (floor, min 0) — meniru timedelta.days. */
export const hariSejak = (kartu, kiniMs) =>
  kartu.t == null ? null : Math.max(0, Math.floor((kiniMs - kartu.t) / HARI_MS));

/** R(t, S) = (1 + FACTOR·t/S)^DECAY. Kartu yang belum pernah diulas → null. */
export function retrievability(kartu, kiniMs, w = PARAM_DEFAULT) {
  if (kartu.s == null || kartu.t == null) return null;
  const { DECAY, FACTOR } = konstanta(w);
  return Math.pow(1 + (FACTOR * hariSejak(kartu, kiniMs)) / kartu.s, DECAY);
}

/** Interval (hari bulat, ≥ 1) agar R turun ke `retensi`. */
export function intervalUntuk(s, retensi = 0.9, w = PARAM_DEFAULT, maksHari = 36500) {
  const { DECAY, FACTOR } = konstanta(w);
  const n = Math.round((s / FACTOR) * (Math.pow(retensi, 1 / DECAY) - 1));
  return Math.min(Math.max(n, 1), maksHari);
}

export const stabilitasAwal = (nilai, w = PARAM_DEFAULT) => clampS(w[nilai - 1]);

export function kesulitanAwal(nilai, w = PARAM_DEFAULT, clamp = true) {
  const d = w[4] - Math.exp(w[5] * (nilai - 1)) + 1;
  return clamp ? clampD(d) : d;
}

export function kesulitanBerikut(d, nilai, w = PARAM_DEFAULT) {
  const arg1 = kesulitanAwal(NILAI.MUDAH, w, false);
  const delta = -(w[6] * (nilai - 3));
  const arg2 = d + ((10 - d) * delta) / 9; // linear damping
  return clampD(w[7] * arg1 + (1 - w[7]) * arg2); // mean reversion
}

export function stabilitasIngat(d, s, R, nilai, w = PARAM_DEFAULT) {
  const penaltiSulit = nilai === NILAI.SULIT ? w[15] : 1;
  const bonusMudah = nilai === NILAI.MUDAH ? w[16] : 1;
  return clampS(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - R) * w[10]) - 1) * penaltiSulit * bonusMudah));
}

export function stabilitasLupa(d, s, R, w = PARAM_DEFAULT) {
  const jangkaPanjang = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]);
  const jangkaPendek = s / Math.exp(w[17] * w[18]);
  return clampS(Math.min(jangkaPanjang, jangkaPendek));
}

/** Ulasan di hari yang sama (< 1 hari sejak ulasan terakhir). */
export function stabilitasHariSama(s, nilai, w = PARAM_DEFAULT) {
  let naik = Math.exp(w[17] * (nilai - 3 + w[18])) * Math.pow(s, -w[19]);
  if (nilai !== NILAI.LUPA) naik = Math.max(naik, 1);
  return clampS(s * naik);
}

/**
 * Satu ulasan. Tidak memutasi `kartu`; mengembalikan kartu baru + keterangan.
 *   kartu  = {s, d, r, l, t, due}  (s/d null bila belum pernah)
 *   nilai  = NILAI.LUPA..MUDAH
 *   kiniMs = waktu ulasan (epoch ms)
 * Hasil: { kartu, intervalHari, hariSama, R }
 */
export function ulas(kartu, nilai, kiniMs, { retensi = 0.9, w = PARAM_DEFAULT, maksHari = 36500 } = {}) {
  if (!Number.isInteger(nilai) || nilai < 1 || nilai > 4) throw new Error(`nilai tidak sah: ${nilai}`);
  if (!Number.isFinite(kiniMs)) throw new Error("kiniMs wajib angka");
  const sejak = hariSejak(kartu, kiniMs);
  const hariSama = sejak !== null && sejak < 1;
  let s, d;
  let R = null;
  if (kartu.s == null || kartu.d == null) {
    s = stabilitasAwal(nilai, w);
    d = kesulitanAwal(nilai, w);
  } else if (hariSama) {
    s = stabilitasHariSama(kartu.s, nilai, w);
    d = kesulitanBerikut(kartu.d, nilai, w);
  } else {
    R = retrievability(kartu, kiniMs, w);
    s = nilai === NILAI.LUPA ? stabilitasLupa(kartu.d, kartu.s, R, w) : stabilitasIngat(kartu.d, kartu.s, R, nilai, w);
    d = kesulitanBerikut(kartu.d, nilai, w);
  }
  // Lupa → ulang hari ini (interval 0); selain itu interval menurut stabilitas.
  const intervalHari = nilai === NILAI.LUPA ? 0 : intervalUntuk(s, retensi, w, maksHari);
  return {
    kartu: { s, d, r: (kartu.r ?? 0) + 1, l: (kartu.l ?? 0) + (nilai === NILAI.LUPA ? 1 : 0), t: kiniMs, due: kiniMs + intervalHari * HARI_MS },
    intervalHari, hariSama, R
  };
}
