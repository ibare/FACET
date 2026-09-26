/**
 * unreachable-snapshot — 어느 이름에서도 닿지 않는 커밋만 치워진다.
 *
 * 일어나는 일(이름 지우기 · 이름 되돌리기)을 데이터 차례대로 겪는다. 이름이 떠나도 커밋은
 * 그대로다. 치우기 때가 오면 남은 이름마다 그 이름의 커밋에서 첫 부모를 따라 거슬러 가며
 * 표시를 붙이고, 이미 표시된 커밋을 만나면 그 이름의 길은 멈춘다. 표시가 끝나면 표시 없는
 * 커밋을 한 걸음에 모두 치운다.
 *
 * 이벤트 (모두 걸음이다 — silent 없음):
 *   delete-name  { name: string; at: string }
 *       이름 name 을 지운다. at 은 그 이름이 가리키던 커밋이다.
 *   move-name    { name: string; from: string; to: string }
 *       이름 name 을 커밋 from 에서 to 로 되돌린다.
 *   mark         { name: string; commit: string; via: string | null; halt: string | null }
 *       name 에서 출발한 길이 commit 에 표시를 붙인다. via 는 이 길에서 바로 앞에 표시한
 *       자식 커밋 (null 이면 이름에서 곧바로 내려온 첫 표시). halt 는 다음 부모가 이미 표시되어
 *       이 길이 멈췄을 때 그 부모 (멈춤은 걸음이 아니라 이 걸음에 딸린다).
 *   sweep        { gone: string[] }
 *       표시 없는 커밋을 데이터 차례로 모두 치운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HistoryCommit = { id: string; parents: string[] };
export type HistoryName = { name: string; at: string };
export type Happening =
  | { kind: 'delete'; name: string }
  | { kind: 'move'; name: string; to: string };

export type UnreachableSnapshotFacetData = {
  type: 'unreachable-snapshot';
  commits: HistoryCommit[];
  names: HistoryName[];
  happenings: Happening[];
  stepMs: number;
};

export type History = {
  commits: HistoryCommit[];
  names: HistoryName[];
  happenings: Happening[];
  stepMs: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`unreachable-snapshot: ${path} 는 빈 칸 아닌 글자여야 한다`);
  }
  return v;
}

function needArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`unreachable-snapshot: ${path} 는 배열이어야 한다`);
  return v;
}

/**
 * initialData 를 좁혀 값을 베낀다. 모르는 모양 · 없는 부모 · 병합 커밋 · 없는 이름은 던진다.
 * 커밋은 부모가 먼저 나오는 차례여야 한다 (차례가 곧 만들어진 차례다).
 */
export function readHistory(raw: unknown): History {
  if (!isRecord(raw)) throw new Error('unreachable-snapshot: initialData 가 객체가 아니다');
  if (raw['type'] !== 'unreachable-snapshot') {
    throw new Error(`unreachable-snapshot: initialData.type 이 다르다 (${String(raw['type'])})`);
  }
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('unreachable-snapshot: initialData.stepMs 는 0 이상의 수여야 한다');
  }

  const seen = new Set<string>();
  const commits: HistoryCommit[] = needArray(raw['commits'], 'commits').map((c, i) => {
    if (!isRecord(c)) throw new Error(`unreachable-snapshot: commits[${i}] 가 객체가 아니다`);
    const id = needString(c['id'], `commits[${i}].id`);
    if (seen.has(id)) throw new Error(`unreachable-snapshot: commits[${i}].id ${id} 가 두 번 나온다`);
    const parents = needArray(c['parents'], `commits[${i}].parents`).map((p, j) =>
      needString(p, `commits[${i}].parents[${j}]`),
    );
    if (parents.length > 1) {
      throw new Error(`unreachable-snapshot: commits[${i}] (${id}) 는 병합 커밋이다 — 이 조각의 모형에 없다`);
    }
    for (const p of parents) {
      if (!seen.has(p)) {
        throw new Error(`unreachable-snapshot: commits[${i}] (${id}) 의 부모 ${p} 가 앞에 없다`);
      }
    }
    seen.add(id);
    return { id, parents };
  });

  const nameSeen = new Set<string>();
  const names: HistoryName[] = needArray(raw['names'], 'names').map((n, i) => {
    if (!isRecord(n)) throw new Error(`unreachable-snapshot: names[${i}] 가 객체가 아니다`);
    const name = needString(n['name'], `names[${i}].name`);
    const at = needString(n['at'], `names[${i}].at`);
    if (nameSeen.has(name)) throw new Error(`unreachable-snapshot: names[${i}] ${name} 가 두 번 나온다`);
    if (!seen.has(at)) throw new Error(`unreachable-snapshot: names[${i}] (${name}) 의 커밋 ${at} 가 없다`);
    nameSeen.add(name);
    return { name, at };
  });

  const happenings: Happening[] = needArray(raw['happenings'], 'happenings').map((h, i) => {
    if (!isRecord(h)) throw new Error(`unreachable-snapshot: happenings[${i}] 가 객체가 아니다`);
    const kind = h['kind'];
    const name = needString(h['name'], `happenings[${i}].name`);
    if (kind === 'delete') return { kind: 'delete', name };
    if (kind === 'move') {
      const to = needString(h['to'], `happenings[${i}].to`);
      if (!seen.has(to)) throw new Error(`unreachable-snapshot: happenings[${i}].to 커밋 ${to} 가 없다`);
      return { kind: 'move', name, to };
    }
    throw new Error(`unreachable-snapshot: happenings[${i}].kind 를 모른다 (${String(kind)})`);
  });

  return { commits, names, happenings, stepMs };
}

