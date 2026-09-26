/**
 * loss projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * init → stage.setup (축 · 곡선) · start → stage.start (출력이 p0 자리로 옮겨 간다) ·
 * slope → stage.slope (미는 크기가 뻗는다) · update → stage.update (곡선을 따라 미끄러진다) ·
 * phase → codePanel.highlightPhase.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { LossAxesIn, LossStage } from './loss-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function rec(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('loss: payload 가 객체가 아니다');
  return payload as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`loss: payload.${key} 가 수가 아니다`);
  return v;
}
function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`loss: payload.${key} 가 수의 배열이 아니다`);
  }
  return v as number[];
}
function numsList(p: Record<string, unknown>, key: string): number[][] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`loss: payload.${key} 가 배열이 아니다`);
  return v.map((row, i) => nums({ [`${key}[${i}]`]: row }, `${key}[${i}]`));
}
function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`loss: payload.${key} 가 참거짓이 아니다`);
  return v;
}

function readAxes(p: Record<string, unknown>): LossAxesIn {
  return {
    zMin: num(p, 'zMin'),
    zMax: num(p, 'zMax'),
    zTicks: nums(p, 'zTicks'),
    curveZ: nums(p, 'curveZ'),
    curves: numsList(p, 'curves'),
    lMax: nums(p, 'lMax'),
    lTicks: numsList(p, 'lTicks'),
    gMax: num(p, 'gMax'),
    gTicks: nums(p, 'gTicks'),
    pTicks: nums(p, 'pTicks'),
    half: num(p, 'half'),
  };
}

export const lossProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LossStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const speed = (): number => runtime?.getSpeed() ?? 1;
  const need = (): LossStage => {
    if (!stage) throw new Error('loss: 무대가 없다');
    return stage;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const phase = rec(event.payload).phase;
          if (typeof phase !== 'string') throw new Error('loss: phase 이름이 없다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'init':
          need().setup(readAxes(rec(event.payload)));
          return;
        case 'start': {
          const p = rec(event.payload);
          return need().start({ kind: num(p, 'kind'), z: num(p, 'z'), p: num(p, 'p'), L: num(p, 'L') }, speed());
        }
        case 'slope': {
          const p = rec(event.payload);
          return need().slope(
            { kind: num(p, 'kind'), z: num(p, 'z'), p: num(p, 'p'), L: num(p, 'L'), g: num(p, 'g') },
            speed(),
          );
        }
        case 'update': {
          const p = rec(event.payload);
          const crossed = p.crossedAt;
          if (crossed !== null && typeof crossed !== 'number') throw new Error('loss: payload.crossedAt 가 수도 null 도 아니다');
          return need().update(
            {
              kind: num(p, 'kind'),
              t: num(p, 't'),
              steps: num(p, 'steps'),
              z: num(p, 'z'),
              p: num(p, 'p'),
              L: num(p, 'L'),
              g: num(p, 'g'),
              crossedAt: crossed,
              last: bool(p, 'last'),
            },
            speed(),
          );
        }
        default:
          throw new Error(`loss: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
  };
};
