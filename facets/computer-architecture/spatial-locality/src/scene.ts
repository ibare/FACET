/**
 * SpatialLocality 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **한 칸을 물으면 이웃까지 함께 올라온다.** 그러니 화면이 반드시 쥐고 있어야
 * 하는 것은 둘이고, 그 둘이 서로 다른 물음이다.
 *
 *   - `lifted`   — 어느 줄이 아래층에서 통째로 올라와 있나. *캐시의 형편.*
 *   - `outcomes` — 어느 칸을 실제로 물었고 그때 내려가야 했나. *짚음의 자취.*
 *
 * 둘을 한 축에 얹으면 덤으로 올라온 이웃이 "내가 물은 칸" 으로 읽혀 주장이
 * 뒤집힌다. 그래서 그리는 쪽도 **채움 = 올라와 있나 / 테두리 = 물었나** 로 갈라
 * 칠한다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 세 자리에 숨겨 두었다.
 *
 * - **`type CellState = 'stored'|'resident'|'hit'|'miss'`** — 선언은 있는데 값이
 *   어디에도 저장되지 않았다. 칸의 형편이 `fill` · `stroke` · 라벨 `fill` 세
 *   속성에만 있었고, 게다가 **네 값이 한 축에 얹혀** "올라와 있나" 와 "물었나" 가
 *   섞여 있었다. 이제 `lifted` 와 `outcomes` 가 따로 말한다.
 * - **`const lineGroups` 의 `style.transform`** — 어느 줄이 올라왔나가 좌표가
 *   아니라 *단계*로 거기 들어 있었다. 이제 `lifted` 가 말하고 자리는 그림이 센다.
 * - **`let cursorShown` · `let cursorAt`** — 커서가 떴나, 어느 칸에 섰나. 둘 다
 *   `outcomes.length` 에서 나온다 — 짚기는 a[0] 부터 차례로 하나씩 쌓이므로
 *   지금 짚는 칸이 곧 마지막 짚기다.
 *
 * ── 걸음이 싣는 것은 없다
 *
 * 발신 넷이 payload 를 하나도 싣지 않는다. `index` 는 짚기가 쌓인 수이고,
 * `addr` · `line` · `span` 은 바탕에 순수 함수를 먹이면 나오며(`algorithm.ts` 가
 * 내주는 `addrOf` · `lineOf` · `spanOf` 를 여기서 부른다 — 프로토콜 4 절의 B
 * 갈래이자 원칙 1 의 허용 방향이다), `touches` · `hits` · `misses` 는 아래 두
 * 배열에서 그대로 나온다. 남은 것은 **걸음의 종류**뿐이고 그것이 판정이다.
 *
 * 좌표는 담지 않는다. 칸 번호와 줄 번호라는 구조만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 캡션이 무엇을 말할지는
 * `step` 갈래가 그대로 정하고 인자는 아래 두 배열에서 셈해지므로, 그리는 쪽이
 * `params.t` 로 문자를 만든다 (C10). 같은 물음에 답이 둘이 되지 않게 캡션 필드를
 * 따로 두지 않았다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { lineOf, readSpatialLocality, type SpatialLocalityShape } from './algorithm.js';

/** 한 번 짚어 본 결과. 내려가야 했나(`miss`), 이미 와 있었나(`hit`). */
export type TouchOutcome = 'hit' | 'miss';

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 커서가 어디서 어디로 미끄러지는지는 `outcomes` 의
 * 길이가 말한다. `prev` 에서 출발값을 꺼내는 길을 아예 만들지 않는다 (S-scene).
 */
export type SpatialStep =
  | { kind: 'probe' }
  | { kind: 'lift' }
  | { kind: 'touch' }
  | { kind: 'done' };

export type SpatialLocalityScene = {
  /** 줄 크기 · 원소 크기 · 짚을 개수. 걸음이 고치지 않는다. */
  base: SpatialLocalityShape;
  /** 아래층에서 통째로 올라온 줄들. 올라온 차례대로. 쌓이는 자취라 되짚어도 남는다. */
  lifted: number[];
  /** 짚은 차례대로의 결과. **길이가 곧 몇 번째 짚기인가**다. */
  outcomes: TouchOutcome[];
  step: SpatialStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `lifted` 와 `outcomes` 를 넣지 않는다 — 둘 다 걸어온 자취다. 넣어 두면 되감은
 * 화면이 이미 다 올라온 줄로 서고 그 위에 algorithm 이 처음부터 다시 올리므로
 * 화면 안에서 두 이야기가 어긋난다 (S-scene).
 */
type SpatialBase = Pick<SpatialLocalityScene, 'base'>;

/**
 * 아직 아무것도 짚지 않은 처음 화면. 줄은 전부 아래층에 있다.
 *
 * 호출부는 반드시 객체 리터럴을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다.
 */
function atStart(base: SpatialBase): SpatialLocalityScene {
  return { base: base.base, lifted: [], outcomes: [], step: null };
}

/** 지금 짚고 있는 칸. 아직 아무것도 안 짚었으면 `null`. */
export function activeIndex(scene: SpatialLocalityScene): number | null {
  return scene.outcomes.length > 0 ? scene.outcomes.length - 1 : null;
}

/** 아래층까지 내려간 횟수 — 올라온 줄이 곧 내려간 횟수다. */
export function missCount(scene: SpatialLocalityScene): number {
  return scene.outcomes.reduce((n, o) => (o === 'miss' ? n + 1 : n), 0);
}

export const spatialLocalityScene: ScenePlan<SpatialLocalityScene> = {
  /**
   * 첫 장면은 바탕 셋만 안다.
   *
   * 넘겨받은 객체를 쥐지 않고 **수 셋을 복사해** 온다. 참조를 쥐면 되짚을 때 이미
   * 다 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): SpatialLocalityScene {
    return atStart({ base: readSpatialLocality(initialData) });
  },

  reduce(scene: SpatialLocalityScene, event: FacetRuntimeEvent): SpatialLocalityScene {
    switch (event.type) {
      // 위층을 짚었더니 비어 있다. 짚기 하나가 시작되고, 그 값은 미스다.
      case 'probe': {
        if (scene.outcomes.length >= scene.base.count) return scene;
        return { ...scene, outcomes: [...scene.outcomes, 'miss'], step: { kind: 'probe' } };
      }

      // 그 줄이 통째로 올라온다. 어느 줄인지는 방금 짚은 칸이 정한다.
      case 'line-lift': {
        const index = activeIndex(scene);
        if (index === null) return scene;
        const line = lineOf(index, scene.base);
        if (scene.lifted.includes(line)) return scene;
        return { ...scene, lifted: [...scene.lifted, line], step: { kind: 'lift' } };
      }

      // 이미 위층에 있다 — 내려가지 않는다.
      case 'touch': {
        if (scene.outcomes.length >= scene.base.count) return scene;
        return { ...scene, outcomes: [...scene.outcomes, 'hit'], step: { kind: 'touch' } };
      }

      case 'done':
        return { ...scene, step: { kind: 'done' } };

      // 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 거둔다.
      case 'rewind':
        return atStart({ base: scene.base });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
