/**
 * SeveralHashesOneValue 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * `let` 은 옛 stage 에 딱 하나(`destroyed`)뿐이었고 projector 는 아무것도 기억하지
 * 않았다. 그런데도 화면이 아는 것은 **네 자리**에 흩어져 있었다. 전부 `type` 선언과
 * DOM 속성 안이라 `let` 을 쫓는 grep 에는 한 건도 걸리지 않는다.
 *
 * - `type Cell = { g, fills, value, x, cx, owners: number[] }` — **DOM 손잡이와
 *   뜻이 한 객체에 묶인** 자리. `owners` 는 "이 칸을 어느 값들이 켰나" 이고, 그것이
 *   곧 이 조각의 결론이다 — 둘이 들어 있으면 칸이 반씩 나뉘어 "나눠 썼다" 가 된다.
 *   `const cells: Cell[]` 이라 `let` grep 을 통과했다.
 * - `type Row = { g, detail }` 의 `detail.textContent` — 그 줄이 **이미 갈라졌나**.
 *   `h1 … · h2 …` 였다가 `→ 4 · 9 · 14` 로 덮어써지는 식이라, 줄의 형편이 문자열
 *   하나 안에만 있었다.
 * - `rows: Map<number, Row>` — 어느 줄이 떴나.
 * - `gArcs` 의 자식들 — 갈래가 지나간 호. **이 조각의 주장이 눈으로 보이는 자리**
 *   (두 값의 호가 한 칸에 모인다) 인데, 쌓이기만 하고 셈할 길이 없었다.
 *
 * 여기서는 그 넷이 `rows` 하나다. 호도 owners 도 `rows[i].slots` 에서 파생된다.
 *
 * ── 수는 한 출처에서만 나온다 — 켠 자리 목록
 *
 * - **`done` 의 `onCount` · `total` 을 받지 않는다.** 켜진 자리 수는 `rows` 의
 *   `slots` 를 모은 것의 크기이고, 그것이 곧 물든 칸의 목록이다. 배열 길이는
 *   `bitCount` 가 정한다. 캡션의 두 수와 화면의 칸이 **같은 것을 두 번 말한 것**이
 *   되면 언젠가 갈린다.
 * - **`branches-split` 의 `shared` 를 받지 않는다.** 이미 1 이던 자리는 "앞 줄들이
 *   켠 자리" 이므로 `rows` 가 이미 안다 (`ownersOf`). 나눠 쓴 칸의 표식도 거기서
 *   나오니, 표식과 캡션이 한 출처다.
 * - **줄 번호와 값도 받지 않는다.** 줄은 올 때마다 하나씩 쌓이므로 `rows.length` 가
 *   곧 그 줄의 번호이고, 값은 선언의 `keys` 가 쥐고 있다.
 *
 * 남기는 것은 셋뿐이다 — `h1` · `h2` · `slots`. 셋 다 해시 셈의 **결과**라 구조에서
 * 셀 수 없다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄 번호와 자리 번호라는 **구조**만 담고, 칸 폭도 호의 곡률도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 넣은 값 한 줄.
 *
 * `slots` 가 null 이면 아직 갈라지지 않았다 — 줄은 섰고 바탕 해시 둘만 보인다.
 * 갈라진 뒤에는 짚은 자리가 **짚은 순서 그대로** 들어온다 (정렬하지 않는다).
 */
