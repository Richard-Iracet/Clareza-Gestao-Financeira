# Motor de reconciliação — Fase 4

O motor é uma projeção paralela. `finance_states.data` permanece como fonte oficial e nenhuma etapa do pipeline altera totais, dashboard ou o lançamento oficial.

Fluxo: seleção limitada por usuário/moeda/contexto/data → extração versionada de características → regras exatas → bloqueios financeiros → score explicável → persistência de candidatos → decisão humana auditável. Apenas identidade externa confirmada ou vínculo prévio é regra exata; valor, data ou descrição semelhantes nunca autorizam mescla automática.

Modos: `disabled` (padrão), `observation`, `review` e `exact_auto_match`. O último ainda exige a flag específica, regra exata e ausência de bloqueios. Decisões manuais têm prioridade no reprocessamento. Dados brutos, versões anteriores e entidades oficiais não são apagados.

As tabelas `reconciliation_runs`, `reconciliation_candidates` e `reconciliation_rules` têm RLS por `auth.uid()`. Vínculos e decisões são reversíveis e mantêm trilha histórica.
