/**
 * silentTruncation projector — 발신을 stage 메서드 호출로 옮기는 유일한 번역기.
 *
 * payload 는 여기서 좁혀 정형 객체로 넘긴다 (C9). event.payload 를 그대로
 * 흘려보내지 않는다.
 *
 * 화면 문안은 키와 en 원본만 코드에 남고 문안 자체는 facet.ts 의 messages 에
 * 있다 (C10). 그래서 캡션 키는 payload 가 실어 오는 것이 아니라 이벤트 종류마다
 * 이 자리에 리터럴로 적혀 있다.
 *
 * initialData 를 좁히는 것은 stage 의 mount 이므로 onInit 을 두지 않는다 (S-piece).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 메서드 계약. */
type TruncationStage = {
  offer(o: { value: number; bits: string }): Promise<void>;
  pour(o: { lost: number }): Promise<void>;
  truncate(o: { kept: number }): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

export const silentTruncationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TruncationStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'value-offered': {
          const p = event.payload as { value?: unknown; bits?: unknown; from?: unknown } | undefined;
          const value = typeof p?.value === 'number' ? p.value : 0;
          const bits = typeof p?.bits === 'string' ? p.bits : '';
          const from = typeof p?.from === 'number' ? p.from : 0;
          stage.setCaption(tr('caption.offer', 'Counted in {from} bits: {value}.', { from, value }));
          await stage.offer({ value, bits });
          break;
        }

        case 'poured': {
          const p = event.payload as { width?: unknown; over?: unknown; lost?: unknown } | undefined;
          const width = typeof p?.width === 'number' ? p.width : 0;
          const over = typeof p?.over === 'number' ? p.over : 0;
          const lost = typeof p?.lost === 'number' ? p.lost : 0;
          stage.setCaption(
            tr('caption.pour', 'The bowl takes only {width} bits. Hanging past the rim: {over}.', { width, over }),
          );
          await stage.pour({ lost });
          break;
        }

        case 'truncated': {
          const p = event.payload as { kept?: unknown; lost?: unknown } | undefined;
          const kept = typeof p?.kept === 'number' ? p.kept : 0;
          const lost = typeof p?.lost === 'number' ? p.lost : 0;
          stage.setCaption(
            tr('caption.truncate', 'What fell away was worth {lost}. What stayed is {kept}.', { lost, kept }),
          );
          await stage.truncate({ kept });
          break;
        }

        case 'rewind':
          stage.rewind();
          break;

        case 'done': {
          const p = event.payload as { results?: unknown } | undefined;
          const results = Array.isArray(p?.results)
            ? p.results.filter((v): v is number => typeof v === 'number')
            : [];
          stage.setCaption(
            tr('caption.done', 'No error, no warning at any step. What stayed: {results}.', {
              results: results.join(' · '),
            }),
          );
          break;
        }

        default:
          // 위 다섯이 이 algorithm 이 내보내는 전부다. 그 밖은 조용히 흘린다 (C2).
          break;
      }
    },

    onReset() {
      stage.rewind();
    },
  };
};
