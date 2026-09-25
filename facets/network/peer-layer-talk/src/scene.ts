import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readPeerData, type LayerId } from './algorithm';

/** 바탕 — 층 하나. 위에서 아래 차례. */
export type PeerSceneLayer = {
  layer: LayerId;
  n: number;
  /** 머리의 항목 식별자와 적힌 것. 물리 층은 null */
  header: { field: string; value: string } | null;
};

/** 이번 걸음 */
export type PeerStep =
  | { kind: 'start'; headers: number }
  | {
      kind: 'open';
      layer: LayerId;
      n: number;
      /** 그 머리를 쓴 보낸 쪽 층 — 알고리즘이 셈했다 */
      writer: LayerId;
      /** 머리를 연 층 바로 앞에 짐이 있던 층 — 없으면 선 위 */
      from: LayerId | null;
      carriedSender: number;
      carriedReceiver: number;
      carriedPhysical: number;
      carried: number;
    };

export type PeerLayerTalkScene = {
  /** 바탕 */
  stack: PeerSceneLayer[];
  /** 자취 — 받는 쪽이 연 층과 그 머리를 쓴 보낸 쪽 층, 연 차례대로 */
  opened: { layer: LayerId; writer: LayerId }[];
  step: PeerStep;
};

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`peer-layer-talk: open 의 ${name} 가 수가 아니다`);
  return v;
}

export const peerLayerTalkScene: ScenePlan<PeerLayerTalkScene> = {
  initial(initialData: unknown): PeerLayerTalkScene {
    const data = readPeerData(initialData);
    const stack = data.stack.map((l) => ({
      layer: l.layer,
      n: l.n,
      header: l.header === null ? null : { field: l.header.field, value: l.header.value },
    }));
    return {
      stack,
      opened: [],
      step: { kind: 'start', headers: stack.filter((l) => l.header !== null).length },
    };
  },

  reduce(scene: PeerLayerTalkScene, event: FacetRuntimeEvent): PeerLayerTalkScene {
    if (event.type !== 'open') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('peer-layer-talk: open 에 payload 가 없다');
    const layerRaw = (p as { layer?: unknown }).layer;
    const found = scene.stack.find((l) => l.layer === layerRaw);
    if (found === undefined || found.header === null) {
      throw new Error('peer-layer-talk: open 의 층을 모른다');
    }
    const writerRaw = (p as { writer?: unknown }).writer;
    const writer = scene.stack.find((l) => l.layer === writerRaw);
    if (writer === undefined || writer.header === null) {
      throw new Error('peer-layer-talk: open 의 쓴 층을 모른다');
    }
    const from = scene.opened.length === 0 ? null : scene.opened[scene.opened.length - 1]?.layer ?? null;
    return {
      stack: scene.stack,
      opened: [...scene.opened, { layer: found.layer, writer: writer.layer }],
      step: {
        kind: 'open',
        layer: found.layer,
        n: num((p as { n?: unknown }).n, 'n'),
        writer: writer.layer,
        from,
        carriedSender: num((p as { carriedSender?: unknown }).carriedSender, 'carriedSender'),
        carriedReceiver: num((p as { carriedReceiver?: unknown }).carriedReceiver, 'carriedReceiver'),
        carriedPhysical: num((p as { carriedPhysical?: unknown }).carriedPhysical, 'carriedPhysical'),
        carried: num((p as { carried?: unknown }).carried, 'carried'),
      },
    };
  },
};
