import { d1 } from '../lib/d1.mjs';
import { TARGET_LANGS } from '../lib/langs.mjs';

const SCRIPT_GLOB = {
	ja: "instructions NOT GLOB '*[ぁ-ゖ]*' AND instructions NOT GLOB '*[ァ-ヺ]*'",
	zh: "instructions NOT GLOB '*[一-鿿]*'",
	ko: "instructions NOT GLOB '*[가-힣]*'",
	ar: "instructions NOT GLOB '*[ء-ي]*'",
	hi: "instructions NOT GLOB '*[ऀ-ॿ]*'",
	bn: "instructions NOT GLOB '*[ঀ-৿]*'",
	ru: "instructions NOT GLOB '*[Ѐ-ӿ]*'",
	// "bad" if either the Arabic block is absent, or every Arabic-block
	// character present could equally be plain Arabic — i.e. none of the
	// Shahmukhi/Urdu-only letters shows up. Mirrors translate_gate.mjs's
	// hasTargetScript('pnb', …) cross-check, which exists to catch Arabic
	// output mislabelled as Western Punjabi.
	pnb: "(instructions NOT GLOB '*[ء-ي]*' OR instructions NOT GLOB '*[ٹڈڑںھہے]*')"
};

// One aggregate query for every lang, instead of one query per lang — this
// stage's D1 free-tier row-read quota is the actual bottleneck now, not CPU,
// so minimizing round-trips (and full-table rescans) matters more than usual.
function summary() {
	const rows = d1('SELECT lang, COUNT(*) as total FROM recipe_i18n GROUP BY lang');
	return Object.fromEntries(rows.map((r) => [r.lang, r.total]));
}

// A lang with zero rows never appears in a GROUP BY result at all, so it
// would otherwise be silently invisible in summary()'s output — this is the
// one thing that's easy to miss when a brand-new language (added to
// TARGET_LANGS but not yet translated at all) is checked.
function missingEntirely(counts) {
	return TARGET_LANGS.filter((l) => !(l in counts));
}

const lang = process.argv[2];

if (!lang) {
	const counts = summary();
	console.log(JSON.stringify(counts));
	const missing = missingEntirely(counts);
	if (missing.length) console.log('not yet started (zero rows):', JSON.stringify(missing));
} else if (lang === '--all') {
	const counts = summary();
	console.log(JSON.stringify(counts));
	const missing = missingEntirely(counts);
	if (missing.length) console.log('not yet started (zero rows):', JSON.stringify(missing));
	const bad = d1(
		`SELECT lang, COUNT(*) as bad FROM recipe_i18n WHERE instructions LIKE '%' || char(92) || 'n%' GROUP BY lang`
	);
	console.log('backslash-n corruption (any lang, should be empty):', JSON.stringify(bad));
} else {
	const total = d1(`SELECT COUNT(*) as total FROM recipe_i18n WHERE lang='${lang}'`);
	console.log(lang, 'total', JSON.stringify(total));
	if (SCRIPT_GLOB[lang]) {
		const noScript = d1(`SELECT COUNT(*) as bad FROM recipe_i18n WHERE lang='${lang}' AND (${SCRIPT_GLOB[lang]})`);
		console.log(lang, 'no-target-script', JSON.stringify(noScript));
	}
}
