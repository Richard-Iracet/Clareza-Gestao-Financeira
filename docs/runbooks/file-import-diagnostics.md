# Diagnóstico de importação

1. Abra o histórico e o lote afetado.
2. Confira hash, encoding, parser, separador, formato de data/decimal, conta e natureza do extrato.
3. Inspecione erros por linha sem copiar o arquivo completo para logs.
4. Ajuste o mapeamento e marque reprocessamento explícito; o lote anterior será cancelado logicamente.
5. Divergência de sinais exige confirmação explícita antes do novo processamento.
6. Arquivo repetido abre/identifica o lote anterior e não cria cópia silenciosa.

Rollback: desligue `VITE_OFX_CSV_IMPORT`, interrompa novas importações e preserve lotes/auditoria. O JSONB oficial continua operando sem depender desta camada.
