import { describe, it, expect } from 'vitest';
import { toMetricText } from './metricText';

// Every input is a sentence taken from the shipped recipe data, in the language the
// reader sees it.
describe('toMetricText — the cases that prompted it', () => {
	it('converts a fractional US gallon in French', () => {
		expect(toMetricText("Mélanger 1 1/2 gallon américain d'eau.", 'fr')).toBe("Mélanger 5,7 l d'eau.");
		expect(toMetricText('Mélanger ½ gallon américain de bouillon.', 'fr')).toBe('Mélanger 1,9 l de bouillon.');
	});

	it('annotates "a gallon" instead of replacing it, so the grammar around it survives', () => {
		expect(toMetricText("dans un sac de congélation d'un gallon américain.", 'fr')).toBe(
			"dans un sac de congélation d'un gallon américain (3,8 l)."
		);
		expect(toMetricText('Pour marinade into a gallon size zip-top bag.', 'en')).toBe(
			'Pour marinade into a gallon (3.8 l) size zip-top bag.'
		);
	});

	it('converts the same gallon in every language', () => {
		expect(toMetricText('Combine the 1½ gallons water.', 'en')).toBe('Combine the 5.7 l water.');
		expect(toMetricText('Die 1½ Gallonen Wasser mischen.', 'de')).toBe('Die 5,7 l Wasser mischen.');
		expect(toMetricText('Mezcla 1½ galones de agua.', 'es')).toBe('Mezcla 5,7 l de agua.');
		expect(toMetricText('混合1½加仑水。', 'zh')).toBe('混合5.7升水。');
		expect(toMetricText('1½ガロンの水を混ぜます。', 'ja')).toBe('5.7Lの水を混ぜます。');
		expect(toMetricText('물 1½갤런을 섞는다.', 'ko')).toBe('물 5.7 l을 섞는다.');
		expect(toMetricText('Смешайте 1½ галлона воды.', 'ru')).toBe('Смешайте 5,7 л воды.');
		expect(toMetricText('اخلط 1½ غالون من الماء.', 'ar')).toBe('اخلط 5.7 لتر من الماء.');
		expect(toMetricText('1½ गैलन पानी मिलाएं।', 'hi')).toBe('5.7 लीटर पानी मिलाएं।');
	});
});

describe('toMetricText — units', () => {
	it('converts cups, quarts and pints to ml and litres', () => {
		expect(toMetricText('Add ½ cup sugar.', 'en')).toBe('Add 120 ml sugar.');
		expect(toMetricText('Pour 2 cups of stock.', 'en')).toBe('Pour 470 ml of stock.');
		expect(toMetricText('Use a 2-quart pot.', 'en')).toBe('Use a 1.9 l pot.');
		expect(toMetricText('Bring 2 pints of water to a boil.', 'en')).toBe('Bring 950 ml of water to a boil.');
		expect(toMetricText('Ajoutez 2 tasses de bouillon.', 'fr')).toBe('Ajoutez 470 ml de bouillon.');
	});

	it('converts ounces and pounds to grams and kilograms', () => {
		expect(toMetricText('Add 6 oz of chocolate.', 'en')).toBe('Add 170 g of chocolate.');
		expect(toMetricText('Weigh 1 pound of meat.', 'en')).toBe('Weigh 450 g of meat.');
		expect(toMetricText('Buy 5 pounds of potatoes.', 'en')).toBe('Buy 2.3 kg of potatoes.');
	});

	it('converts inches, including pan sizes written 9 x 13-inch', () => {
		expect(toMetricText('Roll it ¼ inch thick.', 'en')).toBe('Roll it 6 mm thick.');
		expect(toMetricText('Use a 2-inch cutter.', 'en')).toBe('Use a 5 cm cutter.');
		expect(toMetricText('Line a 9 x 13-inch baking pan.', 'en')).toBe('Line a 23 x 33 cm baking pan.');
		expect(toMetricText('Line a 9×9 pan, 12 x 18 inches.', 'en')).toBe('Line a 9×9 pan, 30 x 46 cm.');
		expect(toMetricText('Beurrez un moule de 9x13 pouces.', 'fr')).toBe('Beurrez un moule de 23 x 33 cm.');
	});

	it('converts oven temperatures to the nearest 5 °C', () => {
		expect(toMetricText('Bake at 350°F for 40 minutes.', 'en')).toBe('Bake at 175 °C for 40 minutes.');
		expect(toMetricText('Preheat to 425 °F.', 'en')).toBe('Preheat to 220 °C.');
		expect(toMetricText('Bake at 350–375°F.', 'en')).toBe('Bake at 175–190 °C.');
	});

	it('keeps single degrees below 300 °F, where a sugar stage or a probe reading matters', () => {
		expect(toMetricText('Cook the syrup to 230–235 °F.', 'en')).toBe('Cook the syrup to 110–113 °C.');
		expect(toMetricText('Internal temperature of 165°F.', 'en')).toBe('Internal temperature of 74 °C.');
	});

	it('converts ranges and "or", each end on its own', () => {
		expect(toMetricText('Add 2-3 cups of water.', 'en')).toBe('Add 470–710 ml of water.');
		expect(toMetricText('Use 1 to 2 pounds of beef.', 'en')).toBe('Use 450–910 g of beef.');
		expect(toMetricText('Utilisez une marmite de 6 ou 8 quarts américains.', 'fr')).toBe(
			'Utilisez une marmite de 5,7–7,6 l.'
		);
	});

	it('uses the decimal comma of the language, and the unit words of its script', () => {
		expect(toMetricText('Ajoutez 1½ tasse de sucre.', 'fr')).toBe('Ajoutez 350 ml de sucre.');
		expect(toMetricText('Добавьте 2 стакана воды.', 'ru')).toBe('Добавьте 470 мл воды.');
		expect(toMetricText('Cắt dày ½ in.', 'vi')).toBe('Cắt dày 13 mm.');
	});

	it('agrees an adjectival unit in Russian', () => {
		expect(toMetricText('Разогрейте масло в 10-дюймовой сковороде.', 'ru')).toBe(
			'Разогрейте масло в 25-сантиметровой сковороде.'
		);
	});

	it('does not eat the full stop of an abbreviation at the end of a sentence', () => {
		expect(toMetricText('Lót khuôn 9 x 12 in. Dùng thìa múc hành.', 'vi')).toBe(
			'Lót khuôn 23 x 30 cm. Dùng thìa múc hành.'
		);
	});
});

