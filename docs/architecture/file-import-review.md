# Importação OFX/CSV com revisão — Fase 3

`finance_states.data` permanece oficial. Arquivos importados nunca criam automaticamente `financial_transactions` nem alteram totais.

```text
arquivo local
  → validação + SHA-256
  → parser OFX ou CSV
  → normalização exata
  → classificação de duplicidade
  → import_batches
       └─ import_batch_records (preparação/revisão)
            → futura publicação, fora da Fase 3
```

## Contrato e estados

O lote registra tipo, nome sanitizado, tamanho, hash, parser, conta/cartão, moeda, timezone, mapeamento, totais e contagens. Estados: `uploaded`, `parsing`, `awaiting_mapping`, `awaiting_review`, `confirmed`, `partially_confirmed`, `rejected`, `failed`, `cancelled`.

Cada registro preserva linha, payload mínimo, textos originais, valor exato, moeda, data original/normalizada, FITID, fingerprint, erros, alertas, duplicidade e decisão. `accepted` significa somente aprovado na preparação.

## Limites e privacidade

- extensões: `.ofx` e `.csv`;
- tamanho máximo: 5 MB;
- máximo: 20.000 registros;
- UTF-8 com fallback controlado para Windows-1252;
- arquivo integral não é persistido;
- payload de linha é limitado aos campos necessários;
- scripts/HTML nunca são executados nem inseridos como HTML;
- logs e auditoria guardam apenas hash, contagens e metadados.

Não há limpeza irreversível automática. Lotes cancelados e decisões permanecem rastreáveis. Compactação futura exige política separada.

## Normalização e identidade

Dinheiro é interpretado como texto e `BigInt` de centavos, sem `Number` ou `parseFloat`; o texto original é preservado. Datas dependem de formato explícito (`DD/MM/YYYY`, ISO ou OFX), preservando timezone/offset quando disponíveis. Inversão de sinais exige checkbox explícito.

Reenvio usa SHA-256 + usuário + contexto. FITID confiável no mesmo contexto identifica duplicado exato. Fingerprint versionado apenas sinaliza possível duplicidade; descrição, data e valor nunca são identidade definitiva.

OFX suporta variantes SGML/XML comuns. CSV usa máquina de estados para aspas, separadores e quebras de linha. Erro em uma linha não invalida as demais.

## Feature flag

`ofxCsvImport` inicia desligada. Em ambiente válido, `VITE_OFX_CSV_IMPORT=true` habilita menu, rota e operação. A página é carregada sob demanda.
