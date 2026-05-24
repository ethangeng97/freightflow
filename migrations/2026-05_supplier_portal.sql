-- ============================================================
-- Supplier Portal — DB foundation
--   * Add 'supplier' role to user_profiles
--   * Link supplier users to a customers row (customer_id FK)
--   * New tables: booking_requests, payment_vouchers, telex_release_requests
--   * RLS: a supplier sees ONLY rows where customer_id = their user_profiles.customer_id
--
-- All statements are IF NOT EXISTS / idempotent so it's safe to re-run.
-- Apply manually to the Supabase project (no migration runner — see CLAUDE.md).
-- ============================================================

-- ---------- 1. user_profiles: add customer_id + allow supplier role ----------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_customer_id
  ON public.user_profiles(customer_id);

-- The role column in user_profiles is plain text (no enum). 'supplier' is just
-- another allowed value. If there is a CHECK constraint enforcing the role list,
-- it needs to be widened here — wrapped in DO block so re-runs don't fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_role_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check;
  END IF;
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin','operator','sales','customer','supplier','finance'));
END $$;

-- Helper: returns the customer_id bound to the current auth.uid().
-- Used by RLS policies on shipments/bills/invoices/etc.
CREATE OR REPLACE FUNCTION public.current_user_customer_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT customer_id FROM public.user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ---------- 2. booking_requests ----------
-- Factory submits a booking; ops reviews → converts to a real shipments row.
CREATE TABLE IF NOT EXISTS public.booking_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES public.customers(id),
  submitted_by   UUID REFERENCES auth.users(id),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','withdrawn')),
  -- Booking core fields (mirror minimal shipments columns the factory cares about)
  pol            TEXT,
  pod            TEXT,
  etd            DATE,
  carrier        TEXT,
  service        TEXT,
  trade_type     TEXT,           -- FCL / LCL / Console
  container_type TEXT,           -- 20GP / 40GP / 40HQ ...
  container_qty  INT,
  cargo_desc     TEXT,
  gross_weight   NUMERIC,
  volume_cbm     NUMERIC,
  remarks        TEXT,
  -- Review + linkage
  reviewed_by    UUID REFERENCES auth.users(id),
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  shipment_id    UUID REFERENCES public.shipments(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_requests_customer ON public.booking_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status   ON public.booking_requests(status);

-- ---------- 3. payment_vouchers ----------
-- Factory uploads a wire-transfer proof; ops verifies and write-off marks a bill paid.
CREATE TABLE IF NOT EXISTS public.payment_vouchers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES public.customers(id),
  submitted_by UUID REFERENCES auth.users(id),
  -- Optional link to a specific bill (one voucher can settle multiple bills via a junction
  -- table if needed later; keep flat for v1)
  bill_id      UUID,            -- soft ref to bills.id (no FK; bills owned by bansar-ops)
  shipment_id  UUID REFERENCES public.shipments(id),
  amount       NUMERIC NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  paid_at      DATE,
  file_url     TEXT,            -- supabase storage path
  file_name    TEXT,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','rejected')),
  reviewed_by  UUID REFERENCES auth.users(id),
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_customer ON public.payment_vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_status   ON public.payment_vouchers(status);

-- ---------- 4. telex_release_requests ----------
CREATE TABLE IF NOT EXISTS public.telex_release_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES public.customers(id),
  submitted_by UUID REFERENCES auth.users(id),
  shipment_id  UUID NOT NULL REFERENCES public.shipments(id),
  reason       TEXT,            -- factory's reason (eg. consignee paid in full)
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  UUID REFERENCES auth.users(id),
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telex_release_customer ON public.telex_release_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_telex_release_shipment ON public.telex_release_requests(shipment_id);

-- ---------- 5. RLS ----------
ALTER TABLE public.booking_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_vouchers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telex_release_requests  ENABLE ROW LEVEL SECURITY;

-- Drop old policies before re-creating (idempotent re-run)
DROP POLICY IF EXISTS supplier_rw_own_booking_requests        ON public.booking_requests;
DROP POLICY IF EXISTS internal_rw_all_booking_requests        ON public.booking_requests;
DROP POLICY IF EXISTS supplier_rw_own_payment_vouchers        ON public.payment_vouchers;
DROP POLICY IF EXISTS internal_rw_all_payment_vouchers        ON public.payment_vouchers;
DROP POLICY IF EXISTS supplier_rw_own_telex_release_requests  ON public.telex_release_requests;
DROP POLICY IF EXISTS internal_rw_all_telex_release_requests  ON public.telex_release_requests;

-- Supplier: rows where customer_id matches their profile
CREATE POLICY supplier_rw_own_booking_requests ON public.booking_requests
  FOR ALL TO authenticated
  USING (customer_id = public.current_user_customer_id())
  WITH CHECK (customer_id = public.current_user_customer_id());

CREATE POLICY supplier_rw_own_payment_vouchers ON public.payment_vouchers
  FOR ALL TO authenticated
  USING (customer_id = public.current_user_customer_id())
  WITH CHECK (customer_id = public.current_user_customer_id());

CREATE POLICY supplier_rw_own_telex_release_requests ON public.telex_release_requests
  FOR ALL TO authenticated
  USING (customer_id = public.current_user_customer_id())
  WITH CHECK (customer_id = public.current_user_customer_id());

-- Internal roles (admin/operator/sales/finance) see everything
CREATE POLICY internal_rw_all_booking_requests ON public.booking_requests
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));

CREATE POLICY internal_rw_all_payment_vouchers ON public.payment_vouchers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));

CREATE POLICY internal_rw_all_telex_release_requests ON public.telex_release_requests
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));

-- ---------- 6. Extend shipments RLS so supplier sees only their own ----------
-- NOTE: this assumes a 'shipments' RLS policy exists for internal roles already.
-- We just add a supplier-scoped read policy here. Adjust if existing policies conflict.
DROP POLICY IF EXISTS supplier_read_own_shipments ON public.shipments;
CREATE POLICY supplier_read_own_shipments ON public.shipments
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'supplier'
    AND customer_id = public.current_user_customer_id()
  );

-- ---------- 7. Storage bucket for payment vouchers ----------
-- Create the bucket via Supabase dashboard (Storage → New bucket → "vouchers", private).
-- Then run this policy block:
--
--   CREATE POLICY supplier_upload_own_voucher ON storage.objects
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       bucket_id = 'vouchers'
--       AND (storage.foldername(name))[1] = public.current_user_customer_id()::text
--     );
--   CREATE POLICY supplier_read_own_voucher ON storage.objects
--     FOR SELECT TO authenticated
--     USING (
--       bucket_id = 'vouchers'
--       AND (
--         (storage.foldername(name))[1] = public.current_user_customer_id()::text
--         OR public.current_user_role() IN ('admin','operator','finance')
--       )
--     );
