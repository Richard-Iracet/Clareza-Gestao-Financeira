begin;
do $$ declare t text;begin foreach t in array array['assisted_sync_sessions','sync_runs','sync_checkpoints','balance_observations','sync_difference_reports','assisted_sync_decisions'] loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy %I on public.%I for select to authenticated using((select auth.uid())=user_id)',t||'_select_own',t);end loop;end$$;
-- All writes remain service-role only. This prevents client-side physical deletion,
-- transition bypass, duplicate publishing and cross-user mutation.
insert into public.schema_versions(component,version,migration_name,checksum,metadata) values('open-finance-assisted-sync-rls',1,'015_assisted_sync_rls','phase7-rls-v1','{"forceRls":true,"anon":"blocked","writes":"backend-only"}'::jsonb) on conflict(component) do update set version=excluded.version,applied_at=now(),migration_name=excluded.migration_name,checksum=excluded.checksum,metadata=excluded.metadata;
commit;
