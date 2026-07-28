# Checklist de deploy

- [ ] Backup JSON atual exportado e validado.
- [ ] SQL de `supabase/migrations` executado.
- [ ] RLS testada com dois usuários distintos.
- [ ] Usuário pessoal criado manualmente no Supabase.
- [ ] `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas na Vercel.
- [ ] Nenhuma chave `service_role` presente no código ou ambiente frontend.
- [ ] `npm install`, `npm test` e `npm run build` concluídos.
- [ ] Login, logout e restauração da sessão testados.
- [ ] Primeiro envio de dados locais confirmado.
- [ ] Conflito entre dois navegadores testado sem overwrite silencioso.
- [ ] Alteração offline retomada após reconexão.
- [ ] Importação de backup antigo e exportação nova testadas.
- [ ] Rotas internas atualizadas diretamente sem 404.
- [ ] Layout conferido em 320, 360, 390 e 430 px, tablet e desktop.
- [ ] PWA instalada e atualização controlada testada.
- [ ] `CACHE_NAME` do service worker incrementado para o release.
- [ ] `npx cap sync android` concluído, se aplicável.
- [ ] Assinatura e build Android conferidos no Android Studio, se aplicável.
