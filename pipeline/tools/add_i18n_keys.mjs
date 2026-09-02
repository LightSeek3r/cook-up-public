/**
 * One-off maintenance script: adds the Wave-5 i18n key families to all 10 locale
 * bundles in one pass, so the key sets stay identical (guarded by the parity test
 * in src/lib/i18n/index.test.ts).
 *
 * Kept in the repo rather than run ad-hoc because it documents exactly which
 * translations were introduced together, and re-running it is idempotent.
 *
 *   node pipeline/tools/add_i18n_keys.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('src/lib/i18n');

const SHARED = {
	en: {
		'app.skipToContent': 'Skip to content', 'app.language': 'Language',
		'mosaic.remove': 'Remove', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'Recipe data', 'footer.nutritionRef': 'Nutrition reference',
		'footer.andPublicDomain': 'and public-domain sources', 'footer.publicDomain': 'public domain',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'Protein', 'nutrition.fat': 'Fat',
		'nutrition.satFat': 'Saturates', 'nutrition.carbs': 'Carbs', 'nutrition.sugars': 'Sugars',
		'nutrition.fibre': 'Fibre', 'nutrition.sodium': 'Sodium', 'nutrition.pctNrv': '% NRV',
		'nutrition.nutrient': 'Nutrient', 'nutrition.amount': 'Amount',
		'nutrition.micronutrients': 'Micronutrients per serving',
		'tips.heading': 'Healthier swaps',
		'tips.intro': 'Optional substitutions that keep the dish recognisable.',
		'sub.lessSatFat': 'less saturated fat', 'sub.lessSugar': 'less sugar',
		'sub.lessSalt': 'less salt', 'sub.moreFibre': 'more fibre',
		'sub.lessCalories': 'fewer calories', 'sub.betterFats': 'better fats',
		'sub.dairyFree': 'dairy-free', 'sub.inBaking': 'in baking'
	},
	es: {
		'app.skipToContent': 'Ir al contenido', 'app.language': 'Idioma',
		'mosaic.remove': 'Quitar', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'Datos de recetas', 'footer.nutritionRef': 'Referencia nutricional',
		'footer.andPublicDomain': 'y fuentes de dominio público', 'footer.publicDomain': 'dominio público',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'Proteínas', 'nutrition.fat': 'Grasas',
		'nutrition.satFat': 'Saturadas', 'nutrition.carbs': 'Carbohidratos', 'nutrition.sugars': 'Azúcares',
		'nutrition.fibre': 'Fibra', 'nutrition.sodium': 'Sodio', 'nutrition.pctNrv': '% VRN',
		'nutrition.nutrient': 'Nutriente', 'nutrition.amount': 'Cantidad',
		'nutrition.micronutrients': 'Micronutrientes por ración',
		'tips.heading': 'Cambios más saludables',
		'tips.intro': 'Sustituciones opcionales que mantienen el plato reconocible.',
		'sub.lessSatFat': 'menos grasas saturadas', 'sub.lessSugar': 'menos azúcar',
		'sub.lessSalt': 'menos sal', 'sub.moreFibre': 'más fibra',
		'sub.lessCalories': 'menos calorías', 'sub.betterFats': 'mejores grasas',
		'sub.dairyFree': 'sin lácteos', 'sub.inBaking': 'en repostería'
	},
	fr: {
		'app.skipToContent': 'Aller au contenu', 'app.language': 'Langue',
		'mosaic.remove': 'Retirer', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'Données des recettes', 'footer.nutritionRef': 'Référence nutritionnelle',
		'footer.andPublicDomain': 'et sources du domaine public', 'footer.publicDomain': 'domaine public',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'Protéines', 'nutrition.fat': 'Matières grasses',
		'nutrition.satFat': 'Saturés', 'nutrition.carbs': 'Glucides', 'nutrition.sugars': 'Sucres',
		'nutrition.fibre': 'Fibres', 'nutrition.sodium': 'Sodium', 'nutrition.pctNrv': '% VNR',
		'nutrition.nutrient': 'Nutriment', 'nutrition.amount': 'Quantité',
		'nutrition.micronutrients': 'Micronutriments par portion',
		'tips.heading': 'Alternatives plus saines',
		'tips.intro': 'Substitutions facultatives qui préservent le plat.',
		'sub.lessSatFat': 'moins de graisses saturées', 'sub.lessSugar': 'moins de sucre',
		'sub.lessSalt': 'moins de sel', 'sub.moreFibre': 'plus de fibres',
		'sub.lessCalories': 'moins de calories', 'sub.betterFats': 'meilleures graisses',
		'sub.dairyFree': 'sans produits laitiers', 'sub.inBaking': 'en pâtisserie'
	},
	de: {
		'app.skipToContent': 'Zum Inhalt springen', 'app.language': 'Sprache',
		'mosaic.remove': 'Entfernen', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'Rezeptdaten', 'footer.nutritionRef': 'Nährwertreferenz',
		'footer.andPublicDomain': 'und gemeinfreie Quellen', 'footer.publicDomain': 'gemeinfrei',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'Protein', 'nutrition.fat': 'Fett',
		'nutrition.satFat': 'Gesättigte', 'nutrition.carbs': 'Kohlenhydrate', 'nutrition.sugars': 'Zucker',
		'nutrition.fibre': 'Ballaststoffe', 'nutrition.sodium': 'Natrium', 'nutrition.pctNrv': '% NRV',
		'nutrition.nutrient': 'Nährstoff', 'nutrition.amount': 'Menge',
		'nutrition.micronutrients': 'Mikronährstoffe pro Portion',
		'tips.heading': 'Gesündere Alternativen',
		'tips.intro': 'Optionale Substitutionen, die das Gericht erkennbar halten.',
		'sub.lessSatFat': 'weniger gesättigte Fette', 'sub.lessSugar': 'weniger Zucker',
		'sub.lessSalt': 'weniger Salz', 'sub.moreFibre': 'mehr Ballaststoffe',
		'sub.lessCalories': 'weniger Kalorien', 'sub.betterFats': 'bessere Fette',
		'sub.dairyFree': 'ohne Milchprodukte', 'sub.inBaking': 'beim Backen'
	},
	vi: {
		'app.skipToContent': 'Chuyển đến nội dung', 'app.language': 'Ngôn ngữ',
		'mosaic.remove': 'Bỏ', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'Dữ liệu công thức', 'footer.nutritionRef': 'Nguồn dinh dưỡng',
		'footer.andPublicDomain': 'và các nguồn thuộc phạm vi công cộng',
		'footer.publicDomain': 'phạm vi công cộng',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'Chất đạm', 'nutrition.fat': 'Chất béo',
		'nutrition.satFat': 'Chất béo bão hòa', 'nutrition.carbs': 'Carbohydrate',
		'nutrition.sugars': 'Đường', 'nutrition.fibre': 'Chất xơ', 'nutrition.sodium': 'Natri',
		'nutrition.pctNrv': '% NRV', 'nutrition.nutrient': 'Dưỡng chất', 'nutrition.amount': 'Hàm lượng',
		'nutrition.micronutrients': 'Vi chất mỗi phần ăn',
		'tips.heading': 'Thay thế lành mạnh hơn',
		'tips.intro': 'Các thay thế tùy chọn giữ nguyên đặc trưng món ăn.',
		'sub.lessSatFat': 'ít chất béo bão hòa hơn', 'sub.lessSugar': 'ít đường hơn',
		'sub.lessSalt': 'ít muối hơn', 'sub.moreFibre': 'nhiều chất xơ hơn',
		'sub.lessCalories': 'ít calo hơn', 'sub.betterFats': 'chất béo tốt hơn',
		'sub.dairyFree': 'không sữa', 'sub.inBaking': 'khi nướng bánh'
	},
	ar: {
		'app.skipToContent': 'الانتقال إلى المحتوى', 'app.language': 'اللغة',
		'mosaic.remove': 'إزالة', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'بيانات الوصفات', 'footer.nutritionRef': 'المرجع الغذائي',
		'footer.andPublicDomain': 'ومصادر الملكية العامة', 'footer.publicDomain': 'ملكية عامة',
		'nutrition.kcal': 'كيلو كالوري', 'nutrition.protein': 'بروتين', 'nutrition.fat': 'دهون',
		'nutrition.satFat': 'دهون مشبعة', 'nutrition.carbs': 'كربوهيدرات',
		'nutrition.sugars': 'سكريات', 'nutrition.fibre': 'ألياف', 'nutrition.sodium': 'صوديوم',
		'nutrition.pctNrv': '٪ من المرجع', 'nutrition.nutrient': 'العنصر الغذائي',
		'nutrition.amount': 'الكمية', 'nutrition.micronutrients': 'العناصر الدقيقة لكل حصة',
		'tips.heading': 'بدائل أكثر صحة',
		'tips.intro': 'بدائل اختيارية تحافظ على طبيعة الطبق.',
		'sub.lessSatFat': 'دهون مشبعة أقل', 'sub.lessSugar': 'سكر أقل',
		'sub.lessSalt': 'ملح أقل', 'sub.moreFibre': 'ألياف أكثر',
		'sub.lessCalories': 'سعرات أقل', 'sub.betterFats': 'دهون أفضل',
		'sub.dairyFree': 'خال من الألبان', 'sub.inBaking': 'في الخبز'
	},
	hi: {
		'app.skipToContent': 'सामग्री पर जाएँ', 'app.language': 'भाषा',
		'mosaic.remove': 'हटाएँ', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'रेसिपी डेटा', 'footer.nutritionRef': 'पोषण संदर्भ',
		'footer.andPublicDomain': 'और सार्वजनिक डोमेन स्रोत',
		'footer.publicDomain': 'सार्वजनिक डोमेन',
		'nutrition.kcal': 'कैलोरी', 'nutrition.protein': 'प्रोटीन', 'nutrition.fat': 'वसा',
		'nutrition.satFat': 'संतृप्त वसा', 'nutrition.carbs': 'कार्बोहाइड्रेट',
		'nutrition.sugars': 'शर्करा', 'nutrition.fibre': 'फाइबर', 'nutrition.sodium': 'सोडियम',
		'nutrition.pctNrv': '% NRV', 'nutrition.nutrient': 'पोषक तत्व',
		'nutrition.amount': 'मात्रा', 'nutrition.micronutrients': 'प्रति सर्विंग सूक्ष्म पोषक तत्व',
		'tips.heading': 'स्वास्थ्यकर विकल्प',
		'tips.intro': 'वैकल्पिक प्रतिस्थापन जो व्यंजन को पहचानने योग्य रखते हैं।',
		'sub.lessSatFat': 'कम संतृप्त वसा', 'sub.lessSugar': 'कम शर्करा',
		'sub.lessSalt': 'कम नमक', 'sub.moreFibre': 'अधिक फाइबर',
		'sub.lessCalories': 'कम कैलोरी', 'sub.betterFats': 'बेहतर वसा',
		'sub.dairyFree': 'डेयरी रहित', 'sub.inBaking': 'बेकिंग में'
	},
	zh: {
		'app.skipToContent': '跳至内容', 'app.language': '语言',
		'mosaic.remove': '移除', 'grade.label': 'Balance Grade',
		'footer.recipeData': '食谱数据', 'footer.nutritionRef': '营养参考',
		'footer.andPublicDomain': '及公有领域来源', 'footer.publicDomain': '公有领域',
		'nutrition.kcal': '千卡', 'nutrition.protein': '蛋白质', 'nutrition.fat': '脂肪',
		'nutrition.satFat': '饱和脂肪', 'nutrition.carbs': '碳水化合物',
		'nutrition.sugars': '糖', 'nutrition.fibre': '膳食纤维', 'nutrition.sodium': '钠',
		'nutrition.pctNrv': '% 营养素参考值', 'nutrition.nutrient': '营养素',
		'nutrition.amount': '含量', 'nutrition.micronutrients': '每份微量营养素',
		'tips.heading': '更健康的替代',
		'tips.intro': '可选的替换，保持菜品原有风味。',
		'sub.lessSatFat': '饱和脂肪更少', 'sub.lessSugar': '糖更少',
		'sub.lessSalt': '盐更少', 'sub.moreFibre': '纤维更多',
		'sub.lessCalories': '热量更低', 'sub.betterFats': '更好的脂肪',
		'sub.dairyFree': '无乳制品', 'sub.inBaking': '用于烘焙'
	},
	ja: {
		'app.skipToContent': '本文へスキップ', 'app.language': '言語',
		'mosaic.remove': '削除', 'grade.label': 'Balance Grade',
		'footer.recipeData': 'レシピデータ', 'footer.nutritionRef': '栄養データ出典',
		'footer.andPublicDomain': 'およびパブリックドメインの資料',
		'footer.publicDomain': 'パブリックドメイン',
		'nutrition.kcal': 'kcal', 'nutrition.protein': 'たんぱく質', 'nutrition.fat': '脂質',
		'nutrition.satFat': '飽和脂肪酸', 'nutrition.carbs': '炭水化物',
		'nutrition.sugars': '糖質', 'nutrition.fibre': '食物繊維',
		'nutrition.sodium': 'ナトリウム', 'nutrition.pctNrv': '% NRV',
		'nutrition.nutrient': '栄養素', 'nutrition.amount': '含有量',
		'nutrition.micronutrients': '1食分の微量栄養素',
		'tips.heading': 'ヘルシーな代替',
		'tips.intro': '料理の持ち味を保つ、任意の置き換えです。',
		'sub.lessSatFat': '飽和脂肪酸が少ない', 'sub.lessSugar': '砂糖が少ない',
		'sub.lessSalt': '塩分が少ない', 'sub.moreFibre': '食物繊維が多い',
		'sub.lessCalories': 'カロリーが低い', 'sub.betterFats': 'より良い脂質',
		'sub.dairyFree': '乳製品不使用', 'sub.inBaking': '焼き菓子で'
	},
	ko: {
		'app.skipToContent': '본문으로 이동', 'app.language': '언어',
		'mosaic.remove': '제거', 'grade.label': 'Balance Grade',
		'footer.recipeData': '레시피 데이터', 'footer.nutritionRef': '영양 정보 출처',
		'footer.andPublicDomain': '및 퍼블릭 도메인 자료',
		'footer.publicDomain': '퍼블릭 도메인',
		'nutrition.kcal': 'kcal', 'nutrition.protein': '단백질', 'nutrition.fat': '지방',
		'nutrition.satFat': '포화지방', 'nutrition.carbs': '탄수화물',
		'nutrition.sugars': '당류', 'nutrition.fibre': '식이섬유',
		'nutrition.sodium': '나트륨', 'nutrition.pctNrv': '% NRV',
		'nutrition.nutrient': '영양소', 'nutrition.amount': '함량',
		'nutrition.micronutrients': '1인분당 미량 영양소',
		'tips.heading': '더 건강한 대체',
		'tips.intro': '요리의 특징을 유지하는 선택적 대체입니다.',
		'sub.lessSatFat': '포화지방 감소', 'sub.lessSugar': '당류 감소',
		'sub.lessSalt': '나트륨 감소', 'sub.moreFibre': '식이섬유 증가',
		'sub.lessCalories': '열량 감소', 'sub.betterFats': '더 좋은 지방',
		'sub.dairyFree': '유제품 무첨가', 'sub.inBaking': '베이킹에서'
	}
};

const CUISINES = ['african', 'american', 'british', 'caribbean', 'chinese', 'french', 'german',
	'greek', 'indian', 'italian', 'japanese', 'korean', 'mexican', 'middle_eastern',
	'moroccan', 'spanish', 'thai', 'turkish', 'vietnamese'];

const CUISINE_LABELS = {
	en: ['African', 'American', 'British', 'Caribbean', 'Chinese', 'French', 'German', 'Greek', 'Indian', 'Italian', 'Japanese', 'Korean', 'Mexican', 'Middle Eastern', 'Moroccan', 'Spanish', 'Thai', 'Turkish', 'Vietnamese'],
	es: ['Africana', 'Estadounidense', 'Británica', 'Caribeña', 'China', 'Francesa', 'Alemana', 'Griega', 'India', 'Italiana', 'Japonesa', 'Coreana', 'Mexicana', 'Medio Oriente', 'Marroquí', 'Española', 'Tailandesa', 'Turca', 'Vietnamita'],
	fr: ['Africaine', 'Américaine', 'Britannique', 'Antillaise', 'Chinoise', 'Française', 'Allemande', 'Grecque', 'Indienne', 'Italienne', 'Japonaise', 'Coréenne', 'Mexicaine', 'Moyen-Orient', 'Marocaine', 'Espagnole', 'Thaïlandaise', 'Turque', 'Vietnamienne'],
	de: ['Afrikanisch', 'Amerikanisch', 'Britisch', 'Karibisch', 'Chinesisch', 'Französisch', 'Deutsch', 'Griechisch', 'Indisch', 'Italienisch', 'Japanisch', 'Koreanisch', 'Mexikanisch', 'Nahöstlich', 'Marokkanisch', 'Spanisch', 'Thailändisch', 'Türkisch', 'Vietnamesisch'],
	vi: ['Châu Phi', 'Mỹ', 'Anh', 'Caribe', 'Trung Hoa', 'Pháp', 'Đức', 'Hy Lạp', 'Ấn Độ', 'Ý', 'Nhật', 'Hàn', 'Mexico', 'Trung Đông', 'Maroc', 'Tây Ban Nha', 'Thái', 'Thổ Nhĩ Kỳ', 'Việt'],
	ar: ['أفريقية', 'أمريكية', 'بريطانية', 'كاريبية', 'صينية', 'فرنسية', 'ألمانية', 'يونانية', 'هندية', 'إيطالية', 'يابانية', 'كورية', 'مكسيكية', 'شرق أوسطية', 'مغربية', 'إسبانية', 'تايلاندية', 'تركية', 'فيتنامية'],
	hi: ['अफ्रीकी', 'अमेरिकी', 'ब्रिटिश', 'कैरिबियन', 'चीनी', 'फ्रांसीसी', 'जर्मन', 'यूनानी', 'भारतीय', 'इतालवी', 'जापानी', 'कोरियाई', 'मैक्सिकन', 'मध्य पूर्वी', 'मोरक्कन', 'स्पेनिश', 'थाई', 'तुर्की', 'वियतनामी'],
	zh: ['非洲', '美式', '英式', '加勒比', '中式', '法式', '德式', '希腊', '印度', '意式', '日式', '韩式', '墨西哥', '中东', '摩洛哥', '西班牙', '泰式', '土耳其', '越南'],
	ja: ['アフリカ', 'アメリカ', 'イギリス', 'カリブ', '中華', 'フランス', 'ドイツ', 'ギリシャ', 'インド', 'イタリア', '日本', '韓国', 'メキシコ', '中東', 'モロッコ', 'スペイン', 'タイ', 'トルコ', 'ベトナム'],
	ko: ['아프리카', '미국', '영국', '카리브', '중국', '프랑스', '독일', '그리스', '인도', '이탈리아', '일본', '한국', '멕시코', '중동', '모로코', '스페인', '태국', '터키', '베트남']
};

const MICROS = ['vitamin_c', 'vitamin_d', 'vitamin_a', 'vitamin_b12', 'folate', 'iron', 'calcium', 'potassium', 'magnesium', 'zinc'];

const MICRO_LABELS = {
	en: ['Vitamin C', 'Vitamin D', 'Vitamin A', 'Vitamin B12', 'Folate', 'Iron', 'Calcium', 'Potassium', 'Magnesium', 'Zinc'],
	es: ['Vitamina C', 'Vitamina D', 'Vitamina A', 'Vitamina B12', 'Folato', 'Hierro', 'Calcio', 'Potasio', 'Magnesio', 'Zinc'],
	fr: ['Vitamine C', 'Vitamine D', 'Vitamine A', 'Vitamine B12', 'Folates', 'Fer', 'Calcium', 'Potassium', 'Magnésium', 'Zinc'],
	de: ['Vitamin C', 'Vitamin D', 'Vitamin A', 'Vitamin B12', 'Folat', 'Eisen', 'Kalzium', 'Kalium', 'Magnesium', 'Zink'],
	vi: ['Vitamin C', 'Vitamin D', 'Vitamin A', 'Vitamin B12', 'Folate', 'Sắt', 'Canxi', 'Kali', 'Magiê', 'Kẽm'],
	ar: ['فيتامين C', 'فيتامين D', 'فيتامين A', 'فيتامين B12', 'الفولات', 'الحديد', 'الكالسيوم', 'البوتاسيوم', 'المغنيسيوم', 'الزنك'],
	hi: ['विटामिन C', 'विटामिन D', 'विटामिन A', 'विटामिन B12', 'फोलेट', 'आयरन', 'कैल्शियम', 'पोटैशियम', 'मैग्नीशियम', 'जिंक'],
	zh: ['维生素C', '维生素D', '维生素A', '维生素B12', '叶酸', '铁', '钙', '钾', '镁', '锌'],
	ja: ['ビタミンC', 'ビタミンD', 'ビタミンA', 'ビタミンB12', '葉酸', '鉄', 'カルシウム', 'カリウム', 'マグネシウム', '亜鉛'],
	ko: ['비타민 C', '비타민 D', '비타민 A', '비타민 B12', '엽산', '철', '칼슘', '칼륨', '마그네슘', '아연']
};

for (const [lang, extra] of Object.entries(SHARED)) {
	const file = path.join(DIR, `${lang}.json`);
	const raw = readFileSync(file, 'utf8');
	const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
	const obj = JSON.parse(raw.replace(/^﻿/, ''));

	Object.assign(obj, extra);
	CUISINES.forEach((c, i) => (obj[`cuisine.${c}`] = CUISINE_LABELS[lang][i]));
	MICROS.forEach((m, i) => (obj[`nutrient.${m}`] = MICRO_LABELS[lang][i]));

	writeFileSync(file, bom + JSON.stringify(obj, null, 2) + '\n', 'utf8');
	console.log(`${lang}: ${Object.keys(obj).length} keys`);
}
