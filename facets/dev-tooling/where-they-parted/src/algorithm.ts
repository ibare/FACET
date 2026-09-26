/**
 * where-they-parted — 두 끝에서 거슬러 내려온 표시가 처음 겹치는 곳 (merge-base).
 *
 * 처음: 이름마다 그 이름이 가리키는 커밋에 제 표시를 붙이고, 그 커밋을 꺼낼 줄에 넣는다.
 * 걸음 하나: 줄에서 **시각이 가장 늦은** 커밋 하나를 꺼낸다. 표시를 모두 가졌으면 그것이
 * 갈라진 자리라 멈춘다. 아니면 제 표시를 부모마다 넘기고 부모를 줄에 넣는다 (한 번만).
 *
 * 걸음 0 은 장면의 `initial()` 이 자료에서 세운다 (커밋 · 이름 · 끝의 표시 · 줄).
 * 알고리즘은 그 화면을 읽을 틈(`stepMs`)을 둔 뒤 첫 걸음을 낸다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `take`
 *   payload: {
 *     commit: string;                 꺼낸 커밋
 *     given: { parent: string;        표시를 받은 부모
 *              added: string[];       이번에 새로 받은 표시 (이름 차례)
 *              has: string[] }[];     받은 뒤 그 부모가 가진 표시 전부 (이름 차례)
 *     queue: string[];                걸음 뒤의 줄 (시각이 늦은 차례)
 *   }
 * - `found`
 *   payload: {
 *     commit: string;                 표시를 모두 가진 채 꺼낸 커밋 — 갈라진 자리
 *     queue: string[];                걸음 뒤의 줄
 *     distances: { name: string;      이름
 *                  steps: number;     그 끝에서 첫 부모를 따라 내려온 거리
 *                  path: string[] }[];끝에서 갈라진 자리까지 지나는 커밋 (양 끝 포함)
 *     taken: number;                  꺼낸 커밋 수 (갈라진 자리 포함)
 *   }
 *
 * 부모가 둘 이상인 커밋 · 없는 부모 · 두 번 나오는 커밋 · 공통 조상 없음은 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CommitSpec = { id: string; parents: string[]; time: number };
export type NameSpec = { name: string; commit: string };

export type WhereTheyPartedFacetData = {
  type: 'where-they-parted';
  stepMs: number;
  commits: CommitSpec[];
  names: NameSpec[];
};

function fail(path: string, what: string): never {
  throw new Error(`where-they-parted: ${path} — ${what}`);
}

function readString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '빈 글자가 아닌 문자열이어야 한다');
  return v;
}

/** 자료를 좁힌다. 모르는 모양 · 셈할 수 없는 자료는 경로를 담아 던진다 (C6). */
export function readWhereTheyPartedData(raw: unknown): WhereTheyPartedFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'where-they-parted') fail('initialData.type', `'where-they-parted' 가 아니다`);
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) fail('initialData.stepMs', '양수가 아니다');
  if (!Array.isArray(o.commits) || o.commits.length === 0) fail('initialData.commits', '비어 있지 않은 배열이 아니다');
  if (!Array.isArray(o.names)) fail('initialData.names', '배열이 아니다');

  const seen = new Set<string>();
  const commits: CommitSpec[] = o.commits.map((c: unknown, i: number) => {
    const p = `initialData.commits[${i}]`;
    if (typeof c !== 'object' || c === null) fail(p, '객체가 아니다');
    const r = c as Record<string, unknown>;
    const id = readString(r.id, `${p}.id`);
    if (seen.has(id)) fail(`${p}.id`, `커밋 ${id} 가 두 번 나온다`);
    seen.add(id);
    if (!Array.isArray(r.parents)) fail(`${p}.parents`, '배열이 아니다');
    const parents = r.parents.map((q: unknown, j: number) => readString(q, `${p}.parents[${j}]`));
    if (parents.length > 1) fail(`${p}.parents`, `병합 커밋 ${id} 는 이 조각의 모형에 없다`);
    if (typeof r.time !== 'number' || !Number.isInteger(r.time)) fail(`${p}.time`, '정수가 아니다');
    return { id, parents, time: r.time };
  });
  for (const c of commits) {
    for (const q of c.parents) if (!seen.has(q)) fail(`initialData.commits.${c.id}.parents`, `없는 부모 ${q}`);
  }
  const times = new Set(commits.map((c) => c.time));
  if (times.size !== commits.length) fail('initialData.commits', '시각이 같은 커밋이 있다 — 꺼낼 차례가 정해지지 않는다');

  const names: NameSpec[] = o.names.map((n: unknown, i: number) => {
    const p = `initialData.names[${i}]`;
    if (typeof n !== 'object' || n === null) fail(p, '객체가 아니다');
    const r = n as Record<string, unknown>;
    const name = readString(r.name, `${p}.name`);
    const commit = readString(r.commit, `${p}.commit`);
    if (!seen.has(commit)) fail(`${p}.commit`, `없는 커밋 ${commit}`);
    return { name, commit };
  });
  if (names.length !== 2) fail('initialData.names', '이름은 둘이어야 한다');
  if (names[0]!.name === names[1]!.name) fail('initialData.names', '두 이름이 같다');

  return { type: 'where-they-parted', stepMs: o.stepMs, commits, names };
}

