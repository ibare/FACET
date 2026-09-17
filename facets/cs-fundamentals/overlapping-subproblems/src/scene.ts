/**
 * overlappingSubproblems 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이고, 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 숨겨 두었던 것은 "어느 항이 몇 번 돋았나" 다
 *
 * 명령형 stage 는 마디가 하나 돋을 때마다 `<g>` 를 만들어 `nodeLayer` · `chipLayer`
 * 에 붙이고 `pileCount: Map<number, number>` 를 하나 올렸다. 그래서 **지금 어디까지
 * 돋았는지, 어느 항이 몇 번 나왔는지를 코드가 수로 갖고 있지 않았다** — 그 답은 두
 * 레이어의 자식 수와 선반 딱지의 `textContent`(`f(1) ×5`) 에만 있었다. 되감으면
 * 복원할 자가 없다.
 *
 * 여기서는 그것이 `sproutsDone` 하나로 줄어든다. 호출 나무는 `n` 하나로 정해지므로
 * (`expandFibCalls`), **몇 개가 돋았는지만 알면 지금 선 마디도, 가지도, 각 항의
 * 등장 차례도, 선반 더미의 높이도 전부 셈으로 나온다.**
 *
 * ── 나무는 algorithm 이 내주고 장면이 부른다
 *
 * 펼친 나무는 구조에서 셀 수는 없지만 **바탕(`n`)에 순수 함수를 먹이면 나오는**
 * 값이다. 그럴 때는 payload 로 실어 오지 않고 같은 함수를 부른다 — 싣는 순간 다음
 * 사람이 집어 쓸 문이 열리고, 그 문이 곧 "두 자리에서 세기" 가 들어오는 길이다.
 * 그래서 이 조각의 발신은 payload 가 **하나도 없다.**
 *
 * ── 겹침의 표식은 머문다
 *
 * 이 조각의 주장이 "같은 부분 문제가 여러 번 나타난다" 라, 그것을 말하는 표식은
 * 걸음이 지나가도 남아야 한다. 마디 모서리의 등장 차례, 두 번째부터 갈리는 칠,
 * 선반에 쌓이는 조각 더미, 그리고 끝에 짚이는 가장 높은 더미 — 넷 다 정적
 * 그리기가 세우므로 어느 걸음으로 뛰어도 그 자리에 있다.
 *
 * 좌표는 담지 않는다. 항과 깊이와 등장 차례가 자리를 정하므로 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { expandFibCalls, readTermCount, type FibCall } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 어느 마디가 돋았는지는 싣지 않는다 — `sproutsDone - 1` 이 곧 그 번호다.
 */
export type OverlappingSubproblemsMark =
  /** 마디 하나가 부모에서 갈라져 내려왔다. */
  | { readonly kind: 'sprout' }
  /** 다 펼쳤다. 가장 높은 더미가 짚이고 뿌리 옆에 답이 선다. */
  | { readonly kind: 'settle' };

