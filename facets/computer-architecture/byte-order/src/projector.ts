/**
 * byteOrder 의 번역기 — 이벤트를 판 위의 동작으로 옮긴다.
 *
 * payload 는 좁혀서 넘긴다 (C9). `event.payload` 를 그대로 stage 로 밀지 않고
 * 여기서 가드를 거쳐 정형으로 세운 뒤, stage 는 필수 필드 타입으로 받는다.
 *
 * 문안은 키만 여기 있고 문장은 `facet.ts` 의 messages 에 있다 (C10). 호출부의
 * en 원본은 선언의 en 과 글자까지 같아야 한다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 이 조각의 판만 가진 메서드다. */
type ByteOrderStage = {
  showValue(bytes: number[]): Promise<void>;
  layBig(slots: number[]): Promise<void>;
  layLittle(slots: number[]): Promise<void>;
  readBoth(big: number, little: number): Promise<void>;
  misread(value: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

/** 바이트 배열로만 받는다. 하나라도 수가 아니면 통째로 버린다. */
function toBytes(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

function toNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export const byteOrderProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ByteOrderStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      if (!stage) return;
      // 단언 뒤에 검사가 따른다 — 꺼낸 값은 하나씩 typeof 로 거른다 (C9).
      const p = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'value-shown': {
          const bytes = toBytes(p.bytes);
          if (!bytes) return;
          stage.setCaption(
            tr('caption.value', 'One number, written the way people write it: the biggest part first.'),
          );
          await stage.showValue(bytes);
          return;
        }
        case 'laid-big': {
          const slots = toBytes(p.slots);
          if (!slots) return;
          stage.setCaption(tr('caption.big', 'big-endian puts the biggest byte at the lowest address.'));
          await stage.layBig(slots);
          return;
        }
        case 'laid-little': {
          const slots = toBytes(p.slots);
          if (!slots) return;
          stage.setCaption(
            tr('caption.little', 'little-endian puts the smallest byte at the lowest address. Same bytes, opposite order.'),
          );
          await stage.layLittle(slots);
          return;
        }
        case 'read-both': {
          const big = toNumber(p.big);
          const little = toNumber(p.little);
          if (big === null || little === null) return;
          stage.setCaption(
            tr('caption.same', 'Read each layout by its own rule and the number that comes back is the same.'),
          );
          await stage.readBoth(big, little);
          return;
        }
        case 'misread': {
          const value = toNumber(p.value);
          if (value === null) return;
          stage.setCaption(
            tr('caption.misread', 'Read the little-endian bytes as big-endian instead: a different number.'),
          );
          await stage.misread(value);
          return;
        }
        case 'rewind': {
          stage.reset();
          return;
        }
        default:
          // 이 조각은 위 여섯만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset();
    },
  };
};
