begin;
do $$
declare table_name text;
begin
  foreach table_name in array array['external_sources','external_accounts','raw_transactions','transaction_links','reconciliation_decisions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
  end loop;
end $$;

alter table public.raw_transaction_versions enable row level security;
alter table public.raw_transaction_versions force row level security;
revoke all on table public.raw_transaction_versions from anon, authenticated;
grant select, insert on table public.raw_transaction_versions to authenticated;
drop policy if exists raw_transaction_versions_select_own on public.raw_transaction_versions;
create policy raw_transaction_versions_select_own on public.raw_transaction_versions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists raw_transaction_versions_insert_own on public.raw_transaction_versions;
create policy raw_transaction_versions_insert_own on public.raw_transaction_versions for insert to authenticated with check ((select auth.uid()) = user_id);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on table public.audit_events from anon, authenticated;
grant select, insert on table public.audit_events to authenticated;
drop policy if exists audit_events_select_own on public.audit_events;
create policy audit_events_select_own on public.audit_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists audit_events_insert_own on public.audit_events;
create policy audit_events_insert_own on public.audit_events for insert to authenticated with check ((select auth.uid()) = user_id);
commit;
