/**
 * KernelLifts 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 `points` 하나뿐이었고 조회로 갈리는 분기도 없었다.
 * **숨은 상태는 거의 전부 stage 에 있었다.**
 *
 * - `let xUnit` · `let originX` · `let minX` · `let yUnit` — **축의 척도.**
 *   `px` · `py` 가 이 넷으로 자리를 셈하므로 **화면의 모든 좌표가 여기서 나왔다.**
 *   `setScene` 과 `openHeight` 가 제 변수에 옮겨 적어 두고 그 뒤로 계속 쓰는 짜임이라,
 *   척도를 정하는 자리와 쓰는 자리가 갈라져 있었다. 지금은 장면이 **값의 범위**(점과
 *   높이 눈금)만 말하고 픽셀은 그리는 쪽이 매번 셈한다 (S-piece).
 * - `let worldDy` — 좌표가 아니라 **어느 국면인가**. 106 이면 위가 열린 것이고 0 이면
 *   아직 한 줄 세계다. 그 사실을 말하는 변수가 따로 없어 픽셀 하나가 국면을 쥐고
 *   있었다. 지금은 `heights !== null` 이 그것을 말한다.
 * - `Node = { spec, height, dot, stem }` 의 **`height`** — **어느 점이 어느 높이까지
 *   올랐나.** DOM 손잡이와 오른 높이가 한 객체였고, `nodes` 는 `let` 이지만 알맹이는
 *   `raise()` 가 `node.height = height` 로 제자리에서 고쳤다. `traceCurve` 가 그것을
 *   되읽어 곡선을 그었으니 **이 조각의 자취 전체가 DOM 손잡이 배열에 살고 있었다.**
 *   지금은 `risen` 이 오른 무리를 차례대로 쌓는다.
 * - `let labelColor = new Map<string, string>()` — 이름표마다 무슨 색인가. 값은 바탕
 *   점에서 한 번에 나왔으므로 색판이 걸음마다 갈리지는 않았지만, 그 사실이 `setScene`
 *   한 번에만 매여 있었다. 지금은 그리는 쪽이 바탕 점에서 매번 셈한다 — 색판의 크기를
 *   *지금까지 드러난 이름표 수*로 잡으면 이름표가 늘 때 hue 간격이 통째로 갈린다.
 * - `let knife` 의 **있고 없음과 `x1`** — 지금 어느 자리를 짚는 중인가. 그 자리를
 *   `getAttribute('x1')` 로 **되읽어** 다음 미끄러짐의 출발값으로 삼았다. 되짚어 세운
 *   직후에는 그것이 옛 화면의 칼금이라 엉뚱한 데서 출발한다. 지금은 `tried` 가 몇
 *   자리를 짚었는지 세고 `step.from` 이 칼이 걸어오는 자리를 말한다.
 * - `let sideMarks` — 지금 걸려 있는 묶음표 한 벌. **다음 자리로 옮길 때 걷어냈으므로
 *   짚어 본 자리의 이력이 화면에 하나도 남지 않았다.** `dropKnife` 가 마지막 것까지
 *   지워, "다 해 봤지만 전부 실패했다" 는 이 조각의 논증이 완주 화면에서 사라졌다.
 *   지금은 `tried` 가 자취로 남아 짚어 본 자리마다 옅은 표식이 선다.
 * - `let cutLine` 의 `y1` — 가르는 높이. `markSplit` 이 띠를 칠 자리를 화면에서
 *   **되읽었다.** 지금은 `cut` 이 값으로 말하고 자리는 그리는 쪽이 셈한다.
 * - `let active` — 방금 오른 무리의 고리. `risen` 의 마지막 무리와 `curve` 로 파생된다.
 *
 * ── 화면에 나란히 뜨는 수는 한 출처에서만 나온다
 *
 * 옛 발신은 `cut` · `tried` · `total` · 양쪽 이름표 넷 · `belowLabel` · `aboveLabel` 을
 * 실어 보냈다. 전부 **점과 자취에서 곧바로 세지는 것**이라 걷어냈다.
 *
 * - 자름 자리는 `algorithm.ts` 가 내준 `kernelCutsOf` 를 장면이 부른다 (프로토콜 4 절
 *   B 갈래). 올리는 법과 무관한 함수라 떼어 내도 조각의 주장이 남는다.
 * - 몇 번째 자리인가는 `tried` 가 센다. 양쪽에 남은 이름표는 그 자리와 점에서 나온다.
 * - **위아래 이름표도 장면이 센다** — 오른 높이와 가르는 높이를 견주면 나온다.
 *   결론이 그림과 같은 자료를 쓰게 되는 자리다.
 * - **올린 높이는 걷어내지 않는다.** `x → x^power` 가 이 조각의 알고리즘 그 자체라
 *   장면이 대신 풀면 발신이 장식이 된다 (4 절의 경계). 그래서 `point-raised` 의
 *   `{ xs, height }` 와 `height-opened` 의 `{ ticks }`, `cut-placed` 의 `{ height }` 만
 *   남았다 — 모두 올리는 법이 내놓는 판정이다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 높이의 눈금이라는 **구조**만 담고 화면 자리는 그리는
 * 쪽이 셈한다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을 말할지만 말하고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은 `step` 과
 * 캡션의 갈래가 1 대 1 이기 때문이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { kernelCutsOf } from './algorithm.js';

/** 한 줄 위의 점 하나. 값이지 자리가 아니다. */
export type KernelPoint = { x: number; label: string };

