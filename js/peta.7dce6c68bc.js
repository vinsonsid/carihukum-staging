/* Peta jejaring: sorot tetangga simpul — dipindah dari skrip sebaris (docs/27 F1 langkah 5). */
(function () {
  var svg = document.getElementById("graf");
  var edges = Array.prototype.slice.call(svg.querySelectorAll(".edge"));
  var tetangga = {};
  edges.forEach(function (e) {
    var a = e.getAttribute("data-dari"), b = e.getAttribute("data-ke");
    (tetangga[a] = tetangga[a] || []).push(e); (tetangga[b] = tetangga[b] || []).push(e);
  });
  svg.querySelectorAll(".node").forEach(function (g) {
    g.addEventListener("mouseenter", function () {
      var id = g.getAttribute("data-id");
      svg.classList.add("fokus");
      var nyala = { }; nyala[id] = true;
      (tetangga[id] || []).forEach(function (e) {
        e.classList.add("nyala");
        nyala[e.getAttribute("data-dari")] = nyala[e.getAttribute("data-ke")] = true;
      });
      svg.querySelectorAll(".node").forEach(function (x) {
        x.classList.toggle("nyala", !!nyala[x.getAttribute("data-id")]);
      });
    });
    g.addEventListener("mouseleave", function () {
      svg.classList.remove("fokus");
      edges.forEach(function (e) { e.classList.remove("nyala"); });
      svg.querySelectorAll(".node.nyala").forEach(function (x) { x.classList.remove("nyala"); });
    });
  });
})();

