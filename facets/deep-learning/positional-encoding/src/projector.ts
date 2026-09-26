/**
 * positional-encoding projector — 알고리즘의 판 · 걸음 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 나눈다 (걸음 경계를 넘지 않게).
 * payload 는 typeof 로 좁히고, 모양이 어긋나면 던진다 (C9 · C6). 모르는 이벤트도 던진다.
 * IR 이 없어 phase 이벤트는 오지 않는다 — 오면 알고리즘과 어긋난 것이라 던진다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { PositionalEncodingStage } from './positional-encoding-stage.js';

/** 운동 한 번의 길이 (재생 속도 1 에서) — 걸음당 600 안쪽 */
const MOVE_MS = 520;

function record(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`positional-encoding: '${type}' payload 가 없다`);
  return payload as Record<string, unknown>;
}

function numberOf(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`positional-encoding: payload.${key} 가 수가 아니다`);
  return v;
}

function numbersIn(v: unknown, label: string): number[] {
  if (!Array.isArray(v)) throw new Error(`positional-encoding: payload.${label} 가 배열이 아니다`);
  return v.map((x: unknown, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`positional-encoding: payload.${label}[${i}] 가 수가 아니다`);
    return x;
  });
}

function numbersOf(o: Record<string, unknown>, key: string): number[] {
  return numbersIn(o[key], key);
}

function matrixOf(o: Record<string, unknown>, key: string): number[][] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`positional-encoding: payload.${key} 가 배열이 아니다`);
  return v.map((row: unknown, i) => numbersIn(row, `${key}[${i}]`));
}

export const positionalEncodingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PositionalEncodingStage | undefined;
  const ms = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOVE_MS / speed : 0;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      if (stage === undefined) throw new Error('positional-encoding: stage 가 없다');
      const p = record(event.payload, event.type);
      switch (event.type) {
        case 'board':
          stage.board({ dModel: numberOf(p, 'dModel'), positions: numberOf(p, 'positions'), pairs: numberOf(p, 'pairs') }, ms());
          return;
        case 'encoding':
          stage.encoding({ dModel: numberOf(p, 'dModel'), omegas: numbersOf(p, 'omegas'), rows: matrixOf(p, 'rows') });
          return;
        case 'distances':
          stage.distances({ distances: numbersOf(p, 'distances'), axisMax: numberOf(p, 'axisMax') }, ms());
          return;
        case 'neighbour':
          stage.neighbour({ neighbour: numberOf(p, 'neighbour'), confusable: numbersOf(p, 'confusable') }, ms());
          return;
        case 'nearest':
          stage.nearest(
            {
              gap: numberOf(p, 'gap'),
              distance: numberOf(p, 'distance'),
              rowZero: numbersOf(p, 'rowZero'),
              rowGap: numbersOf(p, 'rowGap'),
            },
            ms(),
          );
          return;
        default:
          throw new Error(`positional-encoding: 모르는 이벤트 '${event.type}'`);
      }
    },
  };
};
