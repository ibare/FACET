/**
 * snapshot-points-back — 새 커밋이 부모의 해시를 품고 태어난다.
 *
 * 커밋은 만든 차례대로 주어진다. 첫 커밋은 부모가 없고, 나머지는 앞선 커밋 하나를
 * 부모로 둔다. 커밋마다 두 걸음이다 — 부모의 해시가 새 커밋 안에 `parent` 로 적히고,
 * 그다음에야 그것까지 넣어 새 커밋의 해시를 셈한다. 부모에게는 아무것도 적지 않는다.
 *
 * 해시는 장난감 해시다: FNV-1a 32 비트(`"tree <변경>\n"` 에 부모마다 `"parent <해시>\n"`)를
 * 소문자 16 진 여덟 자리로 적고 앞 일곱 자리.
 *
 * 이벤트
 *   init           silent  { commit: string; hash: string }
 *                  첫 커밋(부모 없음)의 해시. 걸음 0 을 갈아 끼운다.
 *   parent-written          { commit: string; parent: string; parentHash: string }
 *                  부모의 해시가 새 커밋 안에 `parent` 로 적혔다. 부모의 해시는 그대로다.
 *   hash-computed           { commit: string; hash: string }
 *                  적힌 부모 해시까지 넣어 새 커밋의 해시를 셈했다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SnapshotCommit = {
  /** 커밋 글자 (`A` …) */
  id: string;
  /** 변경 식별자 — 해시에 들어가는 자료 */
  change: string;
  /** 부모 커밋 글자. 첫 커밋은 null */
  parent: string | null;
};

export type SnapshotPointsBackFacetData = {
  type: 'snapshot-points-back';
  stepMs: number;
  commits: SnapshotCommit[];
};

/** FNV-1a 32 비트 — UTF-8 바이트마다 xor 다음 곱. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h;
}

/** 장난감 커밋 해시 — 변경 식별자와 부모 해시들만 넣는다. 앞 일곱 자리. */
export function toyHash(change: string, parentHashes: readonly string[]): string {
  let body = 'tree ' + change + '\n';
  for (const p of parentHashes) body += 'parent ' + p + '\n';
  return fnv1a32(body).toString(16).padStart(8, '0').slice(0, 7);
}

/** 자료를 좁힌다. 모르는 모양은 던진다. */
export function readCommits(data: unknown): SnapshotCommit[] {
  if (typeof data !== 'object' || data === null) {
    throw new Error('snapshot-points-back: 자료가 객체가 아니다');
  }
  const raw = (data as { commits?: unknown }).commits;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('snapshot-points-back: commits 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return raw.map((c: unknown, i: number): SnapshotCommit => {
    if (typeof c !== 'object' || c === null) {
      throw new Error(`snapshot-points-back: commits[${i}] 가 객체가 아니다`);
    }
    const { id, change, parent } = c as { id?: unknown; change?: unknown; parent?: unknown };
    if (typeof id !== 'string' || id === '') {
      throw new Error(`snapshot-points-back: commits[${i}].id 가 없다`);
    }
    if (typeof change !== 'string' || change === '') {
      throw new Error(`snapshot-points-back: ${id} 의 change 가 없다`);
    }
    if (Array.isArray(parent)) {
      throw new Error(`snapshot-points-back: ${id} 의 부모가 목록이다 — 병합 커밋은 이 조각에 없다`);
    }
    if (parent !== null && typeof parent !== 'string') {
      throw new Error(`snapshot-points-back: ${id} 의 parent 가 글자도 null 도 아니다`);
    }
    if (seen.has(id)) throw new Error(`snapshot-points-back: ${id} 가 두 번 나온다`);
    if (i === 0 && parent !== null) {
      throw new Error(`snapshot-points-back: 첫 커밋 ${id} 에 부모가 있다`);
    }
    if (i > 0 && parent === null) {
      throw new Error(`snapshot-points-back: ${id} 에 부모가 없다 — 뿌리는 첫 커밋 하나다`);
    }
    if (parent !== null && !seen.has(parent)) {
      throw new Error(`snapshot-points-back: ${id} 의 부모 ${parent} 가 앞에 없다`);
    }
    seen.add(id);
    return { id, change, parent };
  });
}

export async function snapshotPointsBack(
  context: FacetContext<SnapshotPointsBackFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SnapshotPointsBackFacetData>;
  const commits = readCommits(ctx.data);
  const stepMs = ctx.data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const hashes = new Map<string, string>();
  const [root, ...rest] = commits;
  if (root === undefined) throw new Error('snapshot-points-back: 첫 커밋이 없다');
  const rootHash = toyHash(root.change, []);
  hashes.set(root.id, rootHash);
  await ctx.emit({ type: 'init', payload: { commit: root.id, hash: rootHash }, silent: true });

  for (const c of rest) {
    if (!(await pause())) return;
    if (c.parent === null) throw new Error(`snapshot-points-back: ${c.id} 에 부모가 없다`);
    const parentHash = hashes.get(c.parent);
    if (parentHash === undefined) {
      throw new Error(`snapshot-points-back: ${c.id} 의 부모 ${c.parent} 의 해시가 아직 없다`);
    }
    await ctx.emit({
      type: 'parent-written',
      payload: { commit: c.id, parent: c.parent, parentHash },
    });
    if (!(await pause())) return;
    const hash = toyHash(c.change, [parentHash]);
    hashes.set(c.id, hash);
    await ctx.emit({ type: 'hash-computed', payload: { commit: c.id, hash } });
  }
}
