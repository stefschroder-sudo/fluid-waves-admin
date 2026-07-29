// Vercel serverfunctie: bouwt een factuur-PDF in Fluid Waves-huisstijl.
// De browser stuurt de gegevens (bedrijf, klant, factuur, regels, korting) en
// optioneel het logo als base64. Deze functie stuurt de PDF terug.

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const NAVY = rgb(0x1B/255, 0x2C/255, 0x4F/255);
const GOUD = rgb(0xC9/255, 0xA2/255, 0x27/255);
const INKT = rgb(0x2A/255, 0x2A/255, 0x28/255);
const GRIJS = rgb(0x6B/255, 0x72/255, 0x80/255);
const WIT = rgb(1, 1, 1);
const LICHTGRIJS = rgb(0.85, 0.87, 0.9);
const LIJN = rgb(0.88, 0.85, 0.78);

function eur(n) {
  n = Math.round((Number(n) || 0) * 100) / 100;
  return "\u20AC " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function totalen(c) {
  var perTarief = {}, excl = 0;
  (c.regels || []).forEach(function (r) {
    var rt = (Number(r.aantal) || 0) * (Number(r.tarief) || 0);
    excl += rt;
    var p = (r.btw_pct == null ? 21 : Number(r.btw_pct));
    if (!perTarief[p]) perTarief[p] = { excl: 0, btw: 0 };
    perTarief[p].excl += rt;
  });
  excl = Math.round(excl * 100) / 100;
  var kp = Number(c.korting_pct) || 0;
  var factor = 1 - (kp / 100);
  var kortingBedrag = Math.round(excl * (kp / 100) * 100) / 100;
  var exclNa = Math.round((excl - kortingBedrag) * 100) / 100;
  var btw = 0;
  Object.keys(perTarief).forEach(function (p) {
    var na = Math.round(perTarief[p].excl * factor * 100) / 100;
    perTarief[p].excl = na;
    perTarief[p].btw = Math.round(na * Number(p)) / 100;
    btw += perTarief[p].btw;
  });
  btw = Math.round(btw * 100) / 100;
  return { excl: excl, kortingPct: kp, kortingBedrag: kortingBedrag, exclNa: exclNa, btw: btw, incl: Math.round((exclNa + btw) * 100) / 100, perTarief: perTarief };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Alleen POST" });
  try {
    var b = req.body || {};
    var bedrijf = b.bedrijf || {};
    var klant = b.klant || {};
    var regels = b.regels || [];
    var c = { regels: regels, korting_pct: b.korting_pct || 0 };

    var pdf = await PDFDocument.create();
    var page = pdf.addPage([595, 842]);
    var font = await pdf.embedFont(StandardFonts.Helvetica);
    var fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
    var size = page.getSize();
    var width = size.width, height = size.height;
    var M = 50;

    function text(t, x, yy, o) { o = o || {}; page.drawText(String(t == null ? "" : t), { x: x, y: yy, size: o.size || 10, font: o.bold ? fontB : font, color: o.color || INKT }); }
    function textR(t, xRight, yy, o) { o = o || {}; var f = o.bold ? fontB : font; var s = o.size || 10; var w = f.widthOfTextAtSize(String(t == null ? "" : t), s); page.drawText(String(t == null ? "" : t), { x: xRight - w, y: yy, size: s, font: f, color: o.color || INKT }); }

    // Kopbalk
    page.drawRectangle({ x: 0, y: height - 90, width: width, height: 90, color: NAVY });

    // Logo (optioneel, base64 png/jpg) linksboven; anders bedrijfsnaam als tekst
    var logoBreedte = 0;
    if (b.logo_base64) {
      try {
        var raw = b.logo_base64.replace(/^data:image\/\w+;base64,/, "");
        var bytes = Buffer.from(raw, "base64");
        var img = b.logo_base64.indexOf("image/png") >= 0 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        var dims = img.scale(1);
        var h = 44, w = dims.width * (h / dims.height);
        if (w > 160) { w = 160; h = dims.height * (w / dims.width); }
        page.drawImage(img, { x: M, y: height - 20 - h, width: w, height: h });
        logoBreedte = w + 12;
      } catch (e) { /* logo overslaan bij fout */ }
    }
    text(bedrijf.naam || "", M + logoBreedte, height - 46, { size: 18, bold: true, color: WIT });
    text("FACTUUR", M + logoBreedte, height - 68, { size: 11, color: GOUD });

    var bx = width - M;
    var ry = height - 34;
    [bedrijf.adres, (bedrijf.postcode || "") + " " + (bedrijf.plaats || ""), bedrijf.email, bedrijf.telefoon].forEach(function (r) {
      if (r && r.trim()) { textR(r, bx, ry, { size: 8.5, color: LICHTGRIJS }); ry -= 11; }
    });
    var kvkBtw = [];
    if (bedrijf.kvk) kvkBtw.push("KvK " + bedrijf.kvk);
    if (bedrijf.btw) kvkBtw.push(bedrijf.btw);
    if (kvkBtw.length) textR(kvkBtw.join("  \u00b7  "), bx, ry, { size: 8.5, color: LICHTGRIJS });

    var y = height - 120;
    text("AAN", M, y, { size: 8, bold: true, color: GOUD });
    text(klant.naam || "", M, y - 15, { size: 11, bold: true, color: NAVY });
    var ky = y - 29;
    [klant.adres, (klant.postcode || "") + " " + (klant.plaats || "")].forEach(function (r) {
      if (r && r.trim()) { text(r, M, ky, { size: 9.5 }); ky -= 13; }
    });

    textR("Factuurnummer", width - M - 90, y, { size: 8.5, color: GRIJS });
    textR(b.factuurnummer || "concept", width - M, y, { size: 9.5, bold: true });
    textR("Factuurdatum", width - M - 90, y - 15, { size: 8.5, color: GRIJS });
    textR(b.factuurdatum || "", width - M, y - 15, { size: 9.5 });

    y -= 75;
    if (b.omschrijving && b.omschrijving.trim()) {
      text("Betreft", M, y, { size: 8, bold: true, color: GOUD });
      var woorden = b.omschrijving.split(/\s+/), regel = "", yy = y - 14;
      woorden.forEach(function (w) {
        if ((regel + " " + w).length > 95) { text(regel, M, yy, { size: 9.5 }); yy -= 13; regel = w; }
        else regel = (regel ? regel + " " : "") + w;
      });
      if (regel) { text(regel, M, yy, { size: 9.5 }); }
      y = yy - 22;
    }

    // Tabelkop
    page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: GOUD });
    text("Omschrijving", M + 6, y + 2, { size: 8.5, bold: true, color: NAVY });
    textR("Aantal", M + 330, y + 2, { size: 8.5, bold: true, color: NAVY });
    textR("Tarief", M + 400, y + 2, { size: 8.5, bold: true, color: NAVY });
    textR("Btw", M + 438, y + 2, { size: 8.5, bold: true, color: NAVY });
    textR("Totaal", width - M - 6, y + 2, { size: 8.5, bold: true, color: NAVY });
    y -= 20;

    regels.forEach(function (r) {
      var oms = (r.omschrijving || "") + (r.soort === "uren" && r.datum ? "  (" + r.datum + ")" : "");
      text(oms, M + 6, y + 2, { size: 9 });
      textR(String(r.aantal), M + 330, y + 2, { size: 9 });
      textR(eur(r.tarief), M + 400, y + 2, { size: 9 });
      textR((r.btw_pct == null ? 21 : r.btw_pct) + "%", M + 438, y + 2, { size: 9 });
      textR(eur((Number(r.aantal) || 0) * (Number(r.tarief) || 0)), width - M - 6, y + 2, { size: 9 });
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: width - M, y: y - 3 }, thickness: 0.5, color: LIJN });
      y -= 18;
    });

    y -= 10;
    var tt = totalen(c);
    var tx = width - M, lx = width - M - 200;
    text("Subtotaal (excl. btw)", lx, y, { size: 9.5, color: GRIJS }); textR(eur(tt.excl), tx, y, { size: 9.5 }); y -= 16;
    if (tt.kortingBedrag > 0) {
      text("Korting " + tt.kortingPct + "%", lx, y, { size: 9.5, color: GRIJS }); textR("- " + eur(tt.kortingBedrag), tx, y, { size: 9.5 }); y -= 16;
      text("Na korting", lx, y, { size: 9.5, color: GRIJS }); textR(eur(tt.exclNa), tx, y, { size: 9.5 }); y -= 16;
    }
    Object.keys(tt.perTarief).sort(function (a, c2) { return c2 - a; }).forEach(function (p) {
      text("Btw " + p + "%", lx, y, { size: 9.5, color: GRIJS }); textR(eur(tt.perTarief[p].btw), tx, y, { size: 9.5 }); y -= 16;
    });
    page.drawRectangle({ x: lx - 10, y: y - 6, width: (tx - lx) + 16, height: 22, color: NAVY });
    text("Totaal", lx, y, { size: 11, bold: true, color: WIT }); textR(eur(tt.incl), tx, y, { size: 11, bold: true, color: WIT });
    y -= 45;

    page.drawLine({ start: { x: M, y: y }, end: { x: width - M, y: y }, thickness: 0.5, color: LIJN }); y -= 16;
    if (bedrijf.iban) {
      text("Gelieve het bedrag van " + eur(tt.incl) + " over te maken op " + bedrijf.iban + (b.factuurnummer ? " o.v.v. " + b.factuurnummer : "") + ".", M, y, { size: 9 }); y -= 13;
    }
    text("Betaaltermijn 14 dagen.", M, y, { size: 9, color: GRIJS });

    var bytes2 = await pdf.save();
    var naam = (b.bestandsnaam || "factuur").replace(/[^a-zA-Z0-9 ()_-]/g, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="' + naam + '"');
    return res.status(200).send(Buffer.from(bytes2));
  } catch (err) {
    return res.status(500).json({ error: "PDF mislukt", detail: String(err).slice(0, 500) });
  }
}
