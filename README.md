# Leads Comercial

Painel para importação e organização de leads comerciais.

## Recursos
- Login protegido por cookie de sessão.
- Importação XLSX, XLS, CSV, PDF, DOCX, TXT e TSV.
- Identificação de nome, WhatsApp e e-mail.
- Deduplicação básica por WhatsApp/e-mail.
- Persistência dos leads no Supabase.
- Busca e filtro por status.
- Abertura direta da conversa no WhatsApp.
- Integração com o conector Chrome para preenchimento do Scale.
- Link de e-mail.
- Status comercial: Novo, Em contato, Interessado, Sem retorno e Convertido.

## Banco de dados
Projeto Supabase: `efahamylmoueniflnvzl`

Tabela principal: `public.commercial_leads`

Os dados ficam protegidos por RLS. O painel usa uma credencial derivada após o login comercial e enviada apenas durante as requisições à API do Supabase.

Na primeira abertura após a migração, leads antigos existentes no `localStorage` do navegador são enviados uma única vez ao Supabase e o armazenamento legado é removido.

## Vercel
Configure estas variáveis no projeto:
- COMERCIAL_USER
- COMERCIAL_PASSWORD
- SESSION_SECRET

Depois faça o deploy.
