begin;

alter table public.financial_transactions
  add column if not exists source text not null default 'manual',
  add column if not exists provider text,
  add column if not exists external_account_id text,
  add column if not exists external_transaction_id text,
  add column if not exists external_status text,
  add column if not exists internal_status text not null default 'active',
  add column if not exists fingerprint text,
  add column if not exists fingerprint_version integer,
  add column if not exists provider_fields jsonb not null default '{}'::jsonb,
  add column if not exists user_fields jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists tombstone_at timestamptz,
  add column if not exists last_external_seen_at timestamptz,
  add column if not exists identity_metadata jsonb not null default '{}'::jsonb;

alter table public.financial_accounts add column if not exists source text not null default 'manual';
alter table public.payment_cards add column if not exists source text not null default 'manual';
alter table public.financial_transfers add column if not exists source text not null default 'manual';
alter table public.credit_card_invoice_records add column if not exists source text not null default 'manual';
alter table public.financial_recurrences add column if not exists source text not null default 'manual';

create table if not exists public.external_sources (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('manual','open_finance','ofx','csv','migration','system')), provider text, external_source_key text, display_name text,
  status text not null default 'active', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_seen_at timestamptz, deleted_at timestamptz,
  unique (user_id, id)
);
create unique index if not exists external_sources_identity_uidx on public.external_sources(user_id, source_type, coalesce(provider, ''), external_source_key) where external_source_key is not null;

create table if not exists public.external_accounts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  external_source_id uuid not null, provider text, external_account_id text,
  account_fingerprint text, account_fingerprint_version integer,
  financial_account_id text, external_status text not null default 'unknown' check (external_status in ('pending','posted','cancelled','removed','unknown')), raw_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  deleted_at timestamptz, tombstone_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, external_source_id) references public.external_sources(user_id, id),
  foreign key (user_id, financial_account_id) references public.financial_accounts(user_id, id)
);
create unique index if not exists external_accounts_provider_id_uidx on public.external_accounts(user_id, external_source_id, coalesce(provider, ''), external_account_id) where external_account_id is not null;
create index if not exists external_accounts_fingerprint_idx on public.external_accounts(user_id, external_source_id, account_fingerprint, account_fingerprint_version);

create table if not exists public.raw_transactions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  external_source_id uuid not null, external_account_id uuid, provider text,
  external_transaction_id text, stable_external_key text, external_status text not null default 'unknown' check (external_status in ('pending','posted','cancelled','removed','unknown')),
  current_version_id uuid, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  deleted_at timestamptz, tombstone_at timestamptz, reappeared_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, external_source_id) references public.external_sources(user_id, id),
  foreign key (user_id, external_account_id) references public.external_accounts(user_id, id)
);
create unique index if not exists raw_transactions_stable_key_uidx on public.raw_transactions(user_id, external_source_id, stable_external_key) where stable_external_key is not null;
create index if not exists raw_transactions_external_id_idx on public.raw_transactions(user_id, external_source_id, external_account_id, external_transaction_id);
create index if not exists raw_transactions_tombstone_idx on public.raw_transactions(user_id, tombstone_at) where tombstone_at is not null;

create table if not exists public.raw_transaction_versions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  raw_transaction_id uuid not null, version_number integer not null check (version_number > 0),
  payload jsonb not null, payload_hash text not null, normalized_payload jsonb not null default '{}'::jsonb,
  normalization_version integer not null, fingerprint text, fingerprint_version integer,
  external_status text not null default 'unknown' check (external_status in ('pending','posted','cancelled','removed','unknown')), occurred_at timestamptz, accounting_date date,
  amount numeric(18,2), currency text, description text, received_at timestamptz not null default now(),
  supersedes_version_id uuid, change_reason text, created_at timestamptz not null default now(),
  unique (user_id, id), unique (user_id, raw_transaction_id, version_number),
  unique (user_id, raw_transaction_id, payload_hash),
  foreign key (user_id, raw_transaction_id) references public.raw_transactions(user_id, id),
  foreign key (user_id, supersedes_version_id) references public.raw_transaction_versions(user_id, id)
);
alter table public.raw_transactions drop constraint if exists raw_transactions_current_version_fk;
alter table public.raw_transactions add constraint raw_transactions_current_version_fk foreign key (user_id, current_version_id) references public.raw_transaction_versions(user_id, id) deferrable initially deferred;
create index if not exists raw_versions_fingerprint_idx on public.raw_transaction_versions(user_id, fingerprint, fingerprint_version);
create index if not exists raw_versions_received_idx on public.raw_transaction_versions(user_id, raw_transaction_id, received_at desc);

