/**
 * greedyDecodingProjector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 운동의 길이는 재생 속도를 따라간다 — 부를 때마다 `getSpeed()` 로 나눠 넘긴다.
 * 걸음 사이의 머묾(`stepMs` 1000)보다 짧게 둬 걸음 경계를 넘지 않게 한다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';

type Option = { word: string; p: number };

/** stage 의 구조적 표면 (C9) — `mountView` 반환형은 열린 타입이라 여기서 좁힌다. */
type Stage = {
  beginRun(rank: number, start: string, ms: number): void;
  showFan(step: number, from: string, rank: number, options: Option[], ms: number): void;
  advance(step: number, from: string, word: string, p: number, score: number, permille: number, ms: number): void;
  finish(rank: number, permille: number, closed: boolean, steps: number, ms: number): void;
  tally(repeats: number, repeatSteps: number[]): void;
  reset(): void;
};

type CodePanel = { highlightPhase?(phase: string | null): void };

/** 한 운동의 기본 길이 (ms, 속도 1). */
const MOVE_MS = 650;
const FAN_MS = 350;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function options(v: unknown): Option[] | null {
  if (!Array.isArray(v)) return null;
  const out: Option[] = [];
  for (const o of v) {
    if (typeof o !== 'object' || o === null) return null;
    const r = o as Record<string, unknown>;
    const word = str(r.word);
    const p = num(r.p);
    if (word === null || p === null) return null;
    out.push({ word, p });
  }
  return out;
}

export const greedyDecodingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const speed = () => {
    const s = runtime?.getSpeed() ?? 1;
    return s > 0 ? s : 1;
  };
  const ms = (base: number) => base / speed();

  return {
    onEvent(event) {
      const p = (typeof event.payload === 'object' && event.payload !== null
        ? event.payload
        : {}) as Record<string, unknown>;
      switch (event.type) {
        case 'phase': {
          const phase = str(p.phase);
          if (phase !== null) panel?.highlightPhase?.(phase);
          return;
        }
        case 'run-start': {
          const rank = num(p.firstRank);
          const start = str(p.start);
          if (rank !== null && start !== null) stage?.beginRun?.(rank, start, ms(MOVE_MS));
          return;
        }
        case 'candidates': {
          const step = num(p.step);
          const from = str(p.from);
          const rank = num(p.rank);
          const opts = options(p.options);
          if (step === null || from === null || rank === null || opts === null) return;
          stage?.showFan?.(step, from, rank, opts, ms(FAN_MS));
          return;
        }
        case 'advance': {
          const step = num(p.step);
          const from = str(p.from);
          const word = str(p.word);
          const prob = num(p.p);
          const score = num(p.score);
          const permille = num(p.permille);
          if (step === null || from === null || word === null || prob === null) return;
          if (score === null || permille === null) return;
          stage?.advance?.(step, from, word, prob, score, permille, ms(MOVE_MS));
          return;
        }
        case 'finish': {
          const rank = num(p.firstRank);
          const permille = num(p.permille);
          const steps = num(p.steps);
          if (rank === null || permille === null || steps === null) return;
          stage?.finish?.(rank, permille, p.closed === true, steps, ms(MOVE_MS));
          return;
        }
        case 'tally': {
          const repeats = num(p.repeats);
          const steps = Array.isArray(p.repeatSteps) ? p.repeatSteps.filter((x): x is number => typeof x === 'number') : null;
          if (repeats === null || steps === null) return;
          stage?.tally?.(repeats, steps);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset?.();
      panel?.highlightPhase?.(null);
    },
  };
};
