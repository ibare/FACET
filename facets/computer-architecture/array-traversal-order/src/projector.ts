/**
 * 배열 순회 순서 projector — 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 *   phase      → 코드 패널 highlightPhase
 *   run-start  → stage.startRun + 순서별 시작 캡션
 *   visit      → stage.moveCursor + 칸 값과 누적 합 캡션
 *   lookup     → stage.markLookup + 원소 번호와 줄 번호 캡션
 *   access     → stage.showAccess + 적중 / 미스 / 밀어냄 / 다시 미스 캡션
 *   run-end    → stage.endRun + 결과 캡션
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { ArrayTraversalOrderStage } from './array-traversal-order-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

export const arrayTraversalOrderProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ArrayTraversalOrderStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let stepMs = 30;

  /** 걸음 간격에 맞춘 움직임 길이 — 다음 걸음 전에 끝나도록. */
  function pace(): void {
    const speed = runtime?.getSpeed() ?? 1;
    stage?.setPace?.((stepMs * 3 * 0.9) / Math.max(0.01, speed));
  }

  return {
    onInit(initialData) {
      stepMs = num(rec(initialData).stepMs, 30);
    },
    onEvent(event) {
      const p = rec(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'run-start': {
          pace();
          const vars = { rows: num(p.rows), cols: num(p.cols) };
          const cap =
            num(p.order) === 1
              ? tr('caption.startCol', 'Column-major walk — {rows} rows × {cols} columns, cache starts empty', vars)
              : tr('caption.startRow', 'Row-major walk — {rows} rows × {cols} columns, cache starts empty', vars);
          stage?.startRun?.(
            {
              rows: num(p.rows),
              cols: num(p.cols),
              order: num(p.order),
              lineElems: num(p.lineElems),
              cacheLines: num(p.cacheLines),
            },
            cap,
          );
          return;
        }
        case 'visit': {
          pace();
          const vars = { r: num(p.r), c: num(p.c), value: num(p.value), sum: num(p.sum) };
          stage?.moveCursor?.(
            { r: num(p.r), c: num(p.c) },
            tr('caption.visit', '({r}, {c}) holds {value} — running sum {sum}', vars),
          );
          return;
        }
        case 'lookup': {
          const vars = { r: num(p.r), c: num(p.c), elem: num(p.elem), line: num(p.line) };
          stage?.markLookup?.(
            num(p.line),
            tr('caption.lookup', '({r}, {c}) is element {elem}, in line {line} — is that line in the cache?', vars),
          );
          return;
        }
        case 'access': {
          pace();
          const hit = p.hit === true;
          const refetch = p.refetch === true;
          const evicted = num(p.evicted, -1);
          const vars = { r: num(p.r), c: num(p.c), line: num(p.line), evicted };
          let cap: string;
          if (hit) cap = tr('caption.hit', '({r}, {c}) → line {line}: hit, already in the cache', vars);
          else if (refetch)
            cap = tr(
              'caption.refetch',
              '({r}, {c}) → line {line}: miss again — it was pushed out before the walk came back',
              vars,
            );
          else if (evicted >= 0)
            cap = tr('caption.missEvict', '({r}, {c}) → line {line}: miss, fetched — line {evicted} pushed out', vars);
          else cap = tr('caption.miss', '({r}, {c}) → line {line}: miss, fetched into an empty slot', vars);
          stage?.showAccess?.(
            {
              line: num(p.line),
              hit,
              evicted,
              refetch,
              cache: nums(p.cache),
              percent: num(p.percent),
            },
            cap,
          );
          return;
        }
        case 'run-end': {
          const cap = tr('caption.end', '{misses} of {accesses} reads missed ({percent}%) · sum {sum}', {
            misses: num(p.misses),
            accesses: num(p.accesses),
            percent: num(p.missPercent),
            sum: num(p.sum),
          });
          stage?.endRun?.(
            { rows: num(p.rows), order: num(p.order), missPercent: num(p.missPercent), sum: num(p.sum) },
            cap,
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clearAll?.();
    },
  };
};
