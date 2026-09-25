/**
 * auth — 베어러 토큰의 수명.
 *
 * 앱은 20 초마다 API 서버에 묻고, 쥔 토큰이 없거나 만료되었으면 요청 직전에 발급 서버에서 새로 받는다.
 * t40 에 앱이 쥔 토큰의 사본이 훔친 쪽으로 샌다. 훔친 쪽은 새로 받을 수 없고, 60 초부터 10 초마다 묻는다.
 * API 서버의 판정은 **토큰 하나만** 입력으로 한다 — 발급 기록에 없으면 401, `지금 ≥ 만료` 면 401, 아니면 200.
 * 손잡이(토큰 수명)를 돌리면 막대(유효 구간)가 늘거나 줄고, 훔친 쪽 요청의 판정이 넘어간다.
 *
 * ## 규약
 * - 시각은 0 부터의 정수 초, 모든 시계가 같다. 요청 시각은 `first, first + every, …` 중 `< horizonSec` 인 것 (판은 [0, horizon) — 600 초의 요청은 없다)
 * - 같은 시각의 사건 차례: 유출 → 앱 → 훔친 쪽 (앱의 새 발급은 샌 토큰을 무르지 않으므로 수를 바꾸지 않는다)
 * - 새 토큰을 받아도 옛 토큰은 제 만료까지 유효하다 (무르기 없음). 토큰은 발급 차례의 번호(1 부터)로 가른다
 * - 샌 뒤 쓸 수 있던 초 = max(샌 토큰의 만료 − 유출 시각, 0)
 * - 걸음 하나 = 창 하나 `(lo, hi]` (windowSec 초). 걸음 0 은 판의 시작
 * - 유출 시각에 앱이 쥔 토큰이 없거나 · 기록에 없는 토큰이 판정에 들어오거나 · 사다리 밖 수명이면 던진다
 *
 * ## 이벤트 (전부 silent 아님 — 걸음마다 하나)
 * - `round`  판의 시작 (걸음 0)
 *   `{ round: number, lifetime: number, prevLifetime: number | null, horizonSec: number, windowSec: number,
 *      leakAtSec: number, appSecs: number[], attackerSecs: number[], appCount: number, attackerCount: number }`
 * - `window` 창 하나 (걸음 1..)
 *   `{ index: number (1 부터), lo: number, hi: number,
 *      issued: { token: number, issuedSec: number, expiresSec: number }[],
 *      app: { sec: number, token: number, status: 200 }[],
 *      attacker: { sec: number, status: 200 | 401 }[],
 *      leak: { sec: number, token: number, issuedSec: number, expiresSec: number, usableSec: number } | null,
 *      counts: { appPass: number, stolenPass: number, stolenReject: number, issued: number },
 *      totals: { appPass: number, stolenPass: number, stolenReject: number, issued: number } }`
 *   창 안의 사건은 시각 차례로 담는다. `counts` 는 이 창의 수, `totals` 는 그 창까지의 누적
 *
 * ## phase
 * 없다 — IR 을 두지 않아 코드 패널이 없다 (irs.ts 의 까닭 주석).
 *
 * ## 계기 (판 시작에 0 으로, 걸음마다 그 창까지의 누적)
 * - `stolen-passes`        훔친 쪽 요청 중 200
 * - `tokens-issued`        발급 서버가 앱에 준 토큰 수
 * - `leak-usable-seconds`  샌 토큰이 샌 뒤 유효했던 초 (유출이 든 창에서 한 번에)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AuthData = {
  type: 'auth';
  stepMs: number;
  horizonSec: number;
  windowSec: number;
  app: { firstSec: number; everySec: number; addr: string };
  attacker: { firstSec: number; everySec: number; addr: string };
  leakAtSec: number;
  requestLine: string;
  authHeader: string;
  lifetimeLadder: number[];
  lifetime: number;
};

export const STATUS_OK = 200;
export const STATUS_UNAUTHORIZED = 401;

export type IssuedToken = { token: number; issuedSec: number; expiresSec: number };
export type AppRequest = { sec: number; token: number; status: number };
export type AttackerRequest = { sec: number; status: number };
export type Leak = { sec: number; token: number; issuedSec: number; expiresSec: number; usableSec: number };

/** 한 판의 셈 결과 — 창으로 나누기 전의 사건 전부. */
export type AuthRun = {
  lifetime: number;
  tokens: IssuedToken[];
  app: AppRequest[];
  attacker: AttackerRequest[];
  leak: Leak;
};

/** `first, first + every, …` 중 `< horizon` 인 시각. */
export function requestTimes(firstSec: number, everySec: number, horizonSec: number): number[] {
  if (!(everySec > 0)) throw new Error(`요청 간격이 양수가 아니다: ${everySec}`);
  const out: number[] = [];
  for (let sec = firstSec; sec < horizonSec; sec += everySec) out.push(sec);
  return out;
}

/** API 서버의 판정 — 토큰 하나만 본다. 기록에 없는 토큰은 셈할 수 없는 상태라 던진다. */
function judge(expiresOf: Map<number, number>, token: number, nowSec: number): number {
  const expires = expiresOf.get(token);
  if (expires === undefined) throw new Error(`발급 기록에 없는 토큰: ${token}`);
  return nowSec >= expires ? STATUS_UNAUTHORIZED : STATUS_OK;
}

