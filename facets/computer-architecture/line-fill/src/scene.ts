/**
 * LineFill 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 도 stage 도 `let` 을 하나도 쥐고 있지 않았다 (`destroyed` 와 rAF
 * 손잡이뿐). DOM 을 되읽는 자리도, 조회로 갈리는 분기도 없었다. 그것은 숨은
 * 상태가 없다는 뜻이 아니라 **화면이 통째로 상태**라는 뜻이다. 전부 stage 의
 * 타입 선언과 모듈 스코프 선언에 있었다.
 *
 * - `type Tone = 'plain' | 'asked' | 'tagalong'` — **선언만 있고 값이 어디에도
 *   저장되지 않는 타입.** 어느 칸이 부른 칸이고 어느 칸이 덤으로 온 칸인지가
 *   `rect` 의 `fill` · `stroke` · `stroke-dasharray` 에만 남았다.
 * - `const upperCells: Cell[]` — **위층에 지금까지 무엇이 올라와 있나.**
 *   `push` 로 알맹이가 제자리에서 자라고 `reset` 이 `length = 0` 으로 턴다.
 *   `const` 라 `let` 훑기를 통과한다. 이 조각의 결론(몇 줄이 올라왔나)이
 *   여기 있었다.
 * - `const slotFrames: SVGElement[]` — **그 줄이 이미 올라왔나**가 `stroke` 와
 *   `stroke-dasharray` 의 유무에만 있었다. 한 속성이 두 말을 싣던 자리다.
 * - `const mark` — 지금 부르는 칸을 가리키는 표. `opacity` 만 되돌리므로
 *   `transform` 이 앞 걸음의 자리로 남는 **재건 밖 요소**였다.
 * - `const lowerCells = new Map<number, Cell>()` — 아래층에서 무엇을 물었나가
 *   `paint(cell, 'asked')` 의 결과에만 쌓였다.
 *
 * 여기서는 그 전부가 목록 둘(`asks` · `risen`)과 국면 하나(`step`)에서
 * 파생된다.
 *
 * ── 조각의 결론이 그림과 같은 자료를 쓴다
 *
 * "몇 번 물었는데 몇 칸이 올라왔나" 는 옛 발신이 수로 실어 오던 것이다. 그러면
 * 캡션의 수와 화면의 칸이 다른 출처가 된다. 여기서는 **구조에서 센다** —
 * 물은 칸 목록의 길이와 올라온 줄 목록의 길이 × 줄당 원소 수다. 줄 번호를
 * 내는 셈만 `algorithm.ts` 가 함수로 내주고 장면이 그것을 부른다 (프로토콜
 * 4 절의 B 갈래).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표를 담지 않는다. 칸 폭도 줄이 앉는 자리도 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * `captionOf` 가 내고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { lineOf, perLineOf } from './algorithm.js';

/**
 * 지금 화면이 선 국면. 마지막 발신이 정한다.
 *
 * `null` 이면 아직 아무 걸음도 밟지 않았다 — 처음과 되감은 뒤.
 */
export type LineFillStep = 'ask' | 'rise' | 'tally';

export type LineFillScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 캐시 라인 하나가 덮는 바이트 수. */
  lineSize: number;
  /** 원소 하나가 차지하는 바이트 수. */
  elemSize: number;
  /** 차례로 부르는 색인. 화면에 세울 줄이 여기서 나온다. */
  requests: number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 물은 칸의 색인 — 부른 차례대로 쌓인다.
   *
   * 지워지지 않는다. 두 번째 물음이 첫 번째의 자국을 덮으면 "세 번 물었다" 가
   * 화면에서 사라지기 때문이다. 길이가 곧 결론의 왼쪽 수다.
   */
  asks: number[];
  /**
   * 올라온 줄의 번호 — 올라온 차례대로. 같은 줄을 두 번 물어도 한 번만 든다.
   *
   * 길이 × 줄당 원소 수가 곧 결론의 오른쪽 수다.
   */
  risen: number[];
  /** 지금 국면. */
  step: LineFillStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `asks` · `risen` · `step` 은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 다 올라온 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는 것이
 * 겹친다 (S-scene · 프로토콜 4 절).
 */
type Base = Pick<LineFillScene, 'lineSize' | 'elemSize' | 'requests'>;

/**
 * 되돌린 뒤의 장면 — 아래층만 있고 위층은 비어 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): LineFillScene {
  return {
    lineSize: base.lineSize,
    elemSize: base.elemSize,
    requests: base.requests,
    asks: [],
    risen: [],
    step: null,
  };
}

/**
 * `initialData` 를 좁힌다. 받는 자리가 `initial` 이므로 좁히개도 여기 있다.
 *
 * `requests` 는 **거르며 새 배열을 만든다** — 넘겨받은 배열을 참조로 쥐면
 * mechanism 이 제자리에서 고칠 때 바탕이 함께 굴러간다 (S-scene MUST).
 */
function readBase(data: unknown): Base {
  const d = (data ?? {}) as { lineSize?: unknown; elemSize?: unknown; requests?: unknown };
  const lineSize = typeof d.lineSize === 'number' && d.lineSize > 0 ? Math.floor(d.lineSize) : 16;
  const elemSize = typeof d.elemSize === 'number' && d.elemSize > 0 ? Math.floor(d.elemSize) : 4;
  const requests = Array.isArray(d.requests)
    ? d.requests.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    : [];
  return { lineSize, elemSize, requests };
}

