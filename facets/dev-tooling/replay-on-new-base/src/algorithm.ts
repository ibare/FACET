/**
 * replay-on-new-base — 리베이스한 커밋은 왜 원래 커밋과 다른 커밋인가.
 *
 * `rebase.branch` 에서 닿고 `rebase.onto` 에서 닿지 않는 커밋을 오래된 것부터 하나씩
 * `onto` 의 끝 위에 새 커밋으로 다시 만든다. 변경 식별자는 같고 부모만 바뀌므로 해시를
 * 새로 셈한다. 옛 커밋은 그대로 두고 `branch` 이름만 마지막 새 커밋으로 옮긴다.
 *
 * 해시는 장난감 해시 — FNV-1a 32 비트("tree <key>\n" + 부모마다 "parent <부모해시>\n")의
 * 소문자 16 진 여덟 자리 중 앞 일곱.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (커밋 · 해시 · 이름). 첫 발신 앞에
 * stepMs 를 두어 그 화면을 읽을 틈을 준다.
 *
 * 이벤트 (모두 silent 아님):
 *   plan    payload { todo: string[] }
 *           다시 놓을 커밋 식별자, 오래된 것부터.
 *   replay  payload { commit: string; copy: string; parent: string; hash: string }
 *           commit 을 parent 위에 copy 로 다시 만들었다. hash 는 copy 의 새 해시.
 *   move    payload { name: string; from: string; to: string }
 *           이름 name 이 커밋 from 에서 to 로 옮겼다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CommitSpec = { id: string; key: string; parents: string[] };
export type NameSpec = { name: string; commit: string };

export type ReplayOnNewBaseFacetData = {
  type: 'replay-on-new-base';
  stepMs: number;
  commits: CommitSpec[];
  names: NameSpec[];
  rebase: { branch: string; onto: string };
};

/** 해시까지 붙은 커밋. `origin` 은 다시 만든 커밋이 어느 커밋에서 왔는지. */
export type Commit = {
  id: string;
  key: string;
  parents: string[];
  hash: string;
  origin: string | null;
};

// ---------------------------------------------------------------- 장난감 해시

function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h;
}

/** 장난감 커밋 해시 — 변경 식별자와 부모 해시만 넣는다. */
export function toyHash(key: string, parentHashes: readonly string[]): string {
  let body = 'tree ' + key + '\n';
  for (const p of parentHashes) body += 'parent ' + p + '\n';
  return fnv1a32(body).toString(16).padStart(8, '0').slice(0, 7);
}

// ---------------------------------------------------------------- 자료 좁히기

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`replay-on-new-base: ${path} 는 빈 글자가 아닌 문자열이어야 한다`);
  }
  return v;
}

/** initialData 를 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
export function readData(raw: unknown): ReplayOnNewBaseFacetData {
  if (!isRecord(raw)) throw new Error('replay-on-new-base: initialData 가 객체가 아니다');
  if (raw['type'] !== 'replay-on-new-base') {
    throw new Error(`replay-on-new-base: initialData.type 이 다르다 (${String(raw['type'])})`);
  }
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('replay-on-new-base: initialData.stepMs 는 양수여야 한다');
  }
  const commitsRaw = raw['commits'];
  if (!Array.isArray(commitsRaw) || commitsRaw.length === 0) {
    throw new Error('replay-on-new-base: initialData.commits 는 비지 않은 배열이어야 한다');
  }
  const commits: CommitSpec[] = commitsRaw.map((c, i) => {
    if (!isRecord(c)) throw new Error(`replay-on-new-base: commits[${i}] 가 객체가 아니다`);
    const parentsRaw = c['parents'];
    if (!Array.isArray(parentsRaw)) {
      throw new Error(`replay-on-new-base: commits[${i}].parents 가 배열이 아니다`);
    }
    return {
      id: str(c['id'], `commits[${i}].id`),
      key: str(c['key'], `commits[${i}].key`),
      parents: parentsRaw.map((p, j) => str(p, `commits[${i}].parents[${j}]`)),
    };
  });
  const namesRaw = raw['names'];
  if (!Array.isArray(namesRaw)) {
    throw new Error('replay-on-new-base: initialData.names 가 배열이 아니다');
  }
  const names: NameSpec[] = namesRaw.map((n, i) => {
    if (!isRecord(n)) throw new Error(`replay-on-new-base: names[${i}] 가 객체가 아니다`);
    return { name: str(n['name'], `names[${i}].name`), commit: str(n['commit'], `names[${i}].commit`) };
  });
  const rebase = raw['rebase'];
  if (!isRecord(rebase)) throw new Error('replay-on-new-base: initialData.rebase 가 객체가 아니다');
  return {
    type: 'replay-on-new-base',
    stepMs,
    commits,
    names,
    rebase: { branch: str(rebase['branch'], 'rebase.branch'), onto: str(rebase['onto'], 'rebase.onto') },
  };
}

// ---------------------------------------------------------------- 바탕 셈

/**
 * 커밋마다 해시를 셈한다. 부모는 자식보다 앞에 적혀 있어야 한다.
 * 없는 부모 · 부모 둘(병합 커밋) · 두 번 나오는 식별자는 던진다.
 */
