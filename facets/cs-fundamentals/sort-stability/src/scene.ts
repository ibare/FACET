/**
 * sortStability 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 줄이 셋이다. 맨 위는 입력이고, 그 아래 둘은 **같은 입력에서 갈라져 나온 두
 * 결과**다. 두 결과는 값으로는 구별되지 않으므로(둘 다 1 1 3 3) 항목마다 "어디서
 * 왔는가" 를 든 이름표 칩을 달고, 결과 줄 사이에 같은 항목끼리 실을 잇는다.
 * 나란한 실 둘과 엇갈린 실 둘 — 그 교차 하나가 이 조각이 말하려는 전부다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고, stage 의 `let` 은 바탕(`items`)과
 * 거기서 파생되는 자리 셈(`slotW`·`tileW`·`originX`·`palette`)이 대부분이었다.
 * 정작 걸어온 자취는 **`const` 에 묶인 것들과 DOM 속성**에 있었다.
 *
 * - **`let stableOrder` · `let selectionOrder`** — 두 결과 줄의 차례. 유일하게
 *   `let` grep 에 걸린 자취다. 이제 `stable` · `selection` 이 말하고, `null` 이면
 *   그 줄이 아직 나오지 않은 것이다.
 * - **`const threads: Thread[]`** — **실이 이어졌나.** `const` 로 묶였는데
 *   `threads.push` 와 `threads.length = 0` 으로 제자리에서 고쳐져 `let` grep 을
 *   통과한다 (프로토콜 3-1 의 ⑤). 게다가 `Thread = { path, label }` 은 **DOM
 *   손잡이와 뜻을 한 객체에** 묶은 모양이다. 이제 `threaded` 가 말하고, 실은
 *   두 차례에서 매번 다시 셈된다.
 * - **이름표가 접혀 있나** — 이것을 적어 둔 변수가 코드 어디에도 없었다. 상태는
 *   `chip` 의 `transform="… scale(k 1)"` 과 `opacity` 에만 있었다. **좌표가 아니라
 *   단계를 말하는 `transform`** 이다. 이제 `tagsHidden` 이다.
 * - **어긋난 짝이 짚였나** — 역시 변수가 없었고 `path` 의 `stroke`/`stroke-width`
 *   와 `rect` 의 `stroke` 에만 남았다. **그것이 이 조각의 결론인데** 화면 속성에만
 *   있어서 되짚으면 사라졌다. 이제 `marked` 가 말하고 정적 그리기가 세운다.
 * - **`stableTiles` · `selectionTiles` 의 `Map<string, Tile>`** — 어느 이름표가 어느
 *   칸에 앉았나가 맵의 열쇠와 타일의 `transform` 에 나뉘어 있었다. 이제 차례 배열이
 *   말하고 맵은 그리기의 부산물로만 남는다.
 * - **`path.getTotalLength()`** — 실을 그려 넣는 운동이 **화면을 도로 읽어** 실
 *   길이를 쟀다 (프로토콜 3-1 의 ④). 되감아 세운 직후에는 옛 화면의 것이다.
 *   이제 그리는 쪽이 같은 제어점에서 셈한다.
 *
 * ── 걸음이 실어 오던 것을 전부 걷어냈다
 *
 * `sort-stable` 의 `order`, `sort-selection` 의 `order`, `mark-mismatch` 의
 * `labels`·`value` 가 전부 payload 였다. 넷 다 사라졌다.
 *
 * - 두 차례는 **바탕 자료에 순수 함수를 먹이면 나오는 값**이라 algorithm 이 내주는
 *   `stableResultOrder` · `selectionResultOrder` 를 장면이 부른다. payload 로 받으면
 *   다음 사람이 집어 쓸 문이 열린 채로 남는다 (프로토콜 4절 B 갈래).
 * - 어긋난 짝과 그 값은 **구조에서 세진다** — 두 차례가 이미 장면에 있으므로
 *   자리별로 견주면 그만이다. 캡션의 `{value}` 와 화면의 타일이 같은 `items` 를
 *   지나므로 두 수가 갈릴 자리가 없다.
 *
 * 좌표는 담지 않는다. 항목 수가 칸 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  selectionResultOrder,
  stableResultOrder,
  type SortStabilityItem,
} from './algorithm.js';

/** 결과 줄 둘. 어느 줄이 방금 갈라져 나왔는지를 걸음이 가리킨다. */
export type SortStabilityRow = 'stable' | 'selection';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데**만 쓴다.
 *
 * 운동의 출발 그림은 전부 장면에서 셈된다 — 갈라져 나오는 타일의 출발 칸은
 * 입력 줄에서의 자리(`items` 의 차례)이고, 이름표와 실의 출발 모습은 접힌 꼴과
 * 빈 꼴이라 따로 실을 계기값이 없다. 그래서 `prev` 를 꺼내 쓸 일이 없다 (S-scene).
 */
