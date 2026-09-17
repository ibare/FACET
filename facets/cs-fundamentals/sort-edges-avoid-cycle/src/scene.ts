/**
 * sortEdgesAvoidCycle 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **가벼운 것부터 집되, 양 끝이 이미 한 무리면 버린다.** 그러니 화면이 반드시
 * 쥐고 있어야 하는 것은 셋이다 — 줄의 차례, 정점의 무리 소속, 그리고 **어느 간선이
 * 놓였고 어느 간선이 버려졌는가.** 버린 간선이 화면에 남지 않으면 *왜* 버렸는지가
 * 함께 사라진다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 `Map` 조회도 없었고 stage 는 화면을 되읽지 않았다
 * (①③④ 가 0 건). 상태는 전부 stage 의 **타입 선언**과 DOM 의 칠에 있었다 (⑤).
 *
 * - **`CardParts = { g, rect, cross, pose }`** — DOM 손잡이와 뜻이 한 객체다.
 *   `pose` 는 좌표처럼 생겼지만 실은 **카드가 네 단계 중 어디에 있나**를 통째로
 *   쥔다 (줄에 섰다 / 집혔다 / 빨려 들어갔다 / 바닥에 떨어졌다). 되돌리는 길은
 *   `render()` 로 통째로 다시 짓는 것뿐이었다. 이제 `order`·`picked`·`kept`·
 *   `discarded` 넷에서 파생된다.
 * - **`CardParts.cross` 의 `opacity`** — "이 간선은 버려졌다" 를 말하는 유일한
 *   자리였다. `discarded` 가 대신한다.
 * - **`nodeTone: Map<string, string>`** — 정점이 어느 무리인가. 이 조각의 판정
 *   근거 그 자체인데 `setNodeTone` 의 부수 효과로만 켜졌다. 이제 `reps` 가 쥐고
 *   정적 그리기도 그것으로 칠한다. **색은 여기에 없다** — 대표 정점이 바탕 명부의
 *   몇째인가만 말하고 색은 그리는 쪽이 정한다.
 * - **`keptIds: Set<string>`** — 놓인 간선. ③ 의 "조회로 갈리는 암묵 분기" 가
 *   projector 가 아니라 stage 에 있었다 (`keptIds.has(...)` 로 고리 경로를 걸렀다).
 *   이제 `kept` 가 차례까지 함께 쥔다.
 * - **`EdgeParts.solid` 의 `stroke-width` 3 / 4.5** — 한 속성에 "놓였다" 와
 *   "지금 고리를 이룬다" 두 뜻이 실려 있었다. 이제 앞은 `kept` 가, 뒤는
 *   `step.kind === 'discard'` 가 말한다.
 * - **`dropOccupied: number[]` · `dropCount`** — 바닥의 어느 가로 자리가 찼나,
 *   몇 장이 떨어졌나. 둘 다 `discarded` 의 차례에서 파생된다. 원래는 떨어질 때마다
 *   제자리에서 밀어 넣던 배열이라 순회 순서가 곧 자리였다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전 발신은 `id`·`u`·`v`·`weight`·`members`·`cyclePath`·`kept`·`discarded`·
 * `totalWeight`·`groupId`(버릴 때) 를 실어 왔다. 그중 **판정만 남겼다.**
 *
 * - `u`·`v`·`weight` 는 바탕 명부에 이미 있다. id 로 찾는다 (`edgeById`).
 * - 집는 차례는 **발신이 오는 순서가 이미 말한다** — 줄에서 `놓인 수 + 버린 수`
 *   번째가 지금 집는 것이다 (`nextInLine`). 그래서 `edge-picked` 는 payload 가 없다.
 * - `members` 는 무리 소속에서 나온다 (`membersOf`).
 * - `cyclePath` 는 **놓인 간선만 밟는 BFS** 라 구조에서 세진다. algorithm 이 갖고
 *   있던 `pathThroughKept` 가 여기로 옮겨 왔고 algorithm 쪽에서는 통째로 죽었다.
 * - `done` 의 세 수는 전부 `kept`·`discarded` 에서 파생된다. 그림과 결론이 같은
 *   자료를 쓰게 하는 것이 이행의 알맹이다.
 *
 * **`queue-ordered` 의 차례와 `edge-kept` 의 `groupId` 둘만 싣는다.**
 * 앞은 무게 순으로 줄 세우는 일이 곧 크루스칼의 첫 절반이라 함수로 내주면 장면이
 * 알고리즘을 되풀이하는 꼴이 되고 (제목부터 "간선을 무게 순으로" 다), 뒤는 어느
 * 무리가 이기는가가 유니온 파인드의 크기 규칙이라 장면이 셀 수 있는 것이 아니다.
 * 다만 차례는 **id 목록으로만** 싣는다 — 제원까지 실으면 바탕과 두 벌이 된다.
 *
 * 좌표는 담지 않는다. 정점의 차례와 간선의 양 끝이 배치를 정하므로 `render` 가
 * 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 간선 하나. 바탕 명부의 한 줄이고 걸음이 고치지 않는다. */