export function hashCommits(specs: readonly CommitSpec[]): Commit[] {
  const byId = new Map<string, Commit>();
  const out: Commit[] = [];
  for (const s of specs) {
    if (byId.has(s.id)) throw new Error(`replay-on-new-base: 커밋 ${s.id} 가 두 번 나온다`);
    if (s.parents.length > 1) {
      throw new Error(`replay-on-new-base: 커밋 ${s.id} 는 부모가 ${s.parents.length} — 병합 커밋은 이 모형에 없다`);
    }
    const parentHashes = s.parents.map((p) => {
      const parent = byId.get(p);
      if (!parent) throw new Error(`replay-on-new-base: 커밋 ${s.id} 의 부모 ${p} 가 앞에 없다`);
      return parent.hash;
    });
    const c: Commit = { id: s.id, key: s.key, parents: [...s.parents], hash: toyHash(s.key, parentHashes), origin: null };
    byId.set(c.id, c);
    out.push(c);
  }
  return out;
}

/** 이름이 가리키는 커밋. 없는 이름 · 없는 커밋은 던진다. */
export function tipOf(names: readonly NameSpec[], commits: readonly Commit[], name: string): string {
  const n = names.find((x) => x.name === name);
  if (!n) throw new Error(`replay-on-new-base: 이름 ${name} 가 없다`);
  if (!commits.some((c) => c.id === n.commit)) {
    throw new Error(`replay-on-new-base: 이름 ${name} 가 가리키는 커밋 ${n.commit} 가 없다`);
  }
  return n.commit;
}

/** start 에서 첫 부모를 따라 거슬러 간 차례 (이미 본 커밋은 건너뛴다). */
export function walkBack(commits: readonly Commit[], start: string): string[] {
  const byId = new Map(commits.map((c) => [c.id, c] as const));
  const seen = new Set<string>();
  const order: string[] = [];
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    const c = byId.get(id);
    if (!c) throw new Error(`replay-on-new-base: 거슬러 가다 없는 커밋 ${id} 를 만났다`);
    seen.add(id);
    order.push(id);
    const first = c.parents[0];
    if (first !== undefined) queue.push(first);
  }
  return order;
}

/** 다시 놓을 커밋 — branch 에서 닿고 onto 에서 닿지 않는 것, 오래된 것부터. */
export function commitsToReplay(commits: readonly Commit[], branchTip: string, ontoTip: string): string[] {
  const ontoSide = new Set(walkBack(commits, ontoTip));
  return walkBack(commits, branchTip)
    .reverse()
    .filter((id) => !ontoSide.has(id));
}

// ---------------------------------------------------------------- 알고리즘

export async function replayOnNewBase(ctxIn: FacetContext<ReplayOnNewBaseFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<ReplayOnNewBaseFacetData>;
  const data = readData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const commits = hashCommits(data.commits);
  const branchTip = tipOf(data.names, commits, data.rebase.branch);
  const ontoTip = tipOf(data.names, commits, data.rebase.onto);
  const todo = commitsToReplay(commits, branchTip, ontoTip);
  if (todo.length === 0) {
    throw new Error(`replay-on-new-base: ${data.rebase.branch} 에만 있는 커밋이 없다 — 다시 놓을 것이 없다`);
  }

  // 걸음 0 (처음 화면) 을 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({ type: 'plan', payload: { todo: [...todo] } });

  const hashOf = new Map(commits.map((c) => [c.id, c.hash] as const));
  const keyOf = new Map(commits.map((c) => [c.id, c.key] as const));
  let base = ontoTip;
  for (const id of todo) {
    if (!(await pause())) return;
    const key = keyOf.get(id);
    const baseHash = hashOf.get(base);
    if (key === undefined || baseHash === undefined) {
      throw new Error(`replay-on-new-base: 커밋 ${id} 또는 부모 ${base} 를 셈할 수 없다`);
    }
    const copy = id + "'";
    if (hashOf.has(copy)) throw new Error(`replay-on-new-base: 새 커밋 이름 ${copy} 가 이미 있다`);
    const hash = toyHash(key, [baseHash]);
    hashOf.set(copy, hash);
    keyOf.set(copy, key);
    await ctx.emit({ type: 'replay', payload: { commit: id, copy, parent: base, hash } });
    base = copy;
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'move', payload: { name: data.rebase.branch, from: branchTip, to: base } });
}
