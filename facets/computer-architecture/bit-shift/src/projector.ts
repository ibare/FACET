/**
 * 자리 옮기기 projector — payload 를 좁혀 stage 로 넘긴다 (C9).
 *
 * 화면 문안을 고르는 것도 여기다. algorithm 은 무슨 일이 일어났는지만 말하고
 * (어느 방향 · 몇 칸 · 떨어져 나간 비트가 있었는가), 그것을 무슨 말로 부를지는
 * 표현 계층의 일이다 (C10).
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';

/** stage 가 한 걸음을 그리는 데 필요한 것 전부. */
type StageFrame = {
  dir: 'left' | 'right';
  start: number;
  shiftCount: number;
  value: number;
  bits: string;
  factor: number;
  exact: number;
  dropped: number;
  caption: string;
};

type Frame = Omit<StageFrame, 'caption'>;

/** stage 의 계약. 없는 메서드를 부르지 않도록 전부 optional 로 받는다 (C9). */
type BitShiftStage = {
  place?(frame: StageFrame): Promise<void> | void;
  shift?(frame: StageFrame): Promise<void> | void;
  clear?(): void;
};

/**
 * 이벤트 payload 를 정형 객체로 좁힌다.
 *
 * `as Record<string, unknown>` 뒤에 필드마다 `typeof` 를 세운 좁히개이므로 타입
 * 힌트 회피가 아니다 (C9).
 */
function readFrame(raw: unknown): Frame | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const { dir, start, shiftCount, value, bits, factor, exact, dropped } = p;
  if (dir !== 'left' && dir !== 'right') return null;
  if (typeof bits !== 'string' || !/^[01]+$/.test(bits)) return null;
  if (
    typeof start !== 'number' ||
    typeof shiftCount !== 'number' ||
    typeof value !== 'number' ||
    typeof factor !== 'number' ||
    typeof exact !== 'number' ||
    typeof dropped !== 'number'
  ) {
    return null;
  }
  return { dir, start, shiftCount, value, bits, factor, exact, dropped };
}

/**
 * 지금 화면에서 무슨 일이 일어나는지만 말한다. 개념을 설명하는 상시 캡션은 두지
 * 않는다 — 그것은 바로 위 글이 이미 한 말이다 (S-piece).
 */
function captionOf(f: Frame, tr: Translate): string {
  if (f.shiftCount === 0) {
    return f.dir === 'left'
      ? tr('caption.start', '{bits} bits hold {value}.', { bits: f.bits.length, value: f.value })
      : tr('caption.turn', 'The other way now. {bits} bits hold {value}.', {
          bits: f.bits.length,
          value: f.value,
        });
  }
  if (f.dir === 'left') {
    return tr('caption.left', 'One slot left — every place doubles. Now {value}.', {
      value: f.value,
    });
  }
  if (f.dropped === 1) {
    return tr(
      'caption.dropped',
      'The last bit ran off the end. Exact division gives {exact}, what is left is {value}.',
      { exact: f.exact, value: f.value },
    );
  }
  return tr('caption.right', 'One slot right — every place halves. Now {value}.', {
    value: f.value,
  });
}

export const bitShiftProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BitShiftStage | undefined;
  // 러너 밖에서 띄울 때를 위한 fallback. 러너가 주면 저작자 문안이 얹힌 쪽이다 (C10).
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'rewind':
          stage?.clear?.();
          return;
        case 'place':
        case 'shift': {
          const f = readFrame(event.payload);
          if (!f) return;
          const frame: StageFrame = { ...f, caption: captionOf(f, tr) };
          if (event.type === 'place') await stage?.place?.(frame);
          else await stage?.shift?.(frame);
          return;
        }
        default:
          // 이 facet 의 algorithm 은 위 셋만 낸다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },
    onReset() {
      stage?.clear?.();
    },
  };
};
