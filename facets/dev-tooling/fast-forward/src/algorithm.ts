/**
 * fast-forward — 합칠 쪽이 앞서 있기만 하면 병합은 이름표 하나를 옮길 뿐이다.
 *
 * 받는 쪽 이름(`into`)이 합칠 쪽 이름(`from`)의 줄기에서 조상 자리에 있는지 본다. 합칠 쪽의
 * 커밋에서 첫 부모를 따라 거슬러 가다 받는 쪽의 커밋을 만나면 조상이다(병합 기준점 = 그 커밋).
 * 그러면 받는 쪽 이름표가 새 커밋 없이 합칠 쪽의 커밋으로 한 번에 건너간다.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음씩)
 * - `judge`  { from: string; into: string; path: string[]; base: string }
 *            합칠 쪽 이름 `from` 의 커밋에서 거슬러 간 길(`path`, 받는 쪽 커밋에서 끝난다)과 병합 기준점 `base`
 * - `jump`   { name: string; from: string; to: string; crossed: string[] }
 *            이름 `name` 이 커밋 `from` → `to` 로 한 번에 옮겨진다. `crossed` 는 건넌 커밋(가까운 것부터)
 * - `tally`  { made: number; moved: number; reach: number; before: number; after: number }
 *            새 커밋 수 · 옮긴 이름 수 · 받는 쪽에서 새로 닿는 커밋 수 · 병합 앞뒤의 커밋 수
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (커밋 다섯 · 이름 둘 · HEAD).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FastForwardCommit = { id: string; parents: string[] };
export type FastForwardBranch = { name: string; at: string };

export type FastForwardFacetData = {
  type: 'fast-forward';
  stepMs: number;
  commits: FastForwardCommit[];
  branches: FastForwardBranch[];
  head: string;
  merge: { from: string; into: string };
};

function fail(where: string, what: string): never {
  throw new Error(`fast-forward: ${where} — ${what}`);
}

function readString(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') fail(where, '비어 있지 않은 글자가 아니다');
  return v;
}

/** initialData 를 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
export function readFastForwardData(raw: unknown): FastForwardFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'fast-forward') fail('initialData.type', `'fast-forward' 가 아니다`);
  const stepMs = r.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) fail('initialData.stepMs', '양수가 아니다');
  if (!Array.isArray(r.commits) || r.commits.length === 0) fail('initialData.commits', '비어 있지 않은 배열이 아니다');
  const commits: FastForwardCommit[] = r.commits.map((c: unknown, i: number) => {
    if (typeof c !== 'object' || c === null) fail(`initialData.commits[${i}]`, '객체가 아니다');
    const o = c as Record<string, unknown>;
    const id = readString(o.id, `initialData.commits[${i}].id`);
    if (!Array.isArray(o.parents)) fail(`initialData.commits[${i}].parents`, '배열이 아니다');
    if (o.parents.length > 1) fail(`initialData.commits[${i}].parents`, `병합 커밋 ${id} 는 이 조각의 모형에 없다`);
    const parents = o.parents.map((p: unknown, j: number) => readString(p, `initialData.commits[${i}].parents[${j}]`));
    return { id, parents };
  });
  const ids = new Set<string>();
  for (const c of commits) {
    if (ids.has(c.id)) fail('initialData.commits', `커밋 ${c.id} 가 두 번 나온다`);
    ids.add(c.id);
  }
  for (const c of commits) {
    for (const p of c.parents) if (!ids.has(p)) fail(`initialData.commits.${c.id}.parents`, `없는 부모 ${p}`);
  }
  if (!Array.isArray(r.branches) || r.branches.length === 0) fail('initialData.branches', '비어 있지 않은 배열이 아니다');
  const branches: FastForwardBranch[] = r.branches.map((b: unknown, i: number) => {
    if (typeof b !== 'object' || b === null) fail(`initialData.branches[${i}]`, '객체가 아니다');
    const o = b as Record<string, unknown>;
    const name = readString(o.name, `initialData.branches[${i}].name`);
    const at = readString(o.at, `initialData.branches[${i}].at`);
    if (!ids.has(at)) fail(`initialData.branches[${i}].at`, `없는 커밋 ${at}`);
    return { name, at };
  });
  const names = new Set(branches.map((b) => b.name));
  if (names.size !== branches.length) fail('initialData.branches', '같은 이름이 두 번 나온다');
  const head = readString(r.head, 'initialData.head');
  if (!names.has(head)) fail('initialData.head', `없는 이름 ${head}`);
  if (typeof r.merge !== 'object' || r.merge === null) fail('initialData.merge', '객체가 아니다');
  const m = r.merge as Record<string, unknown>;
  const from = readString(m.from, 'initialData.merge.from');
  const into = readString(m.into, 'initialData.merge.into');
  if (!names.has(from)) fail('initialData.merge.from', `없는 이름 ${from}`);
  if (!names.has(into)) fail('initialData.merge.into', `없는 이름 ${into}`);
  if (from === into) fail('initialData.merge', '합칠 쪽과 받는 쪽이 같다');
  return { type: 'fast-forward', stepMs, commits, branches, head, merge: { from, into } };
}

function parentOf(commits: readonly FastForwardCommit[], id: string): string | null {
  const c = commits.find((x) => x.id === id);
  if (!c) fail('parentOf', `없는 커밋 ${id}`);
  if (c.parents.length > 1) fail('parentOf', `병합 커밋 ${id}`);
  return c.parents.length === 0 ? null : c.parents[0] ?? fail('parentOf', `${id} 의 부모 자리가 비었다`);
}

/** start 에서 첫 부모를 따라 뿌리까지 거슬러 간 차례 (start 포함, 이미 본 커밋에서 멈춘다). */
export function firstParentWalk(commits: readonly FastForwardCommit[], start: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  let cur: string | null = start;
  while (cur !== null) {
    if (seen.has(cur)) fail('firstParentWalk', `커밋 ${cur} 에서 고리가 생긴다`);
    seen.add(cur);
    order.push(cur);
    cur = parentOf(commits, cur);
  }
  return order;
}

