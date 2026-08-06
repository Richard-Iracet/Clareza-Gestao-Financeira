# Backfill de origem manual

O backfill classifica projeções relacionais históricas como `manual`, define transações como `active` e acrescenta um evento resumido por entidade. Valores, descrições, datas, categorias e o JSONB não são alterados.

1. Defina `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLAREZA_TARGET_ENV` e `CLAREZA_ORIGIN_BACKFILL_TOOLS=true` somente no processo administrativo.
2. Execute `npm run origin:backfill -- --user-id=<uuid> --dry-run`.
3. Para gravar fora de produção, use `--confirm`; produção também exige `--allow-production`.
4. Ajuste opcionalmente `--batch-size=500`.
5. Valide com `npm run origin:validate -- --user-id=<uuid>`.

Checkpoints usam tabela e offset. Auditoria usa chave idempotente por tabela/entidade; reexecução não duplica eventos. O script processa um usuário e nunca imprime segredo.
