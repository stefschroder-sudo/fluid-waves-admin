// Vercel serverfunctie: haalt een informatieve samenvatting van de actuele
// belastingregels op via Claude, met web search naar actuele bronnen.
//
// BELANGRIJK: dit is puur informatief. De teruggegeven tarieven worden NIET
// automatisch in de berekeningen van de app gebruikt. De gebruiker leest ze
// ter controle en raadpleegt zelf belastingdienst.nl.
//
// Verwacht POST met JSON body: { jaar }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server niet geconfigureerd: ANTHROPIC_API_KEY ontbreekt" });
  }

  try {
    const jaar = (req.body && req.body.jaar) || new Date().getFullYear();

    const prompt =
      "Je bent een hulpmiddel voor een Nederlandse ZZP-administratie. Geef een feitelijke, " +
      "beknopte samenvatting van de belangrijkste belastingregels voor ondernemers/ZZP'ers " +
      "voor het jaar " + jaar + " in Nederland. Zoek de actuele cijfers op via officiële bronnen " +
      "(bij voorkeur belastingdienst.nl). Behandel in elk geval:\n" +
      "- BTW-tarieven (hoog, laag, nultarief) en of er iets wijzigt;\n" +
      "- Inkomstenbelasting box 1: schijven en tarieven;\n" +
      "- Zelfstandigenaftrek (bedrag) en het urencriterium;\n" +
      "- MKB-winstvrijstelling (percentage);\n" +
      "- Kleineondernemersregeling (KOR) hoofdlijnen;\n" +
      "- Belangrijkste wijzigingen ten opzichte van het vorige jaar.\n\n" +
      "Antwoord UITSLUITEND met een JSON-object, zonder uitleg eromheen, zonder markdown, " +
      "zonder ```-tekens. Gebruik exact deze structuur:\n" +
      '{"jaar":' + jaar + ',"samenvatting":"1-2 zinnen algemeen",' +
      '"punten":[{"onderwerp":"kort label","waarde":"het cijfer/tarief","toelichting":"1 zin"}],' +
      '"wijzigingen":["korte zin per wijziging t.o.v. vorig jaar"],' +
      '"bronnen":["url"]}\n' +
      "Wees feitelijk en verzin geen cijfers. Als je een cijfer niet zeker uit een bron kunt " +
      "halen, schrijf dan bij 'waarde' letterlijk 'controleer op belastingdienst.nl' in plaats " +
      "van een geraden getal.";

    const antwoord = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });

    const uit = await antwoord.json();
    if (!antwoord.ok) {
      return res.status(502).json({ error: "AI-aanroep mislukt", detail: JSON.stringify(uit).slice(0, 500) });
    }

    // Alle tekstblokken samenvoegen (web search levert meerdere blokken)
    const verbruik = {
      model: "claude-sonnet-4-5",
      input_tokens: (uit.usage && uit.usage.input_tokens) || 0,
      output_tokens: (uit.usage && uit.usage.output_tokens) || 0
    };
    const tekst = (uit.content || [])
      .filter(function (c) { return c.type === "text"; })
      .map(function (c) { return c.text; })
      .join("\n")
      .trim();

    // JSON eruit halen (soms staat er tekst omheen ondanks de instructie)
    let parsed = null;
    try {
      const schoon = tekst.replace(/```json/gi, "").replace(/```/g, "").trim();
      const eerste = schoon.indexOf("{");
      const laatste = schoon.lastIndexOf("}");
      if (eerste >= 0 && laatste > eerste) {
        parsed = JSON.parse(schoon.slice(eerste, laatste + 1));
      }
    } catch (e) {
      parsed = null;
    }

    if (!parsed) {
      return res.status(200).json({ ok: false, ruwe_tekst: tekst.slice(0, 4000), verbruik: verbruik });
    }
    return res.status(200).json({ ok: true, data: parsed, verbruik: verbruik });
  } catch (err) {
    return res.status(500).json({ error: "Onverwachte fout", detail: String(err).slice(0, 500) });
  }
}
