/**
 * rotateToBalance 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 본체는 나무의 모양이다
 *
 * 회전 전 나무와 회전 후 나무, 그 둘이 전부다. 자리·가지·높이·균형 인수·중위 순회가
 * 전부 그 두 구조에서 파생된다. 그래서 마디를 하나씩 옮겨 붙이던 명령형 코드가
 * 통째로 없어졌고, **화면에 나란히 뜨는 수들이 갈릴 수가 없다.**
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기고 나서 감사가 짚은 자리다. 한때 `balance-computed` 가 높이·균형 인수·범위밖
 * 판정을, `done` 이 키 둘과 중위 순회 배열을 실어 왔다. 여섯 다 **나무 모양에서
 * 셀 수 있는 수**이고, 그중 여럿이 화면에 나란히 뜬다 — 뿌리 배지의 `h 3` 과 캡션의
 * `{after}` 가 서로 다른 발신을 타고 한 화면에 섰다.
 *
 * 특히 **중위 순회**가 그랬다. 띠의 눈금은 payload 가 실어 온 배열 차례로 서고
 * 마디의 가로는 값 정렬 차례로 서는데, "가로가 안 움직인다 = 중위 순회가 그대로다"
 * 가 이 조각의 증명이다. 두 항이 다른 출처에서 오면 그 증명이 **우연으로** 선다.
 * 이제 띠는 `scene.nodes` 를 실제로 중위 순회해 얻고 눈금은 그 마디 제 자리에
 * 찍으므로, 순회 차례가 값 차례와 어긋나면 눈금이 왼쪽에서 오른쪽으로 가지 않는다 —
 * 주장이 그림 안에서 닫힌다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * - **`stage.currentPos` · `currentNodes`** — 지금 어떤 나무가 서 있고 각 마디가
 *   어디에 있나. 회전 애니메이션의 **출발 그림**이 이 `let` 에서 나왔다
 *   (`const fromPos = currentPos`). 되짚어 세운 직후에는 그 값이 아직 옛 화면의
 *   것이라 회전이 엉뚱한 자리에서 출발했다. 이제 `base` 에서 셈한다.
 * - **`stage.edgeEls`** — 지금 어떤 가지가 걸려 있나. `rotate()` 가 이 Map 의 열쇠를
 *   회전 후 가지와 견주어 사라질 가지 · 새로 생길 가지를 갈랐다. `let` 도
 *   `Set.has` 도 아닌 **조회로 갈리는 암묵 분기**였고, 제자리에서 `delete`/`set`
 *   되어 되짚으면 복원되지 않았다. 이제 `base` 와 `nodes` 를 견주어 파생시킨다.
 * - **`EdgeEntry = { line, a, b }`** — DOM 손잡이와 "이 가지가 잇는 두 마디" 가 한
 *   객체에 묶여 있었다. 생성 때 한 번 묶고 읽기만 해 대입이 없다. 가지 목록이
 *   나무에서 파생되면 이 묶음 자체가 사라진다.
 * - **높이·균형 인수가 배지의 `textContent` 와 `fill` 에만 있었다.** `showBalance`
 *   는 덮어쓰기만 하고 지우지 않았고, 범위를 벗어났다는 판정은 링의 `stroke` 에만
 *   있었다 — 되감으면 그 판정이 화면에서 사라진다. 이제 `metricsAt` 이 센다.
 * - **`markInorderUnchanged` 가 그린 띠** — "중위 순회 결과가 그대로다" 는 이 조각의
 *   **결론**인데 명령으로만 세워져 되짚기에서 복원되지 않았다. 이제 `concluded` 다.
 * - **`projector.initialNodes` · `initialRootId`** — 되감기의 바탕을 projector 가
 *   `initialData` 에서 **참조로** 쥐고 있었다. 이제 `base` 가 값을 복사해 담는다.
 * - **회전이 새로 이은 가지의 강조색** — 애니메이션이 끝나도 남던 칠이다. 명령형
 *   코드에서는 "되돌리는 명령이 없어 쌓인" 것처럼 보이지만 사실 그것이 정보였다
 *   ("손을 바꾼 가지가 이것이다"). 장면으로 옮기면 저절로 사라지므로 일부러
 *   살린다 — 다만 필드로 적지 않고 `base` 와 `nodes` 의 차에서 파생시킨다.
 *
 * 좌표는 담지 않는다. 값의 정렬 순서가 가로를, 나무의 깊이가 세로를 정하므로 자리는
 * 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 **마디의 이름**만 담고 문자는 그리는 쪽이
 * 만든다 — 캡션이 값 대신 id 를 싣는 것도 같은 까닭이다. 캡션의 "50" 과 원 안의
 * "50" 이 두 출처면 언젠가 갈린다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** AVL 이 허용하는 균형 인수의 범위. 이 밖이면 기운 것이다. */
