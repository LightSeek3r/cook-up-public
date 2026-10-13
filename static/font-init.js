/*
 * Font skeleton: html[data-fonts], read by app.css (the states are listed there).
 *
 * Linked after the stylesheets in app.html, so it runs once they have loaded
 * (the @font-face rules have to be known for document.fonts.load to find any
 * face) and still before the body is parsed, i.e. before first paint.
 *
 * One file per subset carries every weight (variable fonts), so the family
 * name selects the faces and the sample text the subsets: ' ' is latin, which
 * every language uses for digits and punctuation; U+1EA1 adds vietnamese.
 * Faces for the scripts the system fonts cover (Arabic, Shahmukhi, Devanagari,
 * CJK...) are not web fonts at all, so there is nothing more to wait for.
 */
(function () {
	var root = document.documentElement;
	var fonts = document.fonts;
	if (!fonts || !fonts.load || !fonts.check || !window.Promise) return;

	var sample = root.lang === 'vi' ? ' \u1ea1' : ' ';
	var faces = ['1em Archivo', '1em Fraunces'];
	var loaded = function () {
		return faces.every(function (face) {
			return fonts.check(face, sample);
		});
	};

	var pending;
	try {
		pending = Promise.all(
			faces.map(function (face) {
				return fonts.load(face, sample);
			})
		);
		// From memory (a reload, another page of this tab) Chromium loads them
		// synchronously: nothing is ever hidden.
		if (loaded()) return;
		root.dataset.fonts = 'loading';
	} catch (e) {
		return;
	}

	// Until the first frame is drawn the switch can be made outright: nothing
	// on screen could be seen to move. The timeout caps the skeleton's time on
	// screen, so it starts with that frame (a background tab draws none). 1.5 s
	// is about four times the longest skeleton the slow-4G lab profile showed,
	// and half the 3 s browsers themselves hide text for under font-display: block.
	var painted = false;
	var timer;
	requestAnimationFrame(function () {
		painted = true;
		timer = setTimeout(function () {
			// A long task (hydration) can hold back the load promise's callback
			// until after this one even though the faces arrived well in time.
			settle(loaded() ? 'ready' : 'fallback');
		}, 1500);
	});

	function settle(state) {
		if (root.dataset.fonts !== 'loading') return;
		clearTimeout(timer);
		// 'swap' plays the reveal in app.css and stays: every change of this
		// attribute restyles the whole document, which cost a 200-500 ms long
		// task on the throttled lab phone when 'swap' was followed by 'ready'.
		root.dataset.fonts = state === 'ready' && painted ? 'swap' : state;
	}

	pending.then(
		function () {
			if (root.dataset.fonts === 'fallback') root.dataset.fonts = 'late';
			else settle('ready');
		},
		function () {
			settle('fallback');
		}
	);

	// A keyboard user must see what they focus.
	document.addEventListener(
		'focusin',
		function () {
			settle(loaded() ? 'ready' : 'fallback');
		},
		{ once: true }
	);
})();
