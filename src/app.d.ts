/// <reference types="@sveltejs/adapter-cloudflare" />
import type { D1Database } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				// Set with `wrangler secret put`, so absent in local dev unless a
				// .dev.vars supplies them. Optional here on purpose: /admin degrades
				// to a clear error instead of a type lie.
				RESEND_API_KEY?: string;
				RESEND_FROM?: string;
				ADMIN_EMAILS?: string;
			};
		}
	}
}

export {};
