/**
 * combinatorics 알고리즘 — 원소를 하나씩 들이며 부분집합이 "새 원소를 뺀 것 · 넣은 것" 둘로 갈라지는 것을
 * 크기별 열로 보이고, 마지막에 크기 k 인 무리를 모은다.
 *
 * 한 판 = 처음(걸음 0) + 갈라지기 n + 모으기 1 = n + 2 걸음. 판이 끝나면 손잡이 `elements`(n) · `size`(k) 를
 * 기다렸다가 받은 값으로 다시 푼다. 다른 손잡이 값은 알고리즘이 스스로 쥔다(payload 의 `value` 만 읽는다).
 *
 * 셈의 길 (IR `countSize` 와 같다):
 *   - 부분집합 목록 — 원소 x 를 들이면 새 목록 = [옛 부분집합들(옛 차례)] 뒤에 [옛 것마다 x 를 얹은 사본(같은 차례)].
 *     부분집합 안의 원소는 들인 차례(a → f)로 적는다. 빈 것은 `∅`.
 *   - 크기별 수 — "뺀 쪽 + 넣은 쪽": 뺀 쪽 = 옛 크기 i 수, 넣은 쪽 = 옛 크기 i−1 수. IR 의 row[i] = row[i] + row[i−1].
 *     점(부분집합)을 날것으로 크기별로 센 수와 이 셈이 다르면 던진다.
 *   - P(n, k) = n × (n−1) × … × (n−k+1) (k 0 이면 1), k! (0! = 1). P ÷ k! 가 크기 k 수와 나누어떨어져 같지 않으면 던진다.
 *   k > n 이면 크기 k 무리는 0 이고 P 줄은 싣지 않는다. 수는 모두 정수 — 실수를 쓰지 않는다. 동률을 가를 자리가 없다.
 *
 * 점의 자리 — 점 하나가 부분집합 하나다. 열 = 크기, 줄 = 그 열 안에서 목록 차례로 몇 번째인가(0 부터).
 * 옛 점은 자리를 지키고, 사본은 원본의 자리에서 한 열 옆(크기 +1)의 다음 빈 줄로 옮겨 간다.
 *
 * 이벤트 (silent 가 아닌 것이 걸음이다. 걸음마다 바로 앞에 그 걸음의 phase):
 *   round  { n, k, columns, colCap, motionMs }       silent — 판 머리. 앞 판의 점이 ∅ 자리로 접힌다.
 *                                                    columns = 열 수(사다리 끝 n + 1), colCap = 사다리 전체에서 가장 긴 열
 *   start  { total, sizes, rows, counts }            걸음 0 — ∅ 점 하나 · 크기 0 열에 1
 *   split  { j, element, before, total, sizes, rows, keep, move, counts }
 *                                                    걸음 j — j 번째 원소를 들인다. sizes · rows 는 새 목록 전부의 열 · 줄,
 *                                                    keep · move · counts 는 길이 j + 1 (뺀 쪽 · 넣은 쪽 · 합)
 *   pick   { n, k, count, within, p, f, picked, members }
 *                                                    걸음 n+1 — 크기 k 무리를 모은다. within = k ≤ n.
 *                                                    p · f 는 within 일 때만 수, 아니면 null. picked = 모이는 점의 번호(목록 차례),
 *                                                    members = 그 부분집합의 글자 `{a, c}`
 *   phase  { phase }                                 silent — 코드 패널 줄
 *
 * phase 어휘 (irs.ts 와 정확히 같다): start · split · pick
 *
 * 계기 (판 머리에서 0 으로 되돌린다 — 지금 값을 들고 차이만 보낸다):
 *   subsets         지금 부분집합 수 — 걸음 0 에 1, 갈라질 때마다 두 배 (판 끝 2ⁿ)
 *   size-k-subsets  모은 크기 k 무리 수 — 모으기 걸음 전까지 0, 마지막 걸음에 C(n, k)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CombinatoricsData = {
  type: 'combinatorics';
  stepMs: number;
  /** 들이는 차례의 원소 기호 — 번역하지 않는 자료. 길이 = nLadder 의 끝값. */
  elements: string[];
  nLadder: number[];
  kLadder: number[];
  n: number;
  k: number;
};

