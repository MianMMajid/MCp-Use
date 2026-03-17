-- ============================================================================
-- Mayple Enterprise Upgrade — Idempotent Migration
-- All statements use IF NOT EXISTS / IF NOT EXISTS for safe re-runs.
-- ============================================================================

-- ── Phase 1: RBAC ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  permission_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS custom_roles (
  role_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  permissions_json JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_roles_label ON custom_roles(label);

-- Add custom_role_id to users (safe if column already exists)
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN custom_role_id TEXT REFERENCES custom_roles(role_id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Phase 2: MFA ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_mfa_methods (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'totp',
  secret_encrypted TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, method)
);

CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_methods_user ON user_mfa_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON user_mfa_recovery_codes(user_id);

-- Add mfa_verified to sessions
DO $$ BEGIN
  ALTER TABLE sessions ADD COLUMN mfa_verified BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Phase 3: SSO ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sso_configurations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('saml', 'oidc')),
  domain TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- SAML fields
  entity_id TEXT,
  acs_url TEXT,
  idp_sso_url TEXT,
  idp_certificate TEXT,
  idp_issuer TEXT,
  -- OIDC fields
  oidc_client_id TEXT,
  oidc_client_secret TEXT,
  oidc_authorization_endpoint TEXT,
  oidc_token_endpoint TEXT,
  oidc_jwks_uri TEXT,
  oidc_issuer TEXT,
  -- Common
  auto_provision BOOLEAN NOT NULL DEFAULT TRUE,
  default_role_id TEXT DEFAULT 'member',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_config_domain ON sso_configurations(domain);
CREATE INDEX IF NOT EXISTS idx_sso_config_org ON sso_configurations(org_id);

CREATE TABLE IF NOT EXISTS sso_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  name_id TEXT,
  sso_config_id TEXT NOT NULL,
  sso_session_index TEXT,
  session_not_on_or_after TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON sso_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_session ON sso_sessions(session_id);

