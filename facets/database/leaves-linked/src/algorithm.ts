/**
 * leavesLinked — B+ 트리의 범위 질의. 아래 끝 열쇠가 든 잎까지 한 번만 내려가고,
 * 그 뒤로는 잎의 이음을 따라 옆 잎으로 건너가며 열쇠를 줍는다.
 *
 * 가름 열쇠 규칙: 안쪽 페이지의 열쇠 s₁ < s₂ < … 에서 찾는 열쇠 k 가 s 이상이면
 * s 의 오른쪽 가지로 간다. 범위 `lo..hi` 는 양 끝을 포함한다. 잎에서는 lo 미만을
 * 지나치고, hi 를 넘는 열쇠를 처음 만나면 그 자리에서 멈춘다 (그 열쇠는 잡지 않는다).
 * 한 걸음 = 페이지 하나 읽기.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음이다):
 *
 *   read-inner  안쪽 페이지 하나를 읽고 내려갈 가지를 골랐다
 *     payload: { page: string; child: string }
 *
 *   read-leaf   잎 하나를 읽었다
 *     payload: {
 *       page: string;
 *       via: 'down' | 'side';   // 'down' = 내려가기의 끝, 'side' = 이음으로 건너옴
 *       cross: boolean;         // 앞 잎과 부모가 다른가 ('down' 이면 늘 false)
 *       skipped: number[];      // lo 미만이라 지나친 열쇠
 *       picked: { key: number; row: string }[];   // 잡은 열쇠와 그 줄 자리
 *       stop: number | null;    // hi 를 넘어 멈춘 열쇠, 없으면 null
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 로 세운다 (질의 · 트리). 첫 발신 앞에
 * stepMs 를 두어 그 화면을 읽을 틈을 준다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LeafEntry = { key: number; row: string };

export type InnerPage = { id: string; kind: 'inner'; keys: number[]; children: string[] };
export type LeafPage = { id: string; kind: 'leaf'; entries: LeafEntry[]; next: string | null };
export type TreePage = InnerPage | LeafPage;

export type LeavesLinkedFacetData = {
  type: 'leaves-linked';
  stepMs: number;
  /** 인덱스 이름 (자료) */
  index: string;
  /** 인덱스가 걸린 열 (자료) */
  column: string;
  /** 화면에 그대로 두는 질의 (SQL) */
  query: string;
  lo: number;
  hi: number;
  root: string;
  pages: TreePage[];
};

/** 안쪽 페이지에서 열쇠 k 가 내려갈 가지 — k ≥ s 이면 s 의 오른쪽. */
export function childFor(page: InnerPage, key: number): string {
  const i = page.keys.filter((s) => key >= s).length;
  const child = page.children[i];
  if (child === undefined) {
    throw new Error(`leavesLinked: ${page.id} 에 ${i} 번째 가리킴이 없다`);
  }
  return child;
}

/** 잎마다 부모 페이지 — 구조에서 셈한다. */
export function parentsOf(pages: TreePage[]): Map<string, string> {
  const parent = new Map<string, string>();
  pages.forEach((p) => {
    if (p.kind === 'inner') p.children.forEach((c) => parent.set(c, p.id));
  });
  return parent;
}

