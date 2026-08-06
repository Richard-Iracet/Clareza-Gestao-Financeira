# Runbook da primeira conexão real

1. Aplique integralmente, nesta ordem, `014_create_assisted_sync_schema.sql` e `015_assisted_sync_rls.sql` no SQL Editor do Supabase.
2. Configure o adapter real somente conforme a documentação do fornecedor. Esta base inclui mock/sandbox e não inventa formatos de provider.
3. Configure secrets backend: `supabase secrets set OPEN_FINANCE_PROVIDER=<provider> OPEN_FINANCE_ENVIRONMENT=sandbox OPEN_FINANCE_CALLBACK_URL=<url> OPEN_FINANCE_WEBHOOK_SECRET=<valor> OPEN_FINANCE_ALLOWED_ORIGINS=<origens>`.
4. Cadastre `OPEN_FINANCE_CALLBACK_URL` no painel do provider e publique `open-finance-assisted-sync` junto das funções da Fase 6.
5. Ative `VITE_OPEN_FINANCE_GATEWAY=true`, `VITE_OPEN_FINANCE_ASSISTED_SYNC=true` e `VITE_OPEN_FINANCE_SYNC_REVIEW=true` apenas para o build de desenvolvimento/homologação do piloto. Mantenha expansão e sincronização automática desligadas.
6. Execute uma conexão, uma instituição, contas explicitamente selecionadas e 30 dias. Revise o relatório e confirme somente itens seguros.
7. Para rollback, desligue flags, cancele a sessão e revogue o consentimento. Preserve todas as observações, transações brutas, checkpoints e auditoria.
