/**
 * boundAndCut 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 다음
 * 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 본체는 "어느 갈래가 무슨 결정을 들고 있나" 다
 *
 * 갈래 하나마다 **결정 목록 하나**. 그것이 전부다. 값도, 무게도, 한계도, 쪼갠
 * 물건도, 다 정해졌나도 전부 그 목록에서 나온다 (`packedLoad` · `relaxBound` ·
 * `isSettled`). 화면에 나란히 뜨는 수가 갈릴 자리가 없다.
 *
 * ── 축은 **지금까지의 최고**다
 *
 * 명령형 stage 는 그 수를 세 곳에 두고 있었다 — `let best`, 최고 칸의
 * `textContent`, 그리고 걸음이 실어 온 `payload.best`. 자르는 캡션의 "최고 27" 은
 * payload 에서 오고 칸의 "27" 은 `let best` 에서 왔다. 같은 수의 출처가 둘이었다.
 *
 * 이제 **장면이 재 온 갈래들에서 센다** — `bestOf` 하나다. 최고를 올린 갈래의
 * 자리 번호만 `raised` 에 쌓고, 최고는 그 갈래들의 값 중 가장 큰 것이다. 자를 때의
 * 최고도 같은 함수가 `order` 앞쪽만 보고 센다 (`bestBefore`).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * | 어디에 있었나 | 무엇이었나 | 이제 |
 * | --- | --- | --- |
 * | `const columns: Map<number, Column>` | 어느 갈래가 섰나 + 그 값·한계 | `branches` |
 * | `Column` 의 `value` · `bound` | DOM 손잡이와 한 객체에 묶인 수치 | `packedLoad` · `relaxBound` |
 * | `let best` + 칸의 `textContent` | 지금까지의 최고 | `raised` → `bestOf` |
 * | `cap` 의 stroke 색 · dasharray | 이 갈래가 잘렸나 / 다 정해졌나 | `cutOrders` · `isSettled` |
 * | `boundLabel` 의 fill | 잘렸나 | `cutOrders` |
 * | `×` 글자 요소 | 잘렸나 (DOM 에만 적혀 있었다) | `cutOrders` |
 * | `finish()` 가 붙이던 테 | 어느 갈래가 답을 들었나 | `concluded` + `answerOrderOf` |
 * | `let itemOrder` | 값/무게 순서 | `items` (선언에서 `sortByDensity`) |
 * | `let scaleMax` · `colW` · `barW` · `chipW` · `originX` | 자와 자리의 치수 | `scaleMax` · `columns` 에서 그리는 쪽이 역산 |
 * | `bestLine`/`bestBox` 의 `y` | 최고가 어디까지 올라왔나 | `bestOf` 에서 역산 |
 * | `caption` 의 `textContent` | 지금 무슨 말을 하나 | `caption` |
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 자리는 `columns`(갈래 수)와 `scaleMax`(눈금)에서 그리는 쪽이 캔버스에 역산한다
 * (S-piece). 캡션은 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 같은 함수들과
 * `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  isSettled,
  packedLoad,
  relaxBound,
  sortByDensity,
  type Decision,
  type KnapsackItem,
  type Relaxation,
} from './algorithm.js';

export type { Decision, KnapsackItem, Relaxation };

/**
 * 잰 갈래 하나.
 *
 * 값도 한계도 담지 않는다 — 결정에서 셈해지고, 담아 두면 같은 물음에 두 답이
 * 생긴다. 자리 번호도 담지 않는다. 걸음이 오는 차례가 곧 자리 번호다.
 */
export type BoundBranch = {
  readonly decisions: readonly Decision[];
};

/** 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type BoundMark =
  | { readonly kind: 'measure'; readonly order: number }
  | { readonly kind: 'best'; readonly order: number }
  | { readonly kind: 'cut'; readonly order: number }
  | { readonly kind: 'done' };

/** 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지**뿐이다 (C10). */
export type BoundCaption =
  | { readonly kind: 'root' }
  | { readonly kind: 'measure' }
  | { readonly kind: 'settled' }
  | { readonly kind: 'newBest' }
  | { readonly kind: 'cut' }
  | { readonly kind: 'done' };

