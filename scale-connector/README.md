# Conector Leads Comercial → Scale

Extensão Chrome simples para preencher automaticamente a janela **Nova Conversa** do Scale Sales.

## Instalação para teste

1. No GitHub, baixe este repositório como ZIP.
2. Extraia o ZIP.
3. No Chrome, abra `chrome://extensions`.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação**.
6. Selecione a pasta `scale-connector`.

Depois:
1. Entre no Leads Comercial.
2. Clique em **Iniciar no Scale** no lead.
3. O Scale abrirá.
4. O conector abre **Chat Unidades**, seleciona automaticamente a **unidade vinculada ao lead** (ex.: Rio Grande, Santa Cruz do Sul, Blumenau), abre **Nova Conversa** e preenche Nome, Brasil +55 e telefone.
5. Quando os dados estiverem válidos, ele avança em **Continuar** automaticamente.

### Atualização 2.1.0
- Corrige clique duplicado que podia selecionar e desfazer a unidade.
- Passa a clicar no cartão/linha real de **Santa Cruz**, e não apenas no texto.
- Adiciona um clique de reforço por coordenada quando a interface do Scale interceptar o primeiro clique.

Depois de atualizar os arquivos, abra `chrome://extensions` e clique em **Recarregar** na extensão antes de testar novamente.


### Atualização 2.6.0
- Remove a unidade fixa de Santa Cruz.
- O Leads Comercial envia a unidade junto com nome e telefone.
- O conector seleciona automaticamente Rio Grande, Santa Cruz do Sul ou outra unidade vinculada ao lead.
- Para aplicar em um computador que já possui a extensão: abra `chrome://extensions`, clique em **Recarregar** e depois atualize as abas do Leads Comercial e do Scale.


### Atualização 2.6.1
- Os avisos do conector agora desaparecem automaticamente após 10 segundos.
- O aviso faz uma transição curta antes de sair da tela.
- Mantém o preenchimento e a seleção dinâmica de unidade da versão 2.6.0.


### Atualização 2.7.0
- Para inadimplentes, o Portal envia Nome, vencimento, valor em aberto e link de pagamento ao conector.
- Depois de preencher Nome e Telefone, o conector aguarda o usuário selecionar `cobranca_mensalidade_atraso`.
- Ao abrir as variáveis do template, preenche automaticamente:
  - {{1}} Nome
  - {{2}} Vencimento
  - {{3}} Valor em aberto (sem "R$", pois o template já possui o prefixo)
  - {{4}} Link de pagamento
- O envio final continua manual: o usuário revisa e clica em **Enviar Template**.
- Se vencimento ou link não existirem na importação, o conector preenche o que estiver disponível e avisa quais variáveis faltam.


### Atualização 2.7.1
- Ajuste do template `cobranca_mensalidade_atraso` conforme o relatório real do EVO.
- Variáveis:
  - {{1}} Nome
  - {{2}} Fim do último contrato
  - {{3}} Débito
  - {{4}} Dentro do seu App da 26Fit!
- O conector não depende mais de link de pagamento no relatório.


### Atualização 2.7.2
- Corrige o preenchimento da variável {{2}} do template `cobranca_mensalidade_atraso`.
- As quatro variáveis agora são preenchidas sequencialmente, relendo os campos após cada alteração porque o Scale pode reconstruir o formulário.
- O conector faz uma segunda tentativa automática caso algum campo continue vazio.
- O painel de inadimplentes passa a mostrar **Fim do último contrato** antes do botão do Scale.
