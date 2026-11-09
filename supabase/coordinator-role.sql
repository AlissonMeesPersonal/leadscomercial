-- Leads Comercial: habilitar o papel de Coordenadora Comercial sem mudar contas existentes.
-- Execute SOMENTE no banco usado pela aplicação (atualmente o código aponta para
-- o Supabase de referência efahamylmoueniflnvzl).
-- Seguro para executar novamente. Não atualiza ou apaga usuários/senhas.
BEGIN;

DO $$
DECLARE
  constraint_row record;
  role_col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO role_col_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.commercial_users'::regclass
    AND a.attname = 'role' AND NOT a.attisdropped;

  IF role_col_type IS NULL OR
     (role_col_type <> 'text' AND role_col_type NOT LIKE 'character varying%') THEN
    RAISE EXCEPTION 'Tipo da coluna role não suportado (%). Nenhuma regra foi alterada.', role_col_type;
  END IF;

  -- A regra que apareceu no erro exige unidade para qualquer perfil
  -- que não seja admin/commercial. Adicionamos coordinator à mesma exceção.
  FOR constraint_row IN
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.commercial_users'::regclass
      AND contype = 'c' AND conname = 'commercial_users_unit_required'
  LOOP
    IF constraint_row.definition NOT ILIKE '%role%'
       OR constraint_row.definition NOT ILIKE '%unit_id%' THEN
      RAISE EXCEPTION 'A regra % tem conteúdo inesperado: %',
        constraint_row.conname, constraint_row.definition;
    END IF;
    ALTER TABLE public.commercial_users
      DROP CONSTRAINT commercial_users_unit_required;
  END LOOP;

  ALTER TABLE public.commercial_users
    ADD CONSTRAINT commercial_users_unit_required
    CHECK (role IN ('admin', 'commercial', 'coordinator') OR unit_id IS NOT NULL);

  -- Altera apenas validações dedicadas à lista de papéis, não regras
  -- que combinem role com outras condições de segurança.
  FOR constraint_row IN
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.commercial_users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
      AND conname <> 'commercial_users_unit_required'
  LOOP
    IF constraint_row.definition ILIKE '%unit_id%'
       OR constraint_row.definition ILIKE '% AND %'
       OR constraint_row.definition ILIKE '% OR %' THEN
      RAISE EXCEPTION 'Validação combinada % precisa de revisão: %',
        constraint_row.conname, constraint_row.definition;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.commercial_users DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;

  ALTER TABLE public.commercial_users
    ADD CONSTRAINT commercial_users_role_allowed
    CHECK (role IN ('admin', 'commercial', 'coordinator', 'user'));
END $$;

COMMIT;

-- Verifique que ambas as regras agora incluem coordinator:
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.commercial_users'::regclass
  AND conname IN ('commercial_users_unit_required', 'commercial_users_role_allowed')
ORDER BY conname;

-- Inspecione o perfil da conta criada na tentativa anterior
-- (a consulta não altera o cadastro):
SELECT username, role, unit_id, active
FROM public.commercial_users
WHERE lower(username) = 'andressa';
