/* Aplikasi halaman baca peraturan — dipindah dari tools/demo.template.html (docs/27 F1 langkah 5). */
// Data halaman ada di blok <script type="application/json" id="data-baca">
// (lib/skrip.mjs dataJson) — kode ini sama untuk semua halaman peraturan.
const DATA = JSON.parse(document.getElementById("data-baca").textContent);

const state = { work: (DATA._urut || Object.keys(DATA).filter(k => !k.startsWith("_")))[0], asOf: null, lang: "id", open: {} };

const fmtTgl = (s) => { const [y,m,d] = s.split("-"); const bln = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]; return `${+d} ${bln[+m]} ${y}`; };
const clone = (x) => JSON.parse(JSON.stringify(x));

function cari(arr, id) {
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (n.id === id) return { node: n, induk: arr, idx: i };
    if (n.anak) { const r = cari(n.anak, id); if (r) return r; }
  }
  return null;
}
function snapshot(n) { const s = clone(n); const strip = (x) => { delete x.riwayat; (x.anak||[]).forEach(strip); }; strip(s); return s; }

function konsolidasi(workId, asOf) {
  const w = DATA[workId];
  const pohon = clone(w.dokumen.unit);
  const tandai = (n, src, tgl) => { n.sumber = src; n.mulai = tgl; (n.anak||[]).forEach(a => tandai(a, src, tgl)); };
  pohon.forEach(u => tandai(u, workId, w.metadata.tanggal_berlaku));
  const pending = [];
  let pendingButir;
  let pjEfektif = null;
  for (const ev of w.peristiwa) {
    if (asOf && ev.tanggal_berlaku > asOf) continue;
    if (!ev.operasi.length) { pending.push(ev); continue; }
    for (const op of ev.operasi) {
      if (op.op === "replace") {
        const t = cari(pohon, op.unit);
        if (!t) continue; // halaman parsial (per buku): unit ada di halaman lain
        const baru = clone(op.dengan);
        baru.riwayat = [...(t.node.riwayat||[]), { aksi: "diganti", pelaku: ev.pelaku, judul: ev.judul_pelaku, tanggal: ev.tanggal_berlaku, sebelum: snapshot(t.node) }];
        { // warisi anotasi (rekursif) dari subtree lama ke unit baru se-id
          const lamaAnot = new Map();
          const petakan = (n) => { if (n.anotasi) lamaAnot.set(n.id, n.anotasi); (n.anak||[]).forEach(petakan); };
          petakan(t.node);
          const warisi = (n) => {
            const a = lamaAnot.get(n.id);
            if (a) n.anotasi = [...a, ...(n.anotasi||[])];
            (n.anak||[]).forEach(warisi);
          };
          warisi(baru);
        }
        tandai(baru, ev.pelaku, ev.tanggal_berlaku);
        t.induk[t.idx] = baru;
      } else if (op.op === "insert_after" || op.op === "insert_bab_after") {
        // Cermin tools/lib/karya.mjs: sisipan yang DITETAPKAN ULANG (rantai
        // Cipta Kerja menyisipkan pasal yang sama tiga kali) mengganti di
        // tempat, bukan melahirkan pasal kembar.
        const sudah = op.unit?.id ? cari(pohon, op.unit.id) : null;
        if (sudah) {
          const baru = clone(op.unit);
          baru.riwayat = [...(sudah.node.riwayat ?? []),
            { aksi: "disisipkan ulang", pelaku: ev.pelaku, judul: ev.judul_pelaku, tanggal: ev.tanggal_berlaku }];
          tandai(baru, ev.pelaku, ev.tanggal_berlaku);
          sudah.induk[sudah.idx] = baru;
          continue;
        }
        const t = cari(pohon, op.acuan);
        if (!t) continue;
        const baru = clone(op.unit);
        baru.riwayat = [{ aksi: "disisipkan", pelaku: ev.pelaku, judul: ev.judul_pelaku, tanggal: ev.tanggal_berlaku }];
        tandai(baru, ev.pelaku, ev.tanggal_berlaku);
        t.induk.splice(t.idx + 1, 0, baru);
      } else if (op.op === "repeal") {
        const t = cari(pohon, op.unit);
        if (!t) continue;
        const cabut = (n) => { n.status = "dicabut"; (n.anak || []).forEach(cabut); };
        if (op.kaskade === false) t.node.status = "dicabut"; else cabut(t.node);
        (t.node.riwayat ||= []).push({ aksi: "dicabut", pelaku: ev.pelaku, judul: ev.judul_pelaku, tanggal: ev.tanggal_berlaku });
      } else if (op.op === "anotasi") {
        const t = cari(pohon, op.unit);
        if (t) (t.node.anotasi ||= []).push({ pelaku: ev.pelaku, tanggal: ev.tanggal_berlaku,
          catatan: op.catatan, kutipan: op.kutipan, sifat: op.sifat, penulis: op.penulis, paragraf: op.paragraf, bagian: op.bagian,
          verifikasi_kutipan: op.verifikasi_kutipan, jalur_putusan: ev.jalur_putusan,
          kutipan_kar: op.kutipan_kar });
      } else if (op.op === "replace_penjelasan") {
        (pjEfektif ||= {})[String(op.pasal).toLowerCase()] = { teks: op.teks, pelaku: ev.pelaku, tanggal: ev.tanggal_berlaku };
      } else if (op.op === "replace_judul") {
        const t = cari(pohon, op.unit);
        if (t) {
          (t.node.riwayat ||= []).push({ aksi: "judul diganti", pelaku: ev.pelaku,
            tanggal: ev.tanggal_berlaku, catatan: op.catatan,
            sebelum: { judul: t.node.judul, nomor: t.node.nomor } });
          t.node.judul = op.judul;
          if (op.nomor) t.node.nomor = op.nomor;
        }
      } else if (op.op === "repeal_penjelasan") {
        (pjEfektif ||= {})[String(op.pasal).toLowerCase()] =
          { dihapus: true, pelaku: ev.pelaku, tanggal: ev.tanggal_berlaku };
      }
    }
    // kejujuran per-pasal: tandai unit yang perubahannya BELUM dienkode
    // Boleh berupa id unit (bentuk lama) atau {unit?, instruksi} (sejak
    // 6 Sep 2026). Yang tanpa unit tetap ditampilkan di peringatan karya,
    // supaya instruksi yang belum bisa dienkode tak menghilang begitu saja.
    for (const b of ev.operasi_belum_dienkode || []) {
      const uid = typeof b === "string" ? b : b.unit;
      const ket = typeof b === "string" ? "" : (b.instruksi || "");
      const t = uid ? cari(pohon, uid) : null;
      if (t) (t.node.belum_dienkode ||= []).push({ pelaku: ev.pelaku, instruksi: ket });
      else (pendingButir ||= []).push({ pelaku: ev.pelaku, instruksi: ket || uid || "" });
    }
  }
  return { pohon, pending, pjEfektif, pendingButir: pendingButir || [] };
}

