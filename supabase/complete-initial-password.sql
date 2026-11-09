-- Leads Comercial — primeira senha pessoal.
-- Execute NO BANCO efetivamente utilizado pelo Leads Comercial.
-- Não muda senhas existentes durante a instalação.
-- Requer commercial_users.password_hash em bcrypt e a tabela
-- commercial_password_activation criada anteriormente.
BEGIN;

DO $checks$
DECLARE
  unsupported_count bigint;
BEGIN
  SELECT count(*) INTO unsupported_count
  FROM public.commercial_users
  WHERE password_hash IS NOT NULL
    AND left(password_hash, 4) NOT IN ('$2a$', '$2b$', '$2y$');

  IF unsupported_count > 0 THEN
    RAISE EXCEPTION 'Formato de hash diferente de bcrypt encontrado. Nenhuma função foi instalada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'crypt' AND n.nspname IN ('extensions', 'public')
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'gen_salt' AND n.nspname IN ('extensions', 'public')
  ) THEN
    RAISE EXCEPTION 'pgcrypto não está disponível; nenhuma função foi instalada.';
  END IF;
END
$checks$;

CREATE OR REPLACE FUNCTION public.commercial_complete_initial_password(
  p_user_id uuid,
  p_temporary_password text,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  old_hash text;
  new_hash text;
  calculated_hash text;
  crypto_schema text;
BEGIN
  IF p_user_id IS NULL
     OR p_temporary_password IS NULL
     OR p_new_password IS NULL
     OR char_length(p_new_password) <> 8
     OR p_new_password !~ '[A-Z]'
     OR p_new_password !~ '[a-z]'
     OR p_new_password !~ '[0-9]'
     OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'crypt'
    AND n.nspname IN ('extensions', 'public')
  LIMIT 1;

  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia indisponível.';
  END IF;

  SELECT u.password_hash INTO old_hash
  FROM public.commercial_users u
  JOIN public.commercial_password_activation a ON a.user_id = u.id
  WHERE u.id = p_user_id
    AND u.active = true
    AND a.must_change_password = true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL THEN
    RAISE EXCEPTION 'Ativação não encontrada.';
  END IF;

  IF left(old_hash, 4) NOT IN ('$2a$', '$2b$', '$2y$') THEN
    RAISE EXCEPTION 'Hash incompatível.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1, $2)', crypto_schema)
    INTO calculated_hash USING p_temporary_password, old_hash;

  IF calculated_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória incorreta.';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT %I.crypt($1, %I.gen_salt(''bf'', 12))',
    crypto_schema, crypto_schema
  ) INTO new_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash = new_hash
  WHERE id = p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password = false,
      completed_at = pg_catalog.now()
  WHERE user_id = p_user_id AND must_change_password = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ativação concorrente; transação cancelada.';
  END IF;

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid, text, text)
  TO service_role;

COMMIT;

SELECT p.proname,
       pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'commercial_complete_initial_password';
