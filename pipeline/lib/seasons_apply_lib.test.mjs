import { describe, it, expect } from 'vitest';
import { checkBatch } from './seasons_apply_lib.mjs';

const INGREDIENTS = ['asparagus', 'basil', 'fresh_basil', 'thai_basil', 'flour', 'tomato', 'tomato_puree', 'tomato_juice', 'goose', 'herring', 'potato'].map(
	(canonical_key) => ({ canonical_key, category: 'vegetable' })
);
const SEASONAL = { z: { trop: 'none', med: '4-6', cont: '6-8' }, p: ['med:n'] };

const sources = () => ({
	produce: { tomato: { z: { trop: 'all', med: '6-9', cont: '7-9' }, p: ['med:n'] } },
	herbs: { basil: { z: { trop: 'all', med: '5-9', cont: '7-8' }, p: ['med:n'] }, fresh_basil: { like: 'basil' } },
	fungi_nuts: {},
	animal: {},
	allyear: { flour: { ay: 'staple' } }
});
const run = (batch, extra = {}) => checkBatch({ batch, ingredients: INGREDIENTS, sources: sources(), ...extra });
const rules = (r) => r.errors.map((e) => `${e.key ?? ''}:${e.rule}`);

describe('checkBatch', () => {
	it('places ay in allyear, seasonal in the assigned family, like next to its target', () => {
		const r = run(
			{ tomato_puree: { ay: 'processed' }, asparagus: SEASONAL, thai_basil: { like: 'basil' } },
			{ assignments: new Map([['asparagus', 'produce']]) }
		);
		expect(r.errors).toEqual([]);
		expect(Object.fromEntries(r.placed)).toEqual({ tomato_puree: 'allyear', asparagus: 'produce', thai_basil: 'herbs' });
		expect(r.merged.allyear.tomato_puree).toEqual({ ay: 'processed' });
		expect(r.merged.produce.asparagus).toBe(SEASONAL);
		expect(r.merged.herbs.thai_basil).toEqual({ like: 'basil' });
		expect(r.remaining).toBe(4);
	});

	it('resolves a like whose target is in the same batch', () => {
		const r = run({ potato: SEASONAL, asparagus: { like: 'potato' } }, { family: 'produce' });
		expect(r.errors).toEqual([]);
		expect(r.placed.get('asparagus')).toBe('produce');
	});

	it('rejects the whole batch for one bad entry', () => {
		const r = run({ asparagus: SEASONAL, potato: { ...SEASONAL, st: 12 } }, { family: 'produce' });
		expect(rules(r)).toEqual(['potato:st']);
	});

	it('rejects unknown keys, already decided keys, missing family, bad batch shape', () => {
		expect(rules(run({ durian: SEASONAL }, { family: 'produce' }))).toEqual(['durian:unknown-key']);
		expect(rules(run({ flour: { ay: 'processed' } }))).toEqual(['flour:duplicate-key']);
		expect(rules(run({ potato: SEASONAL }))).toEqual(['potato:family']);
		expect(rules(run({ potato: SEASONAL }, { family: 'allyear' }))).toEqual([':family']);
		expect(rules(run([]))).toEqual([':batch']);
		expect(rules(run({}))).toEqual([':batch']);
		expect(rules(run({ potato: 'spring' }, { family: 'produce' }))).toEqual(['potato:shape']);
	});

	it('runs the entry rules: like targets, processed keys', () => {
		expect(rules(run({ thai_basil: { like: 'flour' } }))).toEqual(['thai_basil:like-target']);
		expect(rules(run({ tomato_juice: SEASONAL }, { family: 'produce' }))).toEqual(['tomato_juice:processed']);
	});

	it('with overwrite, replaces an entry, moves it between files, and protects the likes pointing at it', () => {
		const moved = run({ tomato: { ay: 'cultivated' } }, { overwrite: true });
		expect(moved.errors).toEqual([]);
		expect(moved.merged.produce.tomato).toBeUndefined();
		expect(moved.merged.allyear.tomato).toEqual({ ay: 'cultivated' });
		const broken = run({ basil: { ay: 'cultivated' } }, { overwrite: true });
		expect(rules(broken)).toEqual(['fresh_basil:like-target']);
	});

	it('records seasonal verdicts for undecided keys and routes later entries with them', () => {
		const r = run({ goose: { seasonal: 'animal' }, herring: { ay: 'traded' } });
		expect(r.errors).toEqual([]);
		expect(r.recorded).toBe(1);
		expect(r.verdicts).toEqual({ goose: 'animal' });
		expect(r.placed.has('goose')).toBe(false);
		expect(rules(run({ flour: { seasonal: 'produce' } }))).toEqual(['flour:verdict']);
		expect(rules(run({ goose: { seasonal: 'allyear' } }))).toEqual(['goose:family']);
		const later = run({ goose: SEASONAL }, { verdicts: { goose: 'animal' } });
		expect(later.errors).toEqual([]);
		expect(later.placed.get('goose')).toBe('animal');
		expect(later.verdicts).toEqual({});
	});
});
