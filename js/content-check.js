// فحص ملفات الأسئلة بحسب docs/content-format.md. دالة خالصة تعمل في المتصفح وفي Node.
// تعيد قائمة أخطاء (تمنع الاعتماد) وتنبيهات (يراجعها الكاتب بعينه).

export const MODES = ['letter', 'last-two', 'auction', 'ranking'];
export const LEVELS = ['easy', 'medium', 'hard'];
export const DOMAINS = ['kuwait-gulf', 'geography', 'history', 'religion', 'language', 'science', 'sports', 'daily-life'];
export const LUCK_EFFECTS = ['lose-3', 'steal-3', 'gift-3'];

// حدود ما تتسع له الشاشة دون تصغير الخط (design/system.md، القسم 7)، بالمسافات والتشكيل.
export const QUESTION_MAX = 85;
export const TEAM_NAME_MAX = 18;
// حدود ش1 (design/start.md، القسم 2.5): اسم النمط في خانة المسار الأضيق، واسم الحزمة مع شارة الطريقة في صف واحد.
export const MODE_NAME_MAX = 13;
export const PACK_NAME_MAX = 30;
// حدّا ش2 (design/letter.md، القسم 2.6): ما يتسع في نافذة المقدّم على حاسوب 1366×768 دون تمرير. تنبيهان لا خطآن.
export const ANSWER_MAX = 20;
export const ALTS_MAX = 50;
export const altsText = alts => (alts ?? []).join('، ');
// حدّا ش4 (design/auction.md 3): موضوع المزاد سطر واحد بجوار العدّ «12 من 12»، واسم العنصر في شارته. تنبيهان لا خطآن.
export const TOPIC_MAX = 32;
export const ITEM_MAX = 20;
// حدود ش5 (design/ranking.md 3): عنوان الترتيب (ما قبل « · ») سطر 64، وإشارته (ما بعده) 32 بجانبه، واسم العنصر في خانته (ITEM_MAX). تنبيهات لا أخطاء.
export const RANK_TITLE_MAX = 32;
export const RANK_SUB_MAX = 31;
// أقل قائمة في بنك المزاد (المالك، 24 أكتوبر 2026): دونها لا تتحقق المزايدة. حدّ أدنى لا هدف.
export const AUCTION_MIN = 10;
// أسئلة كل مستوى في الجولة لكل فريق سؤال (5.3 و5.4)، فسؤالان من كل مستوى في جولة «آخر حرفين» بنهاية واحدة.
export const ROUND_PER_LEVEL = 2;
const length = text => [...String(text)].length;

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

