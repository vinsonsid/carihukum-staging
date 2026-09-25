/* Landas kodifikasi: lompat ke buku yang memuat pasal — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
const RUTE = JSON.parse(document.getElementById("data-rute").textContent);
function keBuku(n, hash) {
  const r = RUTE.find(x => n >= x.awal && n <= x.akhir);
  if (r) { location.href = r.jalur + (hash || ""); return true; }
  return false;
}
document.getElementById("lompat").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim().toLowerCase().replace(/^pasal\s*/, "");
  const n = parseInt(v, 10);
  if (!n || !keBuku(n, "#p-pasal_" + v.replace(/[^a-z0-9]/g, "_")))
    e.target.placeholder = "Pasal " + v.toUpperCase() + " tidak dikenal";
});
// tautan lama /kodifikasi/1847/23/#p-pasal_1338 -> alihkan ke halaman buku
if (location.hash) {
  const m = /^#p-pasal_(\d+)/.exec(location.hash);
  if (m) keBuku(parseInt(m[1], 10), location.hash);
}

