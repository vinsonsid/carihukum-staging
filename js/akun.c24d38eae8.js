/* Halaman /akun/: masuk, daftar, OAuth, status sesi — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
(function () {
  var CFG = JSON.parse(document.getElementById("data-auth").textContent);
  var AKTIF = CFG.aktif;
  var mode = "masuk";
  var $ = function (id) { return document.getElementById(id); };
  function pesan(teks, jenis) { var p = $("pesan"); p.textContent = teks; p.className = "pesan " + (jenis || "galat"); }
  function setMode(m) {
    mode = m;
    $("tab-masuk").classList.toggle("on", m === "masuk");
    $("tab-daftar").classList.toggle("on", m === "daftar");
    $("kirim").textContent = m === "masuk" ? "Masuk" : "Buat akun";
    $("sandi").autocomplete = m === "masuk" ? "current-password" : "new-password";
  }
  $("tab-masuk").onclick = function () { setMode("masuk"); };
  $("tab-daftar").onclick = function () { setMode("daftar"); };

  if (!AKTIF) {
    var nonaktif = function () { pesan("Autentikasi belum diaktifkan di staging ini — ini pratinjau antarmuka."); };
    $("kirim").onclick = nonaktif;
    document.querySelectorAll(".oauth").forEach(function (b) { b.onclick = nonaktif; });
    return;
  }

  var sb = window.supabase.createClient(CFG.url, CFG.kunci);

  function tampilkanSesi(u) {
    $("form-auth").style.display = u ? "none" : "block";
    $("sesi").style.display = u ? "block" : "none";
    if (u) $("sesi-email").textContent = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email;
  }
  sb.auth.getSession().then(function (h) { tampilkanSesi(h.data.session && h.data.session.user); });
  sb.auth.onAuthStateChange(function (_e, s) { tampilkanSesi(s && s.user); });

  function pesanRamah(m) {
    if (/not enabled|Unsupported provider/i.test(m))
      return "Login lewat penyedia ini belum diaktifkan pemilik situs — gunakan email dulu, ya.";
    if (/Invalid login credentials/i.test(m)) return "Email atau kata sandi salah.";
    if (/already registered/i.test(m)) return "Email ini sudah terdaftar — coba Masuk.";
    if (/rate limit/i.test(m)) return "Terlalu banyak percobaan — tunggu sebentar lalu coba lagi.";
    return m;
  }
  document.querySelectorAll(".oauth").forEach(function (b) {
    b.onclick = function () {
      sb.auth.signInWithOAuth({ provider: b.dataset.penyedia, options: { redirectTo: location.origin + "/akun/" } })
        .then(function (h) { if (h.error) pesan(pesanRamah(h.error.message)); });
    };
  });
  $("kirim").onclick = function () {
    var email = $("email").value.trim(), sandi = $("sandi").value;
    if (!email || !sandi) return pesan("Isi email dan kata sandi dulu.");
    if (sandi.length < 8) return pesan("Kata sandi minimal 8 karakter.");
    var aksi = mode === "masuk"
      ? sb.auth.signInWithPassword({ email: email, password: sandi })
      : sb.auth.signUp({ email: email, password: sandi });
    aksi.then(function (h) {
      if (h.error) return pesan(pesanRamah(h.error.message));
      if (mode === "daftar" && !h.data.session) pesan("Akun dibuat — cek email Anda untuk tautan konfirmasi.", "sukses");
    });
  };
  $("keluar").onclick = function () { sb.auth.signOut(); };
})();

