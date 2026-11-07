# Publicação na Chrome Web Store — Leads Comercial → Scale

## Estado atual da extensão
- Código-fonte: pasta `scale-connector/`.
- Manifest V3, versão `2.7.5`.
- Domínios de operação: `leadscomercial.vercel.app` e `scale.26fit.com.br`.
- Scripts: `background.js` e `content.js`.
- **Ainda não publicada:** o envio e a revisão devem ser realizados na conta do desenvolvedor da Chrome Web Store.

## Antes do envio
1. Confirmar autorização da organização para usar o nome e acessar o Scale Sales.
2. Registrar-se como desenvolvedor na Chrome Web Store: https://chrome.google.com/webstore/devconsole e concluir o pagamento da taxa única, caso ainda não tenha conta.
3. Adicionar **ícones PNG** de 16, 32, 48 e 128 pixels à pasta `scale-connector/icons/`. Declarar esses arquivos em `manifest.json` somente quando existirem no pacote.
4. Capturar **pelo menos um screenshot real** do conector funcionando em ambiente de teste (preferência: 1280 × 800 pixels), removendo dados pessoais reais dos leads.
5. Preparar ícone de 128 × 128 px para a listagem e, se desejado, imagem promocional de 440 × 280 px.
6. Publicar e revisar uma política de privacidade acessível: [POLITICA_DE_PRIVACIDADE.md](./POLITICA_DE_PRIVACIDADE.md). Preencher os campos de privacidade da Chrome Web Store de modo coerente com o código.
7. Testar em `chrome://extensions`, com "Carregar sem compactação": iniciar um lead, selecionar unidade, abrir conversa, preencher campos e verificar que **nenhuma mensagem é enviada automaticamente sem revisão**.

## Criar ZIP correto
Compactar **o conteúdo da pasta `scale-connector`**, sem incluir `.git`, credenciais, planilhas ou dados de clientes. O arquivo ZIP deve conter `manifest.json` em sua **raiz**, além de `background.js`, `content.js` e ícones.

Uma opção é copiar os arquivos necessários para uma pasta limpa e compactar seu conteúdo; não empacotar o repositório Next.js inteiro.

## Publicar
1. Acessar https://chrome.google.com/webstore/devconsole.
2. Selecionar **Add new item** e enviar o ZIP da extensão.
3. Preencher a listagem em Português (Brasil), com nome, descrição, categoria de produtividade, ícones e screenshots.
4. Informar a **finalidade única**: integração do painel Leads Comercial com o Scale Sales para preencher dados de contato e templates na interface, mediante ação do operador.
5. Justificar as permissões `storage`, `tabs` e `scripting`, bem como o acesso aos dois domínios.
6. Na aba de privacidade, indicar a URL pública da política e declarar corretamente o tratamento de **informações pessoais identificáveis**.
7. Em **Distribution**, selecionar preferencialmente **Unlisted (Não listada)** para distribuição via link à equipe. Essa opção não impede instalação por qualquer pessoa que obtenha o link; para acesso restrito, avaliar **Private** com testadores ou distribuição corporativa.
8. Enviar para revisão; acompanhar o estado no painel do Google. Não comunicar instalação disponível antes da aprovação.

## Texto de descrição sugerido
**Nome:** Leads Comercial → Scale

**Descrição curta:** Envie contatos do Leads Comercial para o Scale Sales e agilize o preenchimento de novas conversas e templates.

**Descrição completa:** Extensão de produtividade para equipes autorizadas que utilizam o Leads Comercial e o Scale Sales. Ao iniciar um contato no painel, a extensão encontra ou abre o Scale, localiza a unidade correspondente e auxilia no preenchimento do nome, telefone e, quando disponíveis, variáveis de templates. O operador revisa os dados antes de enviar a mensagem. O acesso é limitado aos dois sistemas integrados.

## Atenção às atualizações
A Chrome Web Store não atualiza automaticamente um item publicado apenas porque houve alterações no GitHub. Para cada nova versão, aumentar a versão no `manifest.json`, testar, gerar novo ZIP e enviar a atualização ao painel de publicação (ou configurar posteriormente um fluxo autorizado de publicação por API).

Documentação oficial:
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- https://developer.chrome.com/docs/webstore/program-policies/policies
