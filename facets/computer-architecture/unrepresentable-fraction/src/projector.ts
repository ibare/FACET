/**
 * unrepresentable-fraction projector — 걸음을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. `typeof` 가드로 정형 객체를 조립해 stage 가
 * 필요한 만큼만 넘긴다 (C9). 캡션의 문안은 `runtime.t` 로 짓고 코드에는 키와
 * en 원본만 남는다 (C10) — 문안 자체는 `facet.ts` 의 `messages` 에 있다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드가 있어도 `?.()` 로 견딘다. */
type FractionStage = {
  reset?(): void;
  seed?(p: { rest: string }): Promise<void> | void;
  peel?(p: { from: number; to: number; digit: string; rest: string }): Promise<void> | void;
  closeLoop?(p: { from: number; to: number }): Promise<void> | void;
  lap?(p: { digits: string }): Promise<void> | void;
  cut?(p: { keep: number; flipAt: number; flipTo: string }): Promise<void> | void;
  finish?(): Promise<void> | void;
  setCaption?(text: string): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export const unrepresentableFractionProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as FractionStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const say = (text: string): void => {
    stage?.setCaption?.(text);
  };

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'seed': {
          const rest = readText(p?.rest);
          say(
            tr('caption.seed', 'Start from {rest}. Multiply by 2 and peel off one digit.', {
              rest,
            }),
          );
          await stage?.seed?.({ rest });
          return;
        }

        case 'peel': {
          const from = readInt(p?.from);
          const to = readInt(p?.to);
          const digit = readText(p?.digit);
          const rest = readText(p?.rest);
          say(
            tr(
              'caption.peel',
              '{from} × 2 = {product} — the digit taken is {digit}, and what is left is {rest}.',
              {
                from: readText(p?.fromText),
                product: readText(p?.productText),
                digit,
                rest,
              },
            ),
          );
          await stage?.peel?.({ from, to, digit, rest });
          return;
        }

        case 'repeat-found': {
          const from = readInt(p?.from);
          const to = readInt(p?.to);
          say(
            tr('caption.repeat', 'This remainder has appeared before: {rest}. The pattern closes here.', {
              rest: readText(p?.rest),
            }),
          );
          await stage?.closeLoop?.({ from, to });
          return;
        }

        case 'lap': {
          const digits = readText(p?.digits);
          say(tr('caption.lap', 'Around the loop again: {digits}. It never ends.', { digits }));
          await stage?.lap?.({ digits });
          return;
        }

        case 'cut': {
          const keep = readInt(p?.keep);
          say(
            tr(
              'caption.cut',
              'float32 holds only this many digits: {keep}. The rest is cut off, and the last digit rounds up.',
              { keep },
            ),
          );
          await stage?.cut?.({
            keep,
            flipAt: readInt(p?.flipAt),
            flipTo: readText(p?.flipTo),
          });
          return;
        }

        case 'done': {
          say(
            tr('caption.done', 'This value has no end in base 2: {value}. What is stored is the cut value.', {
              value: readText(p?.value),
            }),
          );
          await stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 이 algorithm 은 위 일곱만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