export type HashRow = {
  /** 넣을 값. 선언의 `keys` 에서 온다. */
  key: string;
  /** Java `String.hashCode` 를 `& 0x7FFFFFFF` 한 것. */
  h1: number;
  /** FNV-1a 를 `& 0x7FFFFFFF` 한 뒤 홀수로 만든 것. */
  h2: number;
  /** 갈래가 켠 자리. 아직 갈라지지 않았으면 null. */
  slots: readonly number[] | null;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 대상을 싣지 않는다 — 줄은 늘 마지막 줄이고 그 줄이 켠 자리는 `slots` 가 말한다.
 * 걸음에 대상 번호를 도로 실으면 방금 걷어낸 "두 출처" 를 운동 쪽으로 다시 들이는
 * 꼴이 된다. 예외는 `share` 의 `slot` 뿐인데, 그 한 칸을 고르는 것은 셈이 아니라
 * algorithm 의 판정이다.
 */
export type HashStep =
  /** 줄이 왼쪽에서 미끄러져 들어온다. */
  | { kind: 'enter' }
  /** 한 점에 겹쳐 있던 갈래가 갈라져 각자 칸으로 날아간다. */
  | { kind: 'split' }
  /** 이미 1 이던 칸을 두드린다. */
  | { kind: 'share'; slot: number }
  /** 켜진 칸을 왼쪽부터 훑어 결론을 낸다. */
  | { kind: 'sweep' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지와 그 인자**다.
 *
 * 값도 갈래 수도 켜진 칸 수도 담지 않는다 — 전부 `rows` 와 `bitCount` 에서
 * 나온다. 캡션이 제 수를 따로 들고 있으면 화면의 칸과 갈릴 자리가 생긴다.
 */
export type HashCaption =
  | { kind: 'key' }
  | { kind: 'split' }
  | { kind: 'shared'; slot: number }
  | { kind: 'done' }
  | { kind: 'rewind' };

export type SeveralHashesOneValueScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 비트 배열 길이 m. 칸 수이자 나머지 연산의 제수다. */
  bitCount: number;
  /** 넣을 값들. 넣는 순서 그대로 — 줄 번호가 곧 이 배열의 인덱스다. */
  keys: readonly string[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 들어온 줄들, 넣은 순서대로. 마지막이 지금 줄이다.
   *
   * **남는 자취**다 — 켜진 칸의 칠도, 갈래가 지나간 호도, 나눠 쓴 칸의 표식도 전부
   * 여기서 파생되므로 정적 그리기에 그대로 들어간다 (S-scene).
   */
  rows: readonly HashRow[];

  step: HashStep | null;
  caption: HashCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `rows` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 물든 칸과
 * 호를 단 채로 서고 그 위에 algorithm 이 새로 넣는 것이 겹친다 (S-scene).
 */
type HashBase = Pick<SeveralHashesOneValueScene, 'bitCount' | 'keys'>;

/**
 * 아무것도 들어가지 않은 처음 화면. 비트 배열만 0 으로 깔려 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: HashBase): SeveralHashesOneValueScene {
  return { bitCount: base.bitCount, keys: base.keys, rows: [], step: null, caption: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === 'string') : [];
}

/**
 * 그 칸을 켠 줄들의 번호, 켠 순서대로.
 *
 * **이 함수 하나가 칸의 칠과 나눠 쓴 표식과 캡션의 수를 전부 낸다.** 둘 이상이면
 * 그 칸을 나눠 쓴 것이고, 그것이 이 조각의 주장이다.
 */
export function ownersOf(rows: readonly HashRow[], slot: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const slots = rows[i]?.slots;
    if (slots && slots.includes(slot)) out.push(i);
  }
  return out;
}

/**
 * 켜진 자리의 수.
 *
 * `done` 이 실어 오던 `onCount` 를 받지 않고 여기서 센다. 그래야 캡션의 수와 실제로
 * 물든 칸의 수가 한 출처에서 나온다.
 */
export function litCountOf(scene: SeveralHashesOneValueScene): number {
  let on = 0;
  for (let i = 0; i < scene.bitCount; i += 1) if (ownersOf(scene.rows, i).length > 0) on += 1;
  return on;
}

/** 지금 줄. 아직 아무 줄도 안 들어왔으면 null. */
export function currentRow(scene: SeveralHashesOneValueScene): HashRow | null {
  return scene.rows[scene.rows.length - 1] ?? null;
}

export const severalHashesOneValueScene: ScenePlan<SeveralHashesOneValueScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `strs` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): SeveralHashesOneValueScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const count = num(d.bitCount) ?? 0;
    return atStart({
      bitCount: Number.isInteger(count) && count > 0 ? count : 0,
      keys: strs(d.keys),
    });
  },

  reduce(
    scene: SeveralHashesOneValueScene,
    event: FacetRuntimeEvent,
  ): SeveralHashesOneValueScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 넣을 값이 자기 줄에 앉는다. 바탕 해시 둘이 함께 선다.
       *
       * 줄 번호도 값도 payload 에서 받지 않는다 — 줄은 올 때마다 하나씩 쌓이므로
       * 지금 `rows.length` 가 곧 그 줄의 번호이고, 값은 선언의 `keys` 가 쥔다.
       */
      case 'key-enters': {
        const h1 = num(p.h1);
        const h2 = num(p.h2);
        if (h1 === null || h2 === null) return scene;
        const key = scene.keys[scene.rows.length];
        if (key === undefined) return scene;
        return {
          ...scene,
          rows: [...scene.rows, { key, h1, h2, slots: null }],
          step: { kind: 'enter' },
          caption: { kind: 'key' },
        };
      }

      /*
       * 한 값이 갈래 k 로 갈라져 각자 다른 칸으로 간다.
       *
       * `slots` 만 받는다. 이미 1 이던 자리(`shared`)는 앞 줄들이 켠 자리이므로
       * `rows` 가 이미 알고 (`ownersOf`), 갈래 수 k 는 `slots.length` 다.
       *
       * 앞 장면을 제자리에서 고치지 않는다 — 마지막 줄만 새 객체로 갈아 끼운다.
       */
      case 'branches-split': {
        const slots = nums(p.slots);
        const at = scene.rows.length - 1;
        const row = scene.rows[at];
        if (row === undefined || slots.length === 0) return scene;
        return {
          ...scene,
          rows: [...scene.rows.slice(0, at), { ...row, slots }],
          step: { kind: 'split' },
          caption: { kind: 'split' },
        };
      }

      /*
       * 두 값이 한 칸을 함께 쓴다. 비트는 1 에서 1 로 갈 뿐이다.
       *
       * 구조는 바뀌지 않는다 — 나눠 쓴 사실은 이미 `rows` 안에 있다. 이 걸음이
       * 하는 일은 그 칸을 가리켜 보이는 것뿐이다. 그래서 `slot` 만 걸음에 싣고
       * 줄 번호는 받지 않는다.
       */
      case 'slot-shared': {
        const slot = num(p.slot);
        if (slot === null) return scene;
        return { ...scene, step: { kind: 'share', slot }, caption: { kind: 'shared', slot } };
      }

      /*
       * 다 넣었다. 켜진 칸을 훑어 결론을 낸다.
       *
       * `onCount` 도 `total` 도 받지 않는다 — 앞의 것은 `litCountOf` 가 세고 뒤의
       * 것은 `bitCount` 가 정한다.
       */
      case 'done':
        return { ...scene, step: { kind: 'sweep' }, caption: { kind: 'done' } };

      /*
       * 처음으로 되감는다. 바탕만 남기고 자취를 턴다 — 변수가 아니라 객체
       * 리터럴을 넘긴다 (S-scene).
       *
       * 화면이 통째로 비므로 왜 비었는지는 말해 준다. 흐를 것은 없다.
       */
      case 'rewind':
        return {
          ...atStart({ bitCount: scene.bitCount, keys: scene.keys }),
          caption: { kind: 'rewind' },
        };

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
