# Backfill relacional sombra

1. Confirme projeto e ambiente. Produção é recusada sem `--allow-production`.
2. Defina `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` somente no processo administrativo, `CLAREZA_TARGET_ENV` e a flag explícita `CLAREZA_RELATIONAL_BACKFILL_TOOLS=true`.
3. Execute primeiro `npm run relational:backfill -- --user-id=<uuid> --dry-run`.
4. Revise contagem e issues. Para gravar, acrescente `--confirm`; ajuste `--batch-size=500` se necessário.
5. O job valida revisão/checksum, processa um usuário, faz upsert por `(user_id,id)`, grava checkpoint por lote e não apaga registros.
6. A mesma revisão/checksum concluída retorna `skipped`; falhas ficam registradas e uma nova execução retoma de forma segura por upsert.
7. Nunca exponha `service_role` ao Vite, navegador ou logs.

O script não é executado na inicialização e não faz parte do bundle do frontend.
