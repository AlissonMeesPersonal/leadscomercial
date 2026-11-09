-- Leads Comercial — instalação da troca de senha no primeiro acesso.
-- Confirmado pelas funções commercial_user_login e commercial_admin_reset_password.
-- As credenciais ficam em private.commercial_user_credentials (não commercial_users).
-- Este script não altera senhas ou contas existentes ao ser instalado.
BEGIN;

DO $checks$
BEGIN
  IF to_regclass('private.commercial_user_credentials') IS NULL OR
     to_regclass('public.commercial_password_activation') IS NULL THEN
    RAISE EXCEPTION 'Tabelas de credenciais ou ativação ausentes; nenhuma alteração aplicada.';
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
  stored_hash text;
  fresh_token text;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR p_new_password IS NULL
     OR char_length(p_new_password) <> 8
     OR p_new_password !~ '[a-z]'
     OR p_new_password !~ '[A-Z]'
     OR p_new_password !~ '[0-9]'
     OR p_temporary_password = p_new_password THEN
    RAISE EXCEPTION 'Senha pessoal inválida.';
  END IF;

  -- Bloqueia as duas linhas durante a troca, evitando alterações parciais.
  SELECT c.password_hash INTO stored_hash
  FROM private.commercial_user_credentials AS c
  JOIN public.commercial_users AS u ON u.id = c.user_id
  JOIN public.commercial_password_activation AS a ON a.user_id = u.id
  WHERE u.id = p_user_id AND u.active = true AND a.must_change_password = true
  FOR UPDATE OF c, a;

  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'Ativação não encontrada ou já concluída.';
  END IF;

  IF extensions.crypt(p_temporary_password, stored_hash) IS DISTINCT FROM stored_hash THEN
    RAISE EXCEPTION 'Senha provisória incorreta.';
  END IF;

  -- Igual ao procedimento administrativo atual: bcrypt + novo token.
  fresh_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE private.commercial_user_credentials
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      api_token = fresh_token,
      api_token_hash = encode(extensions.digest(fresh_token, 'sha256'), 'hex'),
      updated_at = pg_catalog.now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credenciais não encontradas.';
  END IF;

  UPDATE public.commercial_password_activation
  SET must_change_password = false,
      completed_at = pg_catalog.now()
  WHERE user_id = p_user_id AND must_change_password = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ativação concorrente; nenhuma alteração confirmada.';
  END IF;

  RETURN true;
END
$function$;

-- A função é chamada exclusivamente pelo backend com service_role.
-- Ela nunca deve ficar disponível para o navegador ou para anon/authenticated.
REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text)
  TO service_role;

COMMIT;

-- Verificação sem expor senhas ou tokens.
SELECT p.proname,
       pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'commercial_complete_initial_password';
