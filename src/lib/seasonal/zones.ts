import { WORLD_VIEW, ZONES, viewIndex } from '$lib/data/seasons.js';

/**
 * Climate zones and views (a zone in one hemisphere, or the world), their
 * storage form, and the guess at the reader's zone from the browser's time
 * zone or language. No geolocation, no network: the guess is always shown
 * with its source and always overridable.
 */

export { ZONES };
export type ZoneId = (typeof ZONES)[number];
export type Hemi = 'n' | 's';
export type SeasonView = { zone: ZoneId; hemi: Hemi } | 'world';
export type DetectionSource = 'timezone' | 'language' | 'fallback';
export interface Detection {
	view: SeasonView;
	source: DetectionSource;
	/** The time zone the view came from, when source is 'timezone'. */
	tz?: string;
}

type ViewKey = `${ZoneId}:${Hemi}`;

export const isZoneId = (value: unknown): value is ZoneId => (ZONES as readonly unknown[]).includes(value);

/** The tropics have no seasons to rotate, so `trop` only exists as 'n'. */
export function normaliseView(view: SeasonView): SeasonView {
	return view !== 'world' && view.zone === 'trop' && view.hemi === 's' ? { zone: 'trop', hemi: 'n' } : view;
}

export function toViewIndex(view: SeasonView): number {
	if (view === 'world') return WORLD_VIEW;
	return viewIndex(view.zone, view.zone === 'trop' ? 'n' : view.hemi);
}

/** `"med:s"` or `"world"`; null for anything else, including surrounding spaces or another case. */
export function parseView(raw: string | null | undefined): SeasonView | null {
	if (raw === 'world') return 'world';
	const m = /^([a-z]+):([ns])$/.exec(raw ?? '');
	if (!m || !isZoneId(m[1])) return null;
	return normaliseView({ zone: m[1], hemi: m[2] as Hemi });
}

export function formatView(view: SeasonView): string {
	if (view === 'world') return 'world';
	const v = normaliseView(view) as Exclude<SeasonView, 'world'>;
	return `${v.zone}:${v.hemi}`;
}

export const sameView = (a: SeasonView, b: SeasonView): boolean => formatView(a) === formatView(b);

/**
 * IANA time zone -> view, by area then view. Covers every name in Node's
 * Intl.supportedValuesOf('timeZone') (CLDR's canonical spellings), the
 * current IANA spellings browsers report instead (Asia/Kolkata, Europe/Kyiv,
 * America/Argentina/Buenos_Aires...) and the tzdb backward aliases.
 *
 * Zones are crop calendars, not strict Köppen. Rules applied throughout:
 * - the zone is that of the city in the time zone's name, since the UI shows
 *   "detected from America/Chicago"; a country with one time zone takes its
 *   population majority instead (India sav, China subtrop).
 * - the hemisphere is 's' only beyond about 5 degrees south: near the equator
 *   the year has no hemisphere-driven seasons, and the data is authored north.
 * - highland plateaus inside the tropics (Mexico City, Harare, Lusaka, La Paz)
 *   are `high`; the same climate outside them (Johannesburg, Kathmandu,
 *   Salta) is `subtrop`.
 * - dry places with cold winters (Boise, Kabul, Volgograd, Urumqi) are `cont`;
 *   `arid` is for hot deserts that grow through a mild winter.
 * - polar and sub-Antarctic stations are `bor`: they have no crop calendar.
 * Area '' holds the top-level aliases (Japan, GB, NZ...).
 */
