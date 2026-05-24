-- 电放申请补字段：提单号 + 电放保函附件
ALTER TABLE public.telex_release_requests
  ADD COLUMN IF NOT EXISTS bl_no              TEXT,
  ADD COLUMN IF NOT EXISTS guarantee_file_url TEXT,
  ADD COLUMN IF NOT EXISTS guarantee_file_name TEXT;