export type SortEdgesEdge = { id: string; u: string; v: string; weight: number };

/** 그림의 바탕. 걸음이 고치지 않는다. */
export type SortEdgesGraph = {
  nodes: string[];
  /** 선언된 차례 그대로. 줄이 서기 전 카드가 이 차례로 선다. */
  edges: SortEdgesEdge[];
};

/** 간선이 지금 어느 형편인가. 카드 자리와 선의 어휘가 여기서 갈린다. */
export type SortEdgesStatus = 'waiting' | 'picked' | 'kept' | 'discarded';

/**
 * 이번 걸음에 달라진 것. 무엇을 흐르게 할지 고르는 표식이자 **출발 그림의 계기값**이다.
 *
 * `keep` 이 `wasRep` 를 싣는 까닭 — 진 쪽 정점의 색이 옛 무리 색에서 새 무리 색으로
 * 흐르는데, 옛 색을 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 * 진 쪽 대표가 누구였는지를 장면이 말하면 옛 색이 셈으로 나온다.
 *
 * 되짚기(`animate` 거짓)에서는 쳐다보지 않는다.
 */
export type SortEdgesStep =
  | { kind: 'order' }
  | { kind: 'pick'; id: string }
  | { kind: 'keep'; id: string; wasRep: string; changed: string[] }
  | { kind: 'discard'; id: string };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10).
 *
 * `done` 은 인자를 담지 않는다 — 놓은 수 · 버린 수 · 무게 합은 전부 그 장면의
 * `kept`·`discarded` 에서 나오므로, 담아 두면 같은 수를 두 자리에서 세게 된다.
 */
export type SortEdgesCaption =
  | { kind: 'start' }
  | { kind: 'pick'; id: string }
  | { kind: 'keep'; id: string }
  | { kind: 'discard'; id: string }
  | { kind: 'done' };

export type SortEdgesAvoidCycleScene = {
  /** 정점과 간선. 걸음이 고치지 않는 바탕이고 되감기가 여기로 돌아간다. */
  graph: SortEdgesGraph;
  /**
   * 무게 순으로 선 줄. 아직 서기 전이면 비어 있다.
   *
   * 화면에 나란히 뜨는 제원(양 끝 · 무게)은 여기 담지 않는다. id 만 담고 바탕에서
   * 찾는다 — 두 벌이 되면 언젠가 갈린다.
   */
  order: string[];
  /** 지금 집어 든 간선. 놓거나 버리면 다시 `null` 이 된다. */
  picked: string | null;
  /** 놓인 간선, 놓인 차례대로. 나무가 이것이다. */
  kept: string[];
  /**
   * 버린 간선, 버린 차례대로.
   *
   * **이 조각이 말하려는 것의 절반이다.** 옮기기 전에는 카드가 바닥에 남는 것이
   * 전부였고 그래프 위에서는 간선이 통째로 사라졌다 — 어디에 놓으려다 버렸는지가
   * 완주 화면에 없었다. 이제 정적 그리기가 그 자리에 자취를 세운다.
   */
  discarded: string[];
  /**
   * 정점마다의 대표. `graph.nodes` 와 같은 차례다.
   *
   * 같은 대표를 가리키면 한 무리다 — 이 조각의 판정 근거 그 자체다. 색은 여기에
   * 없다. 그리는 쪽이 **바탕 명부에서 한 번에** 색판을 세고 대표의 자리 번호로
   * 색을 고른다 (`toneIndexOf`). 드러난 무리 수로 색판을 세면 무리가 합쳐질 때마다
   * 이미 칠한 색이 통째로 갈린다.
   */
  reps: string[];
  step: SortEdgesStep | null;
  caption: SortEdgesCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * **`order`·`picked`·`kept`·`discarded`·`reps` 를 여기 넣지 않는다.** 다섯은
 * 걸어온 자취이지 바탕이 아니다. 넣어 두면 되감은 화면이 이미 다 걸어간 꼴로 서고
 * 그 위에 algorithm 이 처음부터 다시 걸으므로 화면 안에서 두 이야기가 어긋난다.
 */
type SortEdgesBase = Pick<SortEdgesAvoidCycleScene, 'graph'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
function atStart(base: SortEdgesBase): SortEdgesAvoidCycleScene {
  return {
    graph: base.graph,
    order: [],
    picked: null,
    kept: [],
    discarded: [],
    // 처음에는 정점 하나가 곧 무리 하나다.
    reps: [...base.graph.nodes],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 초기 자료의 정점 목록을 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s.length > 0 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 초기 자료의 간선 목록. 양 끝이 정점 명부에 있어야 한다. */
function edgeList(v: unknown, nodes: string[]): SortEdgesEdge[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(nodes);
  const out: SortEdgesEdge[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const u = str(r.u);
    const w = str(r.v);
    if (id.length === 0 || !known.has(u) || !known.has(w)) continue;
    if (out.some((e) => e.id === id)) continue;
    out.push({ id, u, v: w, weight: num(r.weight) });
  }
  return out;
}

/** 문자열 목록으로 좁힌다. 줄의 차례가 이 길로 들어온다. */
function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s.length > 0) out.push(s);
  }
  return out;
}

