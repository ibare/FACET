/**
 * tlb-caches-translation 의 장면.
 *
 * 바탕 — 페이지 표 · TLB 칸 수 · 기다리는 주소 (initialData 에서 베낀다. 걸음 0 이 이것이다)
 * 자취 — TLB 에 적힌 줄 · 접근마다 번역이 어디서 왔는지 · 표 찾기 수 · 적중 수
 * 이번 걸음 — `step`
 *
 * 주소 가르기 · 실제 주소 셈은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface TlbRow {
  page: number;
  frame: number;
  /** 이 줄을 적게 한 접근의 차례 */
  by: number;
}

export interface AccessResult {
  source: 'table' | 'tlb';
  physical: number;
}

export type TlbStep =
  | { kind: 'start' }
  | { kind: 'walk'; index: number; page: number; offset: number; frame: number }
  | { kind: 'fill'; index: number; page: number; offset: number; frame: number; slot: number; physical: number }
  | { kind: 'hit'; index: number; page: number; offset: number; frame: number; slot: number; physical: number };

export interface TlbCachesTranslationScene {
  pageTable: Array<{ page: number; frame: number }>;
  tlbSlots: number;
  addresses: number[];
  tlb: TlbRow[];
  /** 접근마다 — 아직 끝나지 않았으면 null */
  results: Array<AccessResult | null>;
  walks: number;
  hits: number;
  step: TlbStep;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function int(record: Record<string, unknown>, key: string, where: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`tlb-caches-translation 장면: ${where} 의 ${key} 가 정수가 아니다`);
  }
  return value;
}

function readInitial(initialData: unknown): Pick<TlbCachesTranslationScene, 'pageTable' | 'tlbSlots' | 'addresses'> {
  if (!isRecord(initialData)) throw new Error('tlb-caches-translation 장면: initialData 가 없다');
  const table = initialData['pageTable'];
  const addresses = initialData['addresses'];
  if (!Array.isArray(table)) throw new Error('tlb-caches-translation 장면: pageTable 이 배열이 아니다');
  if (!Array.isArray(addresses)) throw new Error('tlb-caches-translation 장면: addresses 가 배열이 아니다');
  const pageTable = table.map((row, i) => {
    if (!isRecord(row)) throw new Error(`tlb-caches-translation 장면: pageTable[${i}] 가 객체가 아니다`);
    return { page: int(row, 'page', `pageTable[${i}]`), frame: int(row, 'frame', `pageTable[${i}]`) };
  });
  const list = addresses.map((a, i) => {
    if (typeof a !== 'number' || !Number.isInteger(a)) {
      throw new Error(`tlb-caches-translation 장면: addresses[${i}] 가 정수가 아니다`);
    }
    return a;
  });
  return { pageTable, tlbSlots: int(initialData, 'tlbSlots', 'initialData'), addresses: list };
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`tlb-caches-translation 장면: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

function withResult(
  results: ReadonlyArray<AccessResult | null>,
  index: number,
  result: AccessResult,
): Array<AccessResult | null> {
  if (index < 0 || index >= results.length) {
    throw new Error(`tlb-caches-translation 장면: 접근 ${index} 가 주소 목록 밖이다`);
  }
  return results.map((r, i) => (i === index ? result : r));
}

export const tlbCachesTranslationScene: ScenePlan<TlbCachesTranslationScene> = {
  initial(initialData: unknown): TlbCachesTranslationScene {
    const base = readInitial(initialData);
    return {
      ...base,
      tlb: [],
      results: base.addresses.map(() => null),
      walks: 0,
      hits: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: TlbCachesTranslationScene, event: FacetRuntimeEvent): TlbCachesTranslationScene {
    if (event.type === 'tableWalk') {
      const p = payloadOf(event);
      const index = int(p, 'index', event.type);
      return {
        ...scene,
        walks: scene.walks + 1,
        step: {
          kind: 'walk',
          index,
          page: int(p, 'page', event.type),
          offset: int(p, 'offset', event.type),
          frame: int(p, 'frame', event.type),
        },
      };
    }
    if (event.type === 'tlbFill') {
      const p = payloadOf(event);
      const index = int(p, 'index', event.type);
      const page = int(p, 'page', event.type);
      const frame = int(p, 'frame', event.type);
      const slot = int(p, 'slot', event.type);
      const physical = int(p, 'physical', event.type);
      if (slot !== scene.tlb.length || slot >= scene.tlbSlots) {
        throw new Error(`tlb-caches-translation 장면: TLB 칸 ${slot} 에 적을 수 없다`);
      }
      return {
        ...scene,
        tlb: [...scene.tlb, { page, frame, by: index }],
        results: withResult(scene.results, index, { source: 'table', physical }),
        step: { kind: 'fill', index, page, offset: int(p, 'offset', event.type), frame, slot, physical },
      };
    }
    if (event.type === 'tlbHit') {
      const p = payloadOf(event);
      const index = int(p, 'index', event.type);
      const page = int(p, 'page', event.type);
      const slot = int(p, 'slot', event.type);
      const physical = int(p, 'physical', event.type);
      const row = scene.tlb[slot];
      if (!row || row.page !== page) {
        throw new Error(`tlb-caches-translation 장면: TLB 칸 ${slot} 에 페이지 ${page} 가 없다`);
      }
      return {
        ...scene,
        hits: scene.hits + 1,
        results: withResult(scene.results, index, { source: 'tlb', physical }),
        step: {
          kind: 'hit',
          index,
          page,
          offset: int(p, 'offset', event.type),
          frame: int(p, 'frame', event.type),
          slot,
          physical,
        },
      };
    }
    return scene;
  },
};
