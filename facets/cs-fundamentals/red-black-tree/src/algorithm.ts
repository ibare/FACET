/**
 * red-black-tree — 레드-블랙 트리 완결형 algorithm.
 *
 * 조각 둘(`recolorThenRotate` · `blackHeightEqual`)이 **한 순간**을 덮는다 —
 * 한 번의 위반을 색칠로 풀거나 회전으로 풀거나, 그리고 어느 길로 가도 검은
 * 수가 같다는 것. 이 완제품이 더하는 것은 그 순간들이 이어졌을 때다.
 *
 *   위로 밀린다   색칠은 문제를 없애는 것이 아니라 **위로 미는** 것이다. 조부모가
 *                 빨강이 되면 그 위에서 다시 위반이 생길 수 있어, 뿌리까지
 *                 이어질 수 있다. 조각은 한 번의 색칠까지만 보인다.
 *   지우기        넣기가 세 경우인 데 비해 지우기는 네 경우다. 그리고 같은
 *                 짜임이 반복된다 — **색칠은 문제를 위로 밀고 회전은 끝낸다.**
 *                 그 대칭이 두 연산을 나란히 몰아 봐야 보인다.
 *   흑색 높이     조각은 한 순간에 같다는 것을 보인다. 여기서는 넣고 빼기를
 *                 되풀이해도 **계속** 같다는 것이 화면의 수로 남는다.
 *
 * ── AVL 과의 대비
 *
 * 회전을 덜 하는 대신 키를 더 허용한다. 두 화면의 회전 수와 높이를 견주면
 * 왜 둘이 다 있는지가 드러난다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<id>`   한 자리.
 *
 * ── 이벤트
 *
 * | type            | 표준 | target       | payload |
 * | --------------- | --- | ------------ | ------- |
 * | `state-changed` | O   | 없음          | `{ nodes, rootId }` 나무 전체 |
 * | `compare`       | O   | `node:<id>`  | `{ id, key, cmp }` 내려갈 쪽을 정한다 |
 * | `append`        | O   | `node:<id>`  | `{ id, key }` 빨강으로 앉는다 |
 * | `mark`          | O   | `node:<id>`  | `{ id, key }` 찾았다 |
 * | `done`          | O   | 없음          | `{ keys, height, blackHeight, ok }` 한 조작이 끝났다 |
 * | `violation`     | ✗   | `node:<id>`  | `{ id, kind }` 위반을 만났다. kind 는 아래 어휘 |
 * | `recolor`       | ✗   | 없음          | `{ changes }` 색을 갈아 끼운다 |
 * | `rotate`        | ✗   | `node:<id>`  | `{ pivot, newRoot, dir }` 한 번의 회전 |
 * | `bubble`        | ✗   | `node:<id>`  | `{ id }` 문제가 이 자리로 밀려 올라왔다 |
 * | `miss`          | ✗   | 없음          | `{ key }` 없다 |
 * | `phase`         | ✗   | 없음          | `{ phase }` **silent** — 코드 패널의 줄을 짚기 위한 것 (C3) |
 *
 * ── 위반 어휘 (kind)
 *
 *   넣기  'uncle-red' · 'triangle' · 'line'
 *   빼기  'sibling-red' · 'both-black' · 'near-red' · 'far-red'
 *
 * ── phase 어휘 (irs.ts 와 글자 단위로 같아야 한다 — C3)
 *
 *   'check' | 'uncle-red' | 'triangle' | 'line' | 'root-black'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   key-count · recolor-count · rotation-count · compare-count
 *
 * 색칠과 회전을 갈라 세는 것이 요점이다. 이 자료구조의 값어치가 "회전을 덜
 * 한다" 는 데 있으므로, 둘을 합쳐 세면 그 말이 화면에서 사라진다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RedBlackTreeData = {
  type: 'red-black-tree';
  /** 시연에서 넣어 볼 키. 색칠과 회전이 둘 다 나오는 순서라야 한다. */
  seed: number[];
  /** 걸음 간격(ms). */
  stepMs: number;
};

type Color = 'red' | 'black';

type Node = {
  id: string;
  key: number;
  color: Color;
  parent: string | null;
  left: string | null;
  right: string | null;
};

type RbInput = { type: string; payload?: Record<string, unknown> };