-- Add SSO metadata columns to users
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN sso_provider TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN sso_name_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN sso_linked_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN sso_last_login TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN given_name TEXT DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN family_name TEXT DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Phase 4: SCIM ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scim_configurations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL UNIQUE,
  bearer_token_hash TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add SCIM columns to users
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN scim_external_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN scim_active BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique index for SCIM external ID (partial — only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_scim_external_id
  ON users(scim_external_id) WHERE scim_external_id IS NOT NULL;

-- ── Phase 5: Firewall Rules ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS firewall_rules (
  rule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT,
  match_pattern TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'block',
  target TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firewall_rules_org ON firewall_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_enabled ON firewall_rules(enabled, priority);

-- ── Phase 6A: Risk Posture (no new tables — computed at query time) ────────

-- ── Phase 6B: Compliance Framework Mapping ─────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  framework TEXT NOT NULL,
  control_id TEXT NOT NULL,
  control_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_assessed'
    CHECK (status IN ('compliant', 'partial', 'non_compliant', 'not_assessed')),
  evidence_json JSONB DEFAULT '[]',
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(framework, control_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_framework ON compliance_mappings(framework);

-- ── Phase 6C: Shadow Agent Discovery ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS shadow_agents (
  agent_id TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INTEGER DEFAULT 1,
  source TEXT DEFAULT 'audit',
  status TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'acknowledged', 'blocked')),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  blocked_by TEXT,
  blocked_at TIMESTAMPTZ,
  metadata_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_shadow_agents_status ON shadow_agents(status);

-- ── Phase 6D: Policy Version History ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  policy_json JSONB NOT NULL DEFAULT '{}',
  diff_json JSONB DEFAULT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(policy_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, version_number DESC);

-- ── Phase 8: Dashboard Layouts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  layout_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user ON dashboard_layouts(user_id);

-- ── Seed: System Permissions ───────────────────────────────────────────────

INSERT INTO permissions (resource, action) VALUES
  ('org', 'read'), ('org', 'create'), ('org', 'update'), ('org', 'delete'),
  ('org.members', 'read'), ('org.members', 'invite'), ('org.members', 'remove'),
  ('org.roles', 'read'), ('org.roles', 'assign'),
  ('policy', 'read'), ('policy', 'create'), ('policy', 'update'), ('policy', 'delete'), ('policy', 'simulate'),
  ('firewall', 'read'), ('firewall', 'create'), ('firewall', 'update'), ('firewall', 'delete'),
  ('firewall.leakage', 'scan'),
  ('user', 'read'), ('user', 'create'), ('user', 'update'), ('user', 'delete'),
  ('user.mfa', 'manage'), ('user.mfa', 'enforce'),
  ('audit', 'read'), ('audit', 'export'),
  ('trace', 'read'), ('trace', 'share'),
  ('orchestration', 'read'), ('orchestration', 'create'), ('orchestration', 'execute'),
  ('orchestration', 'approve'), ('orchestration', 'cancel'),
  ('integration', 'read'), ('integration', 'connect'), ('integration', 'disconnect'),
  ('apikey', 'read'), ('apikey', 'create'), ('apikey', 'delete'),
  ('service_account', 'read'), ('service_account', 'create'), ('service_account', 'delete'),
  ('sso', 'read'), ('sso', 'configure'),
  ('scim', 'read'), ('scim', 'configure'),
  ('admin', 'access'), ('admin.limits', 'override'),
  ('billing', 'read'), ('billing', 'manage'),
  ('risk', 'read'),
  ('compliance', 'read'), ('compliance', 'update'),
  ('dashboard', 'read'), ('dashboard', 'customize')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Seed: System Roles ─────────────────────────────────────────────────────

INSERT INTO custom_roles (label, org_id, permissions_json, is_system) VALUES
  ('owner', NULL, (
    SELECT jsonb_agg(resource || ':' || action) FROM permissions
  ), TRUE),
  ('admin', NULL, (
    SELECT jsonb_agg(resource || ':' || action) FROM permissions
    WHERE NOT (resource = 'admin.limits' AND action = 'override')
      AND NOT (resource = 'billing' AND action = 'manage')
  ), TRUE),
  ('operator', NULL, '[
    "org:read","org.members:read","org.roles:read",
    "policy:read","policy:simulate",
    "firewall:read","firewall:create","firewall:update","firewall.leakage:scan",
    "user:read",
    "audit:read",
    "trace:read","trace:share",
    "orchestration:read","orchestration:execute","orchestration:approve","orchestration:cancel",
    "integration:read",
    "apikey:read","apikey:create","apikey:delete",
    "risk:read","compliance:read",
    "dashboard:read","dashboard:customize"
  ]'::jsonb, TRUE),
  ('viewer', NULL, (
    SELECT jsonb_agg(resource || ':' || action) FROM permissions WHERE action = 'read'
  ), TRUE),
  ('member', NULL, '[
    "org:read","org.members:read",
    "policy:read","firewall:read",
    "audit:read","trace:read","orchestration:read",
    "apikey:read","apikey:create","apikey:delete",
    "dashboard:read","dashboard:customize"
  ]'::jsonb, TRUE)
ON CONFLICT DO NOTHING;

-- ── Seed: OWASP LLM Top 10 ────────────────────────────────────────────────

INSERT INTO compliance_mappings (framework, control_id, control_name, description, status) VALUES
  ('owasp-llm-top-10', 'LLM01', 'Prompt Injection', 'Manipulating LLMs via crafted inputs to cause unintended actions.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM02', 'Insecure Output Handling', 'Insufficient validation of LLM outputs leading to downstream vulnerabilities.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM03', 'Training Data Poisoning', 'Manipulation of training data to introduce vulnerabilities or biases.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM04', 'Model Denial of Service', 'Resource-heavy operations causing service degradation or high costs.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM05', 'Supply Chain Vulnerabilities', 'Compromised components, training data, or deployment platforms.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM06', 'Sensitive Information Disclosure', 'LLMs revealing confidential data in responses.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM07', 'Insecure Plugin Design', 'LLM plugins with insufficient access controls or input validation.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM08', 'Excessive Agency', 'Granting LLMs too much autonomy leading to unintended actions.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM09', 'Overreliance', 'Uncritical dependence on LLM outputs without verification.', 'not_assessed'),
  ('owasp-llm-top-10', 'LLM10', 'Model Theft', 'Unauthorized access or extraction of proprietary LLM models.', 'not_assessed')
ON CONFLICT (framework, control_id) DO NOTHING;

-- ── Done ───────────────────────────────────────────────────────────────────
