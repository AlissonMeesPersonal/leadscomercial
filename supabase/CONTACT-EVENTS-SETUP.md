# Atendimentos iniciados no Scale

O painel `Atendimentos` registra quando um colaborador clica em `Iniciar no Scale`.

**Importante:** é registro de *início*, não comprovante de envio de WhatsApp/Scale. Não alterar a métrica para "enviados" sem integração oficial que confirme o disparo.

## Instalação no projeto já existente

1. No Supabase do **Leads Comercial**, abra SQL Editor e execute `supabase/contact-events.sql`.
2. No projeto Vercel, configure a variável server-only `SUPABASE_SERVICE_ROLE_KEY` com o valor apropriado do mesmo projeto Supabase. **Nunca** use prefixo `NEXT_PUBLIC_`, nem insira a chave no código, no GitHub ou em prints.
3. Faça redeploy e confira a aba `Atendimentos`.
4. Em conta de colaborador, clique em `Iniciar no Scale` de um contato da própria carteira. A navegação não aguarda a gravação da auditoria.
5. Abra `Atendimentos`: a tentativa bem-sucedida aparecerá como **Iniciado**, com o usuário, carteira e hora. Em conta de gestor/admin, são exibidos eventos de todos os colaboradores.
6. Valide que usuário comum não consegue consultar registros de outros colaboradores, inclusive em chamadas diretas à API.

## Controles de segurança

O endpoint `/api/contact-events` consulta a sessão assinada e valida a conta ativa no banco. Em cada registro consulta o lead no servidor e verifica carteira/unidade antes de persistir o evento. Usa idempotência por UUID para a mesma tentativa. Não aceita nome, telefone ou perfil enviados pelo navegador como fonte de verdade.

As tabelas de auditoria usam RLS ativa sem acesso a `anon` ou `authenticated`; a aplicação acessa pelo servidor usando segredo. Se `SUPABASE_SERVICE_ROLE_KEY` não estiver configurada, a aba mostrará aviso e não persistirá eventos.

## Limitações

- Eventos anteriores à ativação não podem ser reconstruídos a partir do status `Em contato`.
- Clicar no Scale registra intenção de iniciar; **não** comprova que uma conversa foi aberta ou que o WhatsApp entregou mensagem.
- Novos cliques criam novos eventos. O mesmo clique só possui um ID de evento.
- O sistema não envia dados a um Apps Script externo.
