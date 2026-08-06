# Rollback do modelo relacional sombra

Rollback funcional imediato: mantenha todas as flags relacionais desligadas e interrompa os scripts. `finance_states.data`, `FinanceContext`, `SyncContext` e a RPC oficial não são alterados.

Em falha de backfill, marque/preserve a execução e seus issues; não apague tabelas nem JSONB. Em homologação descartável, as migrations podem ser revertidas por `drop table` em ordem inversa somente após confirmar o alvo. Em produção, não execute `drop` com dados sem exportação e aprovação específica.
