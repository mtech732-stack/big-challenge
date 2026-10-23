// فحص ملفات الأسئلة بحسب docs/content-format.md. دالة خالصة تعمل في المتصفح وفي Node.
// تعيد قائمة أخطاء (تمنع الاعتماد) وتنبيهات (يراجعها الكاتب بعينه).

export const MODES = ['letter', 'last-two', 'auction', 'ranking'];
export const LEVELS = ['easy', 'medium', 'hard'];
export const DOMAINS = ['kuwait-gulf', 'geography', 'history', 'religion', 'language', 'science', 'sports', 'daily-life'];
export const LUCK_EFFECTS = ['lose-3', 'steal-3', 'gift-3'];

// أحجام البنك المطلوبة (القسم 6.2 من الوثيقة)، للعرض لا للمنع.
export const TARGETS = {
  letter: { easy: 20, medium: 20, hard: 20, tiebreak: 20 },
  'last-two': { easy: 20, medium: 20, hard: 20 },
  auction: { easy: 10, medium: 10, hard: 10 },
  ranking: { easy: 10, hard: 10 },
  wheel: { challenges: 7, luck: 3 },
};

// حروف العربية دون التطويل «ـ» (U+0640) الذي يقع داخل مداها.
const ARABIC_LETTER = /^[\u0621-\u063F\u0641-\u064A]$/;
const HINDI_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

