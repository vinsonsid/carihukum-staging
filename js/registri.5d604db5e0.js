/* Registri: saring & cari metadata seluruh peraturan — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
(async function () {
  const KORPUS = JSON.parse(document.getElementById("data-korpus").textContent);
  const d = await (await fetch("/data/registri-ringkas.json")).json();
  const el = (id) => document.getElementById(id);
  let tampil = 100;
  // Permen K/L (besar) dimuat di latar setelah render pertama
  let totalSemua = d.jumlah + (d.jumlah_permen || 0);
  fetch("/data/registri-permen.json").then((r) => r.ok ? r.json() : null).then((p) => {
    if (!p) return;
    d.baris = d.baris.concat(p.baris);
    totalSemua = d.jumlah + p.jumlah;
    saring();
  }).catch(() => {});
  function saring() {
    const q = el("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fj = el("fj").value, fs = el("fs").value;
    const hasil = [];
    for (const b of d.baris) {
      if (fj && b[0] !== fj) continue;
      if (fs && b[4] !== fs) continue;
      if (q.length) {
        const t = (b[3] + " " + (b[5] || "") + " " + b[1] + " " + b[2]).toLowerCase();
        if (!q.every((k) => t.includes(k))) continue;
      }
      hasil.push(b);
    }
    el("info").textContent = hasil.length.toLocaleString("id-ID") + " dari " +
      totalSemua.toLocaleString("id-ID") + " peraturan" + (hasil.length > tampil ? " — menampilkan " + tampil : "");
    el("hasil").innerHTML = hasil.slice(0, tampil).map((b) => {
      const kunci = b[0] + "|" + b[1] + "|" + b[2];
      const baca = KORPUS[kunci] ? '<a class="baca" href="' + KORPUS[kunci] + '">baca ▸</a>' : "";
      const lbl = b[0] === "permen-kl" && b[5]
        ? (b[5].split(" · ")[0] || d.label[b[0]]).replace(/^Peraturan /, "Per. ").replace(/^Keputusan /, "Kep. ")
        : (d.label[b[0]] || b[0].toUpperCase());
      return '<div class="r"><span class="id">' + lbl + " " + b[2] + "/" + b[1] +
        '</span><span class="jdl">' + b[3].replace(/</g, "&lt;") + '</span><span class="st ' + b[4] + '">' + b[4] + "</span>" + baca + "</div>";
    }).join("") + (hasil.length > tampil ?
      '<div class="muat"><button id="lagi">Muat 200 lagi</button></div>' : "");
    const lagi = el("lagi");
    if (lagi) lagi.onclick = () => { tampil += 200; saring(); };
  }
  for (const id of ["q", "fj", "fs"]) el(id).addEventListener("input", () => { tampil = 100; saring(); });
  saring();
})();

