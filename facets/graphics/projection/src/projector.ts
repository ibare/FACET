/**
 * 카메라와 투영 — projector. 알고리즘 이벤트를 무대 메서드 호출로 옮긴다.
 * payload 는 typeof 가드로 읽고, 모르는 이벤트 · 빈 값은 던진다 (무대가 다시 셈하지 않는다).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';

type V3 = [number, number, number];

export type RoundView = {
  distance: number;
  projection: 'perspective' | 'orthographic';
  eye: V3;
  right: V3;
  forward: V3;
  near: number;
  orthoHalf: number;
  halfTan: number;
  motionMs: number;
  boxes: { id: string; corners: V3[]; edges: [number, number][] }[];
  topRange: { zMin: number; zMax: number };
  ratioScale: { min: number; max: number };
};
export type CameraView = { boxes: { id: string; depthMin: number; depthMax: number; nearAt: V3; farAt: V3 }[] };
export type ClipView = {
  near: number;
  behind: number;
  cut: number;
  dropped: number;
  added: number;
  boxes: { id: string; edges: { a: number; b: number; status: 'kept' | 'cut' | 'dropped'; from: V3; to: V3 }[] }[];
};
export type ProjectView = {
  projection: 'perspective' | 'orthographic';
  boxes: {
    id: string;
    width: number;
    bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
    segments: [number, number, number, number][];
  }[];
};
export type CompareView = { ratio: number; pct: number };

/** 무대가 여는 표면 — projector 는 이것만 부른다 */
export type ProjectionStage = {
  showRound(p: RoundView, speed: number): void;
  showCamera(p: CameraView, speed: number): void;
  showClip(p: ClipView, speed: number): void;
  showProject(p: ProjectView, speed: number): void;
  showCompare(p: CompareView, speed: number): void;
  reset(): void;
};

type CodePanel = { highlightPhase(phase: string | null): void };

// ─── 좁히개 ──────────────────────────────────────────────────────────────────

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`projectionProjector: ${what} 가 없다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`projectionProjector: ${what} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`projectionProjector: ${what} 가 글이 아니다`);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`projectionProjector: ${what} 가 배열이 아니다`);
  return v;
}
function v3(v: unknown, what: string): V3 {
  const a = arr(v, what);
  if (a.length !== 3) throw new Error(`projectionProjector: ${what} 는 세 칸이다`);
  return [num(a[0], what), num(a[1], what), num(a[2], what)];
}
function mode(v: unknown): 'perspective' | 'orthographic' {
  if (v === 'perspective' || v === 'orthographic') return v;
  throw new Error(`projectionProjector: 모르는 투영 ${String(v)}`);
}
function status(v: unknown): 'kept' | 'cut' | 'dropped' {
  if (v === 'kept' || v === 'cut' || v === 'dropped') return v;
  throw new Error(`projectionProjector: 모르는 모서리 상태 ${String(v)}`);
}

function readRound(raw: unknown): RoundView {
  const p = rec(raw, 'round payload');
  const axes = rec(p.axes, 'round.axes');
  const top = rec(p.topRange, 'round.topRange');
  const scale = rec(p.ratioScale, 'round.ratioScale');
  return {
    distance: num(p.distance, 'round.distance'),
    projection: mode(p.projection),
    eye: v3(p.eye, 'round.eye'),
    right: v3(axes.right, 'round.axes.right'),
    forward: v3(axes.forward, 'round.axes.forward'),
    near: num(p.near, 'round.near'),
    orthoHalf: num(p.orthoHalf, 'round.orthoHalf'),
    halfTan: num(p.halfTan, 'round.halfTan'),
    motionMs: num(p.motionMs, 'round.motionMs'),
    boxes: arr(p.boxes, 'round.boxes').map((b, i) => {
      const o = rec(b, `round.boxes[${i}]`);
      return {
        id: str(o.id, `round.boxes[${i}].id`),
        corners: arr(o.corners, `round.boxes[${i}].corners`).map((c) => v3(c, `round.boxes[${i}].corners`)),
        edges: arr(o.edges, `round.boxes[${i}].edges`).map((e) => {
          const pair = arr(e, 'edge');
          return [num(pair[0], 'edge a'), num(pair[1], 'edge b')] as [number, number];
        }),
      };
    }),
    topRange: { zMin: num(top.zMin, 'topRange.zMin'), zMax: num(top.zMax, 'topRange.zMax') },
    ratioScale: { min: num(scale.min, 'ratioScale.min'), max: num(scale.max, 'ratioScale.max') },
  };
}

