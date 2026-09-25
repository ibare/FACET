/**
 * round-robin-quantum projector — algorithm 이벤트를 stage · 코드 패널 호출로 옮긴다.
 *
 *   phase → codePanel.highlightPhase
 *   round → stage.round (캡션: 이번 판의 몫 · 비용)
 *   step  → stage.step  (캡션: 틱 · 접힌 사건 · 이 걸음의 사건), 운동이 끝날 때까지 기다린다
 *   done  → stage.done  (요약: 평균 첫 응답 · 바뀜 · 끝난 틱), 운동이 끝날 때까지 기다린다
 *
 * 운동 길이는 걸음마다 runtime.getSpeed() 를 새로 읽어 정한다 (상한 400ms ÷ 속도).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type {
  RoundRobinQuantumStage,
  RrStageFirstRun,
  RrStageProc,
  RrStageTick,
} from './round-robin-quantum-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 400;

type Rec = Record<string, unknown>;

const rec = (v: unknown, what: string): Rec => {
  if (typeof v !== 'object' || v === null) throw new Error(`round-robin-quantum: ${what} 이 객체가 아니다`);
  return v as Rec;
};
const int = (o: Rec, key: string): number => {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`round-robin-quantum: ${key} 가 정수가 아니다`);
  return v;
};
const str = (o: Rec, key: string): string => {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`round-robin-quantum: ${key} 가 글이 아니다`);
  return v;
};
const list = (o: Rec, key: string): unknown[] => {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`round-robin-quantum: ${key} 가 목록이 아니다`);
  return v;
};

/** 평균 × 100 정수를 소수 둘째 자리 글로. */
const hundredths = (v: number): string => `${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;

export const roundRobinQuantumProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RoundRobinQuantumStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  let procIds: string[] = [];
  let cost = 0;
  const nameOf = (i: number): string => {
    const id = procIds[i];
    if (id === undefined) throw new Error(`round-robin-quantum: 모르는 프로세스 ${i}`);
    return id.toUpperCase();
  };

  return {
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = rec(e.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = rec(e.payload, 'round');
          const procs: RrStageProc[] = list(p, 'procs').map((x) => {
            const o = rec(x, 'proc');
            return { id: str(o, 'id'), arrive: int(o, 'arrive'), burst: int(o, 'burst') };
          });
          procIds = procs.map((x) => x.id);
          cost = int(p, 'cost');
          stage?.round({
            axisEnd: int(p, 'axisEnd'),
            procs,
            caption: t('caption.round', 'Time slice: {q} · Switch cost: {c}', { q: int(p, 'quantum'), c: cost }),
          });
          return;
        }
        case 'step': {
          const p = rec(e.payload, 'step');
          const from = int(p, 'from');
          const to = int(p, 'to');
          const parts: string[] = [t('caption.tick', 'Tick {n}', { n: from })];
          for (const raw of list(p, 'notes')) {
            const note = rec(raw, 'note');
            const kind = str(note, 'kind');
            const names = list(note, 'procs').map((x) => {
              if (typeof x !== 'number') throw new Error('round-robin-quantum: note.procs 에 수가 아닌 것');
              return nameOf(x);
            });
            const name = names.join(', ');
            if (kind === 'finish') parts.push(t('caption.finish', 'Finished: {name}', { name }));
            else if (kind === 'arrive') parts.push(t('caption.arrive', 'Arrived: {name}', { name }));
            else if (kind === 'requeue')
              parts.push(t('caption.requeue', 'Slice used up, to the back: {name} (left: {n})', { name, n: int(note, 'left') }));
            else if (kind === 'dispatch') parts.push(t('caption.dispatch', 'On the CPU: {name}', { name }));
            else if (kind === 'switch') {
              parts.push(t('caption.switch', 'Switched to: {name}', { name }));
              if (cost > 0) parts.push(t('caption.switchTicks', 'Switching ticks: {n}', { n: cost }));
            } else throw new Error(`round-robin-quantum: 모르는 사건 ${kind}`);
          }
          const ticks: RrStageTick[] = list(p, 'ticks').map((x) => {
            const o = rec(x, 'tick');
            const kind = str(o, 'kind');
            if (kind !== 'run' && kind !== 'switch') throw new Error(`round-robin-quantum: 모르는 틱 일 ${kind}`);
            return { tick: int(o, 'tick'), proc: int(o, 'proc'), kind, slice: int(o, 'slice') };
          });
          const firstRuns: RrStageFirstRun[] = list(p, 'firstRuns').map((x) => {
            const o = rec(x, 'firstRun');
            return { proc: int(o, 'proc'), arrive: int(o, 'arrive'), tick: int(o, 'tick') };
          });
          await stage?.step({ from, to, ticks, firstRuns, caption: parts.join(' · ') }, motion());
          return;
        }
        case 'done': {
          const p = rec(e.payload, 'done');
          const endTick = int(p, 'endTick');
          await stage?.done(
            {
              endTick,
              summary: [
                t('summary.response', 'Avg first response: {avg}', { avg: hundredths(int(p, 'responseAvg100')) }),
                t('summary.switches', 'Switches: {n}', { n: int(p, 'switches') }),
                t('summary.end', 'Done at tick {n}', { n: endTick }),
              ],
            },
            motion(),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
