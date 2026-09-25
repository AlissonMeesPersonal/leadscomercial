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
