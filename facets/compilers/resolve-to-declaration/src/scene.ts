/**
 * resolve-to-declaration 의 장면.
 *
 * - 바탕: 줄 글자(initialData) · 스코프 · 선언 · 쓰임의 자리(init 이 한 번 정한다)
 * - 자취: 지금까지 이은 선 (`links`)
 * - 이번 걸음: 이은 쓰임 하나와 찾아본 스코프 (`step`)
 *
 * 이름 찾기는 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneScope = {
  kind: 'top' | 'function' | 'if' | 'for';
  name: string | null;
  head: number | null;
  first: number;
  last: number;
};
export type SceneDecl = { name: string; line: number; col: number; scope: number; slot: number; slots: number };
export type SceneUse = { name: string; line: number; col: number; slot: number; slots: number };
export type SceneLine = { indent: number; text: string };
export type SceneLink = { use: number; decl: number };
export type SceneStep = { use: number; decl: number; looked: number[] };

export type ResolveToDeclarationScene = {
  lines: SceneLine[];
  scopes: SceneScope[];
  decls: SceneDecl[];
  uses: SceneUse[];
  links: SceneLink[];
  step: SceneStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`resolve-to-declaration: ${what} 가 정수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`resolve-to-declaration: ${what} 가 글자가 아니다`);
  return v;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`resolve-to-declaration: ${what} 가 목록이 아니다`);
  return v;
}

function readLines(initialData: unknown): SceneLine[] {
  if (!isRecord(initialData) || initialData.lines === undefined) return [];
  return list(initialData.lines, 'lines').map((l, i) => {
    if (!isRecord(l)) throw new Error(`resolve-to-declaration: L${i + 1} 가 줄이 아니다`);
    return { indent: int(l.indent, `L${i + 1}.indent`), text: str(l.text, `L${i + 1}.text`) };
  });
}

function readScope(v: unknown, i: number): SceneScope {
  if (!isRecord(v)) throw new Error(`resolve-to-declaration: scopes[${i}] 가 객체가 아니다`);
  const kind = v.kind;
  if (kind !== 'top' && kind !== 'function' && kind !== 'if' && kind !== 'for') {
    throw new Error(`resolve-to-declaration: scopes[${i}].kind 를 모른다`);
  }
  return {
    kind,
    name: v.name === null ? null : str(v.name, `scopes[${i}].name`),
    head: v.head === null ? null : int(v.head, `scopes[${i}].head`),
    first: int(v.first, `scopes[${i}].first`),
    last: int(v.last, `scopes[${i}].last`),
  };
}

function readUse(v: unknown, what: string): SceneUse {
  if (!isRecord(v)) throw new Error(`resolve-to-declaration: ${what} 가 객체가 아니다`);
  return {
    name: str(v.name, `${what}.name`),
    line: int(v.line, `${what}.line`),
    col: int(v.col, `${what}.col`),
    slot: int(v.slot, `${what}.slot`),
    slots: int(v.slots, `${what}.slots`),
  };
}

export const resolveToDeclarationScene: ScenePlan<ResolveToDeclarationScene> = {
  initial(initialData: unknown): ResolveToDeclarationScene {
    return { lines: readLines(initialData), scopes: [], decls: [], uses: [], links: [], step: null };
  },

  reduce(scene: ResolveToDeclarationScene, event: FacetRuntimeEvent): ResolveToDeclarationScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p)) throw new Error('resolve-to-declaration: init payload 가 없다');
      return {
        ...scene,
        scopes: list(p.scopes, 'scopes').map(readScope),
        decls: list(p.decls, 'decls').map((d, i) => {
          const u = readUse(d, `decls[${i}]`);
          if (!isRecord(d)) throw new Error(`resolve-to-declaration: decls[${i}] 가 객체가 아니다`);
          return { ...u, scope: int(d.scope, `decls[${i}].scope`) };
        }),
        uses: list(p.uses, 'uses').map((u, i) => readUse(u, `uses[${i}]`)),
        links: [],
        step: null,
      };
    }
    if (event.type === 'resolve') {
      if (!isRecord(p)) throw new Error('resolve-to-declaration: resolve payload 가 없다');
      const use = int(p.use, 'resolve.use');
      const decl = int(p.decl, 'resolve.decl');
      if (use >= scene.uses.length || decl >= scene.decls.length) throw new Error('resolve-to-declaration: 없는 쓰임 · 선언 번호');
      const looked = list(p.looked, 'resolve.looked').map((s, i) => int(s, `resolve.looked[${i}]`));
      return { ...scene, links: [...scene.links, { use, decl }], step: { use, decl, looked } };
    }
    throw new Error(`resolve-to-declaration: 모르는 이벤트 ${event.type}`);
  },
};
