/**
 * LeastSquares 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 207 줄인데 `let` 이 한 자리도 없었다. **숨은 상태는 전부 stage 에
 * 있었고, 그중 넷은 어떤 grep 에도 걸리지 않는 모양이었다.**
 *
 * - `let baseY` — **기준선이 지금 어디냐.** 레인에 담기는 조각의 세로 자리가 전부
 *   여기서 나왔고, 걸음(`shiftMeasure` · `rewind`)이 이 변수를 옮겨 적었다.
 *   되짚어 세운 직후에는 그것이 옛 화면의 기준선이라 조각이 엉뚱한 높이에 앉는다.
 *   지금은 `measure` 하나가 말하고 자리는 그리는 쪽이 셈한다.
 * - `let unfoldDir: number[]` — **화면의 거울**(함정 28). 막대가 어느 쪽으로 펼쳐질지를
 *   `focusLine` 이 적어 두고 `foldSquared` 가 도로 읽었다. `getAttribute` 를 안 쓰니
 *   ④ 의 grep 을 지나가고 배열이라 값도 안 보인다. 사실은 `i < n/2` 라는 **순수한
 *   자리 규칙**이라, 그리는 쪽의 `unfoldDirOf` 한 줄로 없어졌다.
 * - **막대의 `x`/`y`/`width`/`height` 속성** — `foldSigned` 와 `foldSquared` 가
 *   `Number(bar.getAttribute('x'))` 로 **운동의 출발 그림을 화면에서 되읽었다**
 *   (④, 여덟 건). 되짚어 세운 직후에는 그것이 옛 화면의 막대다. 지금은
 *   `standingRectsOf` 가 점과 계수에서 셈하므로 되읽을 자리가 없다.
 * - `residBars.length === 0` — **벗어남 막대가 지금 서 있나.** `foldSigned` 의 문이
 *   그 길이 하나로 갈렸다. DOM 손잡이 배열의 **비었음**이 상태였다 (⑤).
 *   지금은 `standing` 이 말한다.
 * - `markEls` 의 **`tagName`** — `shiftMeasure` 가 `el.tagName === 'line'` 으로
 *   "지울 표식(수평 눈금)" 과 "남길 표식(Σr 기록)" 을 갈랐다. **무엇을 남길지가
 *   SVG 태그 이름에만 적혀 있었다** (⑤). 지금은 `signedMarks` 와 `signedSums` 가
 *   따로 서고, 남는 것은 정적 그리기가 매번 세운다.
 * - `let lanePieces` · `let markEls` · `let residLabels` — 담긴 조각과 표식의 목록.
 *   되돌리는 명령이 `shiftMeasure` · `rewind` 뿐이라 걸음 밖에서는 알 길이 없었다.
 *
 * ── 조각의 결론이 그림과 같은 자료에서 나온다
 *
 * 이 조각의 주장 자체가 **두 수의 견줌**이다 — 부호 있는 합 셋이 다 0 이고,
 * 제곱합 셋은 갈린다. 옛 발신은 `residuals` · `squares` · `total` · `bestIndex` 를
 * 전부 실어 보냈다. 화면의 막대와 탑은 그 수로 그려지고 판정도 그 수로 내려지니
 * 지금은 맞지만, **화면의 구조와 다른 출처**라 언젠가 갈릴 자리였다 (함정 34).
 *
 * 이제 발신은 **전부 비어 있고** 그 수들이 여기서 한 번에 셈해진다.
 *
 * - **잔차 · 제곱 · 두 합** — `readingsOf` 한 함수. 플롯의 막대 길이, 레인에 쌓인
 *   조각의 높이, `Σr` · `Σr²` 표기, 수평 눈금의 자리가 전부 그 하나를 지난다.
 * - **가장 적게 쌓인 직선** — `bestOf(readings)`. 제곱합의 최솟값이라 **구조에서
 *   세지는 것**이고 (프로토콜 4 절), 탑의 높이와 같은 배열에서 나오므로 고리가
 *   가장 낮은 탑이 아닌 자리에 걸릴 수 없다.
 * - **몇 번째 직선인가** — `signedPoured` · `squaredPoured` 가 센다. 발신이 오는
 *   차례가 이미 말하는 것이라 싣지 않는다.
 * - **무엇을 말할 걸음인가** — `captionOf` 가 자취에서 판정한다. 옛 발신의
 *   `textKey` 는 "마지막 직선이냐" 를 algorithm 이 따로 셈한 것이었다.
 *
 * 내주지 않은 것은 없다 — 이 조각은 직선을 **학습하지 않는다.** 계수는 선언이 주고
 * 잔차는 점과 계수의 뺄셈이라, `residualsOf` 를 떼어 내도 "부호 있는 합은 지워지고
 * 제곱합은 쌓인다" 는 말이 그대로 남는다 (프로토콜 4 절 B 갈래의 잣대).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점과 계수라는 **구조**만 담고 픽셀은 캔버스에서 역산하는
 * 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — `captionOf` 가 무엇을
 * 말할지만 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import type { LeastSquaresLine, LeastSquaresPoint } from './algorithm.js';

/** 재는 자. 부호를 지닌 **길이**냐, 제곱한 **넓이**냐. */
export type Measure = 'length' | 'area';

