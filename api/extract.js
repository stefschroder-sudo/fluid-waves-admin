// Vercel serverfunctie: leest een factuur/bon uit met Claude en geeft
// de velden terug als JSON. De Anthropic-sleutel blijft hier op de server
// en komt nooit in de browser.
//
// Verwacht een POST met JSON body: { soort, media_type, data }
//   soort      : 'omzet' | 'inkoop' | 'kosten'  (stuurt de uitleg-prompt)
//   media_type : 'application/pdf' | 'image/jpeg' | 'image/png'
//   data       : base64 van het bestand (zonder data:-prefix)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server niet geconfigureerd: ANTHROPIC_API_KEY ontbreekt" });
  }

  try {
    const { soort, media_type, data } = req.body || {};
    if (!media_type || !data) {
      return res.status(400).json({ error: "media_type en data zijn verplicht" });
    }

    const partij = (soort === "omzet") ? "klant (afnemer)" : "leverancier";
    const bankPrompt =
      "Je krijgt een bankjaaroverzicht. Zoek het saldo per 31 december (eindsaldo) van " +
      "alle betaal- en spaarrekeningen die erin staan, en tel die eindsaldi bij elkaar op. " +
      "Antwoord UITSLUITEND met een JSON-object, zonder uitleg, zonder markdown, zonder ```-tekens. " +
      'Gebruik exact deze velden:\n{"banksaldo":getal,"datum":"YYYY-MM-DD"}\n' +
      "banksaldo is de som van alle eindsaldi per 31 december als getal met punt als decimaalteken, " +
      "geen euroteken. datum is de peildatum (31 december van het overzichtsjaar). " +
      "Verzin niets; als je het saldo niet zeker weet, gebruik null.";
    const bonPrompt =
      "Je krijgt een factuur of bon. Haal de gegevens eruit en antwoord UITSLUITEND " +
      "met een JSON-object, zonder uitleg, zonder markdown, zonder ```-tekens. " +
      "Gebruik exact deze velden:\n" +
      '{"datum":"YYYY-MM-DD","naam":"naam van de ' + partij + '",' +
      '"omschrijving":"korte omschrijving","bedrag_excl":getal,"btw_bedrag":getal,' +
      '"bedrag_incl":getal,"btw_pct":21}\n' +
      "Regels: bedragen als getal met punt als decimaalteken, geen euroteken. " +
      "Als een bedrag ontbreekt, bereken het uit de andere twee. " +
      "Als het btw-percentage onduidelijk is, leid het af uit btw_bedrag/bedrag_excl " +
      "(meestal 21, soms 9 of 0). Als de datum ontbreekt, gebruik null. " +
      "Verzin niets; laat tekstvelden leeg als je het niet zeker weet.";
    const prompt = (soort === "bank") ? bankPrompt : bonPrompt;

    // Bestand als document (pdf) of image (jpg/png) meesturen
    const isPdf = media_type === "application/pdf";
    const bron = isPdf
      ? { type: "document", source: { type: "base64", media_type, data } }
      : { type: "image",    source: { type: "base64", media_type, data } };

    const antwoord = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          { role: "user", content: [ bron, { type: "text", text: prompt } ] },
        ],
      }),
    });

    if (!antwoord.ok) {
      const t = await antwoord.text();
      return res.status(502).json({ error: "Fout van Claude API", detail: t.slice(0, 500) });
    }

    const uit = await antwoord.json();
    const verbruik = {
      model: "claude-sonnet-4-5",
      input_tokens: (uit.usage && uit.usage.input_tokens) || 0,
      output_tokens: (uit.usage && uit.usage.output_tokens) || 0
    };
    const tekst = (uit.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Voor de zekerheid eventuele ```-omheining strippen
    const schoon = tekst.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    let velden;
    try {
      velden = JSON.parse(schoon);
    } catch (e) {
      return res.status(200).json({ ok: false, ruwe_tekst: tekst, verbruik: verbruik,
        error: "Kon het antwoord niet als JSON lezen" });
    }

    return res.status(200).json({ ok: true, velden, verbruik: verbruik });
  } catch (err) {
    return res.status(500).json({ error: "Onverwachte fout", detail: String(err).slice(0, 500) });
  }
}
