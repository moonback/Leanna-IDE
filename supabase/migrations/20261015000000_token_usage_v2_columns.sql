-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : token_usage v2 — fiabilité de la télémétrie (audit 2026-10-15)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute les colonnes permettant de distinguer :
--   * tokens mis en cache / de raisonnement (inclus dans input/output_tokens) ;
--   * usage mesuré (fournisseur) vs estimé (réponse sans métadonnées) ;
--   * tarif exact / normalisé / gratuit / par défaut (modèle inconnu) ;
--   * appel de secours (fallback) et fournisseur initial ;
--   * appels streamés ;
--   * coût renvoyé par le fournisseur (OpenRouter usage.cost) pour comparaison.
-- TelemetryService se replie sur le schéma v1 si ces colonnes sont absentes.
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.token_usage add column if not exists cached_input_tokens integer not null default 0;
alter table public.token_usage add column if not exists reasoning_tokens    integer not null default 0;
alter table public.token_usage add column if not exists usage_source        text    not null default 'provider';
alter table public.token_usage add column if not exists pricing_source      text    not null default 'exact';
alter table public.token_usage add column if not exists is_fallback         boolean not null default false;
alter table public.token_usage add column if not exists fallback_from       text;
alter table public.token_usage add column if not exists streamed            boolean not null default false;
alter table public.token_usage add column if not exists provider_cost_usd   double precision;

create index if not exists token_usage_provider_idx on public.token_usage (provider);
