/**
 * bitShift 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 붙박이 칸 한 줄이 있고 그 위를 비트 무리가 통째로 미끄러진다. 칸 위에는 자리의
 * 무게(128 … 1)가 적혀 있어, 비트가 한 칸 옮겨 앉으면 그 비트가 올라선 무게가
 * 배가 되거나 반이 되는 것이 눈에 보인다. 끝을 넘어간 비트는 그릇 밖으로 나가
 * 버려진다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 stage 에는 `let` 이 둘뿐이었다 (`tokens` · `destroyed`). 그런데 그
 * `tokens` 하나가 **화면의 거울**이었다 —
 *
 * - **`let tokens: Token[]`** 과 그 안의 **`Token.slot`** — 지금 어느 칸에 비트가
 *   서 있나. `shift()` 가 `t.slot` 을 **운동의 출발값으로 되읽었다**. `getAttribute`
 *   도 `textContent` 도 안 쓰니 ④ 의 grep 을 통과하지만 병은 같다 (함정 28) —
 *   되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 칸이 엉뚱한 자리에서 출발한다.
 *   이제 출발 그림은 `was` 가 말한다.
 * - **`Token = { g, rect, slot }`** — DOM 손잡이와 칸 번호가 한 객체에 묶여 있어
 *   어떤 `let` 목록에도 안 걸렸다 (⑤).
 * - **`placeLabels` 의 `fill` · `font-weight`** — **어느 자리가 켜져 있나**. 값이
 *   저장되는 곳이 아예 없고 칠에만 있었다. 이제 `bits` 가 말한다.
 * - **`rect` 의 `fill = danger`** — **이 비트는 버려진다**. 그 칠은 같은 걸음의
 *   `syncTokens` 가 곧바로 지워, **떨어져 나간 비트가 어디로 갔는지가 화면에
 *   하나도 남지 않았다** (함정 11 — 아예 없던 상태). 이제 `dropped` 가 말하고
 *   정적 그리기가 그릇 밖에 유령을 세운다.
 * - **`type Scene = { bitCount: number }`** — 이름이 부딪히는 자리였다 (함정 21).
 *   칸 수는 `bits` 의 길이가 이미 말하므로 장면은 쥐지 않는다.
 *
 * ── 화면에 나란히 뜨는 수는 한 자로 잰다
 *
 * 걸음이 실어 오던 `value` · `factor` · `exact` · `shiftCount` · `dropped` 를 전부
 * 걷어냈다. 값은 **비트열이 뜻하는 수**이므로 비트를 세면 나오고 (그래서 화면의
 * 비트와 글자의 수가 갈릴 길이 없다 — 함정 10), 곱하는 수는 `2 ** shiftCount`,
 * 버림 없는 셈은 시작값에 그것을 먹인 값이다. 몇 칸 밀었나도 `shift` 가 올 때마다
 * 하나씩 쌓이므로 장면이 센다.
 *
 * 남긴 것은 `bits` 하나다. 그릇 폭으로 잘린 밀기(`start << n & mask`)는 **이 조각의
 * 알고리즘 그 자체**라, 내주면 algorithm 에 남는 말이 없다 (프로토콜 2-4 의 경계).
 *
 * 좌표는 담지 않는다. 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 인자까지 그리는 쪽이
 * 장면에서 셈한다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 미는 방향. */
export type BitShiftDir = 'left' | 'right';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓴다.
 *
 * `shift` 의 출발 그림은 머무는 필드인 `was` 가 이미 말하므로 여기 싣지 않는다.
 * `place` 는 앞 밀기의 비트를 걷고 새 값을 내려놓는 걸음이라, 걷을 것만 따로
 * 실어 온다 — 그것은 자취가 아니라 지나가는 것이다 (S-scene 의 계기값).
 */
export type BitShiftStep = { kind: 'place'; gone: string | null } | { kind: 'shift' };

/**
 * 캡션이 말할 것.
 *
 * 인자를 싣지 않는다. 캡션이 말하는 수(지금 값 · 버림 없는 셈)는 그리는 쪽이
 * 장면에서 그대로 셈하므로, 인자를 따로 실으면 같은 수의 출처가 둘이 된다.
 */
export type BitShiftCaption = { kind: 'start' | 'turn' | 'left' | 'right' | 'dropped' };

