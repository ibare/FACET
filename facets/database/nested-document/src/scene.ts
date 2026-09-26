/**
 * nested-document 장면.
 *
 *   바탕 — 표 셋(이름 · 열 · 줄 값)과 표마다 잇는 데만 쓰인 열. `initial()` 이 initialData 에서 채운다
 *   자취 — 접혀 나간 줄 표시(`folded`)와 자라는 문서(`doc`)
 *   이번 걸음 — `step`. 접힌 줄이면 어느 표 몇 번째 줄이 어디로 들어갔는지를 싣는다
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 값을 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { linkColumns, type CellValue, type NestedDocumentFacetData } from './algorithm.js';

export type SceneCell = { name: string; value: CellValue };

export type SceneTable = {
  name: string;
  columns: string[];
  rows: CellValue[][];
  /** 잇는 데만 쓰인 열 — 접히면 사라지는 칸 */
  links: string[];
  /** 줄마다 접혀 나갔는가 */
  folded: boolean[];
};

export type DocMember = { table: number; row: number; fields: SceneCell[] };

export type DocNested =
  | { kind: 'object'; field: string; member: DocMember }
  | { kind: 'array'; field: string; members: DocMember[] };

export type SceneDoc = {
  /** 껍질이 된 뿌리 줄 */
  table: number;
  row: number;
  fields: SceneCell[];
  /** 아직 바깥을 가리키는 열쇠 칸 */
  links: SceneCell[];
  nested: DocNested[];
};

export type NestedStep =
  | { kind: 'start' }
  | { kind: 'shell'; table: number; row: number }
  | {
      kind: 'fold';
      table: number;
      row: number;
      field: string;
      nest: 'object' | 'array';
      slot: number;
      dropped: SceneCell[];
      resolved: SceneCell[];
    }
  | { kind: 'done'; docs: number; rows: number; tables: number; links: number; left: number };

export type NestedDocumentScene = {
  /** 접을 주문의 열쇠 값 — 바탕 */
  rootValue: CellValue;
  tables: SceneTable[];
  doc: SceneDoc | null;
  step: NestedStep;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`nested-document 장면: ${k} 는 수여야 한다`);
  return v;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`nested-document 장면: ${k} 는 글자여야 한다`);
  return v;
}

function cells(p: Record<string, unknown>, k: string): SceneCell[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`nested-document 장면: ${k} 는 배열이어야 한다`);
  return v.map((c: unknown) => {
    if (!isObj(c)) throw new Error(`nested-document 장면: ${k} 의 칸 모양이 아니다`);
    const name = c['name'];
    const value = c['value'];
    if (typeof name !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) {
      throw new Error(`nested-document 장면: ${k} 의 칸 모양이 아니다`);
    }
    return { name, value };
  });
}

function narrowData(raw: unknown): NestedDocumentFacetData {
  if (!isObj(raw) || raw['type'] !== 'nested-document' || !Array.isArray(raw['tables'])) {
    throw new Error('nested-document 장면: initialData 모양이 아니다');
  }
  const tables = (raw['tables'] as unknown[]).map((tb) => {
    if (!isObj(tb) || typeof tb['name'] !== 'string' || !Array.isArray(tb['columns']) || !Array.isArray(tb['rows'])) {
      throw new Error('nested-document 장면: 표 모양이 아니다');
    }
    const columns = (tb['columns'] as unknown[]).map((c) => {
      if (typeof c !== 'string') throw new Error('nested-document 장면: 열 이름은 글자여야 한다');
      return c;
    });
    const rows = (tb['rows'] as unknown[]).map((r) => {
      if (!Array.isArray(r) || r.length !== columns.length) {
        throw new Error(`nested-document 장면: 표 "${tb['name']}" 의 줄 칸 수가 열 수와 다르다`);
      }
      return r.map((v: unknown) => {
        if (typeof v !== 'string' && typeof v !== 'number') {
          throw new Error('nested-document 장면: 칸 값은 글자나 수여야 한다');
        }
        return v;
      });
    });
    return { name: tb['name'], columns, rows };
  });
  const root = raw['root'];
  const embeds = raw['embeds'];
  if (!isObj(root) || !Array.isArray(embeds)) {
    throw new Error('nested-document 장면: root · embeds 가 없다');
  }
  const rootValue = root['value'];
  if (typeof rootValue !== 'string' && typeof rootValue !== 'number') {
    throw new Error('nested-document 장면: root.value 모양이 아니다');
  }
  return {
    type: 'nested-document',
    stepMs: num(raw, 'stepMs'),
    tables,
    root: { table: str(root, 'table'), key: str(root, 'key'), value: rootValue },
    embeds: (embeds as unknown[]).map((e) => {
      if (!isObj(e)) throw new Error('nested-document 장면: embed 모양이 아니다');
      const kind = e['kind'];
      if (kind !== 'object' && kind !== 'array') throw new Error('nested-document 장면: embed.kind 모양이 아니다');
      return { field: str(e, 'field'), kind, table: str(e, 'table'), key: str(e, 'key'), ref: str(e, 'ref') };
    }),
  };
}

