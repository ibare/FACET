/**
 * countMinSketch — 적은 자리로 "몇 번 봤는가" 를 센다.
 *
 * 손잡이 둘이 서로 다른 것을 만진다. 폭 w 는 충돌 자체를 줄이고, 깊이 d 는
 * "운 나쁜 줄" 을 피할 기회를 늘린다. 같은 칸 수를 폭에 쓸지 깊이에 쓸지가
 * 이 화면이 묻는 것이다.
 *
 * ── 1차 데이터
 *
 * 키 열둘과 그 빈도(`max(1, 20 - 2i)`), 그리고 자리를 정하는 식뿐이다.
 * **표의 값도 읽히는 값도 오차도 여기서 직접 셈한다** — 미리 적어 두면 데이터를
 * 고칠 때 화면이 조용히 거짓을 말하게 된다.
 *
 * 자리는 이중 해싱 `자리_r = (h1 + r·h2) mod w` 이고 r 은 줄 번호(0부터)다.
 * `h1` 은 Java `String.hashCode` 를 `& 0x7FFFFFFF` 한 값, `h2` 는 FNV-1a 32bit 를
 * `& 0x7FFFFFFF` 한 뒤 홀수로 만든(`| 1`) 값이다. 곱셈 결과에도 마스크를 씌운다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type           | payload                                              | silent |
 * |----------------|------------------------------------------------------|--------|
 * | `phase`        | `{ phase: string }`                                  | O      |
 * | `table-init`   | `{ width, depth, keys, total, scaleMax }`            | X      |
 * | `key-hashed`   | `{ index, key, count, cells: {row,col}[] }`          | X      |
 * | `cell-bumped`  | `{ row, col, value }`                                | X      |
 * | `key-probed`   | `{ index, key, cells: {row,col,value}[] }`           | X      |
 * | `key-min`      | `{ index, key, row, col, read }`                     | X      |
 * | `key-answered` | `{ index, key, truth, read }`                        | X      |
 * | `verdict`      | `{ width, depth, cells, errorSum, exact, keyCount, total }` | X |
 * | `done`         | 없음 (표준 어휘)                                      | X      |
 *
 * ── phase 어휘 (C3 — irs.ts 와 집합이 완전히 일치해야 한다)
 *
 * `hash` · `bump` · `probe` · `take-min` · `answer`
 *
 * ── 메트릭 (C5 — facet.ts 의 metrics[].name 과 일치)
 *
 * `cell-count` · `bump-count` · `error-sum` · `exact-count`
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CountMinSketchData = {
  type: 'count-min-sketch';
  /** 세는 차례. 같은 키는 몰아서 한 번에 넣는다. */
  keys: string[];
  /** 키마다의 빈도 = 참값. keys 와 같은 길이. */
  counts: number[];
  /** 줄마다의 칸 수. 손잡이가 바꾼다. */
  width: number;
  /** 줄 수 = 해시 함수의 수. 손잡이가 바꾼다. */
  depth: number;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
  stepMs: number;
};

/** 32bit 부호 있는 정수의 양수 마스크. */
const MASK = 0x7fffffff;

/** Java `String.hashCode` — `h = 31h + c` 를 32bit 로 감아 돈다. */
function javaHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** FNV-1a 32bit. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/**
 * 줄 r 에서 이 키가 짚는 칸.
 *
 * `h2` 를 홀수로 만드는 것은 폭이 2 의 거듭제곱일 때 `r·h2` 가 같은 자리를
 * 되풀이해 밟지 않게 하려는 것이다. 곱셈 결과에도 마스크를 씌워 부호가 도는 것을
 * 막는다 — 씌우지 않으면 줄마다 자리가 음수로 튄다.
 */
export function countMinSketchCell(key: string, row: number, width: number): number {
  const h1 = javaHashCode(key) & MASK;
  const h2 = (fnv1a32(key) & MASK) | 1;
  return (h1 + ((row * h2) & MASK)) % width;
}

