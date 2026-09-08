/**
 * parent-two-children projector — 갈라짐 이벤트를 stage view 호출로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. typeof / Array.isArray 로 정형 객체를 조립해
 * 좁힌 뒤 stage 에 넘기고, stage 는 필수 필드 타입으로 받는다 (C9).
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 있고 문안은 FacetJson.messages 에
 * 선언되어 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage view 의 호출 계약. 열린 ViewInstance 를 이 형태로 좁혀 쓴다 (C9). */
type Stage = {
  init?(tree: { root: string; nodes: { id: string; left: string | null; right: string | null }[] }): void;
  setCaption?(text: string): void;
  placeRoot?(id: string): Promise<void>;
  split?(parent: string, left: string | null, right: string | null): Promise<void>;
  rejectSwap?(child: string, parent: string): Promise<void>;
  clear?(): void;
};

type TreeLink = { id: string; left: string | null; right: string | null };

function readLinks(raw: unknown): TreeLink[] {
  if (!Array.isArray(raw)) return [];
  const out: TreeLink[] = [];
  for (const item of raw) {
    const n = item as { id?: unknown; left?: unknown; right?: unknown };
    if (typeof n?.id !== 'string') continue;
    out.push({
      id: n.id,
      left: typeof n.left === 'string' ? n.left : null,
      right: typeof n.right === 'string' ? n.right : null,
    });
  }
  return out;
}

export const parentTwoChildrenProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let rootId = '';

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { root?: unknown; nodes?: unknown } | undefined;
      rootId = typeof d?.root === 'string' ? d.root : '';
      stage?.init?.({ root: rootId, nodes: readLinks(d?.nodes) });
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'root-placed': {
          const p = event.payload as { id?: unknown } | undefined;
          const id = typeof p?.id === 'string' ? p.id : rootId;
          if (id === '') return;
          stage?.setCaption?.(tr('caption.seat', 'It starts with one seat.'));
          await stage?.placeRoot?.(id);
          return;
        }

        case 'split': {
          const p = event.payload as
            | { parent?: unknown; left?: unknown; right?: unknown }
            | undefined;
          const parent = typeof p?.parent === 'string' ? p.parent : '';
          if (parent === '') return;
          const left = typeof p?.left === 'string' ? p.left : null;
          const right = typeof p?.right === 'string' ? p.right : null;

          if (left !== null && right !== null) {
            stage?.setCaption?.(
              parent === rootId
                ? tr('caption.splitRoot', 'One seat, two branches reaching down — a left and a right.')
                : tr('caption.splitAgain', 'Each new seat splits the same way: at most two, downward.'),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.splitOne', 'Even a single child has a side. The other seat opens and stays empty.'),
            );
          }
          await stage?.split?.(parent, left, right);
          return;
        }

        case 'sides-fixed': {
          const p = event.payload as { child?: unknown; parent?: unknown } | undefined;
          const child = typeof p?.child === 'string' ? p.child : '';
          const parent = typeof p?.parent === 'string' ? p.parent : '';
          if (child === '' || parent === '') return;
          stage?.setCaption?.(
            tr('caption.sidesFixed', 'Left and right are different names — they cannot trade places.'),
          );
          await stage?.rejectSwap?.(child, parent);
          return;
        }

        case 'rewind': {
          stage?.clear?.();
          return;
        }

        default:
          // 이 조각의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.clear?.();
    },
  };
};