// diff kata sederhana (LCS) untuk panel riwayat
function diffKata(a, b) {
  const A = (a||"").split(/\s+/), B = (b||"").split(/\s+/);
  if (A.length * B.length > 40000) return null;
  const L = Array.from({length: A.length+1}, () => new Array(B.length+1).fill(0));
  for (let i = A.length-1; i >= 0; i--) for (let j = B.length-1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i+1][j+1] + 1 : Math.max(L[i+1][j], L[i][j+1]);
  const del = [], ins = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { del.push([A[i],0]); ins.push([B[j],0]); i++; j++; }
    else if (L[i+1][j] >= L[i][j+1]) { del.push([A[i],1]); i++; }
    else { ins.push([B[j],1]); j++; }
  }
  while (i < A.length) del.push([A[i++],1]);
  while (j < B.length) ins.push([B[j++],1]);
  const render = (toks, tag) => toks.map(([w,d]) => d ? `<${tag}>${esc(w)}</${tag}>` : esc(w)).join(" ");
  return { lama: render(del, "del"), baru: render(ins, "ins") };
}
const esc = (s) => (s||"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// ---------- navigasi: kumpulan pasal + tautan rujukan internal ----------
let pasalAda = new Set();   // "pasal-27", "pasal-6a", ...
function kumpulkanPasal(pohon) {
  pasalAda = new Set();
  const jalan = (us) => us.forEach(u => { if (u.tipe === "pasal") pasalAda.add(u.id); jalan(u.anak || []); });
  jalan(pohon);
}
const idAman = (id) => id.replace(/[^a-z0-9]/gi, "_");
/** ubah rujukan "Pasal 27" dalam teks (sudah di-escape) menjadi tautan bila pasalnya ada,
 *  dan rujukan lintas-peraturan ("Undang-Undang Nomor 11 Tahun 2008") ke halamannya */
function tautkan(html) {
  html = html.replace(/Pasal\s+(\d+[A-Z]{0,2})/g, (m, n) => {
    const id = "pasal-" + n.toLowerCase();
    return pasalAda.has(id) ? `<a class="ref" href="#p-${idAman(id)}">${m}</a>` : m;
  });
  const jalur = DATA._jalur || {};
  html = html.replace(/Undang-Undang Dasar Negara Republik Indonesia Tahun 1945/g, (m) =>
    jalur["uud-1945"] && state.work !== "uud-1945" ? `<a class="ref" href="${jalur["uud-1945"]}">${m}</a>` : m);
  html = html.replace(/Undang-Undang Nomor (\d+) Tahun (\d{4})/g, (m, no, th) => {
    const id = `uu-${th}-${no}`;
    return jalur[id] && id !== state.work ? `<a class="ref" href="${jalur[id]}">${m}</a>` : m;
  });
  return html;
}

// ---------- istilah terdefinisi (Pasal 1) -> sorot + tooltip ----------
let istilahDaftar = [], istilahRe = null, pasalSumberIstilah = null, tandaiNyala = true;
function siapkanIstilah() {
  const lokal = (DATA[state.work].istilah || []).map(x => ({ ...x, kelas: "lokal" }));
  const lintas = (DATA[state.work].istilah_lintas || []);
  istilahDaftar = [...lokal, ...lintas].sort((a, b) => b.istilah.length - a.istilah.length);
  pasalSumberIstilah = lokal.length ? lokal[0].unit.split("/")[0] : null;
  istilahRe = istilahDaftar.length
    ? new RegExp("\\b(" + istilahDaftar.map(x => x.istilah.replace(/[.*+?^$()\[\]{}|\\]/g, "\\$&")).join("|") + ")\\b", "gi")
    : null;
}
function tandaiIstilah(html) {
  if (!istilahRe || !tandaiNyala) return html;
  // hanya segmen teks polos — jangan menyusup ke dalam tag/anchor yang sudah ada
  return html.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/g).map(seg => {
    if (!seg || seg.startsWith("<")) return seg;
    return seg.replace(istilahRe, (m) => {
      const idx = istilahDaftar.findIndex(x => x.istilah.toLowerCase() === m.toLowerCase());
      if (idx === -1) return m;
      // kata tunggal wajib persis kapitalnya ("Orang" ≠ "orang"); frasa boleh longgar
      if (!istilahDaftar[idx].istilah.includes(" ") && istilahDaftar[idx].istilah !== m) return m;
      const lintas = istilahDaftar[idx].kelas !== "lokal";
      return `<dfn class="istilah${lintas ? " lintas" : ""}" tabindex="0" data-i="${idx}">${m}</dfn>`;
    });
  }).join("");
}

// ---------- render ----------
function teksUnit(u, taut) {
  const en = state.lang === "en";
  let html, tag = "";
  if (en && u.teks_en) { html = esc(u.teks_en); tag = '<span class="en-tag">EN · tidak resmi</span>'; }
  else if (en && u.teks) { html = esc(u.teks); tag = '<span class="en-tag">belum diterjemahkan</span>'; }
  else html = esc(u.teks);
  if (taut) { html = tautkan(html); html = tandaiIstilah(html); }
  return { html, tag };
}
function badgeUnit(u) {
  const b = [];
  if (u.status === "dicabut") b.push('<span class="badge cabut">Dicabut</span>');
  const r = u.riwayat || [];
  if (r.length) {
    const last = r[r.length-1];
    if (last.aksi === "disisipkan") b.push(`<span class="badge baru">Baru · ${esc(nmPelaku(last.pelaku))} (${last.tanggal.slice(0,4)})</span>`);
    else if (last.aksi === "diganti") b.push(`<span class="badge ubah">Diubah · ${esc(nmPelaku(last.pelaku))} (${last.tanggal.slice(0,4)})</span>`);
  }
  for (const p of u.belum_dienkode || []) {
    const pel = typeof p === "string" ? p : p.pelaku;
    const ket = typeof p === "string" ? "" : (p.instruksi || "");
    b.push(`<span class="badge tunda" title="${esc(ket || "Peraturan tersebut mengubah unit ini, tetapi operasinya belum dienkode ke CariHukum — teks di sini mungkin bukan versi termutakhir.")}">⚠ perubahan ${esc(nmPelaku(pel))} belum dienkode</span>`);
  }
  return b.join(" ");
}

