/**
 * 강한 연결 요소 — 타잔 알고리즘.
 *
 * 한 번의 깊이 우선 순회로 서로 오갈 수 있는 무리를 모두 찾아낸다. 뻗어 나간
 * 끝에서 **이미 지나온 자리로 이어지는 간선**(되짚어 닿는 간선)이 발견되면
 * 그 사이가 통째로 한 무리다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<정점 번호>`      정점
 *   `edge:<출발>-<도착>`    방향 간선
 *
 * ── 이벤트 목록 + payload 스키마 (C2)
 *
 *   'phase'          silent. `{ phase: string }`
 *                    코드 패널 줄 동기화 전용. 아래 phase 어휘 참조.
 *
 *   'state-changed'  target `node:<v>` 또는 `node:*` 배열.
 *                    `{ state: 'idle' }`                       처음 상태로 (전체)
 *                    `{ state: 'probe', numbered: boolean }`   뿌리 후보를 짚는다
 *                    `{ state: 'active', num, low }`           번호를 매긴다
 *                    `{ state: 'active', num, low,
 *                       source: 'child' | 'back', via: number,
 *                       changed: boolean }`                    낮은값 갱신 여부
 *
 *   'stack-push'     target `node:<v>`. `{ depth: number }`
 *                    표준 어휘 `enqueue`/`dequeue` 를 쓰지 않는다 — 그 둘은 큐의
 *                    말이고 여기 담기는 것은 스택이다. 저장소에서 그 어휘를 쓰는
 *                    다섯은 전부 큐이고, 스택을 다루는 facet 은 push/pop 으로
 *                    말한다. 어휘가 어긋나면 projector 가 곧바로 되돌려 부르게
 *                    되는데, 실제로 그랬다 (C2).
 *                    스택에 올린다. depth 는 올린 뒤의 스택 높이.
 *
 *   'mark'           target `edge:<u>-<v>`.
 *                    `{ from, to, kind: 'scan' | 'tree' | 'back' | 'skip' }`
 *                    scan 지금 보는 간선 · tree 처음 가 보는 곳 ·
 *                    back 되짚어 닿는 간선 · skip 이미 닫힌 무리로 가는 간선
 *
 *   'group-closed'   facet 고유. target `node:<뿌리>`.
 *                    `{ groupIndex: number, members: number[], root: number }`
 *                    낮은값이 자기 번호와 같아 무리가 확정되는 순간. 스택에서
 *                    아직 꺼내기 전이며, members 는 꺼내질 정점 전부다.
 *
 *   'stack-pop'        target `node:<v>`. `{ groupIndex: number, root: number }`
 *                    스택에서 꺼내 무리에 넣는다.
 *
 *   'done'           `{ groupCount: number, vertexCount: number }`
 *
 * ── phase 어휘 (C3. `irs.ts` 와 글자까지 같다)
 *
 *   'init' | 'root-scan' | 'descend' | 'visit' | 'push' | 'scan-edge' |
 *   'lift-child' | 'back-edge' | 'root-check' | 'pop-group' | 'count-groups'
 *
 * ── 메트릭 (C5. `facet.ts` 선언과 같다)
 *
 *   'visit-count' · 'back-edge-count' · 'group-count'
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type SccData = {
  type: 'scc';
  /**
   * `adjacency[u]` 는 u 가 가리키는 이웃들. **적힌 차례가 곧 보는 차례** 이며
   * 그 차례가 방문 번호를 정하므로 셔플하면 안 된다.
   */
  adjacency: number[][];
};

