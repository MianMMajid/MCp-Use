
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const NVIDIA_API_KEY: string;
	export const CYBER_QUARANTINE_ENABLED: string;
	export const NVM_INC: string;
	export const MAPLE_FIREWALL_DEFAULT_ACTION: string;
	export const MAPLE_FIREWALL_CHAT_OPENAI_MODEL: string;
	export const MAPLE_MCP_PROXY_ALLOWED_HOSTS: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const MAPLE_VIRUSTOTAL_ANALYSIS_POLL_ATTEMPTS: string;
	export const DOWNSTREAM_APPS: string;
	export const MAPLE_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: string;
	export const MAPLE_AUDIT_WRITER_HTTP_ORIGIN: string;
	export const SENDGRID_API_KEY: string;
	export const VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const MAPLE_BUSINESS_API_TLS_CERT: string;
	export const MAPLE_SCIM_RATE_LIMIT_PER_ORG: string;
	export const NODE: string;
	export const OPENCLAW_BRIDGE_URL: string;
	export const NVM_CD_FLAGS: string;
	export const INIT_CWD: string;
	export const MAPLE_MCP_ROUTE_LOCK: string;
	export const MCP_URL: string;
	export const SHELL: string;
	export const MAPLE_SSO_ACS_URL: string;
	export const MAPLE_OPENCLAW_AGENT_DEV_PROFILE: string;
	export const OPENCLAW_BRIDGE_HOST: string;
	export const MAPLE_VIRUSTOTAL_UPLOAD_FALLBACK: string;
	export const CYBER_TOOL_ALLOWED_DOMAINS_JSON: string;
	export const AUDIT_WRITER_ADDRESS: string;
	export const MODEL_ROUTER_ADDRESS: string;
	export const STRIPE_WEBHOOK_SECRET: string;
	export const TMPDIR: string;
	export const MAPLE_TOOL_RUNNER_MODE: string;
	export const MAPLE_SSO_SP_ENTITY_ID: string;
	export const MAPLE_REDIS_URL: string;
	export const npm_config_global_prefix: string;
	export const MAPLE_ADMIN_ALLOW_NO_AUTH: string;
	export const MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING: string;
	export const MAPLE_RECOVERY_SMS_TO: string;
	export const MAPLE_OPENCLAW_MODIFIER_ENABLED: string;
	export const MAPLE_LOCK_BRIDGE_TARGET: string;
	export const NODE_OPTIONS: string;
	export const CYBER_ALLOWED_DOMAINS: string;
	export const CYBER_PROXY_PORT: string;
	export const MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS: string;
	export const MAPLE_OPENCLAW_AGENT_GATEWAY_BIND: string;
	export const MAPLE_MCP_PROXY_ALLOW_HTTP: string;
	export const MallocNanoZone: string;
	export const CLAUDE_AGENT_SDK_VERSION: string;
	export const MAPLE_GRPC_TLS_CERT: string;
	export const MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY: string;
	export const MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC: string;
	export const MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES: string;
	export const MAPLE_SESSION_POLL_MS: string;
	export const COLOR: string;
	export const MAPLE_DOWNLOAD_SCAN_PROVIDER: string;
	export const MAPLE_OTLP_TIMEOUT_MS: string;
	export const MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID: string;
	export const MAPLE_SESSION_COOKIE_DOMAIN: string;
	export const npm_config_noproxy: string;
	export const MAPLE_OTLP_SERVICE_NAME: string;
	export const GATEWAY_HOST: string;
	export const npm_config_local_prefix: string;
	export const MAPLE_ENABLE_JUDGE_UI: string;
	export const GIT_EDITOR: string;
	export const MAPLE_TOOL_RUNNER_JOB_NAMESPACE: string;
	export const MCP_PROXY_PORT: string;
	export const MAPLE_OTLP_ENDPOINT: string;
	export const MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE: string;
	export const NVM_DIR: string;
	export const USER: string;
	export const MAPLE_NEMOCLAW_SANDBOX_NAME: string;
	export const MAPLE_BUSINESS_API_TLS_CA: string;
	export const MAPLE_MFA_ENFORCE_FOR_ADMINS: string;
	export const TOOL_RUNNER_ADDRESS: string;
	export const MAPLE_ALLOW_BRIDGE_OVERRIDE: string;
	export const MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL: string;
	export const MAPLE_TENANT_CLAIM_SIGNING_KEY: string;
	export const MAPLE_OTLP_FLUSH_INTERVAL_MS: string;
	export const MAPLE_GATEWAY_TLS_CERT: string;
	export const OPENAI_API_KEY: string;
	export const COMMAND_MODE: string;
	export const npm_config_globalconfig: string;
	export const MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE: string;
	export const MAPLE_RECOVERY_VERIFY_BASE_URL: string;
	export const MAPLE_NEMOCLAW_ENABLED: string;
	export const MAPLE_AUTH_ALLOW_SELF_SIGNUP: string;
	export const SSH_AUTH_SOCK: string;
	export const CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
	export const MAPLE_NVIDIA_BASE_URL: string;
	export const MAPLE_RECOVERY_SMS_PROVIDER: string;
	export const MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES: string;
	export const OPENCLAW_BRIDGE_MODE: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const MCP_PROXY_ADDRESS: string;
	export const MAPLE_LOG_INCLUDE_BODIES: string;
	export const npm_execpath: string;
	export const MAPLE_DOWNSTREAM_APPS: string;
	export const MAPLE_INTEGRATION_OAUTH_STATE_SECRET: string;
	export const MAPLE_FIREWALL_LOG_DIR: string;
	export const MAPLE_LOG_REQUESTS: string;
	export const VIRTUAL_ENV: string;
	export const MAPLE_ADMIN_TLS_CERT: string;
	export const ELECTRON_RUN_AS_NODE: string;
	export const MAPLE_DISABLE_TLS: string;
	export const CORS_ORIGIN: string;
	export const MAPLE_RECOVERY_EMAIL_REPLY_TO: string;
	export const MAPLE_VIRUSTOTAL_ANALYSIS_POLL_DELAY_MS: string;
	export const CONTEXT_WALL_HOST: string;
	export const MAPLE_CREDENTIAL_SIGNING_KEY: string;
	export const MAPLE_EVENT_TRANSPORT_BACKEND: string;
	export const MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS: string;
	export const OPENCLAW_GATEWAY_WS_URL: string;
	export const MAPLE_PRINT_SECRETS: string;
	export const PATH: string;
	export const CYBER_ALLOW_LOCAL_TARGETS: string;
	export const AUDIT_WRITER_HOST: string;
	export const MCP_CONNECTION_NONBLOCKING: string;
	export const npm_package_bin_maple: string;
	export const LaunchInstanceID: string;
	export const npm_package_json: string;
	export const MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY: string;
	export const MAPLE_MFA_ENCRYPTION_KEY: string;
	export const __CFBundleIdentifier: string;
	export const npm_config_init_module: string;
	export const npm_config_userconfig: string;
	export const MAPLE_RECOVERY_EMAIL_FROM: string;
	export const DEFAULT_MODEL: string;
	export const AUDIT_WRITER_PORT: string;
	export const MAPLE_GATEWAY_ORIGIN: string;
	export const STRIPE_PRICE_ENTERPRISE: string;
	export const PWD: string;
	export const npm_command: string;
	export const AUDIT_WRITER_HTTP_PORT: string;
	export const MAPLE_OTLP_BATCH_SIZE: string;
	export const MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW: string;
	export const MAPLE_ADMIN_USERNAME: string;
	export const VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
	export const CYBER_PROXY_ADDRESS: string;
	export const MAPLE_OPENCLAW_AGENT_ENABLED: string;
	export const STRIPE_PUBLISHABLE_KEY: string;
	export const VSCODE_ESM_ENTRYPOINT: string;
	export const OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
	export const EDITOR: string;
	export const npm_lifecycle_event: string;
	export const CYBER_BLOCKED_DOMAINS: string;
	export const SECRETS_BROKER_ADDRESS: string;
	export const MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE: string;
	export const GATEWAY_PORT: string;
	export const MAPLE_ENABLE_DEMO_ROUTES: string;
	export const LANG: string;
	export const npm_package_name: string;
	export const STRIPE_PRICE_PRO: string;
	export const CYBER_MAX_RESPONSE_BYTES: string;
	export const MAPLE_FIREWALL_CHAT_TIMEOUT_MS: string;
	export const MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS: string;
	export const MAPLE_TOOL_RUNNER_IMAGE: string;
	export const CYBER_PROXY_HOST: string;
	export const MAPLE_SESSION_COOKIE_NAME: string;
	export const STRIPE_PRICE_TEAM: string;
	export const XPC_FLAGS: string;
	export const npm_config_npm_version: string;
	export const OPENCLAW_BRIDGE_REQUIRE_AUTH: string;
	export const RESEND_API_KEY: string;
	export const MAPLE_DISABLE_AUDIT_EMIT: string;
	export const MAPLE_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: string;
	export const MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS: string;
	export const NODE_ENV: string;
	export const TWILIO_ACCOUNT_SID: string;
	export const ANTHROPIC_API_KEY: string;
	export const MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
	export const NODE_TLS_REJECT_UNAUTHORIZED: string;
	export const MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS: string;
	export const STRIPE_SECRET_KEY: string;
	export const npm_config_node_gyp: string;
	export const MAPLE_SKIP_AUTH_BOOTSTRAP: string;
	export const MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS: string;
	export const MAPLE_MCP_FIREWALL_DEFAULT_APP: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_package_version: string;
	export const MAPLE_VIRUSTOTAL_UPLOAD_ALLOWED_DOMAINS: string;
	export const MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS: string;
	export const MAPLE_OPENCLAW_AGENT_GATEWAY_PORT: string;
	export const MAPLE_FIREWALL_CHAT_NVIDIA_MODEL: string;
	export const MAPLE_MCP_PROXY_DEFAULT_TARGET_URL: string;
	export const HOME: string;
	export const SHLVL: string;
	export const CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
	export const MCP_PROXY_HOST: string;
	export const MAPLE_RETENTION_CHECK_INTERVAL_MS: string;
	export const MAPLE_GATEWAY_TLS_KEY: string;
	export const MAPLE_LOG_BODY_MAX_CHARS: string;
	export const OPENCLAW_GATEWAY_SESSION_KEY: string;
	export const MAPLE_GRPC_TLS_CA: string;
	export const MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX: string;
	export const VSCODE_NLS_CONFIG: string;
	export const MAPLE_GRPC_TLS_KEY: string;
	export const MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL: string;
	export const MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: string;
	export const MAPLE_GPT_OAUTH_CLIENT_SECRET: string;
	export const MAPLE_ADMIN_API_KEYS: string;
	export const MAPLE_SESSION_TTL_SECONDS: string;
	export const MAPLE_GATEWAY_TLS_CA: string;
	export const MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER: string;
	export const MAPLE_ALLOW_NO_AUTH: string;
	export const OPENCLAW_BRIDGE_PORT: string;
	export const MAPLE_BUSINESS_API_TLS_KEY: string;
	export const MAPLE_LEADER_ELECTION_ENABLED: string;
	export const MAPLE_ESCALATION_CHECK_INTERVAL_MS: string;
	export const MAPLE_RECOVERY_RESET_BASE_URL: string;
	export const LOGNAME: string;
	export const npm_config_cache: string;
	export const DEV_FAST_OPENCLAW: string;
	export const npm_lifecycle_script: string;
	export const MAPLE_ADMIN_PASSWORD: string;
	export const VSCODE_CODE_CACHE_PATH: string;
	export const VSCODE_IPC_HOOK: string;
	export const MAPLE_NEMOCLAW_AUTO_ONBOARD: string;
	export const MAPLE_SESSION_POLL: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS: string;
	export const MAPLE_LOG_LEVEL: string;
	export const NVM_BIN: string;
	export const MAPLE_RECOVERY_SMS_FROM: string;
	export const MAPLE_OPENCLAW_AGENT_MEDIATION_ENABLED: string;
	export const MAPLE_DISABLE_HITL_BROKER: string;
	export const MAPLE_FIREWALL_CHAT_PRIMARY: string;
	export const MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS: string;
	export const MAPLE_FIREWALL_ENABLED: string;
	export const VSCODE_PID: string;
	export const npm_config_user_agent: string;
	export const MAPLE_ADMIN_TLS_KEY: string;
	export const CONTEXT_WALL_ADDRESS: string;
	export const MAPLE_FIREWALL_CHAT_STRICT_MODE: string;
	export const MAPLE_OPENCLAW_AGENT_MODE: string;
	export const OPENCLAW_BRIDGE_TOKEN: string;
	export const MAPLE_RECOVERY_EMAIL_PROVIDER: string;
	export const MAPLE_RECOVERY_DELIVERY_REQUIRED: string;
	export const CYBER_ALLOWED_LOCAL_HOSTS: string;
	export const CONTEXT_WALL_PORT: string;
	export const MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE: string;
	export const MAPLE_OPENCLAW_AGENT_REQUIRED: string;
	export const MAPLE_SESSION_OWNER_SCOPE: string;
	export const MAPLE_GPT_OAUTH_CLIENT_ID: string;
	export const OSLogRateLimit: string;
	export const MAPLE_ADMIN_TLS_CA: string;
	export const MAPLE_MCP_EXECUTION_ORDER: string;
	export const MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS: string;
	export const CONTEXT_WALL_HITL_TIMEOUT_MS: string;
	export const DATABASE_URL: string;
	export const SECURITYSESSIONID: string;
	export const VSCODE_CWD: string;
	export const VSCODE_L10N_BUNDLE_LOCATION: string;
	export const CLAUDECODE: string;
	export const MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX: string;
	export const MAPLE_MODIFIER_GOVERNANCE_ENABLED: string;
	export const MAPLE_API_KEY: string;
	export const TWILIO_AUTH_TOKEN: string;
	export const MAPLE_OPENCLAW_AGENT_REQUIRE_VIRUSTOTAL: string;
	export const MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB: string;
	export const GOOGLE_CLIENT_ID: string;
	export const npm_config_prefix: string;
	export const npm_node_execpath: string;
	export const _: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		NVIDIA_API_KEY: string;
		CYBER_QUARANTINE_ENABLED: string;
		NVM_INC: string;
		MAPLE_FIREWALL_DEFAULT_ACTION: string;
		MAPLE_FIREWALL_CHAT_OPENAI_MODEL: string;
		MAPLE_MCP_PROXY_ALLOWED_HOSTS: string;
		NoDefaultCurrentDirectoryInExePath: string;
		MAPLE_VIRUSTOTAL_ANALYSIS_POLL_ATTEMPTS: string;
		DOWNSTREAM_APPS: string;
		MAPLE_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: string;
		MAPLE_AUDIT_WRITER_HTTP_ORIGIN: string;
		SENDGRID_API_KEY: string;
		VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		MAPLE_BUSINESS_API_TLS_CERT: string;
		MAPLE_SCIM_RATE_LIMIT_PER_ORG: string;
		NODE: string;
		OPENCLAW_BRIDGE_URL: string;
		NVM_CD_FLAGS: string;
		INIT_CWD: string;
		MAPLE_MCP_ROUTE_LOCK: string;
		MCP_URL: string;
		SHELL: string;
		MAPLE_SSO_ACS_URL: string;
		MAPLE_OPENCLAW_AGENT_DEV_PROFILE: string;
		OPENCLAW_BRIDGE_HOST: string;
		MAPLE_VIRUSTOTAL_UPLOAD_FALLBACK: string;
		CYBER_TOOL_ALLOWED_DOMAINS_JSON: string;
		AUDIT_WRITER_ADDRESS: string;
		MODEL_ROUTER_ADDRESS: string;
		STRIPE_WEBHOOK_SECRET: string;
		TMPDIR: string;
		MAPLE_TOOL_RUNNER_MODE: string;
		MAPLE_SSO_SP_ENTITY_ID: string;
		MAPLE_REDIS_URL: string;
		npm_config_global_prefix: string;
		MAPLE_ADMIN_ALLOW_NO_AUTH: string;
		MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING: string;
		MAPLE_RECOVERY_SMS_TO: string;
		MAPLE_OPENCLAW_MODIFIER_ENABLED: string;
		MAPLE_LOCK_BRIDGE_TARGET: string;
		NODE_OPTIONS: string;
		CYBER_ALLOWED_DOMAINS: string;
		CYBER_PROXY_PORT: string;
		MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS: string;
		MAPLE_OPENCLAW_AGENT_GATEWAY_BIND: string;
		MAPLE_MCP_PROXY_ALLOW_HTTP: string;
		MallocNanoZone: string;
		CLAUDE_AGENT_SDK_VERSION: string;
		MAPLE_GRPC_TLS_CERT: string;
		MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY: string;
		MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC: string;
		MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES: string;
		MAPLE_SESSION_POLL_MS: string;
		COLOR: string;
		MAPLE_DOWNLOAD_SCAN_PROVIDER: string;
		MAPLE_OTLP_TIMEOUT_MS: string;
		MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID: string;
		MAPLE_SESSION_COOKIE_DOMAIN: string;
		npm_config_noproxy: string;
		MAPLE_OTLP_SERVICE_NAME: string;
		GATEWAY_HOST: string;
		npm_config_local_prefix: string;
		MAPLE_ENABLE_JUDGE_UI: string;
		GIT_EDITOR: string;
		MAPLE_TOOL_RUNNER_JOB_NAMESPACE: string;
		MCP_PROXY_PORT: string;
		MAPLE_OTLP_ENDPOINT: string;
		MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE: string;
		NVM_DIR: string;
		USER: string;
		MAPLE_NEMOCLAW_SANDBOX_NAME: string;
		MAPLE_BUSINESS_API_TLS_CA: string;
		MAPLE_MFA_ENFORCE_FOR_ADMINS: string;
		TOOL_RUNNER_ADDRESS: string;
		MAPLE_ALLOW_BRIDGE_OVERRIDE: string;
		MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL: string;
		MAPLE_TENANT_CLAIM_SIGNING_KEY: string;
		MAPLE_OTLP_FLUSH_INTERVAL_MS: string;
		MAPLE_GATEWAY_TLS_CERT: string;
		OPENAI_API_KEY: string;
		COMMAND_MODE: string;
		npm_config_globalconfig: string;
		MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE: string;
		MAPLE_RECOVERY_VERIFY_BASE_URL: string;
		MAPLE_NEMOCLAW_ENABLED: string;
		MAPLE_AUTH_ALLOW_SELF_SIGNUP: string;
		SSH_AUTH_SOCK: string;
		CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
		MAPLE_NVIDIA_BASE_URL: string;
		MAPLE_RECOVERY_SMS_PROVIDER: string;
		MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES: string;
		OPENCLAW_BRIDGE_MODE: string;
		__CF_USER_TEXT_ENCODING: string;
		MCP_PROXY_ADDRESS: string;
		MAPLE_LOG_INCLUDE_BODIES: string;
		npm_execpath: string;
		MAPLE_DOWNSTREAM_APPS: string;
		MAPLE_INTEGRATION_OAUTH_STATE_SECRET: string;
		MAPLE_FIREWALL_LOG_DIR: string;
		MAPLE_LOG_REQUESTS: string;
		VIRTUAL_ENV: string;
		MAPLE_ADMIN_TLS_CERT: string;
		ELECTRON_RUN_AS_NODE: string;
		MAPLE_DISABLE_TLS: string;
		CORS_ORIGIN: string;
		MAPLE_RECOVERY_EMAIL_REPLY_TO: string;
		MAPLE_VIRUSTOTAL_ANALYSIS_POLL_DELAY_MS: string;
		CONTEXT_WALL_HOST: string;
		MAPLE_CREDENTIAL_SIGNING_KEY: string;
		MAPLE_EVENT_TRANSPORT_BACKEND: string;
		MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS: string;
		OPENCLAW_GATEWAY_WS_URL: string;
		MAPLE_PRINT_SECRETS: string;
		PATH: string;
		CYBER_ALLOW_LOCAL_TARGETS: string;
		AUDIT_WRITER_HOST: string;
		MCP_CONNECTION_NONBLOCKING: string;
		npm_package_bin_maple: string;
		LaunchInstanceID: string;
		npm_package_json: string;
		MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY: string;
		MAPLE_MFA_ENCRYPTION_KEY: string;
		__CFBundleIdentifier: string;
		npm_config_init_module: string;
		npm_config_userconfig: string;
		MAPLE_RECOVERY_EMAIL_FROM: string;
		DEFAULT_MODEL: string;
		AUDIT_WRITER_PORT: string;
		MAPLE_GATEWAY_ORIGIN: string;
		STRIPE_PRICE_ENTERPRISE: string;
		PWD: string;
		npm_command: string;
		AUDIT_WRITER_HTTP_PORT: string;
		MAPLE_OTLP_BATCH_SIZE: string;
		MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW: string;
		MAPLE_ADMIN_USERNAME: string;
		VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
		CYBER_PROXY_ADDRESS: string;
		MAPLE_OPENCLAW_AGENT_ENABLED: string;
		STRIPE_PUBLISHABLE_KEY: string;
		VSCODE_ESM_ENTRYPOINT: string;
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
		EDITOR: string;
		npm_lifecycle_event: string;
		CYBER_BLOCKED_DOMAINS: string;
		SECRETS_BROKER_ADDRESS: string;
		MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE: string;
		GATEWAY_PORT: string;
		MAPLE_ENABLE_DEMO_ROUTES: string;
		LANG: string;
		npm_package_name: string;
		STRIPE_PRICE_PRO: string;
		CYBER_MAX_RESPONSE_BYTES: string;
		MAPLE_FIREWALL_CHAT_TIMEOUT_MS: string;
		MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS: string;
		MAPLE_TOOL_RUNNER_IMAGE: string;
		CYBER_PROXY_HOST: string;
		MAPLE_SESSION_COOKIE_NAME: string;
		STRIPE_PRICE_TEAM: string;
		XPC_FLAGS: string;
		npm_config_npm_version: string;
		OPENCLAW_BRIDGE_REQUIRE_AUTH: string;
		RESEND_API_KEY: string;
		MAPLE_DISABLE_AUDIT_EMIT: string;
		MAPLE_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: string;
		MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS: string;
		NODE_ENV: string;
		TWILIO_ACCOUNT_SID: string;
		ANTHROPIC_API_KEY: string;
		MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
		NODE_TLS_REJECT_UNAUTHORIZED: string;
		MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS: string;
		STRIPE_SECRET_KEY: string;
		npm_config_node_gyp: string;
		MAPLE_SKIP_AUTH_BOOTSTRAP: string;
		MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS: string;
		MAPLE_MCP_FIREWALL_DEFAULT_APP: string;
		XPC_SERVICE_NAME: string;
		npm_package_version: string;
		MAPLE_VIRUSTOTAL_UPLOAD_ALLOWED_DOMAINS: string;
		MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS: string;
		MAPLE_OPENCLAW_AGENT_GATEWAY_PORT: string;
		MAPLE_FIREWALL_CHAT_NVIDIA_MODEL: string;
		MAPLE_MCP_PROXY_DEFAULT_TARGET_URL: string;
		HOME: string;
		SHLVL: string;
		CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
		MCP_PROXY_HOST: string;
		MAPLE_RETENTION_CHECK_INTERVAL_MS: string;
		MAPLE_GATEWAY_TLS_KEY: string;
		MAPLE_LOG_BODY_MAX_CHARS: string;
		OPENCLAW_GATEWAY_SESSION_KEY: string;
		MAPLE_GRPC_TLS_CA: string;
		MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX: string;
		VSCODE_NLS_CONFIG: string;
		MAPLE_GRPC_TLS_KEY: string;
		MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL: string;
		MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: string;
		MAPLE_GPT_OAUTH_CLIENT_SECRET: string;
		MAPLE_ADMIN_API_KEYS: string;
		MAPLE_SESSION_TTL_SECONDS: string;
		MAPLE_GATEWAY_TLS_CA: string;
		MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER: string;
		MAPLE_ALLOW_NO_AUTH: string;
		OPENCLAW_BRIDGE_PORT: string;
		MAPLE_BUSINESS_API_TLS_KEY: string;
		MAPLE_LEADER_ELECTION_ENABLED: string;
		MAPLE_ESCALATION_CHECK_INTERVAL_MS: string;
		MAPLE_RECOVERY_RESET_BASE_URL: string;
		LOGNAME: string;
		npm_config_cache: string;
		DEV_FAST_OPENCLAW: string;
		npm_lifecycle_script: string;
		MAPLE_ADMIN_PASSWORD: string;
		VSCODE_CODE_CACHE_PATH: string;
		VSCODE_IPC_HOOK: string;
		MAPLE_NEMOCLAW_AUTO_ONBOARD: string;
		MAPLE_SESSION_POLL: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS: string;
		MAPLE_LOG_LEVEL: string;
		NVM_BIN: string;
		MAPLE_RECOVERY_SMS_FROM: string;
		MAPLE_OPENCLAW_AGENT_MEDIATION_ENABLED: string;
		MAPLE_DISABLE_HITL_BROKER: string;
		MAPLE_FIREWALL_CHAT_PRIMARY: string;
		MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS: string;
		MAPLE_FIREWALL_ENABLED: string;
		VSCODE_PID: string;
		npm_config_user_agent: string;
		MAPLE_ADMIN_TLS_KEY: string;
		CONTEXT_WALL_ADDRESS: string;
		MAPLE_FIREWALL_CHAT_STRICT_MODE: string;
		MAPLE_OPENCLAW_AGENT_MODE: string;
		OPENCLAW_BRIDGE_TOKEN: string;
		MAPLE_RECOVERY_EMAIL_PROVIDER: string;
		MAPLE_RECOVERY_DELIVERY_REQUIRED: string;
		CYBER_ALLOWED_LOCAL_HOSTS: string;
		CONTEXT_WALL_PORT: string;
		MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE: string;
		MAPLE_OPENCLAW_AGENT_REQUIRED: string;
		MAPLE_SESSION_OWNER_SCOPE: string;
		MAPLE_GPT_OAUTH_CLIENT_ID: string;
		OSLogRateLimit: string;
		MAPLE_ADMIN_TLS_CA: string;
		MAPLE_MCP_EXECUTION_ORDER: string;
		MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS: string;
		CONTEXT_WALL_HITL_TIMEOUT_MS: string;
		DATABASE_URL: string;
		SECURITYSESSIONID: string;
		VSCODE_CWD: string;
		VSCODE_L10N_BUNDLE_LOCATION: string;
		CLAUDECODE: string;
		MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX: string;
		MAPLE_MODIFIER_GOVERNANCE_ENABLED: string;
		MAPLE_API_KEY: string;
		TWILIO_AUTH_TOKEN: string;
		MAPLE_OPENCLAW_AGENT_REQUIRE_VIRUSTOTAL: string;
		MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB: string;
		GOOGLE_CLIENT_ID: string;
		npm_config_prefix: string;
		npm_node_execpath: string;
		_: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
