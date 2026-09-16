/**
 * negativeEdgeBreaks — 음수 간선이 "가장 가까운 것부터 굳히는" 방법을 깨뜨린다.
 *
 * 굳힌다(settle)는 것은 그 정점의 최단 거리를 더 고치지 않겠다고 약속하는 일이다.
 * 그 약속은 "앞으로 나올 어떤 길도 지금보다 짧을 수 없다" 는 전제 위에 서 있고,
 * 음수 간선은 그 전제를 무너뜨린다. 그러면 더 짧은 길이 뒤늦게 닿아도 굳은 자리는
 * 받지 않고, 그 소식이 바깥으로 나가지도 못한다. 화면에는 틀린 수가 남는다.
 *
 * ── 발신 이벤트 (전부 facet 고유. silent 없음 — 모두 걸음 경계다)
 *
 * payload 에는 **걸음이 내리는 판정만** 싣는다 — 어느 정점을 굳혔는가, 어느 간선을
 * 폈는가, 어느 길이 참 최단인가. 화면에 뜨는 **수**는 하나도 싣지 않는다. 거리표도
 * 후보값도 누계도 전부 장면이 구조에서 셈한다 (`scene.ts`). 수를 실으면 화면의 칸과
 * 캡션이 서로 다른 출처를 갖게 되어 언젠가 갈린다.
 *
 *   settle        { node: string }
 *                 target `node:<id>`. 아직 굳지 않은 것 중 가장 가까운 정점을 굳힌다.
 *                 그 거리는 장면의 거리표가 이미 쥐고 있다.
 *
 *   relax-accept  { from: string; to: string }
 *                 target `edge:<from>-<to>`. 굳지 않은 정점이 더 짧은 후보를 받는다.
 *                 후보값은 `거리표[from] + 무게` 라 장면이 셈한다.
 *
 *   relax-sealed  { from: string; to: string }
 *                 target `edge:<from>-<to>`. 후보가 더 짧은데 상대가 이미 굳어 거절한다.
 *                 이 조각이 보이려는 그 순간이다.
 *
 *   relax-kept    { from: string; to: string }
 *                 target `edge:<from>-<to>`. 후보가 지금 값보다 낫지 않아 그대로 둔다.
 *
 *   news-blocked  { node: string; to: string }
 *                 target `edge:<node>-<to>`. 거절당한 소식이 그 정점 밖으로 나갔다면
 *                 고쳤을 이웃. 얼마가 되었을지도, 대신 남는 값도 장면이 셈한다.
 *
 *   truth-trace   { path: string[] }
 *                 음수 간선을 견디는 방법(벨만-포드)으로 다시 센 참 최단 경로.
 *                 **이것만은 싣는다** — 어느 길이 참 최단인가는 구조를 통째로 훑어야
 *                 나오는 판정이고, 그 판정이 곧 이 조각이 견줄 잣대다. 다리마다의
 *                 누계는 경로와 간선 무게에서 더해지므로 장면의 몫이다.
 *
 *   verdict       payload 없음. 굳혀 놓은 수와 참값을 나란히 놓으라는 신호다.
 *                 두 수는 장면의 거리표와 참 최단 경로에 이미 있다.
 *
 *   rewind        payload 없음. 자동 재생이 끝난 뒤 `advance` 를 처음 눌렀을 때
 *                 화면을 처음으로 되돌린다.
 *
 * 화면 문안은 하나도 싣지 않는다 — 캡션은 장면이 종류만 말하고 문자는 stage 가
 * `params.t` 로 만든다 (C10).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NegativeEdge = { from: string; to: string; w: number };

export type NegativeEdgeBreaksData = {
  type: string;
  nodes: string[];
  edges: NegativeEdge[];
  start: string;
  goal: string;
  /** 걸음 사이 간격. 읽을 시간을 주는 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/**
 * 음수 간선을 견디는 방법으로 센 참 최단 — 벨만-포드.
 *
 * 거리표가 아니라 **거슬러 올라갈 앞자리**만 돌려준다. 참 최단의 누계는 경로와
 * 간선 무게에서 더해지므로 장면이 셈하고, 여기서 실어 보내면 같은 수를 두 자리에서
 * 세는 꼴이 된다.
 */
