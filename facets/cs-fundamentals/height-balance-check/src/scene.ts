/**
 * HeightBalanceCheck 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`init` · `settleNode` ·
 * `rewind`)를 부르지 않고 그저 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의
 * 화면이든 셈으로 얻는다 (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **어느 마디에서 왼쪽·오른쪽 키를 재어 얼마나 차이가 났나.** 그 잰 결과는 잎에서
 * 뿌리로 올라가며 **자리에 적혀 쌓인다** — 마지막 화면에 여섯 자리가 전부 적혀 있는
 * 것이 이 조각의 결론이다 ("뿌리만 보고는 알 수 없다"). 그러니 걸어온 자취는 지나가는
 * 것이 아니라 **머무는 것**이고, 정적 그리기에도 들어가야 한다 (S-scene PREFER).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각이 "지금까지 무엇을 쟀나" 를 적어 둔 자리는 **`tileLayer` 의
 * 자식들뿐**이었다. `writeTiles` 가 `<text>`·`<rect>` 를 얹기만 하고 되돌리는 명령이
 * `rewind()` (레이어 통째로 비우기) 하나였으므로, **처음으로 되감는 것 말고는 어느
 * 걸음으로도 갈 수 없었다.** `outOfRange` 판정도 그 `<rect>` 의 `fill` 안에만 있었다.
 *
 * 그것 말고도 셋이 더 있었다.
 *
 * - **`NodeLayout.leftValue` / `rightValue`** — 자리(x·y·depth)와 **나무의 생김새**가
 *   한 객체에 묶여 `init()` 에서 한 번 세워졌다. `settleNode` 가
 *   `self.leftValue !== undefined` 를 되읽어 올라오는 토큰이 실제 자식에서 출발할지
 *   유령 자리에서 출발할지 갈랐다. `let` 도 `Set.has` 도 아니라 타입 선언을 읽어야
 *   나오는 자리다 (프로토콜 3-1 의 ⑤). 이제 `nodes` 가 나무를 말한다.
 * - **`let maxDepth`** — 캔버스 세로를 정했고 `init()` 안에서만 세워졌다. `init()` 이
 *   사라지므로 정적 그리기가 매번 다시 잰다.
 * - **유령 자리의 `'0'`** — 없는 자식의 키가 문자열 상수로 박혀 있었고, 같은 수를
 *   실어 오는 payload 의 `leftHeight` 와는 아무 연결이 없었다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전 `node-settle` 은 `leftHeight` · `rightHeight` · `height` · `balance` ·
 * `outOfRange` 다섯을 실어 왔다. 다섯 다 **나무 모양에서 셀 수 있는 수**이고, 그중 앞의
 * 셋은 화면에 나란히 뜬다 — 왼쪽 토큰의 `2`, 오른쪽 토큰의 `0`, 그리고 그 아래
 * 배지의 `Δ +2`. 항이 두 출처에서 오면 언젠가 갈리고, 갈리는 날 화면이 스스로
 * 거짓이 된다. 그래서 algorithm 에서 그 다섯을 빼고 여기 `childHeight` 하나를
 * 정본으로 둔다 — **유령 자리의 `0` 도, 올라오는 토큰의 수도, 배지의 `Δ` 도 전부 이
 * 함수를 지난다.**
 *
 * 좌표는 담지 않는다. 나무 모양이 자리를 정하므로 `render` 가 캔버스에서 셈한다
 * (S-piece).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 나무의 마디 하나. 자리는 담지 않고 생김새만 담는다 (S-piece).
 *
 * `value` 가 곧 이름이다 — 이 조각의 나무는 값이 겹치지 않는다.
 */
export type HeightBalanceSceneNode = {
  value: number;
  left: number | null;
  right: number | null;
};

/**
 * 방금 셈이 끝난 마디. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 올라오는 토큰의 출발 자리는 여기 실린 마디 이름에서 나무를 타고 복원한다 — `prev`
 * 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type HeightBalanceStep = { value: number };

export type HeightBalanceCheckScene = {
  /** 나무 전체, 전위 순회 차례로. **걸음이 고치지 않는 바탕**이고 `[0]` 이 뿌리다. */
  nodes: readonly HeightBalanceSceneNode[];
  /**
   * 셈이 끝나 값이 적힌 마디들, 적힌 차례대로.
   *
   * 걸음마다 쌓인다 — **그 누적이 이 조각의 주장이다.** 옮기기 전에는 이것을 말하는
   * 자리가 `tileLayer` 의 자식 목록뿐이었다.
   */
  settled: readonly number[];
  step: HeightBalanceStep | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `rewind` 가 이것만 넘겨받고 나머지는 선언에서 다시 셈한다. `settled` 를 여기 넣으면
 * 되감은 화면이 이미 다 적힌 채로 서고 그 위에 algorithm 이 잎부터 다시 올라오는
 * 걸음이 겹친다 (프로토콜 4 절).
 */
type HeightBalanceBase = Pick<HeightBalanceCheckScene, 'nodes'>;

/**
 * 아직 아무 자리도 적히지 않은 처음 장면 — 골격만 선 나무다.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다. 변수를 넘기면 TypeScript 의 초과 속성 검사가
 * 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 *
 * `nodes` 는 장면끼리 나눠 쓴다. 누구도 고치지 않으므로 과거가 바뀔 일이 없다
 * (S-scene 의 Exception).
 */
function atStart(base: HeightBalanceBase): HeightBalanceCheckScene {
  return { nodes: base.nodes, settled: [], step: null };
}

