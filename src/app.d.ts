import type { D1Database, KVNamespace, Ai } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				TRANSLATIONS: KVNamespace;
				AI: Ai;
			};
		}
	}
}

export {};
