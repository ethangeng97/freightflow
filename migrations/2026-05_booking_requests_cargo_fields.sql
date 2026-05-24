-- BookingRequest 补字段：HS 码 / 中英文品名 / 唛头
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS hs_code TEXT,
  ADD COLUMN IF NOT EXISTS cn_name TEXT,
  ADD COLUMN IF NOT EXISTS en_name TEXT,
  ADD COLUMN IF NOT EXISTS marks   TEXT;
