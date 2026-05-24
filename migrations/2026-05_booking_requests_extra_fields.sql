-- BookingRequest 补字段：
--   PO 号 / 货好时间 / 件数 / 包装单位
--   shipper / consignee / notify 信息
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS po               TEXT,
  ADD COLUMN IF NOT EXISTS cargo_ready_date DATE,
  ADD COLUMN IF NOT EXISTS qty_packages     INT,
  ADD COLUMN IF NOT EXISTS packing_unit     TEXT,
  ADD COLUMN IF NOT EXISTS shipper          TEXT,
  ADD COLUMN IF NOT EXISTS consignee        TEXT,
  ADD COLUMN IF NOT EXISTS notify_party     TEXT;
