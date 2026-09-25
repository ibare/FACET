/**
 * 페이지 폴트 장면.
 *
 * 바탕 — 접근 차례 · 그림에 둘 프레임 번호 · 디스크에 있는 페이지 (initial 이 한 번 정한다)
 * 자취 — 표의 지금 모습 · 프레임마다 든 페이지 · 끝난 접근 수 · 폴트 난 접근 차례
 * 이번 걸음 — step
 *
 * 어느 빈 프레임에 올릴지는 알고리즘이 셈해 load 에 싣는다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PageFaultTableRow = { page: number; frame: number | null };
export type PageFaultSlot = { frame: number; page: number | null };

export type PageFaultStep =
  | { kind: 'start' }
  | { kind: 'access'; index: number; page: number; frame: number }
  | { kind: 'fault'; index: number; page: number }
  | { kind: 'load'; index: number; page: number; frame: number }
  | { kind: 'map'; index: number; page: number; frame: number }
  | { kind: 'retry'; index: number; page: number; frame: number };

export type PageFaultScene = {
  accesses: number[];
  /** 디스크에만 있던 페이지 (처음 표에서 없음) */
  diskPages: number[];
  table: PageFaultTableRow[];
  /** 프레임 번호 오름차순 */
  slots: PageFaultSlot[];
  done: number;
  /** 폴트가 난 접근 차례 */
  faulted: number[];
  step: PageFaultStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`page-fault 장면: ${what} 가 음 아닌 정수가 아니다`);
  }
  return v;
}

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`page-fault 장면: ${what} 가 배열이 아니다`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
}

function emptyScene(): PageFaultScene {
  return { accesses: [], diskPages: [], table: [], slots: [], done: 0, faulted: [], step: { kind: 'start' } };
}

function initial(initialData: unknown): PageFaultScene {
  if (!isRecord(initialData) || initialData.pages === undefined) return emptyScene();
  const rawPages = initialData.pages;
  if (!Array.isArray(rawPages)) throw new Error('page-fault 장면: pages 가 배열이 아니다');
  const table: PageFaultTableRow[] = rawPages.map((r, i) => {
    if (!isRecord(r)) throw new Error(`page-fault 장면: pages[${i}] 가 객체가 아니다`);
    const page = num(r.page, `pages[${i}].page`);
    const frame = r.frame === null ? null : num(r.frame, `pages[${i}].frame`);
    return { page, frame };
  });
  const free = numList(initialData.freeFrames, 'freeFrames');
  const accesses = numList(initialData.accesses, 'accesses');

  const slots: PageFaultSlot[] = [];
  for (const row of table) {
    if (row.frame === null) continue;
    if (slots.some((s) => s.frame === row.frame)) {
      throw new Error(`page-fault 장면: 프레임 ${row.frame} 에 페이지가 둘 매겨졌다`);
    }
    slots.push({ frame: row.frame, page: row.page });
  }
  for (const f of free) {
    if (slots.some((s) => s.frame === f)) {
      throw new Error(`page-fault 장면: 빈 프레임 ${f} 가 이미 차 있거나 두 번 적혔다`);
    }
    slots.push({ frame: f, page: null });
  }
  slots.sort((a, b) => a.frame - b.frame);

  return {
    accesses,
    diskPages: table.filter((r) => r.frame === null).map((r) => r.page),
    table,
    slots,
    done: 0,
    faulted: [],
    step: { kind: 'start' },
  };
}

function field(payload: unknown, key: string, type: string): number {
  if (!isRecord(payload)) throw new Error(`page-fault 장면: ${type} payload 가 객체가 아니다`);
  return num(payload[key], `${type}.${key}`);
}

function reduce(scene: PageFaultScene, event: FacetRuntimeEvent): PageFaultScene {
  const p = event.payload;
  switch (event.type) {
    case 'access': {
      const index = field(p, 'index', 'access');
      const page = field(p, 'page', 'access');
      const frame = field(p, 'frame', 'access');
      return { ...scene, done: scene.done + 1, step: { kind: 'access', index, page, frame } };
    }
    case 'fault': {
      const index = field(p, 'index', 'fault');
      const page = field(p, 'page', 'fault');
      return { ...scene, faulted: [...scene.faulted, index], step: { kind: 'fault', index, page } };
    }
    case 'load': {
      const index = field(p, 'index', 'load');
      const page = field(p, 'page', 'load');
      const frame = field(p, 'frame', 'load');
      const slot = scene.slots.find((s) => s.frame === frame);
      if (slot === undefined) throw new Error(`page-fault 장면: 프레임 ${frame} 이 그림에 없다`);
      if (slot.page !== null) throw new Error(`page-fault 장면: 프레임 ${frame} 이 비어 있지 않다`);
      return {
        ...scene,
        slots: scene.slots.map((s) => (s.frame === frame ? { frame, page } : { ...s })),
        step: { kind: 'load', index, page, frame },
      };
    }
    case 'map': {
      const index = field(p, 'index', 'map');
      const page = field(p, 'page', 'map');
      const frame = field(p, 'frame', 'map');
      if (!scene.table.some((r) => r.page === page)) {
        throw new Error(`page-fault 장면: 페이지 ${page} 가 표에 없다`);
      }
      return {
        ...scene,
        table: scene.table.map((r) => (r.page === page ? { page, frame } : { ...r })),
        step: { kind: 'map', index, page, frame },
      };
    }
    case 'retry': {
      const index = field(p, 'index', 'retry');
      const page = field(p, 'page', 'retry');
      const frame = field(p, 'frame', 'retry');
      return { ...scene, done: scene.done + 1, step: { kind: 'retry', index, page, frame } };
    }
    default:
      return scene;
  }
}

export const pageFaultScene: ScenePlan<PageFaultScene> = { initial, reduce };