// --- salin kutipan (per pasal) ---
function namaSitasi(meta) {
  if (meta.jenis === "uud" ) return "UUD NRI 1945";
  return `${(meta.jenis || "").toUpperCase()} ${meta.nomor}/${meta.tahun}`;
}
function teksPasalUtuh(u, indent = "") {
  if (u.teks && !u.anak) return `${indent}${u.tipe === "pasal" ? "" : u.nomor + " "}${u.teks}`;
  const kepala = u.teks ? [`${indent}${u.tipe === "pasal" ? "" : u.nomor + " "}${u.teks}`] : [];
  return kepala.concat((u.anak || []).map(a => teksPasalUtuh(a, u.tipe === "pasal" ? "" : indent + "  "))).join("\n");
}
function salinPasal(key) {
  const { pohon } = konsolidasi(state.work, state.asOf);
  const t = cari(pohon, key);
  if (!t) return;
  const u = t.node;
  const m = DATA[state.work].metadata;
  const last = (u.riwayat || []).filter(x => x.aksi !== "dicabut").slice(-1)[0];
  // DATA di halaman situs hanya memuat karya yang dibaca — pengubahnya cukup nama pendek
  const namaPelaku = (id) => DATA[id]?.metadata ? namaSitasi(DATA[id].metadata) : (DATA._nama[id] || id);
  const suffix = last
    ? (last.aksi === "disisipkan" ? ` (disisipkan oleh ${namaPelaku(last.pelaku)})`
                                  : ` (sebagaimana diubah dengan ${namaPelaku(last.pelaku)})`)
    : "";
  const url = location.href.split("#")[0] + "#p-" + idAman(key);
  const kutipan = `Pasal ${u.nomor} ${namaSitasi(m)} tentang ${m.judul}${suffix}:\n\n` +
    teksPasalUtuh(u) + `\n\nSumber: ${url} (CariHukum — bukan naskah resmi)`;
  navigator.clipboard.writeText(kutipan).then(() => {
    const btn = document.querySelector(`[data-salin="${key}"]`);
    if (btn) { btn.textContent = "Tersalin ✓"; setTimeout(() => { btn.textContent = "Salin"; }, 1500); }
  });
}
const nmPelaku = (id) => DATA._nama[id] || id;

function riwayatHTML(u) {
  const r = (u.riwayat||[]).filter(x => x.aksi === "diganti");
  if (!r.length) return "";
  let html = "<h4>Riwayat versi</h4>";
  const teksDari = (snap) => snap.teks || (snap.anak||[]).map(a => `${a.nomor} ${a.teks||""}`).join(" ");
  for (let i = 0; i < r.length; i++) {
    const lama = teksDari(r[i].sebelum);
    const baruSnap = i + 1 < r.length ? teksDari(r[i+1].sebelum) : teksDari(snapshot(u));
    const d = diffKata(lama, baruSnap);
    html += `<div class="versi"><div class="label">Berlaku s.d. ${fmtTgl(r[i].tanggal)} — diganti oleh ${esc(r[i].judul)}</div><div class="teks">${d ? d.lama : esc(lama)}</div></div>`;
    if (i === r.length - 1)
      html += `<div class="versi"><div class="label">Berlaku sejak ${fmtTgl(r[i].tanggal)} — versi saat ini dalam tampilan</div><div class="teks">${d ? d.baru : esc(baruSnap)}</div></div>`;
  }
  return html;
}

function anotasiHTML(u) {
  if (!u.anotasi || !u.anotasi.length) return "";
  // Duduk perkara & pertimbangan hukum bisa puluhan paragraf — tidak dimuat
  // inline di halaman undang-undang, cukup ditunjuk ke halaman putusannya.
  const RINCI = ["pertimbangan", "duduk_perkara"];
  const rinci = u.anotasi.filter((a) => RINCI.includes(a.sifat));
  const inti = u.anotasi.filter((a) => !RINCI.includes(a.sifat));
  const penunjuk = (() => {
    if (!rinci.length) return "";
    const per = new Map();
    for (const a of rinci) {
      const k = a.jalur_putusan || "-";
      const v = per.get(k) || { p: 0, d: 0 };
      a.sifat === "pertimbangan" ? v.p++ : v.d++;
      per.set(k, v);
    }
    return [...per].map(([jalur, v]) => {
      const bag = [v.p ? `${v.p} paragraf pertimbangan hukum` : "", v.d ? "petitum" : ""]
        .filter(Boolean).join(" &amp; ");
      return `<div class="anotasi rinci">📄 <strong>Duduk perkara &amp; pertimbangan:</strong> ${bag} tersedia utuh${jalur !== "-" ? ` di <a href="${jalur}">halaman putusan ▸</a>` : ""}</div>`;
    }).join("");
  })();
  u = { ...u, anotasi: inti };
  if (!inti.length) return penunjuk;
  // Pendapat hakim (dissenting/concurring) BUKAN amar dan tidak mengikat —
  // dibedakan tegas dari catatan peristiwa agar pembaca tak tertukar.
  const LABEL = {
    konklusi: ["⚖", "Konklusi Mahkamah", ""],
    dissenting: ["⚖", "Pendapat berbeda (dissenting opinion)", " tidakmengikat"],
    concurring: ["⚖", "Alasan berbeda (concurring opinion)", " tidakmengikat"],
  };
  return u.anotasi.map(a => {
    const L = LABEL[a.sifat];
    const kepala = L
      ? `${L[0]} <strong>${L[1]}${a.penulis && a.penulis.length ? " — " + esc(a.penulis.join(", ")) : ""}${a.tanggal ? ` (${fmtTgl(a.tanggal)})` : ""}:</strong>${L[2] ? ` <span class="tak-mengikat">tidak mengikat</span>` : ""}`
      : `⚖ <strong>Catatan peristiwa hukum${a.tanggal ? ` (${fmtTgl(a.tanggal)})` : ""}:</strong>`;
    // kutipan berat sengaja tak dikirim ke halaman ini (lihat rakitData)
    if (!a.kutipan && a.kutipan_kar && a.jalur_putusan) {
      return `<div class="anotasi${L && L[2] ? " pendapat" : ""}">${kepala} ${esc(a.catatan)}` +
        `<a class="ke-putusan" href="${a.jalur_putusan}">baca naskah utuh (${a.kutipan_kar.toLocaleString("id-ID")} karakter) ▸</a></div>`;
    }
    const kutip = a.kutipan
      ? `<blockquote class="kutipan">${esc(a.kutipan)}<span class="cap">${a.sifat === "amar" ? "amar putusan" : a.sifat === "konklusi" ? "konklusi" : "kutipan"} — verbatim dari salinan resmi${a.verifikasi_kutipan === "pdf-resmi" ? ", terverifikasi" : ""}</span></blockquote>`
      : "";
    const tautan = a.jalur_putusan
      ? ` <a class="ke-putusan" href="${a.jalur_putusan}">lihat putusan lengkap ▸</a>` : "";
    return `<div class="anotasi${L && L[2] ? " pendapat" : ""}">${kepala} ${esc(a.catatan)}${kutip}${tautan}</div>`;
  }).join("") + penunjuk;
}

