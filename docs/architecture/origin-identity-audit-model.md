# Origem, identidade e auditoria — Fase 2

`finance_states.data` continua oficial. Esta camada é paralela e não participa da UI, dashboard, sincronização oficial ou cálculos.

```text
external_sources
  └─ external_accounts
       └─ raw_transactions (identidade lógica)
            └─ raw_transaction_versions (payloads imutáveis)
                  ↕ transaction_links
             financial_transactions (sombra)

reconciliation_decisions ── reversões
audit_events ── eventos append-only
```

## Identidade e versão

`external_transaction_id` e `stable_external_key` ajudam a localizar a mesma identidade. Fingerprint é evidência versionada, nunca identidade absoluta. Uma mudança `pending → posted`, descrição corrigida ou ID trocado cria nova versão sob a mesma identidade somente quando o vínculo é seguro. Payload idêntico, identificado por SHA-256 canônico, não cria nova versão.

O payload bruto é preservado em `raw_transaction_versions.payload`. Correções acrescentam versões e `supersedes_version_id`; não atualizam versões anteriores. `current_version_id` aponta para a versão ativa com FK diferível.

## Propriedade dos campos

Provedor: descrição original, status externo, data, valor, moeda, identificadores e payload. Usuário: categoria, centro de custo, observação/notas, tags, planejamento e apresentação. Uma atualização externa altera apenas o primeiro grupo e registra `changed_fields`.

## Ciclo de vida e reconciliação

`deleted_at` é remoção lógica no Clareza; `tombstone_at` registra desaparecimento externo; `reappeared_at` registra retorno. Nenhuma transição apaga versões, vínculos, decisões ou auditoria.

Mescla cria `transaction_links` e `reconciliation_decisions`. Desfazer marca ambos como revertidos e acrescenta decisão `unmerge`; não apaga a transação financeira nem a origem.

## RLS e retenção

FKs compostas carregam `user_id` e impedem vínculos entre proprietários. Todas as tabelas têm RLS forçada. `anon` não possui acesso; `audit_events` e `raw_transaction_versions` permitem apenas select/insert ao próprio usuário, sem update/delete.

Não há limpeza automática. Auditoria, decisões e versões necessárias à rastreabilidade são retidas. No futuro, versões antigas poderão ter payload compactado após política formal, preservando hash, resumo, sequência e cadeia de supersessão.

O componente `origin-identity-audit` foi registrado como versão 1, preservando separadamente `relational-shadow` da Fase 1.
