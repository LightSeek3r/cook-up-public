import { describe, expect, it } from 'vitest';
import { WORLD_VIEW, viewIndex } from '$lib/data/seasons.js';
import {
	ZONES,
	countryTimeZones,
	detectView,
	formatView,
	parseView,
	timeZoneEntries,
	toViewIndex,
	viewForLanguage,
	viewForTimeZone,
	type SeasonView
} from './zones';

/** Spellings browsers report that Node's CLDR list does not, and tzdb's backward aliases. */
const ALIASES = [
	'Asia/Kolkata',
	'Asia/Calcutta',
	'Asia/Ho_Chi_Minh',
	'Asia/Saigon',
	'Europe/Kyiv',
	'Europe/Kiev',
	'Asia/Kathmandu',
	'Asia/Katmandu',
	'Asia/Yangon',
	'Asia/Rangoon',
	'America/Argentina/Buenos_Aires',
	'America/Buenos_Aires',
	'America/Argentina/Cordoba',
	'America/Argentina/Catamarca',
	'America/Argentina/Jujuy',
	'America/Argentina/Mendoza',
	'America/Argentina/ComodRivadavia',
	'America/Rosario',
	'America/Nuuk',
	'America/Atikokan',
	'America/Indiana/Indianapolis',
	'America/Kentucky/Louisville',
	'America/Fort_Wayne',
	'America/Knox_IN',
	'America/Atka',
	'America/Ensenada',
	'America/Santa_Isabel',
	'America/Porto_Acre',
	'America/Shiprock',
	'America/Virgin',
	'America/Montreal',
	'America/Nipigon',
	'America/Thunder_Bay',
	'America/Rainy_River',
	'America/Pangnirtung',
	'America/Yellowknife',
	'Africa/Asmara',
	'Africa/Timbuktu',
	'Antarctica/South_Pole',
	'Asia/Chongqing',
	'Asia/Chungking',
	'Asia/Harbin',
	'Asia/Kashgar',
	'Asia/Dacca',
	'Asia/Thimbu',
	'Asia/Ashkhabad',
	'Asia/Macao',
	'Asia/Istanbul',
	'Asia/Tel_Aviv',
	'Asia/Ujung_Pandang',
	'Asia/Ulan_Bator',
	'Asia/Choibalsan',
	'Atlantic/Faroe',
	'Atlantic/Jan_Mayen',
	'Australia/ACT',
	'Australia/Canberra',
	'Australia/Currie',
	'Australia/LHI',
	'Australia/NSW',
	'Australia/North',
	'Australia/Queensland',
	'Australia/South',
	'Australia/Tasmania',
	'Australia/Victoria',
	'Australia/West',
	'Australia/Yancowinna',
	'Europe/Belfast',
	'Europe/Nicosia',
	'Europe/Tiraspol',
	'Europe/Uzhgorod',
	'Europe/Zaporozhye',
	'Pacific/Samoa',
	'Pacific/Yap',
	'Pacific/Chuuk',
	'Pacific/Pohnpei',
	'Pacific/Kanton',
	'Pacific/Johnston',
	'US/Alaska',
	'US/Aleutian',
	'US/Arizona',
	'US/Central',
	'US/East-Indiana',
	'US/Eastern',
	'US/Hawaii',
	'US/Indiana-Starke',
	'US/Michigan',
	'US/Mountain',
	'US/Pacific',
	'US/Samoa',
	'Canada/Atlantic',
	'Canada/Central',
	'Canada/Eastern',
	'Canada/Mountain',
	'Canada/Newfoundland',
	'Canada/Pacific',
	'Canada/Saskatchewan',
	'Canada/Yukon',
	'Brazil/Acre',
	'Brazil/DeNoronha',
	'Brazil/East',
	'Brazil/West',
	'Chile/Continental',
	'Chile/EasterIsland',
	'Mexico/BajaNorte',
	'Mexico/BajaSur',
	'Mexico/General',
	'Cuba',
	'Egypt',
	'Eire',
	'GB',
	'GB-Eire',
	'Hongkong',
	'Iceland',
	'Iran',
	'Israel',
	'Jamaica',
	'Japan',
	'Kwajalein',
	'Libya',
	'Navajo',
	'NZ',
	'NZ-CHAT',
	'Poland',
	'Portugal',
	'PRC',
	'ROC',
	'ROK',
	'Singapore',
	'Turkey',
	'W-SU'
];

const view = (key: string) => parseView(key) as SeasonView;

