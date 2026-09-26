/**
 * overfitting projector — algorithm 이벤트를 무대 메서드 호출로 옮긴다.
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다 (요소를 만들 때 한 번 박지 않는다).
 * 걸음 0(init · round) 에서 코드 패널을 끈다 — 앞 판의 강조를 새 판의 걸음 0 에 남기지 않는다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { OverfittingStage, StagePoint, StageResidual, StageSetup, StageTrainPoint } from './overfitting-stage.js';

/** 곡선이 옮겨 가는 운동 (속도 1 에서) — 사양: 700 안쪽 */
const MOTION_MS = 680;

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`overfitting projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`overfitting projector: ${key} 가 수가 아니다`);
  return v;
}
function nums(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`overfitting projector: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`overfitting projector: ${key}[${i}] 가 수가 아니다`);
    return x;
  });
}
function list(o: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`overfitting projector: ${key} 가 배열이 아니다`);
  return v.map((x, i) => rec(x, `${key}[${i}]`));
}
function residuals(o: Record<string, unknown>): StageResidual[] {
  return list(o, 'residuals').map((r) => ({ index: num(r, 'index'), yhat: num(r, 'yhat') }));
}

export const overfittingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as OverfittingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): OverfittingStage => {
    if (!stage) throw new Error('overfitting projector: 무대가 없다');
    return stage;
  };
  const motion = () => MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const o = rec(p, 'phase payload');
          const name = o.phase;
          if (typeof name !== 'string') throw new Error('overfitting projector: phase 이름이 없다');
          code?.highlightPhase(name);
          return;
        }
        case 'init': {
          const o = rec(p, 'init payload');
          const setup: StageSetup = {
            xLo: num(o, 'xLo'),
            xHi: num(o, 'xHi'),
            yLo: num(o, 'yLo'),
            yHi: num(o, 'yHi'),
            errMax: num(o, 'errMax'),
            train: list(o, 'train').map((q): StageTrainPoint => ({ x: num(q, 'x'), y: num(q, 'y'), level: num(q, 'level') })),
            val: list(o, 'val').map((q): StagePoint => ({ x: num(q, 'x'), y: num(q, 'y') })),
            n: num(o, 'n'),
            d: num(o, 'd'),
            active: nums(o, 'active'),
          };
          code?.highlightPhase(null);
          need().setup(setup);
          return;
        }
        case 'round': {
          const o = rec(p, 'round payload');
          code?.highlightPhase(null);
          return need().showRound(num(o, 'n'), num(o, 'd'), nums(o, 'active'), motion());
        }
        case 'fit': {
          const o = rec(p, 'fit payload');
          return need().showFit(num(o, 'd'), nums(o, 'coefficients'), motion());
        }
        case 'train-err': {
          const o = rec(p, 'train-err payload');
          return need().showTrainErr(num(o, 'mse'), residuals(o), motion());
        }
        case 'val-err': {
          const o = rec(p, 'val-err payload');
          return need().showValErr(num(o, 'mse'), num(o, 'trainMse'), residuals(o), motion());
        }
        default:
          throw new Error(`overfitting projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase(null);
    },
  };
};
