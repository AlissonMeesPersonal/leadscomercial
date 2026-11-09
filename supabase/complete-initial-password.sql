-- Leads Comercial: ativação de senha do próprio usuário, sem poderes administrativos.
-- Executar no SQL Editor do banco de produção utilizado pela aplicação.
-- Não altera credenciais de contas antigas nem cria permissões para anon/authenticated.
--
-- Pré-requisitos verificados durante a execução:
-- 1) commercial_users.password_hash utiliza bcrypt ($2a/$2b/$2y)
-- 2) pgcrypto oferece crypt() e gen_salt().
-- Se o banco usar outro algoritmo, o script recusa a instalação (sem alterações).
BEGIN;

DO $checks$
DECLARE
  pw_column boolean;
  unsupported_hashes bigint;
  crypt_available boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commercial_users'
      AND column_name='password_hash'
  ) INTO pw_column;
  IF NOT pw_column THEN
    RAISE EXCEPTION 'A coluna password_hash não existe. Revise a rotina original de senhas antes de instalar.';
  END IF;
  -- Não retornamos hashes nem dados pessoais.
  EXECUTE 'SELECT count(*) FROM public.commercial_users WHERE password_hash IS NOT NULL AND left(password_hash,4) NOT IN (''$2a
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF left(old_hash,4) NOT IN ('$2a
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2b
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2y
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
')'
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
,'$2b
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2b
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2y
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
')'
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
,'$2y
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2b
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2y
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
')'
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
) THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2b
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
',''$2y
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
')'
    INTO unsupported_hashes;
  IF unsupported_hashes > 0 THEN
    RAISE EXCEPTION 'O banco usa formato(s) de senha diferente(s) de bcrypt. Nenhuma função foi instalada.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='crypt' AND n.nspname IN ('extensions','public')
  ) INTO crypt_available;
  IF NOT crypt_available THEN
    RAISE EXCEPTION 'pgcrypto crypt() indisponível: revise extensões do banco.';
  END IF;
END $checks$;

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
  crypto_schema text;
  fresh_hash text;
  pending boolean;
BEGIN
  IF p_user_id IS NULL OR p_temporary_password IS NULL OR
     p_new_password IS NULL OR length(p_new_password) <> 8 OR
     p_new_password !~ '[A-Z]' OR p_new_password !~ '[a-z]' OR
     p_new_password !~ '[0-9]' OR p_new_password = p_temporary_password THEN
    RAISE EXCEPTION 'Dados de ativação inválidos.';
  END IF;

  SELECT n.nspname INTO crypto_schema
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public')
  LIMIT 1;
  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Criptografia de senhas indisponível.';
  END IF;

  SELECT u.password_hash, a.must_change_password
  INTO old_hash, pending
  FROM public.commercial_users AS u
  JOIN public.commercial_password_activation AS a ON a.user_id=u.id
  WHERE u.id=p_user_id AND u.active=true AND a.must_change_password=true
  FOR UPDATE OF u, a;

  IF old_hash IS NULL OR NOT coalesce(pending,false) THEN
    RAISE EXCEPTION 'Esta conta não possui ativação pendente.';
  END IF;
  IF old_hash !~ '^\\$2[aby]\\$[0-9][0-9]\\$' THEN
    RAISE EXCEPTION 'Formato da senha original não suportado; nenhum dado alterado.';
  END IF;

  EXECUTE pg_catalog.format('SELECT %I.crypt($1,$2)',crypto_schema)
    INTO fresh_hash USING p_temporary_password, old_hash;
  IF fresh_hash IS DISTINCT FROM old_hash THEN
    RAISE EXCEPTION 'Senha provisória inválida.';
  END IF;

  -- Reutiliza bcrypt como já usado pelo banco.
  EXECUTE pg_catalog.format('SELECT %I.crypt($1, %I.gen_salt(''bf'',12))',crypto_schema,crypto_schema)
    INTO fresh_hash USING p_new_password;

  UPDATE public.commercial_users
  SET password_hash=fresh_hash
  WHERE id=p_user_id;

  UPDATE public.commercial_password_activation
  SET must_change_password=false, completed_at=pg_catalog.now()
  WHERE user_id=p_user_id AND must_change_password=true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativação concorrente detectada. Operação desfeita.'; END IF;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_complete_initial_password(uuid,text,text) TO service_role;

COMMIT;

-- Confirme somente a existência da função e permissões.
SELECT p.proname, pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS servico_autorizado,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_autorizado
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname='commercial_complete_initial_password';
