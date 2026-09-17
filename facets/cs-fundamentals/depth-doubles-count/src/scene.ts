/**
 * DepthDoublesCount 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 층마다의 자리 수 (1 · 2 · 4 · 8 …) 는 오른쪽 눈금에 **쌓인다.** 그 쌓임이 곧
 * 이 조각의 주장이다 — 층은 하나씩 느는데 자리는 곱으로 늘어서, 몇 층 안 내려가도
 * 담을 수 없게 된다. 그런데 옛 stage 에서 그 자취는 어디에도 적혀 있지 않았다.
 * 눈금의 `text` 노드들이 `gutterGroup` 안에 쌓인 것이 전부였고, 지금 벌어지는
 * 층이 어느 것인지는 `let liveCount` 라는 **DOM 손잡이 하나**가 쥐고 있었다.
 * 지금 줄의 자리들은 `let current: Slot[]` 이 쥐었는데, 그 `Slot` 은 좌표와 DOM
 * 노드를 한 몸으로 묶은 것이라 되감으면 통째로 어긋났다.
 *
 * 여기서는 그 셋이 `rows` 하나다. 인덱스가 곧 층 번호이고, 길이가 놓인 층의
 * 수이며, 마지막 칸이 살아 있는 층이다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 화면에는 수가 **세 자리**에 뜬다 — 층마다의 자리 수, 괄호 옆의 합, 그리고
 * 캡션의 `{count}` · `{total}`. 셋이 서로 다른 출처에서 오면 언젠가 갈리고,
 * 그러면 그림이 제 화면 안에서 거짓이 된다. 그래서 장면이 쥐는 수는 `rows`
 * 하나뿐이다.
 *
 * - **합은 받지 않는다.** algorithm 이 `total = 2^(depth+1) - 1` 을 실어 보내지만
 *   버린다. 그리는 쪽이 `rows` 를 **더해서** 얻으므로, 괄호 옆의 수는 눈금에
 *   적힌 수들의 합 그 자체다.
 * - **그린 자리의 개수도 `rows` 가 정한다.** 층 d 에 몇 개를 그릴지는 `rows[d]`
 *   이고, 그리는 쪽은 `2 ** d` 를 다시 세지 않는다. 다시 세면 그림이 제 주장을
 *   스스로 증명하는 꼴이 되어 뜻이 없어진다 (`array-as-tree` 와 같은 갈래).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 자리의 중심은 층의 자리 수와 번호가 정하므로 (칸 간격이
 * 층마다 같다) 그리는 쪽의 몫이다 (S-piece). 띠 밖으로 넘친 자리를 솎는 일도
 * 좌표의 일이라 그리는 쪽에 있다 — 넘친다는 사실 자체가 논증이지 상태가 아니다.
 *
 * 문안도 담지 않는다. 무엇을 말할지는 `rows` 와 `gathered` 가 이미 말하므로
 * 캡션 필드조차 두지 않는다 — 두면 캡션의 수가 눈금의 수와 갈릴 네 번째 출처가
 * 생긴다. 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 머무는 것(`rows` · `gathered`)과 갈라 둔다. 이 조각에서는 둘이 겹쳐 보이지만
 * 뜻이 다르다 — 괄호는 서면 남는 표식이고, 괄호가 **그어지는 것**은 한 걸음짜리
 * 운동이다.
 */
export type DepthStep = 'root' | 'split' | 'gather';

export type DepthDoublesCountScene = {
  /**
   * 층마다의 자리 수. 인덱스가 곧 층 번호이고 길이가 놓인 층의 수다.
   *
   * 화면의 모든 수가 여기서 나온다 — 눈금도, 합도, 캡션의 인자도, 그리는 자리의
   * 개수도.
   */
  rows: readonly number[];
  /**
   * 모든 층을 하나로 묶었나. 묶이면 괄호와 합이 서고, 살아 있는 층이 없어져
   * 마지막 층까지 가라앉는다.
   */
  gathered: boolean;
  step: DepthStep | null;
};

/**
 * 되돌린 뒤의 장면.
 *
 * 이 조각에는 **걸음이 고치지 않는 바탕이 하나도 없다.** 층도 묶음도 전부 걸어온
 * 자취다. 그래서 바탕 타입을 `Pick<Scene, …>` 로 좁힐 것조차 없이 인자가 없다 —
 * 넘길 수 있는 것이 없으므로 자취가 바탕에 섞여 되감기를 타고 넘어갈 길 자체가
 * 없다 (S-scene). `Pick` 을 두고 변수를 넘기면 초과 속성 검사가 돌지 않아 장면
 * 전체가 그대로 통과하는데, 인자가 없으면 그 구멍이 생기지 않는다.
 */
function atStart(): DepthDoublesCountScene {
  return { rows: [], gathered: false, step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const depthDoublesCountScene: ScenePlan<DepthDoublesCountScene> = {
  /**
   * 첫 장면 — 아직 아무 층도 놓이지 않았다.
   *
   * `initialData` 를 들여다보지 않는다. 거기 있는 것은 `maxDepth` 와 `stepMs`
   * 뿐이고 둘 다 걸음이 채워 주는 것이 아니라 캔버스 골격과 걸음 간격을 정하는
   * 선언이라, 장면이 쥘 까닭이 없다 (S-scene — 참조를 쥐지 않는다).
   */
  initial(): DepthDoublesCountScene {
    return atStart();
  },

  reduce(scene: DepthDoublesCountScene, event: FacetRuntimeEvent): DepthDoublesCountScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'root-placed': {
        const count = num(p.count);
        if (count === null) return scene;
        // 0층을 놓는 일은 늘 처음부터 다시 시작하는 일이다 (옛 stage 의 `reset()`).
        return { ...atStart(), rows: [count], step: 'root' };
      }

      case 'depth-split': {
        const depth = num(p.depth);
        const count = num(p.count);
        if (depth === null || count === null) return scene;
        // 층 번호가 곧 자리 번호다. 이어지지 않는 층이 오면 그 걸음은 그릴 것이
        // 없다 — 눈금에 구멍이 뚫린 나무를 그리느니 조용히 흘린다 (C2).
        if (depth !== scene.rows.length) return scene;
        return { ...scene, rows: [...scene.rows, count], step: 'split' };
      }

      case 'total-gathered': {
        if (scene.rows.length === 0) return scene;
        // `payload.total` 은 받지 않는다. 합은 눈금에 적힌 수들의 합이어야 한다.
        return { ...scene, gathered: true, step: 'gather' };
      }

      case 'rewind':
        return atStart();

      default:
        // 이 algorithm 이 발신하는 이벤트는 위 넷이 전부다. 나머지는 조용히
        // 흘린다 (C2).
        return scene;
    }
  },
};
