begin;

create table if not exists public.schema_versions (
  component text primary key,
  version integer not null check (version > 0),
  applied_at timestamptz not null default now(),
  migration_name text not null,
  checksum text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.migration_runs (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  migration_name text not null,
  migration_version integer not null check (migration_version > 0),
  status text not null check (status in ('running','completed','failed','cancelled','skipped')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  checkpoint jsonb not null default '{}'::jsonb,
  processed_count bigint not null default 0, inserted_count bigint not null default 0,
  updated_count bigint not null default 0, skipped_count bigint not null default 0,
  error_count bigint not null default 0, error_summary text,
  source_revision bigint, source_checksum text, metadata jsonb not null default '{}'::jsonb,
  unique (user_id, migration_name, source_revision, source_checksum)
);

create table if not exists public.financial_accounts (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  name text, type text, institution text, currency text,
  initial_balance numeric(18,2), initial_balance_date date, include_in_total boolean,
  archived boolean, archived_at timestamptz, color text, icon text, notes text,
  legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null,
  created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.payment_cards (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  name text, institution text, account_id text, closing_day integer, due_day integer,
  archived boolean, limit_amount numeric(18,2), billing_config jsonb,
  legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id)
);

create table if not exists public.financial_categories (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  name text not null, legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.cost_centers (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  name text not null, legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.financial_recurrences (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  type text, description text, amount numeric(18,2), frequency text, interval_count integer,
  start_date date, end_date date, next_occurrence_date date, status text,
  account_id text, card_id text, source_account_id text, destination_account_id text,
  legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, card_id) references public.payment_cards(user_id, id),
  foreign key (user_id, source_account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, destination_account_id) references public.financial_accounts(user_id, id)
);

create table if not exists public.credit_card_invoice_records (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  card_id text, competence_key text, status text, total_amount numeric(18,2),
  paid_amount numeric(18,2), pending_amount numeric(18,2), due_date date,
  payment_account_id text, legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, card_id) references public.payment_cards(user_id, id),
  foreign key (user_id, payment_account_id) references public.financial_accounts(user_id, id)
);

create table if not exists public.financial_transactions (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  type text, description text, amount numeric(18,2), transaction_date date,
  competence_key text, due_date date, paid_at timestamptz, status text,
  account_id text, card_id text, category_id text, cost_center_id text,
  invoice_id text, recurrence_id text, installment_group_id text,
  installment_number integer, installment_total integer, is_paid boolean, is_cancelled boolean,
  legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, card_id) references public.payment_cards(user_id, id),
  foreign key (user_id, category_id) references public.financial_categories(user_id, id),
  foreign key (user_id, cost_center_id) references public.cost_centers(user_id, id),
  foreign key (user_id, invoice_id) references public.credit_card_invoice_records(user_id, id),
  foreign key (user_id, recurrence_id) references public.financial_recurrences(user_id, id)
);

create table if not exists public.financial_transfers (
  user_id uuid not null references auth.users(id) on delete cascade, id text not null,
  source_account_id text, destination_account_id text, amount numeric(18,2), fee_amount numeric(18,2),
  scheduled_date date, completed_at timestamptz, cancelled_at timestamptz, reversed_at timestamptz,
  status text, recurrence_id text, legacy_payload jsonb not null, source_state_revision bigint not null,
  source_snapshot_id text, source_checksum text not null, created_at timestamptz, updated_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, source_account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, destination_account_id) references public.financial_accounts(user_id, id),
  foreign key (user_id, recurrence_id) references public.financial_recurrences(user_id, id)
);

create table if not exists public.migration_issues (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  migration_run_id uuid references public.migration_runs(id) on delete cascade,
  entity_type text not null, legacy_id text, issue_code text not null,
  severity text not null check (severity in ('info','warning','error','critical')),
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), resolved_at timestamptz
);

create index if not exists financial_transactions_user_date_idx on public.financial_transactions(user_id, transaction_date);
create index if not exists financial_transactions_user_competence_idx on public.financial_transactions(user_id, competence_key);
create index if not exists financial_transactions_user_account_idx on public.financial_transactions(user_id, account_id);
create index if not exists financial_transactions_user_card_idx on public.financial_transactions(user_id, card_id);
create index if not exists financial_transactions_user_category_idx on public.financial_transactions(user_id, category_id);
create index if not exists financial_transactions_user_invoice_idx on public.financial_transactions(user_id, invoice_id);
create index if not exists financial_transactions_user_status_idx on public.financial_transactions(user_id, status);
create index if not exists financial_transactions_user_revision_idx on public.financial_transactions(user_id, source_state_revision);
create index if not exists financial_accounts_user_archived_idx on public.financial_accounts(user_id, archived);
create index if not exists payment_cards_user_archived_idx on public.payment_cards(user_id, archived);
create index if not exists migration_runs_user_status_idx on public.migration_runs(user_id, status);

insert into public.schema_versions(component, version, migration_name, checksum)
values ('relational-shadow', 1, '002_create_relational_shadow_schema', 'phase1-v1')
on conflict (component) do update set version=excluded.version, applied_at=now(), migration_name=excluded.migration_name, checksum=excluded.checksum;
commit;
