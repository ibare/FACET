/**
 * k-평균 Projector — 알고리즘 이벤트를 stage 메서드 호출과 코드 패널 하이라이트로
 * 옮긴다.
 *
 * 그리는 일은 stage 가, 무엇이라 말할지는 `facet.ts` 의 `messages` 가 진다.
 * 여기 남는 것은 **키와 en 원본** 뿐이다 (C10).
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage view 의 구조적 계약. 없는 메서드는 `?.()` 로 흘린다 (C9). */
type KmeansStage = {
  setPoints?(points: number[][], seedLabels: string[]): void;
  beginRun?(info: {
    k: number;
    seedIndex: number;
    seedIndices: number[];
    centers: number[][];
  }): void;
  setRound?(round: number | null): void;
  setSpokes?(distances: number[][] | null): void;
  setPicks?(best: number[] | null): void;
  setAssign?(assign: number[] | null): void;
  setTallies?(counts: number[] | null): void;
  setCenters?(centers: number[][], from: number[][] | null): void;
  setSettled?(settled: boolean): void;
  addLedgerRow?(row: {
    k: number;
    seedIndex: number;
    sizes: number[];
    spread: number;
    isReader: boolean;
  }): void;
  setCaption?(main: string, note: string): void;
  reset?(): void;
};

