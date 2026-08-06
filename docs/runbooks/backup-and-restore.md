# Backup e restauração

1. Em Configurações, exporte o backup e registre data, versão, snapshot e checksum da linha de base.
2. Guarde o JSON fora do dispositivo; não o publique, pois contém dados financeiros.
3. Para restaurar, selecione arquivo de até 10 MB, confira o resumo e confirme.
4. A aplicação valida formato e referências, cria `financeDataBackupBeforeManualImport`, persiste um snapshot e somente então promove o estado.
5. Recarregue, gere nova linha de base e compare. Confirme explicitamente qual versão sincronizar.
6. Em erro, não repita escritas: preserve o arquivo, estado atual, `lastValid` e mensagem. A importação restaura as chaves anteriores em melhor esforço.
