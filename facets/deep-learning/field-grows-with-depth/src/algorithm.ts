/**
 * field-grows-with-depth — 맨 위 층의 한 칸이 기대는 자리를 층을 거슬러 모은다.
 *
 * 합성곱 층을 쌓은 격자에서 위 층의 칸 (r, c) 은 아래 층의 칸
 * (r·s .. r·s + k − 1, c·s .. c·s + k − 1) 로 셈해진다. 맨 위 층의 칸 하나에서 출발해
 * 한 층씩 내려가며 그 칸들의 창을 **실제로 합집합으로 모아** 기대는 칸을 셈한다.
 * 칸의 값은 쓰지 않는다 — 자리만 셈한다.
 *
 * 이벤트 (차례대로)
 *
 * - `init` (silent: true) — 바탕. 걸음 0 을 갈아 끼운다.
 *   payload: {
 *     layers: { id: string; size: number }[];   // 아래(입력)부터 위로. size 는 한 변의 칸 수
 *     kernel: number;                           // 창의 한 변
 *     start: Region;                            // 맨 위 층에서 출발하는 칸 (층 번호 = layers.length − 1)
 *   }
 * - `spread` (silent 아님) — 한 층 아래로 내려가 기대는 칸을 모은 걸음.
 *   payload: Region & {
 *     layer: number;   // 기대는 칸이 놓인 층 (layers 의 번호)
 *     from: number;    // 바로 위 층의 번호 (layer + 1)
 *   }
 *
 * Region = { r0: number; r1: number; c0: number; c1: number;   // 포함 범위
 *            side: number;   // 한 변의 칸 수 (정사각이 아니면 던진다)
 *            count: number } // 모은 칸 수 (합집합의 크기)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FieldGrowsWithDepthFacetData = {
  type: 'field-grows-with-depth';
  stepMs: number;
  /** 입력 격자의 한 변 */
  inputSize: number;
  /** 층마다 같은 창의 한 변 */
  kernel: number;
  /** 층마다 같은 보폭 */
  stride: number;
  /** 층 식별자 — 아래(입력)부터 위로 */
  layers: string[];
  /** 맨 위 층에서 출발하는 칸 */
  start: { row: number; col: number };
};

export type Region = {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  side: number;
  count: number;
};

/** 패딩 없는 합성곱의 출력 한 변 — ⌊(n − k) / s⌋ + 1. 창이 입력보다 크면 던진다. */
export function outputSize(n: number, k: number, s: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || !Number.isInteger(s) || n < 1 || k < 1 || s < 1) {
    throw new Error(`field-grows-with-depth: 격자 ${n} · 창 ${k} · 보폭 ${s} 는 셈할 수 없다`);
  }
  if (k > n) throw new Error(`field-grows-with-depth: 창 ${k} 이 격자 ${n} 보다 크다`);
  return Math.floor((n - k) / s) + 1;
}

/** 입력부터 위로 층마다의 한 변. */
export function layerSizes(inputSize: number, kernel: number, stride: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`field-grows-with-depth: 층 식별자 ${count} 개로는 층을 쌓을 수 없다`);
  }
  const sizes = [inputSize];
  for (let i = 1; i < count; i += 1) {
    const below = sizes[i - 1];
    if (below === undefined) throw new Error(`field-grows-with-depth: 층 ${i - 1} 의 크기가 없다`);
    sizes.push(outputSize(below, kernel, stride));
  }
  return sizes;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function posInt(o: Record<string, unknown>, k: string, min: number): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new Error(`field-grows-with-depth: 자료의 ${k} 가 ${min} 이상의 정수가 아니다 (${String(v)})`);
  }
  return v;
}

