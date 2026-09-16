/**
 * AverageTheBuckets 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 장면은 왜 이렇게 얇은가
 *
 * 걸음 여섯이 한 논증을 순서대로 쌓는다 — 키가 서고, 통 하나에 담기고, 그 답을
 * 재고, 넷으로 갈리고, 통마다 답을 재고, 넷이 모인다. **되돌아가는 걸음도 갈래도
 * 없다.** 그래서 "어디까지 왔나" 하나를 알면 그 걸음의 화면이 통째로 정해진다.
 *
 * 그것을 `phase` 로 담는다. 별도의 `step` 필드를 두지 않는 까닭도 같다 — 방금
 * 들어선 phase 가 곧 무엇을 흐르게 할지 말하므로, `step` 을 따로 두면 같은 것을
 * 두 자리에 적는 꼴이 된다. 캡션도 phase 에서 나온다.
 *
 * ── 화면에 나란히 뜨는 수는 전부 여기서 셈한다
 *
 * 이 조각은 HyperLogLog 의 셈을 보이는 것이라 **수가 화면에 여럿 나란히 뜬다** —
 * 통마다의 ρ, 통 하나의 답, 통별 답 넷, 그 넷을 모은 값, 참값. 그중 하나라도
 * payload 에서 받으면 그 수와 화면의 구조가 다른 출처가 되어 언젠가 갈린다.
 *
 * 그래서 **algorithm 은 걸음 어휘만 발신하고 payload 를 싣지 않는다.** 위 다섯
 * 수는 전부 `keys` 와 `bucketCount` 에서 아래 함수들이 센다. 통에 물든 칸의
 * 색·금의 높이·칩의 문자가 같은 함수를 지나므로 그림이 제 안에서 어긋날 자리가
 * 없다. 옮기기 전에는 `maxima` · `estimates` · 조화평균 · 참값을 algorithm 이
 * 셈해 실어 보냈고, 조화평균 상수 `ALPHA` 도 거기 있었다.
 *
 * ── 담지 않는 것
 *
 * 좌표는 담지 않는다. 통 번호와 ρ 라는 **구조**만 담고, 칸 폭도 층 간격도 자의
 * 눈금도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지
 * 않는다 — 무엇을 말할지는 phase 가 말하고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 키 하나. 통 번호와 ρ 가 곧 가로·세로 자리를 정한다. */
export type BucketKey = { id: string; bucket: number; rho: number };

/**
 * 논증이 어디까지 왔나. 이것 하나가 그 걸음의 화면을 통째로 정한다.
 *
 * 순서가 있는 어휘다 — 뒤의 것은 앞의 것이 세운 화면을 그대로 안고 간다. 그리는
 * 쪽이 `reached` 로 견준다.
 */
export type AverageTheBucketsPhase =
  /** 아무것도 없다. 빈 통 하나만 서 있다. */
  | 'empty'
  /** 키가 한 줄로 섰다. */
  | 'streamed'
  /** 통 하나에 전부 담기고 가장 큰 ρ 에 물금이 섰다. */
  | 'poured'
  /** 통 하나의 답이 자 위에 앉았다. 참값 금도 함께 섰다. */
  | 'read'
  /** 벽이 내려와 넷으로 갈렸고 키가 제 통에 갇혔다. */
  | 'split'
  /** 통마다 제 높이로 금이 서고 제 답이 자 위에 앉았다. */
  | 'settled'
  /** 넷이 한 자리에 모였다. */
  | 'gathered';

/** phase 의 차례. 견주는 잣대를 여기 하나로 둔다. */
const PHASE_ORDER: readonly AverageTheBucketsPhase[] = [
  'empty',
  'streamed',
  'poured',
  'read',
  'split',
  'settled',
  'gathered',
];

/** `phase` 가 `mark` 까지 왔나 — 정적 그리기가 무엇을 세울지 가리는 잣대. */
export function reached(phase: AverageTheBucketsPhase, mark: AverageTheBucketsPhase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(mark);
}

export type AverageTheBucketsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 키들. 통 번호와 ρ 가 화면의 모든 수의 원천이다. */
  keys: readonly BucketKey[];
  /** 통 개수. 나뉜 뒤의 벽 수이고 조화평균의 m 이다. */
  bucketCount: number;

  // ── 자취. 걸음이 밀고 `rewind` 가 처음으로 돌린다.
  phase: AverageTheBucketsPhase;
};

/**
 * 치우침 보정 상수.
 *
 * HyperLogLog 가 통 열여섯에 쓰는 0.673 을 그대로 빌린다. 통이 넷인 구간은 표준이
 * 상수를 따로 정해 두지 않았고, 이 조각이 말하려는 것은 상수의 값이 아니라
 * **큰 값에 덜 끌리는 평균**이다. 이 전제는 description.ts 가 밝힌다.
 *
 * 옮기기 전에는 algorithm 에 있었다. 셈이 화면 쪽으로 온 김에 상수도 함께 왔다 —
 * 조화평균을 셈하는 자리가 하나뿐이어야 한다.
 */
const ALPHA = 0.673;

/** 통마다 남는 ρ — 들어온 것 중 가장 큰 것 하나. 금의 높이가 이 수다. */
export function maximaOf(keys: readonly BucketKey[], bucketCount: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < bucketCount; b += 1) out.push(0);
  for (const k of keys) {
    if (k.bucket < 0 || k.bucket >= bucketCount) continue;
    if (k.rho > out[k.bucket]) out[k.bucket] = k.rho;
  }
  return out;
}

/** 전체를 끌고 가는 그 한 칸. 통이 하나일 때의 답이 이것 하나로 정해진다. */
export type Spike = {
  /** `keys` 안의 차례. 없으면 -1. */
  index: number;
  bucket: number;
  rho: number;
};

