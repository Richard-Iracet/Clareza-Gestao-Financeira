begin;
do $$ declare table_name text; begin
  foreach table_name in array array['classification_runs','financial_events','financial_event_links','financial_classification_comparisons'] loop
    execute format('alter table public.%I enable row level security',table_name); execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from anon, authenticated',table_name); execute format('grant select, insert on table public.%I to authenticated',table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=user_id)',table_name||'_select_own',table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',table_name||'_insert_own',table_name);
  end loop;
end $$;
grant update(status,cursor,statistics,error_summary,finished_at,updated_at) on public.classification_runs to authenticated;
create policy classification_runs_update_own on public.classification_runs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant update(classification_status,reviewed_at,reviewed_by,updated_at,superseded_at) on public.financial_events to authenticated;
create policy financial_events_update_unconfirmed on public.financial_events for update to authenticated using ((select auth.uid())=user_id and confirmed_at is null) with check ((select auth.uid())=user_id);
grant update(status,reverted_at,reverted_by,revert_reason) on public.financial_event_links to authenticated;
create policy financial_event_links_revert_own on public.financial_event_links for update to authenticated using ((select auth.uid())=user_id and reverted_at is null) with check ((select auth.uid())=user_id);
commit;