/** 넘겨받은 자료를 좁힌다. 틀린 모양은 던진다. */
export function readFieldData(v: unknown): FieldGrowsWithDepthFacetData {
  if (!isRecord(v)) throw new Error('field-grows-with-depth: 자료가 객체가 아니다');
  if (v.type !== 'field-grows-with-depth') {
    throw new Error(`field-grows-with-depth: 자료의 type 이 다르다 (${String(v.type)})`);
  }
  const layers = v.layers;
  if (!Array.isArray(layers) || layers.length < 2 || !layers.every((l): l is string => typeof l === 'string' && l !== '')) {
    throw new Error('field-grows-with-depth: 자료의 layers 가 층 식별자 둘 이상의 목록이 아니다');
  }
  const start = v.start;
  if (!isRecord(start)) throw new Error('field-grows-with-depth: 자료의 start 가 객체가 아니다');
  return {
    type: 'field-grows-with-depth',
    stepMs: posInt(v, 'stepMs', 0),
    inputSize: posInt(v, 'inputSize', 1),
    kernel: posInt(v, 'kernel', 1),
    stride: posInt(v, 'stride', 1),
    layers: [...layers],
    start: { row: posInt(start, 'row', 0), col: posInt(start, 'col', 0) },
  };
}

const key = (r: number, c: number): string => `${r},${c}`;

/** 칸 집합을 범위로 줄인다. 직사각이 아니거나 정사각이 아니면 던진다. */
function toRegion(cells: Set<string>): Region {
  if (cells.size === 0) throw new Error('field-grows-with-depth: 모은 칸이 없다');
  let r0 = Infinity;
  let r1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const k of cells) {
    const [rs, cs] = k.split(',');
    const r = Number(rs);
    const c = Number(cs);
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
  }
  const h = r1 - r0 + 1;
  const w = c1 - c0 + 1;
  if (h * w !== cells.size) {
    throw new Error(`field-grows-with-depth: 모은 칸 ${cells.size} 개가 ${h}×${w} 직사각을 채우지 않는다`);
  }
  if (h !== w) throw new Error(`field-grows-with-depth: 모은 칸이 ${h}×${w} 로 정사각이 아니다`);
  return { r0, r1, c0, c1, side: h, count: cells.size };
}

/** 위 층의 칸 집합이 기대는 아래 층의 칸 — 칸마다 창을 모은 합집합. */
function gatherBelow(upper: Set<string>, kernel: number, stride: number, belowSize: number): Set<string> {
  const out = new Set<string>();
  for (const k of upper) {
    const [rs, cs] = k.split(',');
    const r = Number(rs);
    const c = Number(cs);
    for (let i = 0; i < kernel; i += 1) {
      for (let j = 0; j < kernel; j += 1) {
        const br = r * stride + i;
        const bc = c * stride + j;
        if (br >= belowSize || bc >= belowSize) {
          throw new Error(`field-grows-with-depth: 칸 (${br}, ${bc}) 이 ${belowSize}×${belowSize} 격자 밖이다`);
        }
        out.add(key(br, bc));
      }
    }
  }
  return out;
}

export async function fieldGrowsWithDepth(
  ctx: FacetContext<FieldGrowsWithDepthFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<FieldGrowsWithDepthFacetData>;
  const { stepMs, inputSize, kernel, stride, layers, start } = readFieldData(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const sizes = layerSizes(inputSize, kernel, stride, layers.length);
  const top = layers.length - 1;
  const topSize = sizes[top];
  if (topSize === undefined) throw new Error('field-grows-with-depth: 맨 위 층의 크기가 없다');
  if (start.row >= topSize || start.col >= topSize) {
    throw new Error(`field-grows-with-depth: 출발 칸 (${start.row}, ${start.col}) 이 맨 위 층 ${topSize}×${topSize} 밖이다`);
  }

  let cells = new Set<string>([key(start.row, start.col)]);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      layers: layers.map((id, i) => ({ id, size: sizes[i] })),
      kernel,
      start: toRegion(cells),
    },
  });

  for (let layer = top - 1; layer >= 0; layer -= 1) {
    // 걸음 0 은 이미 읽을 것(층 넷과 출발 칸)이 있는 화면이라 첫 걸음 앞에도 머문다
    if (!(await pause())) return;
    const size = sizes[layer];
    if (size === undefined) throw new Error(`field-grows-with-depth: 층 ${layer} 의 크기가 없다`);
    cells = gatherBelow(cells, kernel, stride, size);
    await ctx.emit({
      type: 'spread',
      payload: { layer, from: layer + 1, ...toRegion(cells) },
    });
  }
}
