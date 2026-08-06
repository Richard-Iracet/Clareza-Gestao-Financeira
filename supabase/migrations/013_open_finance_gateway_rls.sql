begin;
alter table public.external_institutions enable row level security;alter table public.external_institutions force row level security;revoke all on public.external_institutions from anon,authenticated;grant select on public.external_institutions to authenticated;create policy external_institutions_authenticated_read on public.external_institutions for select to authenticated using((select auth.uid()) is not null);
do $$ declare t text;begin foreach t in array array['financial_connections','open_finance_consents','open_finance_sync_cursors','connection_events','open_finance_callback_states'] loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('create policy %I on public.%I for select to authenticated using((select auth.uid())=user_id)',t||'_select_own',t);end loop;end$$;
revoke all on public.external_accounts from anon;grant select on public.external_accounts to authenticated;
-- Mutations, callback state, credential references and append-only events are backend-only through service role.
commit;