/** 한 판을 셈한다. 사건 차례는 시각 차례, 같은 시각이면 유출 → 앱 → 훔친 쪽. */
export function simulateAuth(data: AuthData, lifetime: number): AuthRun {
  if (!data.lifetimeLadder.includes(lifetime)) throw new Error(`사다리 밖 수명: ${lifetime}`);
  const appSecs = requestTimes(data.app.firstSec, data.app.everySec, data.horizonSec);
  const attackerSecs = requestTimes(data.attacker.firstSec, data.attacker.everySec, data.horizonSec);

  // 사건 목록: [시각, 차례(0 유출 · 1 앱 · 2 훔친 쪽)]
  const events: [number, number][] = [[data.leakAtSec, 0]];
  for (const s of appSecs) events.push([s, 1]);
  for (const s of attackerSecs) events.push([s, 2]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const expiresOf = new Map<number, number>();
  const tokens: IssuedToken[] = [];
  const app: AppRequest[] = [];
  const attacker: AttackerRequest[] = [];
  let held: IssuedToken | null = null;
  let leak: Leak | null = null;

  for (const [nowSec, kind] of events) {
    if (kind === 0) {
      if (held === null) throw new Error(`유출 시각 ${nowSec} 에 앱이 쥔 토큰이 없다`);
      leak = {
        sec: nowSec,
        token: held.token,
        issuedSec: held.issuedSec,
        expiresSec: held.expiresSec,
        usableSec: Math.max(held.expiresSec - nowSec, 0),
      };
    } else if (kind === 1) {
      if (held === null || nowSec >= held.expiresSec) {
        held = { token: tokens.length + 1, issuedSec: nowSec, expiresSec: nowSec + lifetime };
        tokens.push(held);
        expiresOf.set(held.token, held.expiresSec);
      }
      app.push({ sec: nowSec, token: held.token, status: judge(expiresOf, held.token, nowSec) });
    } else {
      if (leak === null) throw new Error(`훔친 쪽이 ${nowSec} 초에 쥔 토큰이 없다`);
      attacker.push({ sec: nowSec, status: judge(expiresOf, leak.token, nowSec) });
    }
  }
  if (leak === null) throw new Error('유출이 판 안에 들지 않았다');
  return { lifetime, tokens, app, attacker, leak };
}

/** 창 `(lo, hi]` 안에 드는가. */
const inWindow = (sec: number, lo: number, hi: number): boolean => sec > lo && sec <= hi;

type Totals = { appPass: number; stolenPass: number; stolenReject: number; issued: number };

export async function authAlgorithm(ctx0: FacetContext<AuthData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<AuthData>;
  const data = ctx.data;
  const windows = Math.ceil(data.horizonSec / data.windowSec);
  if (!Number.isInteger(windows) || windows <= 0) throw new Error(`창 수를 셈할 수 없다: ${data.horizonSec} / ${data.windowSec}`);

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  const playRound = async (round: number, lifetime: number, prevLifetime: number | null): Promise<boolean> => {
    const result = simulateAuth(data, lifetime);
    await ctx.emit({
      type: 'round',
      payload: {
        round,
        lifetime,
        prevLifetime,
        horizonSec: data.horizonSec,
        windowSec: data.windowSec,
        leakAtSec: data.leakAtSec,
        appSecs: result.app.map((r) => r.sec),
        attackerSecs: result.attacker.map((r) => r.sec),
        appCount: result.app.length,
        attackerCount: result.attacker.length,
      },
    });
    setMetric('stolen-passes', 0);
    setMetric('tokens-issued', 0);
    setMetric('leak-usable-seconds', 0);
    if (!(await ctx.sleep(data.stepMs))) return false;

    const totals: Totals = { appPass: 0, stolenPass: 0, stolenReject: 0, issued: 0 };
    let leakShown = false;
    for (let w = 0; w < windows; w++) {
      if (ctx.cancelled) return false;
      const lo = w * data.windowSec;
      const hi = Math.min((w + 1) * data.windowSec, data.horizonSec);
      const issued = result.tokens.filter((k) => inWindow(k.issuedSec, lo, hi));
      const app = result.app.filter((r) => inWindow(r.sec, lo, hi));
      const attacker = result.attacker.filter((r) => inWindow(r.sec, lo, hi));
      const leak = inWindow(result.leak.sec, lo, hi) ? result.leak : null;
      const counts: Totals = {
        issued: issued.length,
        appPass: app.filter((r) => r.status === STATUS_OK).length,
        stolenPass: attacker.filter((r) => r.status === STATUS_OK).length,
        stolenReject: attacker.filter((r) => r.status === STATUS_UNAUTHORIZED).length,
      };
      totals.issued += counts.issued;
      totals.appPass += counts.appPass;
      totals.stolenPass += counts.stolenPass;
      totals.stolenReject += counts.stolenReject;
      if (leak) leakShown = true;
      await ctx.emit({
        type: 'window',
        payload: { index: w + 1, lo, hi, issued, app, attacker, leak, counts, totals: { ...totals } },
      });
      setMetric('stolen-passes', totals.stolenPass);
      setMetric('tokens-issued', totals.issued);
      if (leak) setMetric('leak-usable-seconds', leak.usableSec);
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    if (!leakShown) throw new Error('유출이 어느 창에도 들지 않았다');
    return true;
  };

  try {
    let round = 1;
    let lifetime = data.lifetime;
    if (!(await playRound(round, lifetime, null))) return;
    while (!ctx.cancelled) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'lifetime') continue;
      const payload = input.payload as { value?: unknown } | undefined;
      const value = payload?.value;
      if (typeof value !== 'number') continue;
      if (!data.lifetimeLadder.includes(value)) throw new Error(`사다리 밖 수명: ${value}`);
      const prev = lifetime;
      lifetime = value;
      round += 1;
      if (!(await playRound(round, lifetime, prev))) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