/** 같은 높이로 함께 오른 무리. 높이는 올리는 법이 내놓은 값이다. */
export type KernelRise = { height: number; xs: readonly number[] };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 */
export type KernelStep =
  /** 점들이 줄 위에 내려앉는다. */
  | { kind: 'line' }
  /**
   * 자름 자리 하나를 짚는다.
   *
   * `from` 은 칼이 걸어오는 앞 자리다. 없으면 이번이 첫 자리라 칼이 내려온다.
   * 화면을 되읽지 않으려고 장면이 말한다 — 되짚어 세운 직후의 칼금은 옛 걸음의
   * 것이라 거기서 출발값을 꺼내면 어긋난다 (S-scene: `prev` 는 고르는 데만).
   */
  | { kind: 'cut'; from: number | null }
  /** 다 해 봤다. 칼과 묶음표가 물러나고 짚어 본 표식만 남는다. */
  | { kind: 'exhausted' }
  /** 없던 쪽을 연다. 줄이 바닥으로 내려앉고 높이 축이 선다. */
  | { kind: 'open' }
  /** 한 무리가 제 높이까지 오른다. */
  | { kind: 'raise' }
  /** 앉은 자리를 잇는다. */
  | { kind: 'curve' }
  /** 곧은 선 하나가 내려와 멈춘다. */
  | { kind: 'place' }
  /** 위아래를 물들여 갈린 것을 못박는다. */
  | { kind: 'verify' }
  /** 마지막으로 그 선을 한 번 두드린다. */
  | { kind: 'done' };

