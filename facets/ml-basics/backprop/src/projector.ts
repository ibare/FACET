/**
 * backprop projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 비거나 모양이 다르면 던진다. 운동 길이는 걸음마다
 * `runtime.getSpeed()` 로 그때그때 읽어 나눈다. 코드 패널은 `phase` 로 켜고, 판 머리(#0)에서 끈다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { WeightKind } from './algorithm.js';
import type { BackpropStage, NetView } from './backprop-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

const KINDS: readonly WeightKind[] = ['w2', 'wa', 'wb'];

const rec = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`backprop: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
};
const num = (o: Record<string, unknown>, key: string): number => {
  const v = o[key];
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`backprop: ${key} 가 수가 아니다`);
  return v;
};
const str = (o: Record<string, unknown>, key: string): string => {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`backprop: ${key} 가 글자가 아니다`);
  return v;
};
const list = (o: Record<string, unknown>, key: string): unknown[] => {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`backprop: ${key} 가 배열이 아니다`);
  return v;
};
const kind = (o: Record<string, unknown>, key: string): WeightKind => {
  const v = str(o, key);
  const k = KINDS.find((x) => x === v);
  if (k === undefined) throw new Error(`backprop: 모르는 무게 ${v}`);
  return k;
};

export const backpropProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as BackpropStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  let motionMs = 0;
  const dur = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };
  const need = (): BackpropStage => {
    if (!stage) throw new Error('backprop: 무대가 없다');
    return stage;
  };

  return {
    onInit(initialData) {
      const d = rec(initialData, 'initialData');
      motionMs = num(d, 'motionMs');
    },

    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'net-drawn': {
          const p = rec(event.payload, 'net-drawn');
          const view: NetView = {
            width: num(p, 'width'),
            nudge: num(p, 'nudge'),
            weightCount: num(p, 'weightCount'),
            x1: num(p, 'x1'),
            x2: num(p, 'x2'),
            y: num(p, 'y'),
            barMax: num(p, 'barMax'),
            gapScale: num(p, 'gapScale'),
            units: list(p, 'units').map((u) => ({ id: str(rec(u, 'unit'), 'id') })),
          };
          code?.highlightPhase?.(null);
          need().showNet(view, dur());
          return;
        }
        case 'forward-done': {
          const p = rec(event.payload, 'forward-done');
          need().showForward(
            {
              on: list(p, 'units').map((u) => {
                const v = rec(u, 'unit')['on'];
                if (typeof v !== 'boolean') throw new Error('backprop: on 이 참거짓이 아니다');
                return v;
              }),
              yHat: num(p, 'yHat'),
              loss: num(p, 'loss'),
              backpropMults: num(p, 'backpropMults'),
            },
            dur(),
          );
          return;
        }
        case 'backward-done': {
          const p = rec(event.payload, 'backward-done');
          need().showBackward(
            {
              d: num(p, 'd'),
              grads: list(p, 'grads').map((g) => {
                const o = rec(g, 'grad');
                return { wa: num(o, 'wa'), wb: num(o, 'wb'), w2: num(o, 'w2') };
              }),
              backpropMults: num(p, 'backpropMults'),
            },
            dur(),
          );
          return;
        }
        case 'nudge-done': {
          const p = rec(event.payload, 'nudge-done');
          need().showNudge(
            {
              weight: kind(p, 'weight'),
              offsets: list(p, 'offsets').map((v) => {
                if (typeof v !== 'number') throw new Error('backprop: 표지의 자리가 수가 아니다');
                return v;
              }),
              nudgeMults: num(p, 'nudgeMults'),
            },
            dur(),
          );
          return;
        }
        case 'gaps-compared': {
          const p = rec(event.payload, 'gaps-compared');
          need().showCompare(
            {
              maxGap: num(p, 'maxGap'),
              gapDigits: num(p, 'gapDigits'),
              maxUnit: num(p, 'maxUnit'),
              maxWeight: kind(p, 'maxWeight'),
              ratio: num(p, 'ratio'),
            },
            dur(),
          );
          return;
        }
        default:
          throw new Error(`backprop: 모르는 이벤트 ${event.type}`);
      }
    },

    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset();
    },

    onDestroy() {
      // 무대의 정리는 러너가 destroy 로 한다
    },
  };
};
