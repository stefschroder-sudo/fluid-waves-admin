# Smart Invoice — oplevering & vervolgstappen

Lichte, mobiel-eerste **PWA** op dezelfde backend als Smart Admin (Supabase
`vsvqybcfhvlrbnhmuerh`, hergebruikt `/api/extract` en `/api/factuurpdf`).
Factureren + bonnen scannen vanaf de telefoon.

## Wat het doet

Drie tabbladen: **Scannen** (camera/upload → AI-herkenning → in de map),
**Mijn map** (verzamelmap, ook op de pc te bekijken en te corrigeren),
**Factuur** (klant + regels → factuur-pdf in huisstijl), plus **Account**.

Drie modi, automatisch bepaald via `mijn_toegang`:

- **Companion** — heeft een lopend **Smart Admin**-abonnement → Smart Invoice is
  gratis. Scans gaan rechtstreeks in `smart_admin.inbox` (de bestaande
  verzamelmappen op de desktop). Bedrijfsgegevens komen uit de administratie.
- **Standalone** — heeft `smart-invoice`-abonnement (€9,95/mnd ex btw) maar geen
  Smart Admin → scans gaan in de **eigen map** `smart_invoice.inbox`. Bij een
  latere upgrade verhuist alles 1-op-1 (zie migratie).
- **Proef** — geen van beide → alles invulbaar, bewaren vraagt om een abonnement.

De factuur kan optioneel meteen als **Omzet** in de eigen map worden gezet, zodat
hij later mee-boekt in Smart Admin.

## Bestanden

```
invoice/                         → in fluid-waves-admin repo (web-served)
  index.html                     → de PWA (single-file)
  manifest.webmanifest
  sw.js                          → service worker (app-schil offline; /api nooit gecacht)
  icon-192.png / icon-512.png / icon-maskable-512.png
smart_invoice_schema.sql         → nieuw schema: inbox + bedrijf + migratiefunctie
smart_invoice_platform_tier.sql  → app 'smart-invoice' + tier 'smart-invoice-vast' (€9,95)
```

## Vervolgstappen (volgorde)

1. **SQL in Supabase** (SQL Editor):
   - `smart_invoice_schema.sql` draaien.
   - **Exposed schemas**: Project Settings → API → Exposed schemas → voeg
     `smart_invoice` toe (naast public, storage, smart_admin) → Save.
     Zonder dit geeft de app "schema must be one of…".
   - `smart_invoice_platform_tier.sql` draaien (vervang de `app_sleutel` door een
     eigen geheim, net als bij Smart Admin).

2. **Stripe (sandbox = Schröder Consult sandbox, dezelfde als Smart Admin)**:
   - Maak een product/prijs: **€9,95/mnd, terugkerend, ex btw**.
   - Zet de price-id in de tier:
     `update platform.tiers set stripe_price_id = 'price_XXXX' where id = 'smart-invoice-vast';`
   - Env vars staan al goed (dezelfde Vercel-projectomgeving als Smart Admin:
     `STRIPE_SECRET_KEY`, `SUPABASE_*`, `ANTHROPIC_API_KEY`). Geen intro-coupon
     op deze tier (die geldt via `FW_INTRO_TIER` alleen voor smart-admin-vast).

3. **Deploy**: `invoice/`-map committen in **fluid-waves-admin** en pushen →
   Vercel serveert hem op `https://fluid-waves-admin.vercel.app/invoice/`.
   Same-origin met `/api/*`, dus geen CORS nodig.

4. **Etalage** (site-taak, later): Smart Invoice in `public.catalogus` +
   `platform.apps` (staat na de tier-SQL al in `platform.apps`), en in
   `FW_APP_UITLEG`/`ikonen` van de etalage-HTML. Instaptarief €9,95 sluit aan op
   de pitch-trechter.

5. **Upgrade-migratie** (wanneer een standalone-klant Smart Admin neemt):
   roep in Smart Admin na het aanmaken/kiezen van de administratie eenmalig aan:
   `select public.smart_invoice_migreer_naar_admin('<administratie_id>');`
   Dit verplaatst `smart_invoice.inbox` → `smart_admin.inbox` (bestanden blijven
   in dezelfde bucket, dus `bestand_pad` blijft geldig). Nog in te bouwen in de
   Smart Admin-flow.

## Live-gang

Bij de Stripe live-gang (checklist Smart Admin): ook voor Smart Invoice de
prijs in **live** aanmaken en de live `stripe_price_id` in de tier zetten.

## Getest

`node --check` op de app-JS = OK. jsdom-laadtest: login → app (proefmodus) →
alle vier tabs, geen console-fouten. Config staat vast ingevuld (geen placeholders).
Nog live te testen: echte login, scan → `/api/extract`, factuur → `/api/factuurpdf`,
en de checkout na het invullen van de Stripe price-id.
