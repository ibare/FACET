/**
 * LeadingZerosTell 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에 **넷**이 흩어져 있었다. projector 는 아무것도 쥐지 않았다.
 *
 * - `let notchY: number | null` — **눈금이 선 칸.** 이 조각의 주장 자체다. 그런데
 *   올라서는 운동의 출발값을 여기서 되읽었고 (`notchY ?? notchHome`), 되감으면
 *   `clearAll()` 이 null 로 밀어 통째로 사라졌다.
 * - `Number(beam.getAttribute('height'))` · `Number(beam.getAttribute('x'))` —
 *   **빔이 지금 얼마나 올라 있나를 DOM 속성에서 도로 꺼냈다.** 물러나는 운동의
 *   출발값이라 되짚어 세운 직후에는 그것이 아직 옛 화면의 값이었다.
 * - `type Tile = { group, mark, firstOne }` — DOM 손잡이 셋이 한 객체에 묶여
 *   **"첫 1 이 어디냐"** 를 들고 있었다. `mark` 의 `display` 속성 유무가 곧 "표가
 *   얹혔나", `firstOne` 의 `fill` 이 곧 "읽혔나" 였다.
 * - `pillText.textContent` 와 `notch` 의 `display` — **추정값과 "눈금이 섰나"가
 *   문자열과 속성에만 있었다.** 둘 다 재건 밖 요소라 되짚기가 지나가도 앞 걸음의
 *   문자가 남았다.
 *
 * 여기서는 그 넷이 `seen` 하나에서 파생된다.
 *
 * ── 화면에 나란히 뜨는 세 수가 한 함수를 지난다
 *
 * 이 조각은 앞선 0 의 수(ρ) · 눈금의 칸 · 추정값 셋을 **한 화면에 나란히** 띄운다.
 * 그 셋이 서로 다른 출처에서 나오면 그림이 제 안에서 거짓이 된다 (실제로 눈금은
 * `let` 이, 추정값은 payload 가, 표의 자리는 또 payload 의 ρ 가 정하고 있었다).
 *
 * 그래서 걸음은 **아무것도 실어 오지 않는다.** 몇 번째 열쇠인지조차 발신이 오는
 * 순서가 이미 말하므로, 흘러간 수(`seen`) 하나에서 전부 셈한다.
 *
 *   차례         = `scene.seen`                   — 발신이 오는 순서가 곧 번호다
 *   ρ           = `rhoOf(keys[차례].bits)`        — 표의 자리도 캡션의 {p} 도 이것
 *   눈금         = `notchOf(keys, seen)`          — 지나간 열쇠들의 ρ 중 최댓값
 *   추정값       = `estimateOf(눈금)`             — 딱지의 수도 캡션의 {n} 도 이것
 *   올라섰나      = `notchOf(seen) > notchOf(seen-1)`
 *   올라설 출발   = `notchOf(seen-1)`             — `prev` 도 계기값도 필요 없다
 *
 * **눈금은 오르기만 한다.** 되돌림이 없어 누적으로 남는데 그 누적이 곧 주장이다 —
 * 그래서 일부러 장면이 말하게 하고 정적 그리기가 매번 세운다 (S-scene).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 사다리 칸 수 · 칸 간격 · 빔이 닿는 높이는 전부 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지
 * 는 `step` 이 이미 가르므로 캡션 필드를 따로 두지 않고, 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readKeys, type LeadingZerosTellKey } from './algorithm.js';

/**
 * 흘러오는 열쇠 하나의 모양. algorithm 이 선언한 것을 그대로 다시 내놓는다.
 *
 * 그리는 쪽은 장면만 알면 되게 여기서 통로를 낸다 — stage 가 algorithm 을 직접
 * 참조하지 않는다 (원칙 1). 장면과 algorithm 양쪽을 아는 것은 이 층의 일이다.
 */
export type { LeadingZerosTellKey };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 출발 그림이 필요한 자리(눈금이 올라설 출발 칸,
 * 흘러 나가는 앞 열쇠)가 전부 `seen` 에서 셈해지기 때문이다. `prev` 를 들출 일도
 * 없다 (S-scene).
 *
 * 캡션도 이것이 가른다. 세 갈래가 캡션 세 갈래와 정확히 겹치므로 필드를 따로
 * 두면 같은 것을 두 자리에서 말하는 꼴이 된다.
 */
export type LeadingZerosTellStep =
  /** 열쇠가 흘러 들어와 읽힌다. 빔이 첫 1 의 자리까지 오르고 눈금은 그대로다. */
  | { kind: 'read' }
  /** 그 빔이 지금 눈금보다 높다 — 눈금이 한 칸 올라선다. */
  | { kind: 'rise' }
  /** 마지막 열쇠가 흘러 나가고 눈금 하나만 남는다. */
  | { kind: 'settle' };

