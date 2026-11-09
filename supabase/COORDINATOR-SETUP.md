# Criar usuário Coordenadora Comercial

A opção está disponível no painel do administrador, em **Usuários e unidades → Criar usuário → Perfil: Coordenadora Comercial**.

## Ativação no Supabase

Antes de criar a conta, execute `supabase/coordinator-role.sql` no SQL Editor do projeto do Leads Comercial. Isso permite que a coluna `commercial_users.role` aceite `coordinator` (quando é uma coluna de texto com validação simples).

A criação aproveita a função já existente `commercial_admin_create_user` para gerar as credenciais. Em seguida, uma API somente para administradores converte o novo usuário de `commercial` para `coordinator` usando a chave de serviço server-side. A chave `SUPABASE_SERVICE_ROLE_KEY` precisa estar configurada na Vercel.

Se a ativação falhar após a criação da conta, **não entregue as credenciais ao usuário** até verificar o papel no banco. A conta poderá ter permanecido no perfil comercial. Corrija a configuração antes de ativá-la.

## Acesso

- Coordenadora: `/dashboard/coordenacao` (painel de leitura de indicadores e resultados por equipe).
- Admin: mantém criação de usuários e todas as funções existentes.
- Coordenadora não recebe botões de importação, exclusão, registro financeiro ou administração.

A rota de relatórios valida o JWT assinado e novamente o papel real do usuário no banco, antes de agregar dados; retorna apenas totais e nomes dos colaboradores (não contatos/telefones).
As rotas operacionais do dashboard redirecionam a coordenadora para a área de gestão.

## Teste

1. Crie conta de teste após a migração SQL.
2. Entre com as credenciais da coordenadora; confirme redirecionamento para `/dashboard/coordenacao`.
3. Verifique totais, filtros de usuário/unidade e quantidade de inícios no Scale.
4. Tente abrir `/dashboard` e `/dashboard/inadimplentes` na barra do navegador: o acesso deve redirecionar para a coordenação.
5. Confira no banco: `SELECT username, role FROM public.commercial_users WHERE username = 'USUARIO_TESTE';` → `coordinator`.
6. Teste com a conta do administrador para garantir que o painel de criação de usuários continua acessível.

**Limite importante:** contas já autenticadas mantêm o papel na sessão até o próximo login; jamais reutilize uma sessão comercial antiga para testar. O status Convertido representa o estado atual, não a data de conversão.
