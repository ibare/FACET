/**
 * splitUntilOne projector — 갈라짐 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁힌 뒤 stage 로 넘긴다 (C9).
 * stage 는 좁혀진 정형 객체만 받으며 event 를 알지 못한다.
 *
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 있고 정본은 `facet.ts` 의
 * `messages` 다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내놓는 계약. 없는 메서드가 있어도 견디도록 전부 선택. */
type SplitStage = {
  showRoot?(spec: { id: string; lo: number; hi: number; depth: number }): Promise<void> | void;
  split?(spec: {
    parentLo: number;
    parentHi: number;
    parentDepth: number;
    cutAfter: number;
    leftId: string;
    leftLo: number;
    leftHi: number;
    rightId: string;
    rightLo: number;
    rightHi: number;
  }): Promise<void> | void;
  settleLeaves?(ids: string[]): Promise<void> | void;
  setCaption?(text: string): void;
  rewind?(): void;
};

type AppearPayload = {
  groupId?: unknown;
  lo?: unknown;
  hi?: unknown;
  depth?: unknown;
};

type SplitPayload = {
  parentDepth?: unknown;
  parentLo?: unknown;
  parentHi?: unknown;
  cutAfter?: unknown;
  leftId?: unknown;
  leftLo?: unknown;
  leftHi?: unknown;
  rightId?: unknown;
  rightLo?: unknown;
  rightHi?: unknown;
};

type LeavesPayload = {
  groupIds?: unknown;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export const splitUntilOneProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SplitStage | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let valueCount = 0;

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { values?: unknown } | undefined;
      valueCount = Array.isArray(d?.values) ? d.values.length : 0;
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'group-appear': {
          const p = event.payload as AppearPayload | undefined;
          const id = str(p?.groupId);
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const depth = num(p?.depth);
          if (id === null || lo === null || hi === null || depth === null) return;
          stage?.setCaption?.(
            tr('caption.whole', 'All {n} values sit in one group. Nothing has been compared.', {
              n: valueCount,
            }),
          );
          await stage?.showRoot?.({ id, lo, hi, depth });
          return;
        }

        case 'split': {
          const p = event.payload as SplitPayload | undefined;
          const parentDepth = num(p?.parentDepth);
          const parentLo = num(p?.parentLo);
          const parentHi = num(p?.parentHi);
          const cutAfter = num(p?.cutAfter);
          const leftId = str(p?.leftId);
          const leftLo = num(p?.leftLo);
          const leftHi = num(p?.leftHi);
          const rightId = str(p?.rightId);
          const rightLo = num(p?.rightLo);
          const rightHi = num(p?.rightHi);
          if (
            parentDepth === null ||
            parentLo === null ||
            parentHi === null ||
            cutAfter === null ||
            leftId === null ||
            leftLo === null ||
            leftHi === null ||
            rightId === null ||
            rightLo === null ||
            rightHi === null
          ) {
            return;
          }
          stage?.setCaption?.(
            parentDepth === 0
              ? tr('caption.split', 'The group is cut in half. No value moves — only a boundary.')
              : tr('caption.splitAgain', 'Each half is cut again. The left-to-right order still holds.'),
          );
          await stage?.split?.({
            parentLo,
            parentHi,
            parentDepth,
            cutAfter,
            leftId,
            leftLo,
            leftHi,
            rightId,
            rightLo,
            rightHi,
          });
          return;
        }

        case 'leaves-reached': {
          const p = event.payload as LeavesPayload | undefined;
          const raw = p?.groupIds;
          const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
          stage?.setCaption?.(
            tr(
              'caption.leaves',
              'Each group holds one value — already in order, nothing left to cut.',
            ),
          );
          await stage?.settleLeaves?.(ids);
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 이 algorithm 이 발신하는 이벤트는 위 넷이 전부다. 그 밖의 것은
          // 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