export type LeadingZerosTellScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 흘러오는 열쇠들. 배열의 차례가 곧 발신이 오는 차례다.
   *
   * algorithm 과 **같은 좁히개**(`readKeys`)를 지난 배열이라 차례가 갈릴 수 없다.
   * 발신이 번호를 싣지 않으므로 이 한 벌이 어긋나면 막을 것이 없다 — 잣대를 두 벌
   * 두면 어긋난 줄 하나에 온 화면이 한 칸씩 밀린다.
   */
  keys: readonly LeadingZerosTellKey[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 지금까지 흘러간 열쇠의 수.
   *
   * **이 수 하나가 눈금과 추정값과 올라섬 여부를 전부 정한다.** 본 것을 하나도
   * 간직하지 않고 세는 것이 이 조각의 주장이라, 장면이 쥐는 것도 그 수 하나다.
   */
  seen: number;
  /** 판 위에 서 있는 열쇠의 차례. null 이면 판이 비어 있다 — 처음과 끝. */
  reading: number | null;

  step: LeadingZerosTellStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `seen` 과 `reading` 은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 오른 눈금을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 흘려보내는
 * 것이 겹친다 (S-scene · 프로토콜 4 절).
 */
type Base = Pick<LeadingZerosTellScene, 'keys'>;

/**
 * 되돌린 뒤의 장면 — 사다리만 서 있고 눈금도 열쇠도 없다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): LeadingZerosTellScene {
  return { keys: base.keys, seen: 0, reading: null, step: null };
}

/**
 * ρ — 첫 1 이 선 자리 (= 앞선 0 의 개수 + 1).
 *
 * **화면의 표가 앉는 자리도, 빔이 닿는 눈금도, 캡션의 {p} 도 이 한 함수에서
 * 나온다.** 모두 0 이면 자리 수 + 1 이 된다 — 이 데이터에는 없지만 셈이 무너지지
 * 않게 둔다.
 */
export function rhoOf(bits: string): number {
  let zeros = 0;
  while (zeros < bits.length && bits[zeros] === '0') zeros += 1;
  return zeros + 1;
}

/**
 * 사다리를 몇 칸으로 세우나 — 바탕 자료에서 **한 번에** 센다.
 *
 * 걸음마다 자라는 셈을 쓰면 열쇠가 하나 더 지날 때마다 칸 간격이 통째로 갈린다
 * (`find-root` 가 색판 씨앗에서 같은 데 걸렸다).
 */
export function rungCountOf(keys: readonly LeadingZerosTellKey[]): number {
  let top = 1;
  for (const row of keys) {
    const rho = rhoOf(row.bits);
    if (rho > top) top = rho;
  }
  return top;
}

/**
 * 열쇠 `count` 개가 지나간 뒤 눈금이 선 칸. 0 이면 아직 안 섰다.
 *
 * 지나간 것들의 ρ 중 최댓값이므로 **오르기만 한다.** 걸음마다 쌓아 두는 대신
 * 매번 다시 세는 까닭은, `reduce` 가 멱등해지고 되짚기가 어느 걸음에서 오든 같은
 * 수를 얻기 때문이다.
 */
export function notchOf(keys: readonly LeadingZerosTellKey[], count: number): number {
  let max = 0;
  const end = Math.min(count, keys.length);
  for (let i = 0; i < end; i += 1) {
    const rho = rhoOf(keys[i].bits);
    if (rho > max) max = rho;
  }
  return max;
}

/**
 * 눈금 하나가 말하는 추정값 — 2^눈금. 눈금이 안 섰으면 0.
 *
 * 딱지에 새기는 수와 끝 캡션의 {n} 이 같은 자리에서 나온다.
 */
export function estimateOf(notch: number): number {
  return notch <= 0 ? 0 : 2 ** notch;
}

export const leadingZerosTellScene: ScenePlan<LeadingZerosTellScene> = {
  /**
   * 첫 장면은 흘러올 열쇠들만 알고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). `readKeys` 가 줄마다 새 객체를 담은 새 배열을 낸다.
   */
  initial(initialData: unknown): LeadingZerosTellScene {
    return atStart({ keys: readKeys(initialData) });
  },

  reduce(scene: LeadingZerosTellScene, event: FacetRuntimeEvent): LeadingZerosTellScene {
    switch (event.type) {
      /*
       * 열쇠 하나가 판 위로 흘러 들어온다.
       *
       * **payload 가 없다.** 몇 번째 열쇠인지는 발신이 오는 순서가 이미 말하므로,
       * 지금까지 흘러간 수(`seen`)가 곧 이 열쇠의 번호다. 이름도 비트도 ρ 도 눈금도
       * 추정값도 바탕과 셈이 쥐고 있어, 무엇 하나라도 실어 받으면 화면에 나란히 뜨는
       * 수가 두 출처에서 나오는 꼴이 된다 (프로토콜 4 절 "payload 가 친절하면 오히려
       * 위험하다").
       */
      case 'key-read': {
        // 있는 열쇠보다 많이 오면 흘린다 — 바탕이 셈의 상한이다 (C2).
        if (scene.seen >= scene.keys.length) return scene;
        const reading = scene.seen;
        const seen = reading + 1;
        // 올라섰나는 지나간 개수 둘을 견주어 안다 — algorithm 의 `record` 를 받지 않는다.
        const rose = notchOf(scene.keys, seen) > notchOf(scene.keys, reading);
        return { ...scene, seen, reading, step: { kind: rose ? 'rise' : 'read' } };
      }

      // 마지막 열쇠가 흘러 나간다. 눈금은 그대로 남고 판만 빈다.
      case 'done':
        return { ...scene, reading: null, step: { kind: 'settle' } };

      case 'rewind':
        // 사다리만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ keys: scene.keys });

      default:
        // 이 algorithm 이 발신하는 것은 위 셋이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
