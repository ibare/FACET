/**
 * DirectionOfMostSpread 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고, 조회로 갈리는 분기도 DOM 되읽기도
 * 없었다. **상태는 열 자리가 전부 stage 에 있었다** (`let` 열 개).
 *
 * - `let cx` · `let cy` — 축이 지날 가운데. 걸음이 실어 온 것을 stage 가 적어
 *   두고 그 뒤의 모든 프레임이 그것을 썼다. 그런데 그 값은 **점의 평균**이라
 *   바탕에서 곧바로 나온다. 지금은 `centerOf(scene)` 가 매번 셈한다.
 * - `let total` — 합. 이것도 `variance + across` 라 더하면 나온다. 곡선의 세로
 *   눈금(`plotY`)이 통째로 여기서 나왔으므로 **화면의 모든 세로 자리를 쥔
 *   척도**이기도 했다. 지금은 `totalOf(scene)` 가 낸다.
 * - `let angleDeg` — **지금 축이 몇 도인가.** `getAttribute` 를 쓰지 않아 되읽기
 *   grep 을 통과하는데, `turnTo` 와 `narrowTo` 가 이 값을 운동의 **출발값**으로
 *   읽었다 (`const fromDeg = angleDeg`). 되짚어 세운 직후에는 그것이 **옛 화면의
 *   각도**라 축이 엉뚱한 자세에서 돌기 시작한다 — DOM 의 거울이다. 지금은
 *   `axisAngleOf(scene)` 가 자취에서 되찾고, 출발 자세도 **자취의 바로 앞 칸**이
 *   말한다 (`prev` 를 읽지 않는다 — S-scene).
 * - `let drop` · `let mateGrow` — 0 에서 1 로 자라는 **운동의 진행도**를 걸음
 *   사이에 적어 둔 자리. 걸음이 끝나면 늘 1 이므로 사실은 국면 둘이었다.
 *   지금은 `turns.length > 0`(자국이 내려앉았나) 과 `settled`(직각 축을
 *   내보였나) 가 그 말을 한다.
 * - `const coarse: Array<{ deg, value }>` — **성긴 훑기의 자취 그 자체.** `const`
 *   라 `let` grep 을 통과하는데 `commit()` 이 `push` 로 제자리에서 늘렸고,
 *   `rewind` 가 `coarse.length = 0` 으로 털었다. 곧 "열두 각도를 짚어 보았다" 는
 *   이 조각의 논증이 stage 의 배열 하나에만 살고 있었다. 지금은 `turns` 다.
 * - `let fineAngles` · `let fineValues` — 촘촘한 곡선. 위와 같은 자리다.
 * - `let tracing` — 자취가 아직 읽개를 따라 자라는가. `curve === null` 이 그
 *   말을 한다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다
 *
 * 옛 발신은 `done` 에 `share` 를 실었다 — **"가장 넓은 방향이 합의 몇 할인가" 를
 * algorithm 이 적어 보내고 화면은 그대로 받아 적었다.** 지금은 `shareOf` 가
 * 장면에 쌓인 봉우리의 두 수를 나눈다. 막대를 가르는 수와 캡션이 말하는 수가
 * 같은 자리에서 나오므로 갈릴 곳이 없다.
 *
 * 그리고 **봉우리가 정말 가장 높은가**를 `peakBeatsSweep` 이 실제로 견준다. 이
 * 조각의 이름에 실린 무게는 `가장` 에 있는데, 옛 화면은 그것을 재어 보지 않고
 * 봉우리에 표를 달았다.
 *
 * ── 그래도 싣는 것
 *
 * `variance` 와 `across` 는 **한 방향으로 내려 찍은 자국의 분산**이라 이 조각의
 * 알고리즘 그 자체다. 함수를 내주어 장면이 부르게 하면 장면이 조각을 되풀이하는
 * 꼴이 된다 (프로토콜 4 절 B 갈래의 경계). 촘촘한 곡선의 값들도 같은 셈이라
 * 싣는다. 봉우리의 `angleDeg` 도 삼분 탐색이 수렴한 자리라 싣는다.
 *
 * 반대로 **바탕에서 곧바로 나오는 것**은 걷어냈다 — 가운데(점의 평균) · 합(둘의
 * 합) · 몫(둘의 비) · 그리고 **몇 번째 각도인가**. 성긴 훑기가 짚는 각도는
 * `coarseAngles()` 가 간격에서 내주므로 온 차례가 곧 각도다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 재어 낸 퍼짐이라는 **구조**만 담고 화면 자리는
 * 그리는 쪽이 셈한다 (S-piece). 문안도 담지 않는다 — 장면의 형편이 무엇을 말할지
 * 정하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { coarseAngles, readSpreadPoints, type SpreadPoint } from './algorithm.js';

export type { SpreadPoint };

/** 한 방향에서 재어 낸 두 값. 축 방향의 퍼짐과 그 직각 방향의 퍼짐. */
export type SpreadReading = { variance: number; across: number };

