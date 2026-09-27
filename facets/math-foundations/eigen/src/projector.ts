/**
 * eigen projector — algorithm 이벤트를 무대 메서드 호출로 옮긴다.
 *
 *   board   (silent) → stage.board (무대를 비우고 다시 짓는다 · 화살표가 새 출발 방향으로 돈다)
 *                     코드 패널 강조는 끈다 (앞 판의 결론을 남기지 않는다)
 *   origin  → stage.origin (걸음 0)
 *   product → stage.product (곱 하나의 운동)
 *   phase   → 코드 패널 highlightPhase
 *
 * 운동 길이는 motionMs ÷ 재생 속도를 그때그때 읽는다. 모르는 이벤트는 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { EigenBoardView, EigenProductView, EigenRowView, EigenStage } from './eigen-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function obj(payload: unknown, what: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`eigen: ${what} payload 가 객체가 아니다`);
  return payload as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`eigen: payload.${key} 가 수가 아니다`);
  return v;
}

function numOrNull(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`eigen: payload.${key} 가 수도 null 도 아니다`);
  return v;
}

function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`eigen: payload.${key} 가 참거짓이 아니다`);
  return v;
}

function readBoard(p: Record<string, unknown>): EigenBoardView {
  const a = p.a;
  if (!Array.isArray(a) || a.length !== 4 || !a.every((x) => typeof x === 'number' && Number.isInteger(x))) {
    throw new Error('eigen: payload.a 는 정수 넷이어야 한다');
  }
  const logMin = num(p, 'logMin');
  const logMax = num(p, 'logMax');
  if (!(logMax > logMin)) throw new Error('eigen: 축 범위가 비었다');
  return {
    a: a.slice(),
    big: num(p, 'big'),
    small: num(p, 'small'),
    ratioExpected: num(p, 'ratioExpected'),
    vx: num(p, 'vx'),
    vy: num(p, 'vy'),
    showRatio: bool(p, 'showRatio'),
    first: num(p, 'first'),
    products: num(p, 'products'),
    planeMax: num(p, 'planeMax'),
    logMin,
    logMax,
    thresholdLog: num(p, 'thresholdLog'),
  };
}

function readRow(p: Record<string, unknown>): EigenRowView {
  return {
    k: num(p, 'k'),
    vx: num(p, 'vx'),
    vy: num(p, 'vy'),
    angle: num(p, 'angle'),
    gap: num(p, 'gap'),
    tanLog: numOrNull(p, 'tanLog'),
    side: num(p, 'side'),
    inside: bool(p, 'inside'),
    alignedNow: bool(p, 'alignedNow'),
    first: num(p, 'first'),
    last: bool(p, 'last'),
  };
}

function readProduct(p: Record<string, unknown>): EigenProductView {
  return {
    ...readRow(p),
    wx: num(p, 'wx'),
    wy: num(p, 'wy'),
    stretch: num(p, 'stretch'),
    tanRatio: numOrNull(p, 'tanRatio'),
    crossed: bool(p, 'crossed'),
  };
}

export const eigenProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EigenStage | undefined;
  if (!stage) throw new Error('eigen: stage 블록이 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const duration = (): number => {
    if (motionMs === null) throw new Error('eigen: 판 머리 없이 걸음이 왔다');
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? motionMs / speed : 0;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('eigen: phase 이름이 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'board': {
          const p = obj(event.payload, 'board');
          motionMs = num(p, 'motionMs');
          code?.highlightPhase(null);
          stage.board(readBoard(p), duration());
          return;
        }
        case 'origin':
          stage.origin(readRow(obj(event.payload, 'origin')));
          return;
        case 'product':
          stage.product(readProduct(obj(event.payload, 'product')), duration());
          return;
        default:
          throw new Error(`eigen: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      stage.reset();
      code?.clearHighlight();
    },
  };
};
