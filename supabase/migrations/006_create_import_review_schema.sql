begin;

create table if not exists public.import_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_type text not null check (file_type in ('ofx','csv')),
  original_filename text not null,
  file_size bigint not null check (file_size > 0),
  file_hash text not null check (file_hash like 'sha256:%'),
  parser_version integer not null check (parser_version > 0),
  status text not null check (status in ('uploaded','parsing','awaiting_mapping','awaiting_review','confirmed','partially_confirmed','rejected','failed','cancelled')),
  external_source_id uuid,
  external_account_id uuid,
  financial_account_id text,
  payment_card_id text,
  statement_type text not null check (statement_type in ('checking','card')),
  default_currency text not null default 'BRL',
  source_timezone text,
  csv_mapping jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  suspicious_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  general_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, external_source_id) references public.external_sources(user_id, id),
  foreign key (user_id, external_account_id) references public.external_accounts(user_id, id),
  foreign key (user_id, financial_account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, payment_card_id) references public.payment_cards(user_id, id)
);
create unique index if not exists import_batches_file_context_uidx on public.import_batches(user_id, file_hash, file_type, statement_type, coalesce(external_account_id::text, financial_account_id, payment_card_id, 'unassigned')) where status <> 'cancelled';
create index if not exists import_batches_user_created_idx on public.import_batches(user_id, created_at desc);
create index if not exists import_batches_user_status_idx on public.import_batches(user_id, status);

create table if not exists public.import_batch_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid not null,
  source_line integer not null check (source_line > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  original_description text,
  normalized_description text,
  original_amount text,
  normalized_amount numeric(18,2),
  amount_minor_units bigint,
  currency text,
  original_date text,
  source_timezone text,
  original_instant timestamptz,
  accounting_date date,
  external_transaction_id text,
  fingerprint text,
  normalization_version integer not null,
  inferred_type text check (inferred_type in ('income','expense','unknown')),
  external_status text not null default 'unknown' check (external_status in ('pending','posted','cancelled','removed','unknown')),
  review_status text not null default 'new' check (review_status in ('new','exact_duplicate','possible_duplicate','updated','invalid','suspicious','accepted','ignored')),
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  suspicion_reasons jsonb not null default '[]'::jsonb,
  possible_duplicate jsonb,
  user_decision text check (user_decision in ('accept','ignore','restore')),
  raw_transaction_id uuid,
  raw_transaction_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, import_batch_id, source_line),
  foreign key (user_id, import_batch_id) references public.import_batches(user_id, id),
  foreign key (user_id, raw_transaction_id) references public.raw_transactions(user_id, id),
  foreign key (user_id, raw_transaction_version_id) references public.raw_transaction_versions(user_id, id)
);
create index if not exists import_records_batch_status_idx on public.import_batch_records(user_id, import_batch_id, review_status);
create index if not exists import_records_external_id_idx on public.import_batch_records(user_id, external_transaction_id);
create index if not exists import_records_fingerprint_idx on public.import_batch_records(user_id, fingerprint, normalization_version);
create index if not exists import_records_accounting_date_idx on public.import_batch_records(user_id, accounting_date);

insert into public.schema_versions(component, version, migration_name, checksum, metadata)
values ('file-import-review', 1, '006_create_import_review_schema', 'phase3-v1', '{"phase":3,"officialWrite":false}'::jsonb)
on conflict (component) do update set version=excluded.version, applied_at=now(), migration_name=excluded.migration_name, checksum=excluded.checksum, metadata=excluded.metadata;
commit;
