-- Execute no SQL Editor do projeto efahamylmoueniflnvzl.
-- Registra o início de atendimento, não comprova o envio de mensagem.
CREATE TABLE IF NOT EXISTS public.commercial_contact_events (
  id uuid PRIMARY KEY,
  lead_id uuid REFERENCES public.commercial_leads(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES public.commercial_users(id) ON DELETE RESTRICT,
  lead_owner_user_id uuid REFERENCES public.commercial_users(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.commercial_units(id) ON DELETE SET NULL,
  demand_type text NOT NULL CHECK (demand_type IN ('opportunity', 'inactive', 'delinquent')),
  event_type text NOT NULL DEFAULT 'scale_started' CHECK (event_type = 'scale_started'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_contact_events_actor_time_idx
  ON public.commercial_contact_events(actor_user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS commercial_contact_events_lead_time_idx
  ON public.commercial_contact_events(lead_id,occurred_at DESC);
ALTER TABLE public.commercial_contact_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_contact_events FROM anon, authenticated;
COMMENT ON TABLE public.commercial_contact_events IS
  'Registra clique de iniciar atendimento no Scale; não indica envio de mensagem.';
