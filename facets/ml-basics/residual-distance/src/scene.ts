/**
 * ResidualDistance 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었다. **상태는 전부 stage 에 있었다.**
 *
 * - `let kx` · `let ky` · `let domX0` · `let domX1` · `let domY1` — **축의 척도.**
 *   `px` · `py` 가 이 넷으로 자리를 셈하므로 **화면의 모든 좌표가 여기서 나왔다.**
 *   `setScene` 이 실어 온 것을 stage 가 제 변수에 옮겨 적어 두고 그 뒤로 계속 쓰는
 *   짜임이라, 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다. 지금은 장면이 값의
 *   범위(계수와 점)만 말하고 척도는 그리는 쪽이 매번 셈한다.
 * - `let dirX` · `let dirY` — 직선 방향의 단위 벡터. 위와 같은 자리이고 수선의 발이
 *   거기서 나왔다. 지금은 `layoutOf` 가 함께 낸다.
 * - `let scene` — stage 가 쥔 바탕 자료 사본. 러너가 주는 것과 두 벌이었다.
 * - `let ring` 의 `cx`/`cy` — **DOM 되읽기.** `moveRing` 이 고리가 지금 선 자리를
 *   화면에서 꺼내 다음 운동의 **출발값**으로 삼았다. 되짚어 세운 직후에는 그것이
 *   옛 화면의 자리라 고리가 엉뚱한 데서 출발한다. 지금은 `step.from` 이 어느 점에서
 *   걸어오는지 말하고 자리는 그리는 쪽이 셈한다.
 * - `let probeRadius` 의 `x2`/`y2` — 같은 병. 돌려세우는 운동의 출발 각과 길이를
 *   수선 선분의 끝점을 **되읽어** 냈다. 지금은 `footOf` 가 기하로 셈한다.
 * - `let probeCircle` 의 `stroke-opacity`, `let probeAngle` 의 **있고 없음** —
 *   *최단거리 후보를 아직 보이는 중인가, 이미 기각했는가.* 어떤 변수도 그것을
 *   말하지 않고 두 DOM 손잡이의 형편이 유일한 보관처였다. 지금은 `probe.turned` 다.
 * - `const bars: SVGLineElement[]` — **어느 점에 막대가 꽂혔나.** `const` 라 `let`
 *   grep 을 통과하는데 `land()` 가 `bars.push` 로 알맹이를 제자리에서 늘렸고,
 *   `markDone` 이 `[...bars]` 로 그것을 읽어 함께 두드렸다. DOM 손잡이와 조각의
 *   자취가 한 배열이었다. 지금은 `planted` 가 점의 색인만 쌓는다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 옛 발신은 `predicted` 와 `residual` 을 실어 보냈는데, stage 는 직선을 그리느라
 * 이미 `lineAt` 으로 같은 값을 셈하고 있었다 — **같은 물음에 답이 둘**이었다.
 * 지금은 `algorithm.ts` 가 내준 `lineValueAt` · `residualAt` 한 쌍만 지난다
 * (프로토콜 4 절의 B 갈래). 직선도 막대의 발끝도 캡션의 부호도 같은 자료를 쓴다.
 *
 * 내주어도 되는 까닭은 그 함수가 이 조각의 알고리즘이 아니기 때문이다. 직선은
 * 고정이고 학습하지 않는다 — 이 조각이 말하는 것은 **어느 방향으로 재는가**이지
 * 직선을 어떻게 찾는가가 아니다. 떼어 내도 주장이 남는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 계수와 점이라는 **구조**만 담고 화면 자리는 그리는 쪽이
 * 셈한다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을 말할지만 말하고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은
 * `step` 과 캡션의 갈래가 1 대 1 이기 때문이다 (부호로 갈리는 한 자리도 잔차에서
 * 곧바로 나온다).
 */