/** 저작자가 적은 나무 한 마디. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
type RawNode = { value: number; left: unknown; right: unknown };

function asRawNode(v: unknown): RawNode | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return null;
  return { value: o.value, left: o.left ?? null, right: o.right ?? null };
}

/**
 * 저작자가 적은 둥지 모양을 훑어 평평한 마디 목록으로 베낀다.
 *
 * **넘겨받은 자료를 참조로 담지 않는다** (S-scene MUST). 러너가 주는 것은 mechanism 과
 * view 가 함께 쓰는 한 객체다. 여기서 값만 베껴 새 객체를 세우므로 되짚을 때 바탕이
 * 흔들리지 않는다. 전위 순회라 `out[0]` 이 곧 뿌리다.
 */
function copyTree(raw: unknown): HeightBalanceSceneNode[] {
  const out: HeightBalanceSceneNode[] = [];
  const seen = new Set<number>();
  const walk = (v: unknown): number | null => {
    const node = asRawNode(v);
    if (node === null || seen.has(node.value)) return null;
    seen.add(node.value);
    // 자리를 먼저 잡고 자식을 훑는다 — 전위 차례를 지키기 위해서다.
    const placed: HeightBalanceSceneNode = { value: node.value, left: null, right: null };
    out.push(placed);
    placed.left = walk(node.left);
    placed.right = walk(node.right);
    return placed.value;
  };
  walk(raw);
  return out;
}

/** 마디 하나를 값으로 찾는다. 나무가 여섯이라 훑어도 싸다. */
export function nodeOf(
  scene: HeightBalanceCheckScene,
  value: number,
): HeightBalanceSceneNode | null {
  return scene.nodes.find((n) => n.value === value) ?? null;
}

/**
 * 그 자리에 앉은 서브트리의 키. 자리가 비었으면 0 이다.
 *
 * **이 조각의 모든 수가 지나는 정본이다** — 유령 자리에 적힌 `0`, 올라오는 토큰의
 * 수, 배지의 `h` 와 `Δ` 가 전부 여기서 나온다. 그러니 화면에 나란히 뜬 세 수가
 * 갈릴 수가 없다.
 */
export function heightAt(scene: HeightBalanceCheckScene, value: number | null): number {
  if (value === null) return 0;
  const node = nodeOf(scene, value);
  if (node === null) return 0;
  return 1 + Math.max(heightAt(scene, node.left), heightAt(scene, node.right));
}

/** 한 마디의 자식 자리 키. 자식이 없으면 그 자리는 0 이다 — 유령 자리가 그 0 이다. */
export function childHeight(
  scene: HeightBalanceCheckScene,
  value: number,
  side: 'left' | 'right',
): number {
  const node = nodeOf(scene, value);
  if (node === null) return 0;
  return heightAt(scene, side === 'left' ? node.left : node.right);
}

/** 한 자리에 적히는 값 전부. 항이 하나도 payload 에서 오지 않는다. */
export type HeightBalanceMetrics = {
  leftHeight: number;
  rightHeight: number;
  height: number;
  balance: number;
  /** AVL 이 허용하는 −1 ~ +1 을 벗어났나. */
  outOfRange: boolean;
};

export function metricsAt(
  scene: HeightBalanceCheckScene,
  value: number,
): HeightBalanceMetrics | null {
  if (nodeOf(scene, value) === null) return null;
  const leftHeight = childHeight(scene, value, 'left');
  const rightHeight = childHeight(scene, value, 'right');
  const balance = leftHeight - rightHeight;
  return {
    leftHeight,
    rightHeight,
    height: 1 + Math.max(leftHeight, rightHeight),
    balance,
    outOfRange: balance < -1 || balance > 1,
  };
}

/**
 * 같은 자리가 두 번 적히면 차례를 그대로 둔다. 앞 장면을 제자리에서 고치지 않는다.
 *
 * 되감고 다시 걸으면 `settled` 가 비어 있으므로 실제로는 겹치지 않지만, 겹쳤을 때
 * 같은 자리에 배지가 둘 얹히는 것보다 하나만 서는 편이 옳다.
 */
function withSettled(list: readonly number[], value: number): readonly number[] {
  if (list.includes(value)) return list;
  return [...list, value];
}

export const heightBalanceCheckScene: ScenePlan<HeightBalanceCheckScene> = {
  /**
   * 첫 장면은 아직 아무 자리도 적히지 않은 나무 하나다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다.
   */
  initial(initialData: unknown): HeightBalanceCheckScene {
    const d = (initialData ?? {}) as { root?: unknown };
    return atStart({ nodes: copyTree(d.root) });
  },

  reduce(scene: HeightBalanceCheckScene, event: FacetRuntimeEvent): HeightBalanceCheckScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 한 자리의 셈이 끝난다. 아래에서 키가 올라와 맞대어 빠지고, 그 차가 자리에 남는다.
      case 'node-settle': {
        if (typeof p.value !== 'number') return scene;
        // 나무에 없는 마디는 조용히 버린다 — 화면이 셈할 근거가 없다.
        if (nodeOf(scene, p.value) === null) return scene;
        return {
          ...scene,
          settled: withSettled(scene.settled, p.value),
          step: { value: p.value },
        };
      }

      // 처음으로 되감는다. 바탕(나무)만 넘기고 적힌 자리는 여기서 거두어진다.
      case 'rewind':
        return atStart({ nodes: scene.nodes });

      default:
        // 이 facet 의 algorithm 은 위 둘만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