export async function redBlackTree(ctx: FacetContext<RedBlackTreeData>): Promise<void> {
  const rc = ctx as ReactiveContext<RedBlackTreeData>;
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
    if (!n) throw new Error(`red-black-tree: 자리 "${id}" 를 찾을 수 없다`);
    return n;
  };
  /** 빈 자리는 검정으로 센다 — 이 규칙이 흑색 높이를 성립시킨다. */
  const colorOf = (id: string | null): Color => (id === null ? 'black' : get(id).color);

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

  const heightOf = (id: string | null): number =>
    id === null ? 0 : 1 + Math.max(heightOf(get(id).left), heightOf(get(id).right));

  /**
   * 뿌리에서 잎까지 지나는 검은 자리 수. 어느 길로 가도 같아야 한다.
   *
   * 길마다 다르면 `null` 을 돌려준다 — 그 자체가 나무가 깨졌다는 뜻이라
   * 화면이 거짓을 말하지 않게 하는 장치다.
   */
  const blackHeight = (id: string | null): number | null => {
    if (id === null) return 1;
    const n = get(id);
    const l = blackHeight(n.left);
    const r = blackHeight(n.right);
    if (l === null || r === null || l !== r) return null;
    return l + (n.color === 'black' ? 1 : 0);
  };

  const recolor = async (changes: { id: string; color: Color }[]): Promise<boolean> => {
    for (const c of changes) get(c.id).color = c.color;
    ctx.metric('recolor-count', 'inc');
    await rc.emit({ type: 'recolor', payload: { changes } });
    await publish();
    return pause();
  };

  const rotate = async (pivotId: string, dir: 'left' | 'right'): Promise<boolean> => {
    const pivot = get(pivotId);
    const riserId = dir === 'left' ? pivot.right : pivot.left;
    if (riserId === null) return true;
    const riser = get(riserId);
    const parentId = pivot.parent;

    if (dir === 'left') {
      pivot.right = riser.left;
      if (riser.left !== null) get(riser.left).parent = pivot.id;
      riser.left = pivot.id;
    } else {
      pivot.left = riser.right;
      if (riser.right !== null) get(riser.right).parent = pivot.id;
      riser.right = pivot.id;
    }
    riser.parent = parentId;
    pivot.parent = riser.id;
    if (parentId === null) {
      rootId = riser.id;
    } else {
      const p = get(parentId);
      if (p.left === pivot.id) p.left = riser.id;
      else p.right = riser.id;
    }

    ctx.metric('rotation-count', 'inc');
    await rc.emit({
      type: 'rotate',
      target: `node:${pivot.id}`,
      payload: { pivot: pivot.id, newRoot: riser.id, dir },
    });
    await publish();
    return pause();
  };

  const finish = async (): Promise<void> => {
    await publish();
    const bh = blackHeight(rootId);
    await rc.emit({
      type: 'done',
      payload: {
        keys: nodes.size,
        height: heightOf(rootId),
        blackHeight: bh ?? 0,
        ok: bh !== null,
      },
    });
  };

  /**
   * 넣은 뒤의 수선. 세 경우다.
   *
   *   uncle-red   옆자리도 빨강 → 색만 갈고 **문제를 위로 민다.** 끝나지 않는다.
   *   triangle    옆자리가 검정이고 안쪽으로 꺾였다 → 먼저 돌려 곧게 편다.
   *   line        곧게 뻗었다 → 돌리고 색을 맞바꾸면 **끝난다.**
   *
   * 색칠은 밀고 회전은 끝낸다 — 이 짜임이 지우기에서도 그대로 되풀이된다.
   */
  const insertFixup = async (startId: string): Promise<boolean> => {
    let z = startId;
    for (;;) {
      if (rc.cancelled) return false;
      const node = get(z);
      const parentId = node.parent;
      await phase('check');
      if (parentId === null || get(parentId).color === 'black') break;

      const parent = get(parentId);
      const grandId = parent.parent;
      if (grandId === null) break;
      const grand = get(grandId);
      const parentIsLeft = grand.left === parentId;
      const uncleId = parentIsLeft ? grand.right : grand.left;

      if (colorOf(uncleId) === 'red') {
        await phase('uncle-red');
        await rc.emit({ type: 'violation', target: `node:${z}`, payload: { id: z, kind: 'uncle-red' } });
        if (!(await pause())) return false;
        const changes: { id: string; color: Color }[] = [
          { id: parentId, color: 'black' },
          { id: grandId, color: 'red' },
        ];
        if (uncleId !== null) changes.push({ id: uncleId, color: 'black' });
        if (!(await recolor(changes))) return false;
        // 문제가 사라진 것이 아니라 조부모로 올라갔다.
        await rc.emit({ type: 'bubble', target: `node:${grandId}`, payload: { id: grandId } });
        if (!(await pause())) return false;
        z = grandId;
        continue;
      }

      const zIsLeft = parent.left === z;
      if (zIsLeft !== parentIsLeft) {
        await phase('triangle');
        await rc.emit({ type: 'violation', target: `node:${z}`, payload: { id: z, kind: 'triangle' } });
        if (!(await pause())) return false;
        if (!(await rotate(parentId, parentIsLeft ? 'left' : 'right'))) return false;
        z = parentId;
        continue;
      }

      await phase('line');
      await rc.emit({ type: 'violation', target: `node:${z}`, payload: { id: z, kind: 'line' } });
      if (!(await pause())) return false;
      if (!(await recolor([{ id: parentId, color: 'black' }, { id: grandId, color: 'red' }]))) return false;
      if (!(await rotate(grandId, parentIsLeft ? 'right' : 'left'))) return false;
      break;
    }

    await phase('root-black');
    if (rootId !== null && get(rootId).color === 'red') {
      // 뿌리는 늘 검정이다. 이 한 번의 색칠이 흑색 높이를 한꺼번에 올린다.
      if (!(await recolor([{ id: rootId, color: 'black' }]))) return false;
    }
    return true;
  };

  const insert = async (key: number): Promise<boolean> => {
    let parentId: string | null = null;
    let cur = rootId;
    while (cur !== null) {
      if (rc.cancelled) return false;
      const n = get(cur);
      const cmp = key === n.key ? 'eq' : key < n.key ? 'lt' : 'gt';
      await rc.emit({ type: 'compare', target: `node:${cur}`, payload: { id: cur, key: n.key, cmp } });
      ctx.metric('compare-count', 'inc');
      if (!(await pause())) return false;
      if (cmp === 'eq') {
        await rc.emit({ type: 'miss', payload: { key } });
        return pause();
      }
      parentId = cur;
      cur = cmp === 'lt' ? n.left : n.right;
    }

    // 새 자리는 늘 빨강으로 들어온다 — 검정으로 넣으면 그 길만 검은 수가 늘어
    // 곧바로 깨진다.
    const fresh: Node = {
      id: `n${nextId++}`,
      key,
      color: 'red',
      parent: parentId,
      left: null,
      right: null,
    };
    nodes.set(fresh.id, fresh);
    ctx.metric('key-count', 'inc');
    if (parentId === null) rootId = fresh.id;
    else {
      const p = get(parentId);
      if (key < p.key) p.left = fresh.id;
      else p.right = fresh.id;
    }
    await rc.emit({ type: 'append', target: `node:${fresh.id}`, payload: { id: fresh.id, key } });
    await publish();
    if (!(await pause())) return false;
    return insertFixup(fresh.id);
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
    await rc.emit({ type: 'miss', payload: { key } });
    return pause();
  };

  /** `child` 자리에 `next` 를 갈아 끼운다. 부모 쪽 이음도 함께 고친다. */
  const transplant = (childId: string, nextId2: string | null): void => {
    const child = get(childId);
    const p = child.parent;
    if (p === null) rootId = nextId2;
    else {
      const parent = get(p);
      if (parent.left === childId) parent.left = nextId2;
      else parent.right = nextId2;
    }
    if (nextId2 !== null) get(nextId2).parent = p;
  };

  /**
   * 뺀 뒤의 수선. 네 경우이고, 넣기와 **같은 짜임**이다.
   *
   *   sibling-red  형제가 빨강 → 돌려서 형제를 검정으로 만든다. 아직 안 끝난다.
   *   both-black   형제의 두 자식이 다 검정 → 형제를 빨강으로 하고 **위로 민다.**
   *   near-red     가까운 쪽만 빨강 → 형제를 돌려 먼 쪽이 빨강이 되게 한다.
   *   far-red      먼 쪽이 빨강 → 돌리고 색을 맞추면 **끝난다.**
   *
   * `x` 가 null 일 수 있어(빈 자리가 이중검정이 된다) 부모를 함께 들고 다닌다.
   */
  const deleteFixup = async (startX: string | null, startParent: string | null): Promise<boolean> => {
    let x = startX;
    let parentId = startParent;

    while (x !== rootId && colorOf(x) === 'black' && parentId !== null) {
      if (rc.cancelled) return false;
      const parent = get(parentId);
      const xIsLeft = parent.left === x;
      let siblingId = xIsLeft ? parent.right : parent.left;
      if (siblingId === null) break;
      let sibling = get(siblingId);

      if (sibling.color === 'red') {
        await rc.emit({
          type: 'violation',
          target: `node:${siblingId}`,
          payload: { id: siblingId, kind: 'sibling-red' },
        });
        if (!(await pause())) return false;
        if (!(await recolor([{ id: siblingId, color: 'black' }, { id: parentId, color: 'red' }])))
          return false;
        if (!(await rotate(parentId, xIsLeft ? 'left' : 'right'))) return false;
        const p2 = get(parentId);
        siblingId = xIsLeft ? p2.right : p2.left;
        if (siblingId === null) break;
        sibling = get(siblingId);
      }

      const near = xIsLeft ? sibling.left : sibling.right;
      const far = xIsLeft ? sibling.right : sibling.left;

      if (colorOf(near) === 'black' && colorOf(far) === 'black') {
        await rc.emit({
          type: 'violation',
          target: `node:${siblingId}`,
          payload: { id: siblingId, kind: 'both-black' },
        });
        if (!(await pause())) return false;
        if (!(await recolor([{ id: siblingId, color: 'red' }]))) return false;
        // 넣기의 uncle-red 와 같은 자리다 — 색칠은 문제를 위로 민다.
        x = parentId;
        parentId = get(parentId).parent;
        await rc.emit({ type: 'bubble', target: `node:${x}`, payload: { id: x } });
        if (!(await pause())) return false;
        continue;
      }

      if (colorOf(far) === 'black') {
        await rc.emit({
          type: 'violation',
          target: `node:${siblingId}`,
          payload: { id: siblingId, kind: 'near-red' },
        });
        if (!(await pause())) return false;
        if (near !== null) {
          if (!(await recolor([{ id: near, color: 'black' }, { id: siblingId, color: 'red' }])))
            return false;
        }
        if (!(await rotate(siblingId, xIsLeft ? 'right' : 'left'))) return false;
        const p3 = get(parentId);
        siblingId = xIsLeft ? p3.right : p3.left;
        if (siblingId === null) break;
        sibling = get(siblingId);
      }

      const far2 = xIsLeft ? sibling.right : sibling.left;
      await rc.emit({
        type: 'violation',
        target: `node:${siblingId}`,
        payload: { id: siblingId, kind: 'far-red' },
      });
      if (!(await pause())) return false;
      const changes: { id: string; color: Color }[] = [
        { id: siblingId, color: get(parentId).color },
        { id: parentId, color: 'black' },
      ];
      if (far2 !== null) changes.push({ id: far2, color: 'black' });
      if (!(await recolor(changes))) return false;
      if (!(await rotate(parentId, xIsLeft ? 'left' : 'right'))) return false;
      x = rootId;
      break;
    }

    if (x !== null && get(x).color === 'red') {
      if (!(await recolor([{ id: x, color: 'black' }]))) return false;
    }
    return true;
  };

  const remove = async (key: number): Promise<boolean> => {
    let target: string | null = rootId;
    while (target !== null) {
      if (rc.cancelled) return false;
      const n = get(target);
      const cmp = key === n.key ? 'eq' : key < n.key ? 'lt' : 'gt';
      await rc.emit({
        type: 'compare',
        target: `node:${target}`,
        payload: { id: target, key: n.key, cmp },
      });
      ctx.metric('compare-count', 'inc');
      if (!(await pause())) return false;
      if (cmp === 'eq') break;
      target = cmp === 'lt' ? n.left : n.right;
    }
    if (target === null) {
      await rc.emit({ type: 'miss', payload: { key } });
      return pause();
    }

    const z = get(target);
    let removedColor: Color = z.color;
    let x: string | null;
    let xParent: string | null;

    if (z.left === null) {
      x = z.right;
      xParent = z.parent;
      transplant(z.id, z.right);
    } else if (z.right === null) {
      x = z.left;
      xParent = z.parent;
      transplant(z.id, z.left);
    } else {
      // 자식이 둘이면 오른쪽에서 가장 작은 값이 그 자리를 잇는다.
      let succ = get(z.right);
      while (succ.left !== null) succ = get(succ.left);
      removedColor = succ.color;
      x = succ.right;
      if (succ.parent === z.id) {
        xParent = succ.id;
        if (x !== null) get(x).parent = succ.id;
      } else {
        xParent = succ.parent;
        transplant(succ.id, succ.right);
        succ.right = z.right;
        get(succ.right).parent = succ.id;
      }
      transplant(z.id, succ.id);
      succ.left = z.left;
      get(succ.left).parent = succ.id;
      succ.color = z.color;
    }

    nodes.delete(z.id);
    ctx.metric('key-count', -1);
    await publish();
    if (!(await pause())) return false;

    // 검은 자리를 뺐으면 그 길만 검은 수가 하나 모자라진다 — 그때만 수선한다.
    if (removedColor === 'black') {
      if (!(await deleteFixup(x, xParent))) return false;
    }
    if (rootId !== null && get(rootId).color === 'red') {
      if (!(await recolor([{ id: rootId, color: 'black' }]))) return false;
    }
    return true;
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
    if (!(await insert(k))) return;
  }
  if (rc.cancelled) return;
  await finish();

  // ── 2. 학습자 차례.
  for (;;) {
    if (rc.cancelled) return;
    let ev: RbInput;
    try {
      ev = await rc.waitForInput<RbInput>();
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
