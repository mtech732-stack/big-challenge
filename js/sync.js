// قناة التزامن بين نافذة المقدّم ونافذة الجمهور داخل المتصفح نفسه، دون شبكة.
// تعتمد BroadcastChannel، فلا تعمل إلا بين نوافذ من الأصل نفسه في المتصفح نفسه.
const CHANNEL_NAME = 'big-challenge';
const HEARTBEAT_MS = 1000;
const LOST_AFTER_MS = 3500;

export function createLink(role, onMessage) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const other = role === 'presenter' ? 'audience' : 'presenter';
  let lastSeen = 0;
  let connected = false;
  const statusListeners = [];

  const send = (type, data = {}) => channel.postMessage({ from: role, type, data, at: Date.now() });

  const setConnected = value => {
    if (value === connected) return;
    connected = value;
    statusListeners.forEach(fn => fn(connected));
  };

  channel.onmessage = ({ data: msg }) => {
    if (!msg || msg.from !== other) return;
    lastSeen = performance.now();
    setConnected(true);
    if (msg.type === 'hello') send('ping');
    if (msg.type === 'ping' || msg.type === 'hello') return;
    if (msg.type === 'bye') { setConnected(false); return; }
    onMessage(msg.type, msg.data);
  };

  const beat = setInterval(() => {
    send('ping');
    if (connected && performance.now() - lastSeen > LOST_AFTER_MS) setConnected(false);
  }, HEARTBEAT_MS);
  const bye = () => send('bye');
  addEventListener('pagehide', bye);
  send('hello');

  return {
    send,
    // إغلاق القناة دون «bye»: حين تُسلَّم المباراة إلى نافذة مقدّم أخرى، فلا ترى نافذة الجمهور انقطاعاً.
    close() { clearInterval(beat); removeEventListener('pagehide', bye); channel.close(); },
    onStatus(fn) { statusListeners.push(fn); fn(connected); },
    get connected() { return connected; },
  };
}
