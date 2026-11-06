// القناة بين الصفحة وشاشة الجمهور المضمّنة فيها (الشاشة المشتركة). المباراة بنافذة واحدة وحدها (الوثيقة 1.13)،
// فلا قناة بين نوافذ: postMessage بين الصفحة (presenter) وإطارها (audience) من الأصل نفسه.
// وعند تحميل الإطار يرسل «hello»، فتعرف الصفحة أنه جاهز وترد بـ«hi»، ثم يطلب حال المباراة (need-view).
export function createLink(role, onMessage) {
  const peer = () => (role === 'presenter' ? document.querySelector('#frame iframe')?.contentWindow : parent !== window ? parent : null);
  let connected = false;
  const statusListeners = [];
  const send = (type, data = {}) => peer()?.postMessage({ bc: 'link', from: role, type, data }, location.origin);
  const setConnected = value => {
    if (value === connected) return;
    connected = value;
    statusListeners.forEach(fn => fn(connected));
  };
  addEventListener('message', e => {
    const msg = e.data;
    if (e.origin !== location.origin || msg?.bc !== 'link' || msg.from === role || !peer() || e.source !== peer()) return;
    if (msg.type === 'hello') { send('hi'); setConnected(true); return; }
    if (msg.type === 'hi') { setConnected(true); return; }
    onMessage(msg.type, msg.data);
  });
  send('hello');
  return {
    send,
    // أُزيل الإطار (أُغلقت اللعبة لتغيّر الرقم مثلاً): لا شيء متصل حتى يُحمَّل غيره.
    lost() { setConnected(false); },
    onStatus(fn) { statusListeners.push(fn); fn(connected); },
    get connected() { return connected; },
  };
}