import { toIndexArray } from '@ffacet/core/runtime';
import type { FacetEventTarget, FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { lineValueAt, residualAt } from './algorithm.js';

/** 관측점 하나. 값이지 자리가 아니다. */
export type ResidualPt = { x: number; y: number };

/** 최단거리 후보. `turned` 가 켜지면 기각된 것이라 옅은 유령으로 남는다. */
export type ResidualProbe = {
  /** 어느 점에서 보였나. */
  index: number;
  /** 세로로 돌려세웠나. 돌려세운 뒤에는 직각 표시를 거두고 원을 옅게 한다. */
  turned: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 어느 점을 다루는지는 `cursor` 가 이미 말하므로 여기 다시 적지 않는다.
 */
export type ResidualStep =
  /** 한 점을 짚는다. 고리가 오므라들며 자리를 잡는다. */
  | { kind: 'focus' }
  /** 최단거리를 보인다. 원이 자라 직선에 닿는다. */
  | { kind: 'perpendicular' }
  /** 그것을 세로로 돌려세운다. 막대가 원을 뚫고 나가 직선에 닿는다. */
  | { kind: 'turn' }
  /**
   * 세로로 내려꽂는다.
   *
   * `from` 은 고리가 걸어오는 점이다. 화면을 되읽지 않으려고 장면이 말한다 —
   * 되짚어 세운 직후의 화면은 옛 걸음의 것이라 출발 자리를 거기서 꺼내면 어긋난다
   * (S-scene: `prev` 는 고르는 데만).
   */
  | { kind: 'drop'; from: number | null }
  /** 다 꽂혔다. 고리를 거두고 꽂힌 것들을 함께 한 번 두드린다. */
  | { kind: 'done' };

export type ResidualDistanceScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 고정된 직선의 기울기. */
  slope: number;
  /** 고정된 직선의 절편. */
  intercept: number;
  /** 관측점. 축의 범위도 잔차도 전부 여기서 나온다. */
  points: readonly ResidualPt[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 고리가 앉은 점. 아직 짚지 않았거나 다 끝났으면 null. */
  cursor: number | null;
  /** 최단거리 후보를 보인 자리. 기각한 뒤에도 유령으로 남는다. */
  probe: ResidualProbe | null;
  /** 잔차 막대가 꽂힌 점들, 꽂힌 차례대로. */
  planted: readonly number[];
  /** 다 꽂혔나. */
  done: boolean;

  step: ResidualStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `cursor` 도 `probe` 도 `planted` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 꽂힌 막대를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 꽂는 것이 겹친다 (S-scene).
 */
type Base = Pick<ResidualDistanceScene, 'slope' | 'intercept' | 'points'>;

/**
 * 아무것도 꽂히지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): ResidualDistanceScene {
  return {
    slope: base.slope,
    intercept: base.intercept,
    points: base.points,
    cursor: null,
    probe: null,
    planted: [],
    done: false,
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

/** 발신이 가리키는 점. 범위 밖이면 null 이라 그 걸음이 조용히 흘러간다 (C2). */
function targetIndex(
  scene: ResidualDistanceScene,
  target: FacetEventTarget | undefined,
): number | null {
  const i = toIndexArray(target)[0];
  if (i === undefined || i < 0 || i >= scene.points.length) return null;
  return i;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 직선도 막대도 캡션의 부호도 같은 함수를
// 부르므로 갈릴 자리가 없다.

/** 고정된 직선이 그 x 에서 내놓는 값. */
export function predictedAt(scene: ResidualDistanceScene, x: number): number {
  return lineValueAt(scene.slope, scene.intercept, x);
}

/** 그 점의 잔차. 부호가 어느 쪽인지를 함께 말한다. */
export function residualOf(scene: ResidualDistanceScene, index: number): number {
  const p = scene.points[index];
  return p === undefined ? 0 : residualAt(scene.slope, scene.intercept, p);
}

/** 그 점. 범위 밖이면 null. */
export function pointOf(scene: ResidualDistanceScene, index: number): ResidualPt | null {
  return scene.points[index] ?? null;
}

export const residualDistanceScene: ScenePlan<ResidualDistanceScene> = {
  /**
   * 첫 장면은 직선과 점만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 배열을 참조로 쥐지 않는다 — 값만 꺼내 새 목록을 만든다 (S-scene).
   */
  initial(initialData: unknown): ResidualDistanceScene {
    const d = fields(initialData) ?? {};
    const slope = num(d.slope);
    const intercept = num(d.intercept);
    if (slope === null || intercept === null) {
      return atStart({ slope: 0, intercept: 0, points: [] });
    }
    const points: ResidualPt[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = p === null ? null : num(p.x);
        const y = p === null ? null : num(p.y);
        // 점 하나가 수가 아니면 축의 범위가 통째로 거짓이 된다. 빈 채로 선다 (C2).
        if (x === null || y === null) return atStart({ slope, intercept, points: [] });
        points.push({ x, y });
      }
    }
    return atStart({ slope, intercept, points });
  },

  reduce(scene: ResidualDistanceScene, event: FacetRuntimeEvent): ResidualDistanceScene {
    switch (event.type) {
      /* 한 점을 짚는다. 고리가 그 점에 앉는다. */
      case 'highlight': {
        const index = targetIndex(scene, event.target);
        if (index === null) return scene;
        return { ...scene, cursor: index, step: { kind: 'focus' } };
      }

      /* 최단거리 후보가 선다. 아직 기각하지 않았다. */
      case 'probe-perpendicular': {
        const index = targetIndex(scene, event.target);
        if (index === null) return scene;
        return {
          ...scene,
          cursor: index,
          probe: { index, turned: false },
          step: { kind: 'perpendicular' },
        };
      }

      /*
       * 세로로 돌려세운다. 후보를 기각하고 첫 막대가 꽂힌다 — 앞 장면을 제자리에서
       * 고치지 않고 새 `probe` 를 짓는다 (S-scene).
       */
      case 'probe-turn': {
        const index = targetIndex(scene, event.target);
        if (index === null) return scene;
        return {
          ...scene,
          cursor: index,
          probe: { index: scene.probe === null ? index : scene.probe.index, turned: true },
          planted: [...scene.planted, index],
          step: { kind: 'turn' },
        };
      }

      /* 나머지 점도 같은 방식으로. 고리는 지금 앉은 점에서 걸어온다. */
      case 'residual-drop': {
        const index = targetIndex(scene, event.target);
        if (index === null) return scene;
        return {
          ...scene,
          cursor: index,
          planted: [...scene.planted, index],
          step: { kind: 'drop', from: scene.cursor },
        };
      }

      /* 다 꽂혔다. 고리를 거둔다 — 이제 짚는 자리가 없다. */
      case 'done':
        return { ...scene, cursor: null, done: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          slope: scene.slope,
          intercept: scene.intercept,
          points: scene.points,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
