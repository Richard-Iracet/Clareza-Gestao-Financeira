# Rollout e rollback Open Finance

1. Aplicar migrations `012` e `013`.
2. Executar scanners, suíte do mock e smoke test.
3. Configurar Edge secrets somente em ambiente de teste.
4. Publicar Edge Functions mantendo verificação JWT habilitada; o callback usa state de uso único e o webhook usa segredo/timestamp.
5. Habilitar gateway, depois mock/sandbox e, por último, a interface. `openFinanceOfficialSync` permanece desligada.

Rollback: desligar flags, desativar provider, revogar consentimentos de teste e interromper callbacks/webhooks. Preservar conexões, eventos, tombstones, dados manuais e entidades oficiais; não apagar tabelas.

Secrets futuros:

```sh
supabase secrets set OPEN_FINANCE_PROVIDER=mock OPEN_FINANCE_ENVIRONMENT=development OPEN_FINANCE_CALLBACK_URL=https://SEU_PROJETO.supabase.co/functions/v1/open-finance-callback OPEN_FINANCE_ALLOWED_ORIGINS=https://SEU_DOMINIO
supabase secrets set OPEN_FINANCE_CLIENT_ID=VALOR OPEN_FINANCE_CLIENT_SECRET=VALOR OPEN_FINANCE_WEBHOOK_SECRET=VALOR
```

Os três últimos só são necessários quando um adapter real ou webhook protegido for configurado.
