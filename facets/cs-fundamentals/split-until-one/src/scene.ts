/**
 * splitUntilOne 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 숨겨 두었던 것은 "어디까지 쪼갰나" 다
 *
 * 명령형 stage 는 묶음이 하나 생길 때마다 `<g>` 를 만들어 `gFrames` 에 붙이고
 * `frames: Map<string, Frame>` 에 손잡이를 담았다. 그래서 **지금 몇 층까지
 * 갈라졌는지, 어느 묶음이 서 있는지를 코드가 수로 갖고 있지 않았다** — 그 답은
 * DOM 의 자식 수와 Map 의 열쇠에만 있었고, 되감으면 복원할 자가 없었다.
 *
 * 여기서는 그것이 `splitsDone` 하나로 줄어든다. 갈라짐은 값과 무관하게 자리만으로
 * 정해지므로 (`computeSplitUntilOnePlan`), **몇 번 갈라졌는지만 알면 지금 서 있는
 * 묶음 전부가 셈으로 나온다.** 그 셈이 `shownGroups` 다.
 *
 * ── 쪼개는 규칙은 algorithm 이 내주고 장면이 부른다
 *
 * 반으로 가르는 자리(`Math.floor((lo + hi) / 2)`)는 구조에서 셀 수는 없지만
 * **바탕 자료에 순수 함수를 먹이면 나오는** 값이다. 그럴 때는 payload 로 실어
 * 오지 않고 같은 함수를 부른다 — 싣는 순간 다음 사람이 집어 쓸 문이 열리고, 그
 * 문이 곧 "두 자리에서 세기" 가 들어오는 길이다. 그래서 이 조각의 발신은 payload
 * 가 **하나도 없다.** 갈라짐의 차례조차 싣지 않는다 — 발신이 오는 순서가 이미
 * 그것을 말한다.
 *
 * ── 머무는 것과 지나가는 것
 *
 * 명령형 stage 는 갈라진 두 상자의 테두리를 애니메이션 **동안만** `itemActive` 로
 * 칠하고 `p >= 1` 에서 되돌렸다. 그래서 걸음이 멎은 화면에는 "방금 무엇이
 * 갈라졌나" 가 남지 않았고, 되짚으면 더욱 없었다. 이제 `mark` 가 그것을 말하고
 * 정적 그리기가 걸음 내내 세운다.
 *
 * 채움과 테두리를 갈라 둔다 — **채움은 값의 형편**(낱개로 확정되었다),
 * **테두리는 갈라짐의 표식**(이번 걸음에 새로 났다). 둘이 부딪히지 않는다.
 *
 * 좌표는 담지 않는다. 구간(`lo`·`hi`)과 층(`depth`)이 자리를 정하므로 자리는
 * 그리는 쪽이 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  computeSplitUntilOnePlan,
  type SplitGroup,
  type SplitPlan,
  type SplitStep,
} from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 갈라짐의 차례는 싣지 않는다 — `splitsDone` 이 곧 그 번호다 (발신이 오는 순서가
 * 이미 말한다). 갈라진 두 묶음의 테두리 표식만은 이 표를 보고 정적으로도 세운다.
 */
export type SplitUntilOneMark =
  /** 맨 위 묶음이 섰다. */
  | { readonly kind: 'root' }
  /** 묶음 하나가 둘로 갈라졌다. 어느 것인지는 `splitsDone - 1` 이 말한다. */
  | { readonly kind: 'split' }
  /** 모든 묶음이 낱개가 되었다. */
  | { readonly kind: 'leaves' };

/**
 * 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지**다 (C10).
 *
 * 값 개수 같은 수는 싣지 않는다 — 화면 맨 위에 적히는 숫자와 같은 배열을 세야
 * 두 수가 갈리지 않는다.
 */
export type SplitUntilOneCaption =
  | { readonly kind: 'whole' }
  | { readonly kind: 'split' }
  | { readonly kind: 'splitAgain' }
  | { readonly kind: 'leaves' };

