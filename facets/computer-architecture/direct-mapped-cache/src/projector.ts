/**
 * 직접 사상 캐시 Projector — 알고리즘 이벤트를 stage / 코드 패널 호출로 옮긴다.
 *
 * 문안은 하나도 여기 없다. 키와 en 원본만 있고 문장은 `facet.ts` 의 `messages`
 * 에 있다 (C10). 식별자는 `parseTarget` 으로만 읽는다 (C1).
 */

import {
  makeTranslator,
  parseTarget,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  setCaption?: (value: string) => void;
  setSweep?: (sweep: number, total: number) => void;
  clearAll?: () => void;
  setup?: (p: { lineCount: number; sweeps: number; ms: number }) => Promise<void> | void;
  travel?: (p: { lineNo: number; slot: number; tag: number; ms: number }) => Promise<void> | void;
  settle?: (p: {
    lineNo: number;
    slot: number;
    outcome: string;
    evictedLine: number;
    ms: number;
  }) => Promise<void> | void;
  finish?: (p: { lineCount: number; rate: number; ms: number }) => Promise<void> | void;
};

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

/** 걸음 하나의 기본 길이. 재생 속도로 나뉜다. */
const TRAVEL_MS = 260;
const SETTLE_MS = 220;
const LAYOUT_MS = 340;
const GROW_MS = 420;

function numOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `index:3` / `slot:5` 에서 번호를 뽑는다. 아니면 -1. */
function idOf(target: FacetRuntimeEvent['target'], prefix: string): number {
  const one = Array.isArray(target) ? target[0] : target;
  if (typeof one !== 'string') return -1;
  const parsed = parseTarget(one);
  if (parsed === null || parsed.prefix !== prefix) return -1;
  const n = Number(parsed.id);
  return Number.isFinite(n) ? n : -1;
}

export const directMappedCacheProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const speed = (): number => Math.max(0.25, runtime?.getSpeed?.() ?? 1);
  const ms = (base: number): number => Math.max(40, Math.round(base / speed()));

  /** 지금 판의 배열 크기. `done` 캡션과 사다리 기둥이 쓴다. */
  let lineCount = 0;
  let sweeps = 3;

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { lineCount?: unknown; sweeps?: unknown } | undefined;
      lineCount = numOf(d?.lineCount, 0);
      sweeps = numOf(d?.sweeps, 3);
      stage?.clearAll?.();
    },

    onReset(): void {
      stage?.clearAll?.();
      panel?.clearHighlight?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          panel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }

        case 'state-changed': {
          const p = event.payload as
            | { lineCount?: unknown; slotCount?: unknown; sweeps?: unknown }
            | undefined;
          lineCount = numOf(p?.lineCount, lineCount);
          sweeps = numOf(p?.sweeps, sweeps);
          const slotCount = numOf(p?.slotCount, 8);
          stage?.setCaption?.(
            tr('caption.intro', '{lines} lines, {slots} cache slots, {sweeps} sweeps. The address picks the slot.', {
              lines: lineCount,
              slots: slotCount,
              sweeps,
            }),
          );
          await stage?.setup?.({ lineCount, sweeps, ms: ms(LAYOUT_MS) });
          return;
        }

        case 'sweep-begin': {
          const p = event.payload as { sweep?: unknown; sweeps?: unknown } | undefined;
          stage?.setSweep?.(numOf(p?.sweep, 1), numOf(p?.sweeps, sweeps));
          return;
        }

        case 'highlight': {
          const p = event.payload as { slot?: unknown; tag?: unknown } | undefined;
          const lineNo = idOf(event.target, 'index');
          if (lineNo < 0) return;
          await stage?.travel?.({
            lineNo,
            slot: numOf(p?.slot, 0),
            tag: numOf(p?.tag, 0),
            ms: ms(TRAVEL_MS),
          });
          return;
        }

        case 'mark': {
          const p = event.payload as
            | { lineNo?: unknown; outcome?: unknown; evictedLine?: unknown }
            | undefined;
          const slot = idOf(event.target, 'slot');
          if (slot < 0) return;
          const lineNo = numOf(p?.lineNo, 0);
          const outcome = typeof p?.outcome === 'string' ? p.outcome : 'hit';
          const evictedLine = numOf(p?.evictedLine, -1);

          if (outcome === 'hit') {
            stage?.setCaption?.(
              tr('caption.hit', 'Line {line} is already in slot {slot}. Hit.', { line: lineNo, slot }),
            );
          } else if (outcome === 'conflict') {
            stage?.setCaption?.(
              tr('caption.conflict', 'Line {line} wants slot {slot}, but line {other} sits there. Out it goes.', {
                line: lineNo,
                slot,
                other: evictedLine,
              }),
            );
          } else if (evictedLine >= 0) {
            stage?.setCaption?.(
              tr('caption.coldEvict', 'Line {line} is new here, but line {other} sits in slot {slot}. Out it goes.', {
                line: lineNo,
                slot,
                other: evictedLine,
              }),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.cold', 'Line {line} has never been here. Slot {slot} takes it in.', {
                line: lineNo,
                slot,
              }),
            );
          }

          await stage?.settle?.({ lineNo, slot, outcome, evictedLine, ms: ms(SETTLE_MS) });
          return;
        }

        case 'done': {
          const p = event.payload as
            | {
                lineCount?: unknown;
                accessCount?: unknown;
                missCount?: unknown;
                coldCount?: unknown;
                conflictCount?: unknown;
                missRatePct?: unknown;
              }
            | undefined;
          const size = numOf(p?.lineCount, lineCount);
          const rate = numOf(p?.missRatePct, 0);
          stage?.setCaption?.(
            tr('caption.done', '{misses} misses of {accesses} — {rate}%. First touch {cold}, evicted {conflict}.', {
              misses: numOf(p?.missCount, 0),
              accesses: numOf(p?.accessCount, 0),
              rate,
              cold: numOf(p?.coldCount, 0),
              conflict: numOf(p?.conflictCount, 0),
            }),
          );
          await stage?.finish?.({ lineCount: size, rate, ms: ms(GROW_MS) });
          return;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다.
          return;
      }
    },
  };
};
