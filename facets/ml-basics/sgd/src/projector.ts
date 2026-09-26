/**
 * sgd projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 걸음 안(stepMs 의 60%)에서, 부를 때마다 `runtime.getSpeed()` 를 읽어 정한다.
 * payload 는 typeof 로 좁혀 읽는다. 없는 값을 지어내지 않고 던진다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { SgdEndView, SgdEpochView, SgdStage, SgdStartView, SgdStepView } from './sgd-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(p: unknown, what: string): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error(`sgd projector: ${what} payload 가 없다`);
  return p as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`sgd projector: ${key} 가 수가 아니다`);
  return x;
}
function nums(p: Record<string, unknown>, key: string): number[] {
  const x = p[key];
  if (!Array.isArray(x) || !x.every((y) => typeof y === 'number')) throw new Error(`sgd projector: ${key} 가 수 목록이 아니다`);
  return x as number[];
}
function bool(p: Record<string, unknown>, key: string): boolean {
  const x = p[key];
  if (typeof x !== 'boolean') throw new Error(`sgd projector: ${key} 가 참거짓이 아니다`);
  return x;
}

export const sgdProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SgdStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs: number | null = null;

  const dur = (): number => {
    if (stepMs === null) throw new Error('sgd projector: sgd-start 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return (stepMs * 0.6) / Math.max(0.01, speed);
  };

  return {
    onInit() {
      stage?.reset();
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('sgd projector: phase 이름이 없다');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'sgd-start': {
          const p = rec(event.payload, 'sgd-start');
          stepMs = num(p, 'stepMs');
          code?.highlightPhase?.(null);
          const view: SgdStartView = {
            batch: num(p, 'batch'),
            n: num(p, 'n'),
            epochs: num(p, 'epochs'),
            perEpoch: num(p, 'perEpoch'),
            totalUpdates: num(p, 'totalUpdates'),
            boundaries: nums(p, 'boundaries'),
            w: num(p, 'w'),
            b: num(p, 'b'),
            loss: num(p, 'loss'),
          };
          stage?.start(view, dur());
          return;
        }
        case 'sgd-epoch': {
          const p = rec(event.payload, 'sgd-epoch');
          const view: SgdEpochView = { epoch: num(p, 'epoch'), order: nums(p, 'order') };
          stage?.epoch(view, dur());
          return;
        }
        case 'sgd-step': {
          const p = rec(event.payload, 'sgd-step');
          const view: SgdStepView = {
            epoch: num(p, 'epoch'),
            batchIndex: num(p, 'batchIndex'),
            start: num(p, 'start'),
            size: num(p, 'size'),
            absAngle: num(p, 'absAngle'),
            backward: bool(p, 'backward'),
            w: num(p, 'w'),
            b: num(p, 'b'),
            loss: num(p, 'loss'),
            updates: num(p, 'updates'),
            backwardCount: num(p, 'backwardCount'),
          };
          stage?.step(view, dur());
          return;
        }
        case 'sgd-end': {
          const p = rec(event.payload, 'sgd-end');
          const view: SgdEndView = {
            epochs: num(p, 'epochs'),
            updates: num(p, 'updates'),
            backwardCount: num(p, 'backwardCount'),
            meanAbsAngle: num(p, 'meanAbsAngle'),
            w: num(p, 'w'),
            b: num(p, 'b'),
            loss: num(p, 'loss'),
          };
          stage?.end(view);
          return;
        }
        default:
          throw new Error(`sgd projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
