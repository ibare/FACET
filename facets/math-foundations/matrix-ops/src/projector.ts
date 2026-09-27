/**
 * matrix-ops projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모양이 어긋나면 던진다 (0 을 지어내지 않는다).
 * 운동 길이는 판 머리의 motionMs 를 쥐고 그때그때 `runtime.getSpeed()` 로 나눈다.
 * 판 머리(`round`)에서 코드 패널 강조를 끈다 — 앞 판의 줄이 새 판에 남지 않게.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { MatrixOpsStage, StageCard, StagePoint, StageSpot } from './matrix-ops-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function int(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (!isInt(v)) throw new Error(`matrixOpsProjector: ${key} 가 정수가 아니다`);
  return v;
}

function matrix(v: unknown, key: string): number[] {
  if (!Array.isArray(v) || v.length !== 4) throw new Error(`matrixOpsProjector: ${key} 는 칸 넷이어야 한다`);
  return v.map((c) => {
    if (!isInt(c)) throw new Error(`matrixOpsProjector: ${key} 의 칸이 정수가 아니다`);
    return c;
  });
}

function points(v: unknown, key: string): StagePoint[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`matrixOpsProjector: ${key} 가 없다`);
  return v.map((q) => {
    if (!Array.isArray(q) || q.length !== 2 || !isInt(q[0]) || !isInt(q[1])) {
      throw new Error(`matrixOpsProjector: ${key} 의 점이 정수 쌍이 아니다`);
    }
    return [q[0], q[1]];
  });
}

function spots(v: unknown, key: string): StageSpot[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`matrixOpsProjector: ${key} 가 없다`);
  return v.map((s) => {
    if (typeof s !== 'object' || s === null) throw new Error(`matrixOpsProjector: ${key} 의 자리가 객체가 아니다`);
    const o = s as Record<string, unknown>;
    if (!isInt(o.x) || !isInt(o.y) || !isInt(o.n) || o.n < 1) throw new Error(`matrixOpsProjector: ${key} 의 자리가 어긋난다`);
    return { x: o.x, y: o.y, n: o.n };
  });
}

function card(v: unknown, key: string): StageCard {
  if (typeof v !== 'object' || v === null) throw new Error(`matrixOpsProjector: ${key} 가 없다`);
  const o = v as Record<string, unknown>;
  if (typeof o.mapId !== 'string' || typeof o.symbol !== 'string') throw new Error(`matrixOpsProjector: ${key} 의 이름이 없다`);
  return { mapId: o.mapId, symbol: o.symbol, m: matrix(o.m, `${key}.m`), det: int(o, 'det') };
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`matrixOpsProjector: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const matrixOpsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MatrixOpsStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('matrixOpsProjector: stage 가 없다');
  let motionMs: number | null = null;

  const ms = (): number => {
    if (motionMs === null) throw new Error('matrixOpsProjector: 판 머리 전에 걸음이 왔다');
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const phase = payloadOf(event).phase;
          if (typeof phase !== 'string') throw new Error('matrixOpsProjector: phase 가 문자열이 아니다');
          codePanel?.highlightPhase?.(phase);
          return;
        }
        case 'round': {
          const p = payloadOf(event);
          const m = p.motionMs;
          if (typeof m !== 'number' || m < 0) throw new Error('matrixOpsProjector: motionMs 가 없다');
          motionMs = m;
          codePanel?.highlightPhase?.(null);
          stage.round(
            {
              axisMax: int(p, 'axisMax'),
              total: int(p, 'total'),
              home: points(p.home, 'home'),
              xCard: card(p.xCard, 'xCard'),
              yCard: card(p.yCard, 'yCard'),
            },
            ms(),
          );
          return;
        }
        case 'jump-first': {
          const p = payloadOf(event);
          stage.jumpFirst({ points: points(p.points, 'points'), spots: spots(p.spots, 'spots'), spotCount: int(p, 'spotCount') }, ms());
          return;
        }
        case 'jump-second': {
          const p = payloadOf(event);
          stage.jumpSecond(
            {
              points: points(p.points, 'points'),
              spots: spots(p.spots, 'spots'),
              spotCount: int(p, 'spotCount'),
              homeCount: int(p, 'homeCount'),
              total: int(p, 'total'),
            },
            ms(),
          );
          return;
        }
        case 'compose': {
          const p = payloadOf(event);
          stage.product({ yx: matrix(p.yx, 'yx'), detY: int(p, 'detY'), detX: int(p, 'detX'), detYX: int(p, 'detYX') }, ms());
          return;
        }
        case 'jump-once': {
          const p = payloadOf(event);
          stage.jumpOnce(
            { points: points(p.points, 'points'), matchCount: int(p, 'matchCount'), total: int(p, 'total') },
            ms(),
          );
          return;
        }
        case 'jump-swapped': {
          const p = payloadOf(event);
          stage.jumpSwapped(
            {
              xy: matrix(p.xy, 'xy'),
              points: points(p.points, 'points'),
              spots: spots(p.spots, 'spots'),
              sameCount: int(p, 'sameCount'),
              total: int(p, 'total'),
            },
            ms(),
          );
          return;
        }
        default:
          throw new Error(`matrixOpsProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      codePanel?.highlightPhase?.(null);
      stage.reset();
    },
  };
};
