/**
 * assignThenMove projector — 걸음 이벤트를 stage 의 두 몸짓으로 옮긴다.
 *
 * payload 는 좁혀서 넘긴다 (C9). `event.payload` 를 그대로 stage 로 흘리지
 * 않고, 가드를 지난 정형 객체만 만들어 준다. 화면 문안은 여기서 `runtime.t` 로
 * 해석해 문자열로 넘긴다 (C10) — stage 는 늘 쓰는 라벨만 스스로 조회한다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Point = { x: number; y: number };

type Stage = {
  attach?(step: { round: number; assign: number[] }): Promise<void> | void;
  move?(step: { round: number; to: Point[]; moved: number[] }): Promise<void> | void;
  finish?(info: { settled: boolean }): void;
  rewind?(): void;
  setCaption?(text: string): void;
};

type AttachPayload = { round: number; assign: number[]; counts: number[] };
type MovePayload = { round: number; to: Point[]; moved: number[] };
type DonePayload = { rounds: number; settled: boolean };

function readNumbers(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

function readPoints(raw: unknown): Point[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Point[] = [];
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) return null;
    const p = v as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function readAttach(payload: unknown): AttachPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const assign = readNumbers(p.assign);
  const counts = readNumbers(p.counts);
  if (typeof p.round !== 'number' || assign === null || counts === null) return null;
  return { round: p.round, assign, counts };
}

function readMove(payload: unknown): MovePayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const to = readPoints(p.to);
  const moved = readNumbers(p.moved);
  if (typeof p.round !== 'number' || to === null || moved === null) return null;
  return { round: p.round, to, moved };
}

function readDone(payload: unknown): DonePayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.rounds !== 'number' || typeof p.settled !== 'boolean') return null;
  return { rounds: p.rounds, settled: p.settled };
}

export const assignThenMoveProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 수를 나란히 적는다. 뒤에 조사가 붙지 않는 자리에만 쓴다 (S-piece). */
  const lineUp = (values: number[], digits: number): string =>
    values.map((v) => v.toFixed(digits)).join(' / ');

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'points-attach': {
          const step = readAttach(event.payload);
          if (!step) return;
          stage?.setCaption?.(
            tr('caption.attach', 'Round {round} · attach: every point grabs its nearest center. Sizes {sizes}.', {
              round: step.round,
              sizes: lineUp(step.counts, 0),
            }),
          );
          await stage?.attach?.({ round: step.round, assign: step.assign });
          return;
        }
        case 'centroids-move': {
          const step = readMove(event.payload);
          if (!step) return;
          stage?.setCaption?.(
            tr('caption.move', 'Round {round} · move: each center slides to the middle of its own points. Moved {dists}.', {
              round: step.round,
              dists: lineUp(step.moved, 2),
            }),
          );
          await stage?.move?.({ round: step.round, to: step.to, moved: step.moved });
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        case 'done': {
          const info = readDone(event.payload);
          if (!info) return;
          stage?.setCaption?.(
            info.settled
              ? tr('caption.settled', 'Nobody moved, so it stops. Rounds: {rounds}.', { rounds: info.rounds })
              : tr('caption.capped', 'Still moving. Rounds: {rounds}.', { rounds: info.rounds }),
          );
          stage?.finish?.({ settled: info.settled });
          return;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 내보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
