/**
 * NodeHoldsMany 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`init` · `sweepKey` ·
 * `descend` · `markFound` · `rewind`)를 부르지 않고 그저 다음 장면을 돌려준다는
 * 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **한 자리가 키를 여럿 담고, 그 키들 사이의 틈마다 아래로 갈 길이 하나씩 열린다.**
 * 그러니 화면이 말하는 수는 둘이다 — 한 자리에 칸이 몇 개인가, 그리고 그 칸들
 * 사이에 길이 몇 개 나는가. 둘 다 **키 목록의 길이**에서 나와야 한다. `keys` 가
 * 정본이고 `children` 은 `keys.length + 1` 로 맞춰 둔다 (`normalizeChildren`).
 * 그러면 "자식은 담긴 키 수보다 하나 많다" 가 그릴 때 지켜지는 규칙이 아니라
 * **자료의 모양** 자체가 된다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각이 "지금까지 무엇을 했나" 를 적어 둔 자리는 **전부 DOM 이었다.**
 *
 * - **`activeNodeId`** (stage 의 `let`) — 지금 어느 자리에 들어섰나. `setActiveNode`
 *   가 이것을 보고 앞 자리를 `visited` 로 돌렸다. 되감으면 지나온 자리의 표식이
 *   어디에도 남지 않는다. 이제 `path` 가 말한다.
 * - **`activeCell`** (stage 의 `let`) — 지금 어느 칸을 짚고 있나. 다음 `sweepKey` 가
 *   이것을 보고 **앞 칸의 물을 뺐다.** 그래서 "이 자리에서 몇 칸을 짚어 보았나" 가
 *   매 걸음 지워졌다 — `open-addressing-probe` 와 같은 자리다. 이제 `swept` 가 쌓고
 *   정적 그리기가 그린다.
 * - **`cellDefs`** (stage 의 `Record<string, StageNode>`) — 나무의 생김새가 DOM 손잡이
 *   곁에 통째로 얹혀 있었다. `let` 도 `Set.has` 도 아니라 **타입 선언을 읽어야**
 *   나오는 자리다 (프로토콜 3-1 의 ⑤). 이제 `nodes` 가 나무를 말한다.
 * - **`NodeState` · 간선 상태 · 칸 상태** — `'default' | 'active' | 'visited'` 같은
 *   union 이 세 벌 선언되어 있었는데 **어디에도 저장되지 않았다.** 값은 `stroke` 와
 *   `fill` 속성 안에만 있었다. 밟고 내려온 틈(`taken`)이 특히 그렇다 — 그것이
 *   "여기를 지나 내려왔다" 는 자취인데 되감으면 사라졌다.
 * - **커서 자리** — `transform` 안에만 있었다. 이제 `cursor` 가 말한다.
 *
 * ── payload 에서 걷어낸 것
 *
 * 옮기기 전 걸음은 `key`(짚은 칸의 값) · `cmp`(견줌의 결과) · `childId`(내려갈 자리)
 * 를 실어 왔다. 셋 다 **나무와 찾는 값에서 셀 수 있는 것**이고, 앞의 둘은 화면에
 * `50 > 30` 이라는 등식으로 칸의 숫자와 **나란히 뜬다.** 항이 두 출처에서 오면
 * 언젠가 갈리고, 갈리는 날 화면이 스스로 거짓이 된다. 그래서 걸음은 **어느 자리의
 * 몇 번째 칸인가**만 가리키고, 수와 부등호는 여기 `keyAt` · `compareAt` 이 낸다.
 *
 * ── 캡션은 걸음이 아니라 커서가 정한다
 *
 * 무엇을 말할지는 `captionOf` 가 커서와 `found` 에서 낸다 — 걸음에 실어 두면 되짚어
 * 세운 화면에 캡션만 비게 된다. 문안은 담지 않는다. 무엇을 말할지와 그 인자만 담고
 * 문자는 `render` 가 `params.t` 로 만든다 (S-scene · C10).
 *
 * 좌표도 담지 않는다. 키 목록이 칸을, 칸이 자리를 정하므로 `render` 가 캔버스에서
 * 역산한다 (S-piece).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 자리 하나. 담은 키와, 틈마다 하나씩 열리는 길.
 *
 * `children` 의 길이는 늘 `keys.length + 1` 이다 — 비어 있는 길은 `null`. 이 조각이
 * 말하려는 관계라서 자료의 모양으로 박아 둔다.
 */
