/**
 * key-reorder 의 장면 — 이벤트를 이어 붙여 "이름표 표" · "지금까지 처리한 자리" ·
 * "실제 목록(현재 배치)" 을 쌓는다. 셈(찾기 · stay/move 판정 · lastPlaced) 은
 * algorithm 이 다 마쳐 payload 에 싣는다. 여기서는 다시 셈하지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { KeyReorderFacetData } from './algorithm.js';

export interface KeyTableEntry {
  key: string;
  oldIndex: number;
}

export type ProcessAction = 'stay' | 'move';

export interface ProcessedItem {
  position: number;
  key: string;
  oldIndex: number;
  action: ProcessAction;
  lastPlaced: number;
}

export type KeyReorderStep =
  | { kind: 'init' }
  | { kind: 'buildTable'; entries: KeyTableEntry[] }
  | { kind: 'process'; position: number; key: string; oldIndex: number; action: ProcessAction; lastPlaced: number };

export interface KeyReorderScene {
  /** 바탕 — initialData 에서 한 번 정해진다. */
  oldKeys: string[];
  newKeys: string[];
  /** 자취 — 걸음이 쌓는다. */
  table: KeyTableEntry[] | null;
  processed: ProcessedItem[];
  /** 지금 실제 목록의 노드 차례 (키로). 옮김이 일어난 걸음에만 바뀐다. */
  actualOrder: string[];
  totals: { move: number; stay: number; create: number; remove: number; patch: number };
  /** 이번 걸음. */
  step: KeyReorderStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

export function initial(initialData: unknown): KeyReorderScene {
  const data = isRecord(initialData) ? (initialData as Partial<KeyReorderFacetData>) : undefined;
  const oldKeys = readStringArray(data?.oldKeys);
  const newKeys = readStringArray(data?.newKeys);
  return {
    oldKeys,
    newKeys,
    table: null,
    processed: [],
    actualOrder: [...oldKeys],
    totals: { move: 0, stay: 0, create: 0, remove: 0, patch: 0 },
    step: { kind: 'init' },
  };
}

function readEntries(payload: unknown): KeyTableEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) {
    throw new Error('key-reorder: build-table payload 모양이 다르다');
  }
  const entries: KeyTableEntry[] = [];
  for (const raw of payload.entries) {
    if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.oldIndex !== 'number') {
      throw new Error('key-reorder: build-table entry 모양이 다르다');
    }
    entries.push({ key: raw.key, oldIndex: raw.oldIndex });
  }
  return entries;
}

function readProcessed(payload: unknown): ProcessedItem {
  if (
    !isRecord(payload) ||
    typeof payload.position !== 'number' ||
    typeof payload.key !== 'string' ||
    typeof payload.oldIndex !== 'number' ||
    (payload.action !== 'stay' && payload.action !== 'move') ||
    typeof payload.lastPlaced !== 'number'
  ) {
    throw new Error('key-reorder: process-item payload 모양이 다르다');
  }
  return {
    position: payload.position,
    key: payload.key,
    oldIndex: payload.oldIndex,
    action: payload.action,
    lastPlaced: payload.lastPlaced,
  };
}

export function reduce(scene: KeyReorderScene, event: FacetRuntimeEvent): KeyReorderScene {
  if (event.type === 'build-table') {
    const entries = readEntries(event.payload);
    return { ...scene, table: entries, step: { kind: 'buildTable', entries } };
  }
  if (event.type === 'process-item') {
    const item = readProcessed(event.payload);
    const isMove = item.action === 'move';
    const actualOrder = isMove
      ? [...scene.actualOrder.filter((k) => k !== item.key), item.key]
      : scene.actualOrder;
    const totals = { ...scene.totals };
    if (isMove) totals.move += 1;
    else totals.stay += 1;
    return {
      ...scene,
      processed: [...scene.processed, item],
      actualOrder,
      totals,
      step: {
        kind: 'process',
        position: item.position,
        key: item.key,
        oldIndex: item.oldIndex,
        action: item.action,
        lastPlaced: item.lastPlaced,
      },
    };
  }
  throw new Error(`key-reorder: 알 수 없는 이벤트 "${event.type}"`);
}

export const keyReorderScene: ScenePlan<KeyReorderScene> = { initial, reduce };
