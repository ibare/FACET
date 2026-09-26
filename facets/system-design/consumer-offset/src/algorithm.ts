/**
 * consumer-offset — 같은 로그를 읽는 두 소비자 그룹이 어디까지 읽었는지를 각자 센다.
 *
 * 모형: 파티션 하나의 추가 전용 로그. 기록의 오프셋은 붙는 순간의 로그 길이다. 읽어도
 * 지워지지 않는다. 그룹의 오프셋은 그 그룹이 **다음에 읽을** 자리(처음 0)이고, 읽기는
 * 오프셋부터 min(한 번에 읽는 최대 개수, 끝 − 오프셋) 개를 읽고 오프셋을 그만큼 올린다
 * (읽은 즉시 커밋한다고 둔다). 밀림 = 끝 − 오프셋. 사건 하나 = 걸음 하나.
 *
 * 이벤트 (배열은 모두 `groups` 차례):
 *
 * - `init` (silent) — 걸음 0 의 셈값
 *   `{ end: number; offsets: number[]; lags: number[]; gap: number }`
 * - `read` — 한 그룹이 읽었다. 그 그룹의 오프셋만 오른다
 *   `{ group: string; from: number; count: number; values: number[];
 *      end: number; offsets: number[]; lags: number[]; gap: number }`
 * - `append` — 새 기록이 끝에 붙었다. 오프셋은 그대로, 밀림이 함께 는다
 *   `{ offset: number; value: number; end: number; offsets: number[]; lags: number[]; gap: number }`
 *
 * `gap` 은 가장 앞선 오프셋과 가장 뒤처진 오프셋의 차이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConsumerGroup = {
  /** 식별자. 표시 이름은 messages 의 `label.<id>` */
  id: string;
  /** 한 번에 읽는 최대 개수 */
  maxPoll: number;
};

export type ConsumerEvent =
  | { kind: 'poll'; group: string }
  | { kind: 'append'; value: number };

export type ConsumerOffsetFacetData = {
  type: 'consumer-offset';
  stepMs: number;
  /** 처음 로그의 값. 오프셋 0 부터 */
  log: number[];
  groups: ConsumerGroup[];
  /** 사건 열 — 이 차례대로 */
  events: ConsumerEvent[];
};

function fail(path: string, what: string): never {
  throw new Error(`consumer-offset: ${path} — ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readInt(v: unknown, path: string, min: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    fail(path, `${min} 이상의 정수가 아니다`);
  }
  return v;
}

/** 좁히개 — 알고리즘과 장면이 같은 것을 부른다. 어긋나면 던진다. */
export function readConsumerOffsetData(raw: unknown): ConsumerOffsetFacetData {
  if (!isRecord(raw)) fail('initialData', '객체가 아니다');
  if (raw.type !== 'consumer-offset') fail('initialData.type', "'consumer-offset' 가 아니다");
  const stepMs = readInt(raw.stepMs, 'initialData.stepMs', 1);

  if (!Array.isArray(raw.log)) fail('initialData.log', '배열이 아니다');
  const log = raw.log.map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`initialData.log[${i}]`, '수가 아니다');
    return v;
  });

  if (!Array.isArray(raw.groups) || raw.groups.length !== 2) {
    fail('initialData.groups', '그룹 둘의 배열이 아니다');
  }
  const groups = raw.groups.map((g, i): ConsumerGroup => {
    if (!isRecord(g)) fail(`initialData.groups[${i}]`, '객체가 아니다');
    if (typeof g.id !== 'string' || g.id === '') fail(`initialData.groups[${i}].id`, '빈 문자열이다');
    return { id: g.id, maxPoll: readInt(g.maxPoll, `initialData.groups[${i}].maxPoll`, 1) };
  });
  const ids = new Set(groups.map((g) => g.id));
  if (ids.size !== groups.length) fail('initialData.groups', '식별자가 겹친다');

  if (!Array.isArray(raw.events)) fail('initialData.events', '배열이 아니다');
  const events = raw.events.map((e, i): ConsumerEvent => {
    const path = `initialData.events[${i}]`;
    if (!isRecord(e)) fail(path, '객체가 아니다');
    if (e.kind === 'poll') {
      if (typeof e.group !== 'string' || !ids.has(e.group)) fail(`${path}.group`, '없는 그룹이다');
      return { kind: 'poll', group: e.group };
    }
    if (e.kind === 'append') {
      if (typeof e.value !== 'number' || !Number.isFinite(e.value)) fail(`${path}.value`, '수가 아니다');
      return { kind: 'append', value: e.value };
    }
    return fail(`${path}.kind`, "'poll' 도 'append' 도 아니다");
  });

  return { type: 'consumer-offset', stepMs, log, groups, events };
}

/** 로그가 끝내 가질 칸 수 — 처음 기록 + 붙을 기록. 자리 셈(칸 폭)에 쓴다. */
export function logCapacity(data: ConsumerOffsetFacetData): number {
  let n = data.log.length;
  for (const e of data.events) {
    if (e.kind === 'append') n += 1;
  }
  return n;
}

export async function consumerOffset(
  ctx0: FacetContext<ConsumerOffsetFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ConsumerOffsetFacetData>;
  const data = readConsumerOffsetData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const log = [...data.log];
  const offsets = data.groups.map(() => 0);
  const lags = (): number[] => offsets.map((o) => log.length - o);
  const gap = (): number => Math.max(...offsets) - Math.min(...offsets);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { end: log.length, offsets: [...offsets], lags: lags(), gap: gap() },
  });

  for (const [i, ev] of data.events.entries()) {
    // 걸음 0 은 로그와 두 오프셋이 이미 보이는 화면이라 첫 사건 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    if (ev.kind === 'poll') {
      const gi = data.groups.findIndex((g) => g.id === ev.group);
      const group = data.groups[gi];
      if (group === undefined) fail(`events[${i}].group`, `없는 그룹 ${ev.group}`);
      const from = offsets[gi];
      if (from === undefined) fail(`offsets[${gi}]`, '오프셋이 없다');
      const count = Math.min(group.maxPoll, log.length - from);
      if (count <= 0) fail(`events[${i}]`, `${ev.group} 가 읽을 기록이 없다 (오프셋 ${from}, 끝 ${log.length})`);
      const values = log.slice(from, from + count);
      offsets[gi] = from + count;
      await ctx.emit({
        type: 'read',
        payload: {
          group: group.id,
          from,
          count,
          values,
          end: log.length,
          offsets: [...offsets],
          lags: lags(),
          gap: gap(),
        },
      });
    } else {
      const offset = log.length;
      log.push(ev.value);
      await ctx.emit({
        type: 'append',
        payload: {
          offset,
          value: ev.value,
          end: log.length,
          offsets: [...offsets],
          lags: lags(),
          gap: gap(),
        },
      });
    }
  }
}
