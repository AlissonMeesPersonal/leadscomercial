-- Execute uma vez no SQL Editor do projeto Supabase do Leads Comercial.
-- O histórico não recria números de arquivos antigos.
CREATE TABLE IF NOT EXISTS public.commercial_import_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.commercial_users(id) ON DELETE CASCADE,
  unit_id uuid NULL REFERENCES public.commercial_units(id) ON DELETE SET NULL,
  demand_type text NOT NULL CHECK (demand_type IN ('opportunity', 'inactive')),
  filename text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source_rows integer NOT NULL CHECK (source_rows >= 0),
  valid_rows integer NOT NULL CHECK (valid_rows >= 0),
  inserted_rows integer NOT NULL CHECK (inserted_rows >= 0),
  updated_rows integer NOT NULL CHECK (updated_rows >= 0),
  not_inserted_rows integer NOT NULL CHECK (not_inserted_rows >= 0)
);
CREATE INDEX IF NOT EXISTS commercial_import_audits_owner_filename_idx
  ON public.commercial_import_audits(owner_user_id,demand_type,filename,imported_at DESC);
ALTER TABLE public.commercial_import_audits ENABLE ROW LEVEL SECURITY;
-- Não expor o histórico diretamente ao navegador: acesso somente pela API
-- autenticada do Next.js usando a chave server-side de serviço.
REVOKE ALL ON public.commercial_import_audits FROM anon, authenticated;
COMMENT ON TABLE public.commercial_import_audits IS
  'Contabilização de importações concluídas; não representa arquivos físicos armazenados.';
