# Sincronização Open Finance assistida (Fase 7)

O wizard cria uma sessão para um usuário, uma conexão e uma instituição. A janela inicial é limitada a 30 dias e solicita somente contas, saldos e transações. A expansão para 90/180/365 dias exige flag e confirmação manual.

Cada conta/recurso possui um `sync_run`. O adapter entrega uma página por cursor; cada página é validada, gravada em `raw_transactions`/`raw_transaction_versions` e recebe um `sync_checkpoint`. IDs e hashes tornam páginas sobrepostas e retomadas idempotentes. Erros de item ficam contabilizados sem abortar a página. Rate limit, timeout e cursor inválido levam a pausa/retry a partir do último checkpoint.

Datas preservam timestamp e timezone originais, instante UTC, data local/contábil, competência, liquidação e processamento. Saldos são apenas `balance_observations`; nunca substituem saldos internos. A reconciliação reutiliza o motor da Fase 4 e o classificador da Fase 5 continua em sombra. Heurísticas, pending, conflitos, transferências, faturas e estornos permanecem na fila.

A importação, revisão, confirmação e publicação são etapas separadas. A Fase 7 não publica automaticamente, não altera `finance_states` e não substitui o JSONB oficial. Desconectar revoga consentimento e bloqueia novas cargas, preservando bruto, auditoria, decisões, vínculos e histórico confirmado.

Flags iniciais: `openFinanceAssistedSync=false`, `openFinanceRealConnection=false` em produção, `openFinanceThirtyDayPilot` derivada da assistida, `openFinanceSyncReview=false`, `openFinanceManualPublish=false`, `openFinanceHistoricalExpansion=false` e `openFinanceAutomaticSync=false` invariável.

Rollback: desligar as flags, pausar/cancelar a sessão e revogar o consentimento. Não excluir dados. RLS é forçada, `anon` não possui acesso e somente o backend escreve. Tokens e payloads completos não são retornados nem registrados.
