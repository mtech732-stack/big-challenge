// ينسخ ملفات اللعبة من جذر المستودع إلى www/ ليحملها التطبيق داخله (الخطة 5.1).
// مصدر واحد: لا تُعدَّل اللعبة هنا أبداً؛ كل تعديل في ملفاتها الأصلية ثم يُعاد النسخ.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'www');
const FILES = ['index.html', 'audience.html', 'pin.json', 'sw.js', 'css', 'js', 'content', 'tools/pin.html', 'design/logo'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of FILES) cpSync(join(root, f), join(out, f), { recursive: true });
console.log(`نُسخت ملفات اللعبة إلى ${out}`);
