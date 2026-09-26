/**
 * sharding — 커지는 번호로 들어오는 새 줄을 해시 / 구간으로 샤드에 나누고, 가장 최근 줄의 범위 질의를 보낸다.
 *
 * 규약 (사양 그대로 — 하나라도 다르게 짜면 다른 수가 나온다):
 *   새 줄       번호 = oldMax + 1 부터 1 씩, newCount 개
 *   해시        샤드 = order_id mod 샤드 수
 *   구간        폭 = oldMax // 샤드 수, 샤드 = min(샤드 수 − 1, (order_id − 1) // 폭) — 마지막 구간은 끝이 없다
 *   범위 질의   새 줄 가운데 가장 최근 recent 개의 번호 구간. 연 샤드 = 그 번호들이 가는 샤드의 가짓수
 *   몫          가장 바쁜 샤드 몫 = 새 쓰기가 가장 많은 샤드의 쓰기 ÷ 새 줄 수, 반올림 백분율
 *               (x * 100 + n // 2) // n — IR 과 같은 식
 *   샤드 번호   mod 의 답 그대로 0 부터 (식별자다 — 1 을 더하지 않는다)
 *   동률        가장 바쁜 샤드가 여럿이면(쓰기 수가 같으면) 모두 가장 바쁜 샤드로 표시한다.
 *               몫은 쓰기 수 하나로 셈하므로 동률이 값을 바꾸지 않는다. 이 데이터에서 해시 셋 모두 동률이다
 *
 * 한 판의 걸음 (걸음 0 포함 15):
 *   0      layout — 샤드 기둥 · 규칙 · 새 쓰기 0
 *   1..12  route  — 새 줄 하나가 제 샤드로
 *   13     query  — 범위 질의가 샤드로 간다 (연 샤드 표시)
 *   14     share  — 답이 모이고 가장 바쁜 샤드 몫이 뜬다 → 입력 대기
 *
 * 이벤트 (payload 스키마 · silent):
 *   layout  { mode: 0|1, shards, table, key, width, count, bounds: { shard, lo, hi: number | null }[] }   걸음
 *   route   { index (1 부터), key, shard, load: number[] }                                               걸음
 *   query   { lo, hi, shards, keys: { key, shard }[], opened: number[], touched }                        걸음
 *   share   { rows, perShard: number[], load: number[], top, share, busiest: number[], count }             걸음
 *   phase   { phase: 'route' | 'query' | 'share' }                                                       silent
 *
 * phase 어휘 (irs.ts 와 정확히 같다): route · query · share
 *
 * 계기:
 *   busiest-share   가장 바쁜 샤드 몫 (%) — 걸음 14 에서 올린다
 *   shards-touched  범위 질의가 연 샤드 수 — 걸음 13 에서 올린다
 *   판마다 지금 값을 들고 차이만 보낸다. 판의 걸음 0 에서 0 으로 되돌린다 (첫 판에도 0 을 보낸다).
 *
 * 손잡이 (reactive): mode (0 해시 · 1 구간) · shards (샤드 수). 한 판을 끝까지 재생 → 입력 대기 → 새 값으로 다시.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShardingData = {
  type: 'sharding';
  stepMs: number;
  motionMs: number;
  table: string;
  key: string;
  oldMax: number;
  newCount: number;
  recent: number;
  modeLadder: number[];
  shardsLadder: number[];
  mode: number;
  shards: number;
};

export type Bound = { shard: number; lo: number; hi: number | null };

export type ShardingRound = {
  mode: number;
  shards: number;
  width: number;
  keys: number[];
  targets: number[];
  load: number[];
  lo: number;
  hi: number;
  opened: number[];
  touched: number;
  perShard: number[];
  top: number;
  share: number;
  busiest: number[];
  bounds: Bound[];
};

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

function intList(x: unknown, name: string): number[] {
  if (!Array.isArray(x) || x.length === 0 || !x.every(isInt)) throw new Error(`sharding: ${name} 는 정수 목록이어야 한다`);
  return x as number[];
}

/** initialData 를 확인한다 — 셈할 수 없는 모양이면 던진다 (C6). */
export function checkData(data: ShardingData): ShardingData {
  if (data.type !== 'sharding') throw new Error(`sharding: initialData.type 이 '${String(data.type)}'`);
  for (const k of ['stepMs', 'motionMs', 'oldMax', 'newCount', 'recent', 'mode', 'shards'] as const) {
    if (!isInt(data[k]) || data[k] < 0) throw new Error(`sharding: ${k} 는 음수 아닌 정수여야 한다`);
  }
  if (typeof data.table !== 'string' || typeof data.key !== 'string') throw new Error('sharding: table · key 가 없다');
  if (data.newCount < 1) throw new Error('sharding: newCount 는 1 이상');
  if (data.recent < 1 || data.recent > data.newCount) throw new Error('sharding: recent 는 1..newCount');
  const modes = intList(data.modeLadder, 'modeLadder');
  const shardsLadder = intList(data.shardsLadder, 'shardsLadder');
  if (modes.some((m) => m !== 0 && m !== 1)) throw new Error('sharding: modeLadder 는 0(해시) · 1(구간) 뿐');
  if (!shardsLadder.every((s) => s >= 1 && s <= data.oldMax)) throw new Error('sharding: 샤드 수는 1..oldMax');
  if (!modes.includes(data.mode)) throw new Error(`sharding: mode ${data.mode} 가 사다리 밖이다`);
  if (!shardsLadder.includes(data.shards)) throw new Error(`sharding: shards ${data.shards} 가 사다리 밖이다`);
  return data;
}

