/**
 * 반열림 시험 부름 — 끊어 둔 브레이커가 기다림 뒤 부름 하나만 보내 서비스를 찔러 본다.
 *
 * 시각 단위는 초(예로 정한 값). t = openedAt 에 이미 열려 있다. 사건은 네 가지이고 걸음 하나가 사건 하나다.
 * 같은 시각의 차례: 답 → 반열림 전환 → 되살아남 → 부름.
 *
 * 이벤트
 *   init      silent. 걸음 0 을 채운다.
 *             { t: number; state: 'open'; halfOpenAt: number; alive: false; end: number }
 *             end = 화면에 오를 가장 늦은 시각 (마지막 사건 · 마지막 답)
 *   call      부름 하나가 브레이커에 온다.
 *             { index: number; t: number; fate: 'blocked-open' | 'blocked-trial' | 'trial' | 'sent';
 *               result: 'ok' | null; answerAt: number | null }
 *             'sent'(닫힘) 은 답까지 한 걸음에 보인다 — result 'ok' · answerAt 이 찬다. 나머지는 null
 *   halfOpen  기다림이 차서 반열림으로 바뀐다. { t: number }
 *   answer    나가 있던 시험 부름의 답. { index: number; t: number; result: 'ok' | 'fail';
 *               state: 'closed' | 'open'; halfOpenAt: number | null }  (fail 이면 새 반열림 예정 시각)
 *   recover   서비스가 되살아난다. 브레이커 상태는 바뀌지 않는다. { t: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HalfOpenProbeFacetData = {
  type: 'half-open-probe';
  stepMs: number;
  /** 브레이커가 열린 시각 (초) */
  openedAt: number;
  /** 열림 뒤 반열림까지 기다림 (초) */
  cooldown: number;
  /** 보낸 부름이 답을 얻기까지 (초, ok · fail 같다) */
  callTime: number;
  /** 서비스가 되살아나는 시각. 이 시각 이후에 보낸 부름은 ok */
  recoverAt: number;
  /** 부름이 오는 시각 (오름차순, 겹침 없음) */
  calls: number[];
};

export type BreakerState = 'open' | 'half_open' | 'closed';
export type CallFate = 'blocked-open' | 'blocked-trial' | 'trial' | 'sent';

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`half-open-probe: ${path} 는 유한한 수여야 한다`);
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function narrowHalfOpenProbe(data: unknown): HalfOpenProbeFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('half-open-probe: initialData 가 없다');
  const d = data as Record<string, unknown>;
  if (d.type !== 'half-open-probe') throw new Error(`half-open-probe: initialData.type 이 다르다 (${String(d.type)})`);
  const stepMs = num(d.stepMs, 'initialData.stepMs');
  const openedAt = num(d.openedAt, 'initialData.openedAt');
  const cooldown = num(d.cooldown, 'initialData.cooldown');
  const callTime = num(d.callTime, 'initialData.callTime');
  const recoverAt = num(d.recoverAt, 'initialData.recoverAt');
  if (cooldown <= 0) throw new Error('half-open-probe: initialData.cooldown 은 0 보다 커야 한다');
  if (callTime <= 0) throw new Error('half-open-probe: initialData.callTime 은 0 보다 커야 한다');
  if (recoverAt <= openedAt) throw new Error('half-open-probe: initialData.recoverAt 은 openedAt 뒤여야 한다');
  if (!Array.isArray(d.calls) || d.calls.length === 0) throw new Error('half-open-probe: initialData.calls 가 비었다');
  const calls = d.calls.map((c, i) => num(c, `initialData.calls[${i}]`));
  calls.forEach((c, i) => {
    if (c <= openedAt) throw new Error(`half-open-probe: initialData.calls[${i}] 는 openedAt 뒤여야 한다`);
    const before = calls[i - 1];
    if (before !== undefined && c <= before) {
      throw new Error(`half-open-probe: initialData.calls[${i}] 가 앞 부름과 같거나 이르다 — 같은 시각의 두 부름은 규약에 없다`);
    }
  });
  return { type: 'half-open-probe', stepMs, openedAt, cooldown, callTime, recoverAt, calls };
}

export type PlannedEvent =
  | { kind: 'call'; index: number; t: number; fate: CallFate; result: 'ok' | null; answerAt: number | null }
  | { kind: 'halfOpen'; t: number }
  | { kind: 'answer'; index: number; t: number; result: 'ok' | 'fail'; state: 'closed' | 'open'; halfOpenAt: number | null }
  | { kind: 'recover'; t: number };

export type HalfOpenPlan = { halfOpenAt: number; end: number; events: PlannedEvent[] };

/** 서비스의 답 — 보낸 시각이 되살아난 시각 이후면 ok. */
function answerFor(sentAt: number, recoverAt: number): 'ok' | 'fail' {
  return sentAt >= recoverAt ? 'ok' : 'fail';
}

/**
 * 사건 줄을 시각 차례로 셈한다. 같은 시각이면 답(0) → 반열림(1) → 되살아남(2) → 부름(3).
 */
