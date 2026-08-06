# Clareza — Gestão Financeira

Aplicação pessoal de gestão financeira em React/Vite, com autenticação e sincronização pelo Supabase, cache local para uso temporariamente offline, backup JSON compatível com versões anteriores, PWA e projeto Android Capacitor.

## Requisitos

- Node.js 20.19 ou superior;
- npm 10 ou superior;
- projeto Supabase;
- conta Vercel para o deploy web;
- Android Studio/JDK compatível, somente para gerar o aplicativo Android.

## Instalação e execução

```bash
npm install
copy .env.example .env.local
npm run dev
```

Preencha `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
```

Use somente a chave pública `anon`/`publishable`. Nunca coloque `service_role` no frontend.

Comandos:

```bash
npm test
npm run build
npm run preview
npm run cap:sync
npm run cap:android
```

## Governança e linha de base (Fase 0)

Metadados públicos de build, contratos persistidos, invariantes financeiros e runbooks ficam em [`docs/`](./docs/). A ferramenta de exportação de linha de base/evidências é somente leitura e exige `VITE_PHASE0_BASELINE_TOOLS=true` fora de produção; em produção permanece desativada mesmo com override. Configure `VITE_APP_ENV` como `development`, `staging` ou `production`.

Testes específicos:

```bash
npm run test:baseline
npm run test:regression
```

## Configuração do Supabase

1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor**.
3. Execute integralmente `supabase/migrations/001_create_finance_states.sql`.
4. Em **Authentication > Providers**, mantenha e-mail/senha habilitado.
5. Em **Authentication > Users**, crie manualmente o usuário que utilizará o sistema.
6. Não habilite cadastro público na interface.
7. Copie a URL e a chave pública para `.env.local` e para a Vercel.

O SQL cria `finance_states`, ativa e força RLS, nega acesso ao papel anônimo e permite ao autenticado ler, inserir e atualizar somente a linha em que `auth.uid() = user_id`. Não há política de exclusão. A função `update_finance_state` executa atualização atômica condicionada à revisão esperada.

## Sincronização e funcionamento offline

- Supabase é a fonte principal.
- O estado financeiro agregado permanece em JSONB para preservar o modelo atual.
- O `localStorage` guarda o estado local imediato, último snapshot remoto válido e fila pendente por usuário.
- A interface só informa “Salvo na nuvem” após confirmação remota.
- Falhas transitórias usam retry com backoff.
- A fila é retomada no evento `online`.
- Uma lease local e `BroadcastChannel` reduzem conflitos entre abas.
- Conflitos de revisão bloqueiam novos envios automáticos.

Em conflito, exporte as versões local e remota antes de decidir. “Usar versão da nuvem” cria antes uma cópia local de segurança. “Enviar versão local” exige confirmação textual e usa a revisão remota atual; não existe fusão automática.

## Primeira migração dos dados

Após o primeiro login:

- sem estado remoto: confirme **Enviar dados locais**;
- dados iguais: a aplicação continua automaticamente;
- dados diferentes: exporte as duas versões e escolha explicitamente;
- estado remoto existente em navegador sem estado local: a aplicação valida e hidrata automaticamente a versão remota;
- início offline: o cache continua utilizável e a comparação ocorre quando a conexão retorna.

Dados legados nunca são apagados antes de uma cópia por usuário ser escrita e verificada.

## Backup JSON

O formato existente `clareza-finance-backup`, versão 1, continua aceito.

Para importar:

1. Abra **Configurações > Backup**.
2. Selecione um JSON de até 10 MB.
3. Confira o resumo e confirme.
4. A aplicação cria um backup interno e restaura o snapshot local.
5. Após recarregar, confirme qual versão deverá ser enviada à nuvem.

Se a sincronização falhar, o estado importado permanece local e exportável. JSON inválido nunca substitui o estado atual.

## Deploy na Vercel

1. Envie `finance-manager` para um repositório GitHub privado.
2. Importe o repositório na Vercel.
3. Se o repositório tiver esta pasta como subdiretório, defina **Root Directory** como `finance-manager`.
4. Framework Preset: **Vite**.
5. Install Command: `npm install`.
6. Build Command: `npm run build`.
7. Output Directory: `dist`.
8. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
9. Faça o deploy e teste atualização direta em `/configuracoes`.

`vercel.json` fornece o fallback SPA para `index.html`.

## PWA

O manifesto e o service worker ficam em `public/`. O service worker:

- aceita apenas requisições GET da mesma origem;
- armazena navegação e assets estáticos;
- não armazena JSON;
- não intercepta Supabase, tokens ou APIs externas;
- não controla o estado financeiro offline.

Para publicar uma nova versão da PWA, altere `CACHE_NAME` em `public/sw.js`, execute testes/build e publique. O usuário receberá um aviso de atualização.

## Capacitor/Android

Configuração:

- app ID: `com.clareza.financeiro`;
- nome: `Clareza`;
- diretório web: `dist`;
- plataforma: Android;
- esquema interno: HTTPS.

Fluxo:

```bash
npm run cap:sync
npm run cap:android
```

O primeiro comando gera o build e sincroniza os assets. O segundo também abre o Android Studio. Configure assinatura e ícones finais de loja no Android Studio antes de distribuir. As variáveis `VITE_*` são incorporadas no build; nunca use chave privada.

## Recuperação

- Use **Tentar novamente** para persistência/sincronização pendente.
- Exporte backup JSON antes de resolver inconsistências.
- A tela de diagnóstico é somente leitura.
- Snapshots temporário e último válido são mantidos para recuperação.
- “Iniciar vazio” exige confirmação textual e não apaga silenciosamente dados corrompidos.

## Atualização do sistema

1. Exporte um backup.
2. Atualize dependências apenas de forma intencional.
3. Execute `npm test`.
4. Execute `npm run build`.
5. Altere a versão de cache em `public/sw.js`.
6. Execute `npm run cap:sync` se houver distribuição Android.
7. Publique na Vercel.
8. Valide login, sincronização, conflito, offline, backup e instalação PWA.

Consulte também [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md).
