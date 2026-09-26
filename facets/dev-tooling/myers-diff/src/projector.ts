/**
 * myers-diff projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 MOTION_MS 를 `runtime.getSpeed()` 로 그때그때 나눈다.
 * payload 는 typeof 로 읽고, 없거나 모양이 다르면 필드 경로를 담아 던진다 (C6 · C9).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { FoldRowView, FoldView, MyersDiffStage, PayView, Pt, RoundStartView, SlideView } from './myers-diff-stage.js';

const MOTION_MS = 300;

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`myers-diff: ${where} 가 객체가 아니다`);
  return value as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const value = o[key];
  if (typeof value !== 'number') throw new Error(`myers-diff: ${where}.${key} 가 수가 아니다`);
  return value;
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const value = o[key];
  if (typeof value !== 'string') throw new Error(`myers-diff: ${where}.${key} 가 글자가 아니다`);
  return value;
}

function list(o: Record<string, unknown>, key: string, where: string): unknown[] {
  const value = o[key];
  if (!Array.isArray(value)) throw new Error(`myers-diff: ${where}.${key} 가 배열이 아니다`);
  return value;
}

function nums(o: Record<string, unknown>, key: string, where: string): number[] {
  return list(o, key, where).map((v, i) => {
    if (typeof v !== 'number') throw new Error(`myers-diff: ${where}.${key}[${i}] 가 수가 아니다`);
    return v;
  });
}

function points(o: Record<string, unknown>, key: string, where: string): Pt[] {
  return list(o, key, where).map((v, i) => {
    const p = rec(v, `${where}.${key}[${i}]`);
    return { x: num(p, 'x', `${where}.${key}[${i}]`), y: num(p, 'y', `${where}.${key}[${i}]`) };
  });
}

function kindOf<K extends string>(value: string, allowed: readonly K[], where: string): K {
  const found = allowed.find((k) => k === value);
  if (found === undefined) throw new Error(`myers-diff: ${where} 의 모르는 값 ${value}`);
  return found;
}

function readRound(payload: unknown): RoundStartView {
  const w = 'round-start';
  const p = rec(payload, w);
  return {
    k: num(p, 'k', w),
    n: num(p, 'n', w),
    m: num(p, 'm', w),
    delSpots: nums(p, 'delSpots', w),
    insSpots: nums(p, 'insSpots', w),
    matches: points(p, 'matches', w),
    tableCells: num(p, 'tableCells', w),
    cellsScale: num(p, 'cellsScale', w),
  };
}

function readPay(payload: unknown): PayView {
  const w = 'layer-pay';
  const p = rec(payload, w);
  return {
    d: num(p, 'd', w),
    moves: list(p, 'moves', w).map((v, i) => {
      const at = `${w}.moves[${i}]`;
      const mv = rec(v, at);
      return {
        k: num(mv, 'k', at),
        fromX: num(mv, 'fromX', at),
        fromY: num(mv, 'fromY', at),
        toX: num(mv, 'toX', at),
        toY: num(mv, 'toY', at),
        dir: kindOf(str(mv, 'dir', at), ['del', 'ins'] as const, `${at}.dir`),
      };
    }),
    work: num(p, 'work', w),
  };
}

function readSlide(payload: unknown): SlideView {
  const w = 'layer-slide';
  const p = rec(payload, w);
  const reached = p.reached;
  if (typeof reached !== 'boolean') throw new Error(`myers-diff: ${w}.reached 가 참거짓이 아니다`);
  return {
    d: num(p, 'd', w),
    runs: list(p, 'runs', w).map((v, i) => {
      const at = `${w}.runs[${i}]`;
      const r = rec(v, at);
      return {
        k: num(r, 'k', at),
        fromX: num(r, 'fromX', at),
        fromY: num(r, 'fromY', at),
        toX: num(r, 'toX', at),
        toY: num(r, 'toY', at),
        len: num(r, 'len', at),
      };
    }),
    layerSlides: num(p, 'layerSlides', w),
    reached,
    work: num(p, 'work', w),
  };
}

function readFold(payload: unknown): FoldView {
  const w = 'fold';
  const p = rec(payload, w);
  const moveKinds = ['keep', 'del', 'ins'] as const;
  return {
    points: points(p, 'points', w),
    kinds: list(p, 'kinds', w).map((v, i) => {
      if (typeof v !== 'string') throw new Error(`myers-diff: ${w}.kinds[${i}] 가 글자가 아니다`);
      return kindOf(v, moveKinds, `${w}.kinds[${i}]`);
    }),
    rows: list(p, 'rows', w).map((v, i): FoldRowView => {
      const at = `${w}.rows[${i}]`;
      const r = rec(v, at);
      return {
        kind: kindOf(str(r, 'kind', at), ['keep', 'del', 'ins', 'run'] as const, `${at}.kind`),
        mark: str(r, 'mark', at),
        text: str(r, 'text', at),
        count: num(r, 'count', at),
        x: num(r, 'x', at),
        y: num(r, 'y', at),
      };
    }),
    kept: num(p, 'kept', w),
    deleted: num(p, 'deleted', w),
    inserted: num(p, 'inserted', w),
  };
}

export const myersDiffProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MyersDiffStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  const need = (): MyersDiffStage => {
    if (!stage) throw new Error('myers-diff: stage 블록이 없다');
    return stage;
  };

  return {
    onInit(): void {
      stage?.reset();
    },
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase', 'phase'));
          return;
        }
        case 'round-start':
          // 새 판의 걸음 0 — 코드 패널 강조를 걷는다
          code?.highlightPhase?.(null);
          await need().roundStart(readRound(event.payload), ms());
          return;
        case 'layer-pay':
          await need().layerPay(readPay(event.payload), ms());
          return;
        case 'layer-slide':
          await need().layerSlide(readSlide(event.payload), ms());
          return;
        case 'fold':
          await need().fold(readFold(event.payload), ms());
          return;
        default:
          throw new Error(`myers-diff: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      stage?.reset();
    },
  };
};
