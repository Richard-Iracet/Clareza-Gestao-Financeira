# Pesquisa de provedores para prova de conceito

Consulta realizada em 5 de agosto de 2026, apenas em fontes oficiais.

## Contexto brasileiro

O Banco Central informa que o compartilhamento depende de consentimento, autenticação e confirmação, pode ser revogado pelo cliente e que a participação direta é destinada a instituições autorizadas/supervisionadas. Por isso, o Clareza deve contratar um agregador em vez de implementar APIs reguladas diretamente.

Fontes: https://www.bcb.gov.br/estabilidadefinanceira/cliente-open-finance e https://www.bcb.gov.br/estabilidadefinanceira/openfinance_participantes/https%3A/www3.bcb.gov.br/mec-circulante

## Pluggy

- Cobertura/documentação brasileira e widget Connect.
- `CLIENT_ID`/`CLIENT_SECRET` geram API key no servidor; Connect Token limitado dura 30 minutos.
- Webhooks notificam criação/atualização/remoção/erros e eventos de transações.
- Suporta referência `clientUserId` e opção de evitar duplicidade em conectores compatíveis.
- Risco de lock-in: semântica Item/Connector e eventos próprios exigem adapter.

Fontes: https://docs.pluggy.ai/docs/authentication, https://docs.pluggy.ai/docs/webhooks e https://docs.pluggy.ai/docs/item

## Belvo

- Guia oficial específico de agregação Open Finance no Brasil.
- Recomenda Sandbox e Mockbank; jornada via Hosted Widget.
- Carga assíncrona com disponibilidade sinalizada por webhooks.
- Token do widget é gerado no servidor e possui validade curta documentada.
- Risco de lock-in: recursos Link/Widget e eventos próprios exigem adapter.

Fontes: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget e https://developers.belvo.com/products/employments_brazil/hosted-widget-introduction

Preço não foi comparado porque a documentação pública consultada não sustenta uma comparação contratual atual. Nenhum fornecedor foi selecionado automaticamente. A prova de conceito permanece no mock.
