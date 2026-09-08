/**
 * shift-on-remove projector — 이벤트를 무대 메서드로 옮긴다.
 *
 * 옮기기 전에 payload 를 반드시 좁힌다. `event.payload` 는 설계상 열린 타입이므로
 * 구체형은 파일 상단에 모으고, 각 필드는 `typeof` 로 확인한 뒤에만 쓴다 (C9).
 *
 * 화면 문안은 여기서 만들지 않는다. algorithm 이 **키** 를 보내고 (C10) 이 파일이
 * `runtime.t` 로 풀어 무대에 넘긴다. en 원본은 조회하는 자리에 리터럴로 둔다.
 * 무대가 그리는 붙박이 문안(각주 · 구간 라벨 · 꼬리 표시) 도 여기서 풀어 넘긴다 —
 * 무대는 문자를 하나도 갖지 않는다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

/** 이 projector 가 무대에 요구하는 표면. */
type ShiftStage = {
  init(values: number[], usedText: string, text: { unused: string }): void;
  setCaption(text: string): void;
  lift(index: number): Promise<void>;
  pull(from: number, to: number): Promise<void>;
  settle(usedLength: number, usedText: string): Promise<void>;
};

type CaptionPayload = { textKey?: string; index?: number; moved?: number };
type RemovePayload = { index?: number };
type PullPayload = { from?: number; to?: number };
type SettlePayload = { usedLength?: number };
type SeedData = { values?: unknown };

export const shiftOnRemoveProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as ShiftStage;
  const tr = runtime?.t ?? makeTranslator();

  let values: number[] = [];

  const usedText = (n: number): string => tr('label.used', 'in use: {n}', { n });

  /** 처음 상태를 놓는다. mount · reset · rewind 가 같은 자리에서 시작하도록 한 곳에 둔다. */
  const seed = (): void => {
    stage.init(values, usedText(values.length), {
      unused: tr('label.unused', 'unused'),
    });
  };

  const captionText = (p: CaptionPayload): string | null => {
    switch (p.textKey) {
      case 'caption.intact':
        return tr('caption.intact', 'An array holds its values in a row with no gaps.');
      case 'caption.remove': {
        const index = typeof p.index === 'number' ? p.index : 0;
        return tr('caption.remove', 'Remove index {index}. That slot is now empty.', { index });
      }
      case 'caption.pull':
        return tr('caption.pull', 'Pull from the front, or a value would be overwritten.');
      case 'caption.result': {
        const moved = typeof p.moved === 'number' ? p.moved : 0;
        return tr(
          'caption.result',
          '{moved} values shifted one slot left. The tail slot is no longer used.',
          { moved },
        );
      }
      default:
        return null;
    }
  };

  return {
    onInit(initialData: unknown): void {
      const data = initialData as SeedData | undefined;
      const raw = data?.values;
      values = Array.isArray(raw) ? raw.filter((v): v is number => typeof v === 'number') : [];
      seed();
    },

    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'caption': {
          const p = event.payload as CaptionPayload | undefined;
          if (typeof p?.textKey !== 'string') return;
          const text = captionText(p);
          if (text !== null) stage.setCaption(text);
          return;
        }
        case 'remove': {
          const p = event.payload as RemovePayload | undefined;
          if (typeof p?.index !== 'number') return;
          return stage.lift(p.index);
        }
        case 'pull': {
          const p = event.payload as PullPayload | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number') return;
          return stage.pull(p.from, p.to);
        }
        case 'settle': {
          const p = event.payload as SettlePayload | undefined;
          if (typeof p?.usedLength !== 'number') return;
          return stage.settle(p.usedLength, usedText(p.usedLength));
        }
        case 'rewind':
          seed();
          return;
        default:
          // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      seed();
    },
  };
};
