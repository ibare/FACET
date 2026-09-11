/**
 * leading-zeros-tell projector — 이벤트를 무대의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 화면 문안도 여기서 고른다 — 눈금이
 * 올라섰는가에 따라 캡션이 갈리고, 그 갈림을 정하는 것은 번역기를 쥔 쪽의
 * 일이다 (C10). 무대는 받은 문장을 그리기만 한다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** 무대가 내주는 표면. 없는 메서드를 불러도 깨지지 않게 전부 optional 이다. */
type Stage = {
  showKey?(view: {
    index: number;
    key: string;
    bits: string;
    rho: number;
    record: boolean;
    estimate: number;
    caption: string;
  }): Promise<void> | void;
  finish?(view: { estimate: number; caption: string }): Promise<void> | void;
  rewind?(): void;
};

type KeyRead = {
  index: number;
  key: string;
  bits: string;
  rho: number;
  record: boolean;
  estimate: number;
};

/** `key-read` 의 payload 를 정형 객체로 조립한다. 하나라도 어긋나면 버린다. */
function readKeyPayload(payload: unknown): KeyRead | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const { index, key, bits, rho, record, estimate } = p;
  if (
    typeof index !== 'number' ||
    typeof key !== 'string' ||
    typeof bits !== 'string' ||
    typeof rho !== 'number' ||
    typeof record !== 'boolean' ||
    typeof estimate !== 'number'
  ) {
    return null;
  }
  return { index, key, bits, rho, record, estimate };
}

/** `done` 의 payload. */
function readEstimate(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  return typeof p.estimate === 'number' ? p.estimate : null;
}

export const leadingZerosTellProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'key-read': {
          const view = readKeyPayload(event.payload);
          if (!view) return;
          const caption = view.record
            ? tr('caption.rise', 'The first 1 sits at {p}. Higher than the notch — it steps up.', {
                p: view.rho,
              })
            : tr('caption.stay', 'The first 1 sits at {p}. The notch stays.', { p: view.rho });
          await stage?.showKey?.({ ...view, caption });
          return;
        }
        case 'done': {
          const estimate = readEstimate(event.payload);
          if (estimate === null) return;
          const caption = tr(
            'caption.done',
            'Nothing was kept but the notch — distinct items, about {n}.',
            { n: estimate },
          );
          await stage?.finish?.({ estimate, caption });
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 이 조각은 위 셋만 발신한다. 다른 것이 와도 조용히 흘린다 (C2).
          return;
      }
    },
    onReset(): void {
      stage?.rewind?.();
    },
  };
};
