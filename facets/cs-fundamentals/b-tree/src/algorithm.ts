/**
 * b-tree — B-트리 완결형 algorithm.
 *
 * 조각 셋(`nodeHoldsMany` · `splitWhenFull` · `heightStaysLow`)이 한 자리에
 * 여럿을 담는 것, 넘치면 쪼개는 것, 그래서 키가 낮다는 것을 덮는다. 셋 다
 * **넣는 쪽**이다.
 *
 * 이 완제품이 더하는 것은 **줄어드는 쪽**이다.
 *
 *   차용(borrow)  자리가 모자라면 옆 형제에게서 키 하나를 빌려 온다. 부모를
 *                 거쳐서 온다 — 형제에게서 곧장 오는 것이 아니다.
 *   병합(merge)   옆도 여유가 없으면 부모의 키 하나를 끌어내려 둘을 합친다.
 *                 그러다 뿌리가 비면 나무의 키가 하나 준다 — B-트리에서 층이
 *                 줄어드는 **유일한** 길이다.
 *
 * ── 짜임
 *
 * 최소 차수 t = 2. 한 자리에 키는 최대 2t−1 = 3, 최소 t−1 = 1 (뿌리는 예외).
 * 자식은 키 수 + 1.
 *
 * 넣기는 **내려가며 미리 쪼갠다** — 꽉 찬 자리를 만나면 지나가기 전에 쪼갠다.
 * 그러면 되돌아 올라오며 고칠 일이 없다. 지우기도 같은 꼴이다 — 내려가기 전에
 * 그 자식이 최소보다 여유가 있게 만들어 둔다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<id>`   한 자리. id 는 만들 때 붙는 일련번호다.
 *
 * ── 이벤트
 *
 * | type            | 표준 | target       | payload |
 * | --------------- | --- | ------------ | ------- |
 * | `state-changed` | O   | 없음          | `{ nodes, rootId }` 나무 전체 |
 * | `highlight`     | O   | `node:<id>`  | `{ id }` 지금 밟는 자리 |
 * | `compare`       | O   | `node:<id>`  | `{ id, keyIndex, key, cmp }` 자리 안에서 키를 훑는다 |
 * | `mark`          | O   | `node:<id>`  | `{ id, keyIndex, key }` 찾았다 |
 * | `done`          | O   | 없음          | `{ keys, nodes, height }` 한 조작이 끝났다 |
 * | `descend`       | ✗   | `node:<id>`  | `{ from, to, gapIndex }` 키 사이 틈으로 내려간다 |
 * | `split`         | ✗   | `node:<id>`  | `{ id, middle, parent }` 가운데가 위로, 나머지가 둘로 |
 * | `borrow`        | ✗   | `node:<id>`  | `{ from, to, parent, key }` 형제에게서 부모를 거쳐 온다 |
 * | `merge`         | ✗   | `node:<id>`  | `{ left, right, parent, key }` 부모의 키를 끌어내려 합친다 |
 * | `shrink`        | ✗   | 없음          | `{ height }` 뿌리가 비어 층이 하나 줄었다 |
 * | `miss`          | ✗   | `node:<id>`  | `{ id, key }` 없다 |
 * | `phase`         | ✗   | 없음          | `{ phase }` **silent** — 코드 패널의 줄을 짚기 위한 것 (C3) |
 *
 * ── phase 어휘 (irs.ts 와 글자 단위로 같아야 한다 — C3)
 *
 *   'scan-keys' | 'found' | 'leaf-miss' | 'descend'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   key-count · node-count · split-count · merge-count
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BTreeData = {
  type: 'b-tree';
  /** 최소 차수. 한 자리의 키는 최대 2t−1, 최소 t−1. */
  minDegree: number;
  /** 시연에서 넣어 볼 키. */
  seed: number[];
  /** 걸음 간격(ms). */
  stepMs: number;
};

type Node = {
  id: string;
  keys: number[];
  /** 잎이면 빈 배열. 아니면 keys.length + 1 개. */
  children: string[];
};

type BTreeInput = { type: string; payload?: Record<string, unknown> };

