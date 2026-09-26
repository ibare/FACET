/**
 * one-grows-rest-shift — 한 상자가 자라면 그 뒤의 상자들이 같은 거리만큼 밀려 내려간다.
 *
 * 블록 흐름 하나. 높이 = 줄 수 × 줄 높이 (img 는 고정 높이), y(위 끝) = 앞 블록들 높이의 합,
 * 담는 상자 높이 = 모든 블록 높이의 합. 여백 · 테두리 · 안쪽 여백 · 여백 겹침은 없다.
 * 바뀜 한 번(한 블록의 줄 수) 앞과 뒤의 배치를 셈하고, 자리나 크기가 바뀐 상자를 위에서부터
 * 한 걸음씩 보인다. 마지막 걸음은 담는 상자의 높이다.
 *
 * 이벤트:
 *   - init (silent) — 걸음 0 의 바탕. 바뀌기 전 배치.
 *       payload: {
 *         blocks: { id: string; tag: string; lines: number | null; lineHeight: number | null;
 *                   y: number; h: number }[];
 *         total: number;    // 담는 상자 높이 (바뀌기 전)
 *         extent: number;   // 어느 걸음에서든 닿는 가장 아래 (px) — 축척을 고정하려고
 *         lanes: number;    // 바뀌는 것의 수 (블록 + 담는 상자) — 화살표 칸을 처음부터 고정하려고
 *       }
 *   - grow — 바뀐 상자가 자란다 (크기만 바뀌고 y 는 그대로).
 *       payload: { index: number; fromLines: number; toLines: number; fromH: number; toH: number; y: number }
 *   - shift — 뒤의 상자 하나가 밀려난다 (y 만 바뀌고 높이는 그대로).
 *       payload: { index: number; fromY: number; toY: number; h: number }
 *   - container — 담는 상자의 바닥이 따라 내려간다. 마지막 걸음.
 *       payload: { from: number; to: number; kept: number; moved: number }
 *       kept = 자리도 크기도 그대로인 블록 수, moved = y 가 바뀐 블록 수
 *
 * silent 는 init 하나뿐이다. 나머지는 모두 걸음 하나씩이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OneGrowsRestShiftBlock = {
  /** 요소 식별자 (`p2` 등) — 번역하지 않는 자료 */
  id: string;
  /** HTML 태그 (`h1` · `p` · `img`) */
  tag: string;
  /** 줄 수 — 줄 높이가 정해진 태그에만 */
  lines?: number;
  /** 고정 높이 (px) — img 처럼 줄이 없는 태그에만 */
  height?: number;
};

export type OneGrowsRestShiftFacetData = {
  type: 'one-grows-rest-shift';
  stepMs: number;
  /** 태그별 줄 높이 (px) */
  lineHeights: Record<string, number>;
  /** 담는 상자 안의 블록 — 위에서부터 문서 차례 */
  blocks: OneGrowsRestShiftBlock[];
  /** 바뀜 — 한 블록의 줄 수가 이 값이 된다 */
  change: { id: string; lines: number };
};

type Placed = {
  id: string;
  tag: string;
  lines: number | null;
  lineHeight: number | null;
  y: number;
  h: number;
};

function lineHeightOf(data: OneGrowsRestShiftFacetData, b: OneGrowsRestShiftBlock): number | null {
  const lh = data.lineHeights[b.tag];
  return typeof lh === 'number' ? lh : null;
}

/** 블록 하나의 높이. 줄 수 × 줄 높이, 또는 고정 높이. 어느 쪽도 아니면 던진다. */
function heightOf(data: OneGrowsRestShiftFacetData, b: OneGrowsRestShiftBlock, lines: number | undefined): number {
  const lh = lineHeightOf(data, b);
  if (lh !== null) {
    if (typeof lines !== 'number' || !Number.isInteger(lines) || lines < 1) {
      throw new Error(`one-grows-rest-shift: ${b.id} (${b.tag}) 의 줄 수가 없거나 틀렸다`);
    }
    if (b.height !== undefined) {
      throw new Error(`one-grows-rest-shift: ${b.id} (${b.tag}) 는 줄 높이가 있는 태그인데 고정 높이도 있다`);
    }
    return lines * lh;
  }
  if (typeof b.height !== 'number' || b.height <= 0) {
    throw new Error(`one-grows-rest-shift: ${b.id} 의 태그 ${b.tag} 는 줄 높이도 고정 높이도 없다`);
  }
  if (lines !== undefined) {
    throw new Error(`one-grows-rest-shift: ${b.id} (${b.tag}) 는 줄 높이가 없는 태그인데 줄 수가 있다`);
  }
  return b.height;
}