/** IR shardOf 와 같은 규약. */
export function shardOf(mode: number, shards: number, width: number, key: number): number {
  if (mode === 0) return key % shards;
  if (mode === 1) return Math.min(shards - 1, Math.floor((key - 1) / width));
  throw new Error(`sharding: 모르는 나누는 법 ${mode}`);
}

/** 한 판의 셈 전부 — IR routeAll · busiestShare 와 같은 순서 · 같은 식. */
export function computeRound(data: ShardingData, mode: number, shards: number): ShardingRound {
  const width = Math.floor(data.oldMax / shards);
  if (width < 1) throw new Error('sharding: 구간 폭이 0 이다');
  const load = new Array<number>(shards).fill(0);
  const keys: number[] = [];
  const targets: number[] = [];
  for (let i = 0; i < data.newCount; i += 1) {
    const key = data.oldMax + 1 + i;
    const s = shardOf(mode, shards, width, key);
    keys.push(key);
    targets.push(s);
    load[s] += 1;
  }
  const lo = data.oldMax + data.newCount - data.recent + 1;
  const hi = data.oldMax + data.newCount;
  const hit = new Array<number>(shards).fill(0);
  const perShard = new Array<number>(shards).fill(0);
  const opened: number[] = [];
  let touched = 0;
  for (let k = lo; k <= hi; k += 1) {
    const s = shardOf(mode, shards, width, k);
    perShard[s] += 1;
    if (hit[s] === 0) {
      hit[s] = 1;
      touched += 1;
      opened.push(s);
    }
  }
  opened.sort((a, b) => a - b);
  let top = 0;
  for (let s = 0; s < shards; s += 1) top = Math.max(top, load[s]);
  const count = data.newCount;
  const share = Math.floor((top * 100 + Math.floor(count / 2)) / count);
  const busiest: number[] = [];
  for (let s = 0; s < shards; s += 1) if (load[s] === top) busiest.push(s);
  const bounds: Bound[] = [];
  for (let s = 0; s < shards; s += 1) {
    bounds.push({ shard: s, lo: s * width + 1, hi: s < shards - 1 ? (s + 1) * width : null });
  }
  return { mode, shards, width, keys, targets, load, lo, hi, opened, touched, perShard, top, share, busiest, bounds };
}

type Knobs = { mode: number; shards: number };

/** 손잡이 입력을 읽는다. 우리 것이 아니면 null, 사다리 밖이면 던진다. */
function readKnob(input: { type: string; payload?: unknown }, data: ShardingData, now: Knobs): Knobs | null {
  if (input.type !== 'mode' && input.type !== 'shards') return null;
  const p = input.payload;
  if (typeof p !== 'object' || p === null) throw new Error('sharding: 손잡이 payload 가 없다');
  const value = (p as { value?: unknown }).value;
  if (typeof value !== 'number') throw new Error('sharding: 손잡이 value 가 수가 아니다');
  if (input.type === 'mode') {
    if (!data.modeLadder.includes(value)) throw new Error(`sharding: mode ${value} 가 사다리 밖이다`);
    return { mode: value, shards: now.shards };
  }
  if (!data.shardsLadder.includes(value)) throw new Error(`sharding: shards ${value} 가 사다리 밖이다`);
  return { mode: now.mode, shards: value };
}

export async function shardingAlgorithm(ctx: FacetContext<ShardingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ShardingData>;
  const data = checkData(ctx.data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };

  const playRound = async (knobs: Knobs): Promise<boolean> => {
    const r = computeRound(data, knobs.mode, knobs.shards);

    // 걸음 0 — 샤드 기둥 · 규칙 · 새 쓰기 0
    setMetric('busiest-share', 0);
    setMetric('shards-touched', 0);
    await ctx.emit({
      type: 'layout',
      payload: {
        mode: r.mode,
        shards: r.shards,
        table: data.table,
        key: data.key,
        width: r.width,
        count: data.newCount,
        bounds: r.bounds,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걸음 1..newCount — 새 줄 하나가 제 샤드로
    const run = new Array<number>(r.shards).fill(0);
    for (let i = 0; i < r.keys.length; i += 1) {
      if (ctx.cancelled) return false;
      const s = r.targets[i];
      run[s] += 1;
      await phase('route');
      await ctx.emit({ type: 'route', payload: { index: i + 1, key: r.keys[i], shard: s, load: [...run] } });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    // 범위 질의가 샤드로 간다
    if (ctx.cancelled) return false;
    const inRange: { key: number; shard: number }[] = [];
    for (let k = r.lo; k <= r.hi; k += 1) inRange.push({ key: k, shard: shardOf(r.mode, r.shards, r.width, k) });
    await phase('query');
    await ctx.emit({
      type: 'query',
      payload: { lo: r.lo, hi: r.hi, shards: r.shards, keys: inRange, opened: r.opened, touched: r.touched },
    });
    setMetric('shards-touched', r.touched);
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 답이 모이고 가장 바쁜 샤드 몫
    if (ctx.cancelled) return false;
    await phase('share');
    await ctx.emit({
      type: 'share',
      payload: {
        rows: r.hi - r.lo + 1,
        perShard: r.perShard,
        load: r.load,
        top: r.top,
        share: r.share,
        busiest: r.busiest,
        count: data.newCount,
      },
    });
    setMetric('busiest-share', r.share);
    return true;
  };

  let knobs: Knobs = { mode: data.mode, shards: data.shards };
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(knobs))) return;
      let next: Knobs | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        next = readKnob(input, data, knobs);
      }
      knobs = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
