/**
 * LatencyLadder 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 코드에는 **변수가 하나도 없었다.** projector 의 `let` 0 건, stage 의 `let` 은
 * `destroyed` · `token` 둘뿐이라 둘 다 기계장치였고, 조회 분기도 DOM 되읽기도
 * 0 건이었다. 곧 **화면이 통째로 상태**였다는 뜻이고, 실제로 SVG 속성에 흩어져
 * 있었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `Row = { plank, stamp, tag, mult, cycles, nanos }` — **DOM 손잡이와 뜻이 한
 *   객체.** 이 조각이 층에 대해 아는 것 전부가 그 손잡이들의 속성에만 있었다.
 *   - `plank` 의 `fill` — 층의 형편. 넷(안 닿음 · 짚는 중 · 놓쳤다 · 찾았다)이
 *     한 속성에 실렸고 걸음마다 덮였다.
 *   - `plank` 의 `opacity` — **그 층이 아직 드러나지 않았나.** `resetScene` 의
 *     `i === 0 ? '1' : '0'` 한 줄에만 적혀 있었다.
 *   - `plank` 의 `height` — 찾은 층인가 (3 / 5).
 *   - `stamp` 의 `fill` — 지금 짚는 층인가.
 *   - `tag` 의 `opacity` — 이 층의 수치가 드러났나. 되돌리는 명령이 없어 **쌓이던**
 *     자리이고, 층마다의 배수가 끝 화면에 남는 것이 이 조각의 주장 자체였다
 *     (프로토콜 4 절 — 쌓이던 것이 정보였을 수 있다).
 *   - `mult` 의 글자 — 바로 위 층 대비 배수.
 * - `trails[i]` 의 `y2` — **어디까지 떨어졌나.** 낙하 자취의 길이가 곧 진행이었다.
 * - `marker` 의 `x` · `y` · `opacity` — 말이 몇 층에 서 있나. 좌표가 아니라 **어느
 *   국면인가**를 화면이 혼자 알고 있었다.
 * - `spanGroup` · `spanCapBottom` · `spanLink` · `spanLabel` 의 `opacity` 와
 *   `spanLine` 의 `y2` — 총배수 자를 세웠나.
 *
 * 여기서는 그 전부가 `reached` · `found` · `spanned` 세 값으로 줄었다. 층의 형편도
 * 자취의 길이도 말의 자리도 그 셋에서 파생된다.
 *
 * ── 수는 한 출처에서만 나온다 — 걸음이 실어 오는 것이 없다
 *
 * 화면에는 층마다 사이클 수 · 나노초 · 배수가 계단참과 **나란히** 뜨고, 왼쪽 자가
 * 총배수를 말한다. 그 수와 계단참의 세로 자리가 다른 출처에서 오면 그림이 제 안에서
 * 거짓이 된다. 그래서 **다섯 발신 모두 payload 가 비어 있다.**
 *
 * - **바탕 + 순수 함수로 나오는 것은 `algorithm.ts` 의 함수를 부른다.** 층 목록
 *   좁히기(`latencyLevelsOf`) · 층별 셈(`latencyRungs`) · 총배수(`latencySpanFactor`)
 *   가 그것이다 (프로토콜 4 절의 B 갈래). 장면이 `algorithm.ts` 를 import 하는
 *   방향은 원칙 1 이 허용한다 — 장면이 projector 자리를 잇는다.
 *
 *   **내주어도 조각이 피하려는 셈을 장면이 대신 하게 되지 않는다.** 이 조각의
 *   알고리즘은 "없으면 한 층 더 내려간다" 는 **순회**이고 그것은 algorithm 에
 *   남아 있다. 내준 셋은 층 목록만 있으면 정해지는 잣대라 떼어 내도 주장이 남는다.
 * - **몇 번째 층인가는 발신이 온 차례가 말한다.** `miss` 는 올 때마다 한 층씩
 *   내려가므로 `reached` 가 곧 그 층의 자리다. 그래서 `ask`/`hit` 의 `level` 도
 *   `miss` 의 `from`/`to` 도 걷어냈다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 계단참의 가로세로도 자의 자리도 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). **세로 축척은 층 목록 전체에서 한 번에 정해진다** —
 * 드러난 층만으로 다시 잡으면 층이 늘 때마다 앞 계단참이 자리를 옮긴다.
 *
 * 문안도 담지 않는다. `captionFor` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  latencyLevelsOf,
  latencyRungs,
  latencySpanFactor,
  type LatencyRung,
} from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 자리는 `reached` 가 이미 말한다 (`descend` 는 한 층
 * 위에서 출발한다). `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type LatencyStep =
  /** 코어가 첫 층에 묻는다. 말이 나타나 첫 계단참으로 떨어진다. */
  | { kind: 'ask' }
  /** 한 층 내려간다. 계단참 끝까지 걸어가 아래로 떨어진다. */
  | { kind: 'descend' }
  /** 여기서 찾았다. 그 자리에서 튀어오른다. */
  | { kind: 'found' }
  /** 총배수 자가 위에서 아래로 그어진다. */
  | { kind: 'span' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type LatencyCaption =
  /** 가장 가까운 층부터 묻는다. */
  | { kind: 'ask'; level: string }
  /** 거기 없다. 한 층 더 내려간다. */
  | { kind: 'miss'; level: string }
  /** 여기서 찾았다. 든 사이클. */
  | { kind: 'hit'; cycles: number }
  /** 같은 한 번 찾기인데 맨 위와 맨 아래의 차이. */
  | { kind: 'span'; factor: number };

/** 층 하나의 형편. **채움이 말하는 축**이다 (표식은 테두리가 따로 맡는다). */
export type LatencyRungState =
  /** 아직 묻지 않았다. */
  | 'idle'
  /** 지금 여기에 물어보는 중 — 있을지 없을지 아직 모른다. */
  | 'probing'
  /** 여기엔 없었다. */
  | 'missed'
  /** 여기서 찾았다. */
  | 'found';

export type LatencyLadderScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 층마다의 셈, 가까운 것부터. 자리 번호가 곧 층의 깊이다.
   *
   * 걸음이 실어 오지 않는다 — 선언의 층 목록에서 결정되는 표라 `algorithm.ts` 가
   * 내준 `latencyRungs` 하나를 지난다 (프로토콜 4 절 B 갈래). 세로 축척도 이
   * 목록 **전체**에서 나오므로 층이 드러나도 앞 계단참이 움직이지 않는다.
   */
  rungs: readonly LatencyRung[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 말이 지금 서 있는 층의 자리. 아직 묻지 않았으면 -1.
   *
   * 이 하나가 "어디까지 내려왔나" 를 통째로 말한다 — 드러난 계단참도, 그어진 낙하
   * 자취도, 수치가 뜬 층도 전부 여기서 파생된다.
   */
  reached: number;
  /** `reached` 층에서 값을 찾았나. 찾기 전에는 그 층이 아직 미정이다. */
  found: boolean;
  /** 첫 층에서 마지막 층까지를 한 자로 재었나. */
  spanned: boolean;

  step: LatencyStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `reached` 이후 셋은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미
 * 다 내려간 계단과 총배수 자를 단 채로 서고 그 위에 새 주행이 겹친다 (S-scene).
 */
type Base = Pick<LatencyLadderScene, 'rungs'>;

/**
 * 아직 아무 층에도 묻지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): LatencyLadderScene {
  return { rungs: base.rungs, reached: -1, found: false, spanned: false, step: null };
}

/** 자리의 층. 범위 밖이면 null. */
export function rungAt(scene: LatencyLadderScene, index: number): LatencyRung | null {
  return scene.rungs[index] ?? null;
}

/** 말이 지금 선 층. 아직 묻지 않았으면 null. */
export function currentRung(scene: LatencyLadderScene): LatencyRung | null {
  return scene.reached < 0 ? null : rungAt(scene, scene.reached);
}

/**
 * 층의 형편 — **채움이 말하는 축.**
 *
 * 옛 화면은 여기에 "지금 짚는 층" 이라는 표식까지 함께 실어, 다음 걸음이 그것을
 * 덮으며 형편을 갈아 버렸다. 표식은 테두리가 따로 맡는다 (프로토콜 4 절 —
 * 한 축에 값을 셋 이상 욱여넣지 않는다).
 */
export function stateOf(scene: LatencyLadderScene, index: number): LatencyRungState {
  if (scene.reached < 0 || index > scene.reached) return 'idle';
  if (index < scene.reached) return 'missed';
  return scene.found ? 'found' : 'probing';
}

/**
 * 화면에 선 계단참의 수.
 *
 * 묻기 전에도 첫 계단참 하나는 서 있다 — 코어가 무엇에 묻는지 보이지 않으면 첫
 * 걸음이 허공에서 시작한다. 아직 없는 층은 **숨기지 않고 짓지 않는다** (프로토콜
 * 4 절 — 숨기면 앞 걸음의 속성이 함께 남는다).
 */
export function shownCount(scene: LatencyLadderScene): number {
  if (scene.rungs.length === 0) return 0;
  return Math.min(scene.rungs.length, Math.max(scene.reached + 1, 1));
}

/**
 * 이미 그어진 낙하 자취의 수. 자취 `i` 는 층 `i` 에서 `i + 1` 로 떨어진 자국이다.
 *
 * 길이 0 짜리 선을 미리 지어 두지 않으려고 세어 둔다 (프로토콜 4 절 17).
 */
export function trailCount(scene: LatencyLadderScene): number {
  return Math.max(0, scene.reached);
}

/**
 * 첫 층 대비 마지막 층의 총 배수. 이 조각의 결론이다.
 *
 * 계단참의 세로 자리와 **같은 층 목록**에서 나온다 — 발신이 실어 오던 수를 걷어낸
 * 자리다 (프로토콜 4 절 — 조각의 결론이 그림과 같은 자료를 쓰게 한다).
 */
export function spanFactorOf(scene: LatencyLadderScene): number | null {
  return latencySpanFactor(scene.rungs);
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 하고, 장면에 캡션 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: LatencyLadderScene): LatencyCaption | null {
  const rung = currentRung(scene);
  if (rung === null) return null;
  if (scene.spanned) {
    const factor = spanFactorOf(scene);
    return factor === null ? null : { kind: 'span', factor };
  }
  if (scene.found) return { kind: 'hit', cycles: rung.cycles };
  return scene.reached === 0 ? { kind: 'ask', level: rung.id } : { kind: 'miss', level: rung.id };
}

export const latencyLadderScene: ScenePlan<LatencyLadderScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — `latencyLevelsOf` 와 `latencyRungs` 가 새
   * 배열과 새 객체를 낸다 (S-scene).
   */
  initial(initialData: unknown): LatencyLadderScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    // 좁히는 잣대는 algorithm 이 내준 하나다 — 두 군데서 좁히면 걸음 수와 층 수가 갈린다.
    return atStart({ rungs: latencyRungs(latencyLevelsOf(d.levels)) });
  },

  reduce(scene: LatencyLadderScene, event: FacetRuntimeEvent): LatencyLadderScene {
    switch (event.type) {
      /*
       * 코어가 가장 가까운 층에 묻는다. 어느 층인지 실어 오지 않는다 — 가장 가까운
       * 층은 언제나 목록의 첫 자리다.
       */
      case 'ask':
        if (scene.rungs.length === 0) return scene;
        return { ...scene, reached: 0, found: false, spanned: false, step: { kind: 'ask' } };

      /*
       * 한 층 내려간다. 몇 층인지도 그 층의 수치도 실어 오지 않는다 — 한 번에 한
       * 층씩 내려가므로 `reached + 1` 이 곧 그 층이고, 그 층의 수치는 바탕의
       * `rungs` 가 쥔다. algorithm 도 같은 목록을 걸어가므로 어긋날 수 없다.
       */
      case 'miss':
        // 선언된 층보다 많이 내려오면 갈 데가 없다. 조용히 흘린다 (C2).
        if (scene.reached < 0 || scene.reached >= scene.rungs.length - 1) return scene;
        return { ...scene, reached: scene.reached + 1, step: { kind: 'descend' } };

      /*
       * 여기서 찾았다. 층을 옮기지 않고 그 층의 형편만 정해진다 — `probing` 이던
       * 계단참이 `found` 가 된다.
       */
      case 'hit':
        if (scene.reached < 0 || scene.found) return scene;
        return { ...scene, found: true, step: { kind: 'found' } };

      /*
       * 첫 층에서 마지막 층까지를 한 자로 잰다. 총배수는 실어 오지 않는다 —
       * 계단참의 자리를 정한 것과 같은 층 목록에서 나온다.
       */
      case 'span':
        if (!scene.found || scene.rungs.length < 2) return scene;
        return { ...scene, spanned: true, step: { kind: 'span' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ rungs: scene.rungs });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
