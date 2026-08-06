# Testes da Fase 5

Execute `npm run test:financial-rules`, `npm test` e `npm run build`.

A suíte cobre compras e pagamentos em competências iguais e diferentes, liquidação parcial/atrasada, juros/tarifas, transferências neutras, saques/depósitos ambíguos, estornos totais/parciais, chargeback reversível, parcelas futuras, investimento, idempotência, comparação somente leitura e RLS. A regressão integral confirma que o modo sombra não altera saldos, receitas, despesas, faturas, transferências, patrimônio, projeções ou quantidade oficial de lançamentos.
