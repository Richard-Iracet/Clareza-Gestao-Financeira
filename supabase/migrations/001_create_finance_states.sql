begin;

create table if not exists public.finance_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  schema_version integer not null default 1 check (schema_version > 0),
  checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_states enable row level security;
alter table public.finance_states force row level security;

revoke all on table public.finance_states from anon;
revoke all on table public.finance_states from authenticated;
grant select, insert, update on table public.finance_states to authenticated;

drop policy if exists "finance_states_select_own" on public.finance_states;
create policy "finance_states_select_own"
on public.finance_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "finance_states_insert_own" on public.finance_states;
create policy "finance_states_insert_own"
on public.finance_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "finance_states_update_own" on public.finance_states;
create policy "finance_states_update_own"
on public.finance_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.update_finance_state(
  expected_revision bigint,
  next_data jsonb,
  next_schema_version integer,
  next_checksum text
)
returns table (
  user_id uuid,
  data jsonb,
  revision bigint,
  schema_version integer,
  checksum text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  update public.finance_states
  set
    data = next_data,
    revision = finance_states.revision + 1,
    schema_version = next_schema_version,
    checksum = next_checksum,
    updated_at = now()
  where finance_states.user_id = (select auth.uid())
    and finance_states.revision = expected_revision
  returning
    finance_states.user_id,
    finance_states.data,
    finance_states.revision,
    finance_states.schema_version,
    finance_states.checksum,
    finance_states.created_at,
    finance_states.updated_at;
$$;

revoke all on function public.update_finance_state(bigint, jsonb, integer, text) from public;
revoke all on function public.update_finance_state(bigint, jsonb, integer, text) from anon;
grant execute on function public.update_finance_state(bigint, jsonb, integer, text) to authenticated;

commit;
