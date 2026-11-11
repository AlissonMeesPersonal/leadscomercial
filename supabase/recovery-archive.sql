-- Executar no SQL Editor do Supabase do Leads Comercial, antes de habilitar a recuperação.
-- Arquivos: cópia dos leads antes da exclusão. Usuários: estado antes da exclusão lógica.
CREATE TABLE IF NOT EXISTS public.commercial_recovery_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('folder','user')),
  title text NOT NULL,
  owner_user_id text NOT NULL,
  owner_username text NOT NULL,
  actor_user_id text NOT NULL,
  actor_username text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by text,
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared','deleted','restored','failed')),
  payload jsonb NOT NULL,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0)
);
CREATE INDEX IF NOT EXISTS commercial_recovery_archive_filters_idx
  ON public.commercial_recovery_archive(kind,deleted_at DESC,owner_username,actor_username);
ALTER TABLE public.commercial_recovery_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_recovery_archive FROM PUBLIC, anon, authenticated;
-- A chave de serviço deve permanecer somente no servidor Next.js.
COMMENT ON TABLE public.commercial_recovery_archive IS
 'Cópia privada para recuperação de exclusões futuras. Não substitui backup integral do banco.';