/** code-view 의 구조적 계약. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type Answer = { seedIndex: number; sizes: number[]; spread: number };

type SettledPayload = {
  k: number;
  seedIndex: number;
  rounds: number;
  sizes: number[];
  spread: number;
  isReader: boolean;
  triedAtK: number;
  distinctAtK: number;
  tightest: Answer;
  reader: Answer | null;
};

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number');
}

function isGrid(v: unknown): v is number[][] {
  return Array.isArray(v) && v.every(isNumberArray);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function readAnswer(v: unknown): Answer | null {
  const r = asRecord(v);
  if (r === null) return null;
  if (typeof r.seedIndex !== 'number' || typeof r.spread !== 'number') return null;
  if (!isNumberArray(r.sizes)) return null;
  return { seedIndex: r.seedIndex, sizes: r.sizes, spread: r.spread };
}

function readSettled(v: unknown): SettledPayload | null {
  const r = asRecord(v);
  if (r === null) return null;
  const tightest = readAnswer(r.tightest);
  if (tightest === null) return null;
  if (
    typeof r.k !== 'number' ||
    typeof r.seedIndex !== 'number' ||
    typeof r.rounds !== 'number' ||
    typeof r.spread !== 'number' ||
    typeof r.triedAtK !== 'number' ||
    typeof r.distinctAtK !== 'number' ||
    typeof r.isReader !== 'boolean' ||
    !isNumberArray(r.sizes)
  ) {
    return null;
  }
  return {
    k: r.k,
    seedIndex: r.seedIndex,
    rounds: r.rounds,
    sizes: r.sizes,
    spread: r.spread,
    isReader: r.isReader,
    triedAtK: r.triedAtK,
    distinctAtK: r.distinctAtK,
    tightest,
    reader: readAnswer(r.reader),
  };
}

export const kmeansProjector: ProjectorFactory = (views, runtime) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as KmeansStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  /** 시작 표식 (A · B · C · D). 도형에 새겨지는 글자라 번역하지 않는다 (C10). */
  let seedLabels: string[] = [];
  const labelOf = (index: number): string => seedLabels[index] ?? String(index);
  /** 무리 크기를 `3/3/6` 으로 — 수식 표기라 번역하지 않는다. */
  const sizesOf = (sizes: number[]): string => sizes.join('/');
  const num = (value: number, digits: number): string => value.toFixed(digits);

  /** 멎은 뒤 덧붙일 한 줄. 주장이 성립하는 쪽을 먼저 고른다. */
  function noteFor(s: SettledPayload): string {
    if (s.reader !== null && s.tightest.spread < s.reader.spread) {
      return tr(
        'note.tightestNotTruest',
        'Tightest: {tight} at {tightSpread}. What a reader sees: {human} at {humanSpread} — {ratio} times more scattered.',
        {
          tight: sizesOf(s.tightest.sizes),
          tightSpread: num(s.tightest.spread, 2),
          human: sizesOf(s.reader.sizes),
          humanSpread: num(s.reader.spread, 2),
          ratio: num(s.reader.spread / s.tightest.spread, 1),
        },
      );
    }
    if (s.distinctAtK >= 2) {
      return tr(
        'note.manyAnswers',
        'Starts tried: {tried}. Different answers: {distinct}, all at k = {k}. Not one of them can move.',
        { tried: s.triedAtK, distinct: s.distinctAtK, k: s.k },
      );
    }
    if (s.triedAtK >= 2) {
      return tr(
        'note.sameAnswer',
        'Starts tried: {tried}. One answer so far at k = {k}. Draw another start.',
        { tried: s.triedAtK, k: s.k },
      );
    }
    return tr('note.firstAnswer', 'Draw another start and see whether it stops here again.');
  }

  return {
    onInit(initialData: unknown) {
      const d = asRecord(initialData);
      const points = d !== null && isGrid(d.points) ? d.points : [];
      seedLabels =
        d !== null && Array.isArray(d.seedLabels)
          ? d.seedLabels.filter((s): s is string => typeof s === 'string')
          : [];
      stage?.setPoints?.(points, seedLabels);
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },

    onEvent(event) {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'phase': {
          const name = p?.phase;
          codePanel?.highlightPhase?.(typeof name === 'string' ? name : null);
          return;
        }

        case 'run-begin': {
          if (p === null) return;
          const k = typeof p.k === 'number' ? p.k : 0;
          const seedIndex = typeof p.seedIndex === 'number' ? p.seedIndex : 0;
          const seedIndices = isNumberArray(p.seedIndices) ? p.seedIndices : [];
          const centers = isGrid(p.centers) ? p.centers : [];
          stage?.beginRun?.({ k, seedIndex, seedIndices, centers });
          stage?.setCaption?.(
            tr('caption.begin', 'k = {k}. The starting centres sit on points {picks}.', {
              k,
              picks: seedIndices.join(', '),
            }),
            tr(
              'note.begin',
              'Between runs, the starting centres are the only thing that changes.',
            ),
          );
          return;
        }

        case 'round-begin': {
          const round = typeof p?.round === 'number' ? p.round : null;
          stage?.setRound?.(round);
          stage?.setSpokes?.(null);
          stage?.setPicks?.(null);
          stage?.setTallies?.(null);
          return;
        }

        case 'measured': {
          if (p === null || !isGrid(p.distances)) return;
          stage?.setSpokes?.(p.distances);
          stage?.setCaption?.(
            tr(
              'caption.measure',
              'Every point measures every centre. The distances stay squared.',
            ),
            tr(
              'note.measure',
              'A square root would not change which centre is nearest, so it is never taken.',
            ),
          );
          return;
        }

        case 'nearest-picked': {
          if (p === null || !isNumberArray(p.best)) return;
          stage?.setPicks?.(p.best);
          stage?.setCaption?.(
            tr('caption.pick', 'Each point keeps only its nearest centre.'),
            tr('note.pick', 'Comparing the squares is enough to find the smallest one.'),
          );
          return;
        }

        case 'assigned': {
          if (p === null || !isNumberArray(p.assign) || !isNumberArray(p.sizes)) return;
          const spread = typeof p.spread === 'number' ? p.spread : 0;
          stage?.setAssign?.(p.assign);
          stage?.setCaption?.(
            tr('caption.assign', 'The points are attached. Groups: {sizes}.', {
              sizes: sizesOf(p.sizes),
            }),
            tr('note.assign', 'Scatter with these centres: {spread}.', {
              spread: num(spread, 2),
            }),
          );
          return;
        }

        case 'gathered': {
          if (p === null || !isNumberArray(p.counts)) return;
          // `sums` 도 payload 에 있지만 화면에는 개수만 세운다 — 좌표 합은
          // 다음 걸음에서 평균이 되어 중심의 자리로 나타난다.
          stage?.setTallies?.(p.counts);
          stage?.setCaption?.(
            tr('caption.gather', 'Each group counts its points and adds up their coordinates.'),
            tr('note.gather', 'Group sizes: {sizes}.', { sizes: sizesOf(p.counts) }),
          );
          return;
        }

        case 'centers-moved': {
          if (p === null || !isGrid(p.centers)) return;
          const from = isGrid(p.from) ? p.from : null;
          const moved = typeof p.moved === 'number' ? p.moved : 0;
          const spread = typeof p.spread === 'number' ? p.spread : 0;
          stage?.setCenters?.(p.centers, from);
          stage?.setTallies?.(null);
          stage?.setCaption?.(
            tr('caption.move', 'Every centre steps to the mean of its own group.'),
            tr('note.move', 'Total step {moved}. Scatter now {spread}.', {
              moved: num(moved, 3),
              spread: num(spread, 2),
            }),
          );
          return;
        }

        case 'settle-checked': {
          const settled = p?.settled === true;
          const moved = typeof p?.moved === 'number' ? p.moved : 0;
          stage?.setSettled?.(settled);
          stage?.setCaption?.(
            settled
              ? tr('caption.stopped', 'Nobody moved. There is nowhere left to go.')
              : tr('caption.again', 'Something still moved. Turn again.'),
            settled
              ? tr('note.stopped', 'If the attachments do not change, the means do not change either.')
              : tr('note.again', 'The centres travelled {moved} this round.', {
                  moved: num(moved, 3),
                }),
          );
          return;
        }

        case 'run-settled': {
          const s = readSettled(event.payload);
          if (s === null) return;
          stage?.addLedgerRow?.({
            k: s.k,
            seedIndex: s.seedIndex,
            sizes: s.sizes,
            spread: s.spread,
            isReader: s.isReader,
          });
          const main = tr(
            'caption.settled',
            'Start {seed} — stopped at {sizes} after {rounds} rounds. Scatter {spread}.',
            {
              seed: labelOf(s.seedIndex),
              sizes: sizesOf(s.sizes),
              rounds: s.rounds,
              spread: num(s.spread, 2),
            },
          );
          stage?.setCaption?.(main, noteFor(s));
          return;
        }

        default:
          // 그 밖의 type 은 조용히 흘린다 — 이 알고리즘은 위 목록만 발신한다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },

    onDestroy() {
      codePanel?.clearHighlight?.();
    },
  };

};
