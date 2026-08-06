begin;
do $$
declare table_name text;
begin
  foreach table_name in array array['reconciliation_runs','reconciliation_candidates','reconciliation_rules'] loop
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

revoke all on table public.reconciliation_decisions from authenticated;
grant select, insert on table public.reconciliation_decisions to authenticated;
grant update (status, reverted_at, reverted_by, revert_reason, metadata) on public.reconciliation_decisions to authenticated;

revoke all on table public.transaction_links from authenticated;
grant select, insert on table public.transaction_links to authenticated;
grant update (status, updated_at, reverted_at, reverted_by, revert_reason) on public.transaction_links to authenticated;
commit;
