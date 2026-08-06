begin;
do $$
declare table_name text;
begin
  foreach table_name in array array['migration_runs','financial_accounts','payment_cards','financial_categories','cost_centers','financial_recurrences','credit_card_invoice_records','financial_transactions','financial_transfers','migration_issues'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
  end loop;
end $$;

alter table public.schema_versions enable row level security;
alter table public.schema_versions force row level security;
revoke all on table public.schema_versions from anon, authenticated;
grant select on table public.schema_versions to authenticated;
drop policy if exists schema_versions_authenticated_read on public.schema_versions;
create policy schema_versions_authenticated_read on public.schema_versions for select to authenticated using ((select auth.uid()) is not null);
commit;
