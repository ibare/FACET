/**
 * 순수와 차례 projector — algorithm 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 움직임의 길이는 부를 때마다 재생 속도를 읽어 정한다 (걸음 경계를 넘지 않게).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { PureFunctionStage, PureFunctionStageCall } from './pure-function-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

type P = Record<string, unknown>;

function num(p: P, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(p: P, key: string): number[] | null {
  const v = p[key];
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is number => typeof x === 'number');
  return out.length === v.length ? out : null;
}

function calls(p: P): PureFunctionStageCall[] | null {
  const v = p.calls;
  if (!Array.isArray(v)) return null;
  const out: PureFunctionStageCall[] = [];
  for (const c of v) {
    if (typeof c !== 'object' || c === null) return null;
    const r = c as P;
    const slot = num(r, 'slot');
    const mul = num(r, 'mul');
    const add = num(r, 'add');
    if (typeof r.name !== 'string' || slot === null || mul === null || add === null) return null;
    out.push({ name: r.name, slot, mul, add });
  }
  return out;
}

const listText = (xs: number[]) => `[${xs.join(', ')}]`;

export const pureFunctionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PureFunctionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let stepMs = 700;

  const dur = () => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round((stepMs * 0.5) / Math.max(0.25, speed));
  };

  return {
    onInit(data) {
      const d = data as P | undefined;
      const s = d ? num(d, 'stepMs') : null;
      if (s !== null) stepMs = s;
    },
    onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as P;
      switch (e.type) {
        case 'phase': {
          const ph = p.phase;
          code?.highlightPhase?.(typeof ph === 'string' ? ph : null);
          return;
        }
        case 'round': {
          const order = nums(p, 'order');
          const values = nums(p, 'values');
          const cs = calls(p);
          const peak = num(p, 'peak');
          const label = typeof p.orderLabel === 'string' ? p.orderLabel : '';
          if (!order || !values || !cs || peak === null) return;
          code?.clearHighlight?.();
          stage?.round({ order, copyMode: p.copyMode === true, values, peak, calls: cs }, dur());
          stage?.caption(t('caption.order', 'Order: {order}', { order: label }));
          return;
        }
        case 'call': {
          const call = num(p, 'call');
          const position = num(p, 'position');
          const name = typeof p.name === 'string' ? p.name : '';
          if (call === null || position === null) return;
          stage?.call({ call, position, copyMode: p.copyMode === true }, dur());
          stage?.caption(t('caption.call', 'Call: {name}', { name }));
          return;
        }
        case 'copy': {
          const call = num(p, 'call');
          const values = nums(p, 'values');
          if (call === null || !values) return;
          stage?.copy({ call, values }, dur());
          stage?.caption(t('caption.copy', 'Copy: {list}', { list: listText(values) }));
          return;
        }
        case 'write': {
          const call = num(p, 'call');
          const slot = num(p, 'slot');
          const before = num(p, 'before');
          const after = num(p, 'after');
          const values = nums(p, 'values');
          if (call === null || slot === null || before === null || after === null || !values) return;
          stage?.write({ call, slot, values, copyMode: p.copyMode === true }, dur());
          stage?.caption(t('caption.write', 'Slot {slot}: {before} → {after}', { slot, before, after }));
          return;
        }
        case 'sum': {
          const call = num(p, 'call');
          const sum = num(p, 'sum');
          if (call === null || sum === null) return;
          stage?.sum({ call, sum }, dur());
          stage?.caption(t('caption.sum', 'Returned: {sum}', { sum }));
          return;
        }
        case 'done': {
          const values = nums(p, 'values');
          const sum = num(p, 'sum');
          if (!values || sum === null) return;
          stage?.done({ values, sum }, dur());
          stage?.caption(
            `${t('caption.original', 'Original: {list}', { list: listText(values) })} · ${t('caption.total', 'Sum: {n}', { n: sum })}`,
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight?.();
      stage?.reset();
    },
  };
};
