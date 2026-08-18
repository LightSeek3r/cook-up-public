/**
 * Stage 01 — fetch raw sources into pipeline/data/ (git-ignored).
 *
 * Sources (all commercial-safe, decision ADR-A1):
 *  - Wikibooks Cookbook XML dump          CC BY-SA 3.0  (share-alike on derived data)
 *  - Public-domain cookbooks (Gutenberg)  PD
 *  - Open Food Facts ingredient taxonomy  ODbL          (canonical keys + 10-language names)
 *  - USDA FoodData Central                Public domain (per-100 g nutrients + portion weights)
 *
 * Nothing in pipeline/ is deployed. It runs locally and its only output is a
 * seeded D1 database.
 *
 * Output: pipeline/data/{wikibooks.xml, gutenberg/*, off-taxonomy.json, fdc/*.csv}
 */

// TODO(phase 2): download + checksum each source, resumable, with a manifest
// recording URL, retrieval date and license so attribution can be regenerated.
console.log('01_fetch: not implemented');
