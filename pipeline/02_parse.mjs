/**
 * Stage 02 — parse raw sources into a normalised intermediate record.
 *
 * Input:  pipeline/data/*
 * Output: pipeline/out/recipes.jsonl
 *
 * Record shape:
 * {
 *   source_url, source_lang, license, attribution,
 *   title, instructions,
 *   ingredient_lines: string[],      // raw, unparsed, source language
 *   servings: number | null,         // null => stage 05 assumes DEFAULT_SERVINGS
 *   prep_minutes: number | null,
 *   total_minutes: number | null,
 *   cuisine: string | null,          // canonical key or null
 *   meal_type: string | null
 * }
 */

// TODO(phase 2): wikitext -> structured recipe; extract "serves N" / "makes N";
// drop entries without a usable ingredient list or instructions.
console.log('02_parse: not implemented');
