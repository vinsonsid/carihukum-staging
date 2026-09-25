/* Sesi akun ringan untuk semua halaman: ganti tautan "Masuk" jadi nama pengguna — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
(function () {
  var cfg = JSON.parse(document.getElementById("data-auth").textContent);
  var sb = window.supabase.createClient(cfg.url, cfg.kunci);
  window.carihukumAuth = sb;
  sb.auth.getSession().then(function (h) {
    var el = document.getElementById("ch-akun");
    if (!el || !h.data.session) return;
    var u = h.data.session.user;
    el.textContent = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email;
    el.title = "Kelola akun";
  });
})();

