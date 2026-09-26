/**
 * tripAfterFailures — 서킷 브레이커가 잇단 실패에 열리는 구간 (닫힘 → 열림).
 *
 * 부름을 차례대로 하나씩 낸다. 닫힘에서 부름은 서비스에 닿는다 — ok 면 잇단 실패가 0 으로
 * 돌아가고 fail 이면 하나 오른다. 잇단 실패가 문턱에 닿으면 그 부름의 걸음에 브레이커가
 * 열린다. 열림에서 부름은 서비스에 가지 않고 브레이커에서 막힌다. 걸음 하나 = 부름 하나.
 * 시계는 없다 — 기다림 ms 는 부름마다 붙는 값이다.
 *
 * 이벤트 (셈은 전부 여기서 한다. 장면은 이어 붙이기만 한다):
 *
 * - `init` (silent) — 걸음 0 을 채운다. 셈으로 나오는 처음 값들.
 *   payload: { state: 'closed', streak: 0, reached: 0, blocked: 0, totalWait: 0,
 *              waitMax: number  (기다림 표의 가장 큰 값 — 막대 축척) }
 *
 * - `call-reached` — 닫힘에서 부름 하나가 서비스에 닿고 답을 받았다.
 *   payload: { call: number (1 부터), answer: 'ok' | 'fail',
 *              streakFrom: number, streak: number,
 *              waitMs: number, reached: number, totalWait: number,
 *              tripped: boolean  (이 부름으로 열렸는가) }
 *
 * - `call-blocked` — 열림에서 부름 하나가 브레이커에서 막혔다. 서비스에 닿지 않는다.
 *   payload: { call: number, waitMs: number, blocked: number, totalWait: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CallAnswer = 'ok' | 'fail';

export type TripAfterFailuresFacetData = {
  type: 'trip-after-failures';
  stepMs: number;
  /** 부름마다 서비스에 닿았다면 받았을 답 (차례대로). */
  calls: CallAnswer[];
  /** 잇단 실패가 이 수에 닿으면 열린다. */
  threshold: number;
  /** 부르는 쪽의 기다림 ms — 답 ok · 답 fail(시간 초과) · 막힘. */
  waitMs: { ok: number; fail: number; blocked: number };
};

function fail(path: string, why: string): never {
  throw new Error(`trip-after-failures: ${path} — ${why}`);
}

function readCount(v: unknown, path: string, min: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    fail(path, `${min} 이상의 정수가 아니다`);
  }
  return v;
}

/** `initialData` 좁히개 — 모양이 어긋나면 던진다. 장면의 `initial` 도 이것을 부른다. */
export function readTripData(raw: unknown): TripAfterFailuresFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'trip-after-failures') fail('initialData.type', `모르는 값 ${String(d.type)}`);
  const stepMs = readCount(d.stepMs, 'initialData.stepMs', 1);
  if (!Array.isArray(d.calls) || d.calls.length === 0) fail('initialData.calls', '빈 배열이거나 배열이 아니다');
  const calls = d.calls.map((c, i): CallAnswer => {
    if (c !== 'ok' && c !== 'fail') fail(`initialData.calls[${i}]`, `모르는 답 ${String(c)}`);
    return c;
  });
  const threshold = readCount(d.threshold, 'initialData.threshold', 1);
  if (typeof d.waitMs !== 'object' || d.waitMs === null) fail('initialData.waitMs', '객체가 아니다');
  const w = d.waitMs as Record<string, unknown>;
  const waitMs = {
    ok: readCount(w.ok, 'initialData.waitMs.ok', 0),
    fail: readCount(w.fail, 'initialData.waitMs.fail', 0),
    blocked: readCount(w.blocked, 'initialData.waitMs.blocked', 0),
  };
  return { type: 'trip-after-failures', stepMs, calls, threshold, waitMs };
}

export async function tripAfterFailures(
  ctx: FacetContext<TripAfterFailuresFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<TripAfterFailuresFacetData>;
  const data = readTripData(ctx.data);
  const { stepMs, calls, threshold, waitMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let state: 'closed' | 'open' = 'closed';
  let streak = 0;
  let reached = 0;
  let blocked = 0;
  let totalWait = 0;
  const waitMax = Math.max(waitMs.ok, waitMs.fail, waitMs.blocked);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { state, streak, reached, blocked, totalWait, waitMax },
  });

  for (let i = 0; i < calls.length; i += 1) {
    // 걸음 0 이 이미 읽을 화면(부름 줄 · 닫힌 브레이커)이라 첫 부름 앞에도 머문다.
    if (!(await pause())) return;
    const call = i + 1;
    if (state === 'closed') {
      const answer = calls[i];
      if (answer === undefined) fail(`calls[${i}]`, '답이 없다');
      const streakFrom = streak;
      streak = answer === 'ok' ? 0 : streak + 1;
      reached += 1;
      const wait = waitMs[answer];
      totalWait += wait;
      const tripped = streak >= threshold;
      if (tripped) state = 'open';
      await ctx.emit({
        type: 'call-reached',
        payload: { call, answer, streakFrom, streak, waitMs: wait, reached, totalWait, tripped },
      });
    } else {
      blocked += 1;
      totalWait += waitMs.blocked;
      await ctx.emit({
        type: 'call-blocked',
        payload: { call, waitMs: waitMs.blocked, blocked, totalWait },
      });
    }
  }
}
