try {
	var t = localStorage.getItem('cookup-theme');
	if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {
	/* storage unavailable (private mode, blocked cookies) — fall back to the OS */
}
