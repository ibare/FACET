/**
 * rasterization projector — algorithm 의 이벤트를 무대 메서드 호출로 옮긴다.
 * payload 는 typeof 가드로 좁히고, 모자라거나 모르는 모양은 무엇이 없는지 담아 던진다.
 * 운동 길이가 재생 속도를 따라가도록 부를 때마다 runtime.getSpeed() 를 읽어 넘긴다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  RasterCount,
  RasterInit,
  RasterInsert,
  RasterInterpolate,
  RasterizationStage,
  RasterLine,
  RasterOrder,
  RasterPaint,
  RasterTri,
  RasterCover,
} from './rasterization-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`rasterization projector: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`rasterization projector: ${what} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`rasterization projector: ${what} 가 문자열이 아니다`);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`rasterization projector: ${what} 가 배열이 아니다`);
  return v;
}
function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`rasterization projector: ${what} 가 참거짓이 아니다`);
  return v;
}
const nums = (v: unknown, what: string): number[] => arr(v, what).map((x, i) => num(x, `${what}[${i}]`));
function mode(v: unknown): 'depth-buffer' | 'painter' {
  if (v === 'depth-buffer' || v === 'painter') return v;
  throw new Error(`rasterization projector: 모르는 가림 방식 ${String(v)}`);
}
function line(v: unknown, what: string): RasterLine | null {
  if (v === null) return null;
  const o = obj(v, what);
  return { x1: num(o.x1, `${what}.x1`), y1: num(o.y1, `${what}.y1`), x2: num(o.x2, `${what}.x2`), y2: num(o.y2, `${what}.y2`) };
}

function readInit(p: unknown): RasterInit {
  const o = obj(p, 'init');
  const knob = obj(o.knob, 'init.knob');
  const triangles: RasterTri[] = arr(o.triangles, 'init.triangles').map((tv, i) => {
    const tr = obj(tv, `init.triangles[${i}]`);
    const vertices = arr(tr.vertices, `triangles[${i}].vertices`).map((vv, j) => {
      const xy = nums(vv, `triangles[${i}].vertices[${j}]`);
      if (xy.length !== 2) throw new Error(`rasterization projector: triangles[${i}].vertices[${j}] 가 좌표 둘이 아니다`);
      return [xy[0], xy[1]] as [number, number];
    });
    const depths = nums(tr.depths, `triangles[${i}].depths`);
    if (vertices.length !== 3 || depths.length !== 3) throw new Error(`rasterization projector: triangles[${i}] 가 꼭짓점 셋이 아니다`);
    return { id: str(tr.id, `triangles[${i}].id`), vertices, depths };
  });
  return {
    mode: mode(o.mode),
    width: num(o.width, 'init.width'),
    height: num(o.height, 'init.height'),
    motionMs: num(o.motionMs, 'init.motionMs'),
    triangles,
    knob: {
      triangle: str(knob.triangle, 'knob.triangle'),
      vertex: num(knob.vertex, 'knob.vertex'),
      depth: num(knob.depth, 'knob.depth'),
      previousDepth: knob.previousDepth === null ? null : num(knob.previousDepth, 'knob.previousDepth'),
    },
    nearDepth: num(o.nearDepth, 'init.nearDepth'),
    clearDepth: num(o.clearDepth, 'init.clearDepth'),
    ticks: nums(o.ticks, 'init.ticks'),
    previousLine: line(o.previousLine, 'init.previousLine'),
  };
}

function readCover(p: unknown): RasterCover {
  const o = obj(p, 'cover');
  return {
    triangles: arr(o.triangles, 'cover.triangles').map((tv, i) => {
      const tr = obj(tv, `cover.triangles[${i}]`);
      return { id: str(tr.id, `cover.triangles[${i}].id`), cells: nums(tr.cells, `cover.triangles[${i}].cells`) };
    }),
    overlap: nums(o.overlap, 'cover.overlap'),
  };
}

function readInterpolate(p: unknown): RasterInterpolate {
  const o = obj(p, 'interpolate');
  const other = obj(o.other, 'interpolate.other');
  return {
    triangle: str(o.triangle, 'interpolate.triangle'),
    cells: arr(o.cells, 'interpolate.cells').map((cv, i) => {
      const c = obj(cv, `interpolate.cells[${i}]`);
      return { k: num(c.k, 'cell.k'), z: num(c.z, 'cell.z') };
    }),
    min: num(o.min, 'interpolate.min'),
    max: num(o.max, 'interpolate.max'),
    other: { id: str(other.id, 'other.id'), min: num(other.min, 'other.min'), max: num(other.max, 'other.max'), flat: bool(other.flat, 'other.flat') },
  };
}

function readOrder(p: unknown): RasterOrder {
  const o = obj(p, 'order');
  return {
    centroids: arr(o.centroids, 'order.centroids').map((cv, i) => {
      const c = obj(cv, `order.centroids[${i}]`);
      return { id: str(c.id, 'centroid.id'), depth: num(c.depth, 'centroid.depth') };
    }),
    first: str(o.first, 'order.first'),
    second: str(o.second, 'order.second'),
  };
}

function readInsert(p: unknown): RasterInsert {
  const o = obj(p, 'depth-insert');
  return {
    triangle: str(o.triangle, 'depth-insert.triangle'),
    empty: nums(o.empty, 'depth-insert.empty'),
    overwritten: nums(o.overwritten, 'depth-insert.overwritten'),
    discarded: nums(o.discarded, 'depth-insert.discarded'),
  };
}

function readPaint(p: unknown): RasterPaint {
  const o = obj(p, 'paint');
  const rank = o.rank;
  if (rank !== 'far' && rank !== 'near') throw new Error(`rasterization projector: paint.rank ${String(rank)} 를 모른다`);
  return { triangle: str(o.triangle, 'paint.triangle'), rank, cells: nums(o.cells, 'paint.cells'), covered: nums(o.covered, 'paint.covered') };
}

function readCount(p: unknown): RasterCount {
  const o = obj(p, 'count');
  return {
    mode: mode(o.mode),
    counted: str(o.counted, 'count.counted'),
    other: str(o.other, 'count.other'),
    countedWins: num(o.countedWins, 'count.countedWins'),
    truthCountedWins: num(o.truthCountedWins, 'count.truthCountedWins'),
    otherWins: num(o.otherWins, 'count.otherWins'),
    overlap: num(o.overlap, 'count.overlap'),
    owners: arr(o.owners, 'count.owners').map((ov, i) => {
      const w = obj(ov, `count.owners[${i}]`);
      return { k: num(w.k, 'owner.k'), id: str(w.id, 'owner.id') };
    }),
    wrong: nums(o.wrong, 'count.wrong'),
    line: line(o.line, 'count.line'),
  };
}

export const rasterizationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RasterizationStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): RasterizationStage => {
    if (!stage) throw new Error('rasterization projector: stage 블록이 없다');
    return stage;
  };
  // 러너 밖(검사)에서는 runtime 이 없다 — 그때는 재생 속도 1 로 본다
  const speed = () => (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const phase = str(obj(event.payload, 'phase').phase, 'phase.phase');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'init':
          // 새 판 — 앞 판의 코드 강조를 끈다
          code?.highlightPhase?.(null);
          need().init(readInit(event.payload), speed());
          return;
        case 'cover':
          need().cover(readCover(event.payload), speed());
          return;
        case 'interpolate':
          need().interpolate(readInterpolate(event.payload), speed());
          return;
        case 'order':
          need().order(readOrder(event.payload), speed());
          return;
        case 'depth-insert':
          need().depthInsert(readInsert(event.payload), speed());
          return;
        case 'paint':
          need().paint(readPaint(event.payload), speed());
          return;
        case 'count':
          need().count(readCount(event.payload), speed());
          return;
        default:
          throw new Error(`rasterization projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