function readCamera(raw: unknown): CameraView {
  const p = rec(raw, 'camera payload');
  return {
    boxes: arr(p.boxes, 'camera.boxes').map((b, i) => {
      const o = rec(b, `camera.boxes[${i}]`);
      return {
        id: str(o.id, 'camera.id'),
        depthMin: num(o.depthMin, 'camera.depthMin'),
        depthMax: num(o.depthMax, 'camera.depthMax'),
        nearAt: v3(o.nearAt, 'camera.nearAt'),
        farAt: v3(o.farAt, 'camera.farAt'),
      };
    }),
  };
}

function readClip(raw: unknown): ClipView {
  const p = rec(raw, 'clip payload');
  return {
    near: num(p.near, 'clip.near'),
    behind: num(p.behind, 'clip.behind'),
    cut: num(p.cut, 'clip.cut'),
    dropped: num(p.dropped, 'clip.dropped'),
    added: num(p.added, 'clip.added'),
    boxes: arr(p.boxes, 'clip.boxes').map((b, i) => {
      const o = rec(b, `clip.boxes[${i}]`);
      return {
        id: str(o.id, 'clip.id'),
        edges: arr(o.edges, 'clip.edges').map((e) => {
          const q = rec(e, 'clip.edge');
          return {
            a: num(q.a, 'clip.edge.a'),
            b: num(q.b, 'clip.edge.b'),
            status: status(q.status),
            from: v3(q.from, 'clip.edge.from'),
            to: v3(q.to, 'clip.edge.to'),
          };
        }),
      };
    }),
  };
}

function readProject(raw: unknown): ProjectView {
  const p = rec(raw, 'project payload');
  return {
    projection: mode(p.projection),
    boxes: arr(p.boxes, 'project.boxes').map((b, i) => {
      const o = rec(b, `project.boxes[${i}]`);
      const bd = rec(o.bounds, 'project.bounds');
      return {
        id: str(o.id, 'project.id'),
        width: num(o.width, 'project.width'),
        bounds: {
          xMin: num(bd.xMin, 'bounds.xMin'),
          xMax: num(bd.xMax, 'bounds.xMax'),
          yMin: num(bd.yMin, 'bounds.yMin'),
          yMax: num(bd.yMax, 'bounds.yMax'),
        },
        segments: arr(o.segments, 'project.segments').map((s) => {
          const q = arr(s, 'segment');
          if (q.length !== 4) throw new Error('projectionProjector: 선분은 네 칸이다');
          return [num(q[0], 'seg'), num(q[1], 'seg'), num(q[2], 'seg'), num(q[3], 'seg')] as [number, number, number, number];
        }),
      };
    }),
  };
}

function readCompare(raw: unknown): CompareView {
  const p = rec(raw, 'compare payload');
  return { ratio: num(p.ratio, 'compare.ratio'), pct: num(p.pct, 'compare.pct') };
}

export const projectionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ProjectionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const speed = (): number => runtime?.getSpeed() ?? 1;
  const need = (): ProjectionStage => {
    if (!stage) throw new Error('projectionProjector: stage 가 없다');
    return stage;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase payload');
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        case 'round':
          code?.highlightPhase(null);
          need().showRound(readRound(event.payload), speed());
          return;
        case 'camera':
          need().showCamera(readCamera(event.payload), speed());
          return;
        case 'clip':
          need().showClip(readClip(event.payload), speed());
          return;
        case 'project':
          need().showProject(readProject(event.payload), speed());
          return;
        case 'compare':
          need().showCompare(readCompare(event.payload), speed());
          return;
        default:
          throw new Error(`projectionProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase(null);
      stage?.reset();
    },
  };
};