function unitHTML(u) {
  if (u.tipe === "buku") {
    const inner = (u.anak||[]).map(a => unitHTML(a)).join("");
    const judul = state.lang === "en" && u.judul_en ? u.judul_en : u.judul;
    return `<section class="buku" id="b-${idAman(u.id)}"><div class="buku-kepala"><span class="bab-nomor">Buku ${esc(u.nomor)}</span><span class="buku-judul">${esc(judul)}</span> ${badgeUnit(u)}</div>${anotasiHTML(u)}${inner}</section>`;
  }
  if (u.tipe === "bab") {
    const inner = (u.anak||[]).map(a => unitHTML(a)).join("");
    const judul = state.lang === "en" && u.judul_en ? u.judul_en : u.judul;
    return `<section class="bab" id="b-${idAman(u.id)}"><div class="bab-kepala">${u.nomor ? `<span class="bab-nomor">Bab ${esc(u.nomor)}</span>` : ""}<span class="bab-judul">${esc(judul)}</span> ${badgeUnit(u)}</div>${anotasiHTML(u)}${inner}</section>`;
  }
  if (u.tipe === "bagian" || u.tipe === "paragraf") {
    const inner = (u.anak||[]).map(a => unitHTML(a)).join("");
    const label = u.tipe === "bagian" ? `Bagian ${esc(u.nomor)}` : `Paragraf ${esc(u.nomor)}`;
    return `<div class="subbab"><div class="subbab-kepala"><span class="bab-nomor">${label}</span><span class="subbab-judul">${esc(u.judul || "")}</span></div>${inner}</div>`;
  }
  if (u.tipe === "pasal") {
    const punyaRiwayat = (u.riwayat||[]).some(x => x.aksi === "diganti") || (u.anak||[]).some(a => (a.riwayat||[]).some(x => x.aksi === "diganti"));
    const key = u.id;
    // jangan sorot istilah di dalam pasal definisinya sendiri
    tandaiNyala = key !== pasalSumberIstilah;
    let body;
    if (u.anak) {
      // rekursif: ayat -> huruf -> angka -> ... (kedalaman bebas)
      const barisUnit = (a) => {
        const t = teksUnit(a, true);
        const anak = (a.anak || []).map(barisUnit).join("");
        const badges = badgeUnit(a);
        return `<div class="ayat"><span class="no">${esc(a.nomor || "")}</span><span class="teks">${t.html}${t.tag}${anotasiHTML(a)}</span>${anak ? `<div class="sub">${anak}</div>` : ""}${badges ? `<span class="ayat-badges">${badges}</span>` : ""}</div>`;
      };
      // pasal ber-anak bisa punya teks pembuka sendiri (mis. "…dalam:" sebelum huruf a-g)
      const pembuka = u.teks ? (() => { const t = teksUnit(u, true); return `<div class="tunggal"><p class="teks">${t.html}${t.tag}</p></div>`; })() : "";
      body = pembuka + u.anak.map(barisUnit).join("");
    } else {
      const t = teksUnit(u, true);
      body = `<div class="tunggal"><p class="teks">${t.html}${t.tag}</p></div>`;
    }
    let hist = "";
    if (punyaRiwayat) {
      const semua = [riwayatHTML(u), ...(u.anak||[]).map(a => {
        const h = riwayatHTML(a);
        return h ? `<div style="margin-top:6px"><div class="label" style="font:500 .72rem var(--mono);color:var(--ink-2)">Ayat ${esc(a.nomor)}</div>${h.replace("<h4>Riwayat versi</h4>","")}</div>` : "";
      })].join("");
      hist = `<div class="riwayat ${state.open[key] ? "open" : ""}">${semua}</div>`;
    }
    const kunciPj = String(u.nomor).toLowerCase().replace(/\s+/g, "");
    const pjBaru = pjOverlay[kunciPj];
    const pjDihapus = pjBaru && pjBaru.dihapus;
    const pjTeks = pjDihapus ? "" : (pjBaru ? pjBaru.teks
      : ((DATA[state.work].penjelasan || {}).pasal || {})[String(u.nomor).toLowerCase()]);
    const pjLabel = pjBaru
      ? `Penjelasan resmi sebagaimana diubah/ditetapkan <strong>${esc(DATA._nama[pjBaru.pelaku] || pjBaru.pelaku)}</strong> (berlaku ${fmtTgl(pjBaru.tanggal)}) — bagian tak terpisahkan dari undang-undang; bukan tafsir CariHukum.`
      : "Penjelasan resmi naskah asli (TLN) — bagian tak terpisahkan dari undang-undang; bukan tafsir CariHukum.";
    // Penjelasan yang dihapus TIDAK boleh sekadar lenyap: pembaca yang tahu
    // pasal ini pernah punya penjelasan harus diberi tahu siapa menghapusnya.
    const pj = pjDihapus
      ? `<div class="pj-label" style="margin-top:6px">Penjelasan Pasal ${esc(u.nomor)} <strong>dihapus</strong> oleh ${esc(DATA._nama[pjBaru.pelaku] || pjBaru.pelaku)} (berlaku ${fmtTgl(pjBaru.tanggal)}).</div>`
      : (pjTeks ? `<details class="pj"><summary>Penjelasan resmi Pasal ${esc(u.nomor)}${pjBaru ? " (versi berlaku)" : ""}</summary><div class="pj-isi">${esc(pjTeks)}</div><div class="pj-label">${pjLabel}</div></details>` : "");
    return `<article class="pasal" id="p-${idAman(key)}"><div class="pasal-kepala"><span class="pasal-nomor"><a href="#p-${idAman(key)}">${u.nomor ? `Pasal ${esc(u.nomor)}` : "Ketentuan"}</a></span>${badgeUnit(u)}<span style="margin-left:auto;display:flex;gap:6px"><button class="histbtn" data-salin="${key}" title="Salin teks pasal + sitasi + tautan">Salin</button>${punyaRiwayat ? `<button class="histbtn" data-riw="${key}">Riwayat ${state.open[key] ? "▴" : "▾"}</button>` : ""}</span></div>${anotasiHTML(u)}${body}${pj}${hist}</article>`;
  }
  return "";
}

function tocHTML(pohon) {
  const semuaPasal = (us) => us.flatMap(u => u.tipe === "pasal" ? [u] : semuaPasal(u.anak || []));
  // pohon kodifikasi berlapis buku: kelompokkan TOC per buku
  if (pohon.some(u => u.tipe === "buku"))
    return pohon.map(bk => bk.tipe !== "buku" ? "" :
      `<div class="toc-buku"><div class="kepala" style="font-size:.78rem;border-top:1px solid var(--line);padding-top:8px">Buku ${esc(bk.nomor)} — ${esc(bk.judul)}</div></div>` +
      tocHTML(bk.anak || [])).join("");
  return pohon.map(bab => {
    if (bab.tipe !== "bab") return "";
    const pasal = semuaPasal(bab.anak || []);
    const judul = state.lang === "en" && bab.judul_en ? bab.judul_en : bab.judul;
    return `<div class="toc-bab"><div class="kepala" title="${esc(judul)}">${bab.nomor ? `Bab ${esc(bab.nomor)} · ` : ""}${esc(judul)}</div><div class="toc-pasal">${
      pasal.map(p => `<a href="#p-${idAman(p.id)}" data-toc="${p.id}" class="${p.status === "dicabut" ? "cabut" : ""}" title="Pasal ${esc(p.nomor)}">${esc(p.nomor || "•")}</a>`).join("")
    }</div></div>`;
  }).join("");
}

