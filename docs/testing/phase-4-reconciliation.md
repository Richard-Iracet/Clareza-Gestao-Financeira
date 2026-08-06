# Testes da Fase 4

`npm run test:reconciliation` cobre regras exatas, sugestões heurísticas, bloqueios financeiros, decisões/reversão, reprocessamento e contrato SQL/RLS. `npm test` executa regressão integral e `npm run build` valida a entrega web.

Casos adversariais obrigatórios: duas compras legítimas iguais; pagamento de fatura versus compra; transferência própria versus lançamento comum; estorno sem vínculo de reversão; parcelas diferentes; dados de outro usuário; decisão manual anterior; repetição idempotente.
