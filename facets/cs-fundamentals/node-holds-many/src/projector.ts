/**
 * node-holds-many projector — algorithm.ts 가 발신하는 key-sweep / descend /
 * mark / done / rewind 를 stage view 호출로 번역한다.
 *
 * `event.payload` 는 unknown 이므로 (C9) typeof/Array.isArray 가드로 좁힌
 * 다음에만 stage 로 넘긴다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  DescendPayload,
  MarkPayload,
  StageInitData,
  SweepPayload,
} from './node-holds-many-stage.js';

/** stage view 가 노출하는 메서드 계약 (C9 — 구체형은 파일 상단에 선언). */
type Stage = {
  init(data: StageInitData): void;
  sweepKey(p: SweepPayload): void | Promise<void>;
  descend(p: DescendPayload): void | Promise<void>;
  markFound(p: MarkPayload): void | Promise<void>;
  settle(): void | Promise<void>;
  rewind(): void;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function asStageInitData(raw: unknown): StageInitData | null {
  const d = asRecord(raw);
  if (!d) return null;
  if (typeof d.rootId !== 'string') return null;
  if (typeof d.target !== 'number') return null;
  const nodesRaw = asRecord(d.nodes);
  if (!nodesRaw) return null;

  const nodes: StageInitData['nodes'] = {};
  for (const [id, v] of Object.entries(nodesRaw)) {
    const node = asRecord(v);
    if (!node) return null;
    if (!Array.isArray(node.keys) || !node.keys.every((k) => typeof k === 'number')) return null;
    const children = node.children;
    if (children !== undefined) {
      if (!Array.isArray(children) || !children.every((c) => typeof c === 'string')) return null;
    }
    nodes[id] = { keys: node.keys as number[], children: children as string[] | undefined };
  }
  return { rootId: d.rootId, target: d.target, nodes };
}

function asSweepPayload(raw: unknown): SweepPayload | null {
  const p = asRecord(raw);
  if (!p) return null;
  if (typeof p.nodeId !== 'string') return null;
  if (typeof p.keyIndex !== 'number') return null;
  if (typeof p.key !== 'number') return null;
  if (p.cmp !== 'lt' && p.cmp !== 'gt' && p.cmp !== 'eq') return null;
  return { nodeId: p.nodeId, keyIndex: p.keyIndex, key: p.key, cmp: p.cmp };
}

function asDescendPayload(raw: unknown): DescendPayload | null {
  const p = asRecord(raw);
  if (!p) return null;
  if (typeof p.nodeId !== 'string') return null;
  if (typeof p.gapIndex !== 'number') return null;
  if (p.childId !== undefined && typeof p.childId !== 'string') return null;
  return { nodeId: p.nodeId, gapIndex: p.gapIndex, childId: p.childId as string | undefined };
}

function asMarkPayload(raw: unknown): MarkPayload | null {
  const p = asRecord(raw);
  if (!p) return null;
  if (typeof p.nodeId !== 'string') return null;
  if (typeof p.keyIndex !== 'number') return null;
  if (typeof p.key !== 'number') return null;
  return { nodeId: p.nodeId, keyIndex: p.keyIndex, key: p.key };
}

export const nodeHoldsManyProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as Stage;

  return {
    onInit(initialData) {
      const data = asStageInitData(initialData);
      if (!data) return;
      stage.init(data);
    },

    async onEvent(event) {
      switch (event.type) {
        case 'key-sweep': {
          const p = asSweepPayload(event.payload);
          if (p) await stage.sweepKey(p);
          break;
        }
        case 'descend': {
          const p = asDescendPayload(event.payload);
          if (p) await stage.descend(p);
          break;
        }
        case 'mark': {
          const p = asMarkPayload(event.payload);
          if (p) await stage.markFound(p);
          break;
        }
        case 'done':
          await stage.settle();
          break;
        case 'rewind':
          stage.rewind();
          break;
        default:
          // algorithm.ts 가 발신하는 이벤트 전부를 위에서 다룬다. 여기 닿을 일은
          // 없지만, 새 이벤트가 추가되고 이 switch 가 못 따라오면 조용히 버린다.
          break;
      }
    },
  };
};
