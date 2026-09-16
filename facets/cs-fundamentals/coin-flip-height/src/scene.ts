/**
 * CoinFlipHeight 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 무작위는 여기 없다. 있으면 안 된다
 *
 * 동전을 다루는 조각이지만 **던지는 일은 이 파일에 없다.** 던진 결과는
 * `initialData.flips` 에 이미 적혀 있고 algorithm 이 그것을 payload 로 실어 온다.
 * `reduce` 는 받아 적기만 한다.
 *
 * 이 대목이 급소다. `Math.random()` 이 `initial` 이나 `reduce` 에 한 줄이라도
 * 들어가면 되짚을 때마다 다른 나무가 나온다 — 띠를 왼쪽으로 끌었다 오른쪽으로
 * 돌아오면 아까와 다른 높이의 기둥이 서고, 조각의 주장("아무도 모양을 관리하지
 * 않는데 층마다 절반이 남는다") 이 그림에서 확인 불가능해진다. `reduce` 의
 * 순수성은 S-scene 의 MUST 다.
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **네 자리**에 흩어져 있었다.
 *
 * - `const blocks: Block[]` — `{ node, col, level }`. DOM 손잡이와 "어느 값이
 *   어느 칸 어느 층에 앉았나" 가 한 몸이라, 되감으면 통째로 어긋났다 (`const`
 *   라 `let` grep 에 걸리지 않는 자리).
 * - `levelLabels: Map<number, SVGTextElement>` — 어느 층이 이미 생겼나. `.has()`
 *   조회로 갈리는 암묵 분기였다.
 * - `let lastCounts: number[]` — 층별 셈. `markHalves` 가 이것을 읽어 점선을
 *   그었고, 비어 있으면 아무것도 그리지 않았다.
 * - **모은 뒤인가 아닌가는 어디에도 적혀 있지 않았다.** `packLevels` 가 블록의
 *   `transform` 을 왼쪽으로 옮겨 놓은 것이 전부였다. 즉 그 사실은 DOM 좌표에만
 *   있었고, 되짚어 세운 화면은 그것을 알 길이 없었다.
 *
 * 여기서는 그 넷이 `towers` · `phase` 둘이다.
 *
 * ── 수는 한 출처에서만 나온다 — 던진 자취
 *
 * 1차 자료는 **동전 결과**다 (algorithm 의 머리말도 같은 말을 한다). 그래서
 * 장면이 쥐는 것은 `flips` 이고, 높이도 층별 셈도 거기서 **센다.**
 *
 * - **`payload.height` 와 `payload.heads` 를 받지 않는다.** 높이는
 *   `heightOf(flips, maxLevels)` 가 앞면이 이어지는 만큼 세어 얻는다. payload 의
 *   수와 함께 쓰면 두 자리에서 세는 꼴이 되어 언젠가 갈린다.
 * - **`level-counts` 의 `counts` 도 받지 않는다.** 층 L 에 놓이는 것은 높이가 L
 *   보다 큰 기둥이므로 `levelCountsOf` 가 `towers` 에서 센다. 그러니 층 옆에 선
 *   수는 실제로 그 층에 그려진 블록의 수 그 자체이고, 화면이 제 안에서 참이다
 *   (`depth-doubles-count` 가 합을 버린 것과 같은 갈래).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸의 폭도 층의 간격도 캔버스에서 역산하는 값이라 그리는
 * 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지는 `towers` 와
 * `phase` 가 이미 정하므로 캡션 필드를 두지 않고, 문자는 그리는 쪽이 `params.t`
 * 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 동전의 면. algorithm 의 `CoinFace` 와 같은 어휘다. */
export type CoinToss = 'H' | 'T';

/**
 * 그림이 세울 수 있는 층의 상한.
 *
 * 선언이 이보다 큰 수를 주어도 여기서 멈춘다. 층의 세로 간격은 캔버스 높이를
 * 층 수로 나눈 것이라 이 위로는 블록이 서로 겹친다. **장면이 이 상한을 쥐는
 * 것이 요점이다** — 높이를 세는 쪽과 그리는 쪽이 같은 수를 보아야 층 옆의 셈과
 * 실제로 그려진 블록의 수가 갈리지 않는다.
 */
export const MAX_LEVEL_CAP = 6;

/** 값 하나가 세운 기둥. 높이는 여기 적지 않는다 — `flips` 에서 센다. */
export type CoinTower = {
  value: number;
  /** 그 값에서 실제로 던진 동전 결과. 앞이 이어지는 동안 층이 오른다. */
  flips: readonly CoinToss[];
};

/**
 * 어디까지 왔나. 걸음이 되돌아오지 않는 방향이라 하나로 잇는다.
 *
 * `step` 과 겹쳐 보이지만 뜻이 다르다 — `phase` 는 서면 남는 형편이고 `step` 은
 * 한 걸음짜리 운동이다. 되짚은 화면은 `phase` 로 서고 `step` 은 무시된다.
 */
export type CoinFlipHeightPhase = 'stacking' | 'packed' | 'halved';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 */
export type CoinFlipHeightStep = 'stack' | 'pack' | 'halve';

