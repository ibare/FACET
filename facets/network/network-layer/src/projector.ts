/**
 * networkLayer projector — algorithm 이벤트를 stage 메서드로 옮긴다.
 *
 * round → showRound · forward → showForward · finish → showFinish · phase → 코드 패널 highlightPhase.
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다 (걸음마다 최대 0.4 초 × 1/속도).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  NetworkLayerStage,
  NetworkLayerStageFinish,
  NetworkLayerStageForward,
  NetworkLayerStageMove,
  NetworkLayerStageRound,
} from './network-layer-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 400;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`networkLayerProjector: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`networkLayerProjector: ${key} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`networkLayerProjector: ${what} 가 글자가 아니다`);
  return v;
}
function arr(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`networkLayerProjector: ${key} 가 배열이 아니다`);
  return v;
}

function readRound(p: unknown): NetworkLayerStageRound {
  const o = obj(p, 'round payload');
  const span = (v: unknown) => {
    const s = obj(v, '층 칸');
    return { layer: str(s['layer'], '층'), bytes: num(s, 'bytes') };
  };
  return {
    split: num(o, 'split'),
    links: num(o, 'links'),
    message: num(o, 'message'),
    pieceSize: num(o, 'pieceSize'),
    headerBytes: num(o, 'headerBytes'),
    wireBytes: num(o, 'wireBytes'),
    payloadShare: num(o, 'payloadShare'),
    heads: arr(o, 'heads').map(span),
    tails: arr(o, 'tails').map(span),
    nodes: arr(o, 'nodes').map((v) => str(v, '마디 기호')),
    bars: arr(o, 'bars').map((v) => {
      const b = obj(v, '막대');
      return { split: num(b, 'split'), finish: num(b, 'finish') };
    }),
    fastestSplit: num(o, 'fastestSplit'),
    wireMax: num(o, 'wireMax'),
    timeMax: num(o, 'timeMax'),
    stack: arr(o, 'stack').map((v) => str(v, '층')),
    routerStack: arr(o, 'routerStack').map((v) => str(v, '층')),
  };
}

function readForward(p: unknown): NetworkLayerStageForward {
  const o = obj(p, 'forward payload');
  const moves: NetworkLayerStageMove[] = arr(o, 'moves').map((v) => {
    const m = obj(v, '옮김');
    return { piece: num(m, 'piece'), from: num(m, 'from'), to: num(m, 'to') };
  });
  return {
    tick: num(o, 'tick'),
    elapsed: num(o, 'elapsed'),
    pieceSize: num(o, 'pieceSize'),
    busyLinks: num(o, 'busyLinks'),
    moves,
  };
}

function readFinish(p: unknown): NetworkLayerStageFinish {
  const o = obj(p, 'finish payload');
  return {
    ticks: num(o, 'ticks'),
    finish: num(o, 'finish'),
    split: num(o, 'split'),
    fastestSplit: num(o, 'fastestSplit'),
  };
}

export const networkLayerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as NetworkLayerStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  return {
    onInit() {
      stage?.clear();
      code?.clearHighlight?.();
    },
    async onEvent(e) {
      switch (e.type) {
        case 'round':
          await stage?.showRound(readRound(e.payload), motion());
          return;
        case 'forward':
          await stage?.showForward(readForward(e.payload), motion());
          return;
        case 'finish':
          await stage?.showFinish(readFinish(e.payload), motion());
          return;
        case 'phase': {
          const o = obj(e.payload, 'phase payload');
          code?.highlightPhase?.(str(o['phase'], 'phase'));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