export type KernelLiftsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 한 줄 위의 점, x 오름차순.
   *
   * **이 장면의 가로 척도와 색판이 여기서 나온다** — 자름 자리도, 이름표마다의 색도
   * 이 목록 **전체**에서 정해진다. 드러난 것만으로 다시 잡으면 걸음마다 눈금이 옮겨
   * 앉는다.
   */
  points: readonly KernelPoint[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점들이 줄 위에 섰나. 그 전에는 줄과 눈금만 있다. */
  shown: boolean;
  /** 짚어 본 자름 자리의 수. 자리 자체는 `cutsOf` 가 정한다. */
  tried: number;
  /** 다 해 보고 칼을 거두었나. 짚어 본 표식은 남는다. */
  exhausted: boolean;
  /**
   * 높이 축의 눈금(오름차순). `null` 이면 아직 위가 열리지 않았다.
   *
   * 세로 척도가 여기서 나온다. 오른 것만으로 잡으면 점이 하나 오를 때마다 축이
   * 통째로 다시 잡힌다.
   */
  heights: readonly number[] | null;
  /** 오른 무리, 오른 차례대로. 차례가 곧 몇 번째 걸음인가다. */
  risen: readonly KernelRise[];
  /** 앉은 자리를 잇는 길이 그어졌나. 그어지면 방금 오른 무리의 고리를 거둔다. */
  curve: boolean;
  /** 가르는 높이. `null` 이면 아직 곧은 선이 내려오지 않았다. */
  cut: number | null;
  /** 위아래를 물들였나. */
  split: boolean;
  /** 마지막 두드림을 마쳤나. */
  settled: boolean;

  step: KernelStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `shown` 아래 여덟은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미
 * 다 오른 점과 내려온 선을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는
 * 것이 겹친다 (S-scene).
 */
type Base = Pick<KernelLiftsScene, 'points'>;

/**
 * 아무것도 짚지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): KernelLiftsScene {
  return {
    points: base.points,
    shown: false,
    tried: 0,
    exhausted: false,
    heights: null,
    risen: [],
    curve: false,
    cut: null,
    split: false,
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

/** 수의 목록만 골라 낸다. 하나라도 수가 아니면 그 걸음이 조용히 흘러간다 (C2). */
function numbers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const raw of v) {
    const n = num(raw);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 칼금도 · 묶음표도 · 캡션의 두 수도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/**
 * 서로 다른 결과를 내는 자름 자리 **전부**, 왼쪽부터.
 *
 * `algorithm.ts` 가 걸음을 미는 데 쓰는 바로 그 함수다 — 한 벌만 둔다.
 */
export function cutsOf(scene: KernelLiftsScene): number[] {
  return kernelCutsOf(scene.points);
}

/** 짚을 수 있는 자리의 수. 캡션의 `{n}` 이 이것이다. */
export function cutCountOf(scene: KernelLiftsScene): number {
  return cutsOf(scene).length;
}

/** 몇 번째 자리인가 → 그 자리. 범위 밖이면 null. */
export function cutAt(scene: KernelLiftsScene, index: number): number | null {
  return cutsOf(scene)[index] ?? null;
}

/** 이름표, 오름차순. 색판의 크기가 여기서 나온다 (바탕 자료에서 한 번에 센다). */
export function labelsOf(scene: KernelLiftsScene): string[] {
  return [...new Set(scene.points.map((p) => p.label))].sort();
}

/** 한 자리에 여러 점이 겹쳐 있어도 이름표는 한 번만 센다. */
function distinct(points: readonly KernelPoint[]): string[] {
  return [...new Set(points.map((p) => p.label))].sort();
}

/** 그 자리에서 자르면 양쪽에 무엇이 남는가. 섞였으면 그 자름은 실패다. */
export function sidesOf(
  scene: KernelLiftsScene,
  cut: number,
): { left: string[]; leftMixed: boolean; right: string[]; rightMixed: boolean } {
  const left = distinct(scene.points.filter((p) => p.x < cut));
  const right = distinct(scene.points.filter((p) => p.x > cut));
  return {
    left,
    leftMixed: left.length > 1,
    right,
    rightMixed: right.length > 1,
  };
}

/** 그 자리의 점이 지금 올라 있는 높이. 아직 안 올랐으면 0 — 줄 위다. */
export function liftedHeightOf(scene: KernelLiftsScene, x: number): number {
  for (const rise of scene.risen) {
    if (rise.xs.includes(x)) return rise.height;
  }
  return 0;
}

/** 방금 오른 무리. 길이 그어진 뒤에는 짚을 자리가 없다. */
export function lastRiseOf(scene: KernelLiftsScene): KernelRise | null {
  if (scene.curve) return null;
  return scene.risen[scene.risen.length - 1] ?? null;
}

/**
 * 가르는 높이를 기준으로 위아래에 앉은 이름표.
 *
 * 걸음이 실어 오지 않는다 — 오른 높이와 그 높이를 견주면 나오므로 **그림과 같은
 * 자료**에서 센다. 한쪽이 섞여 있으면 null 이고 그때는 띠를 칠하지 않는다
 * (algorithm 이 그 경우에 던지므로 실제로는 오지 않는다).
 */
export function splitOf(
  scene: KernelLiftsScene,
): { below: string; above: string } | null {
  const cut = scene.cut;
  if (cut === null) return null;
  const labels = labelsOf(scene);
  if (labels.length !== 2) return null;
  const span = new Map<string, { min: number; max: number }>();
  for (const p of scene.points) {
    const h = liftedHeightOf(scene, p.x);
    const cur = span.get(p.label);
    if (cur) {
      cur.min = Math.min(cur.min, h);
      cur.max = Math.max(cur.max, h);
    } else {
      span.set(p.label, { min: h, max: h });
    }
  }
  const a = span.get(labels[0]);
  const b = span.get(labels[1]);
  if (!a || !b) return null;
  if (a.max < cut && b.min > cut) return { below: labels[0], above: labels[1] };
  if (b.max < cut && a.min > cut) return { below: labels[1], above: labels[0] };
  return null;
}

export const kernelLiftsScene: ScenePlan<KernelLiftsScene> = {
  /**
   * 첫 장면은 줄과 눈금만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 배열을 참조로 쥐지 않는다 — 값만 꺼내 새 목록을 만든다 (S-scene). 러너 밖에서
   * 마운트하면 `initialData` 가 아예 없으므로 빈 장면으로 떨어진다.
   */
  initial(initialData: unknown): KernelLiftsScene {
    const d = fields(initialData) ?? {};
    const points: KernelPoint[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = p === null ? null : num(p.x);
        const label = p === null ? null : p.label;
        // 점 하나가 성하지 않으면 척도가 통째로 거짓이 된다. 빈 채로 선다 (C2).
        if (x === null || typeof label !== 'string') {
          return atStart({ points: [] });
        }
        points.push({ x, label });
      }
    }
    points.sort((a, b) => a.x - b.x);
    return atStart({ points });
  },

  reduce(scene: KernelLiftsScene, event: FacetRuntimeEvent): KernelLiftsScene {
    switch (event.type) {
      /* 점들이 줄 위에 내려앉는다. */
      case 'line-shown':
        return { ...scene, shown: true, step: { kind: 'line' } };

      /*
       * 자리 하나를 짚는다. 어느 자리인지는 `cutsOf` 가 정하고 몇 번째인지는 여기서
       * 센다. 칼이 걸어오는 앞 자리는 늘리기 **전**의 수로 셈해 계기값으로 싣는다.
       */
      case 'cut-tried': {
        const from = cutAt(scene, scene.tried - 1);
        return { ...scene, tried: scene.tried + 1, step: { kind: 'cut', from } };
      }

      /* 다 해 봤다. 칼은 물러나고 짚어 본 표식은 `tried` 가 쥔 채로 남는다. */
      case 'cut-exhausted':
        return { ...scene, exhausted: true, step: { kind: 'exhausted' } };

      /* 없던 쪽을 연다. 눈금이 세로 척도를 정한다. */
      case 'height-opened': {
        const ticks = numbers(fields(event.payload)?.ticks);
        if (ticks === null) return scene;
        return {
          ...scene,
          heights: [...ticks].sort((a, b) => a - b),
          step: { kind: 'open' },
        };
      }

      /* 한 무리가 오른다. 앞 장면의 목록을 제자리에서 늘리지 않는다 (S-scene). */
      case 'point-raised': {
        const p = fields(event.payload);
        const height = num(p?.height);
        const xs = numbers(p?.xs);
        if (height === null || xs === null) return scene;
        return {
          ...scene,
          risen: [...scene.risen, { height, xs }],
          step: { kind: 'raise' },
        };
      }

      /* 앉은 자리를 잇는다. */
      case 'curve-traced':
        return { ...scene, curve: true, step: { kind: 'curve' } };

      /* 곧은 선 하나가 그 높이에서 멈춘다. */
      case 'cut-placed': {
        const height = num(fields(event.payload)?.height);
        if (height === null) return scene;
        return { ...scene, cut: height, step: { kind: 'place' } };
      }

      /* 위아래를 물들인다. 어느 이름표가 어느 쪽인지는 `splitOf` 가 센다. */
      case 'split-verified':
        return { ...scene, split: true, step: { kind: 'verify' } };

      /* 마지막으로 그 선을 한 번 두드린다. */
      case 'done':
        return { ...scene, settled: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points });

      default:
        // 이 algorithm 이 발신하는 것은 위 열이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