/** 걸음이 싣는 유일한 판정 — 이번에 부른 칸. */
function askedIndex(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const index = (payload as { index?: unknown }).index;
  return typeof index === 'number' && Number.isFinite(index) && index >= 0 ? index : null;
}

/** 줄 하나에 드는 원소 수. 바탕에서 나온다. */
export function perLineIn(scene: LineFillScene): number {
  return perLineOf(scene.lineSize, scene.elemSize);
}

/** 그 색인이 속한 줄. 바탕에서 나온다. */
export function lineIn(scene: LineFillScene, index: number): number {
  return lineOf(index, scene.lineSize, scene.elemSize);
}

/**
 * 화면에 세우는 줄 — 부르는 색인이 건드리는 줄만, 번호 순으로.
 *
 * 바탕이 정하므로 자취와 무관하게 언제나 같다. 위층의 빈 자리도 아래층의 칸도
 * 이 목록이 정한다.
 */
export function linesIn(scene: LineFillScene): number[] {
  const seen = new Set<number>();
  for (const index of scene.requests) seen.add(lineIn(scene, index));
  return [...seen].sort((a, b) => a - b);
}

/** 그 줄에 드는 색인들 — 첫 색인부터 차례대로. */
export function indicesOfLine(scene: LineFillScene, line: number): number[] {
  const per = perLineIn(scene);
  const first = line * per;
  return Array.from({ length: per }, (_, k) => first + k);
}

/** 지금 부르고 있는 칸. `ask` 걸음에서만 뜻이 있다. */
export function askingIndex(scene: LineFillScene): number | null {
  const last = scene.asks[scene.asks.length - 1];
  return last === undefined ? null : last;
}

/**
 * 이번 걸음이 흐르게 할 것.
 *
 * `prev` 를 들추지 않고 장면 하나에서 나온다 — 무엇을 흐르게 할지도, 그 출발
 * 그림도 전부 여기서 셈한다 (S-scene MUST).
 */
export type LineFillMoving =
  | { kind: 'ask'; index: number }
  /** `fresh` 가 거짓이면 그 줄은 앞서 이미 올라와 있었다 — 흐를 것이 없다. */
  | { kind: 'rise'; line: number; fresh: boolean }
  | { kind: 'tally' };

export function movingOf(scene: LineFillScene): LineFillMoving | null {
  if (scene.step === 'ask') {
    const index = askingIndex(scene);
    return index === null ? null : { kind: 'ask', index };
  }
  if (scene.step === 'rise') {
    const index = askingIndex(scene);
    if (index === null) return null;
    const line = lineIn(scene, index);
    // 앞서 부른 칸 가운데 같은 줄에 든 것이 있으면 그 줄은 이미 올라와 있었다.
    // `risen` 의 끝을 보면 같은 줄을 연달아 부른 경우를 가르지 못한다.
    const before = scene.asks.slice(0, -1);
    const fresh = before.every((i) => lineIn(scene, i) !== line);
    return { kind: 'rise', line, fresh };
  }
  if (scene.step === 'tally') return { kind: 'tally' };
  return null;
}

/**
 * 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10).
 *
 * `tally` 의 두 수는 **목록의 길이에서** 나온다. 발신이 실어 오던 수를 그대로
 * 받으면 화면의 칸과 다른 출처가 된다 (프로토콜 4 절).
 */
export type LineFillCaption =
  | { kind: 'ask'; index: number; addr: number }
  | { kind: 'rise'; lo: number; hi: number }
  | { kind: 'tally'; asked: number; arrived: number };

export function captionOf(scene: LineFillScene): LineFillCaption | null {
  const moving = movingOf(scene);
  if (moving === null) return null;
  if (moving.kind === 'ask') {
    return { kind: 'ask', index: moving.index, addr: moving.index * scene.elemSize };
  }
  if (moving.kind === 'rise') {
    const lo = moving.line * scene.lineSize;
    return { kind: 'rise', lo, hi: lo + scene.lineSize - 1 };
  }
  return {
    kind: 'tally',
    asked: scene.asks.length,
    arrived: scene.risen.length * perLineIn(scene),
  };
}

export const lineFillScene: ScenePlan<LineFillScene> = {
  /**
   * 첫 장면은 무엇을 그릴지만 알고 아직 아무것도 부르지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): LineFillScene {
    return atStart(readBase(initialData));
  },

  reduce(scene: LineFillScene, event: FacetRuntimeEvent): LineFillScene {
    switch (event.type) {
      case 'ask': {
        const index = askedIndex(event.payload);
        if (index === null) return scene;
        return { ...scene, asks: [...scene.asks, index], step: 'ask' };
      }

      case 'line-rise': {
        // 어느 줄이 오는가는 직전 물음이 이미 말했다. 발신은 아무것도 싣지 않는다.
        const index = askingIndex(scene);
        if (index === null) return { ...scene, step: 'rise' };
        const line = lineIn(scene, index);
        const risen = scene.risen.includes(line) ? scene.risen : [...scene.risen, line];
        return { ...scene, risen, step: 'rise' };
      }

      case 'tally':
        return { ...scene, step: 'tally' };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          lineSize: scene.lineSize,
          elemSize: scene.elemSize,
          requests: scene.requests,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
