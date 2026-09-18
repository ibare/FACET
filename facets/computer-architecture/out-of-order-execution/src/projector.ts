/**
 * 비순차 실행 projector — algorithm 이벤트를 stage 메서드와 캡션으로 옮긴다.
 *
 * 캡션은 한 박자 안에서 무거운 쪽이 이긴다: 앞지름 > 시작 > 커밋 > 빈 박자.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { OutOfOrderStageSurface } from './out-of-order-execution-stage.js';

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

const num = (o: Record<string, unknown>, key: string): number | null => {
  const x = o[key];
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

const record = (payload: unknown): Record<string, unknown> | null =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null;

export const outOfOrderExecutionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as OutOfOrderStageSurface | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const name = (i: number): string => tr('label.instr', 'I{n}', { n: i + 1 });
  const names = (list: number[]): string => list.map(name).join(' · ');

  // 한 박자 동안 모은 것 — 캡션을 고른다.
  let cycle = 0;
  let commits: number[] = [];
  let starts: number[] = [];
  let overtakers: number[] = [];
  let passed = new Set<number>();

  const caption = (): void => {
    if (!stage) return;
    if (overtakers.length > 0) {
      stage.setCaption(
        tr('caption.overtake', 'Cycle {c} — overtake: {who} starts while {older} still waits', {
          c: cycle,
          who: names(overtakers),
          older: names([...passed].sort((a, b) => a - b)),
        }),
      );
    } else if (starts.length > 0) {
      stage.setCaption(tr('caption.issue', 'Cycle {c} — start: {who}', { c: cycle, who: names(starts) }));
    } else if (commits.length > 0) {
      stage.setCaption(
        tr('caption.commit', 'Cycle {c} — commit in program order: {who}', { c: cycle, who: names(commits) }),
      );
    } else {
      stage.setCaption(
        tr('caption.stall', 'Cycle {c} — nothing in the window can start; the issue slots stay empty', { c: cycle }),
      );
    }
  };

  return {
    onInit(initialData) {
      const data = record(initialData);
      const list = data?.instructions;
      if (Array.isArray(list) && list.every((s) => typeof s === 'string')) stage?.load(list as string[]);
    },
    onEvent(event) {
      const p = record(event.payload) ?? {};
      switch (event.type) {
        case 'phase': {
          const ph = p.phase;
          panel?.highlightPhase?.(typeof ph === 'string' ? ph : null);
          return;
        }
        case 'run-begin': {
          const window = num(p, 'window');
          const width = num(p, 'width');
          const ruler = num(p, 'rulerCycles');
          if (window === null || width === null || ruler === null) return;
          stage?.beginRun(window, width, ruler);
          stage?.setCaption(
            tr('caption.begin', 'Window {w}: only the oldest {w} uncommitted instructions may start', { w: window }),
          );
          return;
        }
        case 'cycle': {
          const c = num(p, 'cycle');
          const oldest = num(p, 'oldest');
          const end = num(p, 'windowEnd');
          if (c === null || oldest === null || end === null) return;
          cycle = c;
          commits = [];
          starts = [];
          overtakers = [];
          passed = new Set();
          stage?.setCycle(c, oldest, end);
          caption();
          return;
        }
        case 'commit': {
          const index = num(p, 'index');
          const c = num(p, 'cycle');
          if (index === null || c === null) return;
          commits.push(index);
          stage?.commit(index, c);
          caption();
          return;
        }
        case 'issue': {
          const index = num(p, 'index');
          const c = num(p, 'cycle');
          const rank = num(p, 'rank');
          const done = num(p, 'done');
          const older = Array.isArray(p.passed) ? p.passed.filter((x): x is number => typeof x === 'number') : [];
          if (index === null || c === null || rank === null || done === null) return;
          starts.push(index);
          if (older.length > 0) {
            overtakers.push(index);
            for (const o of older) passed.add(o);
          }
          stage?.issue(index, c, rank, done, older.length > 0);
          caption();
          return;
        }
        case 'complete': {
          const index = num(p, 'index');
          const c = num(p, 'cycle');
          if (index === null || c === null) return;
          stage?.complete(index, c);
          return;
        }
        case 'run-end': {
          const cycles = num(p, 'cycles');
          const ipc = num(p, 'ipcPercent');
          const over = num(p, 'overtakes');
          if (cycles === null || ipc === null || over === null) return;
          stage?.finish(cycles);
          stage?.setCaption(
            tr('caption.done', 'Finished in {cycles} cycles · IPC {ipc}% · {over} overtakes', {
              cycles,
              ipc,
              over,
            }),
          );
          panel?.highlightPhase?.(null);
          return;
        }
        default:
          // 이 algorithm 이 내는 이벤트는 위가 전부다 — 그 밖은 조용히 버린다.
          return;
      }
    },
    onReset() {
      panel?.clearHighlight?.();
    },
  };
};
