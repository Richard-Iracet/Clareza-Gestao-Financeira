# Regras financeiras em modo sombra — Fase 5

`financial-event-classifier-v1` classifica somente projeções paralelas. `finance_states.data`, o dashboard e os cálculos oficiais continuam intocados. Valores dos efeitos são strings de unidades mínimas (centavos), nunca `float`.

## Matriz contábil `accounting-matrix-v1`

| Evento | Caixa | Consumo | Fatura | Resultado | Patrimônio |
|---|---:|---:|---:|---:|---:|
| Compra na conta | − | + | 0 | − | − |
| Compra/cartão ou parcela | 0 | + | + | − | − |
| Pagamento de fatura | − | 0 | − | 0 | 0 |
| Transferência própria, principal | −/+ | 0 | 0 | 0 | 0 |
| Tarifa/juros | − | + | 0 | − | − |
| Estorno de compra | conforme meio | − | − | + | + |
| Compra de investimento | − | 0 | 0 | 0 | 0 (caixa vira ativo) |

Datas são separadas em ocorrência, contabilização, competência, liquidação, fatura e projeção. Parcelas são selecionadas pela competência; parcelas futuras não entram no período atual.

Prioridade: decisão manual, vínculo confirmado, tipo externo confiável, regra determinística, reconciliação exata, heurística conservadora e revisão. Saque, depósito, transferência externa e qualquer bloqueio ficam em revisão. Pagamento de fatura não cria despesa; transferência própria é neutra; estorno exige origem e nunca vira receita comum.

Vínculos cobrem fatura, liquidação parcial/total, contraparte de transferência, estorno, chargeback, tarifa, juros, parcelas e investimento. São idempotentes, reversíveis e preservados historicamente.

Flags: `financialEventClassifier`, `financialRulesShadowMode`, `invoiceSettlementRules`, `internalTransferRules`, `reversalRules` e `financialRulesComparison`. `financialRulesOfficialRead` é forçada como desligada nesta fase.