let pengamat = null;
let pjOverlay = {};
function pasangScrollspy() {
  if (pengamat) pengamat.disconnect();
  const tocLink = {};
  document.querySelectorAll("[data-toc]").forEach(a => tocLink[a.dataset.toc] = a);
  pengamat = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.id.replace(/^p-/, "").replace(/_/g, "/");
      // id pasal tak mengandung '/', jadi pemetaan aman utk pasal
      const kunci = Object.keys(tocLink).find(k => idAman(k) === e.target.id.slice(2));
      if (!kunci) continue;
      if (e.isIntersecting) {
        document.querySelectorAll(".toc-pasal a.aktif").forEach(x => x.classList.remove("aktif"));
        tocLink[kunci].classList.add("aktif");
      }
    }
  }, { rootMargin: "0px 0px -70% 0px" });
  document.querySelectorAll("article.pasal").forEach(el => pengamat.observe(el));
}

function lompatKe(id) {
  const el = document.getElementById("p-" + idAman(id));
  if (!el) {
    // kodifikasi terbagi per buku: pasal mungkin ada di halaman buku lain
    const rute = DATA._bukuRute;
    const m = /^pasal-(\d+)/.exec(id);
    if (rute && m) {
      const n = parseInt(m[1], 10);
      const r = rute.find(x => n >= x.awal && n <= x.akhir);
      if (r && !location.pathname.startsWith(r.jalur)) {
        location.href = r.jalur + "#p-" + idAman(id);
        return true;
      }
    }
    return false;
  }
  el.scrollIntoView({ block: "start" });
  el.classList.add("sorot");
  setTimeout(() => el.classList.remove("sorot"), 1600);
  return true;
}

