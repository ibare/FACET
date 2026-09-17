/**
 * silentTruncation 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 자리를 잇는다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **두 손잡이와 한 변형**에 얹혀 있었다. `let` 이 셋뿐인 얇은
 * 조각이라 "숨은 상태가 없다" 로 읽기 쉬웠는데, 실은 화면이 통째로 상태였다.
 *
 * - `let high: SVGGElement | null` — **윗자리가 아직 안 떨어졌나.** 이 조각의
 *   결론이 DOM 손잡이 하나의 null 여부에 적혀 있었다. `truncate` 가 `high = null`
 *   로 놓고 `falling.remove()` 를 부르면 떨어져 나간 자리가 화면에서 통째로
 *   없어져, **무엇이 잘렸는지**가 남지 않았다. 여기서는 `hold.phase` 가 말한다.
 * - `let strip: SVGGElement | null` — 앞 값이 아직 화면에 남아 있나. 그 값이
 *   무엇이었는지는 어디에도 없어서 "나가는 띠"를 옛 노드로만 그릴 수 있었다.
 *   여기서는 `poured` 의 마지막 값이 그것을 말한다.
 * - `strip` 의 `transform` — 좌표가 아니라 **어느 단계에 서 있나**(집 / 그릇)를
 *   화면이 혼자 알고 있었다. 여기서는 `hold.phase` 가 말하고 자리는 그리는 쪽이
 *   셈한다.
 * - 잃은 값 글자가 `high` 의 **자식**으로 붙어 있었다 — 부모가 떨어져 나갈 때
 *   함께 지워지는 자리. 그것이 이 조각의 주장이 끝 화면에 안 남던 까닭이다.
 *
 * ── 수는 한 출처에서만 나온다 — 화면의 비트 칸이 정본이다
 *
 * 이 조각은 **원래 값 · 떨어져 나간 값 · 그릇에 남은 값 셋을 한 화면에 나란히
 * 띄운다.** 그 셋이 비트 칸과 갈리면 그림이 제 안에서 거짓이 된다.
 *
 * 옛 algorithm 은 `value % 2 ** width` 로 남는 값을, `value - kept` 로 잃은
 * 값을 따로 셈해 실어 보냈다. 화면은 그것과 무관하게 비트열을 그릇 테두리로
 * 갈라 그리고 있었으니 **같은 물음에 답이 둘**이었다.
 *
 * 여기서는 셋 다 `bitsOf` 가 낸 한 문자열에서 나온다 — 그릇 안에 든 자리를 읽으면
 * `keptOf`, 테두리 밖에 걸린 자리를 읽으면 `lostOf` 다. 화면이 그리는 바로 그
 * 갈림에서 수가 나오므로 갈릴 자리가 없다 (프로토콜 4 절 "구조에서 세지는 것은
 * 장면이 센다"). 그래서 **발신이 싣는 것은 `value` 하나**다 — 어느 값을 이번에
 * 담아 보는가는 구조가 셀 수 없는, 걸음이 내리는 판정이라 그것만 싣는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 비트 폭과 그릇 폭이라는 **구조**만 담고 칸 폭도 벼랑의
 * 자리도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지
 * 않는다 — 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로 만든다
 * (C10). 그래서 캡션에는 인자가 하나도 없다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 지금 들고 있는 값이 어디까지 왔나.
 *
 * 옛 stage 에서는 이것이 띠의 `transform` 과 `high` 의 null 여부에 나뉘어 있었다.
 */
export type TruncationPhase =
  /** 왼쪽에서 들어와 그릇 위에 떠 있다. 아직 아무 자리도 갈리지 않았다. */
  | 'offered'
  /** 그릇으로 내려앉았다. 아래 자리는 바닥에 닿고 윗자리는 허공에 걸려 있다. */
  | 'poured'
  /** 받쳐 줄 바닥이 없던 자리가 떨어져 나갔다. 그 자리의 자취만 남는다. */
  | 'cut';

