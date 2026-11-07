# Política de Privacidade — Leads Comercial → Scale

**Última atualização:** 6 de novembro de 2026

## Finalidade
A extensão **Leads Comercial → Scale** auxilia profissionais autorizados a transferir dados de contato selecionados no painel interno Leads Comercial para a interface do Scale Sales, preenchendo campos de nova conversa e, quando aplicável, variáveis de modelos de mensagem. O envio final de mensagens deve ser revisado e confirmado pelo operador.

## Dados tratados
Ao selecionar a ação "Iniciar no Scale" no painel Leads Comercial, a extensão pode tratar: nome do contato, telefone e DDI, unidade e informações necessárias para completar variáveis de templates (por exemplo, vencimento e valor de cobrança). Esses dados são disponibilizados pelo próprio painel para viabilizar a ação solicitada pelo operador.

## Onde os dados são utilizados
A extensão funciona exclusivamente nos domínios `https://leadscomercial.vercel.app` e `https://scale.26fit.com.br`, para receber o contato selecionado no primeiro e preencher a interface do segundo.

A extensão não possui, no código atual, serviços próprios de análise, publicidade ou envio de dados para servidores de terceiros além dos serviços web com os quais o próprio operador está interagindo. O Scale Sales processa dados conforme suas próprias práticas e os termos aplicáveis ao serviço.

## Armazenamento no navegador
O conector utiliza `chrome.storage.local` para manter temporariamente o contato em processamento, inclusive quando a aba do Scale é aberta ou recarregada. Há uma verificação de validade de dez minutos no carregamento da página do Scale; dados antigos são removidos quando essa verificação é executada. **Isso não equivale a um prazo automático garantido de exclusão:** dados podem permanecer armazenados no navegador até que a rotina de limpeza seja executada ou até a remoção dos dados locais da extensão.

## Compartilhamento e venda
O código da extensão não contém mecanismos de venda, publicidade, rastreamento comportamental ou compartilhamento comercial de dados. A transferência de dados entre o Leads Comercial e a interface do Scale Sales ocorre para a finalidade operacional descrita.

## Permissões do Chrome
- `storage`: guardar temporariamente o contato em processamento.
- `tabs`: localizar ou abrir a aba do Scale Sales.
- `scripting`: reinjetar o script da extensão na aba autorizada se necessário após uma atualização.
- Acesso aos dois domínios mencionados: integrar exclusivamente essas páginas.

## Segurança e acesso
A extensão destina-se a operadores autorizados a usar o painel Leads Comercial e o Scale Sales. Não substitui os mecanismos de autenticação e autorização desses sistemas. O operador deve conferir os dados antes do envio.

## Contato e solicitações
Para questões sobre dados pessoais, acesso, correção ou exclusão, utilize os canais de suporte oficiais da organização responsável pelo Leads Comercial. Os responsáveis devem disponibilizar um meio de contato válido e confirmar esta política antes da publicação na Chrome Web Store.

Esta política descreve o comportamento do código da extensão no repositório em sua versão 2.7.5. Antes de publicar versões futuras, revise o documento caso as práticas de tratamento de dados sejam alteradas.
