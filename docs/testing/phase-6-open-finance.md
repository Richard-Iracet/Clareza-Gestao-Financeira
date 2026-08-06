# Testes da Fase 6

Execute `npm run test:open-finance`, `npm run open-finance:test-mock`, `npm run open-finance:check-migrations`, `npm run build`, `npm run open-finance:check-secrets` e `npm test`.

A suíte cobre contrato/fábrica, sandbox sem rede, consentimentos, callback state, webhooks duplicados, revogação, contas removidas/reaparecidas, parcial/schema desconhecido, rate limit, timeout, credenciais opacas, redaction, RLS e estrutura segura das Edge Functions. Testes estáticos garantem que nenhuma função publica transações ou toca no JSONB oficial.
