/**
 * forwarding-table 장면.
 *
 * 바탕: 보내는 이 · 들어오는 문 · 표 · 패킷(도착 차례). initialData 에서 베낀다.
 * 자취: 나간 패킷들 — 어느 줄이 맡았고 누구에게 넘겼는가. 도착 차례대로 쌓인다.
 * 이번 걸음: 처음, 또는 방금 나간 패킷의 자리.
 *
 * 셈(어느 줄이 맞는가)은 알고리즘이 하고, 장면은 `forward` 이벤트만 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface SceneRow {
  net: string;
  hop: string | null;
  door: string;
}

export interface SceneBase {
  sender: string;
  inDoor: string;
  table: SceneRow[];
  packets: string[];
}

export interface SentPacket {
  packet: number;
  row: number;
  hop: string;
  fallback: boolean;
}

export type SceneStep = { kind: 'start' } | { kind: 'forward'; packet: number };

export interface ForwardingTableScene {
  base: SceneBase | null;
  sent: SentPacket[];
  step: SceneStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readBase(data: unknown): SceneBase | null {
  if (!isRecord(data)) return null;
  const { sender, inDoor, table, packets } = data;
  if (typeof sender !== 'string' || typeof inDoor !== 'string') return null;
  if (!Array.isArray(table) || !Array.isArray(packets)) return null;
  const rows: SceneRow[] = [];
  for (const r of table) {
    if (!isRecord(r)) return null;
    const { net, hop, door } = r;
    if (typeof net !== 'string' || typeof door !== 'string') return null;
    if (hop !== null && typeof hop !== 'string') return null;
    rows.push({ net, hop, door });
  }
  const dsts: string[] = [];
  for (const p of packets) {
    if (typeof p !== 'string') return null;
    dsts.push(p);
  }
  return { sender, inDoor, table: rows, packets: dsts };
}

export const forwardingTableScene: ScenePlan<ForwardingTableScene> = {
  initial(initialData: unknown): ForwardingTableScene {
    return { base: readBase(initialData), sent: [], step: { kind: 'start' } };
  },
  reduce(scene: ForwardingTableScene, event: FacetRuntimeEvent): ForwardingTableScene {
    if (event.type !== 'forward') return scene;
    const p = event.payload;
    if (!isRecord(p)) return scene;
    const { packet, row, hop, fallback } = p;
    if (
      typeof packet !== 'number' ||
      typeof row !== 'number' ||
      typeof hop !== 'string' ||
      typeof fallback !== 'boolean'
    ) {
      return scene;
    }
    return {
      base: scene.base,
      sent: [...scene.sent, { packet, row, hop, fallback }],
      step: { kind: 'forward', packet },
    };
  },
};
