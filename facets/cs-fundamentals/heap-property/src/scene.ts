/**
 * HeapProperty 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`showPairCheck` ·
 * `showSiblingSkip` · `showConfirmed`)를 부르지 않고 그저 다음 장면을 돌려준다는
 * 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (`runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어디에 상태를 숨겨 두었나
 *
 * projector 는 `let` 하나 없이 번역만 했고 stage 의 `let` 은 전부 배치와 DOM
 * 손잡이였다. 그런데도 숨은 상태는 있었다 — **화면이 통째로 상태였다.**
 *
 *   · 몇 쌍까지 견줬나 · 그 판정이 무엇이었나 → `markLayer` 에 쌓인 ✓/✗ 배지와
 *     간선의 칠(`stroke` 를 accent/danger 로 덮어쓴 것)에만 남았다.
 *   · 어느 형제 짝을 짚고 지나쳤나 → 같은 `markLayer` 의 점선 배지에만 남았다.
 *   · 힙임이 확인됐나 → 루트 원의 `fill` 과 markLayer 의 링에만 남았다.
 *   · 지금 무슨 말을 하고 있나 → `captionText.textContent` 에만 남았다.
 *
 * 그것을 되돌리는 유일한 길이 `reset()` 이었으므로 **처음으로 되감는 것 말고는
 * 어느 걸음으로도 갈 수 없었다.** 그런데 그 쌓인 판정이 곧 이 조각의 주장이다 —
 * "부모-자식 짝은 여섯 다 확인됐고, 형제 짝 셋은 한 번도 견주지 않았다" 는 말은
 * 배지가 남아 있어야 성립한다. 되짚어 살아나지 않으면 주장이 화면에서 사라진다.
 *
 * ── 확인됨과 약속 없음을 한 필드로 뭉치지 않는다
 *
 * 둘 다 "짝 하나를 짚었다" 로 보이지만 **뜻이 반대다.** `checked` 는 견주어
 * 성립함을 본 것이고 `skipped` 는 애초에 견줄 약속이 없음을 본 것이다. 한 배열에
 * 담으면 그리는 쪽이 종류를 다시 갈라야 하고, 간선 칠처럼 한쪽에만 딸린 것을
 * 얹을 자리가 없어진다.
 *
 * 좌표는 담지 않는다 — 완전 이진트리라 배열 차례가 곧 자리이므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않고 무엇을 말할지와 그 인자만
 * 담는다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 나무의 마디 하나. 배열 차례가 곧 힙 인덱스이므로 순서가 구조를 정한다. */
export type HeapSceneNode = { id: string; value: number };

/**
 * 견주어 본 부모-자식 짝. **머무는 상태다** — 지나간 걸음의 것도 화면에 남는다.
 *
 * `holds` 는 algorithm 이 그 자리에서 `parentValue < childValue` 를 셈한 값이다.
 * 장면이 그것을 쥐고 있어야 되짚은 화면도 같은 판정을 말한다.
 */
export type CheckedPair = { parentId: string; childId: string; holds: boolean };

/**
 * 짚었지만 견주지 않은 형제 짝. 이것도 머무는 상태다.
 *
 * `holds` 가 없는 것이 요점이다 — 판정이 없다는 것 자체가 이 조각의 절반이다.
 */
