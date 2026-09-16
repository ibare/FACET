/**
 * SpaceErrorTradeoff 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **네 자리**에 흩어져 있었다.
 *
 * - `let curWidth` — 표가 지금 몇 칸인가. 다음 폭으로 갈라질 때 **칸이 어디서
 *   출발하는지**를 정하는 값이라, 되짚어 세운 직후에는 옛 화면의 폭이었다.
 * - `let curEstimates` — 막대가 지금 선 높이. 다음 걸음의 보간 출발값이고 흐린
 *   눈금을 남길 자리이기도 했다. 이 조각의 주장("앞서 얼마나 부풀어 있었나")이
 *   통째로 이 배열에 있었다.
 * - `type CellNode = { rect, label, strip, birthX, finalX, count }` — **DOM 손잡이와
 *   뜻·수치가 한 객체에 묶인 것.** 칸이 어디서 나왔고 어디로 가며 무슨 값을 이고
 *   있나가 `let cells` 배열에만 적혀 있었다. `let` 이지만 이름에 상태라는 티가
 *   없어 눈으로만 보인다.
 * - `tableGroup` · `ghostGroup` 의 자식 유무 — 표가 이미 갈라졌나, 흐린 눈금을
 *   몇 벌 남겼나. `textContent = ''` 로 비우고 다시 채우는 식이라 걸음 밖에서는
 *   알 길이 없었다.
 *
 * 여기서는 그 넷이 `passes` 하나다. 폭마다 표 하나이고, 그 목록의 차례가 곧
 * "몇 번째로 좁은 표인가" 다. 지금 폭도, 앞 폭도, 남은 눈금도 여기서 나온다.
 *
 * ── 수는 한 출처에서만 나온다 — 표의 칸
 *
 * 이 조각은 **자리 수와 부푼 양을 화면에 나란히 띄운다.** 그 둘이 갈리면 그림이
 * 제 안에서 거짓이 된다. 그래서 걸음이 실어 오는 것은 둘뿐이다 — 표의 칸 값
 * (`counts`) 과 키가 앉는 칸(`slots`). 나머지는 전부 여기서 센다.
 *
 * - **읽힌 값을 받지 않는다.** 읽힌 값은 "그 키가 앉은 칸들 중 가장 작은 것" 이고,
 *   그 칸들은 화면에 그려져 있다. `estimatesOf` 가 그린 칸에서 직접 읽으므로
 *   막대의 높이가 표의 값과 갈릴 자리가 없다.
 * - **부푼 양과 정확히 맞은 수를 받지 않는다.** 읽힌 값에서 파생되는 셈이다
 *   (`overshootOf` · `exactCountOf`).
 * - **폭 · 줄 수 · 칸 수 · 센 항목 수를 받지 않는다.** 표의 꼴은 `counts` 행렬이
 *   그대로 말하고 (줄 수는 행렬의 길이, 폭은 한 줄의 길이), 센 항목 수는 키와
 *   반복 횟수가 정한다.
 * - **`done` 의 네 수를 받지 않는다.** 견줌의 양 끝은 첫 폭과 마지막 폭이고
 *   둘 다 `passes` 에 그대로 있다. `done` 은 payload 가 없다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄·칸 번호와 키의 차례라는 **구조**만 담고, 칸 폭도 막대의
 * 세로 축척도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도
 * 담지 않는다 — 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10). 그래서 캡션에는 인자가 하나도 없다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 한 폭에서의 표.
 *
 * 표의 꼴을 따로 담지 않는다 — `counts` 행렬이 곧 표다. 줄 수는 `counts.length`,
 * 폭은 `counts[0].length` 이므로 두 자리에서 셀 여지가 없다.
 */