const TIME_ZONES: Record<string, Partial<Record<ViewKey, string>>> = {
	Africa: {
		'trop:n': 'Abidjan Douala Libreville Malabo Monrovia Sao_Tome',
		'sav:n': 'Accra Bamako Bangui Banjul Bissau Brazzaville Bujumbura Conakry Freetown Juba Kinshasa Lagos Lome Ouagadougou Porto-Novo',
		'sav:s': 'Dar_es_Salaam Luanda Maputo',
		'high:n': 'Addis_Ababa Asmara Asmera Kampala Kigali Nairobi',
		'high:s': 'Blantyre Harare Lubumbashi Lusaka',
		'arid:n': 'Cairo Dakar Djibouti El_Aaiun Khartoum Mogadishu Ndjamena Niamey Nouakchott Timbuktu',
		'arid:s': 'Gaborone Windhoek',
		'med:n': 'Algiers Casablanca Ceuta Tripoli Tunis',
		'subtrop:s': 'Johannesburg Maseru Mbabane'
	},
	America: {
		'trop:n': 'Bahia Belem Cayenne Eirunepe Guyana Manaus Noronha Paramaribo Porto_Acre Porto_Velho Rio_Branco Santarem',
		'sav:n':
			'Anguilla Antigua Aruba Bahia_Banderas Barbados Belize Boa_Vista Cancun Caracas Cayman Curacao Dominica El_Salvador Fortaleza Grand_Turk Grenada Guadeloupe Guayaquil Havana Jamaica Kralendijk Lower_Princes Managua Marigot Martinique Mazatlan Merida Montserrat Nassau Panama Port-au-Prince Port_of_Spain Puerto_Rico Santo_Domingo St_Barthelemy St_Kitts St_Lucia St_Thomas St_Vincent Tortola Virgin',
		'sav:s': 'Araguaina Campo_Grande Cuiaba Maceio Recife',
		'high:n': 'Bogota Costa_Rica Guatemala Mexico_City Tegucigalpa',
		'high:s': 'La_Paz',
		'arid:n': 'Chihuahua Ciudad_Juarez Hermosillo Matamoros Monterrey Ojinaga Phoenix',
		'arid:s':
			'Argentina/Catamarca Argentina/ComodRivadavia Argentina/La_Rioja Argentina/Mendoza Argentina/San_Juan Argentina/San_Luis Catamarca Lima Mendoza',
		'med:n': 'Ensenada Los_Angeles Santa_Isabel Tijuana',
		'med:s': 'Santiago',
		'subtrop:s':
			'Argentina/Buenos_Aires Argentina/Cordoba Argentina/Jujuy Argentina/Salta Argentina/Tucuman Asuncion Buenos_Aires Cordoba Jujuy Montevideo Rosario Sao_Paulo',
		'oce:n': 'Vancouver',
		'oce:s': 'Coyhaique',
		'cont:n':
			'Atikokan Boise Chicago Coral_Harbour Creston Denver Detroit Edmonton Fort_Wayne Glace_Bay Halifax Indiana/Indianapolis Indiana/Knox Indiana/Marengo Indiana/Petersburg Indiana/Tell_City Indiana/Vevay Indiana/Vincennes Indiana/Winamac Indianapolis Kentucky/Louisville Kentucky/Monticello Knox_IN Louisville Menominee Moncton Montreal New_York Nipigon North_Dakota/Beulah North_Dakota/Center North_Dakota/New_Salem Rainy_River Regina Shiprock Swift_Current Thunder_Bay Toronto Winnipeg',
		'bor:n':
			'Adak Anchorage Atka Blanc-Sablon Cambridge_Bay Danmarkshavn Dawson Dawson_Creek Fort_Nelson Godthab Goose_Bay Inuvik Iqaluit Juneau Metlakatla Miquelon Nome Nuuk Pangnirtung Rankin_Inlet Resolute Scoresbysund Sitka St_Johns Thule Whitehorse Yakutat Yellowknife',
		'bor:s': 'Argentina/Rio_Gallegos Argentina/Ushuaia Punta_Arenas'
	},
	Antarctica: {
		'bor:s': 'Casey Davis DumontDUrville Macquarie Mawson McMurdo Palmer Rothera South_Pole Syowa Troll Vostok'
	},
	Arctic: {
		'bor:n': 'Longyearbyen'
	},
	Asia: {
		'trop:n': 'Brunei Colombo Jakarta Jayapura Kuala_Lumpur Kuching Makassar Pontianak Singapore Ujung_Pandang',
		'sav:n': 'Bangkok Calcutta Dacca Dhaka Ho_Chi_Minh Kolkata Manila Phnom_Penh Rangoon Saigon Vientiane Yangon',
		'sav:s': 'Dili',
		'arid:n': 'Aden Aqtau Ashgabat Ashkhabad Atyrau Baghdad Bahrain Baku Dubai Karachi Kuwait Muscat Qatar Qyzylorda Riyadh Tehran',
		'med:n': 'Amman Beirut Damascus Dushanbe Famagusta Gaza Hebron Istanbul Jerusalem Nicosia Samarkand Tashkent Tel_Aviv',
		'subtrop:n': 'Chongqing Chungking Hong_Kong Kathmandu Katmandu Macao Macau Shanghai Taipei Thimbu Thimphu Tokyo',
		'cont:n': 'Almaty Aqtobe Bishkek Harbin Kabul Kashgar Oral Pyongyang Qostanay Seoul Tbilisi Urumqi Vladivostok Yekaterinburg Yerevan',
		'bor:n':
			'Anadyr Barnaul Chita Choibalsan Hovd Irkutsk Kamchatka Khandyga Krasnoyarsk Magadan Novokuznetsk Novosibirsk Omsk Sakhalin Srednekolymsk Tomsk Ulaanbaatar Ulan_Bator Ust-Nera Yakutsk'
	},
	Atlantic: {
		'sav:s': 'St_Helena',
		'arid:n': 'Canary Cape_Verde',
		'med:n': 'Madeira',
		'subtrop:n': 'Bermuda',
		'oce:n': 'Azores',
		'bor:n': 'Faeroe Faroe Jan_Mayen Reykjavik',
		'bor:s': 'South_Georgia Stanley'
	},
	Australia: {
		'sav:s': 'Darwin Lindeman North',
		'arid:s': 'Broken_Hill Eucla Yancowinna',
		'med:s': 'Adelaide Perth South West',
		'subtrop:s': 'Brisbane LHI Lord_Howe NSW Queensland Sydney',
		'oce:s': 'ACT Canberra Currie Hobart Melbourne Tasmania Victoria'
	},
	Europe: {
		'med:n': 'Athens Gibraltar Istanbul Lisbon Madrid Malta Monaco Nicosia Podgorica Rome San_Marino Tirane Vatican',
		'oce:n': 'Amsterdam Andorra Belfast Brussels Copenhagen Dublin Guernsey Isle_of_Man Jersey London Luxembourg Paris',
		'cont:n':
			'Astrakhan Belgrade Berlin Bratislava Bucharest Budapest Busingen Chisinau Kaliningrad Kiev Kirov Kyiv Ljubljana Minsk Moscow Prague Riga Samara Sarajevo Saratov Simferopol Skopje Sofia Tiraspol Ulyanovsk Uzhgorod Vaduz Vienna Vilnius Volgograd Warsaw Zagreb Zaporozhye Zurich',
		'bor:n': 'Helsinki Mariehamn Oslo Stockholm Tallinn'
	},
	Indian: {
		'trop:n': 'Chagos Christmas Cocos Comoro Mahe Maldives',
		'sav:s': 'Mauritius Mayotte Reunion',
		'high:s': 'Antananarivo',
		'bor:s': 'Kerguelen'
	},
	Pacific: {
		'trop:n':
			'Apia Bougainville Chuuk Efate Enderbury Fakaofo Fiji Funafuti Gambier Guadalcanal Guam Kanton Kiritimati Kosrae Kwajalein Majuro Marquesas Nauru Niue Pago_Pago Palau Pitcairn Pohnpei Ponape Rarotonga Saipan Samoa Tahiti Tarawa Tongatapu Truk Wake Wallis Yap',
		'sav:n': 'Honolulu Johnston',
		'sav:s': 'Noumea Port_Moresby',
		'arid:n': 'Galapagos',
		'subtrop:n': 'Midway',
		'subtrop:s': 'Easter Norfolk',
		'oce:s': 'Auckland Chatham'
	},
	Brazil: {
		'trop:n': 'Acre DeNoronha West',
		'subtrop:s': 'East'
	},
	Canada: {
		'oce:n': 'Pacific',
		'cont:n': 'Atlantic Central Eastern Mountain Saskatchewan',
		'bor:n': 'Newfoundland Yukon'
	},
	Chile: {
		'med:s': 'Continental',
		'subtrop:s': 'EasterIsland'
	},
	Mexico: {
		'high:n': 'General',
		'arid:n': 'BajaSur',
		'med:n': 'BajaNorte'
	},
	US: {
		'trop:n': 'Samoa',
		'sav:n': 'Hawaii',
		'arid:n': 'Arizona',
		'med:n': 'Pacific',
		'cont:n': 'Central East-Indiana Eastern Indiana-Starke Michigan Mountain',
		'bor:n': 'Alaska Aleutian'
	},
	'': {
		'trop:n': 'Kwajalein Singapore',
		'sav:n': 'Cuba Jamaica',
		'arid:n': 'Egypt Iran',
		'med:n': 'Israel Libya Portugal Turkey',
		'subtrop:n': 'Hongkong Japan PRC ROC',
		'oce:n': 'Eire GB GB-Eire',
		'oce:s': 'NZ NZ-CHAT',
		'cont:n': 'Navajo Poland ROK W-SU',
		'bor:n': 'Iceland'
	}
};

