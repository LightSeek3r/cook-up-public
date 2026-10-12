import { describe, expect, it } from 'vitest';
import { commonsSrcset } from './photo';

const C = 'https://upload.wikimedia.org/wikipedia/commons/';

describe('commonsSrcset', () => {
	it('steps a 960px thumbnail down to the standard 330 and 500 widths', () => {
		expect(commonsSrcset(`${C}thumb/1/14/Pumpkin_Pie.jpg/960px-Pumpkin_Pie.jpg`, 640)).toBe(
			[
				`${C}thumb/1/14/Pumpkin_Pie.jpg/330px-Pumpkin_Pie.jpg 330w`,
				`${C}thumb/1/14/Pumpkin_Pie.jpg/500px-Pumpkin_Pie.jpg 500w`,
				`${C}thumb/1/14/Pumpkin_Pie.jpg/960px-Pumpkin_Pie.jpg 960w`
			].join(', ')
		);
	});

	it('derives thumbnails for an original file and keeps the original as the widest candidate', () => {
		expect(commonsSrcset(`${C}a/a7/CaesarSalad3.jpg`, 640)).toBe(
			[
				`${C}thumb/a/a7/CaesarSalad3.jpg/330px-CaesarSalad3.jpg 330w`,
				`${C}thumb/a/a7/CaesarSalad3.jpg/500px-CaesarSalad3.jpg 500w`,
				`${C}a/a7/CaesarSalad3.jpg 640w`
			].join(', ')
		);
	});

	it('keeps the thumbnail file name, which differs from the original for rendered formats', () => {
		expect(commonsSrcset(`${C}thumb/0/0a/Pan.svg/960px-Pan.svg.png`, 640)).toContain(
			`${C}thumb/0/0a/Pan.svg/330px-Pan.svg.png 330w`
		);
	});

	it('never offers a step at or above what the file is known to have', () => {
		expect(commonsSrcset(`${C}a/a7/Small.jpg`, 420)).toBe(
			`${C}thumb/a/a7/Small.jpg/330px-Small.jpg 330w, ${C}a/a7/Small.jpg 420w`
		);
		expect(commonsSrcset(`${C}a/a7/Tiny.jpg`, 300)).toBeUndefined();
		expect(commonsSrcset(`${C}a/a7/Unknown.jpg`, null)).toBeUndefined();
	});

	it('leaves unknown shapes alone', () => {
		expect(commonsSrcset('https://example.org/a.jpg', 640)).toBeUndefined();
		expect(commonsSrcset(`${C}a/a7/Clip.webm`, 640)).toBeUndefined();
		expect(commonsSrcset(`${C}thumb/a/a7/X.jpg/lossy-page1-960px-X.jpg`, 640)).toBeUndefined();
	});
});
