# Rollback

1. Interrompa rollout se login/sync falhar, checksum mudar sem explicação, houver estado vazio inesperado, conflito não recuperável ou regressão de totais.
2. Preserve backup, pacote de evidências, commit/build implantado, snapshots local/remoto e logs sem credenciais.
3. Identifique a versão pelos metadados do backup/evidência e pelo deployment da Vercel.
4. Desative `VITE_PHASE0_BASELINE_TOOLS`; em produção ela já é negada por padrão.
5. Reverta o commit da aplicação de forma auditável e redeploye. Não reverta migrações nem dados nesta fase.
6. Compare checksums. Para dados, prefira backup validado; alternativamente recupere `lastValid` local ou o último `finance_states` remoto válido.
7. Em conflito, exporte ambos os lados antes de escolher; nunca faça merge ou overwrite automático.
