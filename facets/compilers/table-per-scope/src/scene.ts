/**
 * table-per-scope 의 장면.
 *
 * 바탕  — `lines`: 프로그램 줄 (들여쓰기 · 글자 · 문의 종류). `initial()` 이 initialData 에서 베낀다
 * 자취  — `pile`: 지금 쌓여 있는 표 (아래가 맨 바깥). 걸음 0 에 빈 맨 바깥 표 하나가 이미 있다
 *         `cursor`: 읽는 자리 — 그 줄이거나(after: false) 그 줄 뒤(after: true)
 * 이번 걸음 — `step`. `close` 는 걷힌 표를 `was` 로 쥔다 — 그림이 그 표를 들어 올려 치운다
 *
 * 장면은 표 사건을 셈하지 않는다 — 알고리즘이 보낸 사건을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LineKind = 'let' | 'assign' | 'function' | 'return' | 'if' | 'for' | 'show' | 'expr';

export type SceneLine = { indent: number; text: string; k: LineKind };

export type TableKind = 'top' | 'function' | 'if' | 'for';

/** 표에 적힌 한 줄 — 이름과 그 이름이 선언된 줄. */
export type TableRow = { name: string; line: number };

export type ScopeTable = {
  id: string;
  kind: TableKind;
  /** 함수 몸이면 함수 이름. 그 밖에는 null */
  owner: string | null;
  /** 머리줄 번호 (맨 바깥은 0) */
  head: number;
  /** 몸의 마지막 줄 번호 */
  end: number;
  rows: TableRow[];
};

export type TableStep =
  | { kind: 'start' }
  | { kind: 'open'; line: number; id: string; initial: string[] }
  | { kind: 'declare'; line: number; name: string; id: string }
  | { kind: 'close'; line: number; was: ScopeTable };

export type TablePerScopeScene = {
  lines: SceneLine[];
  pile: ScopeTable[];
  cursor: { line: number; after: boolean } | null;
  step: TableStep;
};

const LINE_KINDS: readonly LineKind[] = [
  'let', 'assign', 'function', 'return', 'if', 'for', 'show', 'expr',
];

function isLineKind(v: unknown): v is LineKind {
  return typeof v === 'string' && (LINE_KINDS as readonly string[]).includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 의 줄 목록을 장면 바탕으로 베낀다. 모양이 틀리면 줄 번호를 담아 던진다. */
export function readSceneLines(initialData: unknown): SceneLine[] {
  if (!isRecord(initialData)) throw new Error('initialData 가 없다');
  const raw = initialData.lines;
  if (!Array.isArray(raw)) throw new Error('initialData.lines 가 목록이 아니다');
  return raw.map((item: unknown, i) => {
    if (!isRecord(item)) throw new Error(`L${i + 1}: 줄 모양이 아니다`);
    const { indent, text, stmt } = item;
    if (typeof indent !== 'number' || !Number.isInteger(indent) || indent < 0) {
      throw new Error(`L${i + 1}: indent 가 없다`);
    }
    if (typeof text !== 'string') throw new Error(`L${i + 1}: text 가 없다`);
    if (!isRecord(stmt) || !isLineKind(stmt.k)) throw new Error(`L${i + 1}: 문의 종류를 모른다`);
    return { indent, text, k: stmt.k };
  });
}

function copyTable(t: ScopeTable): ScopeTable {
  return { ...t, rows: t.rows.map((r) => ({ ...r })) };
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`${type}: ${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`${type}: ${key} 가 글자가 아니다`);
  return v;
}

function tableKind(v: unknown): TableKind {
  if (v === 'function' || v === 'if' || v === 'for') return v;
  throw new Error(`open: 모르는 몸 종류 ${String(v)}`);
}

export const tablePerScopeScene: ScenePlan<TablePerScopeScene> = {
  initial(initialData: unknown): TablePerScopeScene {
    const lines = readSceneLines(initialData);
    return {
      lines,
      pile: [{ id: 'top', kind: 'top', owner: null, head: 0, end: lines.length, rows: [] }],
      cursor: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): TablePerScopeScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;
    const pile = scene.pile.map(copyTable);

    if (event.type === 'open') {
      const line = num(p, 'line', 'open');
      const id = str(p, 'id', 'open');
      const end = num(p, 'end', 'open');
      const ownerRaw = p.owner;
      if (ownerRaw !== null && typeof ownerRaw !== 'string') throw new Error('open: owner 모양이 틀렸다');
      const namesRaw = p.names;
      if (!Array.isArray(namesRaw) || !namesRaw.every((n): n is string => typeof n === 'string')) {
        throw new Error('open: names 가 글자 목록이 아니다');
      }
      const names = [...namesRaw];
      pile.push({
        id,
        kind: tableKind(p.kind),
        owner: ownerRaw,
        head: line,
        end,
        rows: names.map((name) => ({ name, line })),
      });
      return { ...scene, pile, cursor: { line, after: false }, step: { kind: 'open', line, id, initial: names } };
    }

    if (event.type === 'declare') {
      const line = num(p, 'line', 'declare');
      const name = str(p, 'name', 'declare');
      const id = str(p, 'id', 'declare');
      const top = pile[pile.length - 1];
      if (top === undefined || top.id !== id) throw new Error(`declare: L${line} 의 ${name} 이 맨 위 표가 아닌 ${id} 에 적힌다`);
      top.rows.push({ name, line });
      return { ...scene, pile, cursor: { line, after: false }, step: { kind: 'declare', line, name, id } };
    }

    if (event.type === 'close') {
      const line = num(p, 'line', 'close');
      const id = str(p, 'id', 'close');
      const top = pile[pile.length - 1];
      if (top === undefined || pile.length < 2 || top.id !== id) throw new Error(`close: 맨 위 표가 ${id} 가 아니다`);
      pile.pop();
      return { ...scene, pile, cursor: { line, after: true }, step: { kind: 'close', line, was: top } };
    }

    return scene;
  },
};
