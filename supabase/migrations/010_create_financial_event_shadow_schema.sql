begin;
create table if not exists public.classification_runs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  classifier_version text not null, matrix_version text not null, mode text not null check (mode in ('shadow','dry_run')),
  status text not null check (status in ('running','completed','failed','cancelled')), cursor jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb, statistics jsonb not null default '{}'::jsonb, error_summary text,
  started_at timestamptz not null default now(), finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id)
);
create unique index if not exists classification_runs_active_uidx on public.classification_runs(user_id,classifier_version) where status='running';

create table if not exists public.financial_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, classification_run_id uuid,
  financial_transaction_id text, raw_transaction_id uuid, event_type text not null check(event_type in ('cash_income','cash_expense','cash_deposit','cash_withdrawal','account_fee','interest_income','interest_charge','card_purchase','card_installment','invoice_payment','invoice_partial_payment','invoice_late_payment','invoice_interest','invoice_fee','invoice_installment','invoice_adjustment','internal_transfer_out','internal_transfer_in','external_transfer_out','external_transfer_in','transfer_fee','refund','partial_refund','chargeback','reversal','voided_transaction','investment_purchase','investment_sale','investment_income','investment_fee','investment_transfer','unknown','under_review','ignored')), subtype text,
  classification_status text not null check (classification_status in ('classified','under_review','ignored','rejected','superseded')),
  classification_method text not null check (classification_method in ('manual','explicit_link','external_type','deterministic_rule','reconciliation','heuristic','unknown')),
  classification_version text not null, matrix_version text not null, confidence smallint not null check (confidence between 0 and 100),
  reasons jsonb not null default '[]'::jsonb, warnings jsonb not null default '[]'::jsonb, effects jsonb not null,
  account_id text, card_id text, invoice_id text, transfer_id text, installment_group_id text,
  occurred_at timestamptz, accounting_date date, competence_date date, settled_at timestamptz, invoice_date date, projection_date date,
  idempotency_key text not null, confirmed_at timestamptz, confirmed_by text, reviewed_at timestamptz, reviewed_by text,
  superseded_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,idempotency_key),
  foreign key(user_id,classification_run_id) references public.classification_runs(user_id,id),
  foreign key(user_id,financial_transaction_id) references public.financial_transactions(user_id,id),
  foreign key(user_id,raw_transaction_id) references public.raw_transactions(user_id,id),
  foreign key(user_id,account_id) references public.financial_accounts(user_id,id),
  foreign key(user_id,card_id) references public.payment_cards(user_id,id),
  foreign key(user_id,invoice_id) references public.credit_card_invoice_records(user_id,id),
  foreign key(user_id,transfer_id) references public.financial_transfers(user_id,id)
);
create index if not exists financial_events_review_idx on public.financial_events(user_id,classification_status,competence_date,event_type) where superseded_at is null;
create index if not exists financial_events_source_idx on public.financial_events(user_id,raw_transaction_id,financial_transaction_id);

create table if not exists public.financial_event_links (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, source_event_id uuid not null, target_event_id uuid not null,
  link_type text not null check (link_type in ('belongs_to_invoice','settles_invoice','partial_settlement','transfer_counterpart','reverses','partially_reverses','chargeback_of','fee_of','interest_of','installment_of','invoice_installment_of','cash_leg_of_investment','adjusts')),
  amount_minor bigint, currency text not null default 'BRL', status text not null default 'active' check(status in ('active','reverted')),
  idempotency_key text not null, metadata jsonb not null default '{}'::jsonb, created_by text not null, created_at timestamptz not null default now(),
  reverted_at timestamptz, reverted_by text, revert_reason text, unique(user_id,id), unique(user_id,idempotency_key),
  foreign key(user_id,source_event_id) references public.financial_events(user_id,id), foreign key(user_id,target_event_id) references public.financial_events(user_id,id), check(source_event_id<>target_event_id)
);
create unique index if not exists financial_event_links_active_uidx on public.financial_event_links(user_id,source_event_id,target_event_id,link_type) where reverted_at is null;

create table if not exists public.financial_classification_comparisons (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, classification_run_id uuid not null,
  metric text not null, period_key text, current_minor bigint not null, shadow_minor bigint not null, difference_minor bigint not null,
  severity text not null check(severity in ('none','info','warning','critical')), responsible_event_ids jsonb not null default '[]'::jsonb,
  explanation_codes jsonb not null default '[]'::jsonb, classifier_version text not null, created_at timestamptz not null default now(), unique(user_id,id),
  foreign key(user_id,classification_run_id) references public.classification_runs(user_id,id)
);
create index if not exists classification_comparisons_run_idx on public.financial_classification_comparisons(user_id,classification_run_id,severity);
insert into public.schema_versions(component,version,migration_name,checksum,metadata) values ('financial-event-rules',1,'010_create_financial_event_shadow_schema','phase5-v1','{"phase":5,"mode":"shadow","officialRead":false,"money":"minor_units"}'::jsonb) on conflict(component) do update set version=excluded.version,applied_at=now(),migration_name=excluded.migration_name,checksum=excluded.checksum,metadata=excluded.metadata;
commit;