/** 한 판의 셈 결과 — 검사가 IR 과 사양 표에 견준다. */
export type CombinatoricsRound = {
  n: number;
  k: number;
  /** 걸음 j 가 끝난 뒤의 크기별 수 (rows[0] = [1]). */
  rows: number[][];
  total: number;
  count: number;
  p: number | null;
  f: number | null;
  members: string[];
};

/** 운동 길이(ms, 재생 속도 1 기준). 걸음 경계 sleep 은 stepMs + 이것. */
export const MOTION_MS = 600;

function readIntLadder(v: unknown, name: string, min: number): number[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`combinatorics: ${name} 가 비었다`);
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min) {
      throw new Error(`combinatorics: ${name} 에 ${min} 이상 정수가 아닌 값이 있다 (${String(x)})`);
    }
    out.push(x);
  }
  return out;
}

function readData(data: CombinatoricsData): { stepMs: number; elements: string[]; nLadder: number[]; kLadder: number[] } {
  const stepMs = data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('combinatorics: stepMs 가 양수가 아니다');
  const nLadder = readIntLadder(data.nLadder, 'nLadder', 1);
  const kLadder = readIntLadder(data.kLadder, 'kLadder', 0);
  const els = data.elements;
  if (!Array.isArray(els)) throw new Error('combinatorics: elements 가 배열이 아니다');
  const elements: string[] = [];
  for (const e of els) {
    if (typeof e !== 'string' || e.length === 0) throw new Error('combinatorics: elements 에 빈 기호가 있다');
    elements.push(e);
  }
  const maxN = Math.max(...nLadder);
  if (elements.length < maxN) throw new Error(`combinatorics: 원소 ${elements.length} 개로 n ${maxN} 을 들일 수 없다`);
  return { stepMs, elements, nLadder, kLadder };
}

/** 부분집합 하나(원소 번호, 들인 차례)를 글자로. */
export function subsetLabel(subset: number[], elements: string[]): string {
  if (subset.length === 0) return '∅';
  return `{${subset.map((i) => {
    const e = elements[i];
    if (e === undefined) throw new Error(`combinatorics: 원소 번호 ${i} 가 없다`);
    return e;
  }).join(', ')}}`;
}

/** 목록 차례대로 각 부분집합의 열(크기) · 줄(그 열 안의 차례). */
function places(list: number[][]): { sizes: number[]; rows: number[] } {
  const seen: number[] = [];
  const sizes: number[] = [];
  const rows: number[] = [];
  for (const s of list) {
    const m = s.length;
    while (seen.length <= m) seen.push(0);
    sizes.push(m);
    rows.push(seen[m]!);
    seen[m] = seen[m]! + 1;
  }
  return { sizes, rows };
}

/** 점을 날것으로 크기별로 센다 — 길이 width. */
function rawCounts(list: number[][], width: number): number[] {
  const out = new Array<number>(width).fill(0);
  for (const s of list) {
    if (s.length >= width) throw new Error(`combinatorics: 크기 ${s.length} 부분집합이 열 ${width} 개 밖이다`);
    out[s.length] = out[s.length]! + 1;
  }
  return out;
}

/** 크기 k 무리 수를 "뺀 쪽 + 넣은 쪽" 으로 셈한 사다리 전체의 가장 긴 열 — 무대의 자리 잡기용. */
function longestColumn(maxN: number): number {
  let row = [1];
  for (let j = 1; j <= maxN; j += 1) {
    const next = new Array<number>(j + 1).fill(0);
    for (let i = 0; i <= j; i += 1) next[i] = (row[i] ?? 0) + (i >= 1 ? row[i - 1]! : 0);
    row = next;
  }
  return Math.max(...row);
}

