/**
 * Pure rules of the "add to home screen" banner (src/components/InstallPrompt.svelte).
 *
 * Android and desktop Chromium announce an installable app with
 * `beforeinstallprompt` and let a page open the install dialog itself. iOS has
 * neither: the page can only point at Share → "Add to Home Screen".
 */

/** localStorage key of the time the visitor last closed the banner. */
export const INSTALL_DISMISSED_KEY = 'cookup-install-dismissed';

/** Time on the first page before the banner appears. */
export const INSTALL_DELAY_MS = 5000;

/** How long a closed banner stays away. */
export const INSTALL_DISMISS_DAYS = 60;

export interface Device {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
}

/**
 * Safari on an iPhone or iPad, the one iOS browser whose Share sheet matches
 * the instruction text. Chrome, Firefox, Edge and Opera on iOS (and in-app
 * browsers) put "Add to Home Screen" elsewhere or not at all, so they get no
 * banner rather than a wrong one. iPadOS 13+ presents itself as a Mac, told
 * apart by its touch screen.
 */
export function isIosSafari({ userAgent, platform, maxTouchPoints }: Device): boolean {
	const ios = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
	if (!ios) return false;
	if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter/.test(userAgent)) return false;
	return /Safari\//.test(userAgent);
}

/** True while the stored dismissal time is younger than INSTALL_DISMISS_DAYS (junk or a future date counts as none). */
export function dismissedRecently(stored: string | null, now: number): boolean {
	const at = Number(stored);
	if (!stored || !Number.isFinite(at) || at > now) return false;
	return now - at < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}
