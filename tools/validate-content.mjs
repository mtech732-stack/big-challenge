// فحص ملفات الأسئلة من سطر الأوامر:
//   node tools/validate-content.mjs [المجلد]   (الافتراضي content/)
// المجلد فيه packs/index.json وpacks/<الحزمة>/... وwheel.json.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkContent, TARGETS } from '../js/content-check.js';

const root = process.argv[2] || 'content';
const parseErrors = [];
const read = file => {
  const path = join(root, file);
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { parseErrors.push(`${file}: ليس JSON صحيحاً (${e.message})`); return null; }
};

const index = read('packs/index.json');
const packs = {};
const packsDir = join(root, 'packs');
if (existsSync(packsDir)) {
  for (const id of readdirSync(packsDir)) {
    if (!statSync(join(packsDir, id)).isDirectory()) continue;
    packs[id] = {};
    for (const file of readdirSync(join(packsDir, id))) {
      if (file.endsWith('.json')) packs[id][file] = read(`packs/${id}/${file}`);
    }
  }
}
const wheel = read('wheel.json');

const { errors, warnings, counts } = checkContent({ index, packs, wheel });
const all = [...parseErrors, ...errors];

console.log(`فحص ${root}`);
console.log('\nالأعداد مقابل المطلوب للبنك الكامل:');
for (const [mode, target] of Object.entries(TARGETS)) {
  const line = Object.entries(target).map(([k, v]) => `${k} ${counts[mode]?.[k] ?? 0}/${v}`).join(' · ');
  console.log(`  ${mode}: ${line}`);
}
if (warnings.length) console.log(`\nتنبيهات (${warnings.length}):\n  ${warnings.join('\n  ')}`);
if (all.length) console.log(`\nأخطاء (${all.length}):\n  ${all.join('\n  ')}`);
console.log(all.length ? '\nالنتيجة: فشل' : '\nالنتيجة: سليم');
process.exit(all.length ? 1 : 0);
