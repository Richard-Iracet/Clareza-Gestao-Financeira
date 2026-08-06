# Rollback lógico da camada de origem

1. Mantenha `originIdentityLayer`, `externalRawDataLayer`, `auditEvents` e `reversibleReconciliation` desligadas.
2. Interrompa backfills e novos writes paralelos.
3. Preserve fontes, payloads, versões, vínculos, decisões e auditoria existentes.
4. Continue usando exclusivamente `finance_states.data`.

Não remova tabelas como rollback padrão. Drops só cabem em ambiente descartável, após confirmar o alvo e a ausência de evidências necessárias.