create table if not exists public.transaction_links (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  financial_transaction_id text not null, raw_transaction_id uuid not null,
  link_type text not null check (link_type in ('identity','import','sync','merge','manual_match','correction')), status text not null default 'matched' check (status in ('unmatched','suggested','matched','ignored','conflict','reverted')), confidence numeric(5,4) check (confidence between 0 and 1),
  match_method text, match_reasons jsonb not null default '[]'::jsonb, algorithm_version text,
  is_primary boolean not null default false, created_by text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, reverted_at timestamptz, reverted_by text, revert_reason text,
  unique (user_id, id),
  foreign key (user_id, financial_transaction_id) references public.financial_transactions(user_id, id),
  foreign key (user_id, raw_transaction_id) references public.raw_transactions(user_id, id)
);
create unique index if not exists transaction_links_active_uidx on public.transaction_links(user_id, financial_transaction_id, raw_transaction_id, link_type) where reverted_at is null and deleted_at is null;
create index if not exists transaction_links_financial_idx on public.transaction_links(user_id, financial_transaction_id);
create index if not exists transaction_links_raw_idx on public.transaction_links(user_id, raw_transaction_id);

create table if not exists public.audit_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, entity_id text not null, event_type text not null,
  actor_type text not null check (actor_type in ('user','system','provider','migration')), actor_id text, source text not null check (source in ('manual','open_finance','ofx','csv','migration','system')),
  correlation_id uuid, causation_id uuid, before_data jsonb, after_data jsonb,
  changed_fields jsonb not null default '[]'::jsonb, reason text, metadata jsonb not null default '{}'::jsonb,
  idempotency_key text, occurred_at timestamptz not null, created_at timestamptz not null default now(),
  unique (user_id, id), unique (user_id, idempotency_key)
);
create index if not exists audit_events_entity_date_idx on public.audit_events(user_id, entity_type, entity_id, occurred_at desc);
create index if not exists audit_events_type_date_idx on public.audit_events(user_id, event_type, occurred_at desc);

create table if not exists public.reconciliation_decisions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  raw_transaction_id uuid not null, financial_transaction_id text,
  decision text not null check (decision in ('match','keep_separate','ignore','merge','unmerge','restore')), status text not null check (status in ('unmatched','suggested','matched','ignored','conflict','reverted')), confidence numeric(5,4) check (confidence between 0 and 1),
  reasons jsonb not null default '[]'::jsonb, features jsonb not null default '{}'::jsonb,
  algorithm_version text, decided_by text not null, decided_at timestamptz not null,
  supersedes_decision_id uuid, reverted_at timestamptz, reverted_by text, revert_reason text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, raw_transaction_id) references public.raw_transactions(user_id, id),
  foreign key (user_id, financial_transaction_id) references public.financial_transactions(user_id, id),
  foreign key (user_id, supersedes_decision_id) references public.reconciliation_decisions(user_id, id)
);
create index if not exists reconciliation_decisions_active_idx on public.reconciliation_decisions(user_id, raw_transaction_id, status) where reverted_at is null;

create index if not exists financial_transactions_origin_idx on public.financial_transactions(user_id, source, internal_status);
create index if not exists financial_transactions_external_identity_idx on public.financial_transactions(user_id, provider, external_account_id, external_transaction_id);
create index if not exists financial_transactions_fingerprint_idx on public.financial_transactions(user_id, fingerprint, fingerprint_version);

insert into public.schema_versions(component, version, migration_name, checksum, metadata)
values ('origin-identity-audit', 1, '004_create_origin_identity_audit_schema', 'phase2-v1', '{"phase":2}'::jsonb)
on conflict (component) do update set version=excluded.version, applied_at=now(), migration_name=excluded.migration_name, checksum=excluded.checksum, metadata=excluded.metadata;
commit;