export type SortStabilityStep =
  /** 그 줄의 결과가 입력 줄에서 갈라져 내려앉는다. */
  | { kind: 'fanOut'; row: SortStabilityRow }
  /** 두 결과 줄의 이름표가 접힌다. 값만 남으면 두 줄이 똑같이 읽힌다. */
  | { kind: 'fold' }
  /** 이름표가 도로 펴지고 같은 항목끼리 실이 이어진다. */
  | { kind: 'link' }
  /** 어긋난 짝을 짚는다. */
  | { kind: 'mark' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type SortStabilityCaption =
  | { kind: 'input' }
  | { kind: 'stable' }
  | { kind: 'selection' }
  | { kind: 'tagsHidden' }
  | { kind: 'linkOrigin' }
  | { kind: 'mismatch'; value: number };

export type SortStabilityScene = {
  /**
   * 입력 줄. 차례가 곧 "어디서 왔는가" 이고, 이름표 색과 칸 폭도 여기서 나온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly items: readonly SortStabilityItem[];
  /** 안정 정렬 결과의 이름표 차례. 아직 갈라져 나오지 않았으면 `null`. */
  readonly stable: readonly string[] | null;
  /** 선택 정렬 결과의 이름표 차례. 아직 갈라져 나오지 않았으면 `null`. */
  readonly selection: readonly string[] | null;
  /** 두 결과 줄의 이름표가 접혀 있나. 접힌 동안에는 **짓지 않는다**. */
  readonly tagsHidden: boolean;
  /** 두 결과 줄 사이에 실이 이어졌나. */
  readonly threaded: boolean;
  /**
   * 어긋난 짝이 짚였나. **이 조각의 결론이라 머무는 표식이다** — 정적 그리기가
   * 세우므로 되짚어도, 다 끝난 화면에도 남는다.
   */
  readonly marked: boolean;
  readonly step: SortStabilityStep | null;
  readonly caption: SortStabilityCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * 걸어온 자취(`stable` · `selection` · `tagsHidden` · `threaded` · `marked`)를 여기
 * 넣지 않는다. 바탕으로 묶어 되감기에 넘기면 되감은 화면이 결과 줄을 단 채로
 * 서고 그 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 구조적으로 못
 * 넘어가게 하고, 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수로 넘기면 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
type SortStabilityBase = Pick<SortStabilityScene, 'items'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: SortStabilityBase): SortStabilityScene {
  return {
    items: base.items,
    stable: null,
    selection: null,
    tagsHidden: false,
    threaded: false,
    marked: false,
    step: null,
    caption: { kind: 'input' },
  };
}

/** 그 이름표를 단 항목. 없으면 `null`. */
export function itemOf(
  scene: SortStabilityScene,
  label: string,
): SortStabilityItem | null {
  return scene.items.find((item) => item.label === label) ?? null;
}

/** 입력 줄에서 그 이름표가 앉았던 칸. 없으면 `-1`. */
export function originColumn(scene: SortStabilityScene, label: string): number {
  return scene.items.findIndex((item) => item.label === label);
}

/**
 * 두 결과에서 자리가 어긋난 항목의 이름표. 안정된 쪽의 차례로 모은다.
 *
 * 이 조각의 결론을 셈하는 **유일한 자리**다. `reduce` 의 캡션도, 그리는 쪽의
 * 표식도 여기를 지나므로 화면에 나란히 뜨는 둘이 갈리지 않는다.
 */
export function mismatchedLabels(scene: SortStabilityScene): readonly string[] {
  const { stable, selection } = scene;
  if (stable === null || selection === null) return [];
  const out: string[] = [];
  for (let i = 0; i < stable.length; i += 1) {
    if (stable[i] !== selection[i]) out.push(stable[i]);
  }
  return out;
}

/** 어긋난 짝의 공통 값. 어긋남이 없으면 `0`. */
function mismatchValue(scene: SortStabilityScene): number {
  const first = mismatchedLabels(scene)[0];
  if (first === undefined) return 0;
  return itemOf(scene, first)?.value ?? 0;
}

export const sortStabilityScene: ScenePlan<SortStabilityScene> = {
  /**
   * 첫 장면은 입력 줄 하나다.
   *
   * 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로
   * 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라,
   * 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래에서 항목마다 새 객체를 짓는다.
   */
  initial(initialData: unknown): SortStabilityScene {
    const raw = (initialData ?? {}) as { items?: unknown };
    const items: SortStabilityItem[] = [];
    if (Array.isArray(raw.items)) {
      for (const entry of raw.items) {
        const one = entry as { label?: unknown; value?: unknown };
        if (typeof one?.label !== 'string') continue;
        if (typeof one?.value !== 'number' || !Number.isFinite(one.value)) continue;
        items.push({ label: one.label, value: one.value });
      }
    }
    return atStart({ items });
  },

  reduce(scene: SortStabilityScene, event: FacetRuntimeEvent): SortStabilityScene {
    switch (event.type) {
      // 안정 정렬의 결과가 갈라져 나온다. 차례는 바탕에 순수 함수를 먹여 얻는다 —
      // 걸음이 실어 오면 화면의 구조와 다른 출처가 된다.
      case 'sort-stable':
        return {
          ...scene,
          stable: stableResultOrder(scene.items),
          step: { kind: 'fanOut', row: 'stable' },
          caption: { kind: 'stable' },
        };

      // 선택 정렬의 결과가 갈라져 나온다. 같은 입력인데 차례가 다르다.
      case 'sort-selection':
        return {
          ...scene,
          selection: selectionResultOrder(scene.items),
          step: { kind: 'fanOut', row: 'selection' },
          caption: { kind: 'selection' },
        };

      // 이름표를 접는다. 값만 남으면 두 결과 줄이 글자 하나 다르지 않다 —
      // 그것이 이 조각이 세우는 문제다.
      case 'tags-hidden':
        return {
          ...scene,
          tagsHidden: true,
          step: { kind: 'fold' },
          caption: { kind: 'tagsHidden' },
        };

      // 이름표를 도로 펴고 실을 잇는다. 문제 뒤에 오는 장치다.
      case 'link-origin':
        return {
          ...scene,
          tagsHidden: false,
          threaded: true,
          step: { kind: 'link' },
          caption: { kind: 'linkOrigin' },
        };

      // 결론. 어긋난 짝은 구조에서 셈되므로 걸음이 실어 올 것이 없다.
      case 'mark-mismatch':
        return {
          ...scene,
          marked: true,
          step: { kind: 'mark' },
          caption: { kind: 'mismatch', value: mismatchValue(scene) },
        };

      case 'rewind':
        return atStart({ items: scene.items });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
