/**
 * 셸 정렬 Projector — 알고리즘 이벤트를 stage(shell-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

import type { ShellSortCellState } from './shell-sort-stage.js';

type ShellSortStage = {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setBaseline(shifts: number): void;
  setGap(gap: number, chains: number[][]): void;
  setActiveChain(chainIndex: number | null): void;
  setHold(index: number | null, value: number | null): void;
  setHole(index: number | null): void;
  setValue(index: number, value: number): void;
  setCellState(index: number, state: ShellSortCellState): void;
  clearCellStates(): void;
  setShiftArrow(from: number | null, to: number | null): void;
  addShift(): void;
  clearFocus(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** `chains` payload 를 숫자 배열의 배열로 좁힌다 (C9 — 런타임 가드 후 사용). */
function toChains(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  const out: number[][] = [];
  for (const chain of raw) {
    if (!Array.isArray(chain)) continue;
    out.push(chain.filter((k): k is number => typeof k === 'number'));
  }
  return out;
}

export const shellSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ShellSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values);
      stage?.setCaption(
        tr('caption.start', 'Insertion sort, but the step is a gap instead of one cell.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'baseline': {
          const shifts = num((event.payload as { shifts?: number } | undefined)?.shifts);
          if (shifts === undefined) break;
          stage?.setBaseline(shifts);
          stage?.setCaption(
            tr(
              'caption.baseline',
              'The same input with gap 1 only would shift {shifts} times. Watch that number.',
              { shifts },
            ),
          );
          break;
        }

        case 'round-begin': {
          const p = event.payload as { round?: number; gap?: number; chains?: unknown } | undefined;
          const gap = num(p?.gap);
          const round = num(p?.round);
          if (gap === undefined) break;
          const chains = toChains(p?.chains);
          stage?.clearCellStates();
          stage?.clearFocus();
          stage?.setGap(gap, chains);
          if (round === undefined) break;
          stage?.setCaption(
            gap === 1
              ? tr(
                  'caption.roundNeighbour',
                  'Round {round} — gap 1. This is plain insertion sort, and little is left to do.',
                  { round },
                )
              : tr(
                  'caption.roundGap',
                  'Round {round} — gap {gap} splits the row into {chains} chains that never touch.',
                  { round, gap, chains: chains.length },
                ),
          );
          break;
        }

        case 'pick': {
          const p = event.payload as
            | { index?: number; value?: number; chain?: number }
            | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          const chain = num(p?.chain);
          if (index === undefined || value === undefined) break;
          stage?.clearCellStates();
          stage?.setShiftArrow(null, null);
          stage?.setActiveChain(chain ?? null);
          stage?.setHold(index, value);
          stage?.setCaption(
            tr('caption.pick', 'Lift {value} out of seat {index} — its seat is now a hole.', {
              value,
              index,
            }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as
            | { kind?: string; index?: number; value?: number; held?: number; greater?: boolean }
            | undefined;
          if (p?.kind !== 'comparing') break;
          const value = num(p.value);
          const held = num(p.held);
          stage?.clearCellStates();
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'comparing');
          if (value === undefined || held === undefined) break;
          stage?.setCaption(
            p.greater === true
              ? tr('caption.compareGreater', '{value} is larger than {held} — it must step aside.', {
                  value,
                  held,
                })
              : tr('caption.compareStop', '{value} is not larger than {held} — the hole is home.', {
                  value,
                  held,
                }),
          );
          break;
        }

        case 'shift': {
          const p = event.payload as { from?: number; to?: number; value?: number } | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          const value = num(p?.value);
          if (from === undefined || to === undefined || value === undefined) break;
          stage?.setValue(to, value);
          stage?.clearCellStates();
          stage?.setCellState(to, 'shifting');
          stage?.setHole(from);
          stage?.setShiftArrow(from, to);
          stage?.addShift();
          stage?.setCaption(
            tr(
              'caption.shift',
              '{value} steps aside: it moves right by {gap}, and the hole moves left.',
              { value, gap: to - from },
            ),
          );
          break;
        }

        case 'place': {
          const p = event.payload as
            | { index?: number; value?: number; moved?: boolean; shifted?: number }
            | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          if (index === undefined || value === undefined) break;
          stage?.setValue(index, value);
          stage?.setHold(null, null);
          stage?.setShiftArrow(null, null);
          stage?.clearCellStates();
          stage?.setCaption(
            p?.moved === true
              ? tr('caption.place', '{value} drops into seat {index}.', { value, index })
              : tr('caption.placeStay', '{value} was already in place — nothing moved.', { value }),
          );
          break;
        }

        case 'round-end': {
          const p = event.payload as
            | { round?: number; gap?: number; compares?: number; shifts?: number }
            | undefined;
          const gap = num(p?.gap);
          const compares = num(p?.compares);
          const shifts = num(p?.shifts);
          stage?.clearCellStates();
          stage?.clearFocus();
          if (gap === undefined || compares === undefined || shifts === undefined) break;
          stage?.setCaption(
            tr('caption.roundEnd', 'Gap {gap} done — {compares} compares, {shifts} shifts.', {
              gap,
              compares,
              shifts,
            }),
          );
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'sorted') break;
          stage?.clearFocus();
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'sorted');
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: unknown } | undefined)?.phase;
          codePanel?.highlightPhase(typeof phase === 'string' ? phase : null);
          break;
        }

        case 'done': {
          const p = event.payload as { shifts?: number; baselineShifts?: number } | undefined;
          const shifts = num(p?.shifts);
          const baselineShifts = num(p?.baselineShifts);
          codePanel?.clearHighlight();
          if (shifts === undefined || baselineShifts === undefined) break;
          stage?.setCaption(
            tr(
              'caption.done',
              'Sorted with {shifts} shifts instead of {baselineShifts} — the far rounds paid for it.',
              { shifts, baselineShifts },
            ),
          );
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
