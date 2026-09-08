/**
 * halveTheRange projector — 구간 반분 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. 이벤트마다 필요한 필드만 가드로 확인해
 * 정형 객체로 조립한 뒤 stage 로 보낸다 (C9).
 *
 * 화면 문안은 여기서 만든다. algorithm 은 셈만 발신하고 문장은 모른다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage view 가 노출하는 메서드 계약. */
type HalveTheRangeStage = {
  init(p: { values: number[] }): void;
  reset(): void;
  setCaption(text: string): void;
  setSpanLabel(text: string): void;
  setRange(p: { lo: number; hi: number }): void;
  probe(p: { index: number }): Promise<void>;
  narrow(p: { lo: number; hi: number; removed: number[]; sweptLabel: string }): Promise<void>;
  found(p: { index: number; removed: number[]; sweptLabel: string }): Promise<void>;
};

/**
 * 견줌의 방향 기호. 번역하면 오히려 화면과 어긋나는 수식 표기라 상수로 둔다
 * (C10 "표식이냐 문안이냐" 3번).
 */
const REL_GLYPH: Record<string, string> = { lt: '<', gt: '>' };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number');
}

export const halveTheRangeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HalveTheRangeStage;
  const tr = runtime?.t ?? makeTranslator();

  let target = 0;
  let total = 0;

  const spanLabel = (n: number): string => tr('label.remaining', '{n} candidates', { n });
  const goneLabel = (n: number): string => tr('label.gone', '{n} gone', { n });

  return {
    onInit(initialData: unknown) {
      const d = initialData as { values?: unknown; target?: unknown } | undefined;
      const values = numArray(d?.values);
      target = num(d?.target) ?? 0;
      total = values.length;
      stage.init({ values });
    },

    async onEvent(event) {
      const p = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'range-set': {
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const remaining = num(p?.remaining);
          if (lo === null || hi === null || remaining === null) return;
          stage.setRange({ lo, hi });
          stage.setSpanLabel(spanLabel(remaining));
          stage.setCaption(
            tr('caption.start', 'A sorted range of {n}. Looking for {target}.', {
              n: total,
              target,
            }),
          );
          return;
        }

        case 'probe': {
          const index = num(p?.index);
          const value = num(p?.value);
          const remaining = num(p?.remaining);
          if (index === null || value === null || remaining === null) return;
          stage.setCaption(
            tr('caption.probe', '{n} candidates left. The middle one is {mid}.', {
              n: remaining,
              mid: value,
            }),
          );
          await stage.probe({ index });
          return;
        }

        case 'narrow': {
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const value = num(p?.value);
          const swept = num(p?.swept);
          const remaining = num(p?.remaining);
          const removed = numArray(p?.removed);
          const rel = typeof p?.cmp === 'string' ? REL_GLYPH[p.cmp] : undefined;
          if (lo === null || hi === null || value === null) return;
          if (swept === null || remaining === null || rel === undefined) return;
          stage.setCaption(
            tr(
              'caption.narrow',
              '{mid} {rel} {target} — {swept} candidates leave at once. {left} left.',
              { mid: value, rel, target, swept, left: remaining },
            ),
          );
          await stage.narrow({ lo, hi, removed, sweptLabel: goneLabel(swept) });
          stage.setSpanLabel(spanLabel(remaining));
          return;
        }

        case 'found': {
          const index = num(p?.index);
          const value = num(p?.value);
          const swept = num(p?.swept);
          const remaining = num(p?.remaining);
          const removed = numArray(p?.removed);
          if (index === null || value === null || swept === null || remaining === null) return;
          stage.setCaption(
            tr('caption.found', '{mid} = {target}. Found — the other {swept} leave. {left} left.', {
              mid: value,
              target,
              swept,
              left: remaining,
            }),
          );
          await stage.found({ index, removed, sweptLabel: goneLabel(swept) });
          stage.setSpanLabel(spanLabel(remaining));
          return;
        }

        case 'done': {
          const comparisons = num(p?.comparisons);
          const initialRemaining = num(p?.initialRemaining);
          const remaining = num(p?.remaining);
          if (comparisons === null || initialRemaining === null || remaining === null) return;
          stage.setCaption(
            tr('caption.done', '{comparisons} comparisons cut {n} candidates down to {left}.', {
              comparisons,
              n: initialRemaining,
              left: remaining,
            }),
          );
          return;
        }

        case 'rewind': {
          stage.reset();
          return;
        }

        default:
          // 이 algorithm 은 위 여섯 가지만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage.reset();
    },
  };
};
