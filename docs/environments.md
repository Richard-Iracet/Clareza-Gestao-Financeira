# Ambientes

`VITE_APP_ENV` aceita apenas `development`, `staging` ou `production`. Homologação deve usar projeto Supabase, usuários e projeto Vercel separados, somente dados sintéticos/anonimizados e nunca `service_role` no frontend. Não copie dados reais sem anonimização e revisão de risco residual.

`VITE_PHASE0_BASELINE_TOOLS=true` só é aceito fora de produção. Build ID, commit e timestamp são metadados públicos opcionais; nenhuma variável secreta deve usar prefixo `VITE_`.
