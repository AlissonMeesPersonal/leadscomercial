# Leads Comercial

Painel para importação e organização de leads comerciais.

## Recursos
- Login protegido por cookie de sessão.
- Importação XLSX, XLS, CSV, PDF, DOCX, TXT e TSV.
- Identificação de nome, WhatsApp e e-mail.
- Deduplicação básica por WhatsApp/e-mail.
- Busca e filtro por status.
- Abertura direta da conversa no WhatsApp.
- Link de e-mail.
- Status comercial: Novo, Em contato, Interessado, Sem retorno e Convertido.

## Vercel
Configure estas variáveis no projeto:
- COMERCIAL_USER
- COMERCIAL_PASSWORD
- SESSION_SECRET

Depois faça o deploy.

> Nesta primeira versão os leads são persistidos no navegador do usuário. Para compartilhar a mesma base entre vários computadores/usuários, conecte a aplicação a um banco como Supabase.
