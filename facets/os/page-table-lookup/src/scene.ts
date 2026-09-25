/**
 * page-table-lookup 장면.
 *
 * 바탕  — 페이지 표 · 번역할 주소 · 주소 비트 수 · 페이지 크기 (initialData 에서 베낀다)
 * 자취  — results: 번역을 마친 주소의 실제 주소 (아직이면 null)
 * 이번 걸음 — step: 갈라짐 · 바뀜 · 붙음 중 하나와 그 인자
 *
 * 셈(나누기 · 표 찾기 · 붙이기)은 알고리즘이 한다. 장면은 payload 를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { checkPageTableData, type PageTableRow } from './algorithm.js';

export type PageTableStep =
  | { kind: 'split'; index: number; page: number; offset: number }
  | { kind: 'lookup'; index: number; page: number; frame: number; offset: number }
  | { kind: 'join'; index: number; page: number; frame: number; offset: number; physical: number };

export type PageTableLookupScene = {
  addressBits: number;
  pageSize: number;
  table: PageTableRow[];
  addresses: number[];
  results: (number | null)[];
  step: PageTableStep | null;
  /** 걸음 번호 — 흘릴지 고를 때만 쓴다 */
  seq: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(rec: Record<string, unknown>, key: string, where: string): number {
  const v = rec[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`page-table-lookup: ${where} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

export function readPageTableData(raw: unknown): {
  addressBits: number;
  pageSize: number;
  table: PageTableRow[];
  addresses: number[];
} {
  if (!isRecord(raw)) throw new Error('page-table-lookup: initialData 가 없다');
  const addressBits = num(raw, 'addressBits', 'initialData');
  const pageSize = num(raw, 'pageSize', 'initialData');
  const stepMs = num(raw, 'stepMs', 'initialData');
  const rawTable = raw['table'];
  const rawAddresses = raw['addresses'];
  if (!Array.isArray(rawTable)) throw new Error('page-table-lookup: table 이 배열이 아니다');
  if (!Array.isArray(rawAddresses)) throw new Error('page-table-lookup: addresses 가 배열이 아니다');
  const table = rawTable.map((r: unknown, i) => {
    if (!isRecord(r)) throw new Error(`page-table-lookup: table[${i}] 가 객체가 아니다`);
    return { page: num(r, 'page', `table[${i}]`), frame: num(r, 'frame', `table[${i}]`) };
  });
  const addresses = rawAddresses.map((a: unknown, i) => {
    if (typeof a !== 'number') throw new Error(`page-table-lookup: addresses[${i}] 가 수가 아니다`);
    return a;
  });
  checkPageTableData({ type: 'page-table-lookup', stepMs, addressBits, pageSize, table, addresses });
  return { addressBits, pageSize, table, addresses };
}

export const pageTableLookupScene: ScenePlan<PageTableLookupScene> = {
  initial(initialData: unknown): PageTableLookupScene {
    const d = readPageTableData(initialData);
    return {
      addressBits: d.addressBits,
      pageSize: d.pageSize,
      table: d.table.map((r) => ({ page: r.page, frame: r.frame })),
      addresses: [...d.addresses],
      results: d.addresses.map(() => null),
      step: null,
      seq: 0,
    };
  },

  reduce(scene: PageTableLookupScene, event: FacetRuntimeEvent): PageTableLookupScene {
    const p = event.payload;
    if (event.type === 'split') {
      if (!isRecord(p)) throw new Error('page-table-lookup: split payload 가 없다');
      const step: PageTableStep = {
        kind: 'split',
        index: num(p, 'index', 'split'),
        page: num(p, 'page', 'split'),
        offset: num(p, 'offset', 'split'),
      };
      return { ...scene, step, seq: scene.seq + 1 };
    }
    if (event.type === 'lookup') {
      if (!isRecord(p)) throw new Error('page-table-lookup: lookup payload 가 없다');
      const step: PageTableStep = {
        kind: 'lookup',
        index: num(p, 'index', 'lookup'),
        page: num(p, 'page', 'lookup'),
        frame: num(p, 'frame', 'lookup'),
        offset: num(p, 'offset', 'lookup'),
      };
      return { ...scene, step, seq: scene.seq + 1 };
    }
    if (event.type === 'join') {
      if (!isRecord(p)) throw new Error('page-table-lookup: join payload 가 없다');
      const step: PageTableStep = {
        kind: 'join',
        index: num(p, 'index', 'join'),
        page: num(p, 'page', 'join'),
        frame: num(p, 'frame', 'join'),
        offset: num(p, 'offset', 'join'),
        physical: num(p, 'physical', 'join'),
      };
      if (step.index < 0 || step.index >= scene.results.length) {
        throw new Error(`page-table-lookup: join 의 index ${step.index} 가 범위 밖이다`);
      }
      const results = scene.results.map((r, i) => (i === step.index ? step.physical : r));
      return { ...scene, results, step, seq: scene.seq + 1 };
    }
    return scene;
  },
};