export const scc = async (ctx: FacetContext<SccData>): Promise<void> => {
  const adjacency = ctx.data.adjacency;
  const n = Array.isArray(adjacency) ? adjacency.length : 0;
  if (n === 0) return;

  // 이름과 뜻은 irs.ts 와 같다. num 은 방문 번호, low 는 여기서 되짚어 닿을 수
  // 있는 가장 이른 번호, onstack 은 아직 무리가 정해지지 않은 채 스택에 있는지.
  const num: number[] = new Array<number>(n).fill(-1);
  const low: number[] = new Array<number>(n).fill(-1);
  const onstack: number[] = new Array<number>(n).fill(0);
  const stack: number[] = [];
  let nextNum = 0;
  let groupCount = 0;

  /** phase 는 호출부에 리터럴로 나타난다 (C3). */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const neighborsOf = (u: number): number[] => {
    const row = adjacency[u];
    return Array.isArray(row) ? row : [];
  };

  const tarjan = async (u: number): Promise<void> => {
    if (ctx.cancelled) return;

    await phase('visit');
    num[u] = nextNum;
    low[u] = nextNum;
    nextNum += 1;
    ctx.metric('visit-count', 'inc');
    await ctx.emit({
      type: 'state-changed',
      target: `node:${u}`,
      payload: { state: 'active', num: num[u], low: low[u] },
    });
    if (ctx.cancelled) return;

    await phase('push');
    stack.push(u);
    onstack[u] = 1;
    await ctx.emit({ type: 'stack-push', target: `node:${u}`, payload: { depth: stack.length } });

    for (const v of neighborsOf(u)) {
      if (ctx.cancelled) return;

      await phase('scan-edge');
      await ctx.emit({
        type: 'mark',
        target: `edge:${u}-${v}`,
        payload: { from: u, to: v, kind: 'scan' },
      });

      if (num[v] === -1) {
        // 아직 안 가 본 곳 — 내려갔다 와서 자식이 닿은 곳을 물려받는다.
        await phase('descend');
        await ctx.emit({
          type: 'mark',
          target: `edge:${u}-${v}`,
          payload: { from: u, to: v, kind: 'tree' },
        });
        await tarjan(v);
        if (ctx.cancelled) return;

        await phase('lift-child');
        const lifted = low[v] < low[u];
        if (lifted) low[u] = low[v];
        await ctx.emit({
          type: 'state-changed',
          target: `node:${u}`,
          payload: { state: 'active', num: num[u], low: low[u], source: 'child', via: v, changed: lifted },
        });
      } else {
        await phase('back-edge');
        if (onstack[v] === 1) {
          // 되짚어 닿았다. 여기서 쓰는 것은 low[v] 가 아니라 **num[v]** 다 —
          // v 가 어디까지 닿는지는 아직 정해지지 않았고, 확실한 것은 v 가
          // 지금 스택에 있다는 사실뿐이기 때문이다.
          ctx.metric('back-edge-count', 'inc');
          await ctx.emit({
            type: 'mark',
            target: `edge:${u}-${v}`,
            payload: { from: u, to: v, kind: 'back' },
          });
          if (ctx.cancelled) return;
          const lowered = num[v] < low[u];
          if (lowered) low[u] = num[v];
          await ctx.emit({
            type: 'state-changed',
            target: `node:${u}`,
            payload: { state: 'active', num: num[u], low: low[u], source: 'back', via: v, changed: lowered },
          });
        } else {
          // 이미 무리가 닫힌 곳. 여기로 가는 간선은 아무것도 물려주지 않는다.
          await ctx.emit({
            type: 'mark',
            target: `edge:${u}-${v}`,
            payload: { from: u, to: v, kind: 'skip' },
          });
        }
      }
    }

    if (ctx.cancelled) return;
    await phase('root-check');
    if (low[u] !== num[u]) return;

    // 뻗어 나간 어디에서도 나보다 위로 못 갔다 — 스택에서 나까지가 한 무리다.
    const groupIndex = groupCount;
    groupCount += 1;
    ctx.metric('group-count', 'inc');
    const members = stack.slice(stack.indexOf(u));
    await ctx.emit({
      type: 'group-closed',
      target: `node:${u}`,
      payload: { groupIndex, members, root: u },
    });

    let w = -1;
    while (w !== u) {
      if (ctx.cancelled) return;
      await phase('pop-group');
      const popped = stack.pop();
      // 스택이 빌 수 없는 자리다 — u 자신이 아직 안에 있다. 그래도 pop 의
      // 반환형이 number | undefined 라, 못 꺼낸 경우는 무한 루프 대신 끊는다.
      if (popped === undefined) return;
      w = popped;
      onstack[w] = 0;
      await ctx.emit({ type: 'stack-pop', target: `node:${w}`, payload: { groupIndex, root: u } });
    }
  };

  await phase('init');
  await ctx.emit({
    type: 'state-changed',
    target: adjacency.map((_, i) => `node:${i}`),
    payload: { state: 'idle' },
  });

  for (let i = 0; i < n; i += 1) {
    if (ctx.cancelled) return;
    await phase('root-scan');
    await ctx.emit({
      type: 'state-changed',
      target: `node:${i}`,
      payload: { state: 'probe', numbered: num[i] !== -1 },
    });
    if (num[i] === -1) {
      await phase('descend');
      await tarjan(i);
    }
  }

  if (ctx.cancelled) return;
  await phase('count-groups');
  await ctx.emit({ type: 'done', payload: { groupCount, vertexCount: n } });
};