export async function combinatoricsAlgorithm(ctx: FacetContext<CombinatoricsData>): Promise<void> {
  const rc = ctx as ReactiveContext<CombinatoricsData>;
  const { stepMs, elements, nLadder, kLadder } = readData(ctx.data);
  if (!nLadder.includes(ctx.data.n)) throw new Error(`combinatorics: n ${String(ctx.data.n)} 이 사다리 밖이다`);
  if (!kLadder.includes(ctx.data.k)) throw new Error(`combinatorics: k ${String(ctx.data.k)} 가 사다리 밖이다`);
  let n = ctx.data.n;
  let k = ctx.data.k;
  const maxN = Math.max(...nLadder);
  const columns = Math.max(maxN, ...kLadder) + 1;
  const colCap = longestColumn(maxN);

  const shown = new Map<string, number>();
  const meter = (name: string, value: number): void => {
    const before = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - before);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rc.sleep(stepMs + MOTION_MS);

  async function playRound(nn: number, kk: number): Promise<CombinatoricsRound | null> {
    meter('subsets', 0);
    meter('size-k-subsets', 0);
    await ctx.emit({ type: 'round', payload: { n: nn, k: kk, columns, colCap, motionMs: MOTION_MS }, silent: true });
    if (!(await pause())) return null;

    // 걸음 0 — ∅ 하나
    let list: number[][] = [[]];
    let counts = [1];
    const rows: number[][] = [[1]];
    {
      const pl = places(list);
      meter('subsets', 1);
      await phase('start');
      await ctx.emit({ type: 'start', payload: { total: 1, sizes: pl.sizes, rows: pl.rows, counts: [...counts] } });
      if (!(await pause())) return null;
    }

    // 걸음 1..n — j 번째 원소를 들인다
    for (let j = 1; j <= nn; j += 1) {
      if (ctx.cancelled) return null;
      const x = j - 1;
      const before = list.length;
      list = [...list, ...list.map((s) => [...s, x])];
      const keep = [...counts, 0];
      const move = [0, ...counts];
      counts = keep.map((v, i) => v + move[i]!);
      const raw = rawCounts(list, j + 1);
      for (let i = 0; i <= j; i += 1) {
        if (raw[i] !== counts[i]) {
          throw new Error(`combinatorics: 걸음 ${j} 크기 ${i} — 점은 ${raw[i]} 개인데 뺀 쪽 + 넣은 쪽은 ${counts[i]}`);
        }
      }
      rows.push([...counts]);
      const pl = places(list);
      meter('subsets', list.length);
      await phase('split');
      await ctx.emit({
        type: 'split',
        payload: {
          j,
          element: elements[x]!,
          before,
          total: list.length,
          sizes: pl.sizes,
          rows: pl.rows,
          keep,
          move,
          counts: [...counts],
        },
      });
      if (!(await pause())) return null;
    }

    // 걸음 n+1 — 크기 k 무리를 모은다
    if (ctx.cancelled) return null;
    const within = kk <= nn;
    const count = within ? counts[kk]! : 0;
    let p: number | null = null;
    let f: number | null = null;
    if (within) {
      p = 1;
      for (let i = 0; i < kk; i += 1) p *= nn - i;
      f = 1;
      for (let i = 2; i <= kk; i += 1) f *= i;
      if (p % f !== 0 || p / f !== count) {
        throw new Error(`combinatorics: P(${nn}, ${kk}) ÷ ${kk}! = ${p} ÷ ${f} 가 크기 ${kk} 무리 ${count} 와 다르다`);
      }
    }
    const picked: number[] = [];
    list.forEach((s, i) => {
      if (s.length === kk) picked.push(i);
    });
    if (picked.length !== count) throw new Error(`combinatorics: 크기 ${kk} 점 ${picked.length} 개인데 셈은 ${count}`);
    const members = picked.map((i) => subsetLabel(list[i]!, elements));
    meter('size-k-subsets', count);
    await phase('pick');
    await ctx.emit({ type: 'pick', payload: { n: nn, k: kk, count, within, p, f, picked, members } });
    return { n: nn, k: kk, rows, total: list.length, count, p, f, members };
  }

  try {
    while (!ctx.cancelled) {
      const round = await playRound(n, k);
      if (round === null) return;
      let got = false;
      while (!got) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'elements' && input.type !== 'size') continue;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        const ladder = input.type === 'elements' ? nLadder : kLadder;
        if (typeof value !== 'number' || !ladder.includes(value)) {
          throw new Error(`combinatorics: 손잡이 ${input.type} 의 값 ${String(value)} 가 사다리 밖이다`);
        }
        if (input.type === 'elements') n = value;
        else k = value;
        got = true;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