/** 바탕 명부에서 간선 하나를 찾는다. 제원의 정본은 언제나 여기다. */
export function edgeById(
  scene: SortEdgesAvoidCycleScene,
  id: string,
): SortEdgesEdge | null {
  return scene.graph.edges.find((e) => e.id === id) ?? null;
}

/**
 * 카드가 줄에 서는 차례.
 *
 * 줄이 서기 전에는 선언된 차례 그대로다 — 그래서 첫 걸음에서 카드들이 실제로
 * 자리를 옮기는 것이 보인다.
 */
export function queueOrder(scene: SortEdgesAvoidCycleScene): string[] {
  if (scene.order.length > 0) return scene.order;
  return scene.graph.edges.map((e) => e.id);
}

/** 그 간선이 줄의 몇째 칸에 서 있나. 없으면 `-1`. */
export function slotOf(scene: SortEdgesAvoidCycleScene, id: string): number {
  return queueOrder(scene).indexOf(id);
}

/**
 * 지금 집을 차례인 간선.
 *
 * 줄에서 **놓인 수 + 버린 수** 번째다 — 집은 것은 반드시 놓이거나 버려지므로
 * 그 둘의 합이 곧 지나온 칸 수다. 발신이 오는 순서가 이미 말하는 것이라
 * `edge-picked` 는 payload 를 싣지 않는다.
 */
export function nextInLine(scene: SortEdgesAvoidCycleScene): string | null {
  const line = queueOrder(scene);
  const at = scene.kept.length + scene.discarded.length;
  return at >= 0 && at < line.length ? line[at] : null;
}

/** 그 간선이 지금 어느 형편인가. */
export function statusOf(
  scene: SortEdgesAvoidCycleScene,
  id: string,
): SortEdgesStatus {
  if (scene.picked === id) return 'picked';
  if (scene.kept.includes(id)) return 'kept';
  if (scene.discarded.includes(id)) return 'discarded';
  return 'waiting';
}

/** 그 정점이 속한 무리의 대표. 명부에 없으면 자기 자신. */
export function repAt(scene: SortEdgesAvoidCycleScene, node: string): string {
  const i = scene.graph.nodes.indexOf(node);
  return i >= 0 ? scene.reps[i] : node;
}

/** 그 대표에 매인 정점들. `members` payload 가 하던 일이다. */
export function membersOf(
  scene: SortEdgesAvoidCycleScene,
  rep: string,
): string[] {
  return scene.graph.nodes.filter((_, i) => scene.reps[i] === rep);
}

/**
 * 그 정점의 색 번호 — 대표가 **바탕 명부**의 몇째인가.
 *
 * 색판은 `graph.nodes.length` 로 한 번에 센다. "지금까지 드러난 무리 수" 로 세면
 * 무리가 합쳐질 때마다 hue 간격이 통째로 갈려 이미 칠한 무리의 색이 바뀐다.
 */
export function toneIndexOf(
  scene: SortEdgesAvoidCycleScene,
  node: string,
): number {
  const i = scene.graph.nodes.indexOf(repAt(scene, node));
  return i >= 0 ? i : 0;
}

/** 놓인 간선의 무게 합. 완주 캡션의 수가 그림과 같은 자료를 쓴다. */
export function totalWeightOf(scene: SortEdgesAvoidCycleScene): number {
  let sum = 0;
  for (const id of scene.kept) sum += edgeById(scene, id)?.weight ?? 0;
  return sum;
}

/**
 * **이미 놓인 간선만 밟아** 그 간선의 양 끝을 잇는 길. 없으면 빈 배열.
 *
 * 버리는 까닭 그 자체다 — 이 길에 집어 든 간선을 보태면 고리가 닫힌다. 한때
 * algorithm 이 `pathThroughKept` 로 셈해 payload 에 실어 왔는데, 놓인 간선의
 * 구조에서 그대로 나오는 것이라 장면이 센다. 실어 오면 화면의 실선과 말해진 길이
 * 다른 출처가 된다.
 */