/** 지금 화면에 든 값. */
export type TruncationHold = {
  /**
   * 담아 보는 값.
   *
   * 구조에서는 셀 수 없는 유일한 것이라 발신이 싣는다 — 2진 표기도 남는 값도
   * 잃은 값도 전부 이 하나와 두 비트 폭에서 나온다.
   */
  value: number;
  phase: TruncationPhase;
};

/**
 * 캡션이 말할 것. 인자가 없다 — 수는 전부 장면에서 셈해진다.
 *
 * 수를 여기 실으면 화면의 비트 칸과 갈릴 자리가 생긴다 (프로토콜 4 절 "화면에
 * 나란히 뜨는 수는 한 함수를 지나야 한다").
 */
export type TruncationCaption =
  | { kind: 'offer' }
  | { kind: 'pour' }
  | { kind: 'truncate' }
  | { kind: 'done' };

export type TruncationScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 원래 값을 세던 비트 폭. 띠의 칸 수다. */
  from: number;
  /** 그릇의 비트 폭. 부호 없는 그릇이라 범위는 0 … 2^width - 1. */
  width: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 지금 화면에 든 값. 아직 아무것도 오지 않았으면 null. */
  hold: TruncationHold | null;
  /**
   * 이미 그릇을 지나간 원래 값들, 온 차례대로.
   *
   * 남은 값은 여기 담지 않는다 — `keptOf` 가 낸다. 마지막 값은 다음 값이 들어올
   * 때 오른쪽으로 나가는 띠이기도 하다.
   */
  poured: readonly number[];
  /** 할 말을 마쳤나. 마지막 값의 화면은 그대로 두고 캡션만 바뀐다. */
  finished: boolean;

  caption: TruncationCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `hold` · `poured` · `finished` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 앞 주행의 띠를 단 채로 서고 그 위에 algorithm 이 새로 내미는
 * 값이 겹친다 (S-scene).
 */
type Base = Pick<TruncationScene, 'from' | 'width'>;

/**
 * 그릇만 놓인 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): TruncationScene {
  return {
    from: base.from,
    width: base.width,
    hold: null,
    poured: [],
    finished: false,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ── 장면에서 셈해지는 수들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 비트 칸도 캡션도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/**
 * 값의 2진 표기. 앞자리는 0 으로 채우고, `from` 자리를 넘으면 잘라 낸다.
 *
 * **자르는 잣대가 여기 하나뿐이다.** 그리는 쪽이 다시 자르면 두 군데가 되어
 * 갈린다 (프로토콜 4 절).
 */
export function bitsOf(value: number, from: number): string {
  const n = Math.max(0, Math.trunc(value));
  return n.toString(2).padStart(from, '0').slice(-from);
}

/** 테두리 밖에 걸리는 자리 수. 그릇의 왼쪽 벽이 벼랑이다. */
export function overOf(scene: Base): number {
  return Math.max(0, scene.from - scene.width);
}

/** 2진 문자열을 수로. 빈 문자열은 0 이다 — `parseInt('')` 는 NaN 이라 쓸 수 없다. */
function readBits(bits: string): number {
  return bits.length === 0 ? 0 : Number.parseInt(bits, 2);
}

/**
 * 그릇에 남는 값 — **그릇 안에 그려지는 자리**를 읽은 것이다.
 *
 * 나눗셈의 나머지로 따로 셈하지 않는다. 화면이 갈라 그리는 바로 그 자리에서
 * 읽어야 그림과 수가 갈리지 않는다.
 */
export function keptOf(value: number, scene: Base): number {
  return readBits(bitsOf(value, scene.from).slice(overOf(scene)));
}

/**
 * 떨어져 나간 값 — **테두리 밖에 걸린 자리**가 그 자리에서 뜻하던 값이다.
 *
 * 윗자리 `00000001` 은 여덟 자리 그릇 위에서 256 을 뜻한다. 그래서 읽은 수에
 * 2^width 를 곱한다.
 */
