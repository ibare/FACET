/**
 * early-stopping projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * `es-run` → 무대 `beginRun` (판 머리, 코드 패널 강조를 끈다) · `es-epoch` → `showEpoch` ·
 * `es-restore` → `showRestore` · `phase` → 코드 패널 `highlightPhase`.
 * payload 는 typeof 로 좁힌다. 빈 값은 지어내지 않고 던진다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { EarlyStoppingStage, EsEpochView } from './early-stopping-stage.js';

/** 운동 길이 — 재생 속도 1 에서. */
const MOTION_MS = 250;

type CodePanel = { highlightPhase?(phase: string | null): void };

type Bag = Record<string, unknown>;

function bag(payload: unknown, type: string): Bag {
  if (typeof payload !== 'object' || payload === null) throw new Error(`early-stopping projector: ${type} 의 payload 가 없다`);
  return payload as Record<string, unknown>;
}

function num(p: Bag, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`early-stopping projector: ${key} 가 수가 아니다`);
  return v;
}

function nums(p: Bag, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`early-stopping projector: ${key} 가 목록이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`early-stopping projector: ${key} 에 수가 아닌 값`);
    return x;
  });
}

function verdictOf(p: Bag): EsEpochView['verdict'] {
  const v = p.verdict;
  if (v === 'start' || v === 'improve' || v === 'wait' || v === 'stop') return v;
  throw new Error(`early-stopping projector: 모르는 판정 ${String(v)}`);
}

export const earlyStoppingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EarlyStoppingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.1, runtime?.getSpeed() ?? 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = bag(event.payload, 'phase');
          const name = p.phase;
          if (typeof name !== 'string') throw new Error('early-stopping projector: phase 이름이 없다');
          code?.highlightPhase?.(name);
          return;
        }
        case 'es-run': {
          const p = bag(event.payload, event.type);
          code?.highlightPhase?.(null);
          stage?.beginRun(
            {
              patience: num(p, 'patience'),
              epochCount: num(p, 'epochCount'),
              featureCount: num(p, 'featureCount'),
              yMin: num(p, 'yMin'),
              yMax: num(p, 'yMax'),
              wAbs: num(p, 'wAbs'),
            },
            motion(),
          );
          return;
        }
        case 'es-epoch': {
          const p = bag(event.payload, event.type);
          stage?.showEpoch(
            {
              epoch: num(p, 'epoch'),
              val: num(p, 'val'),
              bestEpoch: num(p, 'bestEpoch'),
              bestVal: num(p, 'bestVal'),
              wait: num(p, 'wait'),
              patience: num(p, 'patience'),
              verdict: verdictOf(p),
              weights: nums(p, 'weights'),
            },
            motion(),
          );
          return;
        }
        case 'es-restore': {
          const p = bag(event.payload, event.type);
          stage?.showRestore(
            {
              bestEpoch: num(p, 'bestEpoch'),
              bestVal: num(p, 'bestVal'),
              stopEpoch: num(p, 'stopEpoch'),
              weights: nums(p, 'weights'),
            },
            motion(),
          );
          return;
        }
        default:
          throw new Error(`early-stopping projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