describe('toMetricText — what it leaves alone', () => {
	it('leaves a measure that already has its metric figure beside it', () => {
		for (const [text, lang] of [
			['Bake at 350°F (175°C).', 'en'],
			['Bake at 175°C (350°F).', 'en'],
			['Heat oven to 350 °F / 175 °C.', 'en'],
			['Cut into 1 inch (2.5 cm) cubes.', 'en'],
			['Use a 20 cm (9-inch) pie pan.', 'en'],
			['Add ½ cup (120 ml) flour.', 'en'],
			['Faites cuire 20 minutes pour 450 g (1 livre).', 'fr'],
			['Mélangez 2 tasses (475 ml) de farine.', 'fr'],
			['Dans un plat de 9 x 13 pouces (23 x 33 cm).', 'fr'],
			['Добавьте 2 стакана (480 мл) воды.', 'ru'],
			['加入 ½ 杯（120 毫升）牛奶。', 'zh']
		] as const) {
			expect(toMetricText(text, lang)).toBe(text);
		}
	});

	it('leaves spoons alone — a measuring spoon is the same in every kitchen', () => {
		expect(toMetricText('Add 2 tablespoons of oil and 1 tsp salt.', 'en')).toBe(
			'Add 2 tablespoons of oil and 1 tsp salt.'
		);
		expect(toMetricText('Ajoutez 2 cuillères à soupe d’huile.', 'fr')).toBe('Ajoutez 2 cuillères à soupe d’huile.');
	});

	it('leaves a word that is not a quantity', () => {
		expect(toMetricText('Put it in a cup and set it aside.', 'en')).toBe('Put it in a cup and set it aside.');
		expect(toMetricText('Cut 4 quarters of lemon, 3 incisions, 15 cupcake cases.', 'en')).toBe(
			'Cut 4 quarters of lemon, 3 incisions, 15 cupcake cases.'
		);
		expect(toMetricText("Coupez en 4 quartiers et réservez.", 'fr')).toBe('Coupez en 4 quartiers et réservez.');
		expect(toMetricText('Attendez 1 quart d’heure.', 'fr')).toBe('Attendez 1 quart d’heure.');
	});

	it('leaves a pressure, which is not a weight', () => {
		expect(toMetricText('Cook at a pressure of 5–6 pounds for 7 minutes.', 'en')).toBe(
			'Cook at a pressure of 5–6 pounds for 7 minutes.'
		);
		expect(toMetricText('Cook at 15 pounds per square inch.', 'en')).toBe('Cook at 15 pounds per square inch.');
	});

	it('does not touch the second number of a range it cannot account for', () => {
		expect(toMetricText('Use 2 to 3 spoons or 1 cup.', 'en')).toBe('Use 2 to 3 spoons or 235 ml.');
	});

	it('returns an empty string and unconverted text unchanged', () => {
		expect(toMetricText('', 'en')).toBe('');
		expect(toMetricText('Stir well.', 'fr')).toBe('Stir well.');
	});
});

describe('toMetricText — metric written out in full', () => {
	it('recognises spelled-out metric units beside the imperial one', () => {
		for (const [text, lang] of [
			['Ajoutez 4 tasses (960 millilitres) de bouillon.', 'fr'],
			['Fügen Sie 2 Tassen (475 Milliliter) Brühe hinzu.', 'de'],
			['Añade 1 libra (450 gramos) de carne.', 'es'],
			['Versez 1 quart (environ 1 litre) de lait.', 'fr']
		] as const) {
			expect(toMetricText(text, lang)).toBe(text);
		}
	});
});