describe('views', () => {
	it('parses and formats strictly, folding trop into the north', () => {
		expect(parseView('med:s')).toEqual({ zone: 'med', hemi: 's' });
		expect(parseView('world')).toBe('world');
		expect(parseView('trop:s')).toEqual({ zone: 'trop', hemi: 'n' });
		for (const bad of ['', 'med', 'med:x', 'MED:n', ' med:n', 'med:n ', 'mars:n', 'World', 'med:n:s', null, undefined]) {
			expect(parseView(bad)).toBeNull();
		}
		expect(formatView({ zone: 'trop', hemi: 's' })).toBe('trop:n');
		for (const zone of ZONES) for (const hemi of ['n', 's'] as const) expect(parseView(formatView({ zone, hemi }))).not.toBeNull();
	});

	it('maps views to the artefact layout', () => {
		expect(toViewIndex('world')).toBe(WORLD_VIEW);
		expect(toViewIndex({ zone: 'med', hemi: 's' })).toBe(viewIndex('med', 's'));
		expect(toViewIndex({ zone: 'trop', hemi: 's' })).toBe(viewIndex('trop', 'n'));
	});
});

describe('time zone table', () => {
	const entries = timeZoneEntries();

	it('lists every name once', () => {
		const seen = new Set<string>();
		const duplicates = entries.map(([tz]) => tz).filter((tz) => seen.size === seen.add(tz).size);
		expect(duplicates).toEqual([]);
	});

	it("resolves every time zone Node supports and every alias to a valid view, trop always 'n'", () => {
		const names = [...Intl.supportedValuesOf('timeZone'), ...ALIASES];
		const missing = names.filter((tz) => viewForTimeZone(tz) === null);
		expect(missing).toEqual([]);
		for (const tz of names) {
			const v = viewForTimeZone(tz);
			expect(v, tz).not.toBe('world');
			if (v === 'world' || v === null) continue;
			expect(ZONES, tz).toContain(v.zone);
			expect(['n', 's'], tz).toContain(v.hemi);
			if (v.zone === 'trop') expect(v.hemi, tz).toBe('n');
		}
	});

	it('every entry is a real time zone the platform accepts', () => {
		const rejected = entries
			.map(([tz]) => tz)
			.filter((tz) => {
				try {
					new Intl.DateTimeFormat('en', { timeZone: tz });
					return false;
				} catch {
					return true;
				}
			});
		expect(rejected).toEqual([]);
	});

	it.each([
		['Asia/Kolkata', 'sav:n'],
		['Asia/Calcutta', 'sav:n'],
		['Asia/Dhaka', 'sav:n'],
		['Asia/Bangkok', 'sav:n'],
		['Asia/Saigon', 'sav:n'],
		['Asia/Shanghai', 'subtrop:n'],
		['Asia/Hong_Kong', 'subtrop:n'],
		['Asia/Harbin', 'cont:n'],
		['Asia/Urumqi', 'cont:n'],
		['Asia/Tokyo', 'subtrop:n'],
		['Asia/Seoul', 'cont:n'],
		['America/New_York', 'cont:n'],
		['America/Toronto', 'cont:n'],
		['America/Chicago', 'cont:n'],
		['America/Los_Angeles', 'med:n'],
		['America/Phoenix', 'arid:n'],
		['America/Mexico_City', 'high:n'],
		['America/Bogota', 'high:n'],
		['America/Lima', 'arid:s'],
		['America/Santiago', 'med:s'],
		['America/Sao_Paulo', 'subtrop:s'],
		['America/Buenos_Aires', 'subtrop:s'],
		['America/Argentina/Buenos_Aires', 'subtrop:s'],
		['America/Manaus', 'trop:n'],
		['Australia/Sydney', 'subtrop:s'],
		['Australia/Brisbane', 'subtrop:s'],
		['Australia/Melbourne', 'oce:s'],
		['Australia/Hobart', 'oce:s'],
		['Australia/Perth', 'med:s'],
		['Australia/Adelaide', 'med:s'],
		['Pacific/Auckland', 'oce:s'],
		['Asia/Jakarta', 'trop:n'],
		['Asia/Singapore', 'trop:n'],
		['Asia/Kuala_Lumpur', 'trop:n'],
		['Asia/Dubai', 'arid:n'],
		['Asia/Riyadh', 'arid:n'],
		['Africa/Cairo', 'arid:n'],
		['Asia/Karachi', 'arid:n'],
		['Africa/Nairobi', 'high:n'],
		['Africa/Addis_Ababa', 'high:n'],
		['Africa/Lagos', 'sav:n'],
		['Africa/Accra', 'sav:n'],
		['Africa/Johannesburg', 'subtrop:s'],
		['Europe/Moscow', 'cont:n'],
		['Asia/Novosibirsk', 'bor:n'],
		['Atlantic/Reykjavik', 'bor:n'],
		['Europe/Helsinki', 'bor:n'],
		['Europe/London', 'oce:n'],
		['Europe/Paris', 'oce:n'],
		['Europe/Dublin', 'oce:n'],
		['Europe/Madrid', 'med:n'],
		['Europe/Rome', 'med:n'],
		['Europe/Athens', 'med:n'],
		['Europe/Istanbul', 'med:n'],
		['Europe/Berlin', 'cont:n'],
		['Europe/Warsaw', 'cont:n'],
		['Europe/Kyiv', 'cont:n'],
		['Europe/Kiev', 'cont:n']
	])('%s is %s', (tz, key) => {
		expect(viewForTimeZone(tz)).toEqual(view(key));
	});

	it('puts the southern hemisphere where it is', () => {
		const hemiOf = (tz: string) => {
			const v = viewForTimeZone(tz);
			return v && v !== 'world' ? v.hemi : null;
		};
		for (const tz of [
			'Australia/Sydney',
			'Australia/Perth',
			'Australia/Darwin',
			'America/Sao_Paulo',
			'America/Santiago',
			'Africa/Johannesburg',
			'Pacific/Auckland',
			'America/Montevideo',
			'America/Lima'
		]) {
			expect(hemiOf(tz), tz).toBe('s');
		}
		for (const [tz, v] of entries) {
			if (v === 'world') continue;
			if (tz.startsWith('Australia/') || tz.startsWith('Antarctica/')) expect(v.hemi, tz).toBe('s');
			if (tz.startsWith('Europe/') || tz.startsWith('US/') || tz.startsWith('Canada/')) expect(v.hemi, tz).toBe('n');
			// Timor-Leste is Asia's one time zone south of the equatorial belt.
			if (tz.startsWith('Asia/') && tz !== 'Asia/Dili') expect(v.hemi, tz).toBe('n');
		}
	});

	it('every country stands for a time zone of the table', () => {
		for (const [country, tz] of Object.entries(countryTimeZones())) {
			expect(viewForTimeZone(tz), `${country} ${tz}`).not.toBeNull();
		}
		expect(Object.keys(countryTimeZones()).length).toBeGreaterThanOrEqual(60);
	});
});