// تقاطع الترتيب وغيره (تدقيق ش5 «ثالثاً» و«رابعاً»): نهاية قائمة الترتيب تكشف عناصرها، وبعد الحكم تظهر قائمة المزاد كاملة
// وإجابة السؤال. فلا تجتمع في مباراة واحدة قائمة ترتيب و:
//   (1) موضوع مزاد يشتركان في 7 فأكثر من عناصر القائمة الثلاثة عشر (أكثر من نصفها) · (2) سؤال حرف معيّن أو آخر حرفين
//   تساوي إجابته (أو صيغتها) عنصراً من القائمة (أو صيغته) · (3) قائمة ترتيب أخرى تشتركان في 7 فأكثر («خامساً»: لا تجتمعان في الجولة).
// والمقارنة بتوحيد الهمزات والتاء والألف المقصورة و«ال».
export const CLASH_MIN = 7;
const forms = list => list.filter(f => typeof f === 'string').map(stripArticle);
const formsOf = it => forms([it?.name, ...(it?.alts ?? [])]);
export const sharedItems = (list, topic) => {
  const pool = new Set((topic?.items ?? []).flatMap(formsOf));
  return (list?.items ?? []).filter(it => formsOf(it).some(f => pool.has(f))).length;
};
// الأزواج المتقاطعة في حزمة: [{ ranking, with, mode, n }]، وn ما اشتركا فيه. وزوج القائمتين مرة واحدة (mode: 'ranking').
export function clashes(files) {
  const pairs = [];
  const lists = files?.['ranking.json']?.lists ?? [];
  lists.forEach((list, i) => lists.slice(i + 1).forEach(other => {
    const n = sharedItems(list, other);
    if (n >= CLASH_MIN) pairs.push({ ranking: list.id, with: other.id, mode: 'ranking', n });
  }));
  for (const list of lists) {
    for (const topic of files?.['auction.json']?.topics ?? []) {
      const n = sharedItems(list, topic);
      if (n >= CLASH_MIN) pairs.push({ ranking: list.id, with: topic.id, mode: 'auction', n });
    }
    const pool = new Set((list.items ?? []).flatMap(formsOf));
    for (const mode of ['letter', 'last-two']) for (const q of files?.[`${mode}.json`]?.questions ?? []) {
      const n = forms([q?.answer, ...(q?.alts ?? [])]).filter(f => pool.has(f)).length;
      if (n) pairs.push({ ranking: list.id, with: q.id, mode, n });
    }
  }
  return pairs;
}

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
  const checkLength = (where, item, key) => {
    if (typeof item?.[key] === 'string' && length(item[key]) > QUESTION_MAX) {
      err(where, `«${key}» ${length(item[key])} حرفاً، والحد ${QUESTION_MAX} (ثلاثة أسطر على الشاشة)`);
    }
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
    if (needText(`${base}/pack.json`, meta, 'name') && length(meta.name) > PACK_NAME_MAX) {
      err(`${base}/pack.json`, `«name» ${length(meta.name)} حرفاً، والحد ${PACK_NAME_MAX} (شارة على شاشة الجمهور)`);
    }
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
          checkLength(where, item, 'prompt');
          if (typeof item.letter !== 'string' || !ARABIC_LETTER.test(item.letter)) err(where, '«letter» حرف عربي واحد');
          const answers = needText(where, item, 'answer') ? [item.answer, ...checkAlts(where, item.alts)] : [];
          if (ARABIC_LETTER.test(item.letter ?? '')) for (const a of answers) {
            if (!stripArticle(a).startsWith(fold(item.letter))) warn(where, `الإجابة «${a}» لا تبدأ بالحرف «${item.letter}»`);
          }
          if (typeof item.answer === 'string' && length(item.answer) > ANSWER_MAX) warn(where, `الإجابة النموذجية ${length(item.answer)} حرفاً، والحد ${ANSWER_MAX} (سطر واحد في نافذة المقدّم)`);
          if (Array.isArray(item.alts) && length(altsText(item.alts)) > ALTS_MAX) warn(where, `البدائل ${length(altsText(item.alts))} حرفاً مجتمعة بالفواصل، والحد ${ALTS_MAX} (سطر واحد في نافذة المقدّم)`);
          if (item.tiebreak !== undefined && item.tiebreak !== true) err(where, '«tiebreak» إما true وإما يُحذف');
          if (item.tiebreak && item.level !== 'hard') err(where, 'أسئلة كسر التعادل صعبة فقط');
          tally(mode, item.tiebreak ? 'tiebreak' : item.level);
        }

        if (mode === 'last-two') {
          allowOnly(where, item, ['id', 'level', 'ending', 'prompt', 'answer', 'alts', 'domain', 'page', 'note']);
          checkCommon(where, item, LEVELS);
          checkNote(where, item);
          needText(where, item, 'prompt');
          checkLength(where, item, 'prompt');
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
          checkLength(where, item, 'topic');
          if (typeof item.topic === 'string' && length(item.topic) > TOPIC_MAX) warn(where, `الموضوع ${length(item.topic)} حرفاً، والحد ${TOPIC_MAX} (سطر واحد بجوار العدّ)`);
          if (!Array.isArray(item.items) || item.items.length < AUCTION_MIN) err(where, `«items» قائمة مرجعية كاملة (${AUCTION_MIN} عناصر على الأقل، لتتحقق المزايدة)`);
          else {
            checkNames(where, item.items);
            item.items.forEach((it, k) => { if (typeof it?.name === 'string' && length(it.name) > ITEM_MAX) warn(`${where} · العنصر ${k + 1}`, `«${it.name}» ${length(it.name)} حرفاً، والحد ${ITEM_MAX} (شارة العنصر)`); });
          }
          tally(mode, item.level);
        }

        if (mode === 'ranking') {
          allowOnly(where, item, ['id', 'level', 'title', 'asOf', 'items', 'sources', 'domain', 'page', 'note']);
          checkCommon(where, item, ['easy', 'hard']);
          checkNote(where, item);
          needText(where, item, 'title');
          if (typeof item.title === 'string') {
            const at = item.title.indexOf(' · '), main = at < 0 ? item.title : item.title.slice(0, at), sub = at < 0 ? '' : item.title.slice(at + 3);
            if (length(main) > RANK_TITLE_MAX) warn(where, `العنوان قبل « · » ${length(main)} حرفاً، والحد ${RANK_TITLE_MAX} (سطر واحد فوق اللوحة)`);
            if (length(sub) > RANK_SUB_MAX) warn(where, `ما بعد « · » في العنوان ${length(sub)} حرفاً، والحد ${RANK_SUB_MAX} (الإشارة بجانب العنوان)`);
          }
          if (typeof item.asOf !== 'string' || !/^\d{4}(-\d{2})?$/.test(item.asOf)) err(where, '«asOf» تاريخ القائمة بصيغة 2026 أو 2026-05');
          // الوثيقة (6.4) تشترط التاريخ في العنوان للقائمة المرتبطة بزمن، فغيابه تنبيه يقرّره الكاتب.
          else if (!String(item.title).includes(item.asOf.slice(0, 4))) warn(where, `العنوان لا يذكر سنة القائمة ${item.asOf.slice(0, 4)}، وهو لازم إن كانت القائمة مرتبطة بزمن`);
          if (!Array.isArray(item.items) || item.items.length !== 13) err(where, '«items» 13 عنصراً بالضبط (10 ظاهرة و3 فخاخ)');
          else {
            item.items.forEach((it, r) => { if (it?.rank !== r + 1) err(`${where} · العنصر ${r + 1}`, `«rank» يجب أن يكون ${r + 1}`); });
            checkNames(where, item.items);
            item.items.forEach((it, k) => { if (typeof it?.name === 'string' && length(it.name) > ITEM_MAX) warn(`${where} · العنصر ${k + 1}`, `«${it.name}» ${length(it.name)} حرفاً، والحد ${ITEM_MAX} (خانة اللوحة)`); });
          }
          checkSources(where, item.sources, 2);
          tally(mode, item.level);
        }
      });
      // تقاطع الترتيب والمزاد: تنبيه بالزوج، واللعبة لا تجمعهما في مباراة واحدة (js/play.js).
      if (mode === 'ranking') for (const c of clashes(pack)) warn(`${file} · ${c.ranking}`, c.mode !== 'letter' && c.mode !== 'last-two'
        ? `يشترك مع ${c.mode === 'auction' ? 'موضوع المزاد' : 'القائمة'} «${c.with}» في ${c.n} ${c.n <= 10 ? 'عناصر' : 'عنصراً'} من 13، فلا يجتمعان في مباراة واحدة`
        : `فيه إجابة السؤال «${c.with}» (${c.mode === 'letter' ? 'الحرف المعيّن' : 'آخر حرفين'})، فلا يجتمعان في مباراة واحدة`);
      // «آخر حرفين» بنهاية واحدة للجولة كلها (الوثيقة 1.1، 5.4 و6.2): البنك مجموعات، كل نهاية فيها سؤالان
      // على الأقل من كل مستوى، فتكفي جولة كاملة. والنهاية الناقصة لا تُلعب، فتُرفض.
      if (mode === 'last-two') {
        const groups = {};
        for (const q of list) if (typeof q?.ending === 'string' && LEVELS.includes(q.level)) (groups[q.ending] ??= { easy: 0, medium: 0, hard: 0 })[q.level]++;
        for (const [ending, c] of Object.entries(groups)) {
          if (LEVELS.some(l => c[l] < ROUND_PER_LEVEL)) err(`${file} · «${ending}»`, `مجموعة ناقصة: كل نهاية تحتاج ${ROUND_PER_LEVEL} من كل مستوى لتكفي جولة (الموجود: سهل ${c.easy} · متوسط ${c.medium} · صعب ${c.hard})`);
        }
      }
    }
  }
  for (const id of index?.packs ?? []) if (!packs[id]) err('packs/index.json', `الحزمة «${id}» مذكورة ولا مجلد لها`);
  for (const id of Object.keys(packs)) if (!(index?.packs ?? []).includes(id)) err('packs/index.json', `المجلد «${id}» غير مذكور في الفهرس`);

  // العجلة: تُكتب في ش6، فغياب ملفها تنبيه كغياب ملفات الأنماط.
  if (wheel === undefined) warn('wheel.json', 'العجلة غير متاحة بعد: لا ملف لها');
  else {
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
  }

  return { errors, warnings, counts };
}
