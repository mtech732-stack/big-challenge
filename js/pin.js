// الرقم السري: المستودع عام، فلا يُحفظ فيه إلا صورة مشفّرة من الرقم (PBKDF2-SHA256 مع ملح).
// الملف pin.json يغيّره المالك وحده، وتولّد صورته صفحة tools/pin.html.
const PIN_FILE = 'pin.json';
const CACHE_KEY = 'big-challenge.pin-record';

// يحوّل الأرقام العربية والفارسية إلى إنجليزية، ويحذف ما سوى الأرقام.
export const normalizePin = text => String(text)
  .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
  .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0)
  .replace(/\D/g, '');

const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));

export async function hashPin(pin, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
const writeCache = record => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(record)); } catch {} };

// يجلب الصورة المشفّرة من المستودع دون ذاكرة مؤقتة. إن تعذّر الاتصال يعود بآخر نسخة معروفة،
// ويعيد null للسجل إن لم توجد أي نسخة. وإن وصل الملف ناقصاً أو تالفاً يعيد bad: true دون سجل،
// حتى لا يظن المالك أن المشكلة في الشبكة، ولا يُقبل الرقم القديم من النسخة المحفوظة.
export async function fetchPinRecord() {
  let res;
  try {
    res = await fetch(`${PIN_FILE}?t=${Date.now()}`, { cache: 'no-store' });
  } catch {
    return { record: readCache(), online: false, bad: false };
  }
  try {
    if (!res.ok) throw new Error(res.status);
    const record = await res.json();
    if (!/^[0-9a-f]{32,}$/.test(record.salt) || !/^[0-9a-f]{64}$/.test(record.hash) || !(record.iterations > 0)) {
      throw new Error('bad record');
    }
    writeCache(record);
    return { record, online: true, bad: false };
  } catch {
    // خطأ مؤقت من الخادم (5xx) يُعامل كانقطاع، وغيره خطأ في الملف.
    if (res.status >= 500) return { record: readCache(), online: false, bad: false };
    return { record: null, online: true, bad: true };
  }
}

export async function checkPin(pin, record) {
  return (await hashPin(normalizePin(pin), record.salt, record.iterations)) === record.hash;
}

// التحقق المستمر: يعيد التحقق كل بضع دقائق، وعند طلبه (بدء كل مباراة جديدة).
// يُغلق فقط عند التأكد: جُلب الملف من الإنترنت فعلاً، ولم يعد الرقم المُدخل يطابقه.
// إن تعذّر الاتصال تستمر اللعبة كما هي.
export const CHECK_EVERY_MS = 3 * 60 * 1000;

export function watchPin(pin, onChanged, everyMs = CHECK_EVERY_MS) {
  let busy = false;
  const checkNow = async () => {
    if (busy) return 'busy';
    busy = true;
    try {
      const { record, online, bad } = await fetchPinRecord();
      if (bad) return 'bad-file';
      if (!online || !record) return 'offline';
      if (await checkPin(pin, record)) return 'same';
      stop();
      onChanged();
      return 'changed';
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(checkNow, everyMs);
  const stop = () => clearInterval(timer);
  return { checkNow, stop };
}
