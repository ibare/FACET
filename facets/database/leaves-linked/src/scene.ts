/**
 * leavesLinkedScene — 이벤트를 장면으로 잇는다.
 *
 * 바탕: 질의 · 인덱스 이름 · 범위 · 트리 페이지 (initialData 를 베낀다 — 걸음 0)
 * 자취: 읽은 페이지 차례 · 잡은 열쇠 · 지나친 열쇠 · 멈춘 열쇠
 * 이번 걸음: step — 어디서(from) 어디로 옮겨 왔는가
 *
 * 트리 내려가기와 잎 훑기의 셈은 알고리즘이 한다. 장면은 이벤트만 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ScenePage =
  | { id: string; kind: 'inner'; keys: number[]; children: string[] }
  | { id: string; kind: 'leaf'; entries: { key: number; row: string }[]; next: string | null };

export type ReadVia = 'down' | 'side';

export type LeavesLinkedStep =
  | { kind: 'start' }
  | { kind: 'inner'; page: string; child: string; from: string | null }
  | {
      kind: 'leaf';
      page: string;
      via: ReadVia;
      cross: boolean;
      from: string | null;
      stop: number | null;
    };

export type LeavesLinkedScene = {
  query: string;
  index: string;
  column: string;
  lo: number;
  hi: number;
  root: string;
  pages: ScenePage[];
  reads: { page: string; via: ReadVia }[];
  picked: { page: string; key: number; row: string }[];
  skipped: { page: string; key: number }[];
  stop: { page: string; key: number } | null;
  step: LeavesLinkedStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numbers(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`leavesLinkedScene: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`leavesLinkedScene: ${what} 에 수가 아닌 것이 있다`);
    return x;
  });
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`leavesLinkedScene: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`leavesLinkedScene: ${what} 에 글자가 아닌 것이 있다`);
    return x;
  });
}

function copyPage(v: unknown): ScenePage {
  if (!isRecord(v) || typeof v.id !== 'string') throw new Error('leavesLinkedScene: 페이지 모양이 틀렸다');
  if (v.kind === 'inner') {
    return { id: v.id, kind: 'inner', keys: numbers(v.keys, 'keys'), children: strings(v.children, 'children') };
  }
  if (v.kind === 'leaf') {
    if (!Array.isArray(v.entries)) throw new Error(`leavesLinkedScene: 잎 ${v.id} 에 entries 가 없다`);
    const entries = v.entries.map((e) => {
      if (!isRecord(e) || typeof e.key !== 'number' || typeof e.row !== 'string') {
        throw new Error(`leavesLinkedScene: 잎 ${String(v.id)} 의 항목 모양이 틀렸다`);
      }
      return { key: e.key, row: e.row };
    });
    const next = v.next;
    if (next !== null && typeof next !== 'string') throw new Error(`leavesLinkedScene: 잎 ${v.id} 의 next 가 틀렸다`);
    return { id: v.id, kind: 'leaf', entries, next };
  }
  throw new Error(`leavesLinkedScene: 페이지 ${v.id} 의 종류를 모른다`);
}

const EMPTY: LeavesLinkedScene = {
  query: '',
  index: '',
  column: '',
  lo: 0,
  hi: 0,
  root: '',
  pages: [],
  reads: [],
  picked: [],
  skipped: [],
  stop: null,
  step: { kind: 'start' },
};

export const leavesLinkedScene: ScenePlan<LeavesLinkedScene> = {
  initial(initialData: unknown): LeavesLinkedScene {
    // 자료 없이 불리면 빈 장면 — 화면은 아무것도 그리지 않는다
    if (!isRecord(initialData) || initialData.pages === undefined) {
      return { ...EMPTY, pages: [], reads: [], picked: [], skipped: [] };
    }
    const d = initialData;
    if (
      typeof d.query !== 'string' ||
      typeof d.index !== 'string' ||
      typeof d.column !== 'string' ||
      typeof d.lo !== 'number' ||
      typeof d.hi !== 'number' ||
      typeof d.root !== 'string' ||
      !Array.isArray(d.pages)
    ) {
      throw new Error('leavesLinkedScene: initialData 모양이 틀렸다');
    }
    return {
      query: d.query,
      index: d.index,
      column: d.column,
      lo: d.lo,
      hi: d.hi,
      root: d.root,
      pages: d.pages.map(copyPage),
      reads: [],
      picked: [],
      skipped: [],
      stop: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LeavesLinkedScene, event: FacetRuntimeEvent): LeavesLinkedScene {
    const p = event.payload;
    const last = scene.reads[scene.reads.length - 1];
    const from = last === undefined ? null : last.page;

    if (event.type === 'read-inner') {
      if (!isRecord(p) || typeof p.page !== 'string' || typeof p.child !== 'string') {
        throw new Error('leavesLinkedScene: read-inner payload 모양이 틀렸다');
      }
      return {
        ...scene,
        reads: [...scene.reads, { page: p.page, via: 'down' }],
        step: { kind: 'inner', page: p.page, child: p.child, from },
      };
    }

    if (event.type === 'read-leaf') {
      if (
        !isRecord(p) ||
        typeof p.page !== 'string' ||
        (p.via !== 'down' && p.via !== 'side') ||
        typeof p.cross !== 'boolean' ||
        (p.stop !== null && typeof p.stop !== 'number') ||
        !Array.isArray(p.picked)
      ) {
        throw new Error('leavesLinkedScene: read-leaf payload 모양이 틀렸다');
      }
      const page = p.page;
      const via: ReadVia = p.via;
      const stop = p.stop;
      const picked = p.picked.map((e) => {
        if (!isRecord(e) || typeof e.key !== 'number' || typeof e.row !== 'string') {
          throw new Error('leavesLinkedScene: picked 항목 모양이 틀렸다');
        }
        return { page, key: e.key, row: e.row };
      });
      const skipped = numbers(p.skipped, 'skipped').map((key) => ({ page, key }));
      return {
        ...scene,
        reads: [...scene.reads, { page, via }],
        picked: [...scene.picked, ...picked],
        skipped: [...scene.skipped, ...skipped],
        stop: stop === null ? scene.stop : { page, key: stop },
        step: { kind: 'leaf', page, via, cross: p.cross, from, stop },
      };
    }

    return scene;
  },
};
