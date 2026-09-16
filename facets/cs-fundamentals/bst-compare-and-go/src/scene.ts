/**
 * BstCompareAndGo 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **견주고 어느 쪽으로 내려갔는가.** 그러니 화면이 반드시 쥐고 있어야 하는 것은
 * 둘이다 — 지금까지 견주어 온 마디들(`path`)과 후보에서 빠진 마디들(`dropped`).
 * 둘 다 **남는 강조**라 정적 그리기에도 들어간다. 빠뜨리면 되짚었을 때 화면이 주장을
 * 잃는다 (S-scene).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각은 상태를 **변수가 아닌 자리**에 두고 있었다. stage 에는 `let` 이
 * 하나도 없었고, 그래서 ①~③ 의 grep 으로는 아무것도 나오지 않는다. 화면이 통째로
 * 상태였다는 뜻이다.
 *
 * - **projector 의 `let needle`** — 찾는 값. `caption.target` 문안을 짓는 데만 쓰였다.
 *   이제 장면의 `needle` 이고, 비교 캡션의 등식도 같은 자리에서 나온다.
 * - **커서의 `transform`** — 지금 어느 마디에 서 있나가 `<circle>` 의 `transform`
 *   문자열 안에만 있었다. 되감아 세운 화면에는 커서를 되살릴 근거가 아예 없었다.
 *   이제 `path` 의 끝이 그것을 말한다.
 * - **옅어진 칠의 누적** — 버린 서브트리는 `circle.style.opacity = '0.3'` 으로만
 *   남았다. 되돌리는 명령이 `reset()` 뿐이라 칠이 걸음마다 쌓였는데, **그 누적이 곧
 *   "몇 가지를 버렸나" 라는 주장**이었다. 이제 `dropped` 가 쥔다.
 * - **찾음 표식** — `setMatched` 가 채움·잉크·scale 을 바꿔 놓고 되돌리지 않았다.
 *   머무는 강조인데 장면에 근거가 없었다. 이제 `matchedId` 다.
 * - **`Map<string, NodeEntry>` 와 `NodeEntry.node`** — 나무의 생김새(어느 자식이
 *   있나)가 DOM 손잡이와 한 객체에 묶여 있었다. `foldSide` 가 `rootEntry.node.left`
 *   를 되읽어 어느 간선을 옅게 할지 갈랐다. `let` 도 `Set.has` 도 아니라 타입 선언을
 *   읽어야 나오는 자리다 (3-1 의 ⑤). 이제 `nodes` 가 나무를 말하고, 간선의 형편은
 *   `dropped` 에서 파생된다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전 `compare` 는 `nodeValue`·`needle`·`result` 를, `fold` 는 `remaining` 을
 * 실어 왔다. 넷 다 **장면이 스스로 셀 수 있는 수**이고, 그중 앞의 셋은 화면에
 * `40 < 50` 이라는 **등식**으로 나란히 뜬다. 항이 두 출처에서 오면 언젠가 갈리고,
 * 갈리는 날 화면이 스스로 거짓이 된다. 그래서 algorithm 에서 그 넷을 뺐고 여기
 * `compareAt` 과 `candidatesLeft` 하나씩이 정본이다 — 화면에 그려진 동그라미의 값과
 * 캡션의 등식이 같은 함수를 지난다.
 *
 * 좌표는 담지 않는다. 값과 나무 모양이 자리를 정하므로 `render` 가 캔버스에서
 * 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 나무의 마디 하나. 자리는 담지 않는다 — 생김새만 담는다 (S-piece). */
export type BstSceneNode = {
  id: string;
  value: number;
  left: string | null;
  right: string | null;
};

