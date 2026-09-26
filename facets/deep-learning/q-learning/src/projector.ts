/**
 * Q-러닝 projector — 알고리즘의 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 모양이 어긋나면 던진다 (값을 지어내지 않는다).
 * 운동 길이는 재생 속도를 따라간다 — 부를 때마다 runtime.getSpeed() 를 읽는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { CellRole, CorridorView, EpisodeView, FinalView, QLearningStage, RoundView } from './q-learning-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

/** 운동의 기준 길이 (속도 1 에서). 판 걸음 250 ms · 걸음 0 과 끝 걸음 1200 ms 안에서 끝난다 */
const EPISODE_MOTION_MS = 200;
const EDGE_MOTION_MS = 700;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`q-learning: ${what} payload 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`q-learning: ${key} 가 수가 아니다`);
  return v;
}
function nums(v: unknown, key: string): number[] {
  if (!Array.isArray(v)) throw new Error(`q-learning: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`q-learning: ${key} 에 수가 아닌 것이 있다`);
    return x;
  });
}
function bools(v: unknown, key: string): boolean[] {
  if (!Array.isArray(v)) throw new Error(`q-learning: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'boolean') throw new Error(`q-learning: ${key} 에 참거짓이 아닌 것이 있다`);
    return x;
  });
}
function table(v: unknown, key: string): number[][] {
  if (!Array.isArray(v)) throw new Error(`q-learning: ${key} 가 목록이 아니다`);
  return v.map((row) => nums(row, key));
}
function roles(v: unknown): CellRole[] {
  if (!Array.isArray(v)) throw new Error('q-learning: roles 가 목록이 아니다');
  return v.map((x) => {
    if (x === 'small' || x === 'big' || x === 'start' || x === 'path') return x;
    throw new Error(`q-learning: 모르는 칸 역할 ${String(x)}`);
  });
}

export const qLearningProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as QLearningStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('q-learning: stage 블록이 없다');
  const speed = (): number => Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('q-learning: phase 가 문자열이 아니다');
          code?.highlightPhase(ph);
          return;
        }
        case 'corridor': {
          const p = obj(event.payload, 'corridor');
          const cv: CorridorView = {
            cells: num(p, 'cells'),
            start: num(p, 'start'),
            terminal: bools(p.terminal, 'terminal'),
            rewards: nums(p.rewards, 'rewards'),
            roles: roles(p.roles),
            agents: num(p, 'agents'),
            qMax: num(p, 'qMax'),
          };
          stage.setCorridor(cv);
          return;
        }
        case 'round': {
          const p = obj(event.payload, 'round');
          const rv: RoundView = { epsilon: num(p, 'epsilon'), q: table(p.q, 'q'), positions: nums(p.positions, 'positions') };
          // 판 머리 — 앞 판의 코드 줄을 끈다
          code?.highlightPhase(null);
          stage.beginRound(rv, EDGE_MOTION_MS / speed());
          return;
        }
        case 'episode': {
          const p = obj(event.payload, 'episode');
          const ev: EpisodeView = {
            episode: num(p, 'episode'),
            episodes: num(p, 'episodes'),
            ends: nums(p.ends, 'ends'),
            q: table(p.q, 'q'),
            reached: bools(p.reached, 'reached'),
            greedy: nums(p.greedy, 'greedy'),
            bigNow: num(p, 'bigNow'),
            reachedCount: num(p, 'reachedCount'),
            preferCount: num(p, 'preferCount'),
          };
          stage.showEpisode(ev, EPISODE_MOTION_MS / speed());
          return;
        }
        case 'final': {
          const p = obj(event.payload, 'final');
          const fv: FinalView = {
            greedy: nums(p.greedy, 'greedy'),
            preferCount: num(p, 'preferCount'),
            leftCount: num(p, 'leftCount'),
            agents: num(p, 'agents'),
            episodes: num(p, 'episodes'),
          };
          stage.showFinal(fv, EDGE_MOTION_MS / speed());
          return;
        }
        default:
          throw new Error(`q-learning: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase(null);
      stage.clear();
    },
  };
};
