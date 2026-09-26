/**
 * index-costs-write 장면 — 이벤트를 잇기만 한다. 페이지 셈 · 자리 셈은 알고리즘이 했다.
 *
 * 바탕(init 이 한 번 정하는 것): 표 페이지마다 든 줄 수 · 인덱스 셋.
 * 자취(걸음이 쌓는 것): 양쪽의 읽은 페이지 · 찾은 자리 · 쓴 자리 · 읽은/쓴 페이지 수.
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Spot = { row: number; page: number; slot: number };
export type SceneIndex = { name: string; column: string; height: number };

export type PlainSide = {
  readPages: number[];
  found: Spot | null;
  reads: number | null;
  written: Spot | null;
  writes: number | null;
};

export type IndexedSide = {
  readIndex: string | null;
  readLevels: number;
  readPage: number | null;
  found: Spot | null;
  reads: number | null;
  written: Spot | null;
  writtenLeaves: string[];
  writes: number | null;
};

export type QueryKind = 'none' | 'select' | 'insert';

export type StepKind = 'none' | 'query' | 'scan' | 'seek' | 'write' | 'fan';

export type IndexCostsWriteScene = {
  base: {
    tableName: string;
    sqlSelect: string;
    sqlInsert: string;
    pages: number[];
    perPage: number;
    indexes: SceneIndex[];
  };
  query: QueryKind;
  plain: PlainSide;
  indexed: IndexedSide;
  step: { kind: StepKind };
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`index-costs-write 장면: ${what} 이 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`index-costs-write 장면: ${what} 이 수가 아니다`);
  }
  return v;
}

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`index-costs-write 장면: ${what} 이 목록이 아니다`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`index-costs-write 장면: ${what} 이 목록이 아니다`);
  return v.map((x, i) => str(x, `${what}[${i}]`));
}

function spot(p: Record<string, unknown>): Spot {
  return { row: num(p.row, 'row'), page: num(p.page, 'page'), slot: num(p.slot, 'slot') };
}

export const indexCostsWriteScene: ScenePlan<IndexCostsWriteScene> = {
  initial(initialData: unknown): IndexCostsWriteScene {
    const d = rec(initialData);
    const table = rec(d.table);
    const select = rec(d.select);
    const insert = rec(d.insert);
    return {
      base: {
        tableName: str(table.name, 'table.name'),
        sqlSelect: str(select.sql, 'select.sql'),
        sqlInsert: str(insert.sql, 'insert.sql'),
        pages: [],
        perPage: 0,
        indexes: [],
      },
      query: 'none',
      plain: { readPages: [], found: null, reads: null, written: null, writes: null },
      indexed: {
        readIndex: null,
        readLevels: 0,
        readPage: null,
        found: null,
        reads: null,
        written: null,
        writtenLeaves: [],
        writes: null,
      },
      step: { kind: 'none' },
    };
  },

  reduce(scene: IndexCostsWriteScene, event: FacetRuntimeEvent): IndexCostsWriteScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        if (!Array.isArray(p.indexes)) throw new Error('index-costs-write 장면: init.indexes 가 목록이 아니다');
        const raw: unknown[] = p.indexes;
        const indexes = raw.map((x, i) => {
          const r = rec(x);
          return {
            name: str(r.name, `indexes[${i}].name`),
            column: str(r.column, `indexes[${i}].column`),
            height: num(r.height, `indexes[${i}].height`),
          };
        });
        return {
          ...scene,
          base: { ...scene.base, pages: numList(p.pages, 'pages'), perPage: num(p.perPage, 'perPage'), indexes },
          step: { kind: 'none' },
        };
      }
      case 'query': {
        const kind = p.kind === 'select' || p.kind === 'insert' ? p.kind : null;
        if (kind === null) throw new Error('index-costs-write 장면: query.kind 를 모른다');
        return { ...scene, query: kind, step: { kind: 'query' } };
      }
      case 'scan':
        return {
          ...scene,
          plain: { ...scene.plain, readPages: numList(p.pages, 'pages'), found: spot(p), reads: num(p.reads, 'reads') },
          step: { kind: 'scan' },
        };
      case 'seek':
        return {
          ...scene,
          indexed: {
            ...scene.indexed,
            readIndex: str(p.index, 'index'),
            readLevels: num(p.levels, 'levels'),
            readPage: num(p.page, 'page'),
            found: spot(p),
            reads: num(p.reads, 'reads'),
          },
          step: { kind: 'seek' },
        };
      case 'write':
        return {
          ...scene,
          plain: { ...scene.plain, written: spot(p), writes: num(p.writes, 'writes') },
          step: { kind: 'write' },
        };
      case 'fan':
        return {
          ...scene,
          indexed: {
            ...scene.indexed,
            written: spot(p),
            writtenLeaves: strList(p.leaves, 'leaves'),
            writes: num(p.writes, 'writes'),
          },
          step: { kind: 'fan' },
        };
      default:
        return scene;
    }
  },
};
