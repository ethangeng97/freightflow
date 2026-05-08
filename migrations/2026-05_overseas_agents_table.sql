-- New master table for 海外代理 (overseas agents). Currently one entry: KEPLIN GROUP LIMITED.
-- Mirrors end_customers shape + RLS posture.

CREATE TABLE IF NOT EXISTS overseas_agents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE overseas_agents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read.
DROP POLICY IF EXISTS overseas_agents_select ON overseas_agents;
CREATE POLICY overseas_agents_select ON overseas_agents
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- admin/operator can write.
DROP POLICY IF EXISTS overseas_agents_admin ON overseas_agents;
CREATE POLICY overseas_agents_admin ON overseas_agents
  FOR ALL
  USING ("current_role"() = ANY (ARRAY['admin','operator']))
  WITH CHECK ("current_role"() = ANY (ARRAY['admin','operator']));

-- Seed the only known agent today.
INSERT INTO overseas_agents (name) VALUES ('KEPLIN GROUP LIMITED')
ON CONFLICT (name) DO NOTHING;
