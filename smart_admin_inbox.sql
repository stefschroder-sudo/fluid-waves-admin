-- ============================================================
--  Verzamelmappen (inbox) voor Smart Admin
--
--  Twee mappen per administratie — Omzet en Kosten — waarin de
--  gebruiker bonnen, briefjes en facturen verzamelt (upload, slepen
--  of camera). De AI-herkenning vult datum/bedrag/btw alvast in.
--  Vanuit de map wordt een item verwijderd, of met één vinkje
--  opgenomen in de boekhouding (status wordt dan 'verwerkt').
--
--  Terugvalpunt: drop table smart_admin.inbox;
-- ============================================================

create table if not exists smart_admin.inbox (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  administratie_id uuid not null,
  soort            text not null check (soort in ('omzet','kosten')),
  bestand_pad      text not null,
  bestand_naam     text,
  datum            date,
  naam             text,
  omschrijving     text,
  bedrag_excl      numeric,
  btw_bedrag       numeric,
  bedrag_incl      numeric,
  btw_pct          int,
  herkend          boolean not null default false,
  status           text not null default 'nieuw' check (status in ('nieuw','verwerkt')),
  boeking_id       uuid,
  aangemaakt_op    timestamptz not null default now()
);

create index if not exists inbox_admin_soort
  on smart_admin.inbox (administratie_id, soort, status);

-- Iedereen mag alleen bij zijn eigen inbox-items.
alter table smart_admin.inbox enable row level security;

drop policy if exists inbox_eigen on smart_admin.inbox;
create policy inbox_eigen on smart_admin.inbox
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on smart_admin.inbox to authenticated;

-- Controle: hoort een lege tabel te tonen.
select count(*) as inbox_items from smart_admin.inbox;