export type CoinFlipHeightScene = {
  /**
   * 층의 상한 — 앞이 계속 나와도 여기서 멈춘다.
   *
   * **걸음이 고치지 않는 바탕이다.** 선언이 정하고 자취가 아니므로 되감아도
   * 남는다. 그래서 `atStart` 가 이것만 받는다.
   */
  maxLevels: number;
  /**
   * 세운 기둥들. **순서가 곧 칸 번호**다.
   *
   * 화면의 모든 수가 여기서 나온다 — 기둥의 높이도, 층별 셈도, 캡션의 인자도,
   * 실제로 그리는 블록의 개수도.
   */
  towers: readonly CoinTower[];
  phase: CoinFlipHeightPhase;
  step: CoinFlipHeightStep | null;
};

/** 걸음이 고치지 않는 바탕. 자취(`towers` · `phase`) 를 여기 넣지 않는다. */
type Base = Pick<CoinFlipHeightScene, 'maxLevels'>;

/**
 * 되돌린 뒤의 장면.
 *
 * 바탕은 `maxLevels` 하나다. 기둥도 모은 여부도 전부 걸어온 자취라 되감기를
 * 타고 넘어가면 안 된다. 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체
 * 리터럴로 넘긴다** — 변수를 넘기면 초과 속성 검사가 돌지 않아 장면 전체가
 * 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): CoinFlipHeightScene {
  return { maxLevels: base.maxLevels, towers: [], phase: 'stacking', step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 던진 결과만 골라 낸다. 그 밖의 것이 섞여 있으면 흘린다. */
function tosses(v: unknown): readonly CoinToss[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter((f): f is CoinToss => f === 'H' || f === 'T');
}

/** 선언이 준 상한을 그림이 세울 수 있는 범위로 좁힌다. */
function readMaxLevels(initialData: unknown): number {
  const d = (initialData ?? {}) as Record<string, unknown>;
  const raw = num(d.maxLevels);
  if (raw === null) return 4;
  return Math.max(1, Math.min(MAX_LEVEL_CAP, Math.trunc(raw)));
}

/**
 * 던진 자취에서 층을 센다.
 *
 * 앞면이 이어지는 동안 한 층씩 올리고, 뒷면이 나오면 거기서 멈춘다. 상한에
 * 걸려 쓰이지 못한 앞면은 세지 않는다 — algorithm 의 `heightOf` 와 같은 규칙을
 * 같은 자료 위에서 다시 세는 것이고, **베끼는 것이 아니라 세는 것**이다.
 */
export function heightOf(flips: readonly CoinToss[], maxLevels: number): number {
  let height = 1;
  for (const face of flips) {
    if (face !== 'H' || height >= maxLevels) break;
    height += 1;
  }
  return height;
}

/**
 * 층 0 부터 꼭대기까지의 노드 수.
 *
 * 층 L 에 놓이는 것은 **높이가 L 보다 큰 기둥**이다. `level-counts` 가 실어 온
 * `counts` 를 쓰지 않고 여기서 세므로, 층 옆에 선 수는 그 층에 실제로 그려진
 * 블록의 수와 언제나 같다.
 */
export function levelCountsOf(scene: CoinFlipHeightScene): number[] {
  if (scene.towers.length === 0) return [];
  const heights = scene.towers.map((tower) => heightOf(tower.flips, scene.maxLevels));
  let top = 1;
  for (const h of heights) if (h > top) top = h;
  const counts: number[] = [];
  for (let level = 0; level < top; level += 1) {
    let n = 0;
    for (const h of heights) if (h > level) n += 1;
    counts.push(n);
  }
  return counts;
}

export const coinFlipHeightScene: ScenePlan<CoinFlipHeightScene> = {
  /**
   * 첫 장면 — 아직 아무 기둥도 서지 않았다.
   *
   * `initialData` 에서 꺼내는 것은 `maxLevels` **하나뿐이고 수를 복사한다.**
   * `values` 와 `flips` 는 mechanism 과 view 가 함께 쥔 배열이라 참조로 담으면
   * 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene). 둘은 `stack`
   * 이벤트가 걸음마다 실어 온다.
   */
  initial(initialData: unknown): CoinFlipHeightScene {
    return atStart({ maxLevels: readMaxLevels(initialData) });
  },

  reduce(scene: CoinFlipHeightScene, event: FacetRuntimeEvent): CoinFlipHeightScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'stack': {
        const index = num(p.index);
        const value = num(p.value);
        if (index === null || value === null) return scene;
        // 칸 번호가 곧 자리 번호다. 이어지지 않는 칸이 오면 그릴 것이 없다 —
        // 가운데가 빈 줄을 그리느니 조용히 흘린다 (C2).
        if (index !== scene.towers.length) return scene;
        // `p.height` 와 `p.heads` 는 버린다. 높이는 `flips` 에서 센다.
        return {
          ...scene,
          towers: [...scene.towers, { value, flips: tosses(p.flips) }],
          step: 'stack',
        };
      }

      case 'level-counts': {
        if (scene.towers.length === 0) return scene;
        // `p.counts` 도 버린다. 층별 셈은 `levelCountsOf` 가 기둥에서 센다.
        return { ...scene, phase: 'packed', step: 'pack' };
      }

      case 'done': {
        if (scene.phase !== 'packed') return scene;
        return { ...scene, phase: 'halved', step: 'halve' };
      }

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다.
        return atStart({ maxLevels: scene.maxLevels });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 나머지는 조용히 흘린다 (C2).
        return scene;
    }
  },
};
