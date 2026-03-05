
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/api" | "/admin/api/[...path]" | "/api" | "/api/ui" | "/api/ui/[...path]" | "/api/[...path]" | "/attachments" | "/authentication" | "/contacts" | "/conversations" | "/errors" | "/groups" | "/health" | "/legacy-docs" | "/login" | "/maple" | "/maple/[...legacy]" | "/messages" | "/pagination" | "/quickstart" | "/sdks" | "/webhooks" | "/[slug]";
		RouteParams(): {
			"/admin/api/[...path]": { path: string };
			"/api/ui/[...path]": { path: string };
			"/api/[...path]": { path: string };
			"/maple/[...legacy]": { legacy: string };
			"/[slug]": { slug: string }
		};
		LayoutParams(): {
			"/": { path?: string; legacy?: string; slug?: string };
			"/admin": { path?: string };
			"/admin/api": { path?: string };
			"/admin/api/[...path]": { path: string };
			"/api": { path?: string };
			"/api/ui": { path?: string };
			"/api/ui/[...path]": { path: string };
			"/api/[...path]": { path: string };
			"/attachments": Record<string, never>;
			"/authentication": Record<string, never>;
			"/contacts": Record<string, never>;
			"/conversations": Record<string, never>;
			"/errors": Record<string, never>;
			"/groups": Record<string, never>;
			"/health": Record<string, never>;
			"/legacy-docs": Record<string, never>;
			"/login": Record<string, never>;
			"/maple": { legacy?: string };
			"/maple/[...legacy]": { legacy: string };
			"/messages": Record<string, never>;
			"/pagination": Record<string, never>;
			"/quickstart": Record<string, never>;
			"/sdks": Record<string, never>;
			"/webhooks": Record<string, never>;
			"/[slug]": { slug: string }
		};
		Pathname(): "/" | `/admin/api/${string}` & {} | `/api/ui/${string}` & {} | `/api/${string}` & {} | "/attachments" | "/authentication" | "/contacts" | "/conversations" | "/errors" | "/groups" | "/health" | "/legacy-docs" | "/login" | "/maple" | `/maple/${string}` & {} | "/messages" | "/pagination" | "/quickstart" | "/sdks" | "/webhooks" | `/${string}` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}