
import root from '../root.js';
import { set_building, set_prerendering } from '__sveltekit/environment';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../node_modules/@sveltejs/kit/src/runtime/shared-server.js';

export const options = {
	app_template_contains_nonce: true,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: undefined,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\n<html lang=\"en\" class=\"h-full\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <link rel=\"icon\" href=\"/favicon.ico\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <script nonce=\"" + nonce + "\">\n      // Apply theme before first paint to prevent flash\n      (function() {\n        try {\n          var t = localStorage.getItem('maple-theme');\n          if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {\n            document.documentElement.setAttribute('data-theme', 'dark');\n          }\n        } catch(e) {}\n      })();\n    </script>\n    " + head + "\n  </head>\n  <body data-sveltekit-preload-data=\"hover\" class=\"h-full\">\n    <div style=\"display: contents\">" + body + "</div>\n  </body>\n</html>\n",
		error: ({ status, message }) => "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>" + status + " — Maple IT Console</title>\n    <style>\n      body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0a0a1a; color: #e0e0e0; }\n      .container { text-align: center; padding: 2rem; max-width: 480px; }\n      h1 { font-size: 1.5rem; color: #fff; margin-bottom: 0.5rem; }\n      p { opacity: 0.8; line-height: 1.5; }\n      a { color: #60a5fa; text-decoration: none; padding: 0.5rem 1rem; border-radius: 6px; background: #1a1a2e; display: inline-block; margin-top: 1.5rem; }\n      a:hover { background: #252547; }\n    </style>\n  </head>\n  <body>\n    <div class=\"container\">\n      <h1>" + status + "</h1>\n      <p>" + message + "</p>\n      <a href=\"/\">Return home</a>\n    </div>\n  </body>\n</html>\n"
	},
	version_hash: "11s4iuu"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	({ handle, handleFetch, handleError, handleValidationError, init } = await import("../../../src/hooks.server.js"));

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