/**
 * Country (the region of a language tag) -> the time zone that stands for it,
 * so a country and its main time zone can never disagree.
 */
const COUNTRY_TIME_ZONES: Record<string, string> = {
	AE: 'Asia/Dubai',
	AF: 'Asia/Kabul',
	AL: 'Europe/Tirane',
	AR: 'America/Argentina/Buenos_Aires',
	AT: 'Europe/Vienna',
	AU: 'Australia/Sydney',
	BA: 'Europe/Sarajevo',
	BD: 'Asia/Dhaka',
	BE: 'Europe/Brussels',
	BG: 'Europe/Sofia',
	BO: 'America/La_Paz',
	BR: 'America/Sao_Paulo',
	BY: 'Europe/Minsk',
	CA: 'America/Toronto',
	CH: 'Europe/Zurich',
	CI: 'Africa/Abidjan',
	CL: 'America/Santiago',
	CM: 'Africa/Douala',
	CN: 'Asia/Shanghai',
	CO: 'America/Bogota',
	CR: 'America/Costa_Rica',
	CU: 'America/Havana',
	CY: 'Asia/Nicosia',
	CZ: 'Europe/Prague',
	DE: 'Europe/Berlin',
	DK: 'Europe/Copenhagen',
	DO: 'America/Santo_Domingo',
	DZ: 'Africa/Algiers',
	EC: 'America/Guayaquil',
	EE: 'Europe/Tallinn',
	EG: 'Africa/Cairo',
	ES: 'Europe/Madrid',
	ET: 'Africa/Addis_Ababa',
	FI: 'Europe/Helsinki',
	FR: 'Europe/Paris',
	GB: 'Europe/London',
	GH: 'Africa/Accra',
	GR: 'Europe/Athens',
	GT: 'America/Guatemala',
	HK: 'Asia/Hong_Kong',
	HR: 'Europe/Zagreb',
	HU: 'Europe/Budapest',
	ID: 'Asia/Jakarta',
	IE: 'Europe/Dublin',
	IL: 'Asia/Jerusalem',
	IN: 'Asia/Kolkata',
	IQ: 'Asia/Baghdad',
	IR: 'Asia/Tehran',
	IS: 'Atlantic/Reykjavik',
	IT: 'Europe/Rome',
	JO: 'Asia/Amman',
	JP: 'Asia/Tokyo',
	KE: 'Africa/Nairobi',
	KH: 'Asia/Phnom_Penh',
	KR: 'Asia/Seoul',
	KW: 'Asia/Kuwait',
	KZ: 'Asia/Almaty',
	LB: 'Asia/Beirut',
	LK: 'Asia/Colombo',
	LT: 'Europe/Vilnius',
	LU: 'Europe/Luxembourg',
	LV: 'Europe/Riga',
	LY: 'Africa/Tripoli',
	MA: 'Africa/Casablanca',
	MD: 'Europe/Chisinau',
	MK: 'Europe/Skopje',
	MM: 'Asia/Yangon',
	MN: 'Asia/Ulaanbaatar',
	MT: 'Europe/Malta',
	MX: 'America/Mexico_City',
	MY: 'Asia/Kuala_Lumpur',
	NG: 'Africa/Lagos',
	NL: 'Europe/Amsterdam',
	NO: 'Europe/Oslo',
	NP: 'Asia/Kathmandu',
	NZ: 'Pacific/Auckland',
	OM: 'Asia/Muscat',
	PA: 'America/Panama',
	PE: 'America/Lima',
	PH: 'Asia/Manila',
	PK: 'Asia/Karachi',
	PL: 'Europe/Warsaw',
	PR: 'America/Puerto_Rico',
	PT: 'Europe/Lisbon',
	PY: 'America/Asuncion',
	QA: 'Asia/Qatar',
	RO: 'Europe/Bucharest',
	RS: 'Europe/Belgrade',
	RU: 'Europe/Moscow',
	SA: 'Asia/Riyadh',
	SE: 'Europe/Stockholm',
	SG: 'Asia/Singapore',
	SI: 'Europe/Ljubljana',
	SK: 'Europe/Bratislava',
	SN: 'Africa/Dakar',
	SY: 'Asia/Damascus',
	TH: 'Asia/Bangkok',
	TN: 'Africa/Tunis',
	TR: 'Europe/Istanbul',
	TW: 'Asia/Taipei',
	TZ: 'Africa/Dar_es_Salaam',
	UA: 'Europe/Kyiv',
	UG: 'Africa/Kampala',
	US: 'America/New_York',
	UY: 'America/Montevideo',
	UZ: 'Asia/Tashkent',
	VE: 'America/Caracas',
	VN: 'Asia/Ho_Chi_Minh',
	YE: 'Asia/Aden',
	ZA: 'Africa/Johannesburg'
};