const BALANCE_RANGE = 1;

/** 마디 하나. 자리는 없다 — 값과 이음이 자리를 정한다. */
export type RotateSceneNode = {
  readonly id: string;
  readonly value: number;
  readonly left: string | null;
  readonly right: string | null;
};

/**
 * 어느 나무를 재어 계기를 달았나.
 *
 * `null` 이면 아직 아무 자리에도 계기가 없다. 회전 걸음에서 `'before'` 가 그대로
 * 남아, 도는 동안 배지는 **재었을 때의 수**를 달고 마디와 함께 옮겨 간다 — 기운
 * 자리가 축과 같이 내려가는 그림이다. 다시 재는 걸음에서 `'after'` 로 넘어간다.
 *
 * 수 자체는 여기 없다. 이 값이 가리키는 나무에서 `metricsAt` 이 센다.
 */
export type RotateMeasured = 'before' | 'after';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 회전 운동의 **출발 그림**은 `prev` 에서 꺼내지 않는다 (S-scene: `prev` 는 고르는
 * 데만). 회전은 언제나 `base` 에서 `nodes` 로 가는 한 걸음이고 `base` 는 어느 걸음도
 * 고치지 않는 값이라, 그리는 쪽이 두 구조에서 출발 자리와 도착 자리를 각각 셈한다.
 * `rotate` 에 실린 셋은 **무엇이 돌았는지**를 가리켜 강조할 마디를 고르는 데 쓴다.
 */
export type RotateSceneMark =
  | {
      readonly kind: 'rotate';
      /** 내려가는 축. */
      readonly pivotId: string;
      /** 축의 자리로 올라오는 마디. */
      readonly newRootId: string;
      /** 손을 바꿔 내려간 축에 가 붙는 가지. 없을 수도 있다. */
      readonly movedId: string | null;
    }
  /** 계기가 자리에 앉는다. */
  | { readonly kind: 'measured' }
  /** 중위 순회 띠가 그어진다. */
  | { readonly kind: 'concluded' };

/**
 * 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지와 마디의 이름**이다 (C10).
 *
 * 값은 싣지 않는다 — 원 안의 글자와 같은 곳(`nodes`)에서 풀어야 두 수가 갈리지
 * 않는다. 균형 인수와 키도 같은 까닭으로 싣지 않는다.
 */
export type RotateSceneCaption =
  | { readonly kind: 'imbalance'; readonly id: string }
  | { readonly kind: 'balanceChecked' }
  | { readonly kind: 'rebalanced' }
  | {
      readonly kind: 'rotating';
      readonly newRootId: string;
      readonly pivotId: string;
      readonly movedId: string;
    }
  | {
      readonly kind: 'rotatingSimple';
      readonly newRootId: string;
      readonly pivotId: string;
    }
  | { readonly kind: 'rewound' }
  | { readonly kind: 'done' };

