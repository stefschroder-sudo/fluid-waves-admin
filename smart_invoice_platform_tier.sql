-- ============================================================
--  Smart Invoice toevoegen aan het platform (app + tier)
--
--  Zodat mijn_toegang('smart-invoice') en /api/start-checkout werken.
--  Prijs: €9,95/mnd (995 cent). Instap-app; companion (met Smart
--  Admin) is gratis en loopt NIET via deze tier.
--
--  Volgorde: Smart Invoice als eerste in de trechter (instap).
--  Veilig opnieuw te draaien.
-- ============================================================

begin;

-- 1) Ruimte maken vooraan (alleen als Smart Invoice nog niet op 1 staat).
update platform.apps
   set volgorde = volgorde + 1
 where id <> 'smart-invoice'
   and not exists (select 1 from platform.apps where id = 'smart-invoice' and volgorde = 1);

-- 2) De app.  ⚠ Vervang app_sleutel door een eigen geheim (zoals bij Smart Admin).
insert into platform.apps (id, naam, merknaam, omschrijving, url, status, app_sleutel, volgorde)
values (
  'smart-invoice',
  'Smart Invoice',
  null,
  'Factureren en bonnen scannen vanaf je telefoon. Instapper; groeit mee naar Smart Admin.',
  'https://fluid-waves-admin.vercel.app/invoice/',
  'live',
  'fwsk_sminvoice_VERVANG_DIT_DOOR_EEN_EIGEN_GEHEIM',
  1
)
on conflict (id) do update
   set naam         = excluded.naam,
       omschrijving = excluded.omschrijving,
       url          = excluded.url,
       status       = excluded.status,
       volgorde     = 1;

-- 3) De tier.  ⚠ stripe_price_id pas invullen NA het aanmaken van de
--    Stripe-prijs (zie de checklist). Zolang die leeg is, weigert
--    start-checkout met "Deze tier heeft nog geen Stripe-prijs".
insert into platform.tiers
  (id, app_id, naam, omschrijving, prijs_cent, "interval",
   scans_per_periode, scans_totaal,
   mag_exporteren, bewaart_historie, mag_notificaties, toont_vindplaatsen,
   mag_bundels_kopen, actief, volgorde)
values
  ('smart-invoice-vast', 'smart-invoice', 'Vast', 'Vast maandabonnement', 995, 'maand',
   null, null, true, true, false, false, false, true, 1)
on conflict (id) do update
   set prijs_cent = excluded.prijs_cent, "interval" = excluded."interval",
       naam = excluded.naam, actief = true, volgorde = 1;

commit;

-- Als de Stripe-prijs al bestaat, vul 'm hier in en draai los:
-- update platform.tiers set stripe_price_id = 'price_XXXXXXXXXXXX' where id = 'smart-invoice-vast';

-- ---- CONTROLE ----
-- select id, naam, volgorde, status from platform.apps order by volgorde;
-- select id, naam, prijs_cent, interval, stripe_price_id from platform.tiers where app_id='smart-invoice';