export type OverlappingSubproblemsScene = {
  /**
   * 정의대로 펼칠 항. **바탕이다.**
   *
   * 되감기가 여기로 돌아가고 어느 걸음도 이것을 고치지 않는다. 수 하나라
   * 참조를 쥘 일도 없다 (S-scene).
   */
  readonly n: number;
  /**
   * 지금까지 돋은 호출의 수. **이 조각의 본체다.**
   *
   * 선 마디도, 가지도, 각 항의 등장 차례도, 선반 더미도 전부 이 수 하나에서
   * 풀린다. 명령형 stage 에서는 그 답이 DOM 에만 있었다.
   */
  readonly sproutsDone: number;
  /** 셈이 났나. 가장 높은 더미의 표식과 뿌리 옆 답이 여기서 갈린다 — **머무는 것**. */
  readonly concluded: boolean;
  readonly mark: OverlappingSubproblemsMark | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `sproutsDone` · `concluded` 를 일부러 뺀다. 걸음이 고치는 것을 바탕과 같은 급으로
 * 묶어 넘기면 되감은 화면이 **이미 다 자란 나무**로 서고, 그 위에 algorithm 이 새로
 * 셈한 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<OverlappingSubproblemsScene, 'n'>;

// ── 구조에서 나오는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 마디의 등장 차례도, 선반의 `×5` 도,
// 마지막 셈의 `15 번 · 여섯 항 · f(1) 다섯 번` 도 `tally` 한 함수에서 나온다.

/** 펼친 호출 전부. algorithm 이 내준 순수 함수를 그대로 부른다. */
export function callsOf(scene: OverlappingSubproblemsScene): readonly FibCall[] {
  return expandFibCalls(scene.n);
}

/** 지금 화면에 서 있는 마디들. 전위 순서라 부모가 언제나 먼저 서 있다. */
export function sproutedCalls(scene: OverlappingSubproblemsScene): readonly FibCall[] {
  return callsOf(scene).slice(0, scene.sproutsDone);
}

/**
 * 항별로 몇 번 나왔나, 그리고 각 호출이 그 항의 몇 번째 등장인가.
 *
 * 두 답이 같은 한 번의 훑기에서 나온다 — 갈라 두면 선반의 `×5` 와 마디의 차례
 * 배지가 같은 물음에 두 번 답하는 꼴이 된다.
 */
export type Tally = {
  /** 호출 목록과 나란하다. 1 이면 처음 푸는 항, 2 이상이면 또 푸는 것. */
  readonly ordinals: readonly number[];
  /** 항 → 나온 횟수. */
  readonly heights: ReadonlyMap<number, number>;
};

function tally(calls: readonly FibCall[]): Tally {
  const heights = new Map<number, number>();
  const ordinals: number[] = [];
  for (const c of calls) {
    const k = (heights.get(c.n) ?? 0) + 1;
    heights.set(c.n, k);
    ordinals.push(k);
  }
  return { ordinals, heights };
}

/** 지금까지 돋은 것만 센다 — 선반 더미의 높이와 마디의 등장 차례. */
export function sproutTally(scene: OverlappingSubproblemsScene): Tally {
  return tally(sproutedCalls(scene));
}

/**
 * 나무 전체를 센다 — 선반의 칸 목록과 가장 높이 쌓일 더미.
 *
 * 선반의 폭과 조각 간격은 처음부터 끝까지 바뀌지 않아야 하므로 **자라는 쪽이
 * 아니라 다 자란 쪽**을 본다.
 */
export function fullTally(scene: OverlappingSubproblemsScene): Tally {
  return tally(callsOf(scene));
}

/** 선반의 칸. 작은 항이 왼쪽이다 — 왼쪽이 높아지는 것이 곧 이 조각의 그림이다. */
export function termColumns(scene: OverlappingSubproblemsScene): number[] {
  return [...fullTally(scene).heights.keys()].sort((a, b) => a - b);
}

/** 다 펼쳤을 때 가장 높이 쌓이는 더미. 조각 간격이 이것을 보고 정해진다. */
export function tallestPile(scene: OverlappingSubproblemsScene): number {
  return Math.max(1, ...fullTally(scene).heights.values());
}

/** 마지막 셈. 다 펼친 구조를 훑어 얻는다 — 어디에도 적어 두지 않는다. */
export type CallSummary = {
  readonly calls: number;
  readonly distinct: number;
  readonly worstN: number;
  readonly worstCount: number;
  readonly value: number;
};

export function summaryOf(scene: OverlappingSubproblemsScene): CallSummary {
  const calls = callsOf(scene);
  const { heights } = fullTally(scene);
  let worstN = calls[0]?.n ?? 0;
  let worstCount = 0;
  for (const [n, count] of heights) {
    if (count > worstCount || (count === worstCount && n < worstN)) {
      worstN = n;
      worstCount = count;
    }
  }
  return {
    calls: calls.length,
    distinct: heights.size,
    worstN,
    worstCount,
    // 뿌리가 전위 첫 호출이고 그 값이 곧 얻어 낸 답이다.
    value: calls[0]?.value ?? 0,
  };
}

/**
 * 방금 돋은 마디와 그것이 그 항의 몇 번째 등장인가.
 *
 * 흐르게 할 것을 고르는 데도 쓰고, 캡션이 무엇을 말할지 가르는 데도 쓴다.
 */
export function lastSprout(
  scene: OverlappingSubproblemsScene,
): { readonly call: FibCall; readonly ordinal: number } | null {
  if (scene.sproutsDone <= 0) return null;
  const i = scene.sproutsDone - 1;
  const call = callsOf(scene)[i];
  if (call === undefined) return null;
  return { call, ordinal: sproutTally(scene).ordinals[i] ?? 1 };
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** 아직 아무 걸음도 밟지 않은 화면 — 빈 선반만 서 있고 나무는 없다. */
function atStart(b: Base): OverlappingSubproblemsScene {
  return { n: b.n, sproutsDone: 0, concluded: false, mark: null };
}

export const overlappingSubproblemsScene: ScenePlan<OverlappingSubproblemsScene> = {
  /**
   * 첫 장면은 선반뿐이다.
   *
   * 나무는 한 마디도 서지 않는다 — 첫 `sprout` 이 뿌리를 세우고, 그 전의 화면이
   * "아직 아무 일도 일어나지 않았다" 를 말한다.
   *
   * `n` 은 algorithm 과 **같은 함수로** 읽는다. 좁히는 규칙이 두 벌이면 화면의
   * 나무와 발신의 걸음 수가 갈린다.
   */
  initial(initialData: unknown): OverlappingSubproblemsScene {
    const d = (initialData ?? {}) as { n?: unknown };
    return atStart({ n: readTermCount(d.n) });
  },

  reduce(
    scene: OverlappingSubproblemsScene,
    event: FacetRuntimeEvent,
  ): OverlappingSubproblemsScene {
    switch (event.type) {
      // 마디 하나가 돋는다. **어느 마디인지 싣지 않는다** — 전위 차례가 정해져
      // 있으므로 몇 번째 발신인가가 곧 그 답이다.
      case 'sprout': {
        if (scene.sproutsDone >= callsOf(scene).length) return scene;
        return { ...scene, sproutsDone: scene.sproutsDone + 1, mark: { kind: 'sprout' } };
      }

      // 다 펼쳤다. 셈은 전부 구조에서 나오므로 아무것도 싣지 않는다.
      case 'done':
        return { ...scene, concluded: true, mark: { kind: 'settle' } };

      // 손으로 짚기 시작 — 빈 선반만 남긴 처음으로 돌아간다.
      //
      // 객체 리터럴로 넘긴다. 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ n: scene.n });

      default:
        // 이 algorithm 이 발신하는 이벤트는 위 셋이 전부다. 그 밖의 것은 조용히
        // 버린다 (C2).
        return scene;
    }
  },
};
