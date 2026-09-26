/**
 * one-grows-rest-shift 의 장면.
 *
 * 바탕(init 이 한 번 정한다) — 바뀌기 전 배치 `before` 와 담는 상자 높이 `totalBefore`, 축척용 `extent`,
 * 화살표 칸 수 `lanes`.
 * 자취(걸음이 쌓는다) — 지금 배치 `blocks` 와 지금 담는 상자 높이 `total`, 끝의 셈 `tally`.
 * 이번 걸음 — `step`. 운동이 출발할 자리(`from`)를 싣는다.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 준 값을 옮겨 적기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type OneGrowsRestShiftSceneBlock = {
  id: string;
  tag: string;
  lines: number | null;
  lineHeight: number | null;
  y: number;
  h: number;
};

export type OneGrowsRestShiftStep =
  | { kind: 'grow'; index: number; fromLines: number; toLines: number; fromH: number; toH: number; y: number }
  | { kind: 'shift'; index: number; fromY: number; toY: number; h: number }
  | { kind: 'container'; from: number; to: number };

export type OneGrowsRestShiftScene = {
  before: OneGrowsRestShiftSceneBlock[];
  totalBefore: number;
  extent: number;
  lanes: number;
  blocks: OneGrowsRestShiftSceneBlock[];
  total: number;
  tally: { kept: number; moved: number } | null;
  step: OneGrowsRestShiftStep | null;
};

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`oneGrowsRestShiftScene: ${what} 가 수가 아니다`);
  return v;
}

function numOrNull(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`oneGrowsRestShiftScene: ${what} 가 글자가 아니다`);
  return v;
}

function field(o: unknown, key: string): unknown {
  if (typeof o !== 'object' || o === null) throw new Error(`oneGrowsRestShiftScene: payload 가 객체가 아니다 (${key})`);
  return (o as Record<string, unknown>)[key];
}

function readBlock(o: unknown): OneGrowsRestShiftSceneBlock {
  return {
    id: str(field(o, 'id'), 'id'),
    tag: str(field(o, 'tag'), 'tag'),
    lines: numOrNull(field(o, 'lines'), 'lines'),
    lineHeight: numOrNull(field(o, 'lineHeight'), 'lineHeight'),
    y: num(field(o, 'y'), 'y'),
    h: num(field(o, 'h'), 'h'),
  };
}

function blockAt(scene: OneGrowsRestShiftScene, index: number): OneGrowsRestShiftSceneBlock {
  const b = scene.blocks[index];
  if (b === undefined) throw new Error(`oneGrowsRestShiftScene: ${index} 번째 블록이 없다`);
  return b;
}

export const oneGrowsRestShiftScene: ScenePlan<OneGrowsRestShiftScene> = {
  initial(): OneGrowsRestShiftScene {
    // 배치(y · 높이)는 알고리즘이 셈한다 — silent init 이 걸음 0 을 갈아 끼운다.
    return { before: [], totalBefore: 0, extent: 0, lanes: 0, blocks: [], total: 0, tally: null, step: null };
  },

  reduce(scene: OneGrowsRestShiftScene, event: FacetRuntimeEvent): OneGrowsRestShiftScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const raw = field(p, 'blocks');
        if (!Array.isArray(raw)) throw new Error('oneGrowsRestShiftScene: init.blocks 가 배열이 아니다');
        const before = raw.map(readBlock);
        const total = num(field(p, 'total'), 'total');
        return {
          before,
          totalBefore: total,
          extent: num(field(p, 'extent'), 'extent'),
          lanes: num(field(p, 'lanes'), 'lanes'),
          blocks: before.map((b) => ({ ...b })),
          total,
          tally: null,
          step: null,
        };
      }
      case 'grow': {
        const index = num(field(p, 'index'), 'index');
        const step: OneGrowsRestShiftStep = {
          kind: 'grow',
          index,
          fromLines: num(field(p, 'fromLines'), 'fromLines'),
          toLines: num(field(p, 'toLines'), 'toLines'),
          fromH: num(field(p, 'fromH'), 'fromH'),
          toH: num(field(p, 'toH'), 'toH'),
          y: num(field(p, 'y'), 'y'),
        };
        const old = blockAt(scene, index);
        const blocks = scene.blocks.map((b, i) =>
          i === index ? { ...old, lines: step.toLines, h: step.toH } : b,
        );
        return { ...scene, blocks, step };
      }
      case 'shift': {
        const index = num(field(p, 'index'), 'index');
        const step: OneGrowsRestShiftStep = {
          kind: 'shift',
          index,
          fromY: num(field(p, 'fromY'), 'fromY'),
          toY: num(field(p, 'toY'), 'toY'),
          h: num(field(p, 'h'), 'h'),
        };
        const old = blockAt(scene, index);
        const blocks = scene.blocks.map((b, i) => (i === index ? { ...old, y: step.toY } : b));
        return { ...scene, blocks, step };
      }
      case 'container': {
        const step: OneGrowsRestShiftStep = {
          kind: 'container',
          from: num(field(p, 'from'), 'from'),
          to: num(field(p, 'to'), 'to'),
        };
        return {
          ...scene,
          total: step.to,
          tally: { kept: num(field(p, 'kept'), 'kept'), moved: num(field(p, 'moved'), 'moved') },
          step,
        };
      }
      default:
        throw new Error(`oneGrowsRestShiftScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