export type SketchPass = {
  /** 줄 × 칸 의 칸 값. 스트림을 다 센 뒤의 값이다. */
  counts: readonly (readonly number[])[];
  /**
   * `slots[k][r]` — 키 k 가 줄 r 에서 앉는 칸 번호.
   *
   * 이중 해싱의 결과라 장면이 스스로 셀 수 없는 유일한 구조다. 이것이 있어야
   * 읽힌 값을 **그려진 칸에서** 읽을 수 있다.
   */
  slots: readonly (readonly number[])[];
  /** 키를 모두 되읽었나. 읽기 전에는 막대가 앞 폭의 높이에 서 있다. */
  read: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 갈라지기 전의 폭도, 막대가 떠나는 높이도, 처음 부풀었던
 * 높이도 전부 `passes` 에서 셈해진다. 그러니 `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type TradeoffStep =
  /** 표가 새 폭으로 갈라지고 칸에 셈이 찬다. */
  | { kind: 'split' }
  /** 키를 되읽어 막대가 새 높이로 옮겨 간다. */
  | { kind: 'reads' }
  /** 가장 좁았을 때까지 부풀었다 지금 높이로 내려앉는다. */
  | { kind: 'swell' };

/**
 * 캡션이 말할 것. 인자가 없다 — 수는 전부 장면에서 셈해진다.
 *
 * 수를 여기 실으면 화면의 칸·막대와 갈릴 자리가 생긴다 (프로토콜 4 절 "화면에
 * 나란히 뜨는 수는 한 함수를 지나야 한다").
 */
export type TradeoffCaption = { kind: 'stage' } | { kind: 'reads' } | { kind: 'done' };

export type SpaceErrorTradeoffScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 스트림에 등장하는 키. 차례가 곧 막대의 자리다. */
  keys: readonly string[];
  /** 키 하나가 흐르는 횟수 = 그 키의 참값. */
  repeats: number;
  /**
   * 견줘 볼 폭, 선언된 순서대로.
   *
   * 칸 폭을 고정하려면 가장 넓은 폭을 미리 알아야 해서 바탕에 둔다. 표가 지금
   * 몇 칸인지는 여기서 꺼내지 않고 `passes` 의 `counts` 가 말한다.
   */
  widths: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 폭마다 하나씩, 좁은 것부터. 마지막이 지금 화면의 표다.
   *
   * **남는 자취**다 — 앞서 얼마나 부풀어 있었나가 흐린 눈금으로 쌓이는 것이 이
   * 조각의 주장 자체이므로 정적 그리기에도 들어간다 (S-scene).
   */
  passes: readonly SketchPass[];

  step: TradeoffStep | null;
  caption: TradeoffCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `passes` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 앞 주행의
 * 표와 눈금을 단 채로 서고 그 위에 algorithm 이 새로 세는 것이 겹친다 (S-scene).
 */
type Base = Pick<SpaceErrorTradeoffScene, 'keys' | 'repeats' | 'widths'>;

/**
 * 아무 표도 갈라지지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): SpaceErrorTradeoffScene {
  return {
    keys: base.keys,
    repeats: base.repeats,
    widths: base.widths,
    passes: [],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? (v as unknown[]).map((n) => num(n) ?? 0)
    : [];
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === 'string') : [];
}

/** 수의 행렬. 줄마다 새 배열을 낸다 — 넘겨받은 배열을 쥐지 않는다. */
function matrix(v: unknown): number[][] {
  return Array.isArray(v) ? (v as unknown[]).map((row) => nums(row)) : [];
}

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 캡션도 막대도 표도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 스트림의 길이. 막대 세로 축척의 상한이기도 하다 — 칸 하나가 전부를 이고 있는 경우. */
export function totalOf(scene: SpaceErrorTradeoffScene): number {
  return Math.max(1, scene.keys.length * scene.repeats);
}

/** 그 표의 줄 수. */
export function depthOf(pass: SketchPass): number {
  return pass.counts.length;
}

/** 그 표의 폭. 줄이 하나도 없으면 0. */
export function widthOf(pass: SketchPass): number {
  return pass.counts[0]?.length ?? 0;
}

/** 그 표의 칸 수. 캡션의 `{cells}` 와 견줌의 양 끝이 이 한 함수에서 나온다. */
export function cellsOf(pass: SketchPass): number {
  return depthOf(pass) * widthOf(pass);
}

/**
 * 키마다 읽히는 값 — 그 키가 앉은 칸들 중 **가장 작은 것**.
 *
 * `counts` 는 화면에 그려지는 그 행렬이다. 막대의 높이가 그린 칸에서 직접 나오므로
 * 둘이 갈릴 수 없다.
 */
export function estimatesOf(scene: SpaceErrorTradeoffScene, pass: SketchPass): number[] {
  return scene.keys.map((_key, k) => {
    const rows = pass.slots[k] ?? [];
    let est = Number.POSITIVE_INFINITY;
    for (let r = 0; r < pass.counts.length; r += 1) {
      const col = rows[r];
      const value = col === undefined ? undefined : pass.counts[r]?.[col];
      if (value !== undefined && value < est) est = value;
    }
    // 앉은 칸을 하나도 못 찾았으면 셀 것이 없다 — 0 으로 떨어뜨린다.
    return Number.isFinite(est) ? est : 0;
  });
}

/** 부푼 양의 합 = Σ(읽힌 값 − 참값). 값은 모자랄 수 없으므로 언제나 0 이상이다. */
export function overshootOf(scene: SpaceErrorTradeoffScene, estimates: readonly number[]): number {
  return estimates.reduce((sum, est) => sum + (est - scene.repeats), 0);
}

/** 정확히 맞은 키 수. */
export function exactCountOf(
  scene: SpaceErrorTradeoffScene,
  estimates: readonly number[],
): number {
  return estimates.filter((est) => est === scene.repeats).length;
}

/** 지금 화면의 표. 아직 아무 폭도 갈라지지 않았으면 null. */
export function currentPass(scene: SpaceErrorTradeoffScene): SketchPass | null {
  return scene.passes[scene.passes.length - 1] ?? null;
}

/**
 * 되읽기를 마친 표들, 좁은 것부터.
 *
 * 마지막이 지금 막대가 선 높이를 정하고 그 앞의 것들이 흐린 눈금으로 남는다 —
 * "앞서 이만큼 부풀어 있었다" 가 같은 자 위에 쌓인다.
 */
export function readPasses(scene: SpaceErrorTradeoffScene): SketchPass[] {
  return scene.passes.filter((pass) => pass.read);
}

export const spaceErrorTradeoffScene: ScenePlan<SpaceErrorTradeoffScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `strs` 와 `nums` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): SpaceErrorTradeoffScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const widths = nums(d.widths)
      .map((w) => Math.trunc(w))
      .filter((w) => w > 0);
    return atStart({
      keys: strs(d.keys),
      repeats: Math.max(1, Math.trunc(num(d.repeats) ?? 1)),
      // 폭이 하나도 안 왔으면 칸 하나짜리 표로 둔다 — 칸 폭 역산이 0 으로 나눌 수 없게.
      widths: widths.length > 0 ? widths : [1],
    });
  },

  reduce(scene: SpaceErrorTradeoffScene, event: FacetRuntimeEvent): SpaceErrorTradeoffScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 새 폭의 표가 선다. 표의 꼴은 `counts` 가 그대로 말하므로 폭도 줄 수도
       * payload 에서 받지 않는다.
       */
      case 'stage-begin': {
        const counts = matrix(p.counts);
        if (counts.length === 0) return scene;
        return {
          ...scene,
          passes: [...scene.passes, { counts, slots: matrix(p.slots), read: false }],
          step: { kind: 'split' },
          caption: { kind: 'stage' },
        };
      }

      /*
       * 키를 모두 되읽는다. 읽힌 값은 payload 가 아니라 방금 선 표에서 나오므로
       * 이 걸음이 실어 올 것은 없다 — 표식만 세운다.
       */
      case 'reads-taken': {
        const last = scene.passes.length - 1;
        if (last < 0) return scene;
        // 앞 장면을 제자리에서 고치지 않는다. 목록도 원소도 새로 만든다 (S-scene).
        const passes = scene.passes.map((pass, i) => (i === last ? { ...pass, read: true } : pass));
        return { ...scene, passes, step: { kind: 'reads' }, caption: { kind: 'reads' } };
      }

      /*
       * 할 말을 마치고 양 끝을 견준다. 표도 막대도 그대로 두고 캡션만 바뀐다 —
       * 흐르는 것은 "가장 좁았을 때까지 부풀었다 내려앉기" 한 번이다.
       */
      case 'done':
        return { ...scene, step: { kind: 'swell' }, caption: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ keys: scene.keys, repeats: scene.repeats, widths: scene.widths });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