/**
 * 가장 큰 ρ 를 가진 칸.
 *
 * 전체 최댓값을 따로 세지 않는다 — 그 수는 `spikeOf(keys).rho` 다. 두 함수로
 * 나누면 같은 수를 두 자리에서 세는 꼴이 된다.
 */
export function spikeOf(keys: readonly BucketKey[]): Spike {
  let best: Spike = { index: -1, bucket: 0, rho: 0 };
  keys.forEach((k, i) => {
    if (k.rho > best.rho) best = { index: i, bucket: k.bucket, rho: k.rho };
  });
  return best;
}

/** ρ 하나가 내놓는 답. 통이 하나든 넷이든 이 한 함수를 지난다. */
export const estimateOf = (rho: number): number => 2 ** rho;

/** 통마다 혼자 답하면 얼마인가. 자 위에 떨어지는 칩 넷의 값이다. */
export function estimatesOf(maxima: readonly number[]): number[] {
  return maxima.map(estimateOf);
}

/**
 * 넷을 모은 값 — 조화평균. 역수의 합으로 나누므로 큰 값의 역수가 작아 덜 끌린다.
 *
 * 이 조각의 결론이 이 수 하나다. 화면의 칩과 캡션이 같은 함수를 지난다.
 */
export function gatheredOf(maxima: readonly number[]): number {
  const m = maxima.length;
  if (m === 0) return 0;
  let invSum = 0;
  for (const r of maxima) invSum += 2 ** -r;
  return invSum === 0 ? 0 : (ALPHA * m * m) / invSum;
}

/** 참값 — 줄을 선 키의 수. 자 위의 점선이 이 자리에 선다. */
export const truthOf = (keys: readonly BucketKey[]): number => keys.length;

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `phase` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 갈린 통과
 * 앉은 칩을 단 채로 선다 (S-scene · 프로토콜 4 절).
 */
type Base = Pick<AverageTheBucketsScene, 'keys' | 'bucketCount'>;

/**
 * 되돌린 뒤의 장면 — 빈 통 하나만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 `phase` 가 실린 장면도 그대로 통과한다
 * (S-scene).
 */
function atStart(base: Base): AverageTheBucketsScene {
  return { keys: base.keys, bucketCount: base.bucketCount, phase: 'empty' };
}

/**
 * `initialData` → 바탕. 생산자가 같은 패키지라도 경계는 경계다 (C9).
 *
 * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
 * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
 * (S-scene). 여기서 새 배열을 낸다.
 */
function readBase(initialData: unknown): Base {
  const d = (typeof initialData === 'object' && initialData !== null ? initialData : {}) as Record<
    string,
    unknown
  >;
  const rawCount = d.bucketCount;
  const bucketCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
      ? Math.floor(rawCount)
      : 1;
  const raw = Array.isArray(d.keys) ? d.keys : [];
  const keys: BucketKey[] = [];
  for (const item of raw) {
    const k = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof k.id === 'string' ? k.id : '';
    const bucket =
      typeof k.bucket === 'number' && Number.isFinite(k.bucket) ? Math.floor(k.bucket) : -1;
    const rho = typeof k.rho === 'number' && Number.isFinite(k.rho) ? Math.floor(k.rho) : 0;
    if (id === '' || bucket < 0 || bucket >= bucketCount || rho < 1) continue;
    keys.push({ id, bucket, rho });
  }
  return { keys, bucketCount };
}

/** phase 를 밀어 둔 새 장면. 앞 장면을 제자리에서 고치지 않는다 (S-scene). */
function at(
  scene: AverageTheBucketsScene,
  phase: AverageTheBucketsPhase,
): AverageTheBucketsScene {
  return { ...scene, phase };
}

export const averageTheBucketsScene: ScenePlan<AverageTheBucketsScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 빈 통과 자의
   * 테두리는 첫 그림부터 서 있어야 하고, 그것을 정하는 것은 `bucketCount` 하나다.
   */
  initial(initialData: unknown): AverageTheBucketsScene {
    return atStart(readBase(initialData));
  },

  /**
   * 걸음 하나를 얹는다.
   *
   * **payload 를 하나도 읽지 않는다.** 걸음의 이름이 phase 를 정하고, 화면에 뜨는
   * 수는 전부 바탕에서 셈한다 (위 "화면에 나란히 뜨는 수"). algorithm 도 이제
   * payload 를 싣지 않으므로 여기서 집어 쓸 문 자체가 없다.
   */
  reduce(scene: AverageTheBucketsScene, event: FacetRuntimeEvent): AverageTheBucketsScene {
    switch (event.type) {
      // 키 열여섯이 줄을 선다.
      case 'stream':
        return at(scene, 'streamed');

      // 통 하나에 전부 담긴다. 가장 큰 ρ 에 물금이 뻗는다.
      case 'pour':
        return at(scene, 'poured');

      // 통 하나의 답이 물금에서 떨어져 자 위에 앉는다.
      case 'read-single':
        return at(scene, 'read');

      // 벽이 내려와 통이 넷으로 갈린다. 키가 제 통에 갇힌다.
      case 'split':
        return at(scene, 'split');

      // 통마다 제 금이 서고 제 답이 자 위로 떨어진다.
      case 'settle':
        return at(scene, 'settled');

      // 넷이 눈금을 따라 서로에게 미끄러져 한 자리에 모인다.
      case 'gather':
        return at(scene, 'gathered');

      // 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다. 객체 리터럴로 넘긴다.
      case 'rewind':
        return atStart({ keys: scene.keys, bucketCount: scene.bucketCount });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
