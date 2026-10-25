// تحميل الحزم في المتصفح: فهرس الحزم، ثم pack.json لكل حزمة، ثم ملفات أنماطها الموجودة.
// ما وصل مرة بإنترنت يحفظه عامل الحفظ (sw.js)، فيُقرأ بلا إنترنت.
// تُطلب ملفات الأنماط المبنية وحدها، فلا يُطلب ملف نمط لم تُبنَ شريحته بعد (الملاحظة 31).
import { MODES, DRAFTS } from './modes/index.js';
import { LAYOUT } from './wheel.js';

const BUILT = [...MODES, ...DRAFTS].map(m => m.id);

const ROOT = 'content/packs';

const getJson = async url => {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch { return null; }
};

// يعيد [{ id, name, description, excludeModes, files: { 'pack.json': …, 'letter.json': … } }] بترتيب الفهرس.
export async function loadPacks() {
  const index = await getJson(`${ROOT}/index.json`);
  const ids = Array.isArray(index?.packs) ? index.packs : [];
  const packs = await Promise.all(ids.map(async id => {
    const meta = await getJson(`${ROOT}/${id}/pack.json`);
    if (!meta) return null;
    const files = { 'pack.json': meta };
    await Promise.all(BUILT.filter(m => !(meta.excludeModes ?? []).includes(m)).map(async m => {
      const data = await getJson(`${ROOT}/${id}/${m}.json`);
      if (data) files[`${m}.json`] = data;
    }));
    return { id, name: meta.name, description: meta.description ?? '', excludeModes: meta.excludeModes ?? [], files };
  }));
  return packs.filter(Boolean);
}

// تحديات العجلة وخانات الحظ (content/wheel.json، لكل الحزم). لا تُلعب العجلة إلا بسبعة تحديات وخانات الحظ الثلاث،
// وإلا بقيت تُتخطى كما كانت.
export async function loadWheel() {
  const wheel = await getJson('content/wheel.json');
  const need = LAYOUT.filter(k => k === 'c').length;
  const ok = Array.isArray(wheel?.challenges) && wheel.challenges.filter(c => c?.text).length >= need
    && LAYOUT.filter(k => k !== 'c').every(k => (wheel.luck ?? []).some(l => l?.effect === k && l.label));
  return ok ? wheel : null;
}
