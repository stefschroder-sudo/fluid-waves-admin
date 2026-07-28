// Vercel serverfunctie: bouwt een opgemaakte Excel in Fluid Waves-huisstijl.
// De browser stuurt de gegevens; deze functie maakt het bestand en stuurt het terug.
//
// Verwacht POST met JSON body:
//   { bestandsnaam, adminNaam, adminSub, periodeLabel, modus, aangifte, omzet, inkoop, kosten }
//   modus: 'volledig' (vier tabbladen) | 'aangifte' (alleen aangifte)

const ExcelJS = require("exceljs");

// Huisstijl
const NAVY = "FF1B2C4F";
const GOUD = "FFC9A227";
const PAPIER = "FFF4F1EA";
const WIT = "FFFBF8F0";
const RAND = "FFE0D8C4";
const INKT = "FF2A2A28";

const EUR = '€ #,##0.00;[Red]-€ #,##0.00';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }
  try {
    const b = req.body || {};
    const wb = new ExcelJS.Workbook();
    wb.creator = "Fluid Waves";
    wb.created = new Date();

    if (b.modus === "aangifte") {
      aangifteBlad(wb, b);
    } else {
      aangifteBlad(wb, b);
      omzetBlad(wb, b);
      inkoopKostenBlad(wb, b);
      herkomstBlad(wb, b);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const naam = (b.bestandsnaam || "export").replace(/[^a-zA-Z0-9 ()_-]/g, "") + ".xlsx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + naam + '"');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).json({ error: "Export mislukt", detail: String(err).slice(0, 500) });
  }
}

// ── Gedeelde opmaak-helpers ────────────────────────────────────────────────
function titelBalk(ws, tekst, kolommen) {
  const row = ws.addRow([tekst]);
  ws.mergeCells(row.number, 1, row.number, kolommen);
  const cel = row.getCell(1);
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cel.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  cel.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.height = 24;
  return row;
}
function subBalk(ws, tekst, kolommen) {
  const row = ws.addRow([tekst]);
  ws.mergeCells(row.number, 1, row.number, kolommen);
  const cel = row.getCell(1);
  cel.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF6B7280" } };
  cel.alignment = { horizontal: "left", indent: 1 };
  return row;
}
function kopRij(ws, headers, valutaKolommen) {
  const row = ws.addRow(headers);
  row.eachCell(function (cel, col) {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOUD } };
    cel.font = { name: "Calibri", size: 10, bold: true, color: { argb: NAVY } };
    cel.alignment = { vertical: "middle", horizontal: (valutaKolommen && valutaKolommen.indexOf(col) >= 0) ? "right" : "left" };
    cel.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  });
  row.height = 18;
  return row;
}
function sectieRij(ws, tekst, kolommen) {
  const row = ws.addRow([tekst]);
  ws.mergeCells(row.number, 1, row.number, kolommen);
  const cel = row.getCell(1);
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPIER } };
  cel.font = { name: "Calibri", size: 9, bold: true, color: { argb: GOUD } };
  cel.alignment = { horizontal: "left", indent: 1 };
  return row;
}
function dataRij(ws, waarden, valutaKolommen, opts) {
  opts = opts || {};
  const row = ws.addRow(waarden);
  row.eachCell(function (cel, col) {
    cel.font = { name: "Calibri", size: 10, bold: !!opts.vet, color: { argb: INKT } };
    if (valutaKolommen && valutaKolommen.indexOf(col) >= 0) {
      if (typeof cel.value === "number") cel.numFmt = EUR;
      cel.alignment = { horizontal: "right" };
    }
    if (opts.totaal) {
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WIT } };
      cel.border = { top: { style: "thin", color: { argb: RAND } } };
    }
  });
  return row;
}

// ── Tabblad: BTW Aangifte ──────────────────────────────────────────────────
function aangifteBlad(wb, b) {
  const ws = wb.addWorksheet("BTW Aangifte", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 8 }, { width: 54 }, { width: 22 }, { width: 18 }];
  const a = b.aangifte || {};
  const n = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };

  titelBalk(ws, "BTW-aangifte omzetbelasting — " + (b.periodeLabel || ""), 4);
  subBalk(ws, (b.adminNaam || "") + (b.adminSub ? "   |   " + b.adminSub : "") + "   |   Aangemaakt: " + new Date().toLocaleDateString("nl-NL"), 4);
  ws.addRow([]);
  kopRij(ws, ["Nr.", "Omschrijving", "Grondslag (excl. btw)", "Btw-bedrag"], [3, 4]);

  sectieRij(ws, "Rubriek 1 — Prestaties binnenland", 4);
  dataRij(ws, ["1a", "Leveringen/diensten belast met hoog tarief (21%)", n(a.r1a_excl), n(a.r1a_btw)], [3, 4]);
  dataRij(ws, ["1b", "Leveringen/diensten belast met laag tarief (9%)", n(a.r1b_excl), n(a.r1b_btw)], [3, 4]);
  dataRij(ws, ["1c", "Leveringen/diensten belast met overige tarieven", n(a.r1c_excl), n(a.r1c_btw)], [3, 4]);
  dataRij(ws, ["1e", "Leveringen/diensten belast met 0% (export)", n(a.r1e_excl), 0], [3, 4]);
  sectieRij(ws, "Rubriek 2 — Verleggingsregelingen binnenland", 4);
  dataRij(ws, ["2a", "Heffing naar u verlegd", 0, 0], [3, 4]);
  sectieRij(ws, "Rubriek 3 — Prestaties naar/in het buitenland", 4);
  dataRij(ws, ["3a", "Leveringen buiten de EU (export, 0%)", "n.v.t.", "n.v.t."], []);
  dataRij(ws, ["3b", "Leveringen naar/in EU-landen", "n.v.t.", "n.v.t."], []);
  sectieRij(ws, "Rubriek 4 — Prestaties vanuit het buitenland aan u", 4);
  dataRij(ws, ["4a", "Leveringen/diensten vanuit EU aan u", 0, 0], [3, 4]);
  dataRij(ws, ["4b", "Diensten van buiten de EU aan u", 0, 0], [3, 4]);
  sectieRij(ws, "Rubriek 5 — Voorbelasting en saldo", 4);
  dataRij(ws, ["5a", "Totaal verschuldigde omzetbelasting (1 t/m 4)", "—", n(a.verschuldigd)], [4], { vet: true });
  dataRij(ws, ["5b", "Totaal voorbelasting (btw op inkopen en kosten)", "—", n(a.voorbelasting)], [4]);
  dataRij(ws, ["5g", (a.teBetalen >= 0 ? "TE BETALEN aan Belastingdienst" : "TE ONTVANGEN van Belastingdienst"), "", n(Math.abs(a.teBetalen))], [4], { vet: true, totaal: true });
  ws.addRow([]);
  subBalk(ws, "Let op: rubrieken 2, 3 en 4 staan op nul. De app boekt nu geen verlegging, export of buitenlandse inkoop. Controleer of dat voor deze periode klopt.", 4);
}

