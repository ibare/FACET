/**
 * 구조체 정렬 projector — algorithm 이벤트를 stage 메서드와 캡션으로 옮긴다.
 *
 * payload 는 typeof 로 가려 읽는다 (C9). 문안은 facet.ts 의 messages 에 있고
 * 여기에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { StructAlignmentStage } from './struct-alignment-stage.js';

/** 블록이 한 걸음 안에 옮겨 가는 시간 (걸음 700ms 보다 짧게). */
const ANIM_MS = 480;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function obj(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}
function num(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return typeof v === 'string' ? v : '';
}

export const structAlignmentProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Partial<StructAlignmentStage> | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  const ms = () => Math.round(ANIM_MS / Math.max(0.25, runtime?.getSpeed() ?? 1));

  const orderName = (order: number): string =>
    order === 1
      ? tr('order.largest', 'largest first')
      : tr('order.declared', 'declaration order');

  return {
    onInit() {
      stage?.reset?.();
    },
    onReset() {
      stage?.reset?.();
      panel?.clearHighlight?.();
    },
    onEvent(event) {
      const p = obj(event.payload);
      switch (event.type) {
        case 'phase': {
          const name = str(p, 'phase');
          panel?.highlightPhase?.(name === '' ? null : name);
          return;
        }
        case 'layout-begin': {
          const pack = num(p, 'pack');
          const order = num(p, 'order');
          if (pack === null || order === null) return;
          stage?.beginLayout?.(ms());
          stage?.setCaption?.(
            tr('caption.begin', 'pack({pack}), {order}: the fields go down one by one', {
              pack,
              order: orderName(order),
            }),
          );
          return;
        }
        case 'place': {
          const field = num(p, 'field');
          const slot = num(p, 'slot');
          const from = num(p, 'from');
          const offset = num(p, 'offset');
          const align = num(p, 'align');
          const size = num(p, 'size');
          const gap = num(p, 'gap');
          if (field === null || slot === null || from === null || offset === null) return;
          if (align === null || size === null || gap === null) return;
          stage?.place?.({ field, slot, from, offset, align, size, ms: ms() });
          const vars = { name: str(p, 'name'), ctype: str(p, 'ctype'), from, offset, align, gap };
          stage?.setCaption?.(
            gap > 0
              ? tr('caption.pushed', '{ctype} {name} is pushed from {from} to {offset}, the next multiple of {align}: {gap} padding bytes open', vars)
              : tr('caption.flush', '{ctype} {name} lands right at {offset}, a multiple of {align}: no gap', vars),
          );
          return;
        }
        case 'misalign': {
          const field = num(p, 'field');
          const offset = num(p, 'offset');
          const size = num(p, 'size');
          if (field === null || offset === null || size === null) return;
          stage?.misalign?.(field, offset, size);
          stage?.setCaption?.(
            tr('caption.misalign', '{name} starts at {offset}, not a multiple of its size {size}: one read spans two {size}-byte words', {
              name: str(p, 'name'),
              offset,
              size,
            }),
          );
          return;
        }
        case 'tail': {
          const from = num(p, 'from');
          const size = num(p, 'size');
          const tail = num(p, 'tail');
          const structAlign = num(p, 'structAlign');
          if (from === null || size === null || tail === null || structAlign === null) return;
          stage?.tail?.({ from, size, structAlign, ms: ms() });
          const vars = { from, size, tail, structAlign };
          stage?.setCaption?.(
            tail > 0
              ? tr('caption.tail', 'The struct aligns to {structAlign}: its end moves from {from} to {size}, {tail} tail bytes', vars)
              : tr('caption.tailNone', 'The struct aligns to {structAlign}: the end {size} is already a multiple, no tail', vars),
          );
          return;
        }
        case 'summary': {
          const size = num(p, 'size');
          const padding = num(p, 'padding');
          const misaligned = num(p, 'misaligned');
          const data = num(p, 'data');
          const moved = num(p, 'moved');
          if (size === null || padding === null || misaligned === null || data === null || moved === null) return;
          const vars = { size, padding, misaligned, data };
          stage?.setCaption?.(
            moved === 0
              ? tr('caption.still', 'Nothing moved: still {size} bytes, {padding} padding, {misaligned} misaligned', vars)
              : tr('caption.summary', '{size} bytes = {data} of fields + {padding} padding, {misaligned} misaligned', vars),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
