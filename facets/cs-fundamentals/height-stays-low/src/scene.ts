/**
 * HeightStaysLow 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`resetView` ·
 * `descend` · `showResult`)를 부르지 않고 그저 다음 장면을 돌려준다는 것이다.
 * 그래서 어느 걸음의 화면이든 셈으로 얻는다 (`runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어디에 상태를 숨겨 두었나
 *
 * projector 에도 stage 에도 걸음 상태를 담은 `let` 은 없었다 (`target` 하나가
 * 전부였고 그것은 바뀌지 않는 값이다). 그런데도 숨은 상태는 넷이었다 — **화면이
 * 통째로 상태였다.**
 *
 *   · 어느 층까지 내려갔나 → 커서 원의 `style.transform` 과 `opacity` 에만 남았다.
 *   · 그 층까지 무엇을 덮었나 → 막대의 `width` 속성과 `countText.textContent` 에만
 *     남았다. 층마다 하나씩 쌓이는 **자취**인데 되돌릴 명령이 `resetColumn` 뿐이라
 *     처음으로 되감는 것 말고는 어느 걸음으로도 갈 수 없었다.
 *   · 목표에 닿았나 → 그 행의 `fill`/`stroke` 를 accent 로 덮어쓴 것에만 남았다.
 *   · 결론을 말할 때인가 → `captionText.textContent` 에만 남았다.
 *
 * 그 자취가 곧 이 조각의 주장이다 — "층을 하나 내려갈 때마다 덮는 잎이 자식 수만큼
 * 곱해진다" 는 말은 지나온 층의 수들이 사다리에 **남아 있어야** 성립한다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전에는 사다리의 행 수(=나무 높이)를 **stage 가 제 손으로 셈했고**, 결론
 * 캡션의 층수는 **`result` 페이로드가 실어 온 수**를 썼다. 화면에 나란히 뜨는 두
 * 항이 서로 다른 출처에서 나온 셈이라, 어느 한쪽이 어긋나도 화면은 그것을 모른다.
 *
 * 여기서는 `ladder()` 하나가 사다리의 모양과 층마다 덮는 잎 수를 함께 낸다. 행 수도
 * 층마다의 수도 결론 캡션의 두 층수도 전부 그 하나에서 나오므로 **화면이 스스로
 * 참이다.** `descend` 페이로드가 실어 오는 `covered` 와 `arrived` 는 쓰지 않는다 —
 * 걸음이 말해 주어야 하는 것은 "어느 나무가 몇 층까지 내려갔나" 하나뿐이다.
 *
 * 좌표는 담지 않는다 — 층과 자식 수가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 셈한다 (S-piece). 문안도 담지 않고 무엇을 말할지와 그 인자만 담는다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type TreeId = 'branchA' | 'branchB';

/** 사다리가 가질 수 있는 최대 층수. 못 믿을 초기값이 와도 셈이 돌지 않게 막는다. */
const MAX_LEVELS = 64;

/**
 * 나무 하나의 사다리.
 *
 * 행 수(`coveredByLevel.length`)가 곧 그 나무가 목표에 닿기까지 밟는 층수 — 즉
 * **나무 높이**다. 그 수를 따로 필드로 두지 않는 것이 요점이다. 키는 사다리 모양에서
 * 세는 것이지 어딘가 적어 두는 것이 아니다.
 */
export type LadderScene = {
  id: TreeId;
  /** 마디 하나가 두는 자식 수. 걸음이 고치지 않는다. */
  branch: number;
  /**
   * 층마다 그 층이 덮는 잎 수. 자리 `i` 가 `i+1` 층이고, 마지막 자리가 목표에
   * 처음 닿는 층이다. `branch` 와 `target` 이 정하므로 걸음이 고치지 않는다.
   */
  coveredByLevel: readonly number[];
  /** 지금까지 내려간 층. `0` 이면 아직 한 층도 내려가지 않았다. */
  reached: number;
};

