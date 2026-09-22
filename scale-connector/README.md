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
4. O conector abre **Chat Unidades**, seleciona **Santa Cruz**, abre **Nova Conversa** e preenche Nome, Brasil +55 e telefone.
5. Quando os dados estiverem válidos, ele avança em **Continuar** automaticamente.

### Atualização 2.1.0
- Corrige clique duplicado que podia selecionar e desfazer a unidade.
- Passa a clicar no cartão/linha real de **Santa Cruz**, e não apenas no texto.
- Adiciona um clique de reforço por coordenada quando a interface do Scale interceptar o primeiro clique.

Depois de atualizar os arquivos, abra `chrome://extensions` e clique em **Recarregar** na extensão antes de testar novamente.
