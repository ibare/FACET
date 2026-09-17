/**
 * BitMask 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 0 건, 조회로 갈리는 분기도 0 건, DOM 되읽기도 0 건이었다.
 * 숨은 상태가 없어서가 아니라 **화면이 통째로 상태**였기 때문이다. 다섯 자리 중
 * 실제로 나온 것은 넷이다.
 *
 * - `let maskBits: number[]` — **지금 덮개가 어느 자리를 열어 두었나.** `markKept` 와
 *   `clearKept` 가 이것만 보고 칸을 물들이고 되돌렸다.
 * - `let plate: SVGGElement | null` — 덮개가 화면에 있나. 그리고 그 `<g>` 의
 *   `transform` 이 **좌표가 아니라 단계를 말했다** — `OFFSCREEN_DY` 면 아직 안 들어온
 *   것, `HOVER_DY` 면 떠 있는 것, `0` 이면 내려앉은 것. 세 단계가 수 하나에만 있었고
 *   그 뜻을 적어 둔 자리가 코드 어디에도 없었다.
 * - `const boxes` / `const glyphs` — DOM 손잡이 배열인데, **어느 자리가 이번 덮개를
 *   통과했나** 라는 이 조각의 결론이 그 `fill` 속성에만 있었다. `const` 라 `let`
 *   grep 을 통과한다.
 * - `readout.textContent` — 지금 읽히는 값. 화면 글자 하나가 유일한 사본이었다.
 *
 * 여기서는 그 넷이 `covers` 하나다. 열린 자리도, 덮개가 선 단계도, 물든 칸도,
 * 읽히는 값도 전부 거기서 파생한다.
 *
 * ── 되돌림이 지우던 것이 이 조각의 결론이었다
 *
 * 옛 stage 의 `liftMask` 는 `clearKept()` 로 물든 칸을 거두고 읽은 값을 원래 값으로
 * 되돌렸다. 덮개를 걷으면 **무엇이 걸러졌었는지가 화면에서 통째로 사라진다.** 덮개가
 * 둘이므로 완주 화면에는 마지막 덮개의 결과만 남고, "같은 값에 다른 덮개를 씌우면
 * 다른 것이 남는다" 는 이 조각의 주장이 한 화면에 선 적이 없었다.
 *
 * 그래서 걷어 낸 덮개도 `covers` 에 자국으로 남긴다 — 씌운 마스크와 그때 읽힌 값이
 * 짝으로 쌓이고, 지워지지 않는다. `rewind` 만 턴다.
 *
 * ── 수는 어디서 오나
 *
 * - **`mask-shown` 의 `maskBits` 를 받지 않는다.** 구멍 자리는 `mask` 를 자리 수만큼
 *   편 것이라 순수 함수로 나온다 (`holeBits`). 같은 것을 두 번 말하면 갈린다.
 * - **`mask-lifted` 의 `value` 도 받지 않는다.** 걷고 나면 읽히는 것은 언제나 원래
 *   값이고 그것은 바탕이다.
 * - **`mask-applied` 의 `value` 는 남긴다.** `값 & 마스크` 는 바탕 둘에서 나오는 순수
 *   함수지만, **그 AND 가 이 조각의 알고리즘 그 자체**다. 떼어 내면 algorithm 에는
 *   걸음 순서 말고 아무것도 남지 않는다 (프로토콜 2-4 절 가운데 줄의 경계).
 *   화면은 덮개로 "왜 그 값인가" 를 말하고 algorithm 은 "무엇인가" 를 말한다.
 * - **몇 번째 덮개인가도 받지 않는다.** 덮개는 올 때마다 하나씩 쌓이므로
 *   `covers.length` 가 그 번호다.
 *
 * 좌표는 담지 않는다. 자리 번호와 단계라는 **구조**만 담고, 칸 폭도 덮개가 뜨는
 * 높이도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지
 * 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 씌운 덮개 하나. 걷어 낸 것도 지우지 않고 자국으로 남긴다.
 *
 * 마지막 것이 `lifted` 가 아니면 그것이 **지금 화면에 있는 덮개**이고, 그 밖의 것은
 * 지나간 자국이다. 단계를 따로 적지 않아도 이 둘로 셋이 갈린다 —
 * 뜸(`result === null`) · 내려앉음(`result !== null`) · 걷힘(`lifted`).
 */