export function cyclePathOf(
  scene: SortEdgesAvoidCycleScene,
  id: string,
): string[] {
  const edge = edgeById(scene, id);
  if (edge === null) return [];

  const adjacency = new Map<string, string[]>();
  for (const keptId of scene.kept) {
    const e = edgeById(scene, keptId);
    if (e === null) continue;
    const a = adjacency.get(e.u) ?? [];
    a.push(e.v);
    adjacency.set(e.u, a);
    const b = adjacency.get(e.v) ?? [];
    b.push(e.u);
    adjacency.set(e.v, b);
  }

  const previous = new Map<string, string>();
  const seen = new Set<string>([edge.u]);
  const queue: string[] = [edge.u];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === edge.v) break;
    for (const next of adjacency.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, cur);
      queue.push(next);
    }
  }
  if (!seen.has(edge.v)) return [];

  const path: string[] = [edge.v];
  let cursor = edge.v;
  while (cursor !== edge.u) {
    const p = previous.get(cursor);
    if (p === undefined) return [];
    path.push(p);
    cursor = p;
  }
  return path.reverse();
}

/** 길을 이루는 간선들 — 잇달아 나온 두 정점 사이의 **놓인** 간선. */
export function pathEdgesOf(
  scene: SortEdgesAvoidCycleScene,
  path: readonly string[],
): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const found = scene.kept.find((id) => {
      const e = edgeById(scene, id);
      return e !== null && ((e.u === a && e.v === b) || (e.u === b && e.v === a));
    });
    if (found !== undefined) out.push(found);
  }
  return out;
}

export const sortEdgesAvoidCycleScene: ScenePlan<SortEdgesAvoidCycleScene> = {
  /**
   * 첫 장면은 바탕만 세운다. 줄은 아직 서지 않았고 정점마다 저 혼자 한 무리다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): SortEdgesAvoidCycleScene {
    const d = (initialData ?? {}) as { nodes?: unknown; edges?: unknown };
    const nodes = nodeList(d.nodes);
    return atStart({ graph: { nodes, edges: edgeList(d.edges, nodes) } });
  },

  reduce(
    scene: SortEdgesAvoidCycleScene,
    event: FacetRuntimeEvent,
  ): SortEdgesAvoidCycleScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 무게 순으로 줄이 선다. 바탕에 없는 id 는 조용히 버린다 (C2).
      case 'queue-ordered': {
        const known = new Set(scene.graph.edges.map((e) => e.id));
        const order = idList(p.order).filter((id) => known.has(id));
        if (order.length === 0) return scene;
        return {
          ...scene,
          order,
          step: { kind: 'order' },
          caption: { kind: 'start' },
        };
      }

      // 줄 맨 위 카드를 집는다. 어느 것인지는 지나온 칸 수가 말한다.
      case 'edge-picked': {
        if (scene.picked !== null) return scene;
        const id = nextInLine(scene);
        if (id === null) return scene;
        return {
          ...scene,
          picked: id,
          step: { kind: 'pick', id },
          caption: { kind: 'pick', id },
        };
      }

      // 양 끝이 다른 무리라 간선을 놓는다. 두 무리가 하나가 된다.
      case 'edge-kept': {
        const id = scene.picked;
        if (id === null) return scene;
        const edge = edgeById(scene, id);
        if (edge === null) return scene;

        const ru = repAt(scene, edge.u);
        const rv = repAt(scene, edge.v);
        if (ru === rv) return scene;

        // 어느 쪽이 이기는가는 유니온 파인드의 크기 규칙이라 걸음의 판정이다.
        const winner = str(p.groupId);
        if (winner !== ru && winner !== rv) return scene;
        const loser = winner === ru ? rv : ru;

        // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
        const changed = membersOf(scene, loser);
        return {
          ...scene,
          picked: null,
          kept: [...scene.kept, id],
          reps: scene.reps.map((r) => (r === loser ? winner : r)),
          step: { kind: 'keep', id, wasRep: loser, changed },
          caption: { kind: 'keep', id },
        };
      }

      // 양 끝이 이미 한 무리라 고리가 된다. 카드가 떨어지고 자취가 남는다.
      case 'edge-discarded': {
        const id = scene.picked;
        if (id === null) return scene;
        return {
          ...scene,
          picked: null,
          discarded: [...scene.discarded, id],
          step: { kind: 'discard', id },
          caption: { kind: 'discard', id },
        };
      }

      // 할 말을 마쳤다. 화면은 그대로 두고 캡션만 갈린다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'done' } };

      // 처음 자리로. 줄도 무리도 놓인 간선도 버린 간선도 함께 거두어진다.
      case 'rewind':
        return atStart({ graph: scene.graph });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
