/**
 * avl-tree — AVL 트리 완결형 algorithm.
 *
 * 조각 둘(`heightBalanceCheck` · `rotateToBalance`)이 균형 인수를 재는 것과
 * **한 번의 왼쪽 회전**을 덮는다. 완결형 `bst` 가 넣고 찾는 것을 덮는다.
 * 이 완제품이 더하는 것은 그 사이에 빠진 셋이다.
 *
 *   이중 회전   기운 방향과 그 자식이 기운 방향이 어긋나면(LR · RL) 한 번으로
 *               안 된다. 안쪽을 먼저 돌려 방향을 맞춘 뒤에야 바깥을 돌린다.
 *               조각은 단일 회전만 보이므로 이 경우를 만날 자리가 없다.
 *   가장 낮은 자리  깨진 자리가 여럿이어도 **가장 낮은 것 하나만** 고치면 위쪽이
 *               저절로 풀린다. 넣기에서는 회전이 한 번이면 끝난다.
 *   지우기      넣기와 다르다. 한 번 고쳐도 위쪽이 다시 깨질 수 있어 **뿌리까지
 *               올라가며** 고친다. 그 비대칭은 두 연산을 나란히 몰아 봐야 보인다.
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
 * | `compare`       | O   | `node:<id>`  | `{ id, key, cmp }` 내려갈 쪽을 정한다 |
 * | `append`        | O   | `node:<id>`  | `{ id, key }` 잎에 새 자리가 앉는다 |
 * | `mark`          | O   | `node:<id>`  | `{ id, key }` 찾았다 |
 * | `done`          | O   | 없음          | `{ keys, height, ideal }` 한 조작이 끝났다 |
 * | `measure`       | ✗   | `node:<id>`  | `{ id, height, balance, ok }` 되돌아오며 잰다 |
 * | `imbalance`     | ✗   | `node:<id>`  | `{ id, balance, kind }` 범위를 벗어났다. kind 는 LL·LR·RL·RR |
 * | `rotate`        | ✗   | `node:<id>`  | `{ pivot, newRoot, dir, inner }` 한 번의 회전 |
 * | `miss`          | ✗   | `node:<id>`  | `{ id, key }` 없다 |
 * | `phase`         | ✗   | 없음          | `{ phase }` **silent** — 코드 패널의 줄을 짚기 위한 것 (C3) |
 *
 * ── phase 어휘 (irs.ts 와 글자 단위로 같아야 한다 — C3)
 *
 *   'measure' | 'case-ll' | 'case-lr' | 'case-rr' | 'case-rl' | 'balanced'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   key-count · single-rotation · double-rotation · compare-count
 *
 * 단일과 이중을 갈라 세는 것이 요점이다. 합쳐 세면 이중 회전이 두 번으로
 * 보이거나 한 번으로 보이거나 할 뿐, 그것이 **다른 경우**라는 사실이 사라진다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AvlTreeData = {
  type: 'avl-tree';
  /** 시연에서 넣어 볼 키. 이중 회전이 한 번은 일어나는 순서라야 한다. */
  seed: number[];
  /** 걸음 간격(ms). */
  stepMs: number;
};

type Node = {
  id: string;
  key: number;
  left: string | null;
  right: string | null;
  /** 잎이 1. 빈 자리는 0 으로 센다. */
  height: number;
};

type AvlInput = { type: string; payload?: Record<string, unknown> };