export type SplitUntilOneScene = {
  /**
   * 가를 값들. 되감기가 여기로 돌아가고 **어느 걸음도 고치지 않는다.**
   *
   * 이 조각의 주장 자체가 "값은 한 칸도 움직이지 않는다" 라, 값이 걸음마다
   * 달라지는 자리에 놓이면 그림이 말하는 것과 어긋난다.
   */
  readonly values: readonly number[];
  /** 맨 위 묶음이 이미 섰나. 서기 전에는 값과 레일만 있다. */
  readonly rootShown: boolean;
  /**
   * 지금까지 일어난 갈라짐의 수. **이 조각의 본체다.**
   *
   * 층이 몇이고 어느 묶음이 서 있는지가 전부 이 수 하나에서 풀린다
   * (`shownGroups`). 명령형 stage 에서는 그 답이 DOM 에만 있었다.
   */
  readonly splitsDone: number;
  /** 낱개에 다다랐다고 선언되었나. 채움이 여기서 갈린다. */
  readonly leavesSettled: boolean;
  readonly mark: SplitUntilOneMark | null;
  readonly caption: SplitUntilOneCaption | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `splitsDone` · `rootShown` · `leavesSettled` 를 일부러 뺀다. 걸음이 고치는 것을
 * 바탕과 같은 급으로 묶어 넘기면 되감은 화면이 **이미 다 쪼개진 나무**로 서고,
 * 그 위에 algorithm 이 새로 셈한 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<SplitUntilOneScene, 'values'>;

// ── 구조에서 나오는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 것은 전부 이 아래를 지난다. 상자의 구간도, 층도, 어느 것이 낱개인지도
// payload 가 아니라 `values.length` 하나에서 풀린다.

/**
 * 이 값 개수를 반으로 계속 가를 때 생기는 구간들.
 *
 * algorithm 이 내준 순수 함수를 그대로 부른다 — 가르는 자리가 두 곳에 적히지
 * 않게. 값을 보지 않는 함수라 장면이 불러도 같은 답이 나온다.
 */
export function planOf(scene: SplitUntilOneScene): SplitPlan {
  return computeSplitUntilOnePlan(scene.values.length);
}

/**
 * 지금 화면에 서 있는 묶음 전부.
 *
 * 층은 **쌓인다** — 갈라진 뒤에도 부모 상자가 남아야 "무엇이 무엇에서 나왔나" 가
 * 보인다. 그래서 지운 것 없이 맨 위 묶음부터 차례로 늘어놓는다.
 */
export function shownGroups(scene: SplitUntilOneScene): SplitGroup[] {
  if (!scene.rootShown) return [];
  const plan = planOf(scene);
  const out: SplitGroup[] = [plan.root];
  for (let i = 0; i < scene.splitsDone; i += 1) {
    const s = plan.splits[i];
    if (s === undefined) break;
    const depth = s.parentDepth + 1;
    out.push(
      { id: s.leftId, lo: s.leftLo, hi: s.leftHi, depth },
      { id: s.rightId, lo: s.rightLo, hi: s.rightHi, depth },
    );
  }
  return out;
}

/** 방금 일어난 갈라짐. `mark` 가 갈라짐일 때만 뜻이 있다. */
export function lastSplit(scene: SplitUntilOneScene): SplitStep | null {
  if (scene.splitsDone <= 0) return null;
  return planOf(scene).splits[scene.splitsDone - 1] ?? null;
}

/** 낱개인가. 점 하나짜리 상자에는 가를 자리가 없다 — 이 조각이 멈추는 까닭이다. */
export function isLeafGroup(g: SplitGroup): boolean {
  return g.lo === g.hi;
}

/**
 * 낱개로 확정되어 채워진 묶음들. **왼쪽에서 오른쪽 순.**
 *
 * 값 개수가 2의 거듭제곱이 아니면 갈라지는 차례와 자리의 차례가 어긋나므로
 * (다섯이면 `2-2` 가 `0-0` 보다 먼저 난다) 여기서 한 번 자리 순으로 세운다.
 * 번지는 운동이 왼쪽부터 흐르려면 그 순서라야 한다.
 */
export function settledLeaves(scene: SplitUntilOneScene): SplitGroup[] {
  if (!scene.leavesSettled) return [];
  return shownGroups(scene)
    .filter(isLeafGroup)
    .sort((a, b) => a.lo - b.lo);
}

/**
 * 이번 걸음에 새로 난 묶음 둘의 id.
 *
 * 명령형 stage 에서는 이 표식이 애니메이션 동안에만 있다가 거두어졌다. 그것이
 * 지우던 것은 **이 걸음이 무엇을 했나** 라는 정보다. 이제 걸음 내내 머문다.
 */
export function justSplitIds(scene: SplitUntilOneScene): readonly string[] {
  if (scene.mark?.kind !== 'split') return [];
  const s = lastSplit(scene);
  return s === null ? [] : [s.leftId, s.rightId];
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** 수 배열을 **복사해** 읽는다. 참조를 쥐면 과거가 함께 바뀐다 (S-scene). */
function readNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

/** 아직 아무 걸음도 밟지 않은 화면 — 값과 레일만 서 있고 묶음은 없다. */
function atStart(b: Base): SplitUntilOneScene {
  return {
    values: b.values,
    rootShown: false,
    splitsDone: 0,
    leavesSettled: false,
    mark: null,
    caption: null,
  };
}

export const splitUntilOneScene: ScenePlan<SplitUntilOneScene> = {
  /**
   * 첫 장면은 값과 레일뿐이다.
   *
   * 맨 위 묶음조차 아직 서지 않는다 — `group-appear` 가 그것을 세우고, 그 전의
   * 화면이 "아직 아무 일도 일어나지 않았다" 를 말한다.
   */
  initial(initialData: unknown): SplitUntilOneScene {
    const d = (initialData ?? {}) as { values?: unknown };
    return atStart({ values: readNumbers(d.values) });
  },

  reduce(scene: SplitUntilOneScene, event: FacetRuntimeEvent): SplitUntilOneScene {
    switch (event.type) {
      // 맨 위 묶음이 생긴다. 구간도 층도 payload 가 아니라 `plan.root` 에서 온다.
      case 'group-appear':
        return {
          ...scene,
          rootShown: true,
          splitsDone: 0,
          leavesSettled: false,
          mark: { kind: 'root' },
          caption: { kind: 'whole' },
        };

      // 묶음 하나가 둘로 갈라진다. **어느 묶음인지 싣지 않는다** — 층 순서로
      // 훑는 차례가 정해져 있으므로 몇 번째 발신인가가 곧 그 답이다.
      case 'split': {
        const step = planOf(scene).splits[scene.splitsDone];
        if (step === undefined) return scene;
        return {
          ...scene,
          splitsDone: scene.splitsDone + 1,
          mark: { kind: 'split' },
          // 첫 갈라짐과 그 뒤가 하는 말이 다르다. 층은 셈에서 나온다.
          caption: { kind: step.parentDepth === 0 ? 'split' : 'splitAgain' },
        };
      }

      // 더 가를 자리가 없다. 어느 것이 낱개인지는 구간에서 갈리므로
      // (`lo === hi`) 묶음 목록도 층 번호도 싣지 않는다.
      case 'leaves-reached':
        return {
          ...scene,
          leavesSettled: true,
          mark: { kind: 'leaves' },
          caption: { kind: 'leaves' },
        };

      // 손으로 짚기 시작 — 값과 레일만 남긴 처음으로 돌아간다.
      //
      // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ values: scene.values });

      default:
        // 이 algorithm 이 발신하는 이벤트는 위 넷이 전부다. 그 밖의 것은 조용히
        // 버린다 (C2).
        return scene;
    }
  },
};