/** 블록 흐름 하나를 위에서부터 쌓는다. */
function layout(
  data: OneGrowsRestShiftFacetData,
  linesOf: (b: OneGrowsRestShiftBlock) => number | undefined,
): { placed: Placed[]; total: number } {
  let y = 0;
  const placed: Placed[] = [];
  for (const b of data.blocks) {
    const lines = linesOf(b);
    const h = heightOf(data, b, lines);
    placed.push({
      id: b.id,
      tag: b.tag,
      lines: lines ?? null,
      lineHeight: lineHeightOf(data, b),
      y,
      h,
    });
    y += h;
  }
  return { placed, total: y };
}

export async function oneGrowsRestShift(ctx: FacetContext<OneGrowsRestShiftFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OneGrowsRestShiftFacetData>;
  const data = rctx.data;
  const stepMs = data.stepMs;

  const ids = new Set<string>();
  for (const b of data.blocks) {
    if (ids.has(b.id)) throw new Error(`one-grows-rest-shift: 식별자 ${b.id} 가 두 번 나온다`);
    ids.add(b.id);
  }
  const target = data.blocks.find((b) => b.id === data.change.id);
  if (target === undefined) throw new Error(`one-grows-rest-shift: 바뀔 블록 ${data.change.id} 가 없다`);
  if (lineHeightOf(data, target) === null) {
    throw new Error(`one-grows-rest-shift: 바뀔 블록 ${target.id} (${target.tag}) 는 줄이 없는 태그다`);
  }

  const before = layout(data, (b) => b.lines);
  const after = layout(data, (b) => (b.id === data.change.id ? data.change.lines : b.lines));

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let lanes = before.total === after.total ? 0 : 1;
  for (let i = 0; i < before.placed.length; i += 1) {
    if (before.placed[i].y !== after.placed[i].y || before.placed[i].h !== after.placed[i].h) lanes += 1;
  }

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      blocks: before.placed.map((p) => ({ ...p })),
      total: before.total,
      extent: Math.max(before.total, after.total),
      lanes,
    },
  });

  let kept = 0;
  let moved = 0;
  for (let i = 0; i < before.placed.length; i += 1) {
    if (rctx.cancelled) return;
    const a = before.placed[i];
    const b = after.placed[i];
    if (a.y === b.y && a.h === b.h) {
      kept += 1;
      continue;
    }
    if (a.y !== b.y && a.h !== b.h) {
      throw new Error(`one-grows-rest-shift: ${a.id} 의 자리와 크기가 함께 바뀌었다 — 이 모형은 바뀜 하나만 다룬다`);
    }
    // 걸음 0 은 이미 읽을 배치가 있는 화면이라 첫 걸음 앞에도 머문다.
    if (!(await pause())) return;
    if (a.h !== b.h) {
      if (a.lines === null || b.lines === null) {
        throw new Error(`one-grows-rest-shift: ${a.id} 의 크기가 줄 없이 바뀌었다`);
      }
      await rctx.emit({
        type: 'grow',
        payload: { index: i, fromLines: a.lines, toLines: b.lines, fromH: a.h, toH: b.h, y: a.y },
      });
    } else {
      moved += 1;
      await rctx.emit({
        type: 'shift',
        payload: { index: i, fromY: a.y, toY: b.y, h: a.h },
      });
    }
  }

  if (!(await pause())) return;
  await rctx.emit({
    type: 'container',
    payload: { from: before.total, to: after.total, kept, moved },
  });
}
