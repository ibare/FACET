/**
 * match-from-back projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). stage 는 수와 참거짓만 받고
 * `event.payload` 자체는 보지 않는다.
 *
 * 캡션 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와 en 원본만 남는다
 * (C10). 어느 캡션을 띄울지는 표현 계층의 판단이라 — 뒤에서 한 번에 끝난 자리와
 * 네 글자 맞다가 어긋난 자리는 같은 사실을 다르게 말해야 한다 — `tailMatched` 를
 * 보고 여기서 가른다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 화면에서도 죽지 않게 optional 로 받는다. */
type Stage = {
  setCaption(text: string): void;
  land(shift: number): Promise<void>;
  compare(shift: number, patIndex: number, matched: boolean): Promise<void>;
  reject(shift: number, tailMatched: number): Promise<void>;
  accept(shift: number): Promise<void>;
  dropUnread(): Promise<void>;
  rewind(): void;
};

/** payload 좁히개 — 아래에서 필드마다 `typeof` 로 거른다 (C9). */
function fields(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as Record<string, unknown>;
}

function readNum(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const matchFromBackProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'land': {
          const shift = readNum(p.shift);
          stage?.setCaption(
            tr('caption.land', 'The pattern is lined up at position {shift}.', { shift }),
          );
          await stage?.land(shift);
          return;
        }

        case 'probe': {
          await stage?.compare(readNum(p.shift), readNum(p.patIndex), p.matched === true);
          return;
        }

        case 'reject': {
          const tailMatched = readNum(p.tailMatched);
          stage?.setCaption(
            tailMatched === 0
              ? tr(
                  'caption.killedAtOnce',
                  'One comparison at the back rules this position out. Characters left unread: {unread}.',
                  { unread: readNum(p.unread) },
                )
              : tr(
                  'caption.brokeAfterTail',
                  'The back matches for a while, then breaks. Characters matched: {matched}.',
                  { matched: tailMatched },
                ),
          );
          await stage?.reject(readNum(p.shift), tailMatched);
          return;
        }

        case 'found': {
          const shift = readNum(p.shift);
          stage?.setCaption(
            tr(
              'caption.found',
              'Every character matches from the back. The pattern sits at position {shift}.',
              { shift },
            ),
          );
          await stage?.accept(shift);
          return;
        }

        case 'done': {
          stage?.setCaption(
            tr(
              'caption.tally',
              'Comparisons made: {comparisons}. Characters never looked at: {never}.',
              { comparisons: readNum(p.comparisons), never: readNum(p.never) },
            ),
          );
          await stage?.dropUnread();
          return;
        }

        case 'rewind': {
          stage?.rewind();
          return;
        }

        default:
          // 이 조각의 algorithm 은 위 여섯 가지만 발신한다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
