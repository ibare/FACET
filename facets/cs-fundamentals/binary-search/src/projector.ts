/**
 * 이진 탐색 Projector — 알고리즘 이벤트를 stage(binary-search-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type StepRow = { lo: number; hi: number; mid: number; outcome: 'lt' | 'gt' | 'eq' };

type BinarySearchStage = {
  setData(values: number[]): void;
  setTargets(targets: number[]): void;
  setCaption(text: string): void;
  beginRun(run: number, target: number): void;
  setWindow(lo: number, hi: number): void;
  setProbe(index: number | null): void;
  addStep(row: StepRow): void;
  addEmptyStep(): void;
  markFound(index: number): void;
  endRun(run: number, found: boolean): void;
  finish(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const outcomeOf = (v: unknown): StepRow['outcome'] | undefined =>
  v === 'lt' || v === 'gt' || v === 'eq' ? v : undefined;

export const binarySearchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BinarySearchStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[]; targets?: number[] } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      const targets = Array.isArray(data?.targets) ? [...data.targets] : [];
      stage?.setData(values);
      stage?.setTargets(targets);
      stage?.setCaption(
        tr(
          'caption.start',
          'A sorted row of {count} values. Every comparison throws half of them away.',
          { count: values.length },
        ),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'search-begin': {
          const p = event.payload as
            | { run?: number; target?: number; lo?: number; hi?: number; size?: number }
            | undefined;
          const run = num(p?.run);
          const target = num(p?.target);
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const size = num(p?.size);
          if (run === undefined || target === undefined) break;
          stage?.beginRun(run, target);
          if (lo !== undefined && hi !== undefined) stage?.setWindow(lo, hi);
          if (size !== undefined) {
            stage?.setCaption(
              tr('caption.searchBegin', 'Search {run}: look for {target} among {size} candidates.', {
                run,
                target,
                size,
              }),
            );
          }
          break;
        }

        case 'highlight': {
          const p = event.payload as
            | { index?: number; value?: number; lo?: number; hi?: number }
            | undefined;
          for (const i of toIndexArray(event.target)) stage?.setProbe(i);
          const index = num(p?.index);
          const value = num(p?.value);
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          if (index !== undefined && value !== undefined && lo !== undefined && hi !== undefined) {
            stage?.setCaption(
              tr('caption.pickMid', 'The middle of [{lo}..{hi}] is seat {index}, holding {value}.', {
                lo,
                hi,
                index,
                value,
              }),
            );
          }
          break;
        }

        case 'compare-result': {
          const p = event.payload as
            | {
                index?: number;
                value?: number;
                target?: number;
                cmp?: unknown;
                lo?: number;
                hi?: number;
              }
            | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          const target = num(p?.target);
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const outcome = outcomeOf(p?.cmp);
          if (
            index === undefined ||
            value === undefined ||
            target === undefined ||
            lo === undefined ||
            hi === undefined ||
            outcome === undefined
          ) {
            break;
          }
          stage?.addStep({ lo, hi, mid: index, outcome });
          if (outcome === 'eq') {
            stage?.setCaption(
              tr('caption.equal', '{value} is the value we wanted.', { value }),
            );
          } else if (outcome === 'lt') {
            stage?.setCaption(
              tr('caption.less', '{value} < {target} — the wanted value can only be to the right.', {
                value,
                target,
              }),
            );
          } else {
            stage?.setCaption(
              tr(
                'caption.greater',
                '{value} > {target} — the wanted value can only be to the left.',
                { value, target },
              ),
            );
          }
          break;
        }

        case 'half-dropped': {
          const p = event.payload as
            | { side?: string; lo?: number; hi?: number; size?: number }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const size = num(p?.size);
          stage?.setProbe(null);
          if (lo !== undefined && hi !== undefined) stage?.setWindow(lo, hi);
          if (size === undefined) break;
          stage?.setCaption(
            p?.side === 'left'
              ? tr('caption.dropLeft', 'Drop the left half — {size} candidates left.', { size })
              : tr('caption.dropRight', 'Drop the right half — {size} candidates left.', { size }),
          );
          break;
        }

        case 'range-empty': {
          stage?.addEmptyStep();
          stage?.setCaption(
            tr('caption.empty', 'lo has passed hi — the range holds nothing at all.'),
          );
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'found') break;
          for (const i of toIndexArray(event.target)) stage?.markFound(i);
          break;
        }

        case 'search-end': {
          const p = event.payload as
            | { run?: number; target?: number; found?: boolean; index?: number; compares?: number }
            | undefined;
          const run = num(p?.run);
          const target = num(p?.target);
          const index = num(p?.index);
          const compares = num(p?.compares);
          const found = p?.found === true;
          if (run !== undefined) stage?.endRun(run, found);
          if (target === undefined || compares === undefined) break;
          if (found && index !== undefined) {
            stage?.setCaption(
              tr('caption.found', 'Found {target} at seat {index} after {compares} comparisons.', {
                target,
                index,
                compares,
              }),
            );
          } else if (!found) {
            stage?.setCaption(
              tr(
                'caption.notFound',
                'There is no {target} here. The empty range is the proof, and {compares} comparisons were enough to reach it.',
                { target, compares },
              ),
            );
          }
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as
            | { searches?: number; hits?: number; compares?: number }
            | undefined;
          const searches = num(p?.searches);
          const hits = num(p?.hits);
          const compares = num(p?.compares);
          codePanel?.clearHighlight();
          stage?.finish();
          if (searches !== undefined && hits !== undefined && compares !== undefined) {
            stage?.setCaption(
              tr(
                'caption.done',
                '{searches} searches, {hits} found, {compares} comparisons in all.',
                { searches, hits, compares },
              ),
            );
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // 값과 찾을 값의 복원은 러너가 reset 뒤 onInit 을 다시 불러 수행한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
