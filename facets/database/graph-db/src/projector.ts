/**
 * graph-db projector — 알고리즘의 round-start · look · cross · done 을 무대 메서드로 옮긴다.
 * 운동 길이는 재생 속도를 그때그때 읽어 나눈다. 무대가 운동을 마칠 때까지 기다려 걸음이 운동을 품게 한다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import { LAYOUT_HELD } from './algorithm.js';
import type { CrossView, DoneView, GraphDbStage, LookView, RoundView } from './graph-db-stage.js';

/** 속도 1 에서의 운동 길이 ms. */
const MOVE_MS = 600;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`graph-db: ${what} payload 가 없다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`graph-db: payload.${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`graph-db: payload.${k} 가 글이 아니다`);
  return v;
}
function strs(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`graph-db: payload.${k} 가 글 목록이 아니다`);
  return v as string[];
}
function nums(o: Record<string, unknown>, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`graph-db: payload.${k} 가 수 목록이 아니다`);
  return v as number[];
}
function list(o: Record<string, unknown>, k: string): Record<string, unknown>[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`graph-db: payload.${k} 가 목록이 아니다`);
  return v.map((x, i) => obj(x, `${k}[${i}]`));
}

export const graphDbProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as GraphDbStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const moveMs = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOVE_MS / speed : MOVE_MS;
  };

  return {
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round-start': {
          const p = obj(e.payload, 'round-start');
          const layout = num(p, 'layout');
          const view: RoundView = {
            nodes: list(p, 'nodes').map((n) => ({ id: str(n, 'id'), kind: str(n, 'kind'), ring: num(n, 'ring') })),
            edges: list(p, 'edges').map((x) => ({ from: str(x, 'from'), type: str(x, 'type'), to: str(x, 'to') })),
            start: str(p, 'start'),
            follow: str(p, 'follow'),
            hops: num(p, 'hops'),
            layout,
            ringSlots: num(p, 'ringSlots'),
            hopsMax: num(p, 'hopsMax'),
            layoutName: layout === LAYOUT_HELD ? t('label.held', 'Held edges') : t('label.table', 'Edge table'),
          };
          code?.clearHighlight?.();
          await stage?.showRound(view, moveMs());
          return;
        }
        case 'look': {
          const p = obj(e.payload, 'look');
          const view: LookView = {
            hop: num(p, 'hop'),
            layout: num(p, 'layout'),
            front: strs(p, 'front'),
            looked: nums(p, 'looked'),
            used: nums(p, 'used'),
            readThisHop: num(p, 'readThisHop'),
            readTotal: num(p, 'readTotal'),
          };
          await stage?.showLook(view, moveMs());
          return;
        }
        case 'cross': {
          const p = obj(e.payload, 'cross');
          const view: CrossView = {
            hop: num(p, 'hop'),
            crossed: nums(p, 'crossed'),
            reached: strs(p, 'reached'),
            front: strs(p, 'front'),
            reachedCount: num(p, 'reachedCount'),
          };
          await stage?.showCross(view, moveMs());
          return;
        }
        case 'done': {
          const p = obj(e.payload, 'done');
          const view: DoneView = {
            hops: num(p, 'hops'),
            friends: strs(p, 'friends'),
            readTotal: num(p, 'readTotal'),
            reachedCount: num(p, 'reachedCount'),
          };
          stage?.showDone(view);
          return;
        }
        default:
          throw new Error(`graph-db: 모르는 이벤트 ${e.type}`);
      }
    },
  };
};
