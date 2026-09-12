/**
 * boundary-shift projector — 알고리즘의 걸음을 stage 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 화면 문안은 키로 조회해 (`runtime.t`)
 * 완성된 문자열만 stage 에 준다 — stage 는 무슨 말을 할지 모른다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, Translate } from '@ffacet/core/runtime';

/**
 * 낱말 끝표식. algorithm 이 배운 어휘의 일부라 이 자리에서만 다룬다 — stage 는
 * 알고리즘의 어휘를 몰라야 하므로 (원칙 1), 표식을 떼어 `end` 로 번역해 넘긴다.
 */
const END_MARK = '</w>';

/** stage 가 받는 조각 하나 — 글자와, 그 조각이 낱말의 끝을 물고 있는지. */
type StagePiece = { text: string; end: boolean };

type PiecesArg = { lane: number; word: string; pieces: StagePiece[] };
type SwapArg = { lane: number; index: number; letter: string };

type Stage = {
  setCaption?(text: string): void;
  reset?(): void;
  showWhole?(arg: PiecesArg): Promise<void> | void;
  swapLetter?(arg: SwapArg): Promise<void> | void;
  breakApart?(arg: PiecesArg): Promise<void> | void;
};

/**
 * payload 를 열어 보기 위한 좁히개. 뒤에 곧바로 `typeof` 검사가 따르므로
 * 타입 힌트 회피가 아니다 (C9).
 */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readPieces(value: unknown): StagePiece[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((raw) => ({
      text: raw.split(END_MARK).join(''),
      end: raw.endsWith(END_MARK),
    }));
}

export const boundaryShiftProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  // 러너는 늘 `runtime` 을 주입하므로 이 자리는 러너 밖 mount 에서만 쓰인다.
  // 그때 프레임워크 번들까지 보려면 en 원본을 그대로 돌려주는 것이 아니라
  // 조회기를 세워야 한다 — 저장소 225 중 217 이 이 꼴이다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'word-stands': {
          const word = readString(p.word);
          const pieces = readPieces(p.pieces);
          stage?.setCaption?.(
            tr('caption.whole', '"{word}" — pieces: {n}. It holds together.', {
              word,
              n: pieces.length,
            }),
          );
          await stage?.showWhole?.({ lane: readNumber(p.lane), word, pieces });
          return;
        }

        case 'letter-swapped': {
          stage?.setCaption?.(
            tr('caption.swap', 'One letter changes: "{from}" becomes "{to}".', {
              from: readString(p.from),
              to: readString(p.to),
            }),
          );
          await stage?.swapLetter?.({
            lane: readNumber(p.lane),
            index: readNumber(p.index),
            letter: readString(p.letter),
          });
          return;
        }

        case 'boundary-broken': {
          const word = readString(p.word);
          const pieces = readPieces(p.pieces);
          stage?.setCaption?.(
            tr('caption.shatter', 'The boundary gives way — pieces: {n}.', {
              n: pieces.length,
            }),
          );
          await stage?.breakApart?.({ lane: readNumber(p.lane), word, pieces });
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', 'One letter apart, yet the cuts fall differently.'),
          );
          return;
        }

        default:
          // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
