/**
 * bottomUpTableProjector — 상향식 표 채우기 조각의 번역기.
 *
 * algorithm 이 보내는 것은 수와 자리뿐이다. 화면 문안은 여기서 `runtime.t` 로
 * 해석해 stage 로 넘긴다 (C10) — algorithm 은 translator 를 갖지 않는다.
 *
 * payload 는 `typeof` / `Array.isArray` 로 좁힌 뒤 정형 객체로 조립해 넘긴다.
 * stage 는 이미 좁혀진 값만 본다 (C9).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage view 의 호출 계약. 선택 메서드는 반드시 `?.()` 로 부른다 (C9). */
type BottomUpTableStage = {
  init?(cells: number): void;
  seedCell?(step: { index: number; value: number }, text: string): Promise<void> | void;
  fillCell?(
    step: {
      index: number;
      from: [number, number];
      values: [number, number];
      value: number;
    },
    text: string,
  ): Promise<void> | void;
  finish?(
    step: { keep: [number, number] },
    text: string,
    sub: string,
  ): Promise<void> | void;
  rewind?(): void;
};

type SeedPayload = { index?: unknown; value?: unknown };
type FillPayload = { index?: unknown; from?: unknown; values?: unknown; value?: unknown };
type DonePayload = { cells?: unknown; fills?: unknown; calls?: unknown; keep?: unknown };

/** 두 수의 쌍인지 확인하고 튜플로 좁힌다. */
function numberPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return [a, b];
}

export const bottomUpTableProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BottomUpTableStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown) {
      const data = initialData as { n?: unknown } | undefined;
      const n = typeof data?.n === 'number' ? data.n : 5;
      stage.init?.(n + 1);
    },

    async onEvent(event) {
      switch (event.type) {
        case 'seed': {
          const p = event.payload as SeedPayload | undefined;
          if (typeof p?.index !== 'number' || typeof p.value !== 'number') return;
          await stage.seedCell?.(
            { index: p.index, value: p.value },
            tr('caption.seed', 'T[{i}] = {v} — the definition hands over the bottom two cells', {
              i: p.index,
              v: p.value,
            }),
          );
          return;
        }

        case 'fill': {
          const p = event.payload as FillPayload | undefined;
          const from = numberPair(p?.from);
          const operands = numberPair(p?.values);
          if (!from || !operands) return;
          if (typeof p?.index !== 'number' || typeof p.value !== 'number') return;
          await stage.fillCell?.(
            { index: p.index, from, values: operands, value: p.value },
            tr(
              'caption.fill',
              'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — both values already sit to the left',
              {
                i: p.index,
                a: from[0],
                b: from[1],
                x: operands[0],
                y: operands[1],
                v: p.value,
              },
            ),
          );
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const keep = numberPair(p?.keep);
          if (!keep) return;
          const cells = typeof p?.cells === 'number' ? p.cells : 0;
          const fills = typeof p?.fills === 'number' ? p.fills : 0;
          const calls = typeof p?.calls === 'number' ? p.calls : 0;
          await stage.finish?.(
            { keep },
            tr(
              'caption.done',
              '{cells} cells filled left to right in {fills} additions — {calls} recursive calls',
              { cells, fills, calls },
            ),
            tr(
              'caption.doneNote',
              'Every cell looked only at the two before it, so keeping those two is enough',
            ),
          );
          return;
        }

        case 'rewind':
          stage.rewind?.();
          return;

        default:
          // 그 밖의 이벤트는 없다. 들어오면 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage.rewind?.();
    },
  };
};
