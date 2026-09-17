/**
 * DecisionBoundary 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 0 건, stage 의 `let` 은 `destroyed` 와 훑기 안의 `shown`
 * 둘뿐이라 둘 다 기계장치였고, 조회 분기도 `getAttribute` 도 0 건이었다. 곧
 * **화면이 통째로 상태**였다는 뜻이고 실제로 그랬다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `const pinned: Array<{ y, slot }>` — 확률자에 이미 꽂힌 것들의 높이와 칸.
 *   `const` 로 묶였는데 `push` 와 `length = 0` 으로 알맹이가 제자리에서 고쳐져
 *   `let` grep 을 통과했다. 게다가 `pinSlot` 이 **제가 꽂아 둔 것을 도로 읽어**
 *   다음 꽂을 자리를 정했다 — 되짚어 세운 직후에는 그 표가 옛 화면의 것이라
 *   같은 확률이 다른 칸에 앉는다. 지금은 그리는 쪽이 `probedProbabilities`
 *   전체를 받아 매번 처음부터 칸을 다시 나눈다.
 * - `rect.dataset.alpha` — 격자 칸의 **목표 농도를 DOM 에 적어 두고** 쓸개바가
 *   지나갈 때 도로 꺼내 썼다. `getAttribute` 도 `Number(...)` 도 아니라 ④ 의
 *   grep 을 통과하지만 병은 같다. 지금은 농도가 `field` 에서 매번 나온다.
 * - `const dots: SVGCircleElement[]` 의 `fill` · `fill-opacity` · `stroke` —
 *   **어느 점을 이미 물었나**를 말하는 유일한 보관처였다. DOM 손잡이와 뜻이 한
 *   배열에 묶여 있었다. 지금은 `probed` 하나가 말한다.
 * - `zText` · `pText` 의 글자 — **한 자리에 세 뜻.** 낱점의 z · p 인가, 비어
 *   있는가(`—`), 경계의 `z = 0` 인가가 글자에만 있었고 되돌릴 길이 없었다.
 *   지금은 `probed` · `spread` · `revealed` 에서 파생된다.
 * - `fieldLayer` 의 **자식 수** — 몇 물결을 훑었나. 어떤 변수도 그것을 말하지
 *   않았다. 지금은 `scanned` 다.
 * - `fieldLayer` 자신의 `opacity` — 넘나드는 칸이 떴나. 자식을 비워도 남는
 *   레이어 속성이라 `reset()` 이 일부러 `'1'` 로 되돌리고 있었다 (그 한 줄이
 *   상태가 거기 있다는 표였다). 지금은 `crossed` 이고, 아래 "채움과 테두리"
 *   에서 아예 없앴다.
 * - `rulerLayer` 의 자식들 — 꽂힌 확률과 빈 구간의 자가 한 층에 섞여 "여덟이
 *   다 꽂혔나" 와 "구간을 쟀나" 를 함께 쥐고 있었다. 지금은 `probed` 와
 *   `spread` 로 갈렸다.
 * - `type ProbeInfo` · `SpreadInfo` · `ScanInfo` · `CrossInfo` · `BoundaryInfo` —
 *   **선언되었는데 값이 어디에도 저장되지 않는 타입.** projector 에서 그리는
 *   자리로 건너가는 동안만 살았고, 그 안의 수는 전부 바탕에서 나오는 것이었다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 카드의 z · p, 점의 물듦, 격자의 농도, 넘나드는 칸, 그리고 선의 자리가 한
 * 화면에 함께 선다. 그 다섯이 다른 출처에서 오면 그림이 제 안에서 거짓이 된다.
 * 그래서 **일곱 발신 모두 payload 가 비어 있고**, 수는 `algorithm.ts` 가 내준
 * `decisionProbability` · `decisionField` · `decisionCrossings` 를 지난다
 * (프로토콜 4 절의 B 갈래 — 장면이 `algorithm.ts` 를 import 하는 방향은 원칙 1
 * 이 허용한다).
 *
 * **몇 번째 점인가 · 몇 번째 물결인가는 발신이 온 차례가 말한다.** 점은 올 때마다
 * 하나씩 쌓이므로 `probed` 가 곧 그 점의 번호이고, 물결은 `decisionWaveSize`
 * 하나로 잘리므로 `scanned` 가 곧 다음 물결의 시작 열이다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점의 화면 자리도 격자 칸의 크기도 확률자의 높이도 전부
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). **담는 것은 값의
 * 범위**(`domain`)와 해상도(`grid`)다. 문안도 담지 않는다 — `captionFor` 가
 * 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  DECISION_HALF,
  decisionCrossings,
  decisionField,
  decisionProbability,
  decisionScore,
  decisionWaveSize,
  type DecisionBoundaryPoint,
} from './algorithm.js';

/**
 * 경계를 정의하는 확률. `algorithm.ts` 가 쥔 잣대를 그대로 내보낸다 — 그리는
 * 쪽이 0.5 를 따로 적으면 잣대가 두 군데가 된다.
 */