// ── Tabblad: Omzet Detail ──────────────────────────────────────────────────
function omzetBlad(wb, b) {
  const ws = wb.addWorksheet("Omzet Detail", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 12 }, { width: 30 }, { width: 46 }, { width: 15 }, { width: 8 }, { width: 15 }, { width: 15 }];
  const rows = b.omzet || [];
  const n = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };

  titelBalk(ws, "Omzet detail — " + (b.periodeLabel || ""), 7);
  ws.addRow([]);
  kopRij(ws, ["Datum", "Klant", "Omschrijving", "Excl. btw", "Btw %", "Btw-bedrag", "Incl. btw"], [4, 6, 7]);
  let te = 0, tb = 0, ti = 0;
  rows.forEach(function (r) {
    dataRij(ws, [r.datum || "", r.naam || "", r.omschrijving || "", n(r.bedrag_excl), (r.btw_pct || 0) + "%", n(r.btw_bedrag), n(r.bedrag_incl)], [4, 6, 7]);
    te += Number(r.bedrag_excl) || 0; tb += Number(r.btw_bedrag) || 0; ti += Number(r.bedrag_incl) || 0;
  });
  ws.addRow([]);
  dataRij(ws, ["", "", "TOTAAL", n(te), "", n(tb), n(ti)], [4, 6, 7], { vet: true, totaal: true });
}

// ── Tabblad: Inkoop en Kosten ──────────────────────────────────────────────
function inkoopKostenBlad(wb, b) {
  const ws = wb.addWorksheet("Inkoop en Kosten", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 12 }, { width: 36 }, { width: 15 }, { width: 42 }, { width: 15 }, { width: 15 }, { width: 15 }];
  const inkoop = b.inkoop || [], kosten = b.kosten || [];
  const alle = inkoop.concat(kosten).sort(function (a, c) { return (a.datum || "").localeCompare(c.datum || ""); });
  const n = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };

  titelBalk(ws, "Inkoop & kosten detail — " + (b.periodeLabel || ""), 7);
  ws.addRow([]);
  kopRij(ws, ["Datum", "Leverancier", "Soort", "Omschrijving", "Excl. btw", "Btw op factuur", "Incl. btw"], [5, 6, 7]);
  let te = 0, tb = 0, ti = 0;
  alle.forEach(function (r) {
    dataRij(ws, [r.datum || "", r.naam || "", (r.soort === "inkoop" ? "Inkoopfactuur" : "Kosten"), r.omschrijving || "", n(r.bedrag_excl), n(r.btw_bedrag), n(r.bedrag_incl)], [5, 6, 7]);
    te += Number(r.bedrag_excl) || 0; tb += Number(r.btw_bedrag) || 0; ti += Number(r.bedrag_incl) || 0;
  });
  ws.addRow([]);
  dataRij(ws, ["", "", "", "TOTAAL", n(te), n(tb), n(ti)], [5, 6, 7], { vet: true, totaal: true });
}

// ── Tabblad: Herkomst per bestand ──────────────────────────────────────────
function herkomstBlad(wb, b) {
  const ws = wb.addWorksheet("Herkomst per bestand", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 12 }, { width: 30 }, { width: 42 }, { width: 42 }, { width: 13 }, { width: 13 }, { width: 13 }];
  const n = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };

  titelBalk(ws, "Inkomsten & uitgaven per bestand — " + (b.periodeLabel || ""), 7);
  subBalk(ws, "Bronbestand toont het geüploade document; handmatige regels zijn als zodanig gemarkeerd.", 7);
  ws.addRow([]);

  function blok(titel, rows) {
    sectieRij(ws, titel, 7);
    kopRij(ws, ["Datum", "Naam", "Bronbestand", "Omschrijving", "Excl. btw", "Btw", "Incl. btw"], [5, 6, 7]);
    (rows || []).forEach(function (r) {
      const bron = r.bestand_pad ? (r.bron || "bestand") : "handmatig ingevoerd";
      dataRij(ws, [r.datum || "", r.naam || "", bron, r.omschrijving || "", n(r.bedrag_excl), n(r.btw_bedrag), n(r.bedrag_incl)], [5, 6, 7]);
    });
    ws.addRow([]);
  }
  blok("Inkomsten — Omzet", b.omzet);
  blok("Uitgaven — Inkoopfacturen", b.inkoop);
  blok("Uitgaven — Overige kosten", b.kosten);
}