export type NodeHoldsManySceneNode = {
  id: string;
  keys: readonly number[];
  children: readonly (string | null)[];
};

/**
 * 커서가 선 자리.
 *
 * - `key` — 그 칸을 짚어 찾는 값과 견주는 중.
 * - `gap` — 그 틈으로 내려가는 중. 길이 비어 있으면 여기서 멎는다.
 * - `entry` — 그 자리 머리에 막 닿았다. 아직 아무 칸도 짚지 않았다.
 *
 * `entry` 를 `key` 의 0 번으로 뭉개지 않는다. 자리가 같아도 **뜻이 다르다** —
 * 뭉개면 아직 견주지도 않은 칸에 견줌의 캡션이 뜬다.
 */
export type NodeHoldsManyCursor =
  | { at: 'key'; nodeId: string; keyIndex: number }
  | { at: 'gap'; nodeId: string; gapIndex: number }
  | { at: 'entry'; nodeId: string };

/** 짚어 본 칸 하나. `swept` 에 쌓여 **남는 표식**이 된다. */
export type NodeHoldsManyCell = { nodeId: string; keyIndex: number };

/** 밟고 내려온 틈 하나. */
export type NodeHoldsManyGap = { nodeId: string; gapIndex: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 커서의 출발 자리는 여기 실린 것과 `swept` 에서 셈해 복원한다 — `prev` 에서 꺼내면
 * "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type NodeHoldsManyStep =
  | { kind: 'sweep'; nodeId: string; keyIndex: number }
  | { kind: 'descend'; nodeId: string; gapIndex: number }
  | { kind: 'mark'; nodeId: string; keyIndex: number };

export type NodeHoldsManyScene = {
  /** 나무 전체, 뿌리부터 너비 우선으로. **걸음이 고치지 않는 바탕**이고 `[0]` 이 뿌리다. */
  nodes: readonly NodeHoldsManySceneNode[];
  rootId: string;
  /** 찾는 값. 화면에 뜨는 모든 부등호의 한 항이다. */
  target: number;
  /** 커서가 선 자리. 아직 움직이지 않았으면 `null` — 그때는 커서를 그리지 않는다. */
  cursor: NodeHoldsManyCursor | null;
  /** 들어선 자리들, 차례대로. 마지막이 지금 자리이고 앞의 것들이 지나온 자리다. */
  path: readonly string[];
  /** 짚어 본 칸들, 차례대로. **쌓인다** — 그 누적이 "자리 안에서 골랐다" 는 자취다. */
  swept: readonly NodeHoldsManyCell[];
  /** 밟고 내려온 틈들. 마찬가지로 쌓인다. */
  taken: readonly NodeHoldsManyGap[];
  /** 찾은 칸. 찾기 전이면 `null`. */
  found: NodeHoldsManyCell | null;
  step: NodeHoldsManyStep | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `rewind` 가 이것만 넘겨받고 나머지는 선언에서 다시 셈한다. `swept` 나 `path` 를
 * 여기 넣으면 되감은 화면이 이미 다 밟은 채로 서고 그 위에 algorithm 이 뿌리부터
 * 다시 훑는 걸음이 겹친다 (프로토콜 4 절).
 */
type NodeHoldsManyBase = Pick<NodeHoldsManyScene, 'nodes' | 'rootId' | 'target'>;

/**
 * 아직 아무 칸도 짚지 않은 처음 장면 — 나무만 선 화면이다.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다. 변수를 넘기면 TypeScript 의 초과 속성 검사가
 * 돌지 않아 좁힌 타입이 아무것도 막지 못한다 (프로토콜 4 절).
 *
 * `nodes` 는 장면끼리 나눠 쓴다. 누구도 고치지 않으므로 과거가 바뀔 일이 없다
 * (S-scene 의 Exception).
 */
function atStart(base: NodeHoldsManyBase): NodeHoldsManyScene {
  return {
    nodes: base.nodes,
    rootId: base.rootId,
    target: base.target,
    cursor: null,
    path: [],
    swept: [],
    taken: [],
    found: null,
    step: null,
  };
}

/** 저작자가 적은 자리 하나. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
type RawNode = { keys: number[]; children: (string | null)[] };

function asRawNode(v: unknown): RawNode | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.keys)) return null;
  const keys: number[] = [];
  for (const k of o.keys) {
    if (typeof k !== 'number' || !Number.isFinite(k)) return null;
    keys.push(k);
  }
  const children: (string | null)[] = [];
  if (o.children !== undefined) {
    if (!Array.isArray(o.children)) return null;
    for (const c of o.children) children.push(typeof c === 'string' ? c : null);
  }
  return { keys, children };
}

/**
 * 길의 수를 키의 수에 맞춘다 — 늘 `keys.length + 1`.
 *
 * 저작자가 적다 만 자리는 `null` 로 채우고, 넘치게 적은 것은 잘라낸다. 그리는 쪽이
 * 매번 `keys.length + 1` 을 다시 세면 그것이 곧 **두 자리에서 세기**가 된다
 * (프로토콜 4 절). 여기서 한 번 맞추고 모두가 이 목록을 쓴다.
 */
function normalizeChildren(keys: readonly number[], raw: readonly (string | null)[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i <= keys.length; i++) out.push(raw[i] ?? null);
  return out;
}

/**
 * 저작자가 적은 명부를 뿌리부터 훑어 평평한 자리 목록으로 베낀다.
 *
 * **넘겨받은 자료를 참조로 담지 않는다** (S-scene MUST). 러너가 주는 것은 mechanism 과
 * view 가 함께 쓰는 한 객체다. 여기서 값만 베껴 새 객체를 세우므로 되짚을 때 바탕이
 * 흔들리지 않는다.
 *
 * 뿌리에서 닿지 않는 자리는 담지 않는다. 화면에 안 그려지는 자리를 "자리 수" 에
 * 세면 그림과 셈이 갈린다.
 */
function copyTree(rootId: string, rawNodes: unknown): NodeHoldsManySceneNode[] {
  if (typeof rawNodes !== 'object' || rawNodes === null) return [];
  const table = rawNodes as Record<string, unknown>;
  const out: NodeHoldsManySceneNode[] = [];
  const seen = new Set<string>();
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const raw = asRawNode(table[id]);
    if (raw === null) continue;
    const children = normalizeChildren(raw.keys, raw.children);
    out.push({ id, keys: raw.keys, children });
    for (const child of children) {
      if (child !== null) queue.push(child);
    }
  }
  return out;
}

/** 자리 하나를 이름으로 찾는다. 자리가 넷이라 훑어도 싸다. */
export function nodeOf(scene: NodeHoldsManyScene, id: string): NodeHoldsManySceneNode | null {
  return scene.nodes.find((n) => n.id === id) ?? null;
}

/**
 * 그 칸에 앉은 키. 없는 칸이면 `null`.
 *
 * **이 조각의 모든 수가 지나는 정본이다** — 칸에 적히는 숫자도, 캡션의 부등호 양옆도
 * 전부 여기서 나온다. 그러니 한 화면에 나란히 뜬 두 수가 갈릴 수가 없다.
 */
export function keyAt(scene: NodeHoldsManyScene, nodeId: string, keyIndex: number): number | null {
  const node = nodeOf(scene, nodeId);
  if (node === null) return null;
  if (keyIndex < 0 || keyIndex >= node.keys.length) return null;
  return node.keys[keyIndex];
}

/** 그 틈으로 열린 길. 비어 있으면 `null`. */
export function childAt(scene: NodeHoldsManyScene, nodeId: string, gapIndex: number): string | null {
  const node = nodeOf(scene, nodeId);
  if (node === null) return null;
  if (gapIndex < 0 || gapIndex >= node.children.length) return null;
  return node.children[gapIndex];
}

/**
 * 찾는 값을 그 칸의 키와 견준 결과.
 *
 * 걸음이 실어 오던 `cmp` 를 대신한다. 부등호와 그 양옆의 두 수가 같은 자료에서
 * 나오므로 화면 안에서 다툴 수가 없다.
 */
export function compareAt(
  scene: NodeHoldsManyScene,
  nodeId: string,
  keyIndex: number,
): 'lt' | 'eq' | 'gt' | null {
  const key = keyAt(scene, nodeId, keyIndex);
  if (key === null) return null;
  if (scene.target === key) return 'eq';
  return scene.target < key ? 'lt' : 'gt';
}

/** 그 자리에서 마지막으로 짚은 칸. 내려가는 걸음의 출발 자리가 여기다. */
export function lastSweptIn(scene: NodeHoldsManyScene, nodeId: string): number | null {
  for (let i = scene.swept.length - 1; i >= 0; i--) {
    const cell = scene.swept[i];
    if (cell.nodeId === nodeId) return cell.keyIndex;
  }
  return null;
}

/** 화면에 뜨는 집계. 둘 다 **자리 목록과 키 목록의 길이**에서 나온다. */
export function tallyOf(scene: NodeHoldsManyScene): { keys: number; nodes: number } {
  let keys = 0;
  for (const node of scene.nodes) keys += node.keys.length;
  return { keys, nodes: scene.nodes.length };
}

/**
 * 지금 화면이 할 말. **문안이 아니라 무엇을 말할지와 그 인자다** (S-scene).
 *
 * 걸음이 아니라 커서에서 낸다 — 걸음에 실어 두면 되짚어 세운 화면에 캡션만 빈다.
 */
export type NodeHoldsManyCaption =
  | { kind: 'sweep'; cmp: 'lt' | 'eq' | 'gt'; target: number; key: number }
  | { kind: 'descend' }
  | { kind: 'found'; target: number };

export function captionOf(scene: NodeHoldsManyScene): NodeHoldsManyCaption | null {
  if (scene.found !== null) return { kind: 'found', target: scene.target };
  const cursor = scene.cursor;
  if (cursor === null) return null;
  if (cursor.at !== 'key') return { kind: 'descend' };
  const key = keyAt(scene, cursor.nodeId, cursor.keyIndex);
  const cmp = compareAt(scene, cursor.nodeId, cursor.keyIndex);
  if (key === null || cmp === null) return null;
  return { kind: 'sweep', cmp, target: scene.target, key };
}

/** 같은 칸을 두 번 짚어도 차례를 그대로 둔다. 앞 장면을 제자리에서 고치지 않는다. */
function withCell(list: readonly NodeHoldsManyCell[], cell: NodeHoldsManyCell): readonly NodeHoldsManyCell[] {
  if (list.some((c) => c.nodeId === cell.nodeId && c.keyIndex === cell.keyIndex)) return list;
  return [...list, cell];
}

function withGap(list: readonly NodeHoldsManyGap[], gap: NodeHoldsManyGap): readonly NodeHoldsManyGap[] {
  if (list.some((g) => g.nodeId === gap.nodeId && g.gapIndex === gap.gapIndex)) return list;
  return [...list, gap];
}

/** 이미 들어선 자리면 차례를 그대로 둔다 — 마지막이 곧 "지금 자리" 이므로. */
function withEntered(path: readonly string[], nodeId: string): readonly string[] {
  if (path.length > 0 && path[path.length - 1] === nodeId) return path;
  if (path.includes(nodeId)) return path;
  return [...path, nodeId];
}

function readString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  return typeof v === 'string' ? v : null;
}

