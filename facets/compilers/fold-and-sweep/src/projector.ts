/**
 * fold-and-sweep projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 줄 · 식은 algorithm 의 좁히개(`readSnapshot` · `readProgram`)로 읽고, 캡션 문안은 여기서 고른다.
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 로 나눈다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import { readProgram, readSnapshot } from './algorithm.js';
import type { FoldAndSweepStage } from './fold-and-sweep-stage.js';

const MOTION_MS = 480;

type CodePanel = { highlightPhase?(phase: string | null): void };

function rec(x: unknown): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error('fold-and-sweep: payload 가 객체가 아니다');
  return x as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`fold-and-sweep: payload.${key} 가 수가 아니다`);
  return v;
}

function numList(x: unknown, what: string): number[] {
  if (!Array.isArray(x)) throw new Error(`fold-and-sweep: ${what} 가 배열이 아니다`);
  return x.map((v) => {
    if (typeof v !== 'number') throw new Error(`fold-and-sweep: ${what} 의 원소가 수가 아니다`);
    return v;
  });
}

export const foldAndSweepProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as FoldAndSweepStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let fold = 0;
  let sweep = 0;

  return {
    onInit(data: unknown) {
      if (!stage) return;
      const d = rec(data);
      fold = num(d, 'fold');
      sweep = num(d, 'sweep');
      stage.reset();
      stage.setPasses(fold, sweep, null);
      stage.round(readProgram(d.program), 0);
      stage.caption(t('caption.start', 'Start from the original program'));
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = rec(event.payload ?? {});
      switch (event.type) {
        case 'phase': {
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('fold-and-sweep: phase 가 글자가 아니다');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'round': {
          fold = num(p, 'fold');
          sweep = num(p, 'sweep');
          code?.highlightPhase?.(null);
          if (!stage) return;
          stage.setPasses(fold, sweep, null);
          stage.round(readSnapshot(p.rows), ms());
          stage.caption(t('caption.start', 'Start from the original program'));
          return;
        }
        case 'fold': {
          if (!stage) return;
          const line = num(p, 'line');
          const folded = num(p, 'folded');
          const changed = p.changed;
          if (typeof changed !== 'boolean') throw new Error('fold-and-sweep: payload.changed 가 불리언이 아니다');
          if (!Array.isArray(p.subst)) throw new Error('fold-and-sweep: payload.subst 가 배열이 아니다');
          const subst = p.subst.map((s) => {
            const r = rec(s);
            return { node: num(r, 'node'), from: num(r, 'from') };
          });
          let known: { name: string; val: number } | null = null;
          if (p.known !== null) {
            const k = rec(p.known);
            if (typeof k.name !== 'string') throw new Error('fold-and-sweep: payload.known.name 이 글자가 아니다');
            known = { name: k.name, val: num(k, 'val') };
          }
          stage.setPasses(fold, sweep, 'fold');
          stage.foldLine(line, readSnapshot(p.rows), subst, known, ms());
          const vars = { line: `L${line + 1}`, folded, subst: subst.length };
          if (known) {
            const kv = { ...vars, name: known.name, val: known.val };
            stage.caption(
              changed
                ? t('caption.foldKnown', '{line}: nodes folded in this line {folded} · names replaced {subst} · known: {name} = {val}', kv)
                : t('caption.foldKnownSame', '{line}: already a number · known: {name} = {val}', kv),
            );
          } else {
            stage.caption(
              changed
                ? t('caption.foldLine', '{line}: nodes folded in this line {folded} · names replaced {subst}', vars)
                : t('caption.foldSame', '{line}: nothing to fold', vars),
            );
          }
          return;
        }
        case 'uses': {
          if (!stage) return;
          const round = num(p, 'round');
          const zero = num(p, 'zero');
          if (!Array.isArray(p.uses)) throw new Error('fold-and-sweep: payload.uses 가 배열이 아니다');
          const uses = p.uses.map((u) => {
            const r = rec(u);
            return { line: num(r, 'line'), count: num(r, 'count') };
          });
          stage.setPasses(fold, sweep, 'sweep');
          stage.showUses(uses, ms());
          stage.caption(
            uses.length === 0
              ? t('caption.sweepEmpty', 'Pass {round}: no let line left to count', { round })
              : t('caption.sweepCount', 'Pass {round}: uses counted · lines with zero uses: {zero}', { round, zero }),
          );
          return;
        }
        case 'remove': {
          if (!stage) return;
          const round = num(p, 'round');
          const lines = numList(p.lines, 'payload.lines');
          stage.setPasses(fold, sweep, 'sweep');
          stage.removeLines(readSnapshot(p.rows), ms());
          stage.caption(
            t('caption.sweepRemove', 'Pass {round}: removed {lines} · lines removed: {n}', {
              round,
              lines: lines.map((l) => `L${l + 1}`).join(' · '),
              n: lines.length,
            }),
          );
          return;
        }
        case 'count': {
          if (!stage) return;
          const ops = num(p, 'ops');
          const lines = num(p, 'lines');
          stage.setPasses(fold, sweep, null);
          stage.countOps(readSnapshot(p.rows), ms());
          stage.caption(t('caption.count', 'Count: executed ops {ops} · lines {lines}', { ops, lines }));
          return;
        }
        default:
          throw new Error(`fold-and-sweep: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
