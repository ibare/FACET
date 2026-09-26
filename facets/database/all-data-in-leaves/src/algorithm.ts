/**
 * all-data-in-leaves — B+ 트리에서 찾기 셋이 뿌리부터 잎까지 내려간다.
 *
 * 찾는 열쇠가 안쪽 페이지에 보여도 그 자리에는 값이 없다. 가름 열쇠 규칙
 * (k ≥ s → s 의 오른쪽 가지) 대로 계속 내려가 잎에서야 값을 쥔다.
 *
 * 이벤트
 *   read   페이지 하나를 읽는다 (걸음 하나. silent 아님)
 *     payload {
 *       search: number        찾기 차례 (0 부터)
 *       key:    number        찾는 열쇠
 *       page:   string        읽은 페이지 식별자
 *       depth:  number        층 (뿌리 1)
 *       kind:   'inner' | 'leaf'
 *       slot:   number        안쪽: 고른 가리킴 차례 · 잎: 맞은 항목 차례
 *       hit:    number        이 페이지 열쇠 가운데 찾는 열쇠의 차례, 없으면 -1
 *       next:   string | null 안쪽: 내려갈 페이지 · 잎: null
 *       value:  string | null 잎: 쥔 값(name) · 안쪽: null
 *     }
 *
 * 걸음 0 은 트리 그 자체라 첫 읽기 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PageData = {
  id: string;
  kind: 'inner' | 'leaf';
  keys: number[];
  /** 안쪽 페이지의 아래 페이지 가리킴 (열쇠 수 + 1) */
  children?: string[];
  /** 잎 항목의 name 열 */
  names?: string[];
};

export type LookupData = {
  key: number;
  /** 화면에 둘 SQL 조건 글자 (자료) */
  sql: string;
};

export type AllDataInLeavesFacetData = {
  type: 'all-data-in-leaves';
  index: string;
  root: string;
  pages: PageData[];
  lookups: LookupData[];
  stepMs: number;
};

/** 가름 열쇠 규칙 — 찾는 열쇠 이하인 가름 열쇠의 수가 곧 고를 가리킴 차례다. */
export function chooseSlot(keys: readonly number[], key: number): number {
  let i = 0;
  while (i < keys.length && key >= keys[i]!) i += 1;
  return i;
}

export async function allDataInLeaves(
  baseCtx: FacetContext<AllDataInLeavesFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<AllDataInLeavesFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('stepMs 가 없다');

  const byId = new Map<string, PageData>();
  for (const p of data.pages) {
    if (byId.has(p.id)) throw new Error(`페이지 ${p.id} 가 둘이다`);
    byId.set(p.id, p);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let search = 0; search < data.lookups.length; search += 1) {
    if (ctx.cancelled) return;
    const lookup = data.lookups[search]!;
    const key = lookup.key;
    const sqlKey = /=\s*(-?\d+)\s*$/.exec(lookup.sql);
    if (!sqlKey || Number(sqlKey[1]) !== key) {
      throw new Error(`찾기 ${search}: SQL "${lookup.sql}" 의 열쇠가 ${key} 와 다르다`);
    }

    let pageId: string | null = data.root;
    let depth = 1;
    while (pageId !== null) {
      if (!(await pause())) return;
      if (depth > data.pages.length) throw new Error(`찾기 ${key}: 페이지 고리가 있다`);
      const page = byId.get(pageId);
      if (!page) throw new Error(`찾기 ${key}: 페이지 ${pageId} 가 없다`);
      const hit = page.keys.indexOf(key);

      if (page.kind === 'inner') {
        const children = page.children;
        if (!children || children.length !== page.keys.length + 1) {
          throw new Error(`안쪽 페이지 ${page.id} 의 가리킴 수가 열쇠 수 + 1 이 아니다`);
        }
        const slot = chooseSlot(page.keys, key);
        const next = children[slot];
        if (next === undefined) throw new Error(`페이지 ${page.id} 의 가리킴 ${slot} 이 없다`);
        await ctx.emit({
          type: 'read',
          payload: { search, key, page: page.id, depth, kind: 'inner', slot, hit, next, value: null },
        });
        pageId = next;
        depth += 1;
      } else if (page.kind === 'leaf') {
        if (hit < 0) throw new Error(`찾기 ${key}: 잎 ${page.id} 에 열쇠가 없다`);
        const value = page.names?.[hit];
        if (value === undefined) throw new Error(`잎 ${page.id} 의 항목 ${hit} 에 name 이 없다`);
        await ctx.emit({
          type: 'read',
          payload: { search, key, page: page.id, depth, kind: 'leaf', slot: hit, hit, next: null, value },
        });
        pageId = null;
      } else {
        throw new Error(`페이지 ${pageId} 의 종류를 모른다`);
      }
    }
  }
}
