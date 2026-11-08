-- Executar no SQL Editor do Supabase do Leads Comercial.
-- A data combinada para pagamento é diferente do fim do último contrato.
ALTER TABLE public.commercial_delinquent_items
  ADD COLUMN IF NOT EXISTS promised_payment_date date NULL;

CREATE INDEX IF NOT EXISTS commercial_delinquent_items_promised_date_idx
  ON public.commercial_delinquent_items(promised_payment_date)
  WHERE promised_payment_date IS NOT NULL;

COMMENT ON COLUMN public.commercial_delinquent_items.promised_payment_date IS
  'Data de pagamento prometida pelo cliente; não comprova quitação.';