export { DECISION_HALF } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 훑기만 계기값(`from`)을 싣는다 — 이번 물결이 어디서 시작했는지는 자취의
 * `scanned` 가 이미 끝을 말한 뒤라 되짚을 길이 없다. `prev` 에서 꺼내면
 * S-scene 위반이므로 장면이 말하게 한다.
 */
export type DecisionBoundaryStep =
  /** 점 하나에 확률을 매긴다. 값이 확률자로 날아가 꽂힌다. */
  | { kind: 'probe' }
  /** 두 뭉치 사이의 빈 구간이 위아래에서 조여 온다. */
  | { kind: 'spread' }
  /** 격자의 한 물결을 훑는다. `from` 열에서 시작해 `scanned` 열까지. */
  | { kind: 'scan'; from: number }
  /** 넘나드는 칸이 부풀었다 제자리로 오므라들며 뜬다. */
  | { kind: 'cross' }
  /** 선이 한쪽 끝에서 다른 끝으로 그어진다. */
  | { kind: 'boundary' }
  /** 선이 앉은 자리가 확률자의 반과 같은 자리임을 한 번 짚는다. */
  | { kind: 'settle' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type DecisionBoundaryCaption =
  /** 점마다 확률을 묻는다. 어느 쪽인지가 아니다. */
  | { kind: 'probe'; k: number; n: number }
  /** 확률들이 두 끝으로 갔다. 반 근처에 앉은 것이 없다. */
  | { kind: 'spread' }
  /** 그래서 평면의 모든 자리에 같은 것을 묻는다. */
  | { kind: 'scan' }
  /** 반을 넘나드는 칸에 불을 켠다. */
  | { kind: 'crossing' }
  /** 그것을 이으면 경계가 나타난다. */
  | { kind: 'boundary' }
  /** 선이 있는 곳은 p 가 반인 자리다. */
  | { kind: 'done' };

/** 점 하나에서 읽히는 것 전부. 카드도 물듦도 꽂힘도 이 한 함수를 지난다. */
export type PointReading = { x: number; y: number; z: number; p: number };

/** 카드가 마지막에 내거는 것. 선의 자리를 정한 것과 같은 무게·치우침이다. */
export type BoundaryReading = { wx: number; wy: number; rhs: number; p: number };

export type DecisionBoundaryScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 고정 무게. 학습의 결과가 아니라 주어진 값이다. */
  weights: { x: number; y: number };
  /** 고정 치우침. */
  bias: number;
  /** 점 여덟. `initial` 이 값만 베껴 새 객체로 쥔다 (S-scene). */
  points: readonly DecisionBoundaryPoint[];
  /** 질문을 던지는 입력 공간의 범위. 화면 좌표가 아니라 **값의 범위**다. */
  domain: { min: number; max: number };
  /** 평면에 물을 때의 해상도와 물결 수. */
  grid: { cols: number; rows: number; waves: number };
  /**
   * 격자 칸 가운데의 확률, 열 우선 (`col * rows + row`).
   *
   * 걸음이 실어 오지 않는다 — 무게·치우침·범위·해상도만 있으면 정해지는 표라
   * `algorithm.ts` 가 내준 `decisionField` 하나를 지난다.
   */
  field: readonly number[];
  /** 반을 넘나드는 칸의 평탄 색인, 오름차순. 위와 같은 까닭으로 싣지 않는다. */
  crossings: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 확률을 물어 본 점의 수. 자리 `probed - 1` 이 방금 물은 점이다. */
  probed: number;
  /** 두 뭉치 사이가 비어 있음을 짚었나. */
  spread: boolean;
  /** 훑어 칠한 열의 수. 0 열부터 여기까지가 화면에 서 있다. */
  scanned: number;
  /** 넘나드는 칸에 불을 켰나. */
  crossed: boolean;
  /** 선을 그었나. */
  revealed: boolean;
  /** 마쳤나. 캡션이 결론을 말한다. */
  finished: boolean;

  step: DecisionBoundaryStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `probed` 이하 여섯은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 다 칠해진 격자와 그어진 선을 단 채로 서고 그 위에 새 주행이 겹친다
 * (S-scene).
 */
type Base = Pick<
  DecisionBoundaryScene,
  'weights' | 'bias' | 'points' | 'domain' | 'grid' | 'field' | 'crossings'
>;

/**
 * 아직 아무것도 묻지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): DecisionBoundaryScene {
  return {
    weights: base.weights,
    bias: base.bias,
    points: base.points,
    domain: base.domain,
    grid: base.grid,
    field: base.field,
    crossings: base.crossings,
    probed: 0,
    spread: false,
    scanned: 0,
    crossed: false,
    revealed: false,
    finished: false,
    step: null,
  };
}

// ── 선언 좁히기 ───────────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고
// 그리는 쪽은 장면만 받는다 — 두 벌이 되면 걸음 수와 격자 크기가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = num(value);
  return n === null ? fallback : Math.max(1, Math.trunc(n));
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 점도 격자도 카드도 캡션도 같은 함수를
// 부르므로 갈릴 자리가 없다.

/** 반을 넘으면 저쪽, 아니면 이쪽. 잣대는 `DECISION_HALF` 하나다. */
export function sideOf(p: number): 'low' | 'high' {
  return p >= DECISION_HALF ? 'high' : 'low';
}

/**
 * 반에서 얼마나 멀리 있나 (0~1).
 *
 * 경계 부근은 0 에 가까워 저절로 옅어진다 — 흰 이음매는 선을 그어 만든 것이
 * 아니라 이 값이 만든 것이다.
 */
export function convictionOf(p: number): number {
  return Math.min(1, Math.abs(p - DECISION_HALF) * 2);
}

/** 자리 `index` 의 점에서 읽히는 것. 범위 밖이면 null. */
export function readingAt(
  scene: DecisionBoundaryScene,
  index: number,
): PointReading | null {
  const pt = scene.points[index];
  if (pt === undefined) return null;
  const model = { weights: scene.weights, bias: scene.bias };
  return {
    x: pt.x,
    y: pt.y,
    z: decisionScore(model, pt.x, pt.y),
    p: decisionProbability(model, pt.x, pt.y),
  };
}

/** 방금 물은 점. 아직 하나도 안 물었으면 null. */
export function lastReading(scene: DecisionBoundaryScene): PointReading | null {
  return scene.probed === 0 ? null : readingAt(scene, scene.probed - 1);
}

/** 이미 확률자에 꽂힌 것들, 꽂힌 차례대로. 칸 나누기는 그리는 쪽이 한다. */
export function probedProbabilities(scene: DecisionBoundaryScene): number[] {
  const out: number[] = [];
  for (let i = 0; i < scene.probed; i += 1) {
    const reading = readingAt(scene, i);
    if (reading !== null) out.push(reading.p);
  }
  return out;
}

/**
 * 두 뭉치 사이의 빈 구간.
 *
 * **걸음이 실어 오지 않는다** — 꽂힌 확률들에서 곧바로 나온다. 실어 오면 자에
 * 꽂힌 점과 그 사이를 재는 자가 다른 자료를 쓰게 된다 (프로토콜 4 절).
 * 아래쪽이 하나도 없으면 0 에서, 위쪽이 없으면 1 에서 잰다.
 */
export function spreadOf(scene: DecisionBoundaryScene): { low: number; high: number } {
  let low = 0;
  let high = 1;
  for (const p of probedProbabilities(scene)) {
    if (p < DECISION_HALF) low = Math.max(low, p);
    else high = Math.min(high, p);
  }
  return { low, high };
}

/** 선이 지나는 자리를 말하는 등식. 선을 그린 것과 같은 무게·치우침이다. */
export function boundaryReading(scene: DecisionBoundaryScene): BoundaryReading {
  return {
    wx: scene.weights.x,
    wy: scene.weights.y,
    rhs: -scene.bias,
    p: DECISION_HALF,
  };
}

/** 그 칸의 확률. 범위 밖이면 반 — 아무 쪽도 아닌 값이다. */
export function cellProbability(
  scene: DecisionBoundaryScene,
  col: number,
  row: number,
): number {
  return scene.field[col * scene.grid.rows + row] ?? DECISION_HALF;
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 하고, 장면에 캡션 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(
  scene: DecisionBoundaryScene,
): DecisionBoundaryCaption | null {
  if (scene.finished) return { kind: 'done' };
  if (scene.revealed) return { kind: 'boundary' };
  if (scene.crossed) return { kind: 'crossing' };
  if (scene.scanned > 0) return { kind: 'scan' };
  if (scene.spread) return { kind: 'spread' };
  if (scene.probed > 0) {
    return { kind: 'probe', k: scene.probed, n: scene.points.length };
  }
  return null;
}

export const decisionBoundaryScene: ScenePlan<DecisionBoundaryScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 점 배열을 **참조로 쥐지 않는다** — 수만 꺼내 새 객체를 만든다. 러너가 주는
   * 것은 algorithm 과 함께 쓰는 한 객체이기 때문이다 (S-scene).
   */
  initial(initialData: unknown): DecisionBoundaryScene {
    const d = fields(initialData) ?? {};
    const w = fields(d.weights);
    const dom = fields(d.domain);
    const g = fields(d.grid);

    const weights = { x: num(w?.x) ?? 1, y: num(w?.y) ?? 1 };
    const bias = num(d.bias) ?? 0;

    const min = num(dom?.min) ?? 0;
    const rawMax = num(dom?.max) ?? 1;
    // 범위가 뒤집히거나 0 이면 자리 셈이 통째로 무너진다. 최소 폭을 준다.
    const domain = { min, max: rawMax > min ? rawMax : min + 1 };

    const grid = {
      cols: positiveInt(g?.cols, 1),
      rows: positiveInt(g?.rows, 1),
      waves: positiveInt(g?.waves, 1),
    };

    const points: DecisionBoundaryPoint[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = num(p?.x);
        const y = num(p?.y);
        if (x !== null && y !== null) points.push({ x, y });
      }
    }

    const field = decisionField({ weights, bias }, domain, grid);
    return atStart({
      weights,
      bias,
      points,
      domain,
      grid,
      field,
      crossings: decisionCrossings(field, grid.cols, grid.rows),
    });
  },

  reduce(
    scene: DecisionBoundaryScene,
    event: FacetRuntimeEvent,
  ): DecisionBoundaryScene {
    switch (event.type) {
      /*
       * 점 하나에 확률을 매긴다. 몇 번째인지도 그 값도 실어 오지 않는다 —
       * 점은 올 때마다 하나씩 쌓이므로 `probed` 가 곧 그 점의 번호다.
       */
      case 'point-probed':
        // 선언된 점보다 많이 오면 물을 것이 없다. 조용히 흘린다 (C2).
        if (scene.probed >= scene.points.length) return scene;
        return { ...scene, probed: scene.probed + 1, step: { kind: 'probe' } };

      /* 두 뭉치 사이를 짚는다. 구간의 두 끝은 꽂힌 확률들이 이미 쥐고 있다. */
      case 'spread-noted':
        if (scene.probed === 0 || scene.spread) return scene;
        return { ...scene, spread: true, step: { kind: 'spread' } };

      /*
       * 격자의 다음 물결을 훑는다. 어느 열부터인지 실어 오지 않는다 — 물결은
       * 한 잣대로만 잘리므로 `scanned` 가 곧 이번 물결의 시작 열이다.
       */
      case 'field-scanned': {
        const { cols, waves } = scene.grid;
        if (scene.scanned >= cols) return scene;
        const to = Math.min(cols, scene.scanned + decisionWaveSize(cols, waves));
        return { ...scene, scanned: to, step: { kind: 'scan', from: scene.scanned } };
      }

      /* 넘나드는 칸에 불을 켠다. 어느 칸인지는 바탕의 `crossings` 가 쥔다. */
      case 'crossing-marked':
        if (scene.scanned < scene.grid.cols || scene.crossed) return scene;
        return { ...scene, crossed: true, step: { kind: 'cross' } };

      /* 그 칸들을 잇는다. 무게도 치우침도 바탕에 이미 있다. */
      case 'boundary-revealed':
        if (!scene.crossed || scene.revealed) return scene;
        return { ...scene, revealed: true, step: { kind: 'boundary' } };

      /* 마침. 선이 앉은 자리가 확률자의 반과 같은 자리임을 한 번 짚는다. */
      case 'done':
        if (!scene.revealed || scene.finished) return scene;
        return { ...scene, finished: true, step: { kind: 'settle' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          weights: scene.weights,
          bias: scene.bias,
          points: scene.points,
          domain: scene.domain,
          grid: scene.grid,
          field: scene.field,
          crossings: scene.crossings,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
