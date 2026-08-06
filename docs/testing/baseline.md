# Linha de base de testes

Antes da Fase 0: Node 20.20.1, npm 10.8.2 e 144/144 testes informados. Neste Windows, `node --test tests` descobriu corretamente a suíte quando executado fora da sandbox; por isso o script original foi preservado. A Fase 0 acrescenta grupos explícitos e portáveis para baseline/regressão.

Grupos lógicos: unit (domínio/utilitários), integration, migration/roadmap, financial-regression, smoke (manual), security/PWA/Supabase e performance. Não foi necessário mover arquivos nem adicionar framework E2E.
