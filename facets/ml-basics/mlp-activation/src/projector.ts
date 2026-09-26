/**
 * mlp-activation projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   init      → stage.setup(layout)            (silent — 평면 · 눈금 · 점의 자리)
 *   phase     → codePanel.highlightPhase(phase) (silent)
 *   snapshot  → stage.show(frame, 운동 길이)    (걸음 — 경계가 휘어 가는 운동이 끝날 때까지 기다린다)
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 나눈다. payload 는 typeof 가드로 좁히고 모자라면 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { MlpActivationFrame, MlpActivationLayout, MlpActivationPoint } from './algorithm.js';
import type { MlpActivationStage } from './mlp-activation-stage.js';

/** 경계가 휘어 가는 운동의 길이 (재생 속도 1 에서) */
const MOTION_MS = 800;

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
};

const fail = (what: string): never => {
  throw new Error(`[mlpActivationProjector] payload 가 모자라다: ${what}`);
};

const obj = (x: unknown, what: string): Record<string, unknown> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return fail(what);
  return x as Record<string, unknown>;
};
const num = (x: unknown, what: string): number => (typeof x === 'number' && Number.isFinite(x) ? x : fail(what));
const nums = (x: unknown, what: string): number[] => {
  if (!Array.isArray(x)) return fail(what);
  return x.map((v, i) => num(v, `${what}[${i}]`));
};
const bools = (x: unknown, what: string): boolean[] => {
  if (!Array.isArray(x)) return fail(what);
  return x.map((v, i) => (typeof v === 'boolean' ? v : fail(`${what}[${i}]`)));
};
const segs = (x: unknown, what: string): (number[] | null)[] => {
  if (!Array.isArray(x)) return fail(what);
  return x.map((v, i) => {
    if (v === null) return null;
    const s = nums(v, `${what}[${i}]`);
    return s.length === 4 ? s : fail(`${what}[${i}]`);
  });
};
const points = (x: unknown): MlpActivationPoint[] => {
  if (!Array.isArray(x)) return fail('points');
  return x.map((v, i) => {
    const o = obj(v, `points[${i}]`);
    const id = typeof o.id === 'string' ? o.id : fail(`points[${i}].id`);
    return { id, x1: num(o.x1, 'x1'), x2: num(o.x2, 'x2'), y: num(o.y, 'y') };
  });
};

function readLayout(payload: unknown): MlpActivationLayout {
  const p = obj(payload, 'init');
  return {
    plane: nums(p.plane, 'plane'),
    planeTicks: nums(p.planeTicks, 'planeTicks'),
    gridSteps: num(p.gridSteps, 'gridSteps'),
    snapshots: nums(p.snapshots, 'snapshots'),
    lossTicks: nums(p.lossTicks, 'lossTicks'),
    lossTop: num(p.lossTop, 'lossTop'),
    curveRange: nums(p.curveRange, 'curveRange'),
    curveSamples: num(p.curveSamples, 'curveSamples'),
    points: points(p.points),
    maxWidth: num(p.maxWidth, 'maxWidth'),
  };
}

function readFrame(payload: unknown): MlpActivationFrame {
  const p = obj(payload, 'snapshot');
  return {
    step: num(p.step, 'step'),
    epoch: num(p.epoch, 'epoch'),
    kind: num(p.kind, 'kind'),
    width: num(p.width, 'width'),
    grid: nums(p.grid, 'grid'),
    correct: bools(p.correct, 'correct'),
    right: num(p.right, 'right'),
    total: num(p.total, 'total'),
    loss: num(p.loss, 'loss'),
    losses: nums(p.losses, 'losses'),
    units: segs(p.units, 'units'),
    curve: nums(p.curve, 'curve'),
  };
}

export const mlpActivationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MlpActivationStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const needStage = (): MlpActivationStage => {
    if (!stage) throw new Error('[mlpActivationProjector] stage 가 없다');
    return stage;
  };

  return {
    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          const name = typeof p.phase === 'string' ? p.phase : fail('phase');
          code?.highlightPhase?.(name);
          return;
        }
        case 'init':
          code?.highlightPhase?.(null);
          needStage().setup(readLayout(event.payload));
          return;
        case 'snapshot': {
          const speed = runtime ? runtime.getSpeed() : 1;
          return needStage().show(readFrame(event.payload), MOTION_MS / Math.max(0.01, speed));
        }
        default:
          throw new Error(`[mlpActivationProjector] 모르는 이벤트: ${event.type}`);
      }
    },
    onReset(): void {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
  };
};