function trueShortest(
  nodes: string[],
  edges: NegativeEdge[],
  start: string,
): Map<string, string> {
  const best = new Map<string, number>();
  const prev = new Map<string, string>();
  for (const n of nodes) best.set(n, n === start ? 0 : Infinity);
  for (let round = 0; round < nodes.length; round += 1) {
    let changed = false;
    for (const e of edges) {
      const du = best.get(e.from) ?? Infinity;
      if (!Number.isFinite(du)) continue;
      const cand = du + e.w;
      if (cand < (best.get(e.to) ?? Infinity)) {
        best.set(e.to, cand);
        prev.set(e.to, e.from);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return prev;
}

/** prev 를 거슬러 start → goal 경로를 편다. 못 닿으면 빈 배열. */
function walkBack(prev: Map<string, string>, start: string, goal: string, limit: number): string[] {
  const path: string[] = [goal];
  let at = goal;
  for (let hop = 0; hop < limit; hop += 1) {
    if (at === start) return path;
    const p = prev.get(at);
    if (p === undefined) return [];
    path.unshift(p);
    at = p;
  }
  return [];
}

export const negativeEdgeBreaksAlgorithm = async (
  ctx: FacetContext<NegativeEdgeBreaksData>,
): Promise<void> => {
  const rx = ctx as ReactiveContext<NegativeEdgeBreaksData>;
  const { nodes, edges, start, goal, stepMs } = rx.data;

  /** 자동 재생이 끝나면 손으로 짚는 모드로 넘어간다. */
  let manual = false;
  /** 되감은 직후의 첫 문은 그냥 통과시킨다 — 첫 누름이 걸음까지 보이도록 (S-piece). */
  let skipGate = false;

  /** 걸음 사이의 문. 계속 가도 되면 true, 접혔으면 false. */
  const gate = async (): Promise<boolean> => {
    if (skipGate) {
      skipGate = false;
      return true;
    }
    if (!manual) return rx.sleep(stepMs);
    for (;;) {
      const input = await rx.waitForInput();
      // 지금은 메커니즘이 advance 만 흘려보내지만, 위젯 입력이 붙으면 아무 dispatch 나
      // 걸음으로 세게 된다. 종류를 본다.
      if (input.type === 'advance') return !rx.cancelled;
    }
  };

  const play = async (): Promise<void> => {
    const dist = new Map<string, number>();
    for (const n of nodes) dist.set(n, n === start ? 0 : Infinity);
    const sealed = new Set<string>();

    while (sealed.size < nodes.length) {
      // 아직 굳지 않은 것 중 가장 가까운 것. 같으면 nodes 차례가 앞선 것.
      let pick: string | null = null;
      for (const n of nodes) {
        if (sealed.has(n)) continue;
        const d = dist.get(n) ?? Infinity;
        if (!Number.isFinite(d)) continue;
        if (pick === null || d < (dist.get(pick) ?? Infinity)) pick = n;
      }
      if (pick === null) break; // 남은 것은 출발점에서 닿지 않는다.

      const base = dist.get(pick) ?? 0;
      sealed.add(pick);
      if (!(await gate())) return;
      await rx.emit({ type: 'settle', target: `node:${pick}`, payload: { node: pick } });

      for (const e of edges) {
        if (e.from !== pick) continue;
        const cand = base + e.w;
        const cur = dist.get(e.to) ?? Infinity;

        if (sealed.has(e.to)) {
          // 굳은 자리라도 더 나은 값이 아니면 할 말이 없다.
          if (!(cand < cur)) continue;
          if (!(await gate())) return;
          await rx.emit({
            type: 'relax-sealed',
            target: `edge:${e.from}-${e.to}`,
            payload: { from: e.from, to: e.to },
          });
          // 거절당한 소식이 그 자리 밖으로 나갔다면 고쳤을 이웃을 짚는다.
          for (const out of edges) {
            if (out.from !== e.to) continue;
            const would = cand + out.w;
            const stays = dist.get(out.to) ?? Infinity;
            if (!(would < stays)) continue;
            if (!(await gate())) return;
            await rx.emit({
              type: 'news-blocked',
              target: `edge:${out.from}-${out.to}`,
              payload: { node: out.from, to: out.to },
            });
          }
          continue;
        }

        if (!(await gate())) return;
        if (cand < cur) {
          dist.set(e.to, cand);
          await rx.emit({
            type: 'relax-accept',
            target: `edge:${e.from}-${e.to}`,
            payload: { from: e.from, to: e.to },
          });
        } else {
          // 이 그래프에서는 나지 않는 갈래다. 그래도 편 값이 더 나쁜 경우는
          // 이 방법의 정규 갈래이므로, 구조에서 셈하는 이상 빠뜨리면 거짓이 된다.
          await rx.emit({
            type: 'relax-kept',
            target: `edge:${e.from}-${e.to}`,
            payload: { from: e.from, to: e.to },
          });
        }
      }
    }

    const path = walkBack(trueShortest(nodes, edges, start), start, goal, nodes.length);
    if (path.length > 0) {
      if (!(await gate())) return;
      await rx.emit({ type: 'truth-trace', payload: { path } });
    }

    if (!(await gate())) return;
    await rx.emit({ type: 'verdict' });
  };

  await play();

  // 자동 재생이 끝났다. 이제 곱씹으며 한 걸음씩 짚을 수 있게 기다린다.
  manual = true;
  for (;;) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    await rx.emit({ type: 'rewind' });
    skipGate = true;
    await play();
  }
};
