/**
 * severalHashesOneValue 의 번역기.
 *
 * 걸음마다 오는 payload 를 좁혀 stage 로 넘기고 (C9), 캡션은 키로 조회해
 * 문안을 얹는다 (C10). 시각 상태는 stage 가 지니므로 여기서는 아무것도 기억하지
 * 않는다.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

type Stage = {
  setCaption?: (text: string) => void;
  showKey?: (v: { row: number; key: string; h1: number; h2: number }) => Promise<void> | void;
  splitBranches?: (v: { row: number; slots: number[] }) => Promise<void> | void;
  markShared?: (v: { slot: number }) => Promise<void> | void;
  sweepResult?: () => Promise<void> | void;
  rewind?: () => Promise<void> | void;
  clear?: () => void;
};

/** 열린 payload 를 들여다보기 전에 한 번 막는다. 필드는 아래에서 하나씩 거른다. */
function fields(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

function num(src: Record<string, unknown>, key: string): number {
  const v = src[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(src: Record<string, unknown>, key: string): string {
  const v = src[key];
  return typeof v === 'string' ? v : '';
}

function nums(src: Record<string, unknown>, key: string): number[] {
  const v = src[key];
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

export const severalHashesOneValueProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  function say(text: string): void {
    stage?.setCaption?.(text);
  }

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'key-enters': {
          const key = str(p, 'key');
          say(tr('caption.key', 'Inserting {key}. Two base hashes set the slots.', { key }));
          await stage?.showKey?.({ row: num(p, 'row'), key, h1: num(p, 'h1'), h2: num(p, 'h2') });
          return;
        }

        case 'branches-split': {
          const slots = nums(p, 'slots');
          say(
            tr('caption.split', 'One value splits. Branches: {k}. Slots lit: {slots}.', {
              k: slots.length,
              slots: slots.join(' · '),
            }),
          );
          await stage?.splitBranches?.({ row: num(p, 'row'), slots });
          return;
        }

        case 'slot-shared': {
          const slot = num(p, 'slot');
          say(tr('caption.shared', 'Slot already at 1: {slot}. It stays 1.', { slot }));
          await stage?.markShared?.({ slot });
          return;
        }

        case 'done': {
          say(
            tr('caption.done', 'Bits on: {on} of {total}.', {
              on: num(p, 'onCount'),
              total: num(p, 'total'),
            }),
          );
          await stage?.sweepResult?.();
          return;
        }

        case 'rewind': {
          say(tr('caption.rewind', 'Back to an empty array.'));
          await stage?.rewind?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 내보내지 않는다. 와도 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.clear?.();
    },
  };
};