export function planHalfOpenProbe(data: HalfOpenProbeFacetData): HalfOpenPlan {
  const { openedAt, cooldown, callTime, recoverAt, calls } = data;
  const firstHalfOpenAt = openedAt + cooldown;
  let state: BreakerState = 'open';
  let halfOpenAt = firstHalfOpenAt;
  let inFlight: { index: number; answerAt: number; result: 'ok' | 'fail' } | null = null;
  let recovered = false;
  let next = 0;
  let last = openedAt;
  let end = openedAt;
  const events: PlannedEvent[] = [];

  for (;;) {
    const cand: { t: number; rank: number; kind: 'answer' | 'half' | 'recover' | 'call' }[] = [];
    if (inFlight) cand.push({ t: inFlight.answerAt, rank: 0, kind: 'answer' });
    if (state === 'open') cand.push({ t: halfOpenAt, rank: 1, kind: 'half' });
    if (!recovered) cand.push({ t: recoverAt, rank: 2, kind: 'recover' });
    const callAt = calls[next];
    if (callAt !== undefined) cand.push({ t: callAt, rank: 3, kind: 'call' });
    // 부름이 다 왔고 나가 있는 시험 부름도 없으면 더 볼 것이 없다
    if (callAt === undefined && !inFlight) break;
    cand.sort((a, b) => a.t - b.t || a.rank - b.rank);
    const pick = cand[0];
    if (!pick) throw new Error('half-open-probe: 다음 사건이 없는데 부름이나 답이 남았다');
    const t = pick.t;
    if (t < last) throw new Error(`half-open-probe: 사건 시각이 거꾸로 간다 (${t} < ${last})`);
    last = t;
    end = Math.max(end, t);

    if (pick.kind === 'half') {
      state = 'half_open';
      events.push({ kind: 'halfOpen', t });
    } else if (pick.kind === 'recover') {
      recovered = true;
      events.push({ kind: 'recover', t });
    } else if (pick.kind === 'answer') {
      if (!inFlight) throw new Error('half-open-probe: 나가 있는 부름 없이 답이 왔다');
      if (state !== 'half_open') throw new Error(`half-open-probe: 시험 부름의 답이 ${state} 에서 왔다`);
      const { index, result } = inFlight;
      inFlight = null;
      if (result === 'ok') {
        state = 'closed';
        events.push({ kind: 'answer', index, t, result, state: 'closed', halfOpenAt: null });
      } else {
        state = 'open';
        halfOpenAt = t + cooldown;
        events.push({ kind: 'answer', index, t, result, state: 'open', halfOpenAt });
      }
    } else {
      const index = next;
      next += 1;
      if (state === 'open') {
        events.push({ kind: 'call', index, t, fate: 'blocked-open', result: null, answerAt: null });
      } else if (state === 'half_open') {
        if (inFlight) {
          events.push({ kind: 'call', index, t, fate: 'blocked-trial', result: null, answerAt: null });
        } else {
          inFlight = { index, answerAt: t + callTime, result: answerFor(t, recoverAt) };
          events.push({ kind: 'call', index, t, fate: 'trial', result: null, answerAt: null });
        }
      } else {
        const result = answerFor(t, recoverAt);
        // 닫힘에서의 실패는 잇단 실패를 세는 다른 구간(trip-after-failures)의 말이다
        if (result !== 'ok') throw new Error(`half-open-probe: 닫힘에서 보낸 부름 ${index} 가 실패한다 — 이 조각의 구간 밖이다`);
        const answerAt = t + callTime;
        end = Math.max(end, answerAt);
        events.push({ kind: 'call', index, t, fate: 'sent', result, answerAt });
      }
    }
  }
  return { halfOpenAt: firstHalfOpenAt, end, events };
}

export async function halfOpenProbe(context: FacetContext<HalfOpenProbeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<HalfOpenProbeFacetData>;
  const data = narrowHalfOpenProbe(ctx.data);
  const plan = planHalfOpenProbe(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { t: data.openedAt, state: 'open', halfOpenAt: plan.halfOpenAt, alive: false, end: plan.end },
  });

  for (const ev of plan.events) {
    // 걸음 0 이 이미 열린 브레이커를 보이므로 첫 사건 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    switch (ev.kind) {
      case 'call':
        await ctx.emit({
          type: 'call',
          payload: { index: ev.index, t: ev.t, fate: ev.fate, result: ev.result, answerAt: ev.answerAt },
        });
        break;
      case 'halfOpen':
        await ctx.emit({ type: 'halfOpen', payload: { t: ev.t } });
        break;
      case 'answer':
        await ctx.emit({
          type: 'answer',
          payload: { index: ev.index, t: ev.t, result: ev.result, state: ev.state, halfOpenAt: ev.halfOpenAt },
        });
        break;
      case 'recover':
        await ctx.emit({ type: 'recover', payload: { t: ev.t } });
        break;
    }
  }
}