export type RotateToBalanceScene = {
  /**
   * 회전 전 나무. 되감기가 여기로 돌아가고 어느 걸음도 고치지 않는다.
   *
   * 네 몫을 한다 — 되감기의 바탕, 회전 운동의 출발 그림, 가로 자리를 정하는 값
   * 명부(회전은 마디를 없애거나 만들지 않으므로 명부가 곧 전체 마디다), 그리고
   * 회전 전 키와 균형 인수를 세는 자리.
   */
  readonly base: readonly RotateSceneNode[];
  readonly baseRootId: string;
  /**
   * 지금 서 있는 나무. **걸음이 고치는 것이 이것이다.**
   *
   * 그래서 되감기의 바탕에 넣지 않는다 (아래 `Base`).
   */
  readonly nodes: readonly RotateSceneNode[];
  readonly rootId: string;
  /** 어느 나무를 재어 계기를 달았나. 수는 여기 없고 그 나무에서 센다. */
  readonly measured: RotateMeasured | null;
  /**
   * 중위 순회 띠가 섰나.
   *
   * 띠에 설 값들은 담지 않는다 — `scene.nodes` 를 실제로 중위 순회해 얻는다. 그것이
   * 이 조각의 증명이 그림 안에서 닫히는 자리다 (위 머리말).
   */
  readonly concluded: boolean;
  readonly mark: RotateSceneMark | null;
  readonly caption: RotateSceneCaption | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `nodes` 와 `rootId` 를 일부러 빼 둔다. 회전이 고치는 나무를 바탕과 같은 급으로
 * 묶어 넘기면 되감은 화면이 **이미 돌아간 나무**로 서고, 그 위에 algorithm 이 새로
 * 셈한 첫 걸음의 계기가 겹쳐 화면 안에서 두 모양이 어긋난다. 타입으로 좁혀 둔다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<RotateToBalanceScene, 'base' | 'baseRootId'>;

// ── 나무에서 세는 것들 ─────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 배지의 `h` 와 `Δ`, 범위밖 판정, 캡션의
// 키 둘, 띠의 값과 차례까지 — payload 에서 오는 수가 하나도 없다.

/** 마디 하나를 이름으로 찾는다. 나무가 여섯이라 훑어도 싸다. */
export function nodeOf(
  nodes: readonly RotateSceneNode[],
  id: string | null,
): RotateSceneNode | null {
  if (id === null) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/**
 * 그 자리에 앉은 서브트리의 키. 자리가 비었으면 0 이다.
 *
 * 고리가 생긴 나무에서도 멎도록 밟은 자리를 기억한다 — 되짚기는 어떤 장면이든
 * 그릴 수 있어야 하고, 셈이 안 끝나면 화면이 통째로 선다.
 */
export function heightAt(
  nodes: readonly RotateSceneNode[],
  id: string | null,
  seen: ReadonlySet<string> = new Set(),
): number {
  const node = nodeOf(nodes, id);
  if (node === null || seen.has(node.id)) return 0;
  const walked = new Set(seen).add(node.id);
  return 1 + Math.max(heightAt(nodes, node.left, walked), heightAt(nodes, node.right, walked));
}

/** 한 자리에 적히는 계기 전부. 항이 하나도 payload 에서 오지 않는다. */
export type RotateMetrics = {
  readonly height: number;
  readonly balance: number;
  /** AVL 이 허용하는 범위를 벗어났나. */
  readonly outOfRange: boolean;
};

export function metricsAt(
  nodes: readonly RotateSceneNode[],
  id: string,
): RotateMetrics | null {
  const node = nodeOf(nodes, id);
  if (node === null) return null;
  const leftHeight = heightAt(nodes, node.left);
  const rightHeight = heightAt(nodes, node.right);
  const balance = leftHeight - rightHeight;
  return {
    height: 1 + Math.max(leftHeight, rightHeight),
    balance,
    outOfRange: balance < -BALANCE_RANGE || balance > BALANCE_RANGE,
  };
}

/**
 * 중위 순회 차례의 마디 이름들.
 *
 * 띠의 눈금이 이 차례로 서고 자리는 각 마디가 실제로 선 가로다. 회전이 중위 순회를
 * 바꾸었다면 눈금이 왼쪽에서 오른쪽으로 가지 않으므로 **그림이 스스로 들킨다.**
 */
export function inorderIds(
  nodes: readonly RotateSceneNode[],
  rootId: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null): void => {
    const node = nodeOf(nodes, id);
    if (node === null || seen.has(node.id)) return;
    seen.add(node.id);
    walk(node.left);
    out.push(node.id);
    walk(node.right);
  };
  walk(rootId);
  return out;
}

/** 계기가 달린 나무. 재었을 때의 수를 다시 세는 자리다. */
export function measuredTree(
  scene: RotateToBalanceScene,
): { nodes: readonly RotateSceneNode[]; rootId: string } | null {
  if (scene.measured === null) return null;
  return scene.measured === 'after'
    ? { nodes: scene.nodes, rootId: scene.rootId }
    : { nodes: scene.base, rootId: scene.baseRootId };
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

function optId(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** 마디 하나를 읽는다. 값을 **복사해** 담는다 — 참조를 쥐면 과거가 함께 바뀐다. */
function readNode(raw: unknown): RotateSceneNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as { id?: unknown; value?: unknown; left?: unknown; right?: unknown };
  if (typeof n.id !== 'string' || typeof n.value !== 'number') return null;
  return { id: n.id, value: n.value, left: optId(n.left), right: optId(n.right) };
}

function readNodes(raw: unknown): RotateSceneNode[] {
  if (!Array.isArray(raw)) return [];
  const out: RotateSceneNode[] = [];
  for (const item of raw) {
    const node = readNode(item);
    if (node) out.push(node);
  }
  return out;
}

/** 아직 아무 걸음도 밟지 않은 화면 — 기울어진 나무만 서 있다. */
function atStart(b: Base): RotateToBalanceScene {
  return {
    base: b.base,
    baseRootId: b.baseRootId,
    nodes: b.base,
    rootId: b.baseRootId,
    measured: null,
    concluded: false,
    mark: null,
    caption: null,
  };
}

export const rotateToBalanceScene: ScenePlan<RotateToBalanceScene> = {
  /**
   * 첫 장면은 회전 전 나무 그대로다.
   *
   * 이 조각은 `init` 이벤트를 내지 않는다 — 첫 걸음이 시작되기 전에도 기울어진
   * 나무가 서 있어야 "이 자리가 기울었다" 를 잴 대상이 있기 때문이다. 그래서
   * 여기서 `initialData` 를 한 번 좁혀 담는다.
   */
  initial(initialData: unknown): RotateToBalanceScene {
    const d = (initialData ?? {}) as { nodes?: unknown; rootId?: unknown };
    const base = readNodes(d.nodes);
    const rootId = typeof d.rootId === 'string' ? d.rootId : (base[0]?.id ?? '');
    return atStart({ base, baseRootId: rootId });
  },

  reduce(scene: RotateToBalanceScene, event: FacetRuntimeEvent): RotateToBalanceScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 자리마다 높이를 재고 균형 인수를 적는다. 회전 전 1회, 회전 후 1회.
      //
      // 발신은 "어느 나무를 쟀다" 만 말한다. 수는 그 나무에서 센다 — 기운 자리를
      // 고르는 것까지 여기서 셈하므로 판정이 두 곳에 생기지 않는다.
      case 'balance-computed': {
        const measured: RotateMeasured = p.phase === 'after' ? 'after' : 'before';
        const tree = measured === 'after' ? scene.nodes : scene.base;
        const rootId = measured === 'after' ? scene.rootId : scene.baseRootId;
        const tilted = inorderIds(tree, rootId).find(
          (id) => metricsAt(tree, id)?.outOfRange === true,
        );
        return {
          ...scene,
          measured,
          mark: { kind: 'measured' },
          caption:
            measured === 'after'
              ? { kind: 'rebalanced' }
              : tilted !== undefined
                ? { kind: 'imbalance', id: tilted }
                : { kind: 'balanceChecked' },
        };
      }

      // 돈다 — 축이 내려가고 자식이 올라오며 가지 하나가 손을 바꾼다. 나무가 통째로
      // 갈린다. 낱개로 이어 붙이지 않는 것이 이 이벤트가 하나인 이유다 (C2).
      case 'rotate': {
        const afterNodes = readNodes(p.afterNodes);
        if (afterNodes.length === 0) return scene;
        const pivotId = optId(p.pivotId) ?? '';
        const newRootId = optId(p.newRootId) ?? '';
        const movedId = optId(p.movedId);
        return {
          ...scene,
          nodes: afterNodes,
          rootId: optId(p.afterRootId) ?? scene.rootId,
          mark: { kind: 'rotate', pivotId, newRootId, movedId },
          caption:
            movedId !== null
              ? { kind: 'rotating', newRootId, pivotId, movedId }
              : { kind: 'rotatingSimple', newRootId, pivotId },
        };
      }

      // 결론 — 키가 줄었고 중위 순회 순서는 그대로다. 두 키도 순회도 나무에서
      // 나오므로 이 발신은 "여기서 결론이 선다" 만 말한다.
      case 'done':
        return {
          ...scene,
          concluded: true,
          mark: { kind: 'concluded' },
          caption: { kind: 'done' },
        };

      // 손으로 짚기 시작 — 회전 전 나무로 돌아간다.
      //
      // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return {
          ...atStart({ base: scene.base, baseRootId: scene.baseRootId }),
          caption: { kind: 'rewound' },
        };

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
