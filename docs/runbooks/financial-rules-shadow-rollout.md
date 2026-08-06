# Rollout e rollback das regras financeiras

1. Aplicar as migrations `010` e `011` em ordem.
2. Validar vínculos com `npm run financial-rules:validate-links`.
3. Executar `npm run financial-rules:shadow -- --user <uuid> --dry-run --limit 100`.
4. Habilitar engine e modo sombra apenas no ambiente escolhido; gerar comparação sem publicar valores.
5. Revisar divergências, pagamentos, transferências, estornos e parcelas.

Rollback: desligar todas as flags da Fase 5. Isso interrompe novas projeções e retorna imediatamente ao comportamento anterior. Não apagar eventos, vínculos, comparações ou auditoria. A leitura oficial permanece desligada independentemente da configuração de ambiente.