export type HeightStaysLowScene = {
  /** 두 나무가 함께 덮어야 할 잎 수. */
  target: number;
  /** 두 나무의 사다리. 선언 순서(branchA, branchB)를 지킨다. */
  ladders: readonly LadderScene[];
  /** 결론을 말할 때인가. 견줄 층수는 `ladders` 의 사다리에서 센다. */
  concluded: boolean;
  /** 방금 내려간 층. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다. */
  step: { treeId: TreeId; level: number } | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `rewind` 가 이것만 넘겨받고 나머지는 선언에서 다시 셈한다. `reached` 나
 * `concluded` 를 여기 넣으면 되감은 화면이 이미 걸어온 층을 밟은 채로 서고 그 위에
 * algorithm 이 1층부터 다시 내려가는 걸음이 겹친다 (프로토콜 4 절). `coveredByLevel`
 * 도 넣지 않는다 — 걸음이 고치지는 않지만 `branch` 와 `target` 에서 나오는 값이라
 * 실어 나르는 것보다 다시 셈하는 편이 출처를 하나로 묶는다.
 */
type Seed = Pick<HeightStaysLowScene, 'target'> & {
  branches: readonly { id: TreeId; branch: number }[];
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * 사다리 하나를 낸다 — 층마다 그 층이 덮는 잎 수.
 *
 * 뿌리를 1층으로 세고 1장을 덮는다. 한 층 내려갈 때마다 `branch` 배로 불어나고,
 * 목표에 처음 닿는 층에서 멈춘다. 그 멈춘 자리가 나무 높이다.
 *
 * algorithm.ts 의 `levelsToReach` 와 같은 식이다. 알고리즘 로직의 재구현이 아니라
 * **같은 공개 초기값(target/branch)에서 같은 결과가 나올 수밖에 없는 셈**이고,
 * 화면 쪽에서는 이 함수 하나만이 그 셈을 한다.
 */
function ladder(branch: number, target: number): readonly number[] {
  if (branch < 2 || target <= 1) return [1];
  const covered: number[] = [1];
  let last = 1;
  while (last < target && covered.length < MAX_LEVELS) {
    last *= branch;
    covered.push(last);
  }
  return covered;
}

/** 아무 층도 내려가지 않은 처음 장면. */
function atStart(seed: Seed): HeightStaysLowScene {
  return {
    target: seed.target,
    ladders: seed.branches.map((b) => ({
      id: b.id,
      branch: b.branch,
      coveredByLevel: ladder(b.branch, seed.target),
      reached: 0,
    })),
    concluded: false,
    step: null,
  };
}

function asTreeId(v: unknown): TreeId | null {
  return v === 'branchA' || v === 'branchB' ? v : null;
}

export const heightStaysLowScene: ScenePlan<HeightStaysLowScene> = {
  /**
   * 첫 장면은 두 사다리가 비어 선 화면이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 여기서 꺼내는 것은 수 셋뿐이고 전부 값으로 복사된다.
   */
  initial(initialData: unknown): HeightStaysLowScene {
    const raw = (initialData ?? {}) as { target?: unknown; branchA?: unknown; branchB?: unknown };
    return atStart({
      target: num(raw.target, 0),
      branches: [
        { id: 'branchA', branch: num(raw.branchA, 2) },
        { id: 'branchB', branch: num(raw.branchB, 2) },
      ],
    });
  },

  reduce(scene: HeightStaysLowScene, event: FacetRuntimeEvent): HeightStaysLowScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      // 한 나무가 층을 하나 내려간다. 페이로드에서 받는 것은 어느 나무의 몇 층인가
      // 뿐이다 — 그 층이 덮는 잎 수도 목표에 닿았는지도 사다리가 이미 안다.
      case 'descend': {
        const treeId = asTreeId(p.treeId);
        if (treeId === null) return scene;
        const level = num(p.level, 0);
        if (level < 1) return scene;
        return {
          ...scene,
          ladders: scene.ladders.map((l) =>
            l.id === treeId
              ? { ...l, reached: Math.min(level, l.coveredByLevel.length) }
              : l,
          ),
          step: { treeId, level: Math.min(level, MAX_LEVELS) },
        };
      }

      // 두 나무가 모두 닿았다. 견줄 두 층수는 사다리에서 세므로 여기서는 말할 때가
      // 되었다는 것만 남긴다 — `result` 페이로드의 `levelsA`/`levelsB` 를 쓰면
      // 화면에 나란히 뜨는 두 항이 사다리와 다른 출처에서 나온다.
      case 'result':
        return { ...scene, concluded: true, step: null };

      // 처음으로 되감는다. 바탕(목표와 자식 수)만 넘기고 걸어온 자취는 선언에서
      // 다시 셈한다. 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지
      // 않아 좁힌 타입이 아무것도 막지 못한다 (프로토콜 4 절).
      case 'rewind':
        return atStart({
          target: scene.target,
          branches: scene.ladders.map((l) => ({ id: l.id, branch: l.branch })),
        });

      default:
        // 이 facet 의 algorithm 은 위 셋만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
