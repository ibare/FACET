/**
 * processState projector — 알고리즘 이벤트를 stage 메서드로 옮긴다.
 *
 *   round  → stage.startRound
 *   tick   → stage.showTick
 *   result → stage.showResult
 *   phase  → codePanel.highlightPhase
 *
 * 운동 길이는 재생 속도를 따라간다 — 이벤트마다 `runtime.getSpeed()` 를 다시 읽는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { StageCardState, StageResult, StageRound, StageTick } from './process-state-stage.js';

type ProcessStateStage = {
  startRound(round: StageRound, ms: number): void;
  showTick(rec: StageTick, ms: number): void;
  showResult(res: StageResult, ms: number): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const MOTION_MS = 300;

function obj(p: unknown, what: string): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error(`processState projector: ${what} payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const x = o[k];
  if (typeof x !== 'number') throw new Error(`processState projector: ${k} 가 수가 아니다`);
  return x;
}
function str(o: Record<string, unknown>, k: string): string {
  const x = o[k];
  if (typeof x !== 'string') throw new Error(`processState projector: ${k} 가 글이 아니다`);
  return x;
}
function strOrNull(o: Record<string, unknown>, k: string): string | null {
  const x = o[k];
  if (x === null) return null;
  if (typeof x !== 'string') throw new Error(`processState projector: ${k} 가 글도 null 도 아니다`);
  return x;
}
function strList(o: Record<string, unknown>, k: string): string[] {
  const x = o[k];
  if (!Array.isArray(x) || !x.every((s): s is string => typeof s === 'string')) {
    throw new Error(`processState projector: ${k} 가 글 목록이 아니다`);
  }
  return x;
}
function cardState(x: string): StageCardState {
  if (x === 'ready' || x === 'running' || x === 'waiting') return x;
  throw new Error(`processState projector: 모르는 상태 ${x}`);
}

export const processStateProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ProcessStateStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => MOTION_MS / Math.max(0.01, runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = obj(e.payload, 'round');
          stage?.startRound({ count: num(p, 'count'), processes: strList(p, 'processes'), horizon: num(p, 'horizon') }, ms());
          return;
        }
        case 'tick': {
          const p = obj(e.payload, 'tick');
          const rawCards = p.cards;
          if (!Array.isArray(rawCards)) throw new Error('processState projector: cards 가 목록이 아니다');
          const cards = rawCards.map((raw) => {
            const cd = obj(raw, 'card');
            const left = cd.left;
            if (left !== null && typeof left !== 'number') throw new Error('processState projector: left 가 수도 null 도 아니다');
            return { pid: str(cd, 'pid'), state: cardState(str(cd, 'state')), left };
          });
          stage?.showTick(
            {
              tick: num(p, 'tick'),
              blocked: strOrNull(p, 'blocked'),
              woke: strList(p, 'woke'),
              picked: strOrNull(p, 'picked'),
              running: strOrNull(p, 'running'),
              ready: strList(p, 'ready'),
              cards,
            },
            ms(),
          );
          return;
        }
        case 'result': {
          const p = obj(e.payload, 'result');
          stage?.showResult({ busy: num(p, 'busy'), horizon: num(p, 'horizon'), pct: num(p, 'pct') }, ms());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight();
    },
  };
};
