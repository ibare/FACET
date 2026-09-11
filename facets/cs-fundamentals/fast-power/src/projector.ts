/**
 * fastPowerProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 들고 `runtime.t` 로 조회하며 원본은
 * `facet.ts` 의 `messages` 에 있다 (C10). payload 는 열린 타입이므로 가드로 좁혀
 * 정형 객체만 stage 로 넘긴다 (C9).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드. 없는 메서드와도 견디도록 전부 optional 이다. */
type PowerStage = {
  begin?(a: { base: number; exponent: number; slow: number }): Promise<void>;
  square?(a: { row: number; place: number; mults: number }): Promise<void>;
  take?(a: { row: number; place: number; mults: number }): Promise<void>;
  skip?(a: { row: number; place: number; mults: number }): Promise<void>;
  verdict?(a: { fast: number; slow: number; saved: number }): Promise<void>;
  setCaption?(value: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 0/1 배열을 큰 자리부터 이은 이진 표기로. */
function bitsOf(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((bit) => (num(bit) === 1 ? '1' : '0')).join('');
}

export const fastPowerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PowerStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  // begin 이 알려 준 이번 판의 밑. 뒤따르는 캡션들이 이것을 참조한다.
  let base = 0;

  return {
    onInit() {
      // initialData 를 여기서 다시 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가
      // 이미 했다. 되돌린 직후에도 algorithm 이 곧바로 begin 을 내보낸다.
      panel?.clearHighlight?.();
      stage?.reset?.();
    },

    onReset() {
      panel?.clearHighlight?.();
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'phase': {
          panel?.highlightPhase?.(str(p?.phase));
          return;
        }

        case 'begin': {
          const b = num(p?.base);
          const exponent = num(p?.exponent);
          const slow = num(p?.slow);
          if (b === null || exponent === null || slow === null) return;
          base = b;
          stage?.setCaption?.(
            tr(
              'caption.begin',
              'The target is {base} to the {exponent}. Multiplying one at a time costs {slow} multiplications.',
              { base, exponent, slow },
            ),
          );
          await stage?.begin?.({ base, exponent, slow });
          return;
        }

        case 'square': {
          const row = num(p?.row);
          const place = num(p?.place);
          const mults = num(p?.mults);
          if (row === null || place === null || mults === null) return;
          stage?.setCaption?.(
            tr(
              'caption.square',
              'Squaring once more reaches {base} to the {place}. That is one multiplication, and the reach doubles.',
              { base, place },
            ),
          );
          await stage?.square?.({ row, place, mults });
          return;
        }

        case 'take': {
          const row = num(p?.row);
          const place = num(p?.place);
          const mults = num(p?.mults);
          if (row === null || place === null || mults === null) return;
          stage?.setCaption?.(
            tr(
              'caption.take',
              'The digit is 1, so the answer takes {base} to the {place}. Multiplications so far: {mults}.',
              { base, place, mults },
            ),
          );
          await stage?.take?.({ row, place, mults });
          return;
        }

        case 'skip': {
          const row = num(p?.row);
          const place = num(p?.place);
          const mults = num(p?.mults);
          if (row === null || place === null || mults === null) return;
          stage?.setCaption?.(
            tr(
              'caption.skip',
              'The digit is 0, so the answer takes nothing here. Multiplications so far: {mults}.',
              { mults },
            ),
          );
          await stage?.skip?.({ row, place, mults });
          return;
        }

        case 'verdict': {
          const exponent = num(p?.exponent);
          const fast = num(p?.fast);
          const slow = num(p?.slow);
          const saved = num(p?.saved);
          const bits = bitsOf(p?.bits);
          if (exponent === null || fast === null || slow === null || saved === null) return;
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              'Exponent {exponent} is {bits} in binary. Fast {fast} multiplications against simple {slow} — saved {saved}.',
              { exponent, bits, fast, slow, saved },
            ),
          );
          await stage?.verdict?.({ fast, slow, saved });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.waiting', 'Move the exponent and watch what the saving becomes.'),
          );
          return;
        }

        default:
          // 그 밖의 어휘는 이 facet 이 내보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
