// One-shot helper: copy .env.example -> .env (or .env.test.example -> .env.test
// with --test) and inject a fresh SESSION_SECRET. Refuses to overwrite unless
// --force is passed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const isTest = args.has('--test');
const force = args.has('--force');

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, isTest ? '.env.test.example' : '.env.example');
const dest = resolve(root, isTest ? '.env.test' : '.env');

if (existsSync(dest) && !force) {
  console.log(`[bootstrap-env] ${dest} already exists, leaving it untouched. Pass --force to overwrite.`);
  process.exit(0);
}

const template = readFileSync(src, 'utf8');
const secret = randomBytes(48).toString('hex');
// Both templates use the same placeholder convention; .env.test.example uses a
// literal 'test-secret-change-me-...' string. Replace either form.
const out = template
  .replace('replace-with-long-random-hex', secret)
  .replace(/test-secret-change-me-to-32-or-more-chars-please/g, secret);
writeFileSync(dest, out);
console.log(`[bootstrap-env] wrote ${dest}`);
console.log(`[bootstrap-env] SESSION_SECRET length: ${secret.length}`);
