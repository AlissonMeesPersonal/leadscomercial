# Primeiro acesso e senha pessoal — Leads Comercial

## O que foi implementado

- **Somente contas criadas após essa implementação** recebem uma senha provisória gerada aleatoriamente no formulário do administrador.
- O painel exibe a senha provisória apenas uma vez, para transmissão por canal seguro.
- Um novo registro é acrescentado a `commercial_password_activation` para esse ID de usuário, com `must_change_password=true`.
- No login válido com senha provisória, o sistema consulta a pendência e direciona para `/ativar-senha`.
- A tela exige senha provisória, senha nova (mínimo 12 caracteres, letras maiúsculas/minúsculas e números) e confirmação.
- A API só libera o painel após validar com o Supabase que a nova senha realmente funciona.
- Todos os usuários antigos **continuam sem registro nessa tabela** e mantêm as credenciais e o fluxo anterior.

## Ativação obrigatória no Supabase

1. Execute o arquivo `supabase/password-activation.sql` no SQL Editor do projeto `efahamylmoueniflnvzl`.
2. Confirme que a chave de serviço `SUPABASE_SERVICE_ROLE_KEY` continua configurada somente no servidor da Vercel.
3. **Antes de criar contas reais**, verifique a definição da função `commercial_admin_reset_password` retornada pela consulta ao final do SQL. Ela é chamada no primeiro acesso para gravar a nova senha com o mesmo algoritmo que as credenciais atuais.
4. Se essa função exigir papel administrativo, **não libere novas contas ainda**: será necessário criar uma rotina própria de troca pelo titular, validada pelo servidor, compatível com o algoritmo de hash atual. Não relaxe a regra de administrador da função existente.
5. Crie uma conta nova exclusivamente para teste. Faça login com a senha provisória, troque por uma senha pessoal e confirme que o login seguinte com a senha nova funciona e a senha provisória não funciona mais.
6. Confira que a conta de teste teve a pendência encerrada:
   `SELECT user_id,must_change_password,completed_at FROM public.commercial_password_activation;`
7. Entre com uma conta antiga para assegurar que não houve mudança.

## Limitação conhecida

A conexão do projeto Supabase não estava disponível no momento da alteração. A assinatura e a lógica de autorização SQL de `commercial_admin_reset_password` não puderam ser confirmadas. Se a função for exclusiva para administradores, a tentativa de troca pelo próprio usuário falhará com aviso, e o usuário permanecerá na tela de ativação. **Não considere o fluxo liberado para produção até um teste real de ponta a ponta.**

## Controles

- Nunca grave senhas em texto em tabelas de ativação ou logs.
- Nunca armazene a chave de serviço em variáveis `NEXT_PUBLIC_`.
- A tabela de ativação não concede acesso direto a `anon`/`authenticated`.
- Tokens de sessão pendentes são bloqueados no middleware para APIs e rotas operacionais.