export type BoundAndCutScene = {
  /** 값/무게가 큰 순서로 세운 물건. 선언에서 한 번 나온다. */
  readonly items: readonly KnapsackItem[];
  /** 가방의 무게 한도. */
  readonly capacity: number;
  /**
   * 갈래가 몇이 될지. 자리 폭을 정하려면 첫 갈래가 서기 전에 알아야 하는데,
   * 그 수는 **다 돌아 봐야** 나오므로 걸음이 실어 온다 (`plan`).
   */
  readonly columns: number;
  /** 자의 눈금 최대값. 위와 같은 까닭으로 걸음이 실어 온다. */
  readonly scaleMax: number;
  /** 잰 갈래들. 자리 번호 = 이 배열의 자리. */
  readonly branches: readonly BoundBranch[];
  /** 최고를 올린 갈래의 자리 번호들. **최고는 여기서 센다.** */
  readonly raised: readonly number[];
  /** 잘린 갈래의 자리 번호들. 자른 횟수도 여기서 나온다. */
  readonly cutOrders: readonly number[];
  /** 다 돌았다 — 정지 화면에 남는 결론. */
  readonly concluded: boolean;
  readonly mark: BoundMark | null;
  readonly caption: BoundCaption | null;
};

/**
 * 걸음이 고치지 않는 것 — 물건·한도·자리 수·눈금.
 *
 * `plan` 은 처음 한 번만 오고 되감기 뒤에는 오지 않으므로 바탕에 든다. 반대로
 * `branches`·`raised`·`cutOrders` 는 걸음이 쌓는 자취라 바탕이 아니다. 섞으면
 * 되감은 화면이 이미 걸어온 자취를 인 채로 선다.
 */
type BoundBase = Pick<BoundAndCutScene, 'items' | 'capacity' | 'columns' | 'scaleMax'>;

/**
 * 아무 갈래도 서지 않은 화면.
 *
 * 호출부가 **객체 리터럴**을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 장면 전체가 그대로 통과한다 (프로토콜 4절).
 */
function atStart(base: BoundBase): BoundAndCutScene {
  return {
    ...base,
    branches: [],
    raised: [],
    cutOrders: [],
    concluded: false,
    mark: null,
    caption: null,
  };
}

// ── 결정에서 셈하는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 막대의 높이도, 자 위의 숫자도, 캡션의
// 한계와 최고도 — payload 에서 곧바로 오는 수가 하나도 없다.

/** 그 갈래가 이미 담기로 한 것들의 값과 무게. */
export function loadOf(
  scene: BoundAndCutScene,
  order: number,
): { value: number; weight: number } {
  const branch = scene.branches[order];
  if (branch === undefined) return { value: 0, weight: 0 };
  return packedLoad(scene.items, branch.decisions);
}

/** 그 갈래의 한계. 알고리즘이 자를지 말지를 가를 때 쓴 바로 그 함수다. */
export function boundOf(scene: BoundAndCutScene, order: number): Relaxation {
  const branch = scene.branches[order];
  if (branch === undefined) return { bound: 0, splitItem: null, splitNum: 0, splitDen: 0 };
  return relaxBound(scene.items, scene.capacity, branch.decisions);
}

/** 그 갈래의 물건이 모두 정해졌나. */
export function isComplete(scene: BoundAndCutScene, order: number): boolean {
  const branch = scene.branches[order];
  return branch !== undefined && isSettled(branch.decisions);
}

/** 그 갈래가 잘렸나. */
export function isCut(scene: BoundAndCutScene, order: number): boolean {
  return scene.cutOrders.includes(order);
}

/**
 * 지금까지의 최고.
 *
 * 최고를 올린 갈래들의 값 중 가장 큰 것이다. 바닥은 0 — 아무것도 담지 않는 것도
 * 하나의 답이라 값 0 에서 시작한다.
 */
export function bestOf(scene: BoundAndCutScene): number {
  let best = 0;
  for (const order of scene.raised) {
    const { value } = loadOf(scene, order);
    if (value > best) best = value;
  }
  return best;
}

/**
 * 그 갈래를 보기 **직전**의 최고.
 *
 * 자를지 말지를 가른 기준이 이것이다. 같은 함수가 앞쪽만 보고 셈하므로 최고와
 * 두 출처가 될 수 없다.
 */
export function bestBefore(scene: BoundAndCutScene, order: number): number {
  let best = 0;
  for (const raised of scene.raised) {
    if (raised >= order) continue;
    const { value } = loadOf(scene, raised);
    if (value > best) best = value;
  }
  return best;
}