function branchAt(data: FastForwardFacetData, name: string): string {
  const b = data.branches.find((x) => x.name === name);
  if (!b) fail('branchAt', `없는 이름 ${name}`);
  return b.at;
}

export type FastForwardPlan = {
  /** 합칠 쪽 커밋에서 받는 쪽 커밋까지 거슬러 간 길 */
  path: string[];
  /** 병합 기준점 — 받는 쪽 커밋 자체 */
  base: string;
  /** 받는 쪽 이름이 옮겨 갈 커밋 */
  target: string;
  /** 건넌 커밋 — 받는 쪽에서 새로 닿는 것 (가까운 것부터) */
  crossed: string[];
};

/** 빨리 감기가 되는지 판정하고 셈한다. 받는 쪽이 조상이 아니면 이 조각의 경우가 아니라 던진다. */
export function planFastForward(data: FastForwardFacetData): FastForwardPlan {
  const target = branchAt(data, data.merge.from);
  const base = branchAt(data, data.merge.into);
  const walk = firstParentWalk(data.commits, target);
  const at = walk.indexOf(base);
  if (at < 0) fail('planFastForward', `${data.merge.into} 의 커밋 ${base} 가 ${data.merge.from} 의 줄기에 없다 — 갈라진 경우다`);
  const path = walk.slice(0, at + 1);
  const already = new Set(firstParentWalk(data.commits, base));
  const crossed = path.filter((c) => !already.has(c)).reverse();
  return { path, base, target, crossed };
}

export async function fastForward(ctxIn: FacetContext<FastForwardFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<FastForwardFacetData>;
  const data = readFastForwardData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const plan = planFastForward(data);
  const before = data.commits.length;

  // 걸음 0 (커밋 다섯 · 이름 둘) 을 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({
    type: 'judge',
    payload: { from: data.merge.from, into: data.merge.into, path: plan.path, base: plan.base },
  });

  if (!(await pause())) return;
  // 이름표 하나만 옮긴다 — 커밋 목록은 손대지 않는다
  const moved = [data.merge.into];
  await ctx.emit({
    type: 'jump',
    payload: { name: data.merge.into, from: plan.base, to: plan.target, crossed: plan.crossed },
  });

  if (!(await pause())) return;
  const after = data.commits.length;
  await ctx.emit({
    type: 'tally',
    payload: { made: after - before, moved: moved.length, reach: plan.crossed.length, before, after },
  });
}
