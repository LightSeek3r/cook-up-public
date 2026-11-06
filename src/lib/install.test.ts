import { describe, expect, it } from 'vitest';
import { INSTALL_DISMISS_DAYS, dismissedRecently, isIosSafari } from './install';

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const device = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe('isIosSafari', () => {
	it('is true for Safari on iPhone and for iPadOS, which reports a Mac with a touch screen', () => {
		expect(isIosSafari(device(IPHONE_SAFARI, 'iPhone', 5))).toBe(true);
		expect(isIosSafari(device(IPAD_SAFARI, 'MacIntel', 5))).toBe(true);
	});

	it('is false for other iOS browsers, Android and a desktop Mac', () => {
		expect(isIosSafari(device(IPHONE_CHROME, 'iPhone', 5))).toBe(false);
		expect(isIosSafari(device(ANDROID_CHROME, 'Linux armv8l', 5))).toBe(false);
		expect(isIosSafari(device(IPAD_SAFARI, 'MacIntel', 0))).toBe(false);
	});
});

describe('dismissedRecently', () => {
	const now = Date.UTC(2026, 10, 6);
	const day = 24 * 60 * 60 * 1000;

	it('holds for INSTALL_DISMISS_DAYS, then lets the banner back', () => {
		expect(dismissedRecently(String(now - day), now)).toBe(true);
		expect(dismissedRecently(String(now - (INSTALL_DISMISS_DAYS - 1) * day), now)).toBe(true);
		expect(dismissedRecently(String(now - INSTALL_DISMISS_DAYS * day), now)).toBe(false);
	});

	it('treats nothing stored, junk and a future date as not dismissed', () => {
		expect(dismissedRecently(null, now)).toBe(false);
		expect(dismissedRecently('', now)).toBe(false);
		expect(dismissedRecently('yesterday', now)).toBe(false);
		expect(dismissedRecently(String(now + day), now)).toBe(false);
	});
});