/**
 * 최적값을 들고 결정이 모두 끝난 갈래. 없으면 -1.
 *
 * 잘린 갈래는 한계가 최고에 못 미쳤고, 결정이 끝난 갈래는 한계가 곧 값이므로
 * 여기에 걸릴 수 없다 — 따로 걸러 낼 것이 없다.
 */
export function answerOrderOf(scene: BoundAndCutScene): number {
  const best = bestOf(scene);
  let answer = -1;
  for (let order = 0; order < scene.branches.length; order += 1) {
    if (!isComplete(scene, order)) continue;
    if (loadOf(scene, order).value === best) answer = order;
  }
  return answer;
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/**
 * 물건을 **복사해** 읽는다.
 *
 * 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체다. 참조를 쥐면 되짚을
 * 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readItems(raw: unknown): KnapsackItem[] {
  if (!Array.isArray(raw)) return [];
  const out: KnapsackItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const it = entry as { id?: unknown; weight?: unknown; value?: unknown };
    if (typeof it.id !== 'string') continue;
    if (typeof it.weight !== 'number' || typeof it.value !== 'number') continue;
    out.push({ id: it.id, weight: it.weight, value: it.value });
  }
  return out;
}

function readDecisions(raw: unknown): Decision[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Decision[] = [];
  for (const d of raw) {
    if (d !== 'in' && d !== 'out' && d !== 'open') return null;
    out.push(d);
  }
  return out;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const boundAndCutScene: ScenePlan<BoundAndCutScene> = {
  /**
   * 물건과 한도는 선언에서 곧바로 나온다 — 판 위의 띠가 그것을 보이는 것이 첫
   * 화면이다. 자리 수와 눈금은 아직 0 이고 곧 오는 `plan`(조용한 발신)이 채운다.
   */
  initial(initialData: unknown): BoundAndCutScene {
    const raw = (initialData ?? {}) as { capacity?: unknown; items?: unknown };
    return atStart({
      items: sortByDensity(readItems(raw.items)),
      capacity: num(raw.capacity) ?? 0,
      columns: 0,
      scaleMax: 0,
    });
  },

  reduce(scene: BoundAndCutScene, event: FacetRuntimeEvent): BoundAndCutScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 자와 자리의 치수. 조용한 발신이라 걸음을 늘리지 않고 첫 장면을 갈아 끼운다.
      case 'plan': {
        const columns = num(p.columns);
        const scaleMax = num(p.scaleMax);
        if (columns === null || scaleMax === null) return scene;
        return { ...scene, columns, scaleMax };
      }

      // 갈래 하나에 자를 대어 잰다. 결정만 온다 — 나머지는 전부 셈해진다.
      case 'branch-measured': {
        const decisions = readDecisions(p.decisions);
        if (decisions === null) return scene;
        const order = scene.branches.length;
        const next: BoundAndCutScene = {
          ...scene,
          branches: [...scene.branches, { decisions }],
          mark: { kind: 'measure', order },
          caption: null,
        };
        const kind: BoundCaption['kind'] = isComplete(next, order)
          ? 'settled'
          : order === 0
            ? 'root'
            : 'measure';
        return { ...next, caption: { kind } };
      }

      // 직전에 잰 갈래가 최고를 올린다. 올라간 값은 그 갈래의 값이다.
      case 'best-raised': {
        const order = scene.branches.length - 1;
        if (order < 0) return scene;
        return {
          ...scene,
          raised: [...scene.raised, order],
          mark: { kind: 'best', order },
          caption: { kind: 'newBest' },
        };
      }

      // 직전에 잰 갈래를 자른다. 한계도 최고도 장면이 쥔 것에서 나온다.
      case 'branch-cut': {
        const order = scene.branches.length - 1;
        if (order < 0) return scene;
        return {
          ...scene,
          cutOrders: [...scene.cutOrders, order],
          mark: { kind: 'cut', order },
          caption: { kind: 'cut' },
        };
      }

      // 다 돌았다. 자른 횟수도 최적값도 답을 든 갈래도 싣지 않는다.
      case 'done':
        return {
          ...scene,
          concluded: true,
          mark: { kind: 'done' },
          caption: { kind: 'done' },
        };

      // 손으로 짚기 시작 — 갈래가 하나도 서지 않은 화면으로 돌아간다. 걸음이
      // 쌓은 자취만 버리고 물건·한도·치수는 바탕이라 그대로 간다.
      case 'rewind':
        return atStart({
          items: scene.items,
          capacity: scene.capacity,
          columns: scene.columns,
          scaleMax: scene.scaleMax,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