export type BitShiftScene = {
  /**
   * 지금 칸에 놓인 비트열. `'0'`/`'1'` 로만 이루어지고 **길이가 곧 칸 수**다.
   * 판이 비어 있으면 `null` — 첫 장면과 되감은 직후가 그렇다.
   */
  readonly bits: string | null;
  /** 지금 미는 방향. `bits` 가 `null` 이면 뜻이 없다. */
  readonly dir: BitShiftDir;
  /** 이 방향의 시작값. */
  readonly start: number;
  /** 시작값에서 몇 칸 밀었나. `shift` 가 올 때마다 장면이 하나씩 센다. */
  readonly shiftCount: number;
  /**
   * 이 걸음 **직전**에 비트가 서 있던 자리. 같은 밀기 안에서만 있다.
   *
   * 둘을 겸한다 — 정적으로는 "여기 있었다" 는 자취(칸의 테두리)이고, 흐를 때는
   * 미끄러짐의 **출발 그림**이다. 출발값을 `prev` 에서 꺼내면 S-scene 위반이라
   * 장면이 말하게 한다.
   */
  readonly was: string | null;
  /**
   * 이 걸음에서 그릇 밖으로 나간 비트가 **떠난 칸**. 없으면 `null`.
   *
   * `was` 의 끝자리에서 셈한다 — 화면에 실제로 서 있던 비트와 같은 자료라, 유령이
   * 없던 비트를 세우는 일이 없다.
   */
  readonly dropped: number | null;
  readonly step: BitShiftStep | null;
  readonly caption: BitShiftCaption | null;
};

/** 비트열이 뜻하는 수. 화면의 비트와 글자의 수가 한 자료에서 나온다. */
export function valueOfBits(bits: string): number {
  return Number.parseInt(bits, 2);
}

/** 몇 곱절인가. 한 칸 밀 때마다 배가 된다. */
export function factorOf(shiftCount: number): number {
  return 2 ** shiftCount;
}

/** 버림 없는 셈. 왼쪽이면 곱하고 오른쪽이면 나눈다 — 그릇 폭을 보지 않는다. */
export function exactOf(dir: BitShiftDir, start: number, shiftCount: number): number {
  const factor = factorOf(shiftCount);
  return dir === 'left' ? start * factor : start / factor;
}

/** 빈 판. 첫 장면이자 되감은 직후의 장면이다. */
const EMPTY: BitShiftScene = {
  bits: null,
  dir: 'left',
  start: 0,
  shiftCount: 0,
  was: null,
  dropped: null,
  step: null,
  caption: null,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** `'0'`/`'1'` 로만 이루어진 문자열만 받는다. 아니면 `null`. */
function readBits(v: unknown): string | null {
  return typeof v === 'string' && /^[01]+$/.test(v) ? v : null;
}

/**
 * 이번 밀기에서 그릇 밖으로 나간 비트가 떠난 칸.
 *
 * 왼쪽으로 밀면 맨 윗자리(0번 칸)가, 오른쪽으로 밀면 맨 아랫자리가 끝을 넘어간다.
 * 그 자리에 비트가 서 있었을 때만 잃는 것이 있다.
 */
function droppedSlot(was: string, dir: BitShiftDir): number | null {
  const slot = dir === 'left' ? 0 : was.length - 1;
  return was[slot] === '1' ? slot : null;
}

export const bitShiftScene: ScenePlan<BitShiftScene> = {
  /**
   * 첫 장면은 빈 판이다.
   *
   * `initialData` 를 들추지 않는다 — 칸 수는 `place` 가 실어 오는 비트열의 길이가
   * 말하고, 러너가 주는 객체를 참조로 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그린다 (S-scene).
   */
  initial(): BitShiftScene {
    return EMPTY;
  },

  reduce(scene: BitShiftScene, event: FacetRuntimeEvent): BitShiftScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 시작값을 칸에 놓는다. 이 걸음이 밀기 하나를 열어 방향과 시작값을 정한다.
      case 'place': {
        const bits = readBits(p.bits);
        if (!bits) return scene;
        const dir: BitShiftDir = p.dir === 'right' ? 'right' : 'left';
        return {
          bits,
          dir,
          start: num(p.start),
          shiftCount: 0,
          was: null,
          dropped: null,
          // 앞 밀기의 비트가 아직 판에 있으면 그것을 걷고 시작한다.
          step: { kind: 'place', gone: scene.bits },
          caption: { kind: dir === 'left' ? 'start' : 'turn' },
        };
      }

      // 한 칸 민다. 방향과 시작값은 이 밀기를 연 `place` 의 것을 잇는다.
      case 'shift': {
        const bits = readBits(p.bits);
        if (!bits) return scene;
        const was = scene.bits;
        const dropped = was === null ? null : droppedSlot(was, scene.dir);
        return {
          ...scene,
          bits,
          shiftCount: scene.shiftCount + 1,
          was,
          dropped,
          step: { kind: 'shift' },
          caption: {
            kind:
              scene.dir === 'left' ? 'left' : dropped !== null ? 'dropped' : 'right',
          },
        };
      }

      // 손으로 짚기 시작 — 판을 비운다. 곧바로 `place` 가 뒤따른다.
      case 'rewind':
        return EMPTY;

      default:
        // 이 facet 이 내보내는 이벤트는 위 셋이 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
