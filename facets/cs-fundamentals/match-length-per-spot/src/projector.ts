/**
 * matchLengthPerSpot projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다 (C9). stage 는 필수 필드
 * 타입으로 받으므로 event.payload 를 그대로 흘려보내지 않는다.
 * 화면 문안은 키로 조회하고 (C10) 원본은 facet.ts 의 messages 에 있다.
 */

import {
  makeTranslator,
  type ProjectorFactory,
  type ProjectorInstance,
  type Translate,
} from '@ffacet/core/runtime';

type ScanStep = {
  index: number;
  start: number;
  value: number;
  mismatch: boolean;
};

type BorrowStep = {
  index: number;
  from: number;
  value: number;
};

type WindowStep = {
  left: number;
  right: number;
};

type Stage = {
  setCaption?(text: string): void;
  showWhole?(step: { index: number; value: number }): Promise<void>;
  scan?(step: ScanStep): Promise<void>;
  borrow?(step: BorrowStep): Promise<void>;
  moveWindow?(step: WindowStep): Promise<void>;
  finish?(): Promise<void>;
  rewind?(): void;
};

/** 오픈 타입인 payload 를 필드별 런타임 가드로 읽기 위한 좁히개 (C9). */
function fields(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as Record<string, unknown>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const matchLengthPerSpotProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  const instance: ProjectorInstance = {
    async onEvent(event) {
      const p = fields(event.payload);

      switch (event.type) {
        case 'whole-prefix': {
          stage?.setCaption?.(
            tr('caption.whole', 'The front spot matches the whole string — its answer is the full length.'),
          );
          await stage?.showWhole?.({ index: num(p.index), value: num(p.value) });
          return;
        }

        case 'mirror': {
          stage?.setCaption?.(
            tr('caption.borrow', 'Inside the window. Borrow the answer from the mirror spot on the left.'),
          );
          await stage?.borrow?.({
            index: num(p.index),
            from: num(p.from),
            value: num(p.value),
          });
          return;
        }

        case 'scan': {
          const start = num(p.start);
          stage?.setCaption?.(
            start > 0
              ? tr('caption.extend', 'What was borrowed is certain. Keep comparing from the window edge on.')
              : tr('caption.outside', 'Outside the window. Compare the characters from the very front.'),
          );
          await stage?.scan?.({
            index: num(p.index),
            start,
            value: num(p.value),
            mismatch: p.mismatch === true,
          });
          return;
        }

        case 'window': {
          stage?.setCaption?.(
            tr('caption.window', 'The overlap reached farther right. Move the window over there.'),
          );
          await stage?.moveWindow?.({ left: num(p.left), right: num(p.right) });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', 'Every spot has its answer. The right end of the window never stepped back.'),
          );
          await stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 위 어휘 밖의 이벤트는 이 조각에 없다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset() {
      stage?.rewind?.();
    },
  };

  return instance;
};
