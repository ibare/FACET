/**
 * history-bisect projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 무대의 운동은 걸음 안에서 끝난다 (걸음 = stepMs + 운동). 운동 길이는 부를 때마다 getSpeed() 로 줄인다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { HistoryBisectStage } from './history-bisect-stage.js';

const MOTION_MS = 480;

type CodePanel = { highlightPhase(phase: string | null): void };

function obj(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`history-bisect projector: ${type} 에 payload 가 없다`);
  return payload as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string, type: string): number {
  const value = p[key];
  if (typeof value !== 'number') throw new Error(`history-bisect projector: ${type}.payload.${key} 가 수가 아니다`);
  return value;
}
function nums(p: Record<string, unknown>, key: string, type: string): number[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`history-bisect projector: ${type}.payload.${key} 가 배열이 아니다`);
  return value.map((x, i) => {
    if (typeof x !== 'number') throw new Error(`history-bisect projector: ${type}.payload.${key}[${i}] 가 수가 아니다`);
    return x;
  });
}
function strs(p: Record<string, unknown>, key: string, type: string): string[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`history-bisect projector: ${type}.payload.${key} 가 배열이 아니다`);
  return value.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`history-bisect projector: ${type}.payload.${key}[${i}] 가 글자가 아니다`);
    return x;
  });
}

export const historyBisectProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HistoryBisectStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / (runtime ? runtime.getSpeed() : 1);
  let commits: string[] = [];

  const name = (n: number): string => {
    const c = commits[n - 1];
    if (c === undefined) throw new Error(`history-bisect projector: 커밋 번호 ${n} 의 글자가 없다 (round 전이거나 줄기 밖)`);
    return c;
  };
  const range = (from: number, to: number): string => (from === to ? name(from) : `${name(from)}..${name(to)}`);
  const need = (): HistoryBisectStage => {
    if (!stage) throw new Error('history-bisect projector: stage 가 없다');
    return stage;
  };

  return {
    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('history-bisect projector: phase.payload.phase 가 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'round': {
          const p = obj(event.payload, 'round');
          commits = strs(p, 'commits', 'round');
          code?.highlightPhase(null);
          const s = need();
          const round = {
            commits,
            good: num(p, 'good', 'round'),
            bad: num(p, 'bad', 'round'),
            broken: nums(p, 'broken', 'round'),
            anchor: num(p, 'anchor', 'round'),
            candidateFrom: num(p, 'candidateFrom', 'round'),
            candidateTo: num(p, 'candidateTo', 'round'),
          };
          await s.round(round, motion());
          s.caption(t('caption.start', 'Only the two ends are judged: {good} good · {bad} bad', { good: name(round.good), bad: name(round.bad) }));
          return;
        }
        case 'test-pick': {
          const p = obj(event.payload, 'test-pick');
          const mid = num(p, 'mid', 'test-pick');
          const pick = num(p, 'pick', 'test-pick');
          const skipped = p.skipped;
          if (typeof skipped !== 'boolean') throw new Error('history-bisect projector: test-pick.payload.skipped 가 참거짓이 아니다');
          const s = need();
          s.caption(
            skipped
              ? t('caption.skip', 'Midpoint {mid} does not build → step aside to {pick}', { mid: name(mid), pick: name(pick) })
              : t('caption.midpoint', 'Test the midpoint: {mid}', { mid: name(mid) }),
          );
          await s.pick({ mid, pick, skipped }, motion());
          return;
        }
        case 'verdict': {
          const p = obj(event.payload, 'verdict');
          const verdict = p.verdict;
          if (verdict !== 'good' && verdict !== 'bad') throw new Error('history-bisect projector: verdict.payload.verdict 가 good · bad 가 아니다');
          const commit = num(p, 'commit', 'verdict');
          const dropFrom = num(p, 'dropFrom', 'verdict');
          const dropTo = num(p, 'dropTo', 'verdict');
          const s = need();
          s.caption(
            verdict === 'good'
              ? t('caption.good', '{commit}: good → drop {dropped}', { commit: name(commit), dropped: range(dropFrom, dropTo) })
              : t('caption.bad', '{commit}: bad → drop {dropped}', { commit: name(commit), dropped: range(dropFrom, dropTo) }),
          );
          await s.verdict(
            {
              commit,
              verdict,
              dropFrom,
              dropTo,
              candidateFrom: num(p, 'candidateFrom', 'verdict'),
              candidateTo: num(p, 'candidateTo', 'verdict'),
            },
            motion(),
          );
          return;
        }
        case 'stuck': {
          const p = obj(event.payload, 'stuck');
          const mid = num(p, 'mid', 'stuck');
          const from = num(p, 'untestableFrom', 'stuck');
          const to = num(p, 'untestableTo', 'stuck');
          const s = need();
          s.caption(
            from === to
              ? t('caption.stuck-one', 'Midpoint {mid} does not build · no other candidate to test', { mid: name(mid) })
              : t('caption.stuck', 'Midpoint {mid} does not build · none of {rest} builds', { mid: name(mid), rest: range(from, to) }),
          );
          await s.stuck({ mid }, motion());
          return;
        }
        case 'answer': {
          const p = obj(event.payload, 'answer');
          const from = num(p, 'from', 'answer');
          const to = num(p, 'to', 'answer');
          const s = need();
          s.caption(
            from === to
              ? t('caption.answer-one', 'First bad commit: {commit}', { commit: name(from) })
              : t('caption.answer-many', 'First bad commit is one of {range}', { range: range(from, to) }),
          );
          await s.answer({ from, to }, motion());
          return;
        }
        default:
          throw new Error(`history-bisect projector: 모르는 이벤트 '${event.type}'`);
      }
    },
    onReset() {
      commits = [];
      code?.highlightPhase(null);
      stage?.clear();
    },
  };
};