// تسوية للمقارنة فقط: تُوحَّد الهمزات والتاء المربوطة والألف المقصورة، وتُحذف الحركات والتطويل والمسافات.
export const fold = text => String(text)
  .replace(/[\u064B-\u0652\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .trim();

// تحذف «ال» قبل توحيد الهمزات، حتى لا تتأثر «ألماس» و«إلكترون».
const stripArticle = text => fold(String(text).replace(/[\u064B-\u0652\u0640]/g, '').trim().replace(/^ال/, ''));

export function checkContent({ index, packs, wheel }) {
  const errors = [];
  const warnings = [];
  const counts = {};
  const err = (where, text) => errors.push(`${where}: ${text}`);
  const warn = (where, text) => warnings.push(`${where}: ${text}`);

  const allowOnly = (where, obj, allowed) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return err(where, 'يجب أن يكون كائناً { }');
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) err(where, `حقل غير معروف «${key}»`);
  };
  const needText = (where, obj, key) => {
    if (typeof obj?.[key] !== 'string' || !obj[key].trim()) return err(where, `الحقل «${key}» مطلوب نصاً غير فارغ`), false;
    if (HINDI_DIGITS.test(obj[key])) err(where, `الحقل «${key}» فيه أرقام هندية (٠١٢)، والمطلوب أرقام إنجليزية`);
    return true;
  };
  const checkCommon = (where, item, levels) => {
    if (!levels.includes(item.level)) err(where, `المستوى «${item.level}» غير صحيح، المسموح: ${levels.join(' · ')}`);
    if (!DOMAINS.includes(item.domain)) err(where, `المجال «${item.domain}» غير صحيح، المسموح: ${DOMAINS.join(' · ')}`);
    if (item.page !== undefined && !(Number.isInteger(item.page) && item.page > 0)) err(where, '«page» رقم صفحة صحيح موجب');
  };
  const checkNames = (where, items) => {
    const seen = new Map();
    items.forEach((it, i) => {
      const at = `${where} · العنصر ${i + 1}`;
      allowOnly(at, it, ['name', 'alts', 'rank']);
      if (!needText(at, it, 'name')) return;
      for (const form of [it.name, ...checkAlts(at, it.alts)]) {
        const key = stripArticle(form);
        if (seen.has(key) && seen.get(key) !== i) err(at, `«${form}» يتكرر مع العنصر ${seen.get(key) + 1}`);
        seen.set(key, i);
      }
    });
  };
  const checkAlts = (where, alts) => {
    if (alts === undefined) return [];
    if (!(Array.isArray(alts) && alts.every(a => typeof a === 'string' && a.trim()))) return err(where, '«alts» قائمة نصوص'), [];
    alts.forEach(a => { if (HINDI_DIGITS.test(a)) err(where, `«${a}» فيه أرقام هندية`); });
    return alts;
  };
  const checkNote = (where, item) => {
    if (item.note !== undefined) needText(where, item, 'note');
  };
  const checkSources = (where, sources, min) => {
    if (sources === undefined && min === 0) return;
    if (!Array.isArray(sources) || sources.length < Math.max(min, 1)) return err(where, `«sources» ${min > 1 ? 'مصدران على الأقل' : 'قائمة مصادر'}`);
    sources.forEach((src, k) => {
      const at = `${where} · المصدر ${k + 1}`;
      allowOnly(at, src, ['title', 'url', 'accessed']);
      needText(at, src, 'title');
      if (typeof src?.url !== 'string' || !/^https?:\/\//.test(src.url)) err(at, '«url» رابط كامل');
      if (typeof src?.accessed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(src.accessed)) err(at, '«accessed» تاريخ الاطلاع بصيغة 2026-10-23');
    });
    if (new Set(sources.map(src => src?.url)).size < sources.length) err(where, 'مصدران متطابقا الرابط');
  };
  const tally = (mode, key) => {
    counts[mode] ??= {};
    counts[mode][key] = (counts[mode][key] ?? 0) + 1;
  };

  // فهرس الحزم
  allowOnly('packs/index.json', index, ['packs']);
  if (!Array.isArray(index?.packs) || !index.packs.length) err('packs/index.json', '«packs» قائمة بمعرّفات الحزم');

  const ids = new Map();
  for (const [packId, pack] of Object.entries(packs)) {
    const base = `packs/${packId}`;
    const meta = pack['pack.json'];
    allowOnly(`${base}/pack.json`, meta, ['id', 'name', 'description', 'excludeModes']);
    if (meta?.id !== packId) err(`${base}/pack.json`, `«id» يجب أن يطابق اسم المجلد «${packId}»`);
    needText(`${base}/pack.json`, meta, 'name');
    const excluded = meta?.excludeModes ?? [];
    if (!Array.isArray(excluded) || excluded.some(m => !MODES.includes(m))) {
      err(`${base}/pack.json`, `«excludeModes» قائمة من: ${MODES.join(' · ')}`);
    }
    if (MODES.length - excluded.length < 2) err(`${base}/pack.json`, 'لا تكفي الأنماط الباقية لمباراة قصيرة (جولتان)');
    // البنك يُكتب شريحة بعد شريحة: النمط بلا ملف «غير متاح بعد» ولا يظهر في الاختيار.
    const available = MODES.filter(m => !excluded.includes(m) && pack[`${m}.json`]);
    if (available.length < 2) warn(`${base}/pack.json`, `الأنماط المتاحة الآن ${available.length}، ولا تُلعب الحزمة قبل نمطين`);
    // كسر التعادل من أسئلة «الحرف المعيّن»، فاستثناؤه يُذكر تنبيهاً.
    if (excluded.includes('letter')) warn(`${base}/pack.json`, 'الحزمة تستثني «الحرف المعيّن»، وكسر التعادل يعتمد عليه');

    for (const mode of MODES) {
      const file = `${base}/${mode}.json`;
      const data = pack[`${mode}.json`];
      if (excluded.includes(mode)) {
        if (data) warn(file, 'الملف موجود والنمط مستثنى في pack.json، فلن يُستعمل');
        continue;
      }
      if (!data) { warn(file, 'النمط غير متاح بعد: لا ملف له، فلن يظهر في الاختيار'); continue; }
      const listKey = { letter: 'questions', 'last-two': 'questions', auction: 'topics', ranking: 'lists' }[mode];
      allowOnly(file, data, ['mode', listKey]);
      if (data.mode !== mode) err(file, `«mode» يجب أن يكون «${mode}»`);
      const list = data[listKey];
      if (!Array.isArray(list)) { err(file, `«${listKey}» قائمة`); continue; }

      list.forEach((item, i) => {
        const where = `${file} · ${item?.id ?? `رقم ${i + 1}`}`;
        if (typeof item?.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id)) err(where, '«id» بحروف إنجليزية صغيرة وأرقام وشرطات');
        else if (ids.has(item.id)) err(where, `«id» مكرر (سبق في ${ids.get(item.id)})`);
        else ids.set(item.id, file);

        if (mode === 'letter') {
          allowOnly(where, item, ['id', 'level', 'letter', 'prompt', 'answer', 'alts', 'domain', 'tiebreak', 'page', 'note']);
          checkCommon(where, item, LEVELS);
          checkNote(where, item);
          needText(where, item, 'prompt');
          if (typeof item.letter !== 'string' || !ARABIC_LETTER.test(item.letter)) err(where, '«letter» حرف عربي واحد');
          const answers = needText(where, item, 'answer') ? [item.answer, ...checkAlts(where, item.alts)] : [];
          if (ARABIC_LETTER.test(item.letter ?? '')) for (const a of answers) {
            if (!stripArticle(a).startsWith(fold(item.letter))) warn(where, `الإجابة «${a}» لا تبدأ بالحرف «${item.letter}»`);
          }
          if (item.tiebreak !== undefined && item.tiebreak !== true) err(where, '«tiebreak» إما true وإما يُحذف');
          if (item.tiebreak && item.level !== 'hard') err(where, 'أسئلة كسر التعادل صعبة فقط');
          tally(mode, item.tiebreak ? 'tiebreak' : item.level);
        }

        if (mode === 'last-two') {
          allowOnly(where, item, ['id', 'level', 'ending', 'prompt', 'answer', 'alts', 'domain', 'page', 'note']);
          checkCommon(where, item, LEVELS);
          checkNote(where, item);
          needText(where, item, 'prompt');
          const answers = needText(where, item, 'answer') ? [item.answer, ...checkAlts(where, item.alts)] : [];
          if (typeof item.ending !== 'string' || [...item.ending].length !== 2 || ![...item.ending].every(c => ARABIC_LETTER.test(c))) {
            err(where, '«ending» حرفان عربيان دون تطويل (مثل «ان»)');
          } else for (const a of answers) {
            if (!fold(a).endsWith(fold(item.ending))) warn(where, `الإجابة «${a}» لا تنتهي بـ«${item.ending}»`);
          }
          tally(mode, item.level);
        }

        if (mode === 'auction') {
          allowOnly(where, item, ['id', 'level', 'topic', 'items', 'sources', 'domain', 'page', 'note']);
          checkCommon(where, item, LEVELS);
          checkNote(where, item);
          checkSources(where, item.sources, 0);
          needText(where, item, 'topic');
          if (!Array.isArray(item.items) || item.items.length < 3) err(where, '«items» قائمة مرجعية كاملة (3 عناصر على الأقل)');
          else checkNames(where, item.items);
          tally(mode, item.level);
        }

        if (mode === 'ranking') {
          allowOnly(where, item, ['id', 'level', 'title', 'asOf', 'items', 'sources', 'domain', 'page', 'note']);
          checkCommon(where, item, ['easy', 'hard']);
          checkNote(where, item);
          needText(where, item, 'title');
          if (typeof item.asOf !== 'string' || !/^\d{4}(-\d{2})?$/.test(item.asOf)) err(where, '«asOf» تاريخ القائمة بصيغة 2026 أو 2026-05');
          // الوثيقة (6.4) تشترط التاريخ في العنوان للقائمة المرتبطة بزمن، فغيابه تنبيه يقرّره الكاتب.
          else if (!String(item.title).includes(item.asOf.slice(0, 4))) warn(where, `العنوان لا يذكر سنة القائمة ${item.asOf.slice(0, 4)}، وهو لازم إن كانت القائمة مرتبطة بزمن`);
          if (!Array.isArray(item.items) || item.items.length !== 13) err(where, '«items» 13 عنصراً بالضبط (10 ظاهرة و3 فخاخ)');
          else {
            item.items.forEach((it, r) => { if (it?.rank !== r + 1) err(`${where} · العنصر ${r + 1}`, `«rank» يجب أن يكون ${r + 1}`); });
            checkNames(where, item.items);
          }
          checkSources(where, item.sources, 2);
          tally(mode, item.level);
        }
      });
    }
  }
  for (const id of index?.packs ?? []) if (!packs[id]) err('packs/index.json', `الحزمة «${id}» مذكورة ولا مجلد لها`);
  for (const id of Object.keys(packs)) if (!(index?.packs ?? []).includes(id)) err('packs/index.json', `المجلد «${id}» غير مذكور في الفهرس`);

  // العجلة
  allowOnly('wheel.json', wheel, ['challenges', 'luck']);
  if (!Array.isArray(wheel?.challenges) || !wheel.challenges.length) err('wheel.json', '«challenges» قائمة التحديات');
  else wheel.challenges.forEach((c, i) => {
    const at = `wheel.json · ${c?.id ?? `تحدٍّ ${i + 1}`}`;
    allowOnly(at, c, ['id', 'text', 'note']);
    if (c) checkNote(at, c);
    if (typeof c?.id !== 'string' || !/^[a-z0-9-]+$/.test(c.id)) err(at, '«id» بحروف إنجليزية صغيرة وأرقام وشرطات');
    else if (ids.has(c.id)) err(at, '«id» مكرر'); else ids.set(c.id, 'wheel.json');
    needText(at, c, 'text');
    tally('wheel', 'challenges');
  });
  const effects = (wheel?.luck ?? []).map(l => l?.effect);
  if (!Array.isArray(wheel?.luck) || effects.length !== 3 || LUCK_EFFECTS.some(e => !effects.includes(e))) {
    err('wheel.json', `«luck» ثلاث خانات بالتأثيرات: ${LUCK_EFFECTS.join(' · ')}`);
  }
  (wheel?.luck ?? []).forEach((l, i) => {
    allowOnly(`wheel.json · خانة حظ ${i + 1}`, l, ['effect', 'label']);
    needText(`wheel.json · خانة حظ ${i + 1}`, l, 'label');
    tally('wheel', 'luck');
  });

  return { errors, warnings, counts };
}
