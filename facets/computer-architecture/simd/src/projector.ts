/**
 * SIMD projector — algorithm 이벤트를 simd-stage 호출과 코드 패널 하이라이트로 옮긴다.
 *
 * 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { SimdStage } from './simd-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

function obj(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

function num(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(p: Record<string, unknown>, key: string): number[] | null {
  const v = p[key];
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

export const simdProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as SimdStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const a = nums(obj(initialData), 'a');
      stage?.clear();
      stage?.setCaption(tr('caption.idle', 'c = a + b over {n} elements', { n: a?.length ?? 0 }));
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = obj(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = p['phase'];
          if (typeof phase === 'string') code?.highlightPhase?.(phase);
          return;
        }
        case 'round-start': {
          const lanes = num(p, 'lanes');
          const packs = num(p, 'packs');
          const tail = num(p, 'tail');
          const ops = num(p, 'ops');
          if (lanes === null || packs === null || tail === null || ops === null) return;
          stage?.layout(lanes, packs, tail, ops);
          stage?.setCaption(
            tr('caption.plan', 'Lanes = {lanes}: {packs} packed adds, then {tail} tail adds', { lanes, packs, tail }),
          );
          stage?.setReadout(tr('readout.ops', '{ops} adds, {tail} in the tail', { ops, tail }));
          return;
        }
        case 'pack-add': {
          const start = num(p, 'start');
          const width = num(p, 'width');
          const op = num(p, 'op');
          const sums = nums(p, 'sums');
          if (start === null || width === null || op === null || sums === null) return;
          stage?.packAdd(start, width, sums, op);
          if (width === 1) {
            stage?.setCaption(tr('caption.one', 'One lane: one add fills c[{index}] alone', { index: start }));
          } else {
            stage?.setCaption(
              tr('caption.pack', 'One add fills c[{from}] … c[{to}] at once', { from: start, to: start + width - 1 }),
            );
          }
          return;
        }
        case 'tail-add': {
          const index = num(p, 'index');
          const sum = num(p, 'sum');
          const op = num(p, 'op');
          if (index === null || sum === null || op === null) return;
          stage?.tailAdd(index, sum, op);
          stage?.setCaption(tr('caption.tail', 'Tail: c[{index}] takes an add of its own', { index }));
          return;
        }
        case 'round-done': {
          const ops = num(p, 'ops');
          const tailOps = num(p, 'tailOps');
          const pct = num(p, 'pct');
          const n = num(p, 'n');
          if (ops === null || tailOps === null || pct === null || n === null) return;
          stage?.finish();
          stage?.setCaption(
            tr('caption.done', '{ops} adds for {n} elements — {pct}% of one-lane speed', { ops, n, pct }),
          );
          stage?.setReadout(tr('readout.ops', '{ops} adds, {tail} in the tail', { ops, tail: tailOps }));
          return;
        }
        default:
          return;
      }
    },
  };
};