/** Every (time zone, view) pair of the table, duplicates included; for tests. */
export function timeZoneEntries(): [string, SeasonView][] {
	const entries: [string, SeasonView][] = [];
	for (const [area, views] of Object.entries(TIME_ZONES)) {
		for (const [key, names] of Object.entries(views)) {
			const view = parseView(key);
			if (!view) throw new Error(`bad view ${key} in the time zone table`);
			for (const name of names.split(' ')) entries.push([area ? `${area}/${name}` : name, view]);
		}
	}
	return entries;
}

export const countryTimeZones = (): Readonly<Record<string, string>> => COUNTRY_TIME_ZONES;

let byTimeZone: Map<string, SeasonView> | null = null;

/** The view for an IANA time zone name, null when the table has no answer. */
export function viewForTimeZone(tz: string): SeasonView | null {
	byTimeZone ??= new Map(timeZoneEntries());
	return byTimeZone.get(tz) ?? null;
}

/** Names that carry no place: the reader chose, or a privacy mode forced, a global clock. */
export const isPlacelessTimeZone = (tz: string): boolean => /^(?:Etc\/.+|UTC|UCT|Universal|Zulu|GMT(?:[+-]?0)?|Greenwich)$/.test(tz);

/** The view for the region of a BCP 47 tag ('es-MX', 'zh-Hans-CN'); null without a known region. */
export function viewForLanguage(tag: string): SeasonView | null {
	let region: string | undefined;
	try {
		region = new Intl.Locale(tag).region;
	} catch {
		return null;
	}
	const tz = region ? COUNTRY_TIME_ZONES[region] : undefined;
	return tz ? viewForTimeZone(tz) : null;
}

/**
 * The reader's likely view: the time zone's, else the region of their first
 * language's, else the world. Pure: the caller passes the browser's values.
 * A placeless zone (UTC, Etc/*) answers the world outright rather than
 * falling through to the language, which privacy modes also flatten.
 */
export function detectView(tz?: string, languages?: readonly string[]): Detection {
	if (tz) {
		if (isPlacelessTimeZone(tz)) return { view: 'world', source: 'timezone', tz };
		const view = viewForTimeZone(tz);
		if (view) return { view, source: 'timezone', tz };
	}
	const first = languages?.[0];
	const view = first ? viewForLanguage(first) : null;
	if (view) return { view, source: 'language' };
	return { view: 'world', source: 'fallback' };
}
