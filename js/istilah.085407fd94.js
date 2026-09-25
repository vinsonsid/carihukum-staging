/* Glosarium: saring entri — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
  document.getElementById("saring").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase(), ada = 0;
    document.querySelectorAll(".entri").forEach(function (e) {
      var cocok = !q || e.textContent.toLowerCase().indexOf(q) !== -1;
      e.style.display = cocok ? "" : "none"; if (cocok) ada++;
    });
    document.getElementById("kosong").style.display = ada ? "none" : "block";
  });

