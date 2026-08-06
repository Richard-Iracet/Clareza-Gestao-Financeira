# Contratos de persistência — Fase 0

## Estado agregado

`FinanceContext` persiste `transactions`, `cards`, `accounts`, `transfers`, `recurrences`, `alertStates`, `categories`, `invoiceRecords`, `costCenters`, `filters`, `userSettings` e `migrations`. No snapshot v1, as cinco coleções históricas obrigatórias são `transactions`, `cards`, `categories`, `invoiceRecords` e `costCenters`; as quatro coleções introduzidas posteriormente são opcionais e recebem listas vazias ao ler legado.

## Snapshot v1

Campos: `schemaVersion`, `appVersion`, `financeDataVersion`, `snapshotVersion`, `snapshotId`, `revision`, `createdAt`, `state`, `data`, `metadata.counts` e `checksum`. O checksum é FNV-1a do JSON canônico sem o próprio checksum. Um snapshot válido exige schema 1, estado `complete`, revisão >= 1, data ISO, coleções válidas, contagens coerentes e checksum correto.

## Backup v1

`format` é `clareza-finance-backup`; `version` continua 1. Contém `exportedAt`, `metadata`, `data`, `storage` e `snapshot`. `metadata.appMetadata` é novo, opcional e retrocompatível. Contas, transferências, recorrências e alertas podem faltar em backups antigos. Não há sessão, token, cookie, chave Supabase ou conteúdo arbitrário do localStorage.

## localStorage

Chaves ativas: `clareza:transactions`, `categories`, `cards`, `accounts`, `invoices`, `transfers`, `recurrences`, `alertStates`, `filters`, `userSettings`, `costCenters`; `financeDataVersion`; snapshots `clareza:finance_state_{current,temp,last_valid,recovery,metadata}`; backups `financeDataBackupBeforeInvoiceMigration`, `financeDataBackupBeforeInstallmentProjectionV4` e `financeDataBackupBeforeManualImport`.

Por usuário: `clareza:user:<id>:{remote_snapshot,pending_sync,conflict,session_backup,before_remote_replace,sync_lease}` e `clareza:active_user`. `clareza:supabase-auth` pertence ao SDK de autenticação e nunca integra backup/evidência.

## Supabase

`finance_states`: `user_id uuid` PK/FK, `data jsonb`, `revision bigint`, `schema_version integer`, `checksum text`, timestamps. RLS força acesso apenas ao próprio usuário. `update_finance_state(expected_revision,next_data,next_schema_version,next_checksum)` atualiza por comparação de revisão e incrementa uma unidade. Banco/schema remoto: v1.

## Compatibilidade e versões

App 1.0.0; backup 1; snapshot/schema 1; dados financeiros 4; banco 1. Dados antigos sem configurações, flags ou coleções opcionais usam fallback seguro. IDs e referências não são transformados na importação.

## Recuperação

A promoção é `temp → validar → current anterior em lastValid → current → remover temp`. A resolução tenta `current`, depois o candidato válido de maior revisão entre `temp` e `lastValid`, depois legado. Importação captura todas as chaves antes da escrita e restaura os valores crus em falha.