export async function bTree(ctx: FacetContext<BTreeData>): Promise<void> {
  const rc = ctx as ReactiveContext<BTreeData>;
  const { stepMs } = rc.data;
  const t = Math.max(2, rc.data.minDegree);
  const MAX_KEYS = 2 * t - 1;
  const MIN_KEYS = t - 1;

  let nodes = new Map<string, Node>();
  let rootId = '';
  let nextId = 0;
  let lastInput = '';

  const make = (keys: number[], children: string[]): Node => {
    const id = `n${nextId++}`;
    const node: Node = { id, keys, children };
    nodes.set(id, node);
    ctx.metric('node-count', 1);
    return node;
  };

  const reset = (): void => {
    nodes = new Map();
    nextId = 0;
    rootId = make([], []).id;
  };

  const get = (id: string): Node => {
    const n = nodes.get(id);
    if (!n) throw new Error(`b-tree: 자리 "${id}" 를 찾을 수 없다`);
    return n;
  };

  const isLeaf = (n: Node): boolean => n.children.length === 0;

  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(stepMs);
  };

  const phase = async (name: string): Promise<void> => {
    await rc.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /** 나무의 층수. 뿌리만 있으면 1. */
  const height = (): number => {
    let h = 1;
    let cur = get(rootId);
    while (!isLeaf(cur)) {
      h += 1;
      cur = get(cur.children[0]!);
      if (h > 32) break; // 고리 방어. 정상 데이터에서는 닿지 않는다.
    }
    return h;
  };

  const keyCount = (): number => {
    let n = 0;
    for (const node of nodes.values()) n += node.keys.length;
    return n;
  };

  const publish = async (): Promise<void> => {
    await rc.emit({
      type: 'state-changed',
      payload: { nodes: [...nodes.values()].map((n) => ({ ...n })), rootId },
      silent: true,
    });
  };

  const finish = async (): Promise<void> => {
    await publish();
    await rc.emit({
      type: 'done',
      payload: { keys: keyCount(), nodes: nodes.size, height: height() },
    });
  };

  /**
   * 꽉 찬 자식을 쪼갠다. 가운데 키가 부모로 올라가고 나머지가 둘로 갈린다.
   *
   * 층이 늘어나는 것은 뿌리를 쪼갤 때뿐이다 — 다른 자리의 분할은 부모의 키를
   * 하나 늘릴 뿐 나무를 깊게 하지 않는다.
   */
  const splitChild = async (parent: Node, i: number): Promise<boolean> => {
    const full = get(parent.children[i]!);
    const middle = full.keys[t - 1]!;
    const rightKeys = full.keys.slice(t);
    const rightChildren = isLeaf(full) ? [] : full.children.slice(t);
    full.keys = full.keys.slice(0, t - 1);
    const leftChildren = isLeaf(full) ? [] : full.children.slice(0, t);
    full.children = leftChildren;
    const right = make(rightKeys, rightChildren);

    parent.keys.splice(i, 0, middle);
    parent.children.splice(i + 1, 0, right.id);
    ctx.metric('split-count', 'inc');

    await rc.emit({
      type: 'split',
      target: `node:${full.id}`,
      payload: { id: full.id, middle, parent: parent.id, right: right.id },
    });
    await publish();
    return pause();
  };

  /** 넣기 — 내려가며 꽉 찬 자리를 미리 쪼갠다. */
  const insert = async (key: number): Promise<boolean> => {
    let root = get(rootId);
    if (root.keys.length === MAX_KEYS) {
      // 뿌리가 꽉 찼다. 새 뿌리를 세워 쪼갠다 — 층이 느는 유일한 자리다.
      const newRoot = make([], [rootId]);
      rootId = newRoot.id;
      if (!(await splitChild(newRoot, 0))) return false;
      root = newRoot;
    }

    let cur = root;
    for (;;) {
      if (rc.cancelled) return false;
      await rc.emit({ type: 'highlight', target: `node:${cur.id}`, payload: { id: cur.id } });
      if (!(await pause())) return false;

      if (isLeaf(cur)) {
        let i = cur.keys.length;
        while (i > 0 && key < cur.keys[i - 1]!) i -= 1;
        if (cur.keys[i - 1] === key || cur.keys[i] === key) {
          // 같은 키는 두 번 담지 않는다.
          await rc.emit({ type: 'miss', target: `node:${cur.id}`, payload: { id: cur.id, key } });
          return pause();
        }
        cur.keys.splice(i, 0, key);
        ctx.metric('key-count', 'inc');
        await rc.emit({
          type: 'mark',
          target: `node:${cur.id}`,
          payload: { id: cur.id, keyIndex: i, key },
        });
        await publish();
        return pause();
      }

      let i = cur.keys.length;
      while (i > 0 && key < cur.keys[i - 1]!) i -= 1;
      if (get(cur.children[i]!).keys.length === MAX_KEYS) {
        if (!(await splitChild(cur, i))) return false;
        // 쪼갠 뒤 올라온 키와 견주어 어느 쪽으로 갈지 다시 정한다.
        if (key > cur.keys[i]!) i += 1;
      }
      const next = get(cur.children[i]!);
      await rc.emit({
        type: 'descend',
        target: `node:${next.id}`,
        payload: { from: cur.id, to: next.id, gapIndex: i },
      });
      if (!(await pause())) return false;
      cur = next;
    }
  };

  /** 찾기 — 자리 안에서 키를 훑고, 키와 키 사이의 틈으로 내려간다. */
  const search = async (key: number): Promise<boolean> => {
    let cur = get(rootId);
    for (;;) {
      if (rc.cancelled) return false;
      await rc.emit({ type: 'highlight', target: `node:${cur.id}`, payload: { id: cur.id } });
      if (!(await pause())) return false;

      let i = 0;
      await phase('scan-keys');
      while (i < cur.keys.length) {
        const k = cur.keys[i]!;
        const cmp = key === k ? 'eq' : key < k ? 'lt' : 'gt';
        await rc.emit({
          type: 'compare',
          target: `node:${cur.id}`,
          payload: { id: cur.id, keyIndex: i, key: k, cmp },
        });
        ctx.metric('compare-count', 'inc');
        if (!(await pause())) return false;
        if (cmp !== 'gt') break;
        i += 1;
      }

      if (i < cur.keys.length && cur.keys[i] === key) {
        await phase('found');
        await rc.emit({
          type: 'mark',
          target: `node:${cur.id}`,
          payload: { id: cur.id, keyIndex: i, key },
        });
        return pause();
      }
      if (isLeaf(cur)) {
        await phase('leaf-miss');
        await rc.emit({ type: 'miss', target: `node:${cur.id}`, payload: { id: cur.id, key } });
        return pause();
      }
      await phase('descend');
      const next = get(cur.children[i]!);
      await rc.emit({
        type: 'descend',
        target: `node:${next.id}`,
        payload: { from: cur.id, to: next.id, gapIndex: i },
      });
      if (!(await pause())) return false;
      cur = next;
    }
  };

  /**
   * 내려가기 전에 그 자식이 최소보다 여유가 있게 만든다.
   *
   * 먼저 옆 형제에게 여유가 있으면 **부모를 거쳐** 하나 빌려 온다. 옆도 빠듯
   * 하면 부모의 키를 끌어내려 둘을 합친다.
   */
  const fill = async (parent: Node, i: number): Promise<boolean> => {
    const child = get(parent.children[i]!);
    if (child.keys.length > MIN_KEYS) return true;

    const leftId = i > 0 ? parent.children[i - 1] : undefined;
    const rightId = i < parent.children.length - 1 ? parent.children[i + 1] : undefined;
    const left = leftId ? get(leftId) : undefined;
    const right = rightId ? get(rightId) : undefined;

    if (left && left.keys.length > MIN_KEYS) {
      // 왼쪽에서 빌려 온다. 부모의 키가 자식으로 내려가고 형제의 마지막 키가
      // 그 자리에 올라간다 — 형제에게서 곧장 오는 것이 아니다.
      const sep = parent.keys[i - 1]!;
      child.keys.unshift(sep);
      parent.keys[i - 1] = left.keys.pop()!;
      if (!isLeaf(left)) child.children.unshift(left.children.pop()!);
      await rc.emit({
        type: 'borrow',
        target: `node:${child.id}`,
        payload: { from: left.id, to: child.id, parent: parent.id, key: sep },
      });
      await publish();
      return pause();
    }

    if (right && right.keys.length > MIN_KEYS) {
      const sep = parent.keys[i]!;
      child.keys.push(sep);
      parent.keys[i] = right.keys.shift()!;
      if (!isLeaf(right)) child.children.push(right.children.shift()!);
      await rc.emit({
        type: 'borrow',
        target: `node:${child.id}`,
        payload: { from: right.id, to: child.id, parent: parent.id, key: sep },
      });
      await publish();
      return pause();
    }

    // 양옆 다 빠듯하다 — 부모의 키를 끌어내려 합친다.
    const mergeLeft = left !== undefined;
    const a = mergeLeft ? left : child;
    const b = mergeLeft ? child : right!;
    const sepIndex = mergeLeft ? i - 1 : i;
    const sep = parent.keys[sepIndex]!;
    a.keys = [...a.keys, sep, ...b.keys];
    a.children = [...a.children, ...b.children];
    parent.keys.splice(sepIndex, 1);
    parent.children.splice(sepIndex + 1, 1);
    nodes.delete(b.id);
    ctx.metric('merge-count', 'inc');
    ctx.metric('node-count', -1);
    await rc.emit({
      type: 'merge',
      target: `node:${a.id}`,
      payload: { left: a.id, right: b.id, parent: parent.id, key: sep },
    });
    await publish();
    return pause();
  };

  /** 지우기 — 내려가며 자식에 여유를 만들어 두고, 잎에서 뺀다. */
  const remove = async (key: number): Promise<boolean> => {
    let cur = get(rootId);
    for (;;) {
      if (rc.cancelled) return false;
      await rc.emit({ type: 'highlight', target: `node:${cur.id}`, payload: { id: cur.id } });
      if (!(await pause())) return false;

      let i = 0;
      while (i < cur.keys.length && key > cur.keys[i]!) i += 1;

      if (i < cur.keys.length && cur.keys[i] === key) {
        if (isLeaf(cur)) {
          cur.keys.splice(i, 1);
          ctx.metric('key-count', -1);
          await publish();
          break;
        }
        // 안쪽 자리의 키는 곧장 못 뺀다. 앞선 자리의 가장 큰 키로 갈아 끼우고
        // 그것을 잎에서 빼는 문제로 바꾼다.
        if (!(await fill(cur, i))) return false;
        let leaf = get(cur.children[i]!);
        while (!isLeaf(leaf)) {
          if (!(await fill(leaf, leaf.children.length - 1))) return false;
          leaf = get(leaf.children[leaf.children.length - 1]!);
        }
        const pred = leaf.keys[leaf.keys.length - 1]!;
        cur.keys[i] = pred;
        leaf.keys.pop();
        ctx.metric('key-count', -1);
        await publish();
        break;
      }

      if (isLeaf(cur)) {
        await rc.emit({ type: 'miss', target: `node:${cur.id}`, payload: { id: cur.id, key } });
        return pause();
      }

      if (!(await fill(cur, i))) return false;
      // 합쳐졌으면 자식 수가 줄어 자리 번호가 밀렸을 수 있다.
      const idx = Math.min(i, cur.children.length - 1);
      const next = get(cur.children[idx]!);
      await rc.emit({
        type: 'descend',
        target: `node:${next.id}`,
        payload: { from: cur.id, to: next.id, gapIndex: idx },
      });
      if (!(await pause())) return false;
      cur = next;
    }

    // 뿌리가 비면 그 하나뿐인 자식이 새 뿌리가 된다 — 층이 줄어드는 유일한 길.
    const root = get(rootId);
    if (root.keys.length === 0 && !isLeaf(root)) {
      const only = root.children[0]!;
      nodes.delete(rootId);
      ctx.metric('node-count', -1);
      rootId = only;
      await rc.emit({ type: 'shrink', payload: { height: height() } });
      await publish();
      return pause();
    }
    return true;
  };

  const parseKey = (raw: string): number | null => {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : null;
  };

  // ── 1. 시연.
  reset();
  await publish();
  for (const k of rc.data.seed) {
    if (rc.cancelled) return;
    if (!(await insert(k))) return;
  }
  if (rc.cancelled) return;
  await finish();

  // ── 2. 학습자 차례.
  for (;;) {
    if (rc.cancelled) return;
    let ev: BTreeInput;
    try {
      ev = await rc.waitForInput<BTreeInput>();
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }

    const raw = ev.payload?.key;
    if (typeof raw === 'string') lastInput = raw;
    if (ev.type === 'input') continue;

    const key = parseKey(lastInput);
    if (key === null) continue;

    if (ev.type === 'insert') {
      if (!(await insert(key))) return;
      await finish();
      continue;
    }
    if (ev.type === 'search') {
      if (!(await search(key))) return;
      await finish();
      continue;
    }
    if (ev.type === 'remove') {
      if (!(await remove(key))) return;
      await finish();
      continue;
    }
  }
}
