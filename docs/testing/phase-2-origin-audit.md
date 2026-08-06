# Testes da Fase 2

`npm run test:origin` cobre schema expand-only, RLS estática, append-only, fingerprint/hash, versões, pending→posted, propriedade de campos, tombstone/reaparecimento, mescla/desfazer e backfill idempotente/dry-run.

`npm test` executa também Fases 0/1 e regressão financeira. `npm run build` valida ESM/Vite.

Testes SQL locais são inspeções automatizadas do texto das migrations. Eles não substituem teste real em Supabase com usuários A/B e anon; essa validação ocorre após aplicar `004` e `005` no ambiente alvo.
