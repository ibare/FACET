/**
 * multiway-branch 장면.
 *
 * - 바탕: 줄 목록(들여쓰기 · 글자 · 문 종류). `init` 이 한 번 정한다
 * - 자취: 밟은 줄의 차례(`visits`)와 출력(`output`)
 * - 이번 걸음: `step` — 흐름이 어디서(`from`) 어디로(`line`) 왔는가
 *
 * 사슬(어느 줄이 어느 머리의 몸인가)은 바탕에서 결정되므로 장면에 싣지 않고
 * 그림이 `chainsOf` 를 불러 셈한다.
 */
import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

export type LineKind = 'assign' | 'expr' | 'if' | 'elif' | 'else';
export type SceneValue = number | string;

export type SceneLine = { indent: number; text: string; kind: LineKind };

export type SceneTest = { result: boolean; l?: SceneValue; op?: string; r?: SceneValue };

export type Visit = {
  line: number;
  test?: SceneTest;
  assigned?: { name: string; value: SceneValue };
  printed?: string;
};

export type MultiwayBranchStep =
  | { kind: 'start' }
  | ({ kind: 'line'; from: number | null } & Visit);

export type MultiwayBranchScene = {
  lines: SceneLine[];
  visits: Visit[];
  output: string[];
  step: MultiwayBranchStep | null;
};

/** 사슬 하나 — 머리줄들과 각 머리의 몸, 그리고 사슬이 끝나는 줄 */
export type Chain = { heads: number[]; bodies: number[][]; end: number };

/** 머리줄 i 의 몸 전체(더 깊은 줄 포함) */
export function bodyOf(lines: readonly SceneLine[], i: number): number[] {
  const out: number[] = [];
  for (let j = i + 1; j < lines.length && lines[j].indent > lines[i].indent; j += 1) out.push(j);
  return out;
}

/** 맨 바깥의 if / elif / else 사슬들 */
export function chainsOf(lines: readonly SceneLine[]): Chain[] {
  const chains: Chain[] = [];
  let cur: Chain | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.indent !== 0) continue;
    if (l.kind === 'if') {
      cur = { heads: [i], bodies: [bodyOf(lines, i)], end: i };
      chains.push(cur);
    } else if ((l.kind === 'elif' || l.kind === 'else') && cur) {
      cur.heads.push(i);
      cur.bodies.push(bodyOf(lines, i));
    } else {
      cur = null;
      continue;
    }
    const b = cur.bodies[cur.bodies.length - 1];
    cur.end = b.length > 0 ? b[b.length - 1] : i;
  }
  return chains;
}

const KINDS: readonly LineKind[] = ['assign', 'expr', 'if', 'elif', 'else'];

function isSceneValue(v: unknown): v is SceneValue {
  return typeof v === 'number' || typeof v === 'string';
}

function readLines(raw: unknown): SceneLine[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneLine[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const indent: unknown = Reflect.get(item, 'indent');
    const text: unknown = Reflect.get(item, 'text');
    const kind: unknown = Reflect.get(item, 'kind');
    if (typeof indent !== 'number' || typeof text !== 'string' || typeof kind !== 'string') continue;
    const found = KINDS.find((k) => k === kind);
    if (!found) continue;
    out.push({ indent, text, kind: found });
  }
  return out;
}

function readVisit(p: object): Visit | null {
  const line: unknown = Reflect.get(p, 'line');
  if (typeof line !== 'number') return null;
  const visit: Visit = { line };
  const test: unknown = Reflect.get(p, 'test');
  if (typeof test === 'object' && test !== null) {
    const result: unknown = Reflect.get(test, 'result');
    if (typeof result === 'boolean') {
      const t: SceneTest = { result };
      const l: unknown = Reflect.get(test, 'l');
      const op: unknown = Reflect.get(test, 'op');
      const r: unknown = Reflect.get(test, 'r');
      if (isSceneValue(l) && typeof op === 'string' && isSceneValue(r)) {
        t.l = l;
        t.op = op;
        t.r = r;
      }
      visit.test = t;
    }
  }
  const assigned: unknown = Reflect.get(p, 'assigned');
  if (typeof assigned === 'object' && assigned !== null) {
    const name: unknown = Reflect.get(assigned, 'name');
    const value: unknown = Reflect.get(assigned, 'value');
    if (typeof name === 'string' && isSceneValue(value)) visit.assigned = { name, value };
  }
  const printed: unknown = Reflect.get(p, 'printed');
  if (typeof printed === 'string') visit.printed = printed;
  return visit;
}

export const multiwayBranchScene: ScenePlan<MultiwayBranchScene> = {
  initial(): MultiwayBranchScene {
    return { lines: [], visits: [], output: [], step: null };
  },
  reduce(scene: MultiwayBranchScene, event: FacetRuntimeEvent): MultiwayBranchScene {
    const p = event.payload;
    if (event.type === 'init') {
      const raw: unknown = typeof p === 'object' && p !== null ? Reflect.get(p, 'lines') : undefined;
      return { lines: readLines(raw), visits: [], output: [], step: { kind: 'start' } };
    }
    if (event.type === 'step') {
      if (typeof p !== 'object' || p === null) return scene;
      const visit = readVisit(p);
      if (!visit || visit.line < 0 || visit.line >= scene.lines.length) return scene;
      const last = scene.visits[scene.visits.length - 1];
      return {
        lines: scene.lines,
        visits: [...scene.visits, visit],
        output: visit.printed !== undefined ? [...scene.output, visit.printed] : scene.output,
        step: { kind: 'line', from: last ? last.line : null, ...visit },
      };
    }
    return scene;
  },
};
