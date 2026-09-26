/**
 * regex-backtracking projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 (motionMs / 속도).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { RegexBacktrackingStage } from './regex-backtracking-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`regexBacktrackingProjector: ${what} payload 가 없다`);
  return v as Record<string, unknown>;
}
function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`regexBacktrackingProjector: ${k} 가 수가 아니다`);
  return v;
}
function nums(p: Record<string, unknown>, k: string): number[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`regexBacktrackingProjector: ${k} 가 수 배열이 아니다`);
  return v as number[];
}
function strs(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`regexBacktrackingProjector: ${k} 가 글자 배열이 아니다`);
  return v as string[];
}
function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`regexBacktrackingProjector: ${k} 가 글이 아니다`);
  return v;
}
function bool(p: Record<string, unknown>, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`regexBacktrackingProjector: ${k} 가 참거짓이 아니다`);
  return v;
}

export const regexBacktrackingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RegexBacktrackingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const dur = (motionMs: number): number => motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onReset() {
      // 되감기 — 러너가 로그를 다시 먹이기 전에 앞 화면의 결론을 걷는다
      stage?.clear();
      code?.highlightPhase(null);
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'board': {
          const p = rec(event.payload, 'board');
          code?.highlightPhase(null);
          const letters = strs(p, 'letters');
          stage?.setBoard({
            letters,
            patternText: str(p, 'patternText'),
            cells: num(p, 'cells'),
            capacity: num(p, 'capacity'),
            triesScale: num(p, 'triesScale'),
            hitsScale: num(p, 'hitsScale'),
            dfaSteps: num(p, 'dfaSteps'),
            durationMs: dur(num(p, 'motionMs')),
            caption: t('caption.start', 'Start: no letter tried yet · Cells: {cells}', { cells: num(p, 'cells') }),
          });
          return;
        }
        case 'step': {
          const p = rec(event.payload, 'step');
          const kindText = str(p, 'kind');
          const sp = num(p, 'sp');
          const delta = num(p, 'delta');
          const retries = num(p, 'retries');
          let kind: 'descend' | 'exhaust' | 'accept';
          let caption: string;
          if (kindText === 'descend') {
            kind = 'descend';
            caption = t('caption.descend', 'Greedy descent along the first branch, stopped at #{sp} · New letters tried: {delta}', { sp, delta });
          } else if (kindText === 'exhaust') {
            kind = 'exhaust';
            caption = t('caption.exhaust', 'Every way from #{sp} tried, all blocked · New letters tried: {delta} · Branches re-chosen: {retries}', { sp, delta, retries });
          } else if (kindText === 'accept') {
            kind = 'accept';
            caption = t('caption.accept', 'MATCH at #{sp}, the end of the text · New letters tried: {delta}', { sp, delta });
          } else {
            throw new Error(`regexBacktrackingProjector: 모르는 걸음 ${kindText}`);
          }
          stage?.showStep({
            kind,
            sp,
            tries: num(p, 'tries'),
            delta,
            hits: nums(p, 'hits'),
            fresh: nums(p, 'fresh'),
            durationMs: dur(num(p, 'motionMs')),
            caption,
          });
          return;
        }
        case 'verdict': {
          const p = rec(event.payload, 'verdict');
          const matched = bool(p, 'matched');
          const tries = num(p, 'tries');
          const dfa = num(p, 'dfaSteps');
          const caption = matched
            ? t('caption.verdictMatch', 'Verdict: match · Letters tried: {tries} · DFA moves: {dfa}', { tries, dfa })
            : t('caption.verdictNoMatch', 'Verdict: no match, only after every way was tried · Letters tried: {tries} · DFA moves: {dfa}', { tries, dfa });
          stage?.showVerdict({ matched, tries, durationMs: dur(num(p, 'motionMs')), caption });
          return;
        }
        default:
          throw new Error(`regexBacktrackingProjector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