/** 견줌의 결과. 장면에 저장하지 않고 `compareAt` 이 그때그때 셈한다. */
export type BstRelation = 'lt' | 'gt' | 'eq';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type BstCaption =
  | { kind: 'target' }
  | { kind: 'compare'; nodeId: string }
  | { kind: 'narrowed' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `compare` 가 **출발 마디를 함께 싣는 까닭** — 커서가 옮겨 가는 운동은 지난 마디에서
 * 출발하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 그래서 `from` 을 걸음이 직접 싣는다.
 */
export type BstStep =
  | { kind: 'compare'; nodeId: string; from: string | null }
  | { kind: 'fold'; nodes: string[] };

export type BstCompareAndGoScene = {
  /** 나무 전체. 바탕 — 걸음이 고치지 않는다. */
  nodes: BstSceneNode[];
  /** 뿌리 마디. 바탕. */
  rootId: string;
  /** 찾는 값. 바탕. 비교 캡션의 등식이 여기서 한 항을 얻는다. */
  needle: number;
  /** 견주어 온 마디들, 내려간 차례대로. 끝이 곧 커서 자리다. 남는 강조. */
  path: string[];
  /** 후보에서 빠진 마디들. 걸음마다 쌓인다 — 그 누적이 이 조각의 주장이다. */
  dropped: string[];
  /** 찾은 자리. 머무는 강조라 정적 그리기에도 들어간다. */
  matchedId: string | null;
  caption: BstCaption | null;
  step: BstStep | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * **`path`·`dropped`·`matchedId` 를 여기 넣지 않는다.** 셋은 걸어온 자취이지 바탕이
 * 아니다. 넣어 두면 되감은 화면이 이미 다 내려간 꼴로 서고 그 위에 algorithm 이
 * 처음부터 다시 내려가므로, 화면 안에서 두 이야기가 어긋난다 (S-scene).
 */
type BstBase = Pick<BstCompareAndGoScene, 'nodes' | 'rootId' | 'needle'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 *
 * `nodes` 는 장면끼리 나눠 쓴다. 누구도 고치지 않으므로 과거가 바뀔 일이 없다
 * (S-scene 의 Exception).
 */
function atStart(base: BstBase): BstCompareAndGoScene {
  return {
    nodes: base.nodes,
    rootId: base.rootId,
    needle: base.needle,
    path: [],
    dropped: [],
    matchedId: null,
    caption: { kind: 'target' },
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

type RawNode = { value: number; left: string | null; right: string | null };

function asRawNode(v: unknown): RawNode | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.value !== 'number') return null;
  const left = o.left === null || typeof o.left === 'string' ? (o.left as string | null) : null;
  const right = o.right === null || typeof o.right === 'string' ? (o.right as string | null) : null;
  return { value: o.value, left, right };
}

/**
 * 뿌리에서 실제로 훑어 나무를 새로 짓는다.
 *
 * **넘겨받은 자료를 참조로 담지 않는다** (S-scene MUST). 러너가 주는 것은 mechanism
 * 과 view 가 함께 쓰는 한 객체다. 여기서 값만 베껴 새 객체를 세우므로 되짚을 때
 * 바탕이 흔들리지 않는다. 전위 순회라 `nodes[0]` 이 곧 뿌리이고, 뿌리에서 닿지 않는
 * 마디는 애초에 들어오지 않는다.
 */
function copyTree(raw: Record<string, unknown>, rootId: string): BstSceneNode[] {
  const out: BstSceneNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null): void => {
    if (id === null || seen.has(id)) return;
    const node = asRawNode(raw[id]);
    if (node === null) return;
    seen.add(id);
    out.push({ id, value: node.value, left: node.left, right: node.right });
    walk(node.left);
    walk(node.right);
  };
  walk(rootId);
  return out;
}

/** 마디 하나를 id 로 찾는다. 나무가 일곱이라 훑어도 싸다. */
export function nodeOf(scene: BstCompareAndGoScene, id: string): BstSceneNode | null {
  return scene.nodes.find((n) => n.id === id) ?? null;
}

/**
 * 그 마디에서 견주면 어느 쪽인가. **등식의 정본**이다.
 *
 * 캡션의 `40 < 50` 도, 어느 가지를 버렸나도 전부 이 함수 하나를 지난다. 걸음이
 * 실어 온 결과를 믿지 않고 장면이 직접 셈하므로, 화면에 그려진 동그라미의 값과
 * 캡션의 항이 갈릴 수가 없다.
 */
export function compareAt(scene: BstCompareAndGoScene, id: string): BstRelation | null {
  const node = nodeOf(scene, id);
  if (node === null) return null;
  if (scene.needle < node.value) return 'lt';
  if (scene.needle > node.value) return 'gt';
  return 'eq';
}

/**
 * 아직 후보로 남은 마디 수. **셈의 정본**이다.
 *
 * 화면에 옅게 그려진 마디(`dropped`)도, 이미 견주어 지나온 마디(`path`)도 후보가
 * 아니다. 그러니 남은 수는 눈에 보이는 것을 그대로 뺀 값이고, 캡션이 말하는 수와
 * 화면에 선 동그라미 수가 언제나 같다.
 */
export function candidatesLeft(scene: BstCompareAndGoScene): number {
  return Math.max(0, scene.nodes.length - scene.dropped.length - scene.path.length);
}

export const bstCompareAndGoScene: ScenePlan<BstCompareAndGoScene> = {
  /**
   * 첫 장면은 아직 아무도 내려가지 않은 나무 하나다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 나무와 찾는 값을 여기서 좁힌다.
   */
  initial(initialData: unknown): BstCompareAndGoScene {
    const d = (initialData ?? {}) as { nodes?: unknown; rootId?: unknown; needle?: unknown };
    const rootId = typeof d.rootId === 'string' ? d.rootId : '';
    const raw = typeof d.nodes === 'object' && d.nodes !== null ? (d.nodes as Record<string, unknown>) : {};
    return atStart({
      nodes: copyTree(raw, rootId),
      rootId,
      needle: num(d.needle, 0),
    });
  },

  reduce(scene: BstCompareAndGoScene, event: FacetRuntimeEvent): BstCompareAndGoScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 마디 하나와 값을 견준다. 커서가 그리로 내려가고 그 마디가 길에 남는다.
      case 'compare': {
        const nodeId = typeof p.nodeId === 'string' ? p.nodeId : null;
        if (nodeId === null || nodeOf(scene, nodeId) === null) return scene;
        const from = scene.path.length > 0 ? scene.path[scene.path.length - 1] : null;
        // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
        return {
          ...scene,
          path: [...scene.path, nodeId],
          // 찾음 여부도 장면이 셈한다. 걸음이 실어 온 result 를 믿지 않는다.
          matchedId: compareAt(scene, nodeId) === 'eq' ? nodeId : scene.matchedId,
          caption: { kind: 'compare', nodeId },
          step: { kind: 'compare', nodeId, from },
        };
      }

      // 반대쪽 가지가 통째로 후보에서 빠진다. 옅어진 채 자리에 남는다.
      case 'fold': {
        const listed = Array.isArray(p.nodes) ? p.nodes : [];
        const known = new Set(scene.nodes.map((n) => n.id));
        const already = new Set(scene.dropped);
        const ids = listed.filter(
          (v): v is string => typeof v === 'string' && known.has(v) && !already.has(v),
        );
        if (ids.length === 0) return scene;
        return {
          ...scene,
          dropped: [...scene.dropped, ...ids],
          caption: { kind: 'narrowed' },
          step: { kind: 'fold', nodes: ids },
        };
      }

      case 'rewind':
        // 바탕은 나무와 찾는 값뿐이다. 걸어온 길과 버린 가지는 여기서 거두어진다.
        return atStart({ nodes: scene.nodes, rootId: scene.rootId, needle: scene.needle });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
