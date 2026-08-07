-- ============================================================
--  Smart Invoice — eigen schema (losstaand van Smart Admin)
--
--  Waarom apart: zolang iemand GEEN Smart Admin heeft, mogen zijn
--  mobiele scans niet in de Smart Admin-verzamelmappen belanden.
--  Ze komen in zijn eigen map: smart_invoice.inbox. Bij een upgrade
--  naar Smart Admin verhuist alles 1-op-1 (functie onderaan).
--
--  Bestanden blijven in dezelfde storage-bucket ('adm-bestanden'),
--  zodat een migratie alleen databaserijen hoeft te verplaatsen en
--  bestand_pad geldig blijft.
--
--  Terugvalpunt: drop schema if exists smart_invoice cascade;
-- ============================================================

create schema if not exists smart_invoice;
grant usage on schema smart_invoice to authenticated;

-- ── Eigen verzamelmap (scans) ───────────────────────────────
create table if not exists smart_invoice.inbox (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  soort         text not null check (soort in ('omzet','kosten')),
  bestand_pad   text not null,
  bestand_naam  text,
  datum         date,
  naam          text,
  omschrijving  text,
  bedrag_excl   numeric,
  btw_bedrag    numeric,
  bedrag_incl   numeric,
  btw_pct       int,
  herkend       boolean not null default false,
  status        text not null default 'nieuw' check (status in ('nieuw','verwerkt')),
  aangemaakt_op timestamptz not null default now()
);
create index if not exists si_inbox_user_soort
  on smart_invoice.inbox (user_id, soort, status);

alter table smart_invoice.inbox enable row level security;
drop policy if exists si_inbox_eigen on smart_invoice.inbox;
create policy si_inbox_eigen on smart_invoice.inbox
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on smart_invoice.inbox to authenticated;

-- ── Bedrijfsgegevens voor op de factuur (één rij per gebruiker) ──
create table if not exists smart_invoice.bedrijf (
  user_id       uuid primary key default auth.uid(),
  naam          text,
  adres         text,
  postcode      text,
  plaats        text,
  email         text,
  telefoon      text,
  iban          text,
  kvk           text,
  btw_nummer    text,
  logo_pad      text,
  bijgewerkt_op timestamptz not null default now()
);
alter table smart_invoice.bedrijf enable row level security;
drop policy if exists si_bedrijf_eigen on smart_invoice.bedrijf;
create policy si_bedrijf_eigen on smart_invoice.bedrijf
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on smart_invoice.bedrijf to authenticated;

-- ── Migratie naar Smart Admin (roep aan zodra iemand upgradet) ──
--  Verplaatst alle 'nieuw'-items van de ingelogde gebruiker naar de
--  opgegeven Smart Admin-administratie. Bestanden blijven staan.
create or replace function public.smart_invoice_migreer_naar_admin(p_administratie_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'smart_admin', 'smart_invoice', 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_aantal integer := 0;
begin
  if v_uid is null then
    raise exception 'niet ingelogd';
  end if;
  -- Administratie moet van de gebruiker zelf zijn.
  if not exists (select 1 from smart_admin.administraties a where a.id = p_administratie_id and a.user_id = v_uid) then
    raise exception 'administratie niet van deze gebruiker';
  end if;

  insert into smart_admin.inbox
    (user_id, administratie_id, soort, bestand_pad, bestand_naam, datum, naam,
     omschrijving, bedrag_excl, btw_bedrag, bedrag_incl, btw_pct, herkend, status)
  select user_id, p_administratie_id, soort, bestand_pad, bestand_naam, datum, naam,
         omschrijving, bedrag_excl, btw_bedrag, bedrag_incl, btw_pct, herkend, status
    from smart_invoice.inbox
   where user_id = v_uid;
  get diagnostics v_aantal = row_count;

  delete from smart_invoice.inbox where user_id = v_uid;
  return v_aantal;
end;
$function$;
grant execute on function public.smart_invoice_migreer_naar_admin(uuid) to authenticated;

-- ============================================================
--  BELANGRIJK — PostgREST moet het nieuwe schema kennen.
--  Voeg 'smart_invoice' toe aan de exposed schemas:
--    Supabase Dashboard → Project Settings → API → Exposed schemas
--    (naast public, storage, smart_admin) → Save.
--  Zonder deze stap geeft de app "schema must be one of…".
-- ============================================================

-- ---- CONTROLE ----
-- select table_name from information_schema.tables where table_schema='smart_invoice';
--   verwacht: inbox, bedrijf
