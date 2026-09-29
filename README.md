# Leads Comercial

Painel interno da 26Fit para organizar o trabalho comercial com oportunidades, inadimplentes e alunos inativos.

O projeto reúne o acompanhamento das carteiras, importação de arquivos, autenticação de usuários, integração com Supabase, recebimento de oportunidades do EVO e o conector do Scale Sales.

## Estrutura

- `app/` — aplicação Next.js e rotas da API.
- `app/dashboard/` — operação diária das carteiras.
- `app/admin/` — usuários, unidades e visão administrativa.
- `app/api/evo/webhook/` — entrada de oportunidades vindas do EVO.
- `lib/auth.ts` — criação e validação da sessão do painel.
- `scale-connector/` — extensão do Chrome usada para abrir e preencher contatos no Scale Sales.
- `public/assets/` — arquivos públicos usados pela interface.

## Desenvolvimento

Instale as dependências:

```bash
npm install
```

Inicie o ambiente local:

```bash
npm run dev
```

Para validar uma alteração antes do deploy:

```bash
npm run build
```

## Convenções do projeto

O código prioriza nomes ligados ao negócio e funções pequenas o suficiente para deixar claro o que cada trecho faz.

Alguns pontos importantes ao alterar o projeto:

- preservar as chaves de storage usadas pelo portal e pela extensão;
- manter compatibilidade com os tipos de mensagem trocados com o Scale;
- não misturar as carteiras de oportunidades, inadimplentes e inativos;
- manter as regras de acesso por perfil e unidade;
- evitar abstrações genéricas quando uma função com nome de domínio deixa a intenção mais clara;
- comentar somente comportamentos que não sejam óbvios pelo próprio código.

## Integrações

### Supabase

O painel usa o Supabase para usuários, unidades, leads, carteiras de inadimplentes e rotinas RPC.

### EVO

O webhook recebe eventos comerciais e encaminha oportunidades válidas para o fluxo interno.

### Scale Sales

A extensão em `scale-connector/` recebe o lead selecionado no painel, localiza uma aba do Scale e conduz o preenchimento da conversa.

Ao alterar essa extensão, teste tanto o cenário com o Scale já aberto quanto o cenário em que uma nova aba precisa ser criada.