export async function avlTree(ctx: FacetContext<AvlTreeData>): Promise<void> {
  const rc = ctx as ReactiveContext<AvlTreeData>;
  const { stepMs } = rc.data;

  let nodes = new Map<string, Node>();
  let rootId: string | null = null;
  let nextId = 0;
  let lastInput = '';

  const reset = (): void => {
    nodes = new Map();
    rootId = null;
    nextId = 0;
  };

  const get = (id: string): Node => {
    const n = nodes.get(id);
    if (!n) throw new Error(`avl-tree: 자리 "${id}" 를 찾을 수 없다`);
    return n;
  };

  const h = (id: string | null): number => (id === null ? 0 : get(id).height);
  const balanceOf = (n: Node): number => h(n.left) - h(n.right);

  const pause = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    return rc.sleep(stepMs);
  };

  const phase = async (name: string): Promise<void> => {
    await rc.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  const publish = async (): Promise<void> => {
    await rc.emit({
      type: 'state-changed',
      payload: { nodes: [...nodes.values()].map((n) => ({ ...n })), rootId },
      silent: true,
    });
  };

  const keyCount = (): number => nodes.size;
  /** n 개를 담는 이진 트리가 가질 수 있는 가장 낮은 키. */
  const idealHeight = (n: number): number => (n === 0 ? 0 : Math.floor(Math.log2(n)) + 1);

  const finish = async (): Promise<void> => {
    await publish();
    await rc.emit({
      type: 'done',
      payload: { keys: keyCount(), height: h(rootId), ideal: idealHeight(keyCount()) },
    });
  };

  const refresh = (n: Node): void => {
    n.height = 1 + Math.max(h(n.left), h(n.right));
  };

  /**
   * 한 번의 회전. `dir` 은 도는 방향이고 `inner` 면 이중 회전의 앞 절반이다.
   *
   * 축이 아래로 내려가고 그 자식이 축의 자리로 올라오며, 올라온 쪽의 반대편
   * 가지 하나가 손을 바꿔 내려간 축에 붙는다.
   */
  const rotate = async (pivotId: string, dir: 'left' | 'right', inner: boolean): Promise<string> => {
    const pivot = get(pivotId);
    const riserId = dir === 'left' ? pivot.right : pivot.left;
    if (riserId === null) return pivotId;
    const riser = get(riserId);

    if (dir === 'left') {
      pivot.right = riser.left;
      riser.left = pivot.id;
    } else {
      pivot.left = riser.right;
      riser.right = pivot.id;
    }
    refresh(pivot);
    refresh(riser);

    await rc.emit({
      type: 'rotate',
      target: `node:${pivot.id}`,
      payload: { pivot: pivot.id, newRoot: riser.id, dir, inner },
    });
    return riser.id;
  };

  /**
   * 되돌아오며 한 자리를 재고, 범위를 벗어났으면 고친다.
   *
   * 네 경우를 가르는 것은 **기운 방향과 그 자식이 기운 방향**이다. 둘이 같으면
   * 한 번(LL · RR), 어긋나면 안쪽을 먼저 돌려 방향을 맞춘 뒤 바깥을 돈다
   * (LR · RL).
   */
  const rebalance = async (id: string): Promise<string | null> => {
    const n = get(id);
    refresh(n);
    const bf = balanceOf(n);
    await phase('measure');
    await rc.emit({
      type: 'measure',
      target: `node:${id}`,
      payload: { id, height: n.height, balance: bf, ok: bf >= -1 && bf <= 1 },
    });
    if (!(await pause())) return null;
    if (bf >= -1 && bf <= 1) {
      await phase('balanced');
      return id;
    }

    if (bf > 1) {
      const leftId = n.left!;
      const childBf = balanceOf(get(leftId));
      const kind = childBf < 0 ? 'LR' : 'LL';
      // 경우에서 한 번만 센다. 이중 회전은 두 번 도는 **한 건**이지 두 건이 아니다.
      ctx.metric(kind === 'LR' ? 'double-rotation' : 'single-rotation', 'inc');
      await phase(kind === 'LR' ? 'case-lr' : 'case-ll');
      await rc.emit({ type: 'imbalance', target: `node:${id}`, payload: { id, balance: bf, kind } });
      if (!(await pause())) return null;
      if (kind === 'LR') {
        // 안쪽을 먼저 돌려 방향을 맞춘다. 이것이 조각에 없던 걸음이다.
        n.left = await rotate(leftId, 'left', true);
        await publish();
        if (!(await pause())) return null;
      }
      const newRoot = await rotate(id, 'right', false);
      await publish();
      if (!(await pause())) return null;
      return newRoot;
    }

    const rightId = n.right!;
    const childBf = balanceOf(get(rightId));
    const kind = childBf > 0 ? 'RL' : 'RR';
    ctx.metric(kind === 'RL' ? 'double-rotation' : 'single-rotation', 'inc');
    await phase(kind === 'RL' ? 'case-rl' : 'case-rr');
    await rc.emit({ type: 'imbalance', target: `node:${id}`, payload: { id, balance: bf, kind } });
    if (!(await pause())) return null;
    if (kind === 'RL') {
      n.right = await rotate(rightId, 'right', true);
      await publish();
      if (!(await pause())) return null;
    }
    const newRoot = await rotate(id, 'left', false);
    await publish();
    if (!(await pause())) return null;
    return newRoot;
  };

  /** 넣기. 되돌아오며 재고, 깨진 **가장 낮은 자리** 하나만 고치면 끝난다. */
  const insert = async (id: string | null, key: number): Promise<string | null> => {
    if (rc.cancelled) return null;
    if (id === null) {
      const fresh: Node = { id: `n${nextId++}`, key, left: null, right: null, height: 1 };
      nodes.set(fresh.id, fresh);
      ctx.metric('key-count', 'inc');
      await rc.emit({ type: 'append', target: `node:${fresh.id}`, payload: { id: fresh.id, key } });
      await publish();
      if (!(await pause())) return null;
      return fresh.id;
    }

    const n = get(id);
    const cmp = key === n.key ? 'eq' : key < n.key ? 'lt' : 'gt';
    await rc.emit({ type: 'compare', target: `node:${id}`, payload: { id, key: n.key, cmp } });
    ctx.metric('compare-count', 'inc');
    if (!(await pause())) return null;
    if (cmp === 'eq') {
      // 같은 키는 두 번 담지 않는다.
      await rc.emit({ type: 'miss', target: `node:${id}`, payload: { id, key } });
      return (await pause()) ? id : null;
    }

    if (cmp === 'lt') {
      const next = await insert(n.left, key);
      if (next === null) return null;
      n.left = next;
    } else {
      const next = await insert(n.right, key);
      if (next === null) return null;
      n.right = next;
    }
    return rebalance(id);
  };

  const search = async (key: number): Promise<boolean> => {
    let cur = rootId;
    while (cur !== null) {
      if (rc.cancelled) return false;
      const n = get(cur);
      const cmp = key === n.key ? 'eq' : key < n.key ? 'lt' : 'gt';
      await rc.emit({ type: 'compare', target: `node:${cur}`, payload: { id: cur, key: n.key, cmp } });
      ctx.metric('compare-count', 'inc');
      if (!(await pause())) return false;
      if (cmp === 'eq') {
        await rc.emit({ type: 'mark', target: `node:${cur}`, payload: { id: cur, key } });
        return pause();
      }
      cur = cmp === 'lt' ? n.left : n.right;
    }
    await rc.emit({ type: 'miss', payload: { id: rootId ?? '', key } });
    return pause();
  };

  /**
   * 지우기.
   *
   * 넣기와 다르다 — 한 자리를 고쳐도 위쪽이 다시 깨질 수 있어 **되돌아오는 길
   * 내내** 고친다. 그 비대칭이 이 화면에서 회전 수로 드러난다.
   */
  const removeAt = async (id: string | null, key: number): Promise<{ id: string | null } | null> => {
    if (rc.cancelled) return null;
    if (id === null) {
      await rc.emit({ type: 'miss', payload: { id: '', key } });
      return (await pause()) ? { id: null } : null;
    }

    const n = get(id);
    const cmp = key === n.key ? 'eq' : key < n.key ? 'lt' : 'gt';
    await rc.emit({ type: 'compare', target: `node:${id}`, payload: { id, key: n.key, cmp } });
    ctx.metric('compare-count', 'inc');
    if (!(await pause())) return null;

    if (cmp === 'lt') {
      const res = await removeAt(n.left, key);
      if (res === null) return null;
      n.left = res.id;
    } else if (cmp === 'gt') {
      const res = await removeAt(n.right, key);
      if (res === null) return null;
      n.right = res.id;
    } else {
      if (n.left === null || n.right === null) {
        const only = n.left ?? n.right;
        nodes.delete(id);
        ctx.metric('key-count', -1);
        await publish();
        if (!(await pause())) return null;
        return { id: only };
      }
      // 자식이 둘이면 오른쪽에서 가장 작은 값으로 갈아 끼우고, 그것을 빼는
      // 문제로 바꾼다.
      let succ = get(n.right);
      while (succ.left !== null) succ = get(succ.left);
      n.key = succ.key;
      const res = await removeAt(n.right, succ.key);
      if (res === null) return null;
      n.right = res.id;
      await publish();
    }
    const balanced = await rebalance(id);
    return balanced === null ? null : { id: balanced };
  };

  const parseKey = (raw: string): number | null => {
    const v = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(v) ? v : null;
  };

  // ── 1. 시연.
  reset();
  await publish();
  for (const k of rc.data.seed) {
    if (rc.cancelled) return;
    const next = await insert(rootId, k);
    if (next === null) return;
    rootId = next;
    await publish();
  }
  if (rc.cancelled) return;
  await finish();

  // ── 2. 학습자 차례.
  for (;;) {
    if (rc.cancelled) return;
    let ev: AvlInput;
    try {
      ev = await rc.waitForInput<AvlInput>();
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
      const next = await insert(rootId, key);
      if (next === null) return;
      rootId = next;
      await finish();
      continue;
    }
    if (ev.type === 'search') {
      if (!(await search(key))) return;
      await finish();
      continue;
    }
    if (ev.type === 'remove') {
      const res = await removeAt(rootId, key);
      if (res === null) return;
      rootId = res.id;
      await finish();
      continue;
    }
  }
}
