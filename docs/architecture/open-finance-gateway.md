# Gateway Open Finance — Fase 6

O Clareza usa uma fronteira fornecedor-neutra: cliente → Edge Functions autenticadas → `OpenFinanceProvider` → agregador autorizado. O projeto não se apresenta como participante direto e não inicia pagamentos.

O contrato canônico cobre instituições, consentimentos, conexões, contas mascaradas, callbacks, webhooks e saúde. Enums desconhecidos viram `unknown`; campos adicionais seguros ficam em metadados limitados; ausência essencial gera erro tipado. Nenhum tipo de fornecedor entra no domínio.

O provider executável é `MockOpenFinanceProvider`, sem rede. A fábrica exige configuração explícita e recusa mock em produção. Um adapter real deverá implementar o mesmo contrato no backend. Todas as Edge Functions mantêm verificação JWT; um webhook de fornecedor real deverá entrar por relay backend autenticado que também preserve a validação de assinatura, nunca por `verify_jwt=false`.

Secrets ficam exclusivamente nas Edge Functions. O frontend recebe somente jornada temporária/widget token curto, status, instituições e contas mascaradas. Credenciais persistentes são referências opacas; não há criptografia caseira. Callback state é aleatório, expirável, armazenado como hash e de uso único. Webhooks exigem assinatura/timestamp e são idempotentes.

`external_accounts` foi reutilizada e ampliada; remoção é tombstone e reaparecimento preserva metadados anteriores. `connection_events` é append-only. Nenhuma função insere transações, altera `finance_states` ou executa sincronização automática.
