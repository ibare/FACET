/**
 * bad-char-skip projector — 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). `initialData` 는 다시 좁히지 않는다 —
 * 그것을 받는 자리는 stage 의 mount 다 (S-piece).
 *
 * 캡션 문안은 키로만 다룬다 (C10). 어느 키를 고를지는 이벤트가 말해 준다 —
 * 끝 글자부터 어긋났는지, 몇 글자 맞다가 어긋났는지, 어긋난 글자가 표에
 * 있는지 없는지.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  scan?(p: { at: number; matched: number; mismatchAt: number | null }): Promise<void> | void;
  skip?(p: { from: number; to: number; lastIndex: number }): Promise<void> | void;
  found?(p: { at: number }): Promise<void> | void;
  reset?(): void;
  setCaption?(text: string): void;
};

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const badCharSkipProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      // 오픈 타입을 한 번만 단언하고, 필드는 아래에서 typeof 로 거른다 (C9).
      const p = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'scan': {
          const at = num(p?.at);
          const matched = num(p?.matched);
          const mismatchAt = typeof p?.mismatchAt === 'number' ? p.mismatchAt : null;
          const ch = str(p?.mismatchChar);
          await stage.scan?.({ at, matched, mismatchAt });
          if (mismatchAt === null) {
            stage.setCaption?.(
              tr('caption.allMatch', 'All {n} letters match.', { n: matched }),
            );
          } else if (matched === 0) {
            stage.setCaption?.(
              tr('caption.missAtEnd', 'The last letter already differs: {ch}', { ch }),
            );
          } else {
            stage.setCaption?.(
              tr(
                'caption.missAfter',
                'Matched from the right: {n}. Then this letter breaks it: {ch}',
                { n: matched, ch },
              ),
            );
          }
          break;
        }

        case 'skip': {
          const from = num(p?.from);
          const to = num(p?.to);
          const lastIndex = num(p?.lastIndex, -1);
          const ch = str(p?.badChar);
          // 왜 뛰는지를 먼저 말하고 나서 뛴다 (원인 → 결과).
          stage.setCaption?.(
            lastIndex >= 0
              ? tr(
                  'caption.skipKnown',
                  '{ch} last stands in the pattern at {last}, so the slide is only {n}',
                  { ch, last: lastIndex, n: to - from },
                )
              : tr(
                  'caption.skipNone',
                  '{ch} is nowhere in the pattern, so nothing can overlap it. Cells jumped: {n}',
                  { ch, n: to - from },
                ),
          );
          await stage.skip?.({ from, to, lastIndex });
          break;
        }

        case 'found': {
          const at = num(p?.at);
          await stage.found?.({ at });
          stage.setCaption?.(
            tr('caption.found', 'The whole pattern matches. Position: {at}', { at }),
          );
          break;
        }

        case 'rewind': {
          stage.reset?.();
          break;
        }

        default:
          // 그 밖의 이벤트는 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage.reset?.();
    },
  };
};
