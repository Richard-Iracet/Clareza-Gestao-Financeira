# Mapeamento JSONB → relacional

| JSONB | Identidade | Tabela | Observações |
|---|---|---|---|
| `accounts[]` | `accountId` | `financial_accounts` | saldo inicial é copiado; saldo atual continua derivado |
| `cards[]` | `id` | `payment_cards` | `billingConfigurations` permanece em JSONB técnico |
| `categories[]` | texto/`id` | `financial_categories` | a forma atual é principalmente lista de strings |
| `costCenters[]` | texto/`id` | `cost_centers` | a forma atual é principalmente lista de strings |
| `recurrences[]` | `recurrenceId` | `financial_recurrences` | nenhuma ocorrência é gerada |
| `invoiceRecords[]` | `id` ou `invoiceId` | `credit_card_invoice_records` | estado complementar, pagamentos e reabertura preservados no payload |
| `transactions[]` | `id` | `financial_transactions` | parcelas já são linhas distintas; valor não é recalculado |
| `transfers[]` | `transferId` | `financial_transfers` | estorno embutido é preservado e projetado como status `reversed` |
| `alertStates`, `filters`, `userSettings`, `migrations` | — | somente JSONB | fora da normalização da Fase 1 |

Campos desconhecidos, legados, derivados, auditoria e configurações variáveis sempre permanecem em `legacy_payload`. IDs ausentes recebem uma chave técnica determinística pela posição apenas para permitir relatório; são registrados como problema e nunca alteram o JSONB. Valores inválidos não são corrigidos.
