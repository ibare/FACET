/**
 * asymptoticProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 들고 `runtime.t` 로 조회하며 원본은 `facet.ts` 의
 * `messages` 에 있다 (C10). payload 는 열린 타입이므로 가드로 좁혀 정형 객체만
 * stage 로 넘긴다 (C9).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import { groupDigits, type AsymptoticTiling } from './asymptotic-stage.js';

/** stage 가 노출하는 메서드. 없는 메서드와도 견디도록 전부 optional 이다. */
type Stage = {
  setBoard?(sizes: number[]): Promise<void>;
  setSize?(a: { index: number; n: number; logBits: number }): Promise<void>;
  tileCross?(a: AsymptoticTiling): Promise<void>;
  tileSame?(a: AsymptoticTiling): Promise<void>;
  verdict?(a: { index: number; gap: number }): Promise<void>;
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

function sizesOf(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const n = num(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** 두 자가 같은 규칙으로 나뉘므로 좁히개도 하나다. */
function tilingOf(p: Record<string, unknown> | null): AsymptoticTiling | null {
  const index = num(p?.index);
  const n = num(p?.n);
  const tiles = num(p?.tiles);
  const remainder = num(p?.remainder);
  if (index === null || n === null || tiles === null || remainder === null) return null;
  return { index, n, tiles, remainder };
}

export const asymptoticProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit() {
      // initialData 를 여기서 다시 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가
      // 이미 했다. 되돌린 직후에도 algorithm 이 곧바로 board-set 을 내보낸다.
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

        case 'board-set': {
          const sizes = sizesOf(p?.sizes);
          if (!sizes) return;
          stage?.setCaption?.(
            tr(
              'caption.board',
              'Each bar is the bigger function, cut into pieces of the smaller one. The count of pieces is the ratio.',
            ),
          );
          await stage?.setBoard?.(sizes);
          return;
        }

        case 'size-set': {
          const index = num(p?.index);
          const n = num(p?.n);
          const logBits = num(p?.logBits);
          if (index === null || n === null || logBits === null) return;
          stage?.setCaption?.(
            // 크기는 **값으로 읽는 수**라 세 자리마다 끊는다. 낱개 수와 자릿값은
            // 세 자리를 넘지 않아 그대로 둔다 (숫자 표기의 두 층위).
            tr('caption.size', 'Size {n} takes {bits} binary digits, and that is its log factor.', {
              n: groupDigits(n),
              bits: logBits,
            }),
          );
          await stage?.setSize?.({ index, n, logBits });
          return;
        }

        case 'tile-cross': {
          const a = tilingOf(p);
          if (!a) return;
          stage?.setCaption?.(
            tr(
              'caption.cross',
              'At size {n} the bigger function holds {tiles} whole pieces of the smaller one.',
              { n: groupDigits(a.n), tiles: a.tiles },
            ),
          );
          await stage?.tileCross?.(a);
          return;
        }

        case 'tile-same': {
          const a = tilingOf(p);
          if (!a) return;
          stage?.setCaption?.(
            tr(
              'caption.same',
              'At size {n} it holds only {tiles}, and that count never changes.',
              { n: groupDigits(a.n), tiles: a.tiles },
            ),
          );
          await stage?.tileSame?.(a);
          return;
        }

        case 'verdict': {
          const index = num(p?.index);
          const n = num(p?.n);
          const crossTiles = num(p?.crossTiles);
          const sameTiles = num(p?.sameTiles);
          const gap = num(p?.gap);
          if (index === null || n === null || crossTiles === null || sameTiles === null) return;
          if (gap === null) return;
          stage?.setCaption?.(
            gap === 0
              ? tr(
                  'caption.verdictLevel',
                  'At size {n} both pairs give {cross}. A single size cannot tell the two classes apart.',
                  { n: groupDigits(n), cross: crossTiles, same: sameTiles },
                )
              : tr(
                  'caption.verdictSplit',
                  'At size {n} the same class still gives {same}, while the other pair has reached {cross}.',
                  { n: groupDigits(n), cross: crossTiles, same: sameTiles },
                ),
          );
          await stage?.verdict?.({ index, gap });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.waiting', 'Move the input size and watch which ratio refuses to move.'),
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
