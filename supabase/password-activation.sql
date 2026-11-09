-- Ativação de senha exclusivamente para novas contas do Leads Comercial.
-- Não atualiza nem marca contas já existentes.
CREATE TABLE IF NOT EXISTS public.commercial_password_activation (
  user_id uuid PRIMARY KEY REFERENCES public.commercial_users(id) ON DELETE CASCADE,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.commercial_password_activation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_password_activation FROM PUBLIC, anon, authenticated;

-- O acesso ao marcador é exclusivo das APIs autenticadas do servidor.
-- Para finalizar a troca, a função commercial_admin_reset_password existente
-- precisa autorizar o próprio usuário. Se ela restringe a administradores,
-- deve-se implantar uma função self-service própria com a MESMA forma de
-- armazenamento e derivação de senha do banco. Não substitua os hashes por texto.
-- Inspeção necessária antes de habilitar a troca:
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('commercial_admin_reset_password','commercial_user_login');
