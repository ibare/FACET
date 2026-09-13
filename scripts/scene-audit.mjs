/**
 * 되짚기 감사 — 조각을 브라우저에서 순회하며 스크럽이 성립하는지 잰다.
 *
 * happy-dom 은 레이아웃도 페인트도 셈하지 않아 두 가지를 잴 수 없다.
 *   흔들림   되짚은 뒤 화면이 나중에 저 혼자 바뀌는가
 *   왕복     되짚었다 끝으로 돌아왔을 때 처음 완주 화면과 같은가
 * 그래서 실제 Chrome 을 CDP 로 몰아 잰다.
 *
 * 쓰는 법 (`tasks/scene-migration-protocol.md` 의 검증 절):
 *
 *   pnpm --filter @ffacet/playground dev          # 먼저 띄운다
 *   node scripts/scene-audit.mjs                  # 전수
 *   node scripts/scene-audit.mjs --only facet:hashAvalanche,facet:bstDegenerate
 *   node scripts/scene-audit.mjs --port 5175 --diff
 *
 * 판정: 흔들림 0 · 왕복어긋남 0 이어야 그 조각은 스크럽이 선다.
 *
 * 페이지(`apps/playground/scrub-audit.html`) 가 스스로 순회하며 재고
 * `window.__audit` 에 쌓는다. 여기서는 그것이 끝날 때까지 폴링만 한다.
 */
const TIMEOUT_MS = 3_600_000; // 조각 181 을 순차로 재므로 길다. 진행이 멎으면 아래에서 끊는다.
const timeoutId = setTimeout(() => { console.error('[timeout]'); process.exit(124); }, TIMEOUT_MS);
timeoutId.unref();

const children = new Set();
const cleanup = (code = 0) => {
  for (const c of children) { try { c.kill('SIGTERM'); } catch {} }
  process.exit(code);
};
process.on('disconnect', () => cleanup(0));
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (e) => { console.error(e); cleanup(1); });

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const PORT_ = flag('--port', '5173');
const ONLY = flag('--only');
const DIFF = argv.includes('--diff');
const q = [ONLY ? `only=${ONLY}` : '', DIFF ? 'diff=1' : ''].filter(Boolean).join('&');
const URL_ = flag('--url') ?? `http://localhost:${PORT_}/scrub-audit.html${q ? '?' + q : ''}`;
const OUT = flag('--out', process.env.OUT_DIR ?? '.');
const PORT = 9336;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const profile = mkdtempSync(join(tmpdir(), 'scrub-audit-'));
children.add(spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--window-size=1000,900',
  // 화면 밖 요소도 계속 그리게 둔다. 아니면 애니메이션이 멈춰 잴 것이 사라진다.
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-background-timer-throttling',
  'about:blank',
], { stdio: 'ignore' }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { await sleep(200); }
  }
  throw new Error('CDP 연결 실패');
}

let nextId = 1;
function makeClient(ws) {
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
}

async function main() {
  const ws = new WebSocket(await endpoint());
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = makeClient(ws);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p = {}) => send(m, p, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  // 페이지의 콘솔 오류를 흘려 보낸다 — 조각 하나가 터지면 순회가 멎는다.
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('[페이지 예외]', m.params?.exceptionDetails?.text ?? '');
    }
  });
  await call('Page.navigate', { url: URL_ });

  const ev = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  let lastCount = -1;
  let stallSince = Date.now();
  for (;;) {
    await sleep(3_000);
    let snap;
    try {
      snap = JSON.parse(await ev('JSON.stringify(window.__audit ?? null)'));
    } catch { continue; }
    if (!snap) continue;

    if (snap.results.length !== lastCount) {
      lastCount = snap.results.length;
      stallSince = Date.now();
      const drift = snap.results.filter((r) => r.verdict === 'drifts').length;
      process.stdout.write(`${snap.results.length}/${snap.total}  흔들림 ${drift}  …${snap.current}\n`);
    } else if (Date.now() - stallSince > 180_000) {
      console.error('진행이 3 분간 멎었다. 끊는다.');
      break;
    }
    if (snap.done) break;
  }

  const snap = JSON.parse(await ev('JSON.stringify(window.__audit)'));
  writeFileSync(join(OUT, 'axis2-result.json'), JSON.stringify(snap, null, 2));

  const by = (v) => snap.results.filter((r) => r.verdict === v);
  console.log('\n── 축 2 결과');
  console.log(JSON.stringify({
    잰것: snap.results.length,
    안흔들림: by('stable').length,
    흔들림: by('drifts').length,
    왕복어긋남: snap.results.filter((r) => r.roundTrip === 'differ').length,
    띠없음: by('no-timeline').length,
    완주못함: by('never-settled').length,
  }, null, 1));
  console.log('\n왕복이 어긋난 조각:');
  for (const r of snap.results.filter((x) => x.roundTrip === 'differ')) console.log('  ' + r.id);
  console.log('\n흔들리는 조각:');
  for (const r of by('drifts')) console.log('  ' + r.id + '  (걸음 ' + r.steps + ')');
  console.log('\n완주 못한 조각:');
  for (const r of by('never-settled')) console.log('  ' + r.id);

  ws.close();
}

try { await main(); } catch (e) { console.error('실패:', e.message); }
finally { clearTimeout(timeoutId); cleanup(0); }