/** segmented-slider 가 보내는 payload 에서 고른 값을 꺼낸다 (C9). */
function segmentValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const countMinSketchAlgorithm = async (
  ctx: FacetContext<CountMinSketchData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<CountMinSketchData>;
  const data = ctx.data;
  const keys = data.keys;
  const counts = data.counts;
  const total = counts.reduce((a, b) => a + b, 0);
  const step = data.stepMs;

  let width = data.width;
  let depth = data.depth;

  /**
   * 메트릭은 늘 **더해진다** (`ctx.metric` 이 누적기다). 그런데 손잡이를 밀 때마다
   * 처음부터 다시 세므로, 보이고 싶은 것은 누적이 아니라 이번 판의 값이다.
   * 그래서 지금 보이는 값을 기억해 두고 그 차이를 보낸다.
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판 — 열둘을 다 세고, 다 되읽고, 판정까지. 끝까지 갔으면 true. */
  const countAndRead = async (): Promise<boolean> => {
    const table: number[][] = [];
    for (let r = 0; r < depth; r += 1) table.push(new Array<number>(width).fill(0));

    await ctx.emit({
      type: 'table-init',
      payload: { width, depth, keys, total, scaleMax: Math.ceil(total / 2) },
    });
    setMetric('cell-count', width * depth);
    setMetric('bump-count', 0);
    setMetric('error-sum', 0);
    setMetric('exact-count', 0);
    if (!(await rctx.sleep(step))) return false;

    // ── 넣기. 키마다 줄 수만큼의 칸이 오른다.
    let bumps = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const count = counts[i];

      await phase('hash');
      const cells: Array<{ row: number; col: number }> = [];
      for (let r = 0; r < depth; r += 1) {
        cells.push({ row: r, col: countMinSketchCell(key, r, width) });
      }
      await ctx.emit({ type: 'key-hashed', payload: { index: i, key, count, cells } });
      if (!(await rctx.sleep(step))) return false;

      await phase('bump');
      for (const c of cells) {
        table[c.row][c.col] += count;
        bumps += 1;
        await ctx.emit({
          type: 'cell-bumped',
          payload: { row: c.row, col: c.col, value: table[c.row][c.col] },
        });
        if (!(await rctx.sleep(step / 4))) return false;
      }
      setMetric('bump-count', bumps);
    }

    // ── 읽기. 줄마다 하나씩 읽고 그중 가장 작은 것을 답으로 삼는다.
    let errorSum = 0;
    let exact = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const truth = counts[i];

      await phase('probe');
      const cells: Array<{ row: number; col: number; value: number }> = [];
      for (let r = 0; r < depth; r += 1) {
        const col = countMinSketchCell(key, r, width);
        cells.push({ row: r, col, value: table[r][col] });
      }
      await ctx.emit({ type: 'key-probed', payload: { index: i, key, cells } });
      if (!(await rctx.sleep(step))) return false;

      await phase('take-min');
      let read = cells[0].value;
      let minRow = 0;
      for (const c of cells) {
        if (c.value < read) {
          read = c.value;
          minRow = c.row;
        }
      }
      await ctx.emit({
        type: 'key-min',
        payload: { index: i, key, row: minRow, col: cells[minRow].col, read },
      });
      if (!(await rctx.sleep(step * 0.6))) return false;

      await phase('answer');
      errorSum += read - truth;
      if (read === truth) exact += 1;
      await ctx.emit({ type: 'key-answered', payload: { index: i, key, truth, read } });
      setMetric('error-sum', errorSum);
      setMetric('exact-count', exact);
      if (!(await rctx.sleep(step * 0.6))) return false;
    }

    await ctx.emit({
      type: 'verdict',
      payload: {
        width,
        depth,
        cells: width * depth,
        errorSum,
        exact,
        keyCount: keys.length,
        total,
      },
    });
    // 판정이 한 박자 머문 뒤에 "이제 기다린다" 로 넘어간다. 둘을 붙여 내보내면
    // 판정 문장이 같은 프레임에 덮여 아무도 읽지 못한다.
    if (!(await rctx.sleep(step * 4))) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await countAndRead())) return;

      // 손잡이를 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와 위젯만 남는다.
      const ev = await rctx.waitForInput();
      if (ev.type === 'width') {
        const v = segmentValue(ev.payload);
        if (v !== null) width = v;
      } else if (ev.type === 'depth') {
        const v = segmentValue(ev.payload);
        if (v !== null) depth = v;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
