/**
 * scanUntilFound projector — 훑기 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번에 좁힌다. `typeof` 가드를 통과한
 * 값만 stage 로 넘어가고, stage 는 필수 필드 타입으로 받는다 (C9).
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 두고 문안은 `facet.ts` 의
 * `messages` 가 갖는다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 러너가 stage 를 못 붙였을 때를 위해 전부 optional. */
type ScanStage = {
  setCaption?(text: string): void;
  rewind?(): void;
  beginPass?(p: { pass: number; target: number }): Promise<void> | void;
  look?(p: { pass: number; index: number; seen: number }): Promise<void> | void;
  hit?(p: { pass: number; index: number; seen: number }): Promise<void> | void;
  overrun?(p: { pass: number; seen: number }): Promise<void> | void;
  conclude?(p: { stopped: number; exhausted: number }): Promise<void> | void;
};

type ScanPayload = {
  pass?: unknown;
  index?: unknown;
  target?: unknown;
  seen?: unknown;
  stopped?: unknown;
  exhausted?: unknown;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const scanUntilFoundProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ScanStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.rewind?.();
    },

    onReset(): void {
      stage?.rewind?.();
    },

    async onEvent(event): Promise<void> {
      const p = event.payload as ScanPayload | undefined;
      const pass = num(p?.pass);
      const index = num(p?.index);
      const target = num(p?.target);
      const seen = num(p?.seen);

      switch (event.type) {
        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'scan-begin': {
          if (pass === null || target === null) return;
          stage?.setCaption?.(tr('caption.looking', 'Looking for {target}.', { target }));
          await stage?.beginPass?.({ pass, target });
          return;
        }

        case 'highlight': {
          if (pass === null || index === null || seen === null) return;
          await stage?.look?.({ pass, index, seen });
          return;
        }

        case 'mark': {
          if (pass === null || index === null || seen === null) return;
          stage?.setCaption?.(
            tr('caption.found', 'Found it. {seen} cells looked at, then it stopped.', { seen }),
          );
          await stage?.hit?.({ pass, index, seen });
          return;
        }

        case 'overrun': {
          if (pass === null || seen === null) return;
          stage?.setCaption?.(
            tr(
              'caption.overrun',
              'Off the end. Saying "not here" took all {seen} — there was no place to give up.',
              { seen },
            ),
          );
          await stage?.overrun?.({ pass, seen });
          return;
        }

        case 'done': {
          const stopped = num(p?.stopped);
          const exhausted = num(p?.exhausted);
          if (stopped === null || exhausted === null) return;
          stage?.setCaption?.(
            tr('caption.gap', 'Stopping cost {stopped}. Answering "no" cost {exhausted}.', {
              stopped,
              exhausted,
            }),
          );
          await stage?.conclude?.({ stopped, exhausted });
          return;
        }

        // 그 밖의 이벤트는 이 조각이 발신하지 않는다. 들어오면 조용히 흘린다.
        default:
          return;
      }
    },
  };
};