/**
 * 되감기 직전의 자취.
 *
 * 되감는 운동은 **떠나는 그림**에서 출발하는데 그것을 `prev` 에서 꺼내면
 * "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 그래서 장면이 말하게 한다.
 */
export type LeastSquaresTrace = {
  measure: Measure;
  signedPoured: number;
  squaredPoured: number;
  standing: number | null;
  judged: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `rewind` 만 계기값을 싣는다 — 나머지는 어느 직선이 움직이는지를 `standing` 과
 * 담긴 수가 이미 말하므로, 걸음에 도로 실으면 방금 걷어낸 두 출처를 운동 쪽으로
 * 다시 들이는 꼴이 된다.
 */
export type LeastSquaresStep =
  /** 벗어남 막대가 직선에서 점까지 자란다. */
  | { kind: 'stand' }
  /** 막대가 부호를 지닌 채 레인으로 날아가 머리-꼬리로 쌓인다. */
  | { kind: 'pour-signed' }
  /** 재는 자가 넓이로 바뀐다. 쌓인 것이 흩어지고 기준선이 바닥으로 내려간다. */
  | { kind: 'shift' }
  /** 막대가 다시 서고, 정사각형으로 펼쳐졌다가, 레인으로 부어진다. */
  | { kind: 'pour-squared' }
  /** 가장 낮은 탑에 고리가 걸린다. */
  | { kind: 'verdict' }
  /** 처음 화면으로 되감는다. */
  | { kind: 'rewind'; was: LeastSquaresTrace };

export type LeastSquaresScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 견줄 점들. 값에서 화면 자리가 나오므로 척도의 뿌리이기도 하다. */
  points: readonly LeastSquaresPoint[];
  /** 견줄 직선들. 이 조각은 직선을 학습하지 않는다 — 계수는 선언이 준다. */
  lines: readonly LeastSquaresLine[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 지금 재는 자. 기준선의 높이와 레인에 담기는 것이 여기서 갈린다. */
  measure: Measure;
  /** 부호를 지닌 채 담긴 직선의 수. 차례대로 0 번부터 나아간다. */
  signedPoured: number;
  /** 제곱해서 담긴 직선의 수. */
  squaredPoured: number;
  /** 벗어남 막대가 플롯에 서 있는 직선. null 이면 서 있지 않다. */
  standing: number | null;
  /** 판정이 내려졌나. **남는 자취**라 정적 그리기가 고리를 세운다. */
  judged: boolean;

  step: LeastSquaresStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `measure` 아래 다섯은 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 바닥으로 내려간 기준선과 쌓인 탑을 단 채로 선다 (S-scene).
 */
type Base = Pick<LeastSquaresScene, 'points' | 'lines'>;

/**
 * 되돌린 뒤의 장면 — 점 넷과 옅은 직선 셋만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): LeastSquaresScene {
  return {
    points: base.points,
    lines: base.lines,
    measure: 'length',
    signedPoured: 0,
    squaredPoured: 0,
    standing: null,
    judged: false,
    step: null,
  };
}

/** 자취 하나를 장면 위에 얹는다. 되감기가 떠나는 그림을 되세울 때 쓴다. */
export function sceneAt(scene: LeastSquaresScene, trace: LeastSquaresTrace): LeastSquaresScene {
  return { ...scene, ...trace, step: null };
}

// ── 선언 좁히기 ─────────────────────────────────────────────────────────────

/**
 * unknown → 화면이 쓰는 형태 (C9).
 *
 * **새 배열에 새 객체를 담아 돌려준다.** 러너가 주는 것은 mechanism 과 view 가
 * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 고쳐진 자료로 바탕을 그린다
 * (S-scene MUST).
 */
function readPoints(raw: unknown): LeastSquaresPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: LeastSquaresPoint[] = [];
  for (const item of raw) {
    const p = item as { x?: unknown; y?: unknown };
    if (typeof p?.x === 'number' && typeof p?.y === 'number') out.push({ x: p.x, y: p.y });
  }
  return out;
}

function readLines(raw: unknown): LeastSquaresLine[] {
  if (!Array.isArray(raw)) return [];
  const out: LeastSquaresLine[] = [];
  for (const item of raw) {
    const l = item as { slope?: unknown; intercept?: unknown };
    if (typeof l?.slope === 'number' && typeof l?.intercept === 'number') {
      out.push({ slope: l.slope, intercept: l.intercept });
    }
  }
  return out;
}

// ── 파생. 화면에 뜨는 수는 전부 여기를 지난다 ───────────────────────────────

/** 부동소수 찌꺼기를 털어 낸다. 반값들만 나오지만 `-0` 도 함께 막는다. */
export function tidy(n: number): number {
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/** 잔차 = 실제 y − 직선이 말하는 y. 위로 벗어나면 양, 아래로 벗어나면 음. */
export function residualsOf(
  points: readonly LeastSquaresPoint[],
  line: LeastSquaresLine,
): number[] {
  return points.map((p) => tidy(p.y - (line.slope * p.x + line.intercept)));
}

export function sumOf(values: readonly number[]): number {
  return tidy(values.reduce((a, b) => a + b, 0));
}

/** 한 직선에서 읽히는 것 전부. 화면의 막대도 탑도 표기도 이 한 함수를 지난다. */
export type LineReading = {
  /** 점마다의 벗어남. 부호가 곧 방향이다. */
  residuals: number[];
  /** 그 벗어남을 제곱한 것. 넓이라 음수가 없다. */
  squares: number[];
  /** 부호 있는 합. 이 조각에서는 셋 다 0 이다 — 그것이 문제 제기다. */
  signedTotal: number;
  /** 제곱합. 셋이 갈리는 것이 결론이다. */
  squaredTotal: number;
};

/** 직선마다 하나씩. **자리를 그리기 전에 한 번에 셈한다** (프로토콜 함정 13). */
export function readingsOf(scene: LeastSquaresScene): LineReading[] {
  return scene.lines.map((line) => {
    const residuals = residualsOf(scene.points, line);
    const squares = residuals.map((r) => tidy(r * r));
    return {
      residuals,
      squares,
      signedTotal: sumOf(residuals),
      squaredTotal: sumOf(squares),
    };
  });
}

/**
 * 제곱이 가장 적게 쌓인 직선.
 *
 * 탑의 높이를 정하는 바로 그 배열에서 나온다 — 고리가 가장 낮은 탑이 아닌 자리에
 * 걸리는 일이 구조적으로 없다 (함정 34).
 */
export function bestOf(readings: readonly LineReading[]): number {
  let best = 0;
  for (let k = 1; k < readings.length; k += 1) {
    if (readings[k].squaredTotal < readings[best].squaredTotal) best = k;
  }
  return best;
}

/**
 * 지금 짚고 있는 직선. 진해지는 선과 짙어지는 바탕이 이 하나에서 나온다.
 *
 * 걸음이 실어 오지 않는다 — 어디까지 담았나가 이미 말한다.
 */
export function focusOf(scene: LeastSquaresScene): number | null {
  if (scene.judged) return bestOf(readingsOf(scene));
  if (scene.standing !== null) return scene.standing;
  if (scene.measure === 'area') {
    return scene.squaredPoured > 0 ? scene.squaredPoured - 1 : null;
  }
  return scene.signedPoured > 0 ? scene.signedPoured - 1 : null;
}

/** 캡션이 말할 것. 문자가 아니라 **무엇을 말할지**다 (C10). */
export type CaptionKind =
  | 'opening'
  | 'miss'
  | 'cancel'
  | 'allZero'
  | 'square'
  | 'pileUp'
  | 'split'
  | 'verdict';

/**
 * 자취에서 곧바로 나온다.
 *
 * 장면에 캡션 필드를 두지 않는다 — `measure` 와 담긴 수 둘이 걸음의 갈래와 1 대 1
 * 이므로 따로 실으면 같은 것을 두 번 말하는 꼴이 된다. 옛 발신의 `textKey` 는
 * "마지막 직선이냐" 를 algorithm 이 따로 셈한 것이었다.
 */
export function captionOf(scene: LeastSquaresScene): CaptionKind {
  if (scene.judged) return 'verdict';
  if (scene.standing !== null) return 'miss';
  if (scene.measure === 'area') {
    if (scene.squaredPoured === 0) return 'square';
    return scene.squaredPoured >= scene.lines.length ? 'split' : 'pileUp';
  }
  if (scene.signedPoured === 0) return 'opening';
  return scene.signedPoured >= scene.lines.length ? 'allZero' : 'cancel';
}

export const leastSquaresScene: ScenePlan<LeastSquaresScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다 — 점 넷과 옅은 직선 셋이다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 좁히개가
   * **새 배열에 새 객체**를 담아 돌려주므로 러너의 자료를 참조로 쥐지 않는다.
   */
  initial(initialData: unknown): LeastSquaresScene {
    const d = (initialData ?? {}) as { points?: unknown; lines?: unknown };
    return atStart({ points: readPoints(d.points), lines: readLines(d.lines) });
  },

  reduce(scene: LeastSquaresScene, event: FacetRuntimeEvent): LeastSquaresScene {
    switch (event.type) {
      /*
       * 한 직선을 짚고 벗어남을 세운다.
       *
       * 어느 직선인지 받지 않는다 — **이 발신의 차례가 곧 직선**이고, 그것은
       * 이미 담은 수가 말한다. 다 담고 나서 또 오면 세울 자리가 없으므로 조용히
       * 흘린다 (C2).
       */
      case 'line-focus':
        if (scene.signedPoured >= scene.lines.length) return scene;
        return { ...scene, standing: scene.signedPoured, step: { kind: 'stand' } };

      // 부호를 지닌 채 담는다. 서 있는 것이 없으면 담을 것도 없다.
      case 'signed-fold':
        if (scene.standing === null) return scene;
        return {
          ...scene,
          standing: null,
          signedPoured: scene.signedPoured + 1,
          step: { kind: 'pour-signed' },
        };

      // 재는 자를 길이에서 넓이로. 담긴 것은 흩어지고 Σr 기록은 남는다.
      case 'measure-shift':
        if (scene.measure === 'area') return scene;
        return { ...scene, measure: 'area', standing: null, step: { kind: 'shift' } };

      // 제곱해서 담는다. 자를 바꾸기 전에는 담을 자리가 없다.
      case 'square-fold':
        if (scene.measure !== 'area' || scene.squaredPoured >= scene.lines.length) return scene;
        return {
          ...scene,
          squaredPoured: scene.squaredPoured + 1,
          step: { kind: 'pour-squared' },
        };

      case 'verdict':
        return { ...scene, judged: true, step: { kind: 'verdict' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return {
          ...atStart({ points: scene.points, lines: scene.lines }),
          step: {
            kind: 'rewind',
            was: {
              measure: scene.measure,
              signedPoured: scene.signedPoured,
              squaredPoured: scene.squaredPoured,
              standing: scene.standing,
              judged: scene.judged,
            },
          },
        };

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
