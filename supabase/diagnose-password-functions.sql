-- CONSULTA SOMENTE LEITURA — estrutura real da autenticação.
-- Não altera usuários, senhas, permissões nem funções.
-- Os corpos das funções podem revelar detalhes internos de segurança:
-- revise o resultado antes de compartilhá-lo.
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS parametros,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_catalog.pg_proc AS p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'commercial_user_login',
    'commercial_admin_reset_password',
    'commercial_admin_create_user'
  )
ORDER BY p.proname;
