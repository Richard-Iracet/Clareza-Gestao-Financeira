# Rollout e rollback da reconciliação

1. Aplicar `008_create_reconciliation_engine_schema.sql` e `009_reconciliation_engine_rls.sql`.
2. Manter todas as flags desligadas; executar `npm run reconciliation:validate`.
3. Habilitar somente engine + observação para usuários internos e acompanhar volume, conflitos, falsos positivos e tempo.
4. Habilitar revisão depois da amostragem. `exact_auto_match` permanece desligado até aprovação explícita.

Rollback imediato: desligar `VITE_RECONCILIATION_ENGINE`. A aplicação volta a operar exclusivamente pelo JSONB sem migration destrutiva. Candidatos podem ser marcados `superseded`; não apagar tabelas, decisões, vínculos ou payloads. Para desfazer vínculo, registrar reversão com autor, data e motivo.
