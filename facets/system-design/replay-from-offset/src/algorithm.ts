/**
 * 오프셋 재생 — 끝까지 읽은 그룹 하나가 오프셋을 뒤로 옮겨 같은 기록을 다시 읽는다.
 *
 * 모형: Kafka 꼴의 파티션 하나. 기록은 붙은 차례대로 0 부터 오프셋을 받고, 읽어도
 * 지워지지 않는다. 그룹의 오프셋 = 다음에 읽을 자리. 읽기 = 오프셋부터
 * min(최대 개수, 끝 − 오프셋) 개를 읽고 오프셋을 그만큼 올린다(읽은 즉시 커밋).
 * 되감기 = 오프셋을 주어진 자리(0..끝)로 옮긴다 — 로그와 다른 무엇도 건드리지 않는다.
 * 사건 하나 = 걸음 하나. 시각은 셈하지 않는다.
 *
 * 이벤트
 *   init   (silent) { offset: number, end: number, times: number[], passes: number }
 *            offset  처음 오프셋 (0)
 *            end     로그의 끝 = 기록 수
 *            times   기록마다 읽힌 횟수 (처음엔 모두 0)
 *            passes  사건 열 전체를 마친 뒤 가장 많이 읽힌 기록의 횟수 — 그림의 줄 수
 *   read   { from: number, next: number, offsets: number[], values: number[], times: number[] }
 *            from    읽기 전 오프셋
 *            next    읽은 뒤 오프셋 (= from + 읽은 개수)
 *            offsets 읽은 기록의 오프셋들 (from..next−1)
 *            values  읽은 기록의 값들 (offsets 와 같은 차례)
 *            times   이 읽기 뒤 기록마다 읽힌 횟수 (로그 전체)
 *   rewind { from: number, to: number, records: number }
 *            from    되감기 전 오프셋
 *            to      되감은 뒤 오프셋
 *            records 되감은 뒤에도 그대로인 로그의 기록 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 사건 열의 한 칸 — 1차 데이터. */
export type ReplayAction = { op: 'poll' } | { op: 'seek'; to: number };

export type ReplayFromOffsetFacetData = {
  type: 'replay-from-offset';
  /** 로그 오프셋 0.. 의 값. 사건 열 동안 새 기록은 붙지 않는다. */
  values: number[];
  /** 그룹 식별자 (표시 이름은 messages 의 label.*) */
  group: string;
  /** 한 번에 읽는 최대 개수 */
  batch: number;
  /** 사건 열 */
  plan: ReplayAction[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function narrowAction(raw: unknown, path: string): ReplayAction {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path}: 사건이 객체가 아니다`);
  const op = (raw as { op?: unknown }).op;
  if (op === 'poll') return { op: 'poll' };
  if (op === 'seek') {
    const to = (raw as { to?: unknown }).to;
    if (!isInt(to)) throw new Error(`${path}.to: 정수가 아니다`);
    return { op: 'seek', to };
  }
  throw new Error(`${path}.op: 모르는 사건 ${String(op)}`);
}

/** initialData 좁히개 — 모양이 어긋나면 던진다. 알고리즘과 장면이 함께 쓴다. */
export function narrowReplayData(raw: unknown): ReplayFromOffsetFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('replay-from-offset: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'replay-from-offset') throw new Error(`type: replay-from-offset 이 아니다 (${String(r.type)})`);
  const values = r.values;
  if (!Array.isArray(values) || values.length === 0) throw new Error('values: 빈 배열이거나 배열이 아니다');
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`values[${i}]: 수가 아니다`);
  });
  if (typeof r.group !== 'string' || r.group === '') throw new Error('group: 식별자가 없다');
  if (!isInt(r.batch) || r.batch < 1) throw new Error('batch: 1 이상의 정수가 아니다');
  if (!Array.isArray(r.plan) || r.plan.length === 0) throw new Error('plan: 빈 배열이거나 배열이 아니다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('stepMs: 양수가 아니다');
  return {
    type: 'replay-from-offset',
    values: values.slice() as number[],
    group: r.group,
    batch: r.batch,
    plan: r.plan.map((a, i) => narrowAction(a, `plan[${i}]`)),
    stepMs: r.stepMs,
  };
}

export type ReplayRead = {
  op: 'read';
  from: number;
  next: number;
  offsets: number[];
  values: number[];
  times: number[];
};
export type ReplayRewind = { op: 'rewind'; from: number; to: number; records: number };
export type ReplayStep = ReplayRead | ReplayRewind;

/**
 * 사건 열을 로그 위에서 돌린다. 걸음마다 한 칸 — 사건 열을 순회한 결과다.
 * 읽을 것이 없는 읽기 · 로그 밖으로의 되감기는 던진다.
 */
export function replayLog(data: ReplayFromOffsetFacetData): ReplayStep[] {
  const log = data.values;
  const end = log.length;
  const times: number[] = log.map(() => 0);
  let offset = 0;
  const steps: ReplayStep[] = [];
  data.plan.forEach((act, i) => {
    if (act.op === 'poll') {
      const n = Math.min(data.batch, end - offset);
      if (n <= 0) throw new Error(`plan[${i}]: 오프셋 ${offset} 에서 읽을 기록이 없다 (끝 ${end})`);
      const offsets: number[] = [];
      const values: number[] = [];
      for (let o = offset; o < offset + n; o += 1) {
        const v = log[o];
        if (v === undefined) throw new Error(`plan[${i}]: 오프셋 ${o} 의 기록이 없다`);
        offsets.push(o);
        values.push(v);
        times[o] = (times[o] as number) + 1;
      }
      steps.push({ op: 'read', from: offset, next: offset + n, offsets, values, times: times.slice() });
      offset += n;
    } else {
      if (act.to < 0 || act.to > end) throw new Error(`plan[${i}].to: ${act.to} 는 0..${end} 밖이다`);
      steps.push({ op: 'rewind', from: offset, to: act.to, records: end });
      offset = act.to;
    }
  });
  return steps;
}

export async function replayFromOffset(
  ctx: FacetContext<ReplayFromOffsetFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ReplayFromOffsetFacetData>;
  const data = narrowReplayData(ctx.data);
  const steps = replayLog(data);
  // 읽힌 횟수는 줄지 않으니 모든 읽기 뒤의 최댓값이 곧 끝의 최댓값이다.
  const passes = Math.max(0, ...steps.map((s) => (s.op === 'read' ? Math.max(...s.times) : 0)));

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { offset: 0, end: data.values.length, times: data.values.map(() => 0), passes },
  });

  // 걸음 0 에 이미 로그와 오프셋이 서 있다 — 첫 사건 앞에도 읽을 틈을 둔다.
  for (const s of steps) {
    if (!(await pause())) return;
    if (s.op === 'read') {
      await rctx.emit({
        type: 'read',
        payload: { from: s.from, next: s.next, offsets: s.offsets, values: s.values, times: s.times },
      });
    } else {
      await rctx.emit({
        type: 'rewind',
        payload: { from: s.from, to: s.to, records: s.records },
      });
    }
  }
}