/** 트리 구조를 확인하고 식별자 → 페이지 표를 돌려준다. 어긋나면 던진다. */
export function checkTree(data: LeavesLinkedFacetData): Map<string, TreePage> {
  const byId = new Map<string, TreePage>();
  data.pages.forEach((p) => {
    if (byId.has(p.id)) throw new Error(`leavesLinked: 페이지 ${p.id} 가 둘이다`);
    byId.set(p.id, p);
  });
  if (!byId.has(data.root)) throw new Error(`leavesLinked: 뿌리 ${data.root} 가 없다`);
  data.pages.forEach((p) => {
    if (p.kind === 'inner') {
      if (p.children.length !== p.keys.length + 1) {
        throw new Error(`leavesLinked: ${p.id} 의 가리킴 수가 열쇠 수 + 1 이 아니다`);
      }
      p.children.forEach((c) => {
        if (!byId.has(c)) throw new Error(`leavesLinked: ${p.id} 가 없는 페이지 ${c} 를 가리킨다`);
      });
      p.keys.forEach((k, i) => {
        if (i > 0 && k <= (p.keys[i - 1] as number)) {
          throw new Error(`leavesLinked: ${p.id} 의 열쇠가 오름차순이 아니다`);
        }
      });
    } else {
      if (p.entries.length === 0) throw new Error(`leavesLinked: 잎 ${p.id} 가 비었다`);
      p.entries.forEach((e, i) => {
        if (i > 0 && e.key <= (p.entries[i - 1] as LeafEntry).key) {
          throw new Error(`leavesLinked: 잎 ${p.id} 의 열쇠가 오름차순이 아니다`);
        }
      });
      if (p.next !== null && byId.get(p.next)?.kind !== 'leaf') {
        throw new Error(`leavesLinked: 잎 ${p.id} 의 다음 ${p.next} 가 잎이 아니다`);
      }
    }
  });
  return byId;
}

export async function leavesLinked(context: FacetContext<LeavesLinkedFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LeavesLinkedFacetData>;
  const data = ctx.data;
  const { lo, hi, stepMs } = data;
  if (!(lo <= hi)) throw new Error(`leavesLinked: 범위 ${lo}..${hi} 가 거꾸로다`);
  if (!data.query.includes(`BETWEEN ${lo} AND ${hi}`)) {
    throw new Error('leavesLinked: 질의 글자와 범위가 어긋난다');
  }
  const byId = checkTree(data);
  const parent = parentsOf(data.pages);
  const leafCount = data.pages.filter((p) => p.kind === 'leaf').length;

  const get = (id: string): TreePage => {
    const p = byId.get(id);
    if (p === undefined) throw new Error(`leavesLinked: 페이지 ${id} 가 없다`);
    return p;
  };

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 내려가기 — 아래 끝 lo 로 뿌리에서 잎까지 한 번
  let page = get(data.root);
  let depth = 0;
  while (page.kind === 'inner') {
    if (!(await pause())) return;
    depth += 1;
    if (depth > data.pages.length) throw new Error('leavesLinked: 내려가기가 끝나지 않는다');
    const child = childFor(page, lo);
    await ctx.emit({ type: 'read-inner', payload: { page: page.id, child } });
    page = get(child);
  }

  // 잎을 옆으로 건너가며 줍기
  let leaf: LeafPage = page;
  let via: 'down' | 'side' = 'down';
  let prevParent: string | null = null;
  let hops = 0;
  while (hops <= leafCount) {
    if (!(await pause())) return;
    hops += 1;
    const myParent = parent.get(leaf.id);
    if (myParent === undefined) throw new Error(`leavesLinked: 잎 ${leaf.id} 의 부모가 없다`);
    const cross = via === 'side' && prevParent !== null && prevParent !== myParent;
    const stopAt = leaf.entries.findIndex((e) => e.key > hi);
    const scanned = stopAt < 0 ? leaf.entries : leaf.entries.slice(0, stopAt);
    const skipped = scanned.filter((e) => e.key < lo).map((e) => e.key);
    const picked = scanned.filter((e) => e.key >= lo).map((e) => ({ key: e.key, row: e.row }));
    const stop = stopAt < 0 ? null : (leaf.entries[stopAt] as LeafEntry).key;
    await ctx.emit({
      type: 'read-leaf',
      payload: { page: leaf.id, via, cross, skipped, picked, stop },
    });
    if (stop !== null || leaf.next === null) return;
    const next = get(leaf.next);
    if (next.kind !== 'leaf') throw new Error(`leavesLinked: ${leaf.next} 가 잎이 아니다`);
    prevParent = myParent;
    leaf = next;
    via = 'side';
  }
  throw new Error('leavesLinked: 잎 이음이 되돌아 돈다');
}
