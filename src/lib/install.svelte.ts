import { browser } from '$app/environment';

/** The non-standard event Chromium fires once the app can be installed. */
export interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class InstallState {
	/** The browser's install offer, kept until used: it can only be shown once. */
	offer = $state.raw<BeforeInstallPromptEvent | null>(null);
	installed = $state(false);
}

export const installState = new InstallState();

// At import, not in the banner's onMount: the layout imports this module, so the
// listener exists before the first component runs and an early event is kept.
// preventDefault holds back Chrome's own mini-infobar; the banner replaces it
// after its delay, and the address-bar install icon stays.
if (browser) {
	addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		installState.offer = event as BeforeInstallPromptEvent;
	});
	addEventListener('appinstalled', () => {
		installState.offer = null;
		installState.installed = true;
	});
}