/** 좁혀 들어가 짚은 봉우리. 각도는 삼분 탐색이 수렴한 자리다. */
export type SpreadPeak = { angleDeg: number; variance: number; across: number };

/** 촘촘히 다시 잰 곡선. 같은 길이의 평행 배열이다. */
export type SpreadCurve = { angles: readonly number[]; values: readonly number[] };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 무엇을 다루는지는 `turns` · `peak` · `settled` 가 이미 말하므로 여기 다시
 * 적지 않는다. 출발 자세도 적지 않는다 — 자취가 쌓이는 배열이라 **바로 앞 칸**이
 * 곧 출발 자세다.
 */
export type DirectionOfMostSpreadStep =
  /** 고리가 조여들며 무리의 가운데를 짚는다. */
  | { kind: 'center' }
  /** 축이 한 칸 더 돌고, 자국이 그 축으로 내려앉는다. */
  | { kind: 'turn' }
  /** 성긴 자국 사이가 촘촘히 메워지고 축이 봉우리로 되돌아간다. */
  | { kind: 'narrow' }
  /** 직각 방향의 축과 그 자국이 함께 자란다. */
  | { kind: 'settle' };

export type DirectionOfMostSpreadScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 점 무리. 가운데도 축척도 전부 여기서 나온다. */
  points: readonly SpreadPoint[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 가운데를 짚었나. */
  centered: boolean;
  /** 성긴 훑기가 재어 낸 값. **온 차례가 곧 각도의 번호다.** */
  turns: readonly SpreadReading[];
  /** 좁혀 들어가 짚은 봉우리. 없으면 아직 성긴 훑기 중이다. */
  peak: SpreadPeak | null;
  /** 촘촘한 곡선. 봉우리와 함께 온다. */
  curve: SpreadCurve | null;
  /** 직각 방향까지 내보였나. */
  settled: boolean;

  step: DirectionOfMostSpreadStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `turns` 도 `peak` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 그려진 곡선을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 재는 것이
 * 겹친다 (S-scene).
 */
type Base = Pick<DirectionOfMostSpreadScene, 'points'>;

/**
 * 아무것도 재지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): DirectionOfMostSpreadScene {
  return {
    points: base.points,
    centered: false,
    turns: [],
    peak: null,
    curve: null,
    settled: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

/** 발신이 실은 두 측정값. 하나라도 수가 아니면 그 걸음이 조용히 흘러간다 (C2). */
function readReading(payload: unknown): SpreadReading | null {
  const p = fields(payload);
  if (p === null) return null;
  const variance = num(p.variance);
  const across = num(p.across);
  return variance === null || across === null ? null : { variance, across };
}

/** 평행 배열 한 짝. 길이가 어긋나면 곡선이 거짓이 되므로 통째로 흘린다 (C2). */
function readCurve(payload: unknown): SpreadCurve | null {
  const p = fields(payload);
  if (p === null || !Array.isArray(p.curveAngles) || !Array.isArray(p.curveValues)) return null;
  if (p.curveAngles.length !== p.curveValues.length || p.curveAngles.length < 2) return null;
  const angles: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < p.curveAngles.length; i += 1) {
    const a = num(p.curveAngles[i]);
    const v = num(p.curveValues[i]);
    if (a === null || v === null) return null;
    angles.push(a);
    values.push(v);
  }
  return { angles, values };
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수와 이 조각의 결론이 전부 여기를 지난다. 그림을 그리는 수와
// 캡션이 말하는 수가 같은 자리에서 나오므로 갈릴 곳이 없다.

/**
 * 축이 지나는 가운데 — 점의 평균.
 *
 * 걸음이 실어 오던 것을 걷어냈다. 바탕에서 곧바로 나오는 값이라 장면이 센다.
 */
export function centerOf(scene: DirectionOfMostSpreadScene): SpreadPoint | null {
  const n = scene.points.length;
  if (n === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of scene.points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / n, y: sy / n };
}

/** 성긴 훑기의 `index` 번째 각도. 표는 간격에서 나오므로 두 벌이 없다. */
export function turnAngleAt(index: number): number {
  return coarseAngles()[index] ?? 0;
}

/** 성긴 훑기가 짚을 각도의 수. 곡선의 가로 폭이 아니라 걸음 수를 말한다. */
export function sweepCount(): number {
  return coarseAngles().length;
}

/** 지금 축이 선 각도. 아직 아무 방향도 재지 않았으면 null. */
export function axisAngleOf(scene: DirectionOfMostSpreadScene): number | null {
  if (scene.peak !== null) return scene.peak.angleDeg;
  if (scene.turns.length === 0) return null;
  return turnAngleAt(scene.turns.length - 1);
}

/** 지금 화면이 내보이는 두 값. 아직 아무것도 재지 않았으면 null. */
export function readingOf(scene: DirectionOfMostSpreadScene): SpreadReading | null {
  if (scene.peak !== null) {
    return { variance: scene.peak.variance, across: scene.peak.across };
  }
  return scene.turns.at(-1) ?? null;
}

/**
 * 둘의 합. 어느 각도에서 재든 같아야 한다는 것이 곁들여 드러나는 주장이므로,
 * **가정하지 않고 실제로 재어 온 두 수를 더한다.**
 */
export function totalOf(scene: DirectionOfMostSpreadScene): number {
  const r = readingOf(scene);
  return r === null ? 0 : r.variance + r.across;
}

/**
 * 가장 넓은 쪽이 합에서 차지하는 몫 (백분율).
 *
 * **이 조각의 결론이다.** 옛 발신이 적어 보내던 것을 여기로 옮겼다 — 막대를
 * 가르는 수와 캡션이 말하는 수가 이제 한 자리에서 나온다.
 */
export function shareOf(scene: DirectionOfMostSpreadScene): number | null {
  const peak = scene.peak;
  if (peak === null) return null;
  const total = peak.variance + peak.across;
  return total > 0 ? (peak.variance / total) * 100 : null;
}

/**
 * 봉우리가 훑어 본 어느 각도보다 높은가.
 *
 * 이 조각의 이름에 실린 무게는 **가장** 에 있다. 짚어 본 각도들이 *덜 퍼졌다*는
 * 것을 화면이 표식으로 말하려면 먼저 실제로 견주어야 한다 — 지금 자료에서
 * 참이어도 자료가 바뀌면 거짓이 될 수 있으므로 매번 견준다.
 */
export function peakBeatsSweep(scene: DirectionOfMostSpreadScene): boolean {
  const peak = scene.peak;
  if (peak === null) return false;
  for (const turn of scene.turns) {
    if (turn.variance > peak.variance) return false;
  }
  for (const v of scene.curve?.values ?? []) {
    if (v > peak.variance) return false;
  }
  return true;
}

export const directionOfMostSpreadScene: ScenePlan<DirectionOfMostSpreadScene> = {
  /**
   * 첫 장면은 점 무리만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 좁히는
   * 규칙은 algorithm 이 내준 한 벌을 쓰고, 넘겨받은 배열을 참조로 쥐지 않는다
   * (S-scene).
   */
  initial(initialData: unknown): DirectionOfMostSpreadScene {
    return atStart({ points: readSpreadPoints(initialData) });
  },

  reduce(
    scene: DirectionOfMostSpreadScene,
    event: FacetRuntimeEvent,
  ): DirectionOfMostSpreadScene {
    switch (event.type) {
      /* 축이 지날 가운데를 잡았다. 어디인지는 점이 안다. */
      case 'center-found':
        return { ...scene, centered: true, step: { kind: 'center' } };

      /* 축을 한 칸 더 돌려 재었다. 온 차례가 곧 각도다. */
      case 'axis-turn': {
        const reading = readReading(event.payload);
        // 각도표를 넘어서는 걸음은 앉을 자리가 없다. 조용히 흘린다 (C2).
        if (reading === null || scene.turns.length >= sweepCount()) return scene;
        return {
          ...scene,
          centered: true,
          turns: [...scene.turns, reading],
          step: { kind: 'turn' },
        };
      }

      /* 촘촘히 다시 재어 봉우리를 짚었다. */
      case 'narrow': {
        const p = fields(event.payload);
        const angleDeg = p === null ? null : num(p.angleDeg);
        const reading = readReading(event.payload);
        const curve = readCurve(event.payload);
        if (angleDeg === null || reading === null || curve === null) return scene;
        return {
          ...scene,
          centered: true,
          peak: { angleDeg, variance: reading.variance, across: reading.across },
          curve,
          step: { kind: 'narrow' },
        };
      }

      /* 멈춘 자리에서 직각 방향을 함께 내보인다. 어느 자리인지는 봉우리가 안다. */
      case 'done':
        return scene.peak === null ? scene : { ...scene, settled: true, step: { kind: 'settle' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
