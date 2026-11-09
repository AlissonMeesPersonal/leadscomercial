-- DIAGNÓSTICO SOMENTE LEITURA — Leads Comercial.
-- Não altera usuários, senhas, funções ou permissões.
-- Retorna colunas da tabela e assinaturas das funções de senha sem revelar hashes.

SELECT 'coluna' AS tipo,
       column_name AS nome,
       data_type AS detalhe
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commercial_users'
UNION ALL
SELECT 'funcao' AS tipo,
       p.proname AS nome,
       pg_get_function_identity_arguments(p.oid) AS detalhe
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'commercial_user_login',
    'commercial_admin_reset_password',
    'commercial_admin_create_user',
    'commercial_complete_initial_password'
  )
ORDER BY tipo, nome;

-- Descrições das funções apenas para uso local na análise. 
-- NÃO compartilhe texto de funções que contenham segredos fixos.
-- Para investigar como são gravadas as senhas, revise no SQL Editor:
-- SELECT pg_get_functiondef(oid) FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
-- AND proname IN ('commercial_user_login','commercial_admin_reset_password');