/** 커밋 id → 첫 부모 (뿌리면 null). 없는 커밋은 던진다. */
export function firstParent(commits: readonly HistoryCommit[], id: string): string | null {
  const c = commits.find((x) => x.id === id);
  if (!c) throw new Error(`unreachable-snapshot: 커밋 ${id} 가 없다`);
  if (c.parents.length > 1) throw new Error(`unreachable-snapshot: 커밋 ${id} 는 병합 커밋이다`);
  return c.parents[0] ?? null;
}

export async function unreachableSnapshot(
  context: FacetContext<UnreachableSnapshotFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<UnreachableSnapshotFacetData>;
  const history = readHistory(ctx.data);
  const stepMs = history.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 이름표 — 데이터 차례를 지킨다 (표시할 때의 이름 차례다)
  const names: HistoryName[] = history.names.map((n) => ({ ...n }));

  // 걸음 0 은 이미 읽을 것(커밋 · 이름)이 있는 화면이라 첫 걸음 앞에도 문을 둔다
  for (const h of history.happenings) {
    if (!(await pause())) return;
    const i = names.findIndex((n) => n.name === h.name);
    const current = names[i];
    if (!current) throw new Error(`unreachable-snapshot: 이름 ${h.name} 가 지금 없다`);
    if (h.kind === 'delete') {
      names.splice(i, 1);
      await ctx.emit({ type: 'delete-name', payload: { name: current.name, at: current.at } });
    } else {
      const from = current.at;
      names[i] = { name: current.name, at: h.to };
      await ctx.emit({ type: 'move-name', payload: { name: current.name, from, to: h.to } });
    }
  }

  // 표시 — 이름 차례대로, 첫 부모를 따라 거슬러 간다
  const marked = new Set<string>();
  for (const n of names) {
    if (ctx.cancelled) return;
    if (marked.has(n.at)) {
      // 멈춤은 앞 걸음에 딸려 보이는데, 이름의 커밋부터 이미 표시돼 있으면 딸릴 걸음이 없다
      throw new Error(`unreachable-snapshot: 이름 ${n.name} 의 커밋 ${n.at} 가 이미 표시돼 있다 — 이 조각이 그리는 모양이 아니다`);
    }
    let commit: string | null = n.at;
    let via: string | null = null;
    while (commit !== null) {
      if (!(await pause())) return;
      marked.add(commit);
      const next = firstParent(history.commits, commit);
      const halt = next !== null && marked.has(next) ? next : null;
      await ctx.emit({ type: 'mark', payload: { name: n.name, commit, via, halt } });
      if (halt !== null) break;
      via = commit;
      commit = next;
    }
  }

  // 치우기 — 표시 없는 커밋을 한 걸음에
  if (!(await pause())) return;
  const gone = history.commits.filter((c) => !marked.has(c.id)).map((c) => c.id);
  await ctx.emit({ type: 'sweep', payload: { gone } });
}
