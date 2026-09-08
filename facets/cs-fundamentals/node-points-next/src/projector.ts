/**
 * node-points-next projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다 (C9). stage 는 `unknown` 을 모르고 필수 필드
 * 타입만 받는다. 캡션 문안은 algorithm 이 보낸 **키**를 이 층에서 해석한다
 * (C10) — 문안은 facet.ts 의 messages 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type StageNode = { addr: string; value: number; next: string | null };

type Stage = {
  init?(data: {
    nodes: StageNode[];
    head: string;
    nodeBytes: number;
    valueBytes: number;
    addressBytes: number;
    orderLabel: string;
  }): void;
  rewind?(): void;
  setCaption?(text: string): void;
  placeNodes?(): Promise<void>;
  attachHead?(addr: string): Promise<void>;
  followPointer?(from: string, to: string): Promise<void>;
  endWithNull?(addr: string): Promise<void>;
  collectValue?(addr: string, slot: number, value: number): Promise<void>;
  seal?(): Promise<void>;
};

const DEFAULT_NODE_BYTES = 8;
const DEFAULT_HALF_BYTES = 4;

function toNode(raw: unknown): StageNode | null {
  const n = raw as { addr?: unknown; value?: unknown; next?: unknown } | undefined;
  if (typeof n?.addr !== 'string' || typeof n.value !== 'number') return null;
  return { addr: n.addr, value: n.value, next: typeof n.next === 'string' ? n.next : null };
}

export const nodePointsNextProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 캡션 키 → 문안. en 원본은 호출부 리터럴로 남아야 추출기가 본다 (C10).
   * 그래서 키를 그대로 넘기지 않고 한 줄씩 편다.
   */
  const caption = (key: string): string => {
    if (key === 'caption.scattered') {
      return tr(
        'caption.scattered',
        'Three nodes lie apart in memory. Their places say nothing about which comes first.',
      );
    }
    if (key === 'caption.holdsAddress') {
      return tr(
        'caption.holdsAddress',
        'Beside its value every node holds one more thing — the address of the next node.',
      );
    }
    if (key === 'caption.orderExists') {
      return tr(
        'caption.orderExists',
        'Follow the held addresses and an order appears: 12, 5, 8 — not the order they lie in.',
      );
    }
    return '';
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as
        | {
            nodes?: unknown;
            head?: unknown;
            nodeBytes?: unknown;
            valueBytes?: unknown;
            addressBytes?: unknown;
          }
        | undefined;
      const nodes: StageNode[] = [];
      if (Array.isArray(d?.nodes)) {
        for (const raw of d.nodes) {
          const node = toNode(raw);
          if (node) nodes.push(node);
        }
      }
      const nodeBytes = typeof d?.nodeBytes === 'number' ? d.nodeBytes : DEFAULT_NODE_BYTES;
      const valueBytes = typeof d?.valueBytes === 'number' ? d.valueBytes : DEFAULT_HALF_BYTES;
      const addressBytes =
        typeof d?.addressBytes === 'number' ? d.addressBytes : DEFAULT_HALF_BYTES;
      stage?.init?.({
        nodes,
        head: typeof d?.head === 'string' ? d.head : (nodes[0]?.addr ?? ''),
        nodeBytes,
        valueBytes,
        addressBytes,
        orderLabel: tr('label.order', 'order'),
      });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'caption-changed': {
          const p = event.payload as { textKey?: unknown } | undefined;
          if (typeof p?.textKey === 'string') stage?.setCaption?.(caption(p.textKey));
          return;
        }
        case 'nodes-placed': {
          await stage?.placeNodes?.();
          return;
        }
        case 'head-attached': {
          const p = event.payload as { addr?: unknown } | undefined;
          if (typeof p?.addr === 'string') await stage?.attachHead?.(p.addr);
          return;
        }
        case 'pointer-followed': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (typeof p?.from === 'string' && typeof p.to === 'string') {
            await stage?.followPointer?.(p.from, p.to);
          }
          return;
        }
        case 'pointer-null': {
          const p = event.payload as { addr?: unknown } | undefined;
          if (typeof p?.addr === 'string') await stage?.endWithNull?.(p.addr);
          return;
        }
        case 'value-collected': {
          const p = event.payload as
            | { addr?: unknown; slot?: unknown; value?: unknown }
            | undefined;
          if (
            typeof p?.addr === 'string' &&
            typeof p.slot === 'number' &&
            typeof p.value === 'number'
          ) {
            await stage?.collectValue?.(p.addr, p.slot, p.value);
          }
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        case 'done': {
          await stage?.seal?.();
          return;
        }
        default:
          // 이 algorithm 이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
