function kueriVarian(q, kelompok) {
  var out = [];
  for (var i = 0; i < kelompok.length; i++) {
    var g = kelompok[i];
    for (var a = 0; a < g.kata.length; a++) {
      if (q.indexOf(g.kata[a]) === -1) continue;
      for (var b = 0; b < g.kata.length; b++) {
        if (b === a) continue;
        out.push({ b: g.b, q2: q.split(g.kata[a]).join(g.kata[b]),
          dari: g.kata[a], ke: g.kata[b], asal: g.asal });
      }
    }
  }
  return out;
}
function cariDalamIndeks(indeks, q, kelompok, batas, batasVarian) {
  var langsung = [], sudah = {}, i;
  for (i = 0; i < indeks.length && langsung.length < batas; i++) {
    var e = indeks[i];
    if ((e.n + " " + e.t).toLowerCase().indexOf(q) === -1) continue;
    langsung.push(e); sudah[e.j + e.a] = 1;
  }
  // Kartu penjelas: kueri menyentuh istilah yang punya varian di karya ini.
  var kartu = [];
  for (i = 0; i < kelompok.length; i++)
    for (var w = 0; w < kelompok[i].kata.length; w++)
      if (q.indexOf(kelompok[i].kata[w]) !== -1 && kartu.indexOf(kelompok[i]) === -1)
        kartu.push(kelompok[i]);
  // Substitusi istilah HANYA untuk kueri lebih dari satu kata. Satu kata terlalu
  // tumpul: di Buku I KUHPerdata "persetujuan" berarti izin (toestemming), jadi
  // menukar "perjanjian" -> "persetujuan" akan menghambur pasal perkawinan.
  if (q.indexOf(" ") === -1) return { langsung: langsung, varian: [], kartu: kartu };
  var alt = kueriVarian(q, kelompok), varian = [];
  for (var k = 0; k < alt.length && varian.length < batasVarian; k++) {
    var a = alt[k];
    for (var j = 0; j < indeks.length && varian.length < batasVarian; j++) {
      var x = indeks[j];
      if (x.b !== a.b || sudah[x.j + x.a]) continue;
      if ((x.n + " " + x.t).toLowerCase().indexOf(a.q2) === -1) continue;
      sudah[x.j + x.a] = 1;
      varian.push({ e: x, q2: a.q2, dari: a.dari, ke: a.ke, asal: a.asal });
    }
  }
  return { langsung: langsung, varian: varian, kartu: kartu };
}
/* Beranda: pencarian teks pasal & saringan daftar — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
    var indeksCari = null, memuat = false;
    // Naskah terjemahan memakai padanan yang berbeda dari yang diketik pembaca:
    // KUHPerdata menulis "persetujuan" (overeenkomst) di Pasal 1313/1320/1338,
    // sedangkan orang mencari "perjanjian". Teksnya tidak diseragamkan — yang
    // menjembatani adalah pencarian, dan pertukarannya selalu dilabeli.
    var VARIAN = JSON.parse(document.getElementById("data-varian").textContent);
    function esk(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function cuplikan(t, q) {
      var i = t.toLowerCase().indexOf(q);
      if (i < 0) return esk(t.slice(0, 150)) + (t.length > 150 ? "…" : "");
      var awal = Math.max(0, i - 60), akhir = Math.min(t.length, i + q.length + 90);
      var s = (awal > 0 ? "…" : "") + t.slice(awal, akhir) + (akhir < t.length ? "…" : "");
      return esk(s).replace(new RegExp("(" + q.replace(/[.*+?^$()\[\]{}|\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
    }
    // Sumbernya disuntikkan dari tools/lib/situs.mjs — satu-satunya salinan,
    // dan itu yang diuji di tests/konsolidasi.test.mjs.
    // kueriVarian & cariDalamIndeks digabung di depan berkas ini oleh build
    // dari tools/lib/situs.mjs — satu-satunya salinan (diuji tests/konsolidasi).
    function itemHasil(e, qs, v) {
      return '<a class="item" href="' + e.j + e.a + '"><span class="dimana">' + esk(e.b) + ' · ' + esk(e.n) +
        '</span><div class="cuplikan">' + cuplikan(e.t, qs) + '</div>' +
        (v ? '<div class="varian">↔ naskah ini menulis “' + esk(v.ke) + '” di tempat Anda mengetik “' +
             esk(v.dari) + '” — keduanya menerjemahkan kata Belanda ' + esk(v.asal) + '</div>' : '') + '</a>';
    }
    function blokHasil(judul, isi) {
      return '<div class="hasil"><div class="kepala-hasil">' + judul + '</div>' + isi + '</div>';
    }
    function cariTeks(q) {
      var wadah = document.getElementById("hasil-cari");
      if (q.length < 3 || !indeksCari) { wadah.innerHTML = ""; return; }
      // Lapis kedua (varian) hanya berisi yang TAK ketemu lewat kueri asli.
      var temu = cariDalamIndeks(indeksCari, q, VARIAN, 20, 10);
      var hasil = temu.langsung, varian = temu.varian;
      var html = temu.kartu.map(function (g) {
        return '<div class="kartu-istilah"><div class="ki-judul">🔤 Di ' + esk(g.b) + ', “' + esk(g.lazim) +
          '” ditulis “' + esk(g.naskah) + '”</div><div class="ki-isi">' + esk(g.ringkas) + '</div>' +
          '<div class="ki-kunci">' + g.kunci.map(function (k) {
            return '<a href="' + k.j + k.a + '" title="' + esk(k.t) + '">' + esk(k.n) + '</a>';
          }).join("") + '</div>' +
          (g.ambigu ? '<div class="ki-ambigu">' + esk(g.ambigu) + '</div>' : "") + '</div>';
      }).join("");
      if (hasil.length)
        html += blokHasil("Hasil di dalam teks pasal (" + hasil.length + (hasil.length >= 20 ? "+" : "") + ")",
          hasil.map(function (e) { return itemHasil(e, q, null); }).join(""));
      if (varian.length)
        html += blokHasil("Varian terjemahan — kata yang sama, padanan berbeda (" + varian.length +
          (varian.length >= 10 ? "+" : "") + ")",
          varian.map(function (v) { return itemHasil(v.e, v.q2, v); }).join(""));
      wadah.innerHTML = html;
    }
    // ---- saringan gabungan: teks + faset (jenis/status/bidang) ----
    var pilih = { jenis: null, status: null, bidang: null };
    var urusan = null;   // saringan bahasa awam (kata kunci), lihat URUSAN
    function terapkan() {
      var q = (document.getElementById("saring").value || "").trim().toLowerCase(), ada = 0;
      document.querySelectorAll("#daftar .baris").forEach(function (b) {
        var cocok = (!q || b.textContent.toLowerCase().indexOf(q) !== -1)
          && (!pilih.jenis  || b.dataset.jenis === pilih.jenis)
          && (!pilih.status || b.dataset.status === pilih.status)
          && (!pilih.bidang || (b.dataset.bidang || "").split("|").indexOf(pilih.bidang) !== -1)
          && (!urusan || urusan.some(function (k) { return b.textContent.toLowerCase().indexOf(k) !== -1; }));
        b.style.display = cocok ? "" : "none"; if (cocok) ada++;
      });
      document.querySelectorAll("#daftar .kelompok").forEach(function (s) {
        var tampak = [].filter.call(s.querySelectorAll(".baris"), function (b) { return b.style.display !== "none"; });
        s.style.display = tampak.length ? "" : "none";
        var n = s.querySelector(".kelompok-n"); if (n) n.textContent = tampak.length;
        // Saat menyaring, lipatan dibuka agar hasil tak tersembunyi — lalu
        // ditutup kembali begitu saringan dihapus, KECUALI kelompok yang
        // memang sengaja dibuka pengguna lewat tombol.
        var menyaring = q || pilih.jenis || pilih.status || pilih.bidang || urusan;
        if (menyaring) s.classList.add("buka");
        else if (s.dataset.manual !== "1") { s.classList.remove("buka"); labelLagi(s); }
      });
      var aktif = pilih.jenis || pilih.status || pilih.bidang || urusan;
      document.getElementById("reset-faset").hidden = !aktif;
      document.getElementById("kosong").style.display = ada ? "none" : "block";
      if (q.length >= 3 && !indeksCari && !memuat) {
        memuat = true;
        fetch("/api/cari.json").then(function (r) { return r.json(); })
          .then(function (d) { indeksCari = d; cariTeks(q); })
          .catch(function () {});
      } else cariTeks(q);
    }
    document.getElementById("saring").addEventListener("input", terapkan);
    document.querySelectorAll("#faset .chip[data-nilai]").forEach(function (c) {
      c.addEventListener("click", function () {
        var f = c.closest(".faset").dataset.faset, v = c.dataset.nilai;
        var nyala = pilih[f] === v;
        pilih[f] = nyala ? null : v;
        c.closest(".faset").querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); });
        if (!nyala) c.classList.add("on");
        terapkan();
      });
    });
    document.querySelectorAll(".chip.urusan").forEach(function (c) {
      c.addEventListener("click", function () {
        var nyala = c.classList.contains("on");
        document.querySelectorAll(".chip.urusan").forEach(function (x) { x.classList.remove("on"); });
        urusan = nyala ? null : c.dataset.kata.split("|");
        if (!nyala) c.classList.add("on");
        terapkan();
      });
    });
    document.getElementById("reset-faset").addEventListener("click", function () {
      pilih = { jenis: null, status: null, bidang: null }; urusan = null;
      document.querySelectorAll(".chip.urusan").forEach(function (x) { x.classList.remove("on"); });
      document.querySelectorAll("#faset .chip").forEach(function (x) { x.classList.remove("on"); });
      document.querySelectorAll("#daftar .kelompok").forEach(function (s) { s.classList.remove("buka"); });
      terapkan();
    });
    function labelLagi(s) {
      var b = s.querySelector(".lagi"); if (!b) return;
      b.textContent = s.classList.contains("buka") ? "Tampilkan lebih sedikit ▴"
        : "Tampilkan " + (s.querySelectorAll('.baris[data-lipat="1"]').length) + " lainnya ▾";
    }
    document.querySelectorAll(".lagi").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = b.closest(".kelompok"), buka = s.classList.toggle("buka");
        s.dataset.manual = buka ? "1" : "0";
        labelLagi(s);
      });
    });
  
