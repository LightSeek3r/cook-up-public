/*
 * Default language for a page opened without ?lang=: the one the visitor chose
 * last (the picker stores it), else the first browser language the site has.
 * Pages are server-rendered per ?lang= only, so the way to honour it is one
 * early location.replace before first paint — no flash of English, no
 * hydration swap, and /api/track sees a single view.
 *
 * It runs before any module loads, so it cannot import SUPPORTED_LANGS or
 * LANG_KEY from $lib/config and repeats them as literals; lang-init.test.mjs
 * asserts they still match. Same shape as theme-init.js.
 *
 * An explicit ?lang= always wins, even an unknown value (the server answers
 * English for it). Offline it does nothing: the redirected URL would not be in
 * the service worker's cache, and the page it already has is the one to show.
 */
(function () {
	try {
		var loc = location;
		if (loc.pathname.indexOf('/admin') === 0 || navigator.onLine === false) return;
		var params = new URLSearchParams(loc.search);
		if (params.has('lang')) return;

		var supported = ['en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'ja', 'ko', 'vi', 'pt', 'it', 'bn', 'ru', 'pnb', 'jv'];
		var pick = null;
		try {
			var stored = localStorage.getItem('cookup-lang');
			if (supported.indexOf(stored) !== -1) pick = stored;
		} catch (e) {
			/* storage unavailable (private mode, blocked cookies) — use the browser's */
		}

		if (!pick) {
			var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
			for (var i = 0; i < tags.length && !pick; i++) {
				var tag = String(tags[i] || '').toLowerCase();
				var base = tag.split('-')[0];
				// pnb is Western Punjabi in Shahmukhi: pa-PK / pa-Arab, not Gurmukhi (pa-IN).
				if (tag === 'pnb' || tag.indexOf('pa-pk') === 0 || tag.indexOf('pa-arab') === 0) pick = 'pnb';
				else if (supported.indexOf(base) !== -1) pick = base;
			}
		}

		if (!pick || pick === 'en') return;
		params.set('lang', pick);
		loc.replace(loc.pathname + '?' + params + loc.hash);
	} catch (e) {
		/* never block the page */
	}
})();
