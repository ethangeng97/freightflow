-- Supplier-uploaded shipment documents (B/L, Commercial Invoice, Packing List, MSDS, FCR, COO, etc.)
-- 文件存 Supabase Storage bucket `shipment-docs`，按 customer_id 分目录
-- 这张表只存元数据

CREATE TABLE IF NOT EXISTS public.shipment_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES public.customers(id),
  doc_type     TEXT NOT NULL,           -- BL / CI / PL / MSDS / FCR / COO / OTHER
  file_url     TEXT NOT NULL,           -- supabase storage path
  file_name    TEXT NOT NULL,
  note         TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipment_documents_shipment ON public.shipment_documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_documents_customer ON public.shipment_documents(customer_id);

ALTER TABLE public.shipment_documents ENABLE ROW LEVEL SECURITY;

-- supplier 只能读写自己的
DROP POLICY IF EXISTS supplier_rw_own_shipment_docs ON public.shipment_documents;
CREATE POLICY supplier_rw_own_shipment_docs ON public.shipment_documents
  FOR ALL TO authenticated
  USING      (customer_id = public.current_user_customer_id())
  WITH CHECK (customer_id = public.current_user_customer_id());

-- 内部员工全部可读写
DROP POLICY IF EXISTS internal_rw_all_shipment_docs ON public.shipment_documents;
CREATE POLICY internal_rw_all_shipment_docs ON public.shipment_documents
  FOR ALL TO authenticated
  USING      (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));
