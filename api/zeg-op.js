// Vercel serverless function — /api/zeg-op
//
// Zegt het Smart Admin-abonnement van de ingelogde gebruiker op.
// De opzegging gaat via Stripe (cancel_at_period_end), zodat er niets meer
// wordt afgeschreven na de lopende periode. Daarnaast wordt de opzegging
// direct in het platformschema genoteerd, zodat de app hem meteen toont.
// Als Stripe aan het einde van de periode customer.subscription.deleted
// stuurt, verwerkt de webhook de definitieve stop.
//
// Vereist (omgevingsvariabelen in Vercel):
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// De app stuurt in de body: { accessToken }  — de Supabase-sessietoken van
// de ingelogde gebruiker. Daarmee wordt vastgesteld wíe er opzegt; een
// gebruiker kan dus alleen zijn eigen abonnement opzeggen.

const APP_ID = "smart-admin";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !sbUrl || !sbKey) {
    console.error("zeg-op: ontbrekende omgevingsvariabelen");
    res.status(500).json({ error: "Server niet geconfigureerd" });
    return;
  }

  // Body lezen (kan al geparsed zijn door Vercel, of ruwe tekst).
  let body = req.body;
  if (!body || typeof body === "string") {
    let raw = "";
    await new Promise((resolve) => {
      req.on("data", (c) => (raw += c));
      req.on("end", resolve);
    });
    try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
  }

  const token = body.accessToken;
  if (!token) { res.status(401).json({ error: "Niet ingelogd" }); return; }

  try {
    // 1. Wie is dit? Token inwisselen voor de gebruiker.
    const u = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${token}` }
    });
    const gebruiker = await u.json().catch(() => null);
    if (!u.ok || !gebruiker || !gebruiker.id) {
      res.status(401).json({ error: "Sessie verlopen — log opnieuw in" });
      return;
    }

    const kop = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Accept-Profile": "platform",
      "Content-Profile": "platform"
    };

    // 2. Klant en abonnement opzoeken in het platformschema.
    const kq = await fetch(
      `${sbUrl}/rest/v1/klanten?select=id&app_id=eq.${APP_ID}&app_gebruiker=eq.${encodeURIComponent(gebruiker.id)}`,
      { headers: kop }
    );
    const klanten = await kq.json().catch(() => null);
    if (!Array.isArray(klanten) || !klanten.length) {
      res.status(404).json({ error: "Geen abonnement gevonden" });
      return;
    }
    const aq = await fetch(
      `${sbUrl}/rest/v1/abonnementen?select=id,stripe_subscription,periode_eind,opgezegd_op&klant_id=eq.${klanten[0].id}`,
      { headers: kop }
    );
    const abos = await aq.json().catch(() => null);
    if (!Array.isArray(abos) || !abos.length) {
      res.status(404).json({ error: "Geen abonnement gevonden" });
      return;
    }
    const abo = abos[0];
    if (abo.opgezegd_op) {
      res.status(200).json({ ok: true, al_opgezegd: true, periode_eind: abo.periode_eind });
      return;
    }

    // 3. Bij Stripe opzeggen aan het einde van de periode (er is al betaald).
    if (abo.stripe_subscription) {
      const s = await fetch(
        `https://api.stripe.com/v1/subscriptions/${abo.stripe_subscription}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: "cancel_at_period_end=true"
        }
      );
      const sUit = await s.json().catch(() => null);
      if (!s.ok) {
        console.error("zeg-op: Stripe-fout:", JSON.stringify(sUit));
        res.status(502).json({ error: "Opzeggen bij de betaalprovider mislukte" });
        return;
      }
    } else {
      console.warn("zeg-op: abonnement zonder stripe_subscription — alleen platform bijgewerkt");
    }

    // 4. Opzegging direct in het platform noteren (app toont hem meteen).
    const p = await fetch(`${sbUrl}/rest/v1/abonnementen?id=eq.${abo.id}`, {
      method: "PATCH",
      headers: { ...kop, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ opgezegd_op: new Date().toISOString(), gewijzigd_op: new Date().toISOString() })
    });
    if (!p.ok) {
      const pf = await p.json().catch(() => null);
      console.error("zeg-op: platform bijwerken mislukte:", JSON.stringify(pf));
      // Stripe-opzegging is al gelukt; de webhook herstelt dit later alsnog.
    }

    res.status(200).json({ ok: true, periode_eind: abo.periode_eind });
  } catch (err) {
    console.error("zeg-op: fout:", err.message);
    res.status(500).json({ error: "Interne fout" });
  }
};
