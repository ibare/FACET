/**
 * clocks-drift — 시계 편차.
 *
 * 참 시각은 시간 서버 S 가 가진다 (S 의 시계 = 참 시각). 두 시계는 저마다의 빠르기(ppm)로
 * 간다. 읽음(t) = 기준 읽음 + (t − 기준 참 시각) × (1 + ppm × 10⁻⁶), 어긋남 = 읽음 − 참 시각.
 * 맞추기는 NTP 꼴이다 — T1(제 시계) · T2(S) · T3(S) · T4(제 시계) 에서
 * θ = ((T2 − T1) + (T3 − T4)) / 2 를 셈해 돌아온 순간 제 시계에 한 번에 더한다. 빠르기는 그대로다.
 *
 * 걸음 하나 = 참 시각 한 시간 나아감 / 시계 하나가 S 와 맞춤.
 *
 * 이벤트 (시각은 초, 어긋남은 ms. 반올림하지 않은 값):
 *   init   silent — 걸음 0 의 바탕. 축 범위도 여기서 싣는다.
 *     payload: { hour: number; offsets: { clock: string; ms: number }[]; gapMs: number;
 *                yMaxMs: number; residMaxMs: number | null }
 *       yMaxMs     재생 전체에서 어긋남 절댓값의 최대 (세로 축 범위)
 *       residMaxMs 맞춘 뒤 남은 어긋남 절댓값의 최대 (맞추기가 없으면 null)
 *   hour   참 시각이 한 시간 나아갔다.
 *     payload: { hour: number; offsets: { clock: string; ms: number }[]; gapMs: number }
 *   sync   시계 하나가 S 와 맞췄다.
 *     payload: { clock: string; server: string; atHour: number; t1: number; t2: number;
 *                t3: number; t4: number; thetaMs: number; rttMs: number;
 *                beforeMs: number; afterMs: number; gapMs: number }
 *       atHour     맞춘 뒤 값이 놓이는 참 시각(시간 단위, 돌아온 순간)
 *       beforeMs   돌아온 순간 맞추기 전 어긋남 · afterMs 맞춘 뒤 어긋남
 *       gapMs      그 순간 첫째 시계 어긋남 − 둘째 시계 어긋남
 *
 * gapMs 는 늘 clocks[0] − clocks[1] 이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ClockSpec = { id: string; ppm: number; offsetMs0: number };
export type SyncSpec = { clock: string; atHour: number; outMs: number; backMs: number };

export type ClocksDriftFacetData = {
  type: 'clocks-drift';
  stepMs: number;
  server: string;
  holdMs: number;
  endHour: number;
  clocks: ClockSpec[];
  syncs: SyncSpec[];
};

const HOUR_S = 3600;

function fail(path: string, why: string): never {
  throw new Error(`clocks-drift: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '빈 문자열이거나 문자열이 아니다');
  return v;
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

/** 자료 좁히개 — 모양이 어긋나면 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowClocksDriftData(raw: unknown): ClocksDriftFacetData {
  const d = rec(raw, 'data');
  if (d.type !== 'clocks-drift') fail('data.type', "'clocks-drift' 가 아니다");
  const stepMs = num(d.stepMs, 'data.stepMs');
  if (stepMs < 800) fail('data.stepMs', '800 보다 작다');
  const server = str(d.server, 'data.server');
  const holdMs = num(d.holdMs, 'data.holdMs');
  if (holdMs < 0) fail('data.holdMs', '음수다');
  const endHour = num(d.endHour, 'data.endHour');
  if (!Number.isInteger(endHour) || endHour < 1) fail('data.endHour', '1 이상의 정수가 아니다');
  if (!Array.isArray(d.clocks)) fail('data.clocks', '배열이 아니다');
  if (d.clocks.length !== 2) fail('data.clocks', '시계는 둘이어야 한다');
  const clocks = d.clocks.map((c, i): ClockSpec => {
    const o = rec(c, `data.clocks[${i}]`);
    return {
      id: str(o.id, `data.clocks[${i}].id`),
      ppm: num(o.ppm, `data.clocks[${i}].ppm`),
      offsetMs0: num(o.offsetMs0, `data.clocks[${i}].offsetMs0`),
    };
  });
  const ids = new Set(clocks.map((c) => c.id));
  if (ids.size !== clocks.length) fail('data.clocks', '식별자가 겹친다');
  if (ids.has(server)) fail('data.server', '시계 식별자와 겹친다');
  if (!Array.isArray(d.syncs)) fail('data.syncs', '배열이 아니다');
  const seen = new Set<string>();
  const syncs = d.syncs.map((s, i): SyncSpec => {
    const o = rec(s, `data.syncs[${i}]`);
    const clock = str(o.clock, `data.syncs[${i}].clock`);
    if (!ids.has(clock)) fail(`data.syncs[${i}].clock`, `없는 시계 ${clock}`);
    const atHour = num(o.atHour, `data.syncs[${i}].atHour`);
    if (!Number.isInteger(atHour) || atHour < 0 || atHour > endHour) {
      fail(`data.syncs[${i}].atHour`, '0 과 endHour 사이의 정수가 아니다');
    }
    const key = `${clock}@${atHour}`;
    if (seen.has(key)) fail(`data.syncs[${i}]`, '같은 시각에 같은 시계가 두 번 맞춘다');
    seen.add(key);
    const outMs = num(o.outMs, `data.syncs[${i}].outMs`);
    const backMs = num(o.backMs, `data.syncs[${i}].backMs`);
    if (outMs < 0 || backMs < 0) fail(`data.syncs[${i}]`, '길 지연이 음수다');
    return { clock, atHour, outMs, backMs };
  });
  return { type: 'clocks-drift', stepMs, server, holdMs, endHour, clocks, syncs };
}

type ClockState = { spec: ClockSpec; baseTrue: number; baseRead: number };

function readAt(c: ClockState, trueSec: number): number {
  return c.baseRead + (trueSec - c.baseTrue) * (1 + c.spec.ppm * 1e-6);
}

function offsetMs(c: ClockState, trueSec: number): number {
  return (readAt(c, trueSec) - trueSec) * 1000;
}

type Offset = { clock: string; ms: number };
type HourStep = { kind: 'hour'; hour: number; offsets: Offset[]; gapMs: number };
type SyncStep = {
  kind: 'sync';
  clock: string;
  atHour: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  thetaMs: number;
  rttMs: number;
  beforeMs: number;
  afterMs: number;
  gapMs: number;
};

/** 자료에서 걸음을 셈한다. 축 범위를 알려면 끝까지 셈해야 하므로 먼저 모두 셈한다. */
function simulate(data: ClocksDriftFacetData): {
  start: { offsets: Offset[]; gapMs: number };
  steps: (HourStep | SyncStep)[];
} {
  const states = data.clocks.map(
    (spec): ClockState => ({ spec, baseTrue: 0, baseRead: spec.offsetMs0 / 1000 }),
  );
  const [first, second] = states;
  if (first === undefined || second === undefined) fail('data.clocks', '시계가 둘이 아니다');
  const find = (id: string): ClockState => {
    const s = states.find((c) => c.spec.id === id);
    if (s === undefined) fail('syncs', `없는 시계 ${id}`);
    return s;
  };
  const snapshot = (trueSec: number): { offsets: Offset[]; gapMs: number } => ({
    offsets: states.map((c) => ({ clock: c.spec.id, ms: offsetMs(c, trueSec) })),
    gapMs: offsetMs(first, trueSec) - offsetMs(second, trueSec),
  });

  const steps: (HourStep | SyncStep)[] = [];
  for (let hour = 0; hour <= data.endHour; hour += 1) {
    const trueSec = hour * HOUR_S;
    if (hour > 0) steps.push({ kind: 'hour', hour, ...snapshot(trueSec) });
    for (const sync of data.syncs) {
      if (sync.atHour !== hour) continue;
      const c = find(sync.clock);
      const t1 = readAt(c, trueSec);
      const t2 = trueSec + sync.outMs / 1000; // S 의 시계 = 참 시각
      const t3 = t2 + data.holdMs / 1000;
      const backTrue = t3 + sync.backMs / 1000;
      const t4 = readAt(c, backTrue);
      const theta = (t2 - t1 + (t3 - t4)) / 2;
      const rtt = t4 - t1 - (t3 - t2);
      const beforeMs = offsetMs(c, backTrue);
      const read = readAt(c, backTrue);
      c.baseTrue = backTrue;
      c.baseRead = read + theta; // 한 번에 더한다. 빠르기는 그대로
      const afterMs = offsetMs(c, backTrue);
      steps.push({
        kind: 'sync',
        clock: c.spec.id,
        atHour: backTrue / HOUR_S,
        t1,
        t2,
        t3,
        t4,
        thetaMs: theta * 1000,
        rttMs: rtt * 1000,
        beforeMs,
        afterMs,
        gapMs: snapshot(backTrue).gapMs,
      });
    }
  }
  // 걸음 0 은 참 0h — 처음 기준의 어긋남 그대로다
  const start = {
    offsets: data.clocks.map((c) => ({ clock: c.id, ms: c.offsetMs0 })),
    gapMs: first.spec.offsetMs0 - second.spec.offsetMs0,
  };
  return { start, steps };
}

