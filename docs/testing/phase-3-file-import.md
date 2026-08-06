# Testes da Fase 3

Execute `npm run test:import`, `npm test` e `npm run build`.

Fixtures anonimizadas cobrem OFX SGML/XML, conta/cartão, FITID ausente, timezone, erro parcial, CSV brasileiro/internacional, BOM, aspas, separadores, cabeçalho opcional, dinheiro/data exatos, duplicidade, multiusuário, segurança, RLS estática e ausência de escrita financeira oficial.

RLS é inspecionada localmente nas migrations. O teste efetivo com usuários A/B e `anon` depende da aplicação de `006` e `007` no Supabase.