function readIndex(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

export const nodeHoldsManyScene: ScenePlan<NodeHoldsManyScene> = {
  /**
   * 첫 장면은 아직 아무 칸도 짚지 않은 나무 하나다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다.
   */
  initial(initialData: unknown): NodeHoldsManyScene {
    const d = (initialData ?? {}) as { rootId?: unknown; target?: unknown; nodes?: unknown };
    const rootId = typeof d.rootId === 'string' ? d.rootId : '';
    const target = typeof d.target === 'number' ? d.target : 0;
    return atStart({ nodes: copyTree(rootId, d.nodes), rootId, target });
  },

  reduce(scene: NodeHoldsManyScene, event: FacetRuntimeEvent): NodeHoldsManyScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 자리 안의 칸 하나를 짚어 찾는 값과 견준다.
      case 'key-sweep': {
        const nodeId = readString(p, 'nodeId');
        const keyIndex = readIndex(p, 'keyIndex');
        if (nodeId === null || keyIndex === null) return scene;
        // 나무에 없는 칸은 조용히 버린다 — 화면이 그릴 근거가 없다.
        if (keyAt(scene, nodeId, keyIndex) === null) return scene;
        return {
          ...scene,
          cursor: { at: 'key', nodeId, keyIndex },
          path: withEntered(scene.path, nodeId),
          swept: withCell(scene.swept, { nodeId, keyIndex }),
          step: { kind: 'sweep', nodeId, keyIndex },
        };
      }

      // 두 키 사이(또는 양 끝)의 틈을 골라 내려간다.
      case 'descend': {
        const nodeId = readString(p, 'nodeId');
        const gapIndex = readIndex(p, 'gapIndex');
        if (nodeId === null || gapIndex === null) return scene;
        const node = nodeOf(scene, nodeId);
        if (node === null || gapIndex >= node.children.length) return scene;
        // 내려갈 자리도 나무가 말한다 — 걸음이 실어 오던 `childId` 를 걷어냈다.
        const childId = childAt(scene, nodeId, gapIndex);
        return {
          ...scene,
          cursor: childId === null ? { at: 'gap', nodeId, gapIndex } : { at: 'entry', nodeId: childId },
          path: childId === null ? scene.path : withEntered(scene.path, childId),
          taken: withGap(scene.taken, { nodeId, gapIndex }),
          step: { kind: 'descend', nodeId, gapIndex },
        };
      }

      // 찾았다. 그 칸이 종결 상태로 남는다.
      case 'mark': {
        const nodeId = readString(p, 'nodeId');
        const keyIndex = readIndex(p, 'keyIndex');
        if (nodeId === null || keyIndex === null) return scene;
        if (keyAt(scene, nodeId, keyIndex) === null) return scene;
        return {
          ...scene,
          cursor: { at: 'key', nodeId, keyIndex },
          found: { nodeId, keyIndex },
          step: { kind: 'mark', nodeId, keyIndex },
        };
      }

      // 탐색이 멎었다. 화면은 이미 할 말을 마쳤으므로 흐르게 할 것만 거둔다.
      // 조용한 발신이라 걸음을 늘리지 않고 앞 걸음의 장면에 접힌다.
      case 'done':
        return { ...scene, step: null };

      // 처음으로 되감는다. 바탕(나무·찾는 값)만 넘기고 자취는 여기서 거두어진다.
      case 'rewind':
        return atStart({ nodes: scene.nodes, rootId: scene.rootId, target: scene.target });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
