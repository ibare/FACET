/**
 * filters-learn-edges — 학습을 마친 첫 층의 창 하나에 무늬 다섯을 차례로 맞대어 응답을 잰다.
 *
 * 창은 제자리에 있다. 무늬가 하나씩 창에 와서 맞대어지고, 같은 자리 곱의 합(편향 · 활성
 * 함수 없음) 한 수가 응답으로 나온다. 다 맞댄 뒤 무늬들이 응답 큰 것부터 늘어선다.
 *
 * 이벤트 (모두 silent 아님):
 *   press  { index: number; response: number }
 *          index    — 맞댄 무늬의 데이터 차례 (0 부터)
 *          response — 창과 그 무늬의 같은 자리 곱의 합 (배정도 그대로. 표시 반올림은 그림 몫)
 *   rank   { order: number[] }
 *          order    — 무늬 차례를 응답 큰 것부터 늘어놓은 것. 동률이면 던진다
 *
 * 걸음 0 은 창만 있는 화면이라 읽을 것이 있다 — 첫 press 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FilterPattern = {
  /** 무늬 식별자 — 표시 이름은 messages 의 `label.pattern.<id>` */
  id: string;
  /** 밝기 격자. 0 어두움 · 1 밝음 */
  cells: number[][];
};

export type FiltersLearnEdgesFacetData = {
  type: 'filters-learn-edges';
  stepMs: number;
  /** 학습을 마친 창 (정사각) */
  kernel: number[][];
  patterns: FilterPattern[];
};

/** 정사각 격자인지 보고 한 변을 돌려준다. 아니면 던진다. */
export function squareSize(grid: unknown, what: string): number {
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new Error(`filters-learn-edges: ${what} 는 비지 않은 격자여야 한다`);
  }
  const n = grid.length;
  grid.forEach((row: unknown, r) => {
    if (!Array.isArray(row) || row.length !== n) {
      throw new Error(`filters-learn-edges: ${what} 의 ${r} 행 길이가 ${n} 이 아니다`);
    }
    row.forEach((v: unknown, c) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`filters-learn-edges: ${what} 의 (${r}, ${c}) 가 유한한 수가 아니다`);
      }
    });
  });
  return n;
}

/** 창과 무늬의 같은 자리 곱 아홉(한 변 k 면 k²)의 합. 크기가 다르면 던진다. */
export function respond(kernel: number[][], cells: number[][]): number {
  const k = squareSize(kernel, '창');
  const m = squareSize(cells, '무늬');
  if (k !== m) throw new Error(`filters-learn-edges: 창(${k}) 과 무늬(${m}) 의 크기가 다르다`);
  let sum = 0;
  for (let r = 0; r < k; r += 1) {
    for (let c = 0; c < k; c += 1) {
      sum += kernel[r]![c]! * cells[r]![c]!;
    }
  }
  return sum;
}

/**
 * 밝기 0..1 의 무늬가 이 창에서 낼 수 있는 응답의 크기 상한 — 양의 무게 합과 음의 무게 합
 * 가운데 큰 쪽의 절댓값. 응답 막대의 축척이 바탕(창)에서 정해지도록 그림이 이것을 부른다.
 */
export function responseReach(kernel: number[][]): number {
  squareSize(kernel, '창');
  let pos = 0;
  let neg = 0;
  for (const row of kernel) {
    for (const w of row) {
      if (w > 0) pos += w;
      else neg += w;
    }
  }
  const reach = Math.max(pos, -neg);
  if (reach === 0) throw new Error('filters-learn-edges: 무게가 모두 0 인 창은 응답의 축척이 없다');
  return reach;
}

export function readData(raw: unknown): FiltersLearnEdgesFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('filters-learn-edges: 자료가 없다');
  const d = raw as Record<string, unknown>;
  if (d['type'] !== 'filters-learn-edges') throw new Error('filters-learn-edges: type 이 다르다');
  const stepMs = d['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('filters-learn-edges: stepMs 가 없다');
  const k = squareSize(d['kernel'], '창');
  const rawPatterns = d['patterns'];
  if (!Array.isArray(rawPatterns) || rawPatterns.length === 0) {
    throw new Error('filters-learn-edges: 무늬가 없다');
  }
  const patterns = rawPatterns.map((p: unknown, i): FilterPattern => {
    if (typeof p !== 'object' || p === null) throw new Error(`filters-learn-edges: ${i} 번째 무늬가 비었다`);
    const rec = p as Record<string, unknown>;
    const id = rec['id'];
    if (typeof id !== 'string' || id === '') throw new Error(`filters-learn-edges: ${i} 번째 무늬에 식별자가 없다`);
    const m = squareSize(rec['cells'], `무늬 ${id}`);
    if (m !== k) throw new Error(`filters-learn-edges: 무늬 ${id} 의 크기(${m}) 가 창(${k}) 과 다르다`);
    const cells = rec['cells'] as number[][];
    for (const row of cells) {
      for (const v of row) {
        if (v < 0 || v > 1) throw new Error(`filters-learn-edges: 무늬 ${id} 의 밝기 ${v} 가 0..1 밖이다`);
      }
    }
    return { id, cells: cells.map((row) => row.slice()) };
  });
  return {
    type: 'filters-learn-edges',
    stepMs,
    kernel: (d['kernel'] as number[][]).map((row) => row.slice()),
    patterns,
  };
}

/** 응답 큰 것부터의 차례. 동률이면 어느 쪽으로도 기울이지 않고 던진다. */
export function rankByResponse(responses: readonly number[]): number[] {
  const order = responses.map((_, i) => i).sort((a, b) => responses[b]! - responses[a]!);
  for (let i = 1; i < order.length; i += 1) {
    if (responses[order[i - 1]!] === responses[order[i]!]) {
      throw new Error(`filters-learn-edges: 무늬 ${order[i - 1]} 와 ${order[i]} 의 응답이 같다 — 차례를 정할 수 없다`);
    }
  }
  return order;
}

export async function filtersLearnEdges(
  context: FacetContext<FiltersLearnEdgesFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FiltersLearnEdgesFacetData>;
  const data = readData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const responses: number[] = [];
  for (let i = 0; i < data.patterns.length; i += 1) {
    if (!(await pause())) return;
    const response = respond(data.kernel, data.patterns[i]!.cells);
    responses.push(response);
    await ctx.emit({ type: 'press', payload: { index: i, response } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'rank', payload: { order: rankByResponse(responses) } });
}