describe('detectView', () => {
	it('uses the time zone first', () => {
		expect(detectView('Europe/Madrid', ['en-AU'])).toEqual({
			view: view('med:n'),
			source: 'timezone',
			tz: 'Europe/Madrid'
		});
		expect(detectView('Australia/Sydney', [])).toEqual({
			view: view('subtrop:s'),
			source: 'timezone',
			tz: 'Australia/Sydney'
		});
	});

	it('answers the world for placeless time zones', () => {
		for (const tz of ['UTC', 'Etc/UTC', 'Etc/GMT+5', 'Etc/GMT-14', 'GMT', 'Universal', 'Zulu']) {
			expect(detectView(tz, ['es-MX'])).toEqual({
				view: 'world',
				source: 'timezone',
				tz
			});
		}
	});

	it('falls back to the region of the first language, then the world', () => {
		expect(detectView('', ['es-MX', 'en-AU'])).toEqual({
			view: view('high:n'),
			source: 'language'
		});
		expect(detectView(undefined, ['en-AU'])).toEqual({
			view: view('subtrop:s'),
			source: 'language'
		});
		expect(detectView('Mars/Olympus_Mons', ['pt-BR'])).toEqual({
			view: view('subtrop:s'),
			source: 'language'
		});
		expect(detectView('EST5EDT', ['zh-Hans-CN'])).toEqual({
			view: view('subtrop:n'),
			source: 'language'
		});
		expect(detectView('', ['en'])).toEqual({
			view: 'world',
			source: 'fallback'
		});
		expect(detectView('', ['es-419'])).toEqual({
			view: 'world',
			source: 'fallback'
		});
		expect(detectView('', ['not a tag'])).toEqual({
			view: 'world',
			source: 'fallback'
		});
		expect(detectView()).toEqual({ view: 'world', source: 'fallback' });
		expect(detectView('', [])).toEqual({ view: 'world', source: 'fallback' });
	});

	it('reads regions the same way as time zones', () => {
		expect(viewForLanguage('en-GB')).toEqual(view('oce:n'));
		expect(viewForLanguage('hi-IN')).toEqual(view('sav:n'));
		expect(viewForLanguage('es-CL')).toEqual(view('med:s'));
		expect(viewForLanguage('ms-MY')).toEqual(view('trop:n'));
	});
});
