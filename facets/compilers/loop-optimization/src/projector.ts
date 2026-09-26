/**
 * loop-optimization projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 로 나눈다. 새 판(round)의 걸음 0 에서 앞 판의 결론
 * (판정 표지 · 고친 줄 표지 · 캡션 · 코드 패널 강조)을 걷는다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { JudgeMark, ProgramLine } from './algorithm.js';
import type { LoopStage } from './loop-optimization-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function obj(p: unknown): Record<string, unknown> {
  if (p === null || typeof p !== 'object') throw new Error('loop-optimization: payload 가 객체가 아니다');
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`loop-optimization: payload.${k} 가 수가 아니다`);
  return v;
}

function strs(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`loop-optimization: payload.${k} 가 글자 목록이 아니다`);
  }
  return v as string[];
}

function linesOfPayload(p: Record<string, unknown>): ProgramLine[] {
  const v = p.lines;
  if (!Array.isArray(v)) throw new Error('loop-optimization: payload.lines 가 목록이 아니다');
  return v.map((x): ProgramLine => {
    const o = obj(x);
    const part = o.part;
    if (
      typeof o.key !== 'string' ||
      typeof o.text !== 'string' ||
      typeof o.indent !== 'number' ||
      typeof o.copy !== 'number' ||
      !(o.home === null || typeof o.home === 'string') ||
      !(o.from === null || typeof o.from === 'string') ||
      !(part === 'body' || part === 'tail' || part === 'plain')
    ) {
      throw new Error('loop-optimization: 줄 모양이 맞지 않는다');
    }
    return { key: o.key, text: o.text, indent: o.indent, home: o.home, from: o.from, copy: o.copy, part };
  });
}

function marksOfPayload(p: Record<string, unknown>): JudgeMark[] {
  const v = p.marks;
  if (!Array.isArray(v)) throw new Error('loop-optimization: payload.marks 가 목록이 아니다');
  return v.map((x): JudgeMark => {
    const o = obj(x);
    const reason = o.reason;
    if (
      typeof o.key !== 'string' ||
      typeof o.invariant !== 'boolean' ||
      !(reason === 'steady' || reason === 'changes' || reason === 'twice')
    ) {
      throw new Error('loop-optimization: 판정 모양이 맞지 않는다');
    }
    return { key: o.key, invariant: o.invariant, reason, names: strs(o, 'names') };
  });
}

export const loopOptimizationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LoopStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;
  const dur = (): number => {
    if (motionMs === null) throw new Error('loop-optimization: motionMs 를 받지 못했다');
    return motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);
  };

  return {
    onInit(data) {
      const d = obj(data);
      motionMs = num(d, 'motionMs');
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload);
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('loop-optimization: phase 가 글자가 아니다');
          code?.highlightPhase(ph);
          return;
        }
        case 'round': {
          const p = obj(event.payload);
          code?.highlightPhase(null);
          if (stage === undefined) return;
          stage.setScale(num(p, 'scaleOps'), num(p, 'scaleLines'));
          stage.showProgram(linesOfPayload(p), [], dur());
          stage.clearMarks();
          stage.setBars(
            {
              ops: num(p, 'ops'),
              overhead: num(p, 'overhead'),
              codeLines: num(p, 'codeLines'),
              ops0: num(p, 'ops'),
              codeLines0: num(p, 'codeLines'),
            },
            dur(),
          );
          stage.setCaption(t('caption.start', 'Original program · trip count: {trips}', { trips: num(p, 'trips') }));
          return;
        }
        case 'judge': {
          const p = obj(event.payload);
          const marks = marksOfPayload(p);
          if (stage === undefined) return;
          stage.showProgram(linesOfPayload(p), [], dur());
          stage.setJudge(marks);
          stage.setCaption(
            t('caption.judge', 'Invariance check · invariant: {inv} · varies: {vary}', {
              inv: marks.filter((m) => m.invariant).length,
              vary: marks.filter((m) => !m.invariant).length,
            }),
          );
          return;
        }
        case 'hoist': {
          const p = obj(event.payload);
          const moved = strs(p, 'moved');
          const lines = linesOfPayload(p);
          if (stage === undefined) return;
          stage.showProgram(lines, moved, dur());
          const texts = moved.map((k) => {
            const l = lines.find((x) => x.key === k);
            if (l === undefined) throw new Error(`loop-optimization: 꺼낸 줄이 없다 ${k}`);
            return l.text;
          });
          stage.setCaption(
            texts.length === 0
              ? t('caption.hoistNone', 'No invariant line to hoist')
              : t('caption.hoist', 'Hoisted above the loop: {line}', { line: texts.join(' · ') }),
          );
          return;
        }
        case 'copy': {
          const p = obj(event.payload);
          if (stage === undefined) return;
          stage.clearMarks();
          stage.showProgram(linesOfPayload(p), strs(p, 'added'), dur());
          stage.setCaption(
            t('caption.copy', 'Copy {copy} of {factor} · index reads shift to i + {shift}', {
              copy: num(p, 'copy'),
              factor: num(p, 'factor'),
              shift: num(p, 'shift'),
            }),
          );
          return;
        }
        case 'bound': {
          const p = obj(event.payload);
          const changed = strs(p, 'changed');
          if (stage === undefined) return;
          stage.clearMarks();
          stage.showProgram(linesOfPayload(p), changed, dur());
          stage.markRewrites(changed);
          stage.setCaption(
            t('caption.bound', 'Loop bound {oldHi} → {newHi} · step {oldStep} → {newStep}', {
              oldHi: num(p, 'oldHi'),
              newHi: num(p, 'newHi'),
              oldStep: num(p, 'oldStep'),
              newStep: num(p, 'newStep'),
            }),
          );
          return;
        }
        case 'tail': {
          const p = obj(event.payload);
          if (stage === undefined) return;
          stage.clearMarks();
          stage.showProgram(linesOfPayload(p), strs(p, 'added'), dur());
          stage.setCaption(
            t('caption.tail', 'Leftover {tail} of {rest} drops out after the loop', {
              tail: num(p, 'tail'),
              rest: num(p, 'rest'),
            }),
          );
          return;
        }
        case 'count': {
          const p = obj(event.payload);
          if (stage === undefined) return;
          stage.clearMarks();
          stage.showProgram(linesOfPayload(p), [], dur());
          stage.setBars(
            {
              ops: num(p, 'ops'),
              overhead: num(p, 'overhead'),
              codeLines: num(p, 'codeLines'),
              ops0: num(p, 'ops0'),
              codeLines0: num(p, 'codeLines0'),
            },
            dur(),
          );
          stage.setCaption(
            t(
              'caption.count',
              'Exec ops: {ops0} → {ops} · loop overhead: {overhead0} → {overhead} · code lines: {lines0} → {lines}',
              {
                ops0: num(p, 'ops0'),
                ops: num(p, 'ops'),
                overhead0: num(p, 'overhead0'),
                overhead: num(p, 'overhead'),
                lines0: num(p, 'codeLines0'),
                lines: num(p, 'codeLines'),
              },
            ),
          );
          return;
        }
        default:
          throw new Error(`loop-optimization: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase(null);
    },
  };
};