function copyMember(m: DocMember): DocMember {
  return { table: m.table, row: m.row, fields: m.fields.map((c) => ({ ...c })) };
}

function copyDoc(d: SceneDoc): SceneDoc {
  return {
    table: d.table,
    row: d.row,
    fields: d.fields.map((c) => ({ ...c })),
    links: d.links.map((c) => ({ ...c })),
    nested: d.nested.map((n) =>
      n.kind === 'object'
        ? { kind: 'object', field: n.field, member: copyMember(n.member) }
        : { kind: 'array', field: n.field, members: n.members.map(copyMember) },
    ),
  };
}

function markFolded(tables: SceneTable[], table: number, row: number): SceneTable[] {
  return tables.map((tb, i) =>
    i === table ? { ...tb, folded: tb.folded.map((f, r) => f || r === row) } : tb,
  );
}

export const nestedDocumentScene: ScenePlan<NestedDocumentScene> = {
  initial(initialData: unknown): NestedDocumentScene {
    const data = narrowData(initialData);
    const links = linkColumns(data);
    return {
      rootValue: data.root.value,
      tables: data.tables.map((tb, i) => ({
        name: tb.name,
        columns: [...tb.columns],
        rows: tb.rows.map((r) => [...r]),
        links: [...links[i]!],
        folded: tb.rows.map(() => false),
      })),
      doc: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: NestedDocumentScene, event: FacetRuntimeEvent): NestedDocumentScene {
    const p = event.payload;
    if (event.type === 'shell') {
      if (!isObj(p)) throw new Error('nested-document 장면: shell payload 가 없다');
      const table = num(p, 'table');
      const row = num(p, 'row');
      return {
        rootValue: scene.rootValue,
        tables: markFolded(scene.tables, table, row),
        doc: { table, row, fields: cells(p, 'fields'), links: cells(p, 'links'), nested: [] },
        step: { kind: 'shell', table, row },
      };
    }
    if (event.type === 'fold') {
      if (!isObj(p)) throw new Error('nested-document 장면: fold payload 가 없다');
      if (scene.doc === null) throw new Error('nested-document 장면: 껍질 없이 접을 수 없다');
      const table = num(p, 'table');
      const row = num(p, 'row');
      const field = str(p, 'field');
      const nest = p['kind'];
      if (nest !== 'object' && nest !== 'array') throw new Error('nested-document 장면: fold.kind 모양이 아니다');
      const slot = num(p, 'slot');
      const dropped = cells(p, 'dropped');
      const resolved = cells(p, 'resolved');
      const member: DocMember = { table, row, fields: cells(p, 'fields') };
      const doc = copyDoc(scene.doc);
      doc.links = doc.links.filter((l) => !resolved.some((r) => r.name === l.name));
      if (nest === 'object') {
        doc.nested.push({ kind: 'object', field, member });
      } else {
        const arr = doc.nested.find((n) => n.kind === 'array' && n.field === field);
        if (arr !== undefined && arr.kind === 'array') arr.members.push(member);
        else doc.nested.push({ kind: 'array', field, members: [member] });
      }
      return {
        rootValue: scene.rootValue,
        tables: markFolded(scene.tables, table, row),
        doc,
        step: { kind: 'fold', table, row, field, nest, slot, dropped, resolved },
      };
    }
    if (event.type === 'done') {
      if (!isObj(p)) throw new Error('nested-document 장면: done payload 가 없다');
      return {
        rootValue: scene.rootValue,
        tables: scene.tables,
        doc: scene.doc === null ? null : copyDoc(scene.doc),
        step: {
          kind: 'done',
          docs: num(p, 'docs'),
          rows: num(p, 'rows'),
          tables: num(p, 'tables'),
          links: num(p, 'links'),
          left: num(p, 'left'),
        },
      };
    }
    throw new Error(`nested-document 장면: 모르는 이벤트 ${event.type}`);
  },
};
