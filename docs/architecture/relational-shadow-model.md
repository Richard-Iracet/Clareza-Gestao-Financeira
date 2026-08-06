# Modelo relacional sombra — Fase 1

`public.finance_states.data` continua sendo a única fonte oficial. As tabelas relacionais são projeções auditáveis e descartáveis do ponto de vista funcional: nenhuma tela, contexto ou cálculo oficial depende delas.

## Decisões

- IDs atuais são preservados como `text` em PK composta `(user_id, id)`.
- Dinheiro usa `numeric(18,2)`, pois o estado atual persiste valores em reais e o objetivo é copiar sem reinterpretar.
- Datas civis usam `date`; timestamps técnicos usam `timestamptz`; competência usa `YYYY-MM` quando validável.
- Todo registro mantém `legacy_payload`, revisão, snapshot e checksum de origem.
- Referência ausente vira FK nula e `migration_issues`; não é inventado um alvo.
- `invoiceRecords` é estado complementar. Compras continuam representadas por `financial_transactions`; não há reconstrução de itens de fatura.
- Preferências, filtros, alertas e metadados de migrations permanecem apenas no JSONB.

## Relações

```text
auth.users
 ├─ finance_states (oficial)
 ├─ financial_accounts
 ├─ payment_cards ── financial_accounts?
 ├─ financial_categories
 ├─ cost_centers
 ├─ financial_recurrences ── accounts/cards?
 ├─ credit_card_invoice_records ── cards/accounts?
 ├─ financial_transactions ── accounts/cards/categories/cost centers/invoice records/recurrences?
 └─ financial_transfers ── source account/destination account/recurrence?

migration_runs ── migration_issues
schema_versions
```

Índices compostos atendem consultas por usuário e data, competência, conta, cartão, categoria, fatura, status, arquivamento, revisão e status de migration. Eles aumentam o custo do upsert do backfill, mas evitam varreduras globais nas comparações e paginação futuras.

Não há trigger nem dual-write. Shadow write e shadow read permanecem desligados e sem integração com o fluxo oficial.
