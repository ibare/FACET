/**
 * suffix-array projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 이 파일은 그리지도 셈하지도 않는다. `event.payload` 를 가드로 좁혀 정형 객체로
 * 만든 뒤 넘기는 것이 전부다 (C9). 문안은 키로만 남고 실제 글은 `facet.ts` 의
 * messages 에 있다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드를 부르지 않도록 전부 optional 로 둔다. */
type SuffixArrayStage = {
  showSetup?(s: { level: number; text: string; pattern: string }): void;
  showCut?(tails: { from: number; text: string }[]): void;
  // 움직이는 메서드는 Promise 를 돌려준다 — 러너가 기다릴 수 있어야 다음 걸음이
  // 애니메이션을 짓밟지 않는다 (S-view).
  showSorted?(s: {
    sa: number[];
    overlaps: number[];
    overlapSum: number;
    overlapAvg: number;
  }): Promise<void> | void;
  showProbe?(p: {
    lo: number;
    hi: number;
    mid: number;
    rank: number;
    cmp: 'lt' | 'ge';
  }): Promise<void> | void;
  showBlock?(b: { start: number; size: number; ranks: number[] }): Promise<void> | void;
  showMatch?(m: { rank: number; from: number }): void;
  setCaption?(text: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

function tailList(v: unknown): { from: number; text: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { from: number; text: string }[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const t = raw as Record<string, unknown>;
    const from = num(t.from);
    if (from === null || typeof t.text !== 'string') continue;
    out.push({ from, text: t.text });
  }
  return out;
}

export const suffixArrayProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SuffixArrayStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit() {
      // 초기 데이터를 여기서 좁혀 밀어 넣지 않는다 — 처음 그림은 stage 의 mount 가
      // 자기 initialData 로 이미 세웠다. reactive 의 reset 은 데이터를 되돌린 뒤
      // onInit 을 다시 부르므로 (S-runtime), 처음 자리로 돌려놓기만 하면 된다.
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);
      switch (event.type) {
        case 'setup': {
          const level = num(p?.level);
          const text = typeof p?.text === 'string' ? p.text : null;
          const pattern = typeof p?.pattern === 'string' ? p.pattern : null;
          if (level === null || text === null || pattern === null) return;
          stage?.showSetup?.({ level, text, pattern });
          stage?.setCaption?.(
            tr('caption.setup', 'One text, one pattern. The tails get lined up just once.'),
          );
          return;
        }
        case 'cut': {
          const tails = tailList(p?.tails);
          stage?.showCut?.(tails);
          stage?.setCaption?.(
            tr('caption.cut', 'Every position leaves a tail — {count} of them.', {
              count: tails.length,
            }),
          );
          return;
        }
        case 'sorted': {
          const sa = numList(p?.sa);
          const overlaps = numList(p?.overlaps);
          const overlapSum = num(p?.overlapSum);
          const overlapAvg = num(p?.overlapAvg);
          if (overlapSum === null || overlapAvg === null) return;
          // 캡션을 먼저 띄우고 움직인다 — 무엇이 일어나는지 읽으면서 보게.
          stage?.setCaption?.(
            tr(
              'caption.sorted',
              'Lined up once. Neighbouring tails now share {avg} letters on average.',
              { avg: overlapAvg.toFixed(2) },
            ),
          );
          await stage?.showSorted?.({ sa, overlaps, overlapSum, overlapAvg });
          return;
        }
        case 'probe': {
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const mid = num(p?.mid);
          const rank = num(p?.rank);
          const cmp = p?.cmp === 'lt' || p?.cmp === 'ge' ? p.cmp : null;
          if (lo === null || hi === null || mid === null || rank === null || cmp === null) return;
          stage?.setCaption?.(
            cmp === 'lt'
              ? tr(
                  'caption.goRight',
                  'Row {rank} sorts before the pattern — the block can only be below.',
                  { rank },
                )
              : tr(
                  'caption.goLeft',
                  'Row {rank} does not sort before the pattern — the block starts here or above.',
                  { rank },
                ),
          );
          await stage?.showProbe?.({ lo, hi, mid, rank, cmp });
          return;
        }
        case 'block': {
          const start = num(p?.start);
          const size = num(p?.size);
          if (start === null || size === null) return;
          stage?.setCaption?.(
            tr('caption.block', 'Binary search lands on row {start}. Every match sits from here.', {
              start,
            }),
          );
          await stage?.showBlock?.({ start, size, ranks: numList(p?.ranks) });
          return;
        }
        case 'match': {
          const rank = num(p?.rank);
          const from = num(p?.from);
          if (rank === null || from === null) return;
          stage?.showMatch?.({ rank, from });
          stage?.setCaption?.(
            tr('caption.match', 'Row {rank} starts with the pattern — position {from}.', {
              rank,
              from,
            }),
          );
          return;
        }
        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }
        case 'done': {
          const matches = num(p?.matches);
          const compares = num(p?.compares);
          if (matches === null || compares === null) return;
          stage?.setCaption?.(
            tr(
              'caption.done',
              '{count} matches, all in one block, reached with {compares} comparisons.',
              { count: matches, compares },
            ),
          );
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