function render() {
  const w = DATA[state.work];
  const daftarTab = DATA._urut || Object.keys(DATA).filter(k => !k.startsWith("_"));
  document.getElementById("tabs").innerHTML = daftarTab.length < 2 ? "" : daftarTab.map(id =>
    `<button class="tab ${id === state.work ? "on" : ""}" data-tab="${id}">${esc(DATA[id].metadata.judul_pendek)}</button>`).join("");
  const m = w.metadata;
  const judul = state.lang === "en" && m.judul_en ? m.judul_en : m.judul;
  const sumber = m.sumber && m.sumber.ln ? ` · <span class="mono">LN ${m.sumber.ln}${m.sumber.tln ? " / TLN " + m.sumber.tln : ""}</span>` : "";
  // strip status bahasa-awam + panel keandalan sumber (bila data bukti tersedia)
  const terakhirUbah = [...w.peristiwa].reverse().find(ev => ev.operasi.length);
  const nPending = w.peristiwa.filter(ev => !ev.operasi.length).length;
  const strip = `<div class="strip-status">` +
    `<span class="chip-status ${m.status === "berlaku" ? "hijau" : "kuning"}">${esc((m.status || "berlaku").replace(/-/g, " "))}</span>` +
    (terakhirUbah ? `<span>terakhir diubah <strong>${esc(nmPelaku(terakhirUbah.pelaku))}</strong> (${terakhirUbah.tanggal_berlaku.slice(0,4)})</span>` : (nPending ? "" : "<span>belum pernah diubah</span>")) +
    (nPending ? `<span class="perhatian">⚠ ${nPending} perubahan belum dienkode</span>` : "") + `</div>`;
  let panelBukti = "";
  if (w.bukti && w.keandalan) {
    const b = w.bukti, k = w.keandalan;
    const TK = { 1: "Gazette resmi (LN/BN)", 2: "Salinan resmi lembaga", 3: "Dokumentasi resmi (JDIHN)", 4: "Sekunder" };
    panelBukti = `<details class="panel-bukti"><summary>🛡 Keandalan sumber: <strong>${k["pdf-resmi"]}/${k.total}</strong> unit cocok persis salinan ${esc(b.penerbit)} <span class="tk t${b.tingkat}">T${b.tingkat}</span>${k["pdf-ocr"] ? ` · ${k["pdf-ocr"]} direview manual` : ""}${k.draf ? ` · ${k.draf} draf` : ""}</summary>
      <table class="tabel-bukti">
        <tr><td>Tingkat keabsahan</td><td><span class="tk t${b.tingkat}">T${b.tingkat}</span> ${TK[b.tingkat] || ""} — lihat kebijakan sumber CariHukum</td></tr>
        <tr><td>Penerbit salinan</td><td>${b.penerbit_situs ? `<a href="${b.penerbit_situs}" rel="noopener">${esc(b.penerbit)}</a>` : esc(b.penerbit)}${b.catatan ? ` <span class="redup">(${esc(b.catatan)})</span>` : ""}</td></tr>
        <tr><td>Berkas terarsip</td><td><span class="mono">${esc(b.berkas || "-")}</span>${b.sha256 ? ` · sha256 <span class="mono" title="${b.sha256}">${b.sha256.slice(0, 16)}…</span>` : ""}</td></tr>
        <tr><td>Tanda tangan elektronik</td><td>${b.tte === "tidak-ada" ? "tidak ada pada salinan ini (target berikutnya: salinan ber-TTE dari peraturan.go.id)" : esc(b.tte)}</td></tr>
        ${b.url_asal ? `<tr><td>Sumber asal</td><td><a href="${b.url_asal}" rel="noopener">${esc(b.url_asal)}</a>${b.diakses ? ` <span class="redup">(diakses ${b.diakses})</span>` : ""}</td></tr>` : ""}
        <tr><td>Format terbuka</td><td>${DATA._jalur && DATA._jalur[state.work]
          ? `<a href="/api${DATA._jalur[state.work].slice(0, -1)}.json">API JSON</a> · <a href="/akn${DATA._jalur[state.work].slice(0, -1)}.xml">Akoma Ntoso XML</a> <span class="redup">(LegalDocML OASIS, tervalidasi XSD)</span>`
          : "-"}</td></tr>
      </table></details>`;
  }
  // panel jejaring Stufenbau: dasar hukum ↑, yang berdasar pada karya ini ↓, relasi tercatat
  let panelJejaring = "";
  const jj = w.jejaring;
  if (jj && (jj.dasar_hukum.length || jj.dasar_bagi.length || jj.relasi.length)) {
    const jalur = DATA._jalur || {};
    const tautKarya = (id) => jalur[id]
      ? `<a href="${jalur[id]}">${esc(nmPelaku(id))}</a>` : esc(nmPelaku(id));
    const dasarItem = (d) => `<li>${d.target && jalur[d.target]
      ? `<a href="${jalur[d.target]}">${esc(d.teks)}</a>`
      : esc(d.teks)}${d.target && !jalur[d.target] ? ` <span class="redup">(${esc(nmPelaku(d.target))})</span>` : ""}</li>`;
    const relasiBaris = jj.relasi.filter(r => r.target_id !== state.work).slice(0, 12).map(r =>
      `<li><span class="redup">${esc(r.tipe.replace(/-/g, " "))}</span> ${r.target_id ? tautKarya(r.target_id) : esc(r.judul || "")}</li>`).join("");
    panelJejaring = `<details class="panel-bukti"><summary>🕸 Jejaring peraturan${jj.dasar_hukum.length ? ` — berakar pada <strong>${jj.dasar_hukum.some(d => d.target === "uud-1945") ? "UUD 1945" : "peraturan di atasnya"}</strong>` : ""}${jj.dasar_bagi.length ? ` · menjadi dasar ${jj.dasar_bagi.length} peraturan` : ""}</summary>
      <div class="isi-jejaring">
      ${jj.dasar_hukum.length ? `<div class="jejaring-blok"><h4>Dasar hukum (konsideran "Mengingat") ↑</h4><ul>${jj.dasar_hukum.map(dasarItem).join("")}</ul></div>` : ""}
      ${jj.dasar_bagi.length ? `<div class="jejaring-blok"><h4>Menjadi dasar hukum bagi ↓</h4><ul>${jj.dasar_bagi.map(id => `<li>${tautKarya(id)}</li>`).join("")}</ul></div>` : ""}
      ${relasiBaris ? `<div class="jejaring-blok"><h4>Relasi tercatat (BPK)</h4><ul>${relasiBaris}</ul></div>` : ""}
      <div class="redup" style="padding:4px 0">Lihat seluruh korpus di <a href="/peta/" style="color:var(--accent)">Peta Jejaring Hukum</a>.</div>
      </div></details>`;
  }
  // Varian terjemahan: naskah terjemahan memakai padanan yang berbeda dari
  // yang dicari pembaca (KUHPerdata: "persetujuan" utk overeenkomst, sedangkan
  // doktrin memakai "perjanjian"). Teks TIDAK diseragamkan — hanya diterangkan.
  let panelVarian = "";
  const vt = (w.varian_terjemahan && w.varian_terjemahan.varian) || [];
  if (vt.length) {
    const blok = vt.map(v => {
      const bukti = (v.bukti_internal || []).map(b =>
        `<li><span class="mono" style="font-size:.78rem">${esc(b.unit)}</span> — “${esc(b.kutipan)}”<br><span class="redup">${esc(b.catatan)}</span></li>`).join("");
      const banding = (v.bukti_pembanding || []).map(b =>
        `<tr><td class="mono">Ps. ${esc(b.pasal)}</td><td><em>${esc(b.belanda)}…</em></td>` +
        `<td>“${esc(b.indonesia_naskah_kita)}…”</td><td>“${esc(b.indonesia_pembanding)}…”</td></tr>`).join("");
      const beda = (v.jangan_disamakan || []).map(x =>
        `<li><strong>${esc(x.kata)}</strong> (${esc(x.asal)}) — ${esc(x.catatan)}</li>`).join("");
      const ruj = (v.rujukan || []).map(r =>
        `<li>${esc(r.sumber)}: ${esc(r.isi)} <span class="redup">(${esc(r.catatan)})</span></li>`).join("");
      return `<div class="jejaring-blok">
        <h4>${esc(v.dipakai_naskah)} = ${esc(v.lazim_di_luar)} <span class="redup">(Bld. <em>${esc(v.asal)}</em>)</span></h4>
        <p style="margin:4px 0">${esc(v.ringkas)}</p>
        ${bukti ? `<h4>Buktinya ada di dalam naskah ini</h4><ul>${bukti}</ul>` : ""}
        ${banding ? `<h4>Disandingkan dengan edisi Indonesia lain</h4>
          <div style="overflow-x:auto"><table class="tabel-bukti"><tr><th></th><th>Belanda (Stb. 1847-23)</th><th>Naskah di sini (JDIH MA)</th><th>Edisi pembanding</th></tr>${banding}</table></div>
          <div class="redup">Pembanding: ${esc((w.varian_terjemahan.pembanding || {}).sifat || "")}</div>` : ""}
        ${beda ? `<h4>Yang justru TIDAK boleh disamakan</h4><ul>${beda}</ul>` : ""}
        ${ruj ? `<h4>Rujukan (dikutip dengan atribusi, bukan pendapat CariHukum)</h4><ul>${ruj}</ul>` : ""}
      </div>`;
    }).join("");
    const judulRingkas = vt.map(v => `“${v.dipakai_naskah}” = “${v.lazim_di_luar}”`).join(", ");
    panelVarian = `<details class="panel-bukti"><summary>🔤 Varian istilah terjemahan — ${esc(judulRingkas)}</summary>
      <div class="isi-jejaring">${blok}
      <div class="redup" style="padding:4px 0">Teks di bawah dibiarkan persis seperti salinan sumbernya; pencarian di beranda sudah menautkan varian ini.</div>
      </div></details>`;
  }
  const pjUmum = (w.penjelasan && w.penjelasan.umum)
    ? `<details class="panel-bukti"><summary>📜 Penjelasan Umum (resmi)</summary><div class="pj-isi" style="padding:10px 12px">${esc(w.penjelasan.umum)}</div><div class="pj-label" style="padding:0 12px 10px">Penjelasan resmi naskah asli (TLN) — bukan tafsir CariHukum. Perubahan penjelasan oleh UU perubahan belum dienkode.</div></details>`
    : "";
  // Diundangkan ≠ mulai berlaku bila naskahnya menunda (UU 16/2001: setahun).
  const tglUndang = m.tanggal_pengundangan || m.tanggal_penetapan || m.tanggal_berlaku;
  document.getElementById("meta").innerHTML = `<h1 class="judul">${esc(judul)}</h1><div class="subjudul">Diundangkan <span class="mono">${fmtTgl(tglUndang)}</span>${tglUndang !== m.tanggal_berlaku ? ` · mulai berlaku <span class="mono">${fmtTgl(m.tanggal_berlaku)}</span>` : ""}${sumber} · ${esc((m.subjek||[]).join(", "))}</div>${strip}${panelBukti}${panelJejaring}${panelVarian}${pjUmum}`;
  const nk = document.getElementById("notice-kodifikasi");
  if (nk) nk.innerHTML = m.jenis === "kodifikasi"
    ? ` <strong>Kodifikasi kolonial:</strong> teks otentiknya berbahasa Belanda (Stb. 1847-23); teks Indonesia di halaman ini mengikuti salinan yang didistribusikan JDIH Mahkamah Agung RI — terjemahan tidak resmi yang lazim dipakai praktik peradilan.${vt.length ? " Padanan istilahnya berbeda dari yang lazim dipakai doktrin — lihat panel <em>Varian istilah terjemahan</em>." : ""}`
    : "";
  const tertunda = tglUndang !== m.tanggal_berlaku;
  const evs = [{ tanggal: m.tanggal_berlaku, judul_pelaku: tertunda ? "Naskah asli mulai berlaku" : "Naskah asli diundangkan", awal: true }, ...w.peristiwa];
  document.getElementById("chips").innerHTML = evs.map((ev, i) => {
    const tgl = ev.tanggal || ev.tanggal_berlaku;
    const on = state.asOf === null ? i === evs.length - 1 : (tgl <= state.asOf && (i === evs.length - 1 || (evs[i+1].tanggal_berlaku || "") > state.asOf));
    const warn = !ev.awal && !ev.operasi.length;
    const ops = ev.awal ? "initial commit" : warn ? "⚠ belum dienkode" : `${ev.operasi.length} operasi (pilot)`;
    return `<span class="chipwrap"><button class="chip ${on ? "on" : ""} ${warn ? "warn" : ""}" data-asof="${tgl}"><span class="tgl">${fmtTgl(tgl)}</span><br><span class="nm">${esc(ev.awal ? (tertunda ? "Mulai berlaku" : "Pengundangan") : DATA._nama[ev.pelaku])}</span><br><span class="ops">${ops}</span></button></span>`;
  }).join("");
  const terkini = state.asOf === null || state.asOf >= (evs[evs.length-1].tanggal_berlaku || evs[evs.length-1].tanggal);
  document.getElementById("asof").innerHTML = terkini
    ? `Menampilkan <strong>versi berlaku terkini</strong> — hasil konsolidasi seluruh peristiwa.`
    : `Menampilkan teks sebagaimana berlaku pada <strong>${fmtTgl(state.asOf)}</strong>. Klik peristiwa terakhir untuk kembali ke versi terkini.`;
  const { pohon, pending, pjEfektif, pendingButir } = konsolidasi(state.work, state.asOf);
  pjOverlay = pjEfektif || {};
  kumpulkanPasal(pohon);
  siapkanIstilah();
  // Amandemen yang KAMI TAHU ada tetapi belum dienkode sama sekali — tanpa
  // ini, pembaca melihat naskah yang tampak mutakhir padahal bukan.
  const belumTahu = (DATA[state.work] || {}).perubahan_belum_dienkode || [];
  const belumHTML = belumTahu.length
    ? `<div class="pending">⚠ <strong>${belumTahu.length} peraturan pengubah</strong> diketahui ada tetapi <strong>belum dimuat</strong> di CariHukum — teks di bawah belum mencerminkannya: ${belumTahu.map(b => b.tanggal ? `${esc(b.id)} (${esc(fmtTgl(b.tanggal))})` : esc(b.id)).join(", ")}.</div>`
    : "";
  const butirHTML = belumHTML + (pendingButir || []).map(b =>
    `<div class="pending">⚠ Satu instruksi <strong>${esc(DATA._nama[b.pelaku] || b.pelaku)}</strong> belum dienkode: ${esc(b.instruksi)}</div>`).join("");
  document.getElementById("pending").innerHTML = butirHTML + pending.map(ev =>
    `<div class="pending">⚠ <strong>${esc(DATA._nama[ev.pelaku])}</strong> (${ev.tipe.replace(/-/g," ")}, berlaku ${fmtTgl(ev.tanggal_berlaku)}) sudah berlaku tetapi operasinya <strong>belum dienkode</strong> — teks di bawah belum mencerminkannya. ${esc(ev.catatan || "")}</div>`).join("");
  const hier = w.hierarki;
  const elHier = document.getElementById("hier");
  if (elHier) {
    if (!hier || !hier.tingkat || !hier.tingkat.length) {
      document.getElementById("hier-card").style.display = "none";
    } else {
      const chip = (x, cls) => x.jalur && !x.kini
        ? `<a class="hier-chip ${cls || ""}" href="${x.jalur}" title="${esc(x.nama)}">${esc(x.nama)}</a>`
        : `<span class="hier-chip ${x.kini ? "kini" : ""} ${cls || ""}" title="${esc(x.nama)}">${esc(x.nama)}</span>`;
      const tangga = hier.tingkat.map(t =>
        `<div class="hier-t ${t.kini ? "kini" : ""}"><div class="hier-lbl">${esc(t.label)}</div>
         <div class="hier-chips">${t.isi.map(x => chip(x)).join("")}</div></div>`).join("");
      const rel = [];
      if (hier.pengubah.length) rel.push(`<div class="r">diubah oleh ${hier.pengubah.map(x => chip(x, "ubah")).join("")}</div>`);
      if (hier.pencabut.length) rel.push(`<div class="r">dicabut sebagian oleh ${hier.pencabut.map(x => chip(x, "cabut")).join("")}</div>`);
      if (hier.mk.length) rel.push(`<div class="r">diuji MK ${hier.mk.map(x => chip(x, "mk")).join("")}</div>`);
      elHier.innerHTML = `<div class="hier-isi">${tangga}${rel.length ? `<div class="hier-rel">${rel.join("")}</div>` : ""}<a class="hier-peta" href="/peta/">Lihat peta hierarki lengkap →</a></div>`;
    }
  }
  const navBuku = (DATA._bukuNav || []).map(b =>
    `<a class="buku-pil ${b.aktif ? "on" : ""}" href="${b.jalur}" title="${esc(b.judul)}">${esc(b.label)}</a>`).join("");
  document.getElementById("toc").innerHTML =
    (navBuku ? `<div class="buku-nav"><div class="kepala" style="font:600 .72rem var(--sans);color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Kitab ini — 4 buku</div>${navBuku}</div>` : "") +
    tocHTML(pohon);
  document.getElementById("isi").innerHTML = pohon.map(u => unitHTML(u)).join("");
  pasangScrollspy();
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.work = tab.dataset.tab; state.asOf = null; state.open = {}; render(); return; }
  const chip = e.target.closest("[data-asof]");
  if (chip) { state.asOf = chip.dataset.asof; render(); return; }
  const riw = e.target.closest("[data-riw]");
  if (riw) { state.open[riw.dataset.riw] = !state.open[riw.dataset.riw]; render(); return; }
  const salin = e.target.closest("[data-salin]");
  if (salin) { salinPasal(salin.dataset.salin); return; }
  const ank = e.target.closest('a[href^="#p-"]');
  if (ank) {
    e.preventDefault();
    const el = document.querySelector(ank.getAttribute("href"));
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("sorot");
      setTimeout(() => el.classList.remove("sorot"), 1600);
      history.replaceState(null, "", ank.getAttribute("href"));
    }
    return;
  }
});
document.getElementById("lompat").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const n = e.target.value.trim().toLowerCase().replace(/^pasal\s*/, "");
  if (!n) return;
  if (!lompatKe("pasal-" + n)) { e.target.value = ""; e.target.placeholder = `Pasal ${n.toUpperCase()} tidak ada di sini`; }
  else { e.target.value = ""; e.target.placeholder = "Ke pasal… (mis. 27A) ↵"; }
});
// ukuran huruf (disimpan di perangkat pembaca)
function setSkala(delta) {
  let s = 1;
  try { s = parseFloat(localStorage.getItem("ch-skala")) || 1; } catch (e) {}
  s = Math.min(1.3, Math.max(0.85, Math.round((s + delta) * 100) / 100));
  document.documentElement.style.setProperty("--skala", s);
  try { localStorage.setItem("ch-skala", s); } catch (e) {}
}
setSkala(0);
document.getElementById("huruf-kecil").addEventListener("click", () => setSkala(-0.05));
document.getElementById("huruf-besar").addEventListener("click", () => setSkala(0.05));
// pintasan: "/" fokus ke lompat pasal
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
    e.preventDefault();
    document.getElementById("lompat")?.focus();
  }
});
// tooltip definisi istilah (hover/fokus/sentuh)
const tip = document.createElement("div");
tip.id = "tip"; tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);
let tipTimer = null;
function tampilkanTip(d) {
  clearTimeout(tipTimer);
  const data = istilahDaftar[+d.dataset.i];
  if (!data) return;
  const m = DATA[state.work].metadata;
  const tautGlosarium = Object.keys(DATA._jalur || {}).length
    ? ` <a class="tip-sumber" href="/istilah/#k-${data.istilah.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}">· Glosarium ↗</a>`
    : "";
  if (data.kelas === "lokal") {
    tip.innerHTML = `<div class="tip-istilah">${esc(data.istilah)}</div>` +
      `<div class="tip-def">${esc(data.definisi)}</div>` +
      `<a class="tip-sumber" href="#p-${idAman(pasalSumberIstilah)}">📖 Pasal 1 angka ${esc((data.nomor || "").replace(/\.$/, ""))} ${esc(namaSitasi(m))} — lihat sumbernya</a>` +
      tautGlosarium;
  } else {
    // lintas-peraturan (lex specialis): definisi asing TIDAK ditampilkan langsung —
    // hanya lewat dropdown yang dibuka sadar (progressive disclosure, kebijakan kurasi)
    const labelKelas = { "dasar-hukum": "dasar hukum UU ini", "meta": "kosakata sistem hukum", "korpus": "korpus" };
    const daftar = (data.sumber || []).map((s) => {
      const nm = nmPelaku(s.karya);
      const jalurS = (DATA._jalur || {})[s.karya];
      return `<div class="tip-sumber-item"><div><strong>${esc(nm)}</strong> <span class="tip-kelas">${esc(labelKelas[s.kelas] || s.kelas)}</span></div>` +
        `<div class="tip-def-kecil">${esc(s.definisi)}</div>` +
        (jalurS ? `<a class="tip-sumber" href="${jalurS}#p-pasal_1">📖 Pasal 1 angka ${esc((s.nomor || "").replace(/\.$/, ""))} ${esc(nm)}</a>` : "") + `</div>`;
    }).join("");
    tip.innerHTML = `<div class="tip-istilah">${esc(data.istilah)}</div>` +
      `<div class="tip-peringatan">Istilah ini <strong>tidak didefinisikan</strong> dalam ${esc(namaSitasi(m))}. ` +
      `Definisi di peraturan lain hanya rujukan — <em>tidak mengikat</em> di sini.</div>` +
      `<details class="tip-drop"><summary>Lihat definisi di peraturan lain (${(data.sumber || []).length}) ▾</summary>${daftar}</details>` +
      tautGlosarium;
  }
  tip.style.display = "block";
  const r = d.getBoundingClientRect(), tr = tip.getBoundingClientRect();
  let x = r.left + scrollX, y = r.bottom + scrollY + 6;
  x = Math.min(x, scrollX + innerWidth - tr.width - 12);
  if (r.bottom + tr.height + 20 > innerHeight) y = r.top + scrollY - tr.height - 6;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = y + "px";
}
function sembunyikanTip() { tipTimer = setTimeout(() => { tip.style.display = "none"; }, 160); }
document.addEventListener("mouseover", (e) => {
  const d = e.target.closest("dfn.istilah");
  if (d) tampilkanTip(d);
  else if (e.target.closest("#tip")) clearTimeout(tipTimer);
  else if (tip.style.display === "block") sembunyikanTip();
});
document.addEventListener("focusin", (e) => {
  const d = e.target.closest("dfn.istilah");
  if (d) tampilkanTip(d); else sembunyikanTip();
});
document.addEventListener("click", (e) => {
  const d = e.target.closest("dfn.istilah");
  if (d) { tampilkanTip(d); e.stopPropagation(); }
});