function commitOf(commits: readonly CommitSpec[], id: string): CommitSpec {
  const c = commits.find((x) => x.id === id);
  if (c === undefined) fail('commits', `없는 커밋 ${id}`);
  return c;
}

/** 이름 차례로 표시를 늘어놓는다. */
export function orderMarks(names: readonly NameSpec[], marks: Iterable<string>): string[] {
  const set = new Set(marks);
  return names.map((n) => n.name).filter((n) => set.has(n));
}

/** 줄을 꺼낼 차례로 — 시각이 늦은 것부터. */
export function sortLine(commits: readonly CommitSpec[], line: readonly string[]): string[] {
  return [...line].sort((a, b) => commitOf(commits, b).time - commitOf(commits, a).time);
}

/** 처음: 끝마다 제 표시, 줄에는 끝들. 장면의 걸음 0 과 알고리즘이 같은 셈을 쓴다. */
export function startState(
  commits: readonly CommitSpec[],
  names: readonly NameSpec[],
): { marks: Map<string, string[]>; line: string[] } {
  const marks = new Map<string, string[]>(commits.map((c) => [c.id, [] as string[]]));
  const line: string[] = [];
  for (const n of names) {
    const cur = marks.get(n.commit);
    if (cur === undefined) fail('names', `없는 커밋 ${n.commit}`);
    marks.set(n.commit, orderMarks(names, [...cur, n.name]));
    if (!line.includes(n.commit)) line.push(n.commit);
  }
  return { marks, line: sortLine(commits, line) };
}

/** 끝에서 첫 부모를 따라 내려가는 커밋들 (끝 포함, 뿌리까지). */
export function firstParentWalk(commits: readonly CommitSpec[], tip: string): string[] {
  const out: string[] = [];
  let cur: string | undefined = tip;
  while (cur !== undefined) {
    if (out.includes(cur)) fail('commits', `고리가 있다 (${cur})`);
    out.push(cur);
    cur = commitOf(commits, cur).parents[0];
  }
  return out;
}

/** 커밋마다 그것에 닿는 이름들 (이름 차례). 그림이 줄기를 나눌 때 쓴다. */
export function reachingNames(commits: readonly CommitSpec[], names: readonly NameSpec[]): Map<string, string[]> {
  const out = new Map<string, string[]>(commits.map((c) => [c.id, [] as string[]]));
  for (const n of names) {
    for (const id of firstParentWalk(commits, n.commit)) {
      const cur = out.get(id);
      if (cur === undefined) fail('commits', `없는 커밋 ${id}`);
      cur.push(n.name);
    }
  }
  return out;
}

export async function whereTheyParted(ctx: FacetContext<WhereTheyPartedFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<WhereTheyPartedFacetData>;
  const data = readWhereTheyPartedData(rctx.data);
  const { stepMs, commits, names } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const { marks, line } = startState(commits, names);
  let taken = 0;

  while (line.length > 0) {
    // 걸음 0(바탕 · 두 끝의 표시)을 읽을 틈을 두고, 걸음마다 머문다
    if (!(await pause())) return;
    const sorted = sortLine(commits, line);
    const cur = sorted[0]!;
    line.splice(0, line.length, ...sorted.slice(1));
    taken += 1;
    const have = marks.get(cur);
    if (have === undefined) fail('marks', `없는 커밋 ${cur}`);

    if (have.length === names.length) {
      const distances = names.map((n) => {
        const walk = firstParentWalk(commits, n.commit);
        const at = walk.indexOf(cur);
        if (at < 0) fail('distances', `${cur} 는 ${n.name} 의 첫 부모 줄기에 없다`);
        return { name: n.name, steps: at, path: walk.slice(0, at + 1) };
      });
      await rctx.emit({
        type: 'found',
        payload: { commit: cur, queue: [...line], distances, taken },
      });
      return;
    }

    const given: { parent: string; added: string[]; has: string[] }[] = [];
    for (const parent of commitOf(commits, cur).parents) {
      if (rctx.cancelled) return;
      const before = marks.get(parent);
      if (before === undefined) fail('marks', `없는 부모 ${parent}`);
      const has = orderMarks(names, [...before, ...have]);
      const added = has.filter((m) => !before.includes(m));
      marks.set(parent, has);
      if (!line.includes(parent)) line.push(parent);
      given.push({ parent, added, has });
    }
    const queue = sortLine(commits, line);
    line.splice(0, line.length, ...queue);
    await rctx.emit({ type: 'take', payload: { commit: cur, given, queue } });
  }
  fail('line', '줄이 비었는데 표시를 모두 가진 커밋이 없다 — 공통 조상이 없다');
}