export async function clocksDrift(ctxBase: FacetContext<ClocksDriftFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ClocksDriftFacetData>;
  const data = narrowClocksDriftData(ctx.data);
  const { start, steps } = simulate(data);

  let yMaxMs = Math.max(...start.offsets.map((o) => Math.abs(o.ms)));
  let residMaxMs: number | null = null;
  for (const s of steps) {
    if (s.kind === 'hour') {
      for (const o of s.offsets) yMaxMs = Math.max(yMaxMs, Math.abs(o.ms));
    } else {
      yMaxMs = Math.max(yMaxMs, Math.abs(s.beforeMs), Math.abs(s.afterMs));
      const left = Math.abs(s.afterMs);
      residMaxMs = residMaxMs === null ? left : Math.max(residMaxMs, left);
    }
  }
  if (yMaxMs <= 0) fail('data', '어긋남이 끝까지 0 이라 벌어질 것이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { hour: 0, offsets: start.offsets, gapMs: start.gapMs, yMaxMs, residMaxMs },
  });

  for (const s of steps) {
    if (!(await pause())) return;
    if (s.kind === 'hour') {
      await ctx.emit({
        type: 'hour',
        payload: { hour: s.hour, offsets: s.offsets, gapMs: s.gapMs },
      });
    } else {
      await ctx.emit({
        type: 'sync',
        payload: {
          clock: s.clock,
          server: data.server,
          atHour: s.atHour,
          t1: s.t1,
          t2: s.t2,
          t3: s.t3,
          t4: s.t4,
          thetaMs: s.thetaMs,
          rttMs: s.rttMs,
          beforeMs: s.beforeMs,
          afterMs: s.afterMs,
          gapMs: s.gapMs,
        },
      });
    }
  }
}