// tombol kembali ke atas
const keAtas = document.createElement("button");
keAtas.className = "keatas"; keAtas.textContent = "↑"; keAtas.title = "Kembali ke atas";
keAtas.addEventListener("click", () => window.scrollTo({ top: 0 }));
document.body.appendChild(keAtas);
addEventListener("scroll", () => keAtas.classList.toggle("tampak", scrollY > 600), { passive: true });

document.getElementById("lang-id").addEventListener("click", () => { state.lang = "id"; sync(); });
document.getElementById("lang-en").addEventListener("click", () => { state.lang = "en"; sync(); });
function sync() {
  document.getElementById("lang-id").classList.toggle("on", state.lang === "id");
  document.getElementById("lang-en").classList.toggle("on", state.lang === "en");
  render();
}
render();
function keAnchor() {
  if (!location.hash) return;
  const el = document.querySelector(location.hash);
  if (el) {
    el.scrollIntoView();
    el.classList.add("sorot");
    setTimeout(() => el.classList.remove("sorot"), 1600);
  } else {
    // halaman buku: anchor pasal milik buku lain -> alihkan lewat lompatKe
    const m = /^#p-(pasal_[0-9a-z_]+)$/.exec(location.hash);
    if (m) lompatKe(m[1].replace(/_/g, "-"));
  }
}
keAnchor();
// render halaman besar menggeser tata letak beberapa saat setelah scroll
// pertama (font, sorot istilah) — ulangi sampai posisi stabil
for (const jeda of [80, 350, 900]) setTimeout(keAnchor, jeda);