export function lostOf(value: number, scene: Base): number {
  return readBits(bitsOf(value, scene.from).slice(0, overOf(scene))) * 2 ** scene.width;
}

/**
 * 지금까지 그릇을 지나간 값들의, 그릇에 남은 것.
 *
 * `done` 이 실어 오던 배열을 대신한다. 걸어온 자취에서 나오므로 화면이 말하는
 * 것과 결론이 같은 자료를 쓴다.
 */
export function resultsOf(scene: TruncationScene): number[] {
  return scene.poured.map((value) => keptOf(value, scene));
}

/** 다음 값이 들어올 때 오른쪽으로 나가는 띠의 값. 처음이면 나갈 것이 없다. */
export function leavingOf(scene: TruncationScene): number | null {
  return scene.poured[scene.poured.length - 1] ?? null;
}

export const silentTruncationScene: ScenePlan<TruncationScene> = {
  /**
   * 첫 장면은 그릇만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다 (옛 stage 의
   * `readScene` 이 하던 일이다). 넘겨받은 객체를 **참조로 쥐지 않는다** — 러너가
   * 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체다 (S-scene). 여기서 꺼내는
   * 것은 수 둘뿐이라 저절로 값 복사다.
   */
  initial(initialData: unknown): TruncationScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const from = num(d.from);
    const width = num(d.width);
    const bits = from !== null && from > 0 ? Math.trunc(from) : 16;
    const bowl = width !== null && width > 0 ? Math.trunc(width) : 8;
    // 그릇이 띠보다 넓을 수는 없다. 넘치면 띠 전체가 그릇이고 벼랑이 없다.
    return atStart({ from: bits, width: Math.min(bowl, bits) });
  },

  reduce(scene: TruncationScene, event: FacetRuntimeEvent): TruncationScene {
    switch (event.type) {
      /*
       * 값 하나가 왼쪽에서 들어온다.
       *
       * 2진 표기는 받지 않는다 — `value` 와 바탕의 `from` 이 정하므로 `bitsOf` 가
       * 낸다. 앞 값은 `poured` 의 마지막에 그대로 있어 나가는 띠를 그릴 수 있다.
       */
      case 'value-offered': {
        const p = (event.payload ?? {}) as Record<string, unknown>;
        const value = num(p.value);
        // 값이 안 왔으면 그릴 띠가 없다. 조용히 흘린다 (C2).
        if (value === null) return scene;
        return {
          ...scene,
          hold: { value: Math.max(0, Math.trunc(value)), phase: 'offered' },
          finished: false,
          caption: { kind: 'offer' },
        };
      }

      /* 띠가 그릇으로 내려앉는다. 걸린 자리 수도 잃은 값도 장면이 센다. */
      case 'poured': {
        if (scene.hold === null) return scene;
        // 앞 장면을 제자리에서 고치지 않는다. 안쪽 객체도 새로 만든다 (S-scene).
        return {
          ...scene,
          hold: { ...scene.hold, phase: 'poured' },
          caption: { kind: 'pour' },
        };
      }

      /*
       * 받쳐 줄 바닥이 없던 자리가 떨어져 나간다.
       *
       * 여기서 `poured` 에 값이 쌓인다 — 그릇을 지나간 값이 하나 늘었다는 뜻이고,
       * `done` 이 말할 결과 목록이 이 자취에서 나온다.
       */
      case 'truncated': {
        if (scene.hold === null) return scene;
        return {
          ...scene,
          hold: { ...scene.hold, phase: 'cut' },
          poured: [...scene.poured, scene.hold.value],
          caption: { kind: 'truncate' },
        };
      }

      /* 할 말을 마친다. 마지막 값의 화면은 그대로 두고 캡션만 바뀐다. */
      case 'done':
        return { ...scene, finished: true, caption: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ from: scene.from, width: scene.width });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