export type SkippedPair = { aId: string; bId: string };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type HeapCaption =
  | { kind: 'pairCheck'; parentValue: number; childValue: number }
  | { kind: 'siblingSkip'; aValue: number; bValue: number }
  | { kind: 'confirmed'; rootValue: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 표식이 도는 출발·도착 자리는 여기 실린 마디 이름으로 복원한다 — `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type HeapStep =
  | { kind: 'pair'; parentId: string; childId: string; holds: boolean }
  | { kind: 'sibling'; aId: string; bId: string }
  | { kind: 'confirm'; rootId: string };

export type HeapPropertyScene = {
  /** 나무의 마디들. **걸음이 고치지 않는 바탕**이다. */
  nodes: readonly HeapSceneNode[];
  /** 지금까지 견주어 본 부모-자식 짝들. 배지와 간선 칠이 여기서 나온다. */
  checked: readonly CheckedPair[];
  /** 지금까지 짚고 지나친 형제 짝들. 점선 배지가 여기서 나온다. */
  skipped: readonly SkippedPair[];
  /** 힙임이 확인된 꼭대기 마디. 확인 전에는 `null`. */
  confirmedRootId: string | null;
  caption: HeapCaption | null;
  step: HeapStep | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `rewind` 가 이것만 넘겨받고 나머지는 선언에서 다시 셈한다. `checked` 나
 * `confirmedRootId` 를 여기 넣으면 되감은 화면이 이미 걸어온 판정을 단 채로 서고
 * 그 위에 algorithm 이 다시 밟는 걸음이 겹친다 (프로토콜 4 절).
 */
type HeapBase = Pick<HeapPropertyScene, 'nodes'>;

/** 아무 짝도 짚지 않은 처음 장면. */
function fresh(base: HeapBase): HeapPropertyScene {
  return {
    nodes: base.nodes,
    checked: [],
    skipped: [],
    confirmedRootId: null,
    caption: null,
    step: null,
  };
}

/** payload 는 믿지 않고 좁힌다 (C9). */
function readNode(v: unknown): HeapSceneNode | null {
  const n = v as { id?: unknown; value?: unknown } | null | undefined;
  if (typeof n?.id !== 'string') return null;
  if (typeof n.value !== 'number' || !Number.isFinite(n.value)) return null;
  return { id: n.id, value: n.value };
}

/**
 * 같은 짝이 두 번 들어오면 덮어쓴다. 앞 장면을 제자리에서 고치지 않는다 (S-scene).
 *
 * 되감고 다시 걸으면 `checked` 가 비어 있으므로 실제로는 겹치지 않지만, 겹쳤을 때
 * 같은 자리에 배지가 둘 얹히는 것보다 마지막 판정 하나만 서는 편이 옳다.
 */
function withChecked(list: readonly CheckedPair[], pair: CheckedPair): readonly CheckedPair[] {
  const i = list.findIndex((c) => c.parentId === pair.parentId && c.childId === pair.childId);
  if (i < 0) return [...list, pair];
  return list.map((c, j) => (j === i ? pair : c));
}

function withSkipped(list: readonly SkippedPair[], pair: SkippedPair): readonly SkippedPair[] {
  if (list.some((s) => s.aId === pair.aId && s.bId === pair.bId)) return list;
  return [...list, pair];
}

export const heapPropertyScene: ScenePlan<HeapPropertyScene> = {
  /**
   * 첫 장면은 나무만 선 화면이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `readNode` 가 마디마다 새 객체를 만든다.
   */
  initial(initialData: unknown): HeapPropertyScene {
    const raw = (initialData ?? {}) as { nodes?: unknown };
    const nodes = Array.isArray(raw.nodes)
      ? raw.nodes.map(readNode).filter((n): n is HeapSceneNode => n !== null)
      : [];
    return fresh({ nodes });
  },

  reduce(scene: HeapPropertyScene, event: FacetRuntimeEvent): HeapPropertyScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      // 부모-자식 짝 하나를 견준다. 판정이 남는다.
      case 'heap-pair-check': {
        if (typeof p.parentId !== 'string' || typeof p.childId !== 'string') return scene;
        if (typeof p.parentValue !== 'number' || typeof p.childValue !== 'number') return scene;
        if (typeof p.holds !== 'boolean') return scene;
        return {
          ...scene,
          checked: withChecked(scene.checked, {
            parentId: p.parentId,
            childId: p.childId,
            holds: p.holds,
          }),
          caption: { kind: 'pairCheck', parentValue: p.parentValue, childValue: p.childValue },
          step: { kind: 'pair', parentId: p.parentId, childId: p.childId, holds: p.holds },
        };
      }

      // 형제 짝 하나를 짚는다. **판정은 남지 않는다** — 그것이 이 걸음의 뜻이다.
      case 'heap-sibling-skip': {
        if (typeof p.aId !== 'string' || typeof p.bId !== 'string') return scene;
        if (typeof p.aValue !== 'number' || typeof p.bValue !== 'number') return scene;
        return {
          ...scene,
          skipped: withSkipped(scene.skipped, { aId: p.aId, bId: p.bId }),
          caption: { kind: 'siblingSkip', aValue: p.aValue, bValue: p.bValue },
          step: { kind: 'sibling', aId: p.aId, bId: p.bId },
        };
      }

      // 부모-자식 짝이 모두 성립했다. 꼭대기가 물든다 — 남는 강조라 정적으로도
      // 그려야 되짚었을 때 살아 있다 (S-scene PREFER).
      case 'heap-confirmed': {
        if (typeof p.rootId !== 'string' || typeof p.rootValue !== 'number') return scene;
        return {
          ...scene,
          confirmedRootId: p.rootId,
          caption: { kind: 'confirmed', rootValue: p.rootValue },
          step: { kind: 'confirm', rootId: p.rootId },
        };
      }

      // 처음으로 되감는다. 바탕(나무)만 넘기고 걸어온 자취는 선언에서 다시 셈한다.
      case 'rewind':
        // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아
        // 좁힌 타입이 아무것도 막지 못한다.
        return fresh({ nodes: scene.nodes });

      default:
        // 이 facet 의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
