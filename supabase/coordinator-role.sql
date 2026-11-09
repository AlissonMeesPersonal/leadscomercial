-- Aplicar no banco do projeto Leads Comercial (efahamylmoueniflnvzl).
-- Não apaga usuários, registros, senhas ou unidades.
-- Executar ANTES de cadastrar uma nova coordenadora.
-- Executar no SQL Editor do Supabase do Leads Comercial.
-- Amplia somente a lista de perfis permitidos, sem criar ou apagar usuários.
DO $$
DECLARE
  c record;
  role_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO role_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.commercial_users'::regclass
    AND a.attname = 'role' AND NOT a.attisdropped;

  IF role_type IS NULL THEN RAISE EXCEPTION 'Coluna commercial_users.role não encontrada'; END IF;

  IF role_type = 'text' OR role_type LIKE 'character varying%' THEN
    FOR c IN SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.commercial_users'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%role%'
    LOOP
      -- Recusa alterar condições combinadas que não conhecemos.
      IF c.def ILIKE '% AND %' OR c.def ILIKE '% OR %' THEN
        RAISE EXCEPTION 'Validação combinada % necessita revisão manual: %', c.conname, c.def;
      END IF;
      EXECUTE format('ALTER TABLE public.commercial_users DROP CONSTRAINT %I', c.conname);
    END LOOP;
    ALTER TABLE public.commercial_users
      ADD CONSTRAINT commercial_users_role_allowed
      CHECK (role IN ('admin','commercial','coordinator','user'));
  ELSE
    RAISE EXCEPTION 'Tipo de role (%) não tratado automaticamente; revise o enum antes de criar coordenadora', role_type;
  END IF;
END $$;

-- Caso commercial_admin_create_user valide explicitamente p_role,
-- essa função também precisará aceitar 'coordinator'.
-- Confira sua definição sem expor senhas:
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'commercial_admin_create_user';