export type BitMaskCover = {
  /** 덮개. 1 이 구멍, 0 이 가림막. */
  mask: number;
  /** 내려앉아 읽힌 값. 아직 떠 있으면 null. */
  result: number | null;
  /** 걷어 냈나. */
  lifted: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 대상을 싣지 않는다 — 움직이는 덮개는 언제나 `covers` 의 마지막 것이고, 어느
 * 자리를 열었는지는 그 `mask` 가 말한다. 걸음에 마스크를 도로 실으면 방금 걷어낸
 * 두 출처를 운동 쪽으로 다시 들이는 꼴이 된다.
 */
export type BitMaskStep =
  /** 덮개가 캔버스 밖에서 값 위로 들어와 뜬다. */
  | { kind: 'show' }
  /** 뜬 덮개가 자리 위로 내려앉는다. */
  | { kind: 'drop' }
  /** 내려앉은 덮개를 걷어 밖으로 내보낸다. */
  | { kind: 'lift' };

/** 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다 (C10). */
export type BitMaskCaption =
  | { kind: 'mask' }
  | { kind: 'applied' }
  | { kind: 'lifted' }
  | { kind: 'done' };

export type BitMaskScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 덮개를 씌울 값. 끝까지 바뀌지 않는다 — 그것이 이 조각이 하는 말의 절반이다. */
  base: number;
  /** 자리 수. */
  bitCount: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 씌운 덮개들, 씌운 순서대로. 걷어 낸 것도 남는다. */
  covers: readonly BitMaskCover[];

  step: BitMaskStep | null;
  caption: BitMaskCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `covers` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 덮개를
 * 쓴 채로 서고 그 위에 algorithm 이 새로 씌우는 것이 겹친다 (S-scene).
 */
type Base = Pick<BitMaskScene, 'base' | 'bitCount'>;

/**
 * 되돌린 뒤의 장면 — 값만 놓여 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 `covers` 가 실린 장면도 그대로 통과한다
 * (S-scene).
 */
function atStart(base: Base): BitMaskScene {
  return { base: base.base, bitCount: base.bitCount, covers: [], step: null, caption: null };
}

// ── 바탕에서 파생하는 것들 ──────────────────────────────────────────────────

/** 값을 MSB 우선 비트 배열로 편다. 화면의 0/1 은 전부 여기서 나온다. */
export function bitsOf(value: number, bitCount: number): number[] {
  const out: number[] = [];
  for (let i = bitCount - 1; i >= 0; i -= 1) out.push((value >> i) & 1);
  return out;
}

/** 덮개의 구멍 자리. `mask` 를 편 것일 뿐이라 걸음이 실어 올 것이 아니다. */
export function holeBits(mask: number, bitCount: number): number[] {
  return bitsOf(mask, bitCount);
}

/** 지금 화면에 있는 덮개. 걷어 냈거나 아직 하나도 안 씌웠으면 null. */
export function currentCover(scene: BitMaskScene): BitMaskCover | null {
  const last = scene.covers[scene.covers.length - 1];
  return last !== undefined && !last.lifted ? last : null;
}

/** 지금 걷히는 중인 덮개. `lift` 걸음에서만 있다 — 흐르는 그림의 출발 그림이다. */
export function liftingCover(scene: BitMaskScene): BitMaskCover | null {
  if (scene.step?.kind !== 'lift') return null;
  const last = scene.covers[scene.covers.length - 1];
  return last !== undefined && last.lifted ? last : null;
}

/**
 * 지금 읽히는 값.
 *
 * 덮개가 내려앉아 있으면 걸러진 값, 아니면 원래 값이다. **읽은 값 줄도 이 한
 * 함수를 지난다** — 화면의 수가 두 군데서 나오면 언젠가 갈린다.
 */
export function readingOf(scene: BitMaskScene): number {
  return currentCover(scene)?.result ?? scene.base;
}

/**
 * 이 덮개가 열어 둔 자리 — **표식**이다 (테두리).
 *
 * 뜬 순간부터 걷을 때까지 보인다. 내려앉으면 덮개 자신이 같은 말을 하므로 겹치지만,
 * 뜨는 동안에는 "이 덮개가 어느 자리 위에 설 것인가" 를 이것만이 말한다.
 */
export function openedAt(scene: BitMaskScene): boolean[] {
  const cover = currentCover(scene);
  if (cover === null) return new Array<boolean>(scene.bitCount).fill(false);
  return holeBits(cover.mask, scene.bitCount).map((b) => b === 1);
}

/**
 * 지금 통과하고 있는 자리 — **값의 형편**이다 (채움).
 *
 * 덮개가 내려앉아 있는 동안만이다. 표식과 축을 갈라 두어야 "열어 두었다" 와
 * "통과했다" 가 한 화면에 함께 선다 (프로토콜 4 절).
 */
export function passingAt(scene: BitMaskScene): boolean[] {
  const cover = currentCover(scene);
  if (cover === null || cover.result === null) {
    return new Array<boolean>(scene.bitCount).fill(false);
  }
  return holeBits(cover.mask, scene.bitCount).map((b) => b === 1);
}

/** 자국으로 남길 덮개들 — 한 번이라도 내려앉았던 것. 씌운 순서 그대로. */
export function marksOf(scene: BitMaskScene): BitMaskCover[] {
  return scene.covers.filter((c) => c.result !== null);
}

// ── unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 마지막 덮개를 고친 새 목록. **앞 장면의 배열도 객체도 건드리지 않는다** (S-scene). */
function replaceLast(
  covers: readonly BitMaskCover[],
  patch: Partial<BitMaskCover>,
): readonly BitMaskCover[] {
  const last = covers[covers.length - 1];
  if (last === undefined) return covers;
  return [...covers.slice(0, -1), { ...last, ...patch }];
}

export const bitMaskScene: ScenePlan<BitMaskScene> = {
  /**
   * 첫 장면은 값만 놓여 있고 덮개가 없다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 객체를 참조로 쥐지 않는다** — 수 둘을 복사해 담을 뿐이다 (S-scene).
   */
  initial(initialData: unknown): BitMaskScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      base: Math.trunc(num(d.value, 0)),
      bitCount: Math.max(1, Math.trunc(num(d.bitCount, 8))),
    });
  },

  reduce(scene: BitMaskScene, event: FacetRuntimeEvent): BitMaskScene {
    switch (event.type) {
      case 'mask-shown': {
        const mask = readNumber(event.payload, 'mask');
        if (mask === null) return scene;
        return {
          ...scene,
          covers: [...scene.covers, { mask, result: null, lifted: false }],
          step: { kind: 'show' },
          caption: { kind: 'mask' },
        };
      }
      case 'mask-applied': {
        // 이 값이 걸음이 내리는 판정이다 — 화면이 덮개로 보이는 것과 같은 말을
        // algorithm 이 수로 한다.
        const result = readNumber(event.payload, 'value');
        if (result === null || currentCover(scene) === null) return scene;
        return {
          ...scene,
          covers: replaceLast(scene.covers, { result }),
          step: { kind: 'drop' },
          caption: { kind: 'applied' },
        };
      }
      case 'mask-lifted': {
        if (currentCover(scene) === null) return scene;
        return {
          ...scene,
          covers: replaceLast(scene.covers, { lifted: true }),
          step: { kind: 'lift' },
          caption: { kind: 'lifted' },
        };
      }
      case 'done':
        // 마지막 덮개는 내려앉은 채로 둔다. 결론은 그 화면 위에서 말한다.
        return { ...scene, step: null, caption: { kind: 'done' } };
      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ base: scene.base, bitCount: scene.bitCount });
      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
