begin;

alter table public.reconciliation_decisions drop constraint if exists reconciliation_decisions_decision_check;
alter table public.reconciliation_decisions add constraint reconciliation_decisions_decision_check check (decision in ('match','keep_separate','ignore','merge','unmerge','restore','mark_conflict'));

create table if not exists public.reconciliation_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  algorithm_version text not null,
  feature_version integer not null,
  mode text not null check (mode in ('disabled','observation','review','exact_auto_match')),
  status text not null check (status in ('running','completed','failed','cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cursor jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  statistics jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index if not exists reconciliation_runs_active_uidx on public.reconciliation_runs(user_id, algorithm_version) where status = 'running';
create index if not exists reconciliation_runs_user_started_idx on public.reconciliation_runs(user_id, started_at desc);

create table if not exists public.reconciliation_candidates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_run_id uuid not null,
  raw_transaction_id uuid not null,
  financial_transaction_id text not null,
  candidate_group_id uuid not null,
  score numeric(5,2) not null check (score between 0 and 100),
  classification text not null check (classification in ('exact','strong_suggestion','weak_suggestion','conflict','unmatched','blocked')),
  algorithm_version text not null,
  feature_version integer not null,
  features jsonb not null,
  positive_reasons jsonb not null default '[]'::jsonb,
  negative_reasons jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  rank integer not null check (rank > 0),
  competing_candidates integer not null default 0,
  requires_review boolean not null default true,
  eligible_for_auto_match boolean not null default false,
  status text not null default 'suggested' check (status in ('unmatched','suggested','matched','ignored','conflict','reverted','superseded')),
  generated_at timestamptz not null,
  expires_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, reconciliation_run_id) references public.reconciliation_runs(user_id, id),
  foreign key (user_id, raw_transaction_id) references public.raw_transactions(user_id, id),
  foreign key (user_id, financial_transaction_id) references public.financial_transactions(user_id, id)
);
create unique index if not exists reconciliation_candidates_active_uidx on public.reconciliation_candidates(user_id, raw_transaction_id, financial_transaction_id, algorithm_version) where superseded_at is null;
create index if not exists reconciliation_candidates_queue_idx on public.reconciliation_candidates(user_id, status, classification, score desc, generated_at desc);
create index if not exists reconciliation_candidates_raw_idx on public.reconciliation_candidates(user_id, raw_transaction_id, rank);
create index if not exists reconciliation_candidates_financial_idx on public.reconciliation_candidates(user_id, financial_transaction_id);

alter table public.reconciliation_decisions add column if not exists candidate_id uuid;
alter table public.reconciliation_decisions drop constraint if exists reconciliation_decisions_candidate_fkey;
alter table public.reconciliation_decisions add constraint reconciliation_decisions_candidate_fkey foreign key (user_id, candidate_id) references public.reconciliation_candidates(user_id, id);

create table if not exists public.reconciliation_rules (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type text not null,
  scope text not null,
  conditions jsonb not null,
  action text not null check (action in ('suggest','keep_separate','ignore','block')),
  confidence numeric(5,4) check (confidence between 0 and 1),
  origin text not null check (origin in ('manual','decision','system')),
  status text not null check (status in ('suggested','active','disabled')),
  created_from_decision_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, created_from_decision_id) references public.reconciliation_decisions(user_id, id)
);
create index if not exists reconciliation_rules_active_idx on public.reconciliation_rules(user_id, status, rule_type) where deleted_at is null;

create index if not exists financial_transactions_reconciliation_lookup_idx on public.financial_transactions(user_id, account_id, card_id, transaction_date, amount, type, internal_status);
create index if not exists raw_versions_reconciliation_lookup_idx on public.raw_transaction_versions(user_id, accounting_date, amount, currency, external_status);

insert into public.schema_versions(component, version, migration_name, checksum, metadata)
values ('reconciliation-engine', 1, '008_create_reconciliation_engine_schema', 'phase4-v1', '{"phase":4,"defaultMode":"disabled","heuristicAutoMatch":false}'::jsonb)
on conflict (component) do update set version=excluded.version, applied_at=now(), migration_name=excluded.migration_name, checksum=excluded.checksum, metadata=excluded.metadata;
commit;
