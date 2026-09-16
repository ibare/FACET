/**
 * 정렬부 삽입 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 칸(자리)은 고정되어 있고 **값만 옮겨 다닌다.** 새 값이 마지막 칸에서 뽑혀 허공에
 * 들리고, 그 칸이 빈자리가 되고, 견줌에 진 값이 오른쪽 빈자리로 비켜설 때마다
 * 빈자리가 한 칸씩 왼쪽으로 옮겨 온다. 그러니 화면을 다시 그리는 데 필요한 것은
 * **어느 칸에 어느 값이 앉아 있는가** 하나로 거의 다 된다 — 빈자리는 그 목록에서
 * 비어 있는 칸이고, 허공에 들린 값은 빈자리 바로 위에 있다.
 *
 * 앞서 이 상태는 stage 안에만 있었다. `const inSlot: Array<Tile | null>` 이
 * `const` 로 묶인 채 `inSlot[from] = null` 로 제자리에서 고쳐졌고(그래서 `let`
 * grep 을 통과했다), 들린 값이 누구인지는 `let keyTile` 이, 그것이 이미 내려앉았는지는
 * `let keySettled` 가 쥐고 있었다. `Tile` 은 DOM 손잡이(`g` · `box` · `label`)와
 * 값(`value`)을 한 객체에 묶었고, `type TileState` 는 **선언만 있고 어디에도 저장되지
 * 않은 채** 칠에만 쓰였다. 되감기는 `let cells` · `let keyIndex` 가 쥔 바탕으로
 * `build()` 를 다시 부르는 길이었다.
 *
 * ── 이 조각의 결론은 **누가 비켜서서 자리가 생겼나** 다
 *
 * 그 결론이 명령형 stage 의 마지막 화면에는 남아 있지 않았다. `stepAside` 가 끝에서
 * 비켜선 타일을 `plain` 으로 되돌렸고 `finish` 가 줄 전체를 한 색으로 칠해, 다 끝난
 * 화면에서는 비켜선 값과 손대지 않은 값의 구별이 사라졌다. 걸음이 왼쪽 끝에 닿기 전에
 * 멈췄다는 사실도 벽 하나로만 남았다.
 *
 * 그래서 두 축을 갈라 장면이 말하게 한다.
 *
 *   · **채움은 값의 형편** — 이 값이 이번 삽입에서 오른쪽으로 비켜섰나, 손대지
 *     않았나, 아니면 들어오는 새 값인가. 채움은 타일에 붙으므로 값이 자리를 옮겨도
 *     따라간다.
 *   · **테두리는 견줌의 표식** — 견주어 보았나, 지금 견주는 중인가.
 *
 * 갈라 두면 부딪히지 않는다. 걸음을 멈추게 한 값은 **비키지 않았으므로 채움은
 * 그대로이고 테두리만 남아** "견주었으나 움직이지 않았다" 가 그대로 읽힌다. 그 값이
 * 곧 이 조각이 말하려는 "왼쪽 끝에 닿기 전에 멈춘다" 의 증거다.
 *
 * 좌표는 담지 않는다. 칸 수와 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. 무엇을 흐르게 할지 고르고, 캡션이 무엇을 말할지도 이것이 정한다.
 *
 * **자리 번호를 싣지 않는다.** 들리는 칸은 줄의 마지막 칸이고, 비켜서는 짝은 빈자리와
 * 그 왼쪽 칸이며, 내려앉는 칸은 `settledAt` 이다 — 전부 장면에서 셈된다. 걸음에 도로
 * 실으면 방금 payload 에서 걷어낸 "두 자리에서 세기" 를 운동 쪽으로 다시 들이는
 * 꼴이 된다.
 */
export type InsertIntoSortedPartStep =
  /** 새 값이 마지막 칸에서 뽑혀 허공으로 오른다. */
  | 'lift'
  /** 들린 값과 빈자리 왼쪽 칸을 견준다. */
  | 'weigh'
  /** 견줌에 진 값이 오른쪽 빈자리로 비켜서고, 들린 값이 새 빈자리 위로 따라간다. */
  | 'shift'
  /** 더 왼쪽으로 가지 않는다. 경계가 선다. */
  | 'halt'
  /** 들려 있던 값이 빈자리로 내려앉는다. */
  | 'settle'
  /** 줄이 다시 섰다. */
  | 'done';

export type InsertIntoSortedPartScene = {
  /**
   * 처음 줄. 마지막 칸이 새 값의 출발 자리다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 줄 안으로 들어갈 새 값. 곧 `origin` 의 마지막 칸이기도 하다. */
  readonly incoming: number;
  /**
   * 칸마다 지금 앉은 값. `null` 이면 빈자리다.
   *
   * 빈자리가 어디인지, 허공의 값이 어느 칸 위에 떠 있는지, 어느 값들이 비켜섰는지가
   * 전부 이 목록 하나에서 나온다.
   */
  readonly cells: readonly (number | null)[];
  /** 새 값이 내려앉은 칸. 아직이면 `null`. **남는 표식**이다 (S-scene). */
  readonly settledAt: number | null;
  /** 걸음을 멈추게 한 값의 칸. 왼쪽 끝까지 갔으면 `null`. **남는 표식**이다. */
  readonly boundary: number | null;
  /** 지금 견주고 있는 칸. 그 걸음에만 서고 다음 걸음에서 거둔다. */
  readonly probing: number | null;
  readonly step: InsertIntoSortedPartStep | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정하고 되감기가 여기로 돌아온다.
 *
 * `cells` · `settledAt` · `boundary` · `probing` 을 넣지 않는다. 그것들은 걸음이 남긴
 * 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 줄이 이미 다 비켜선 채로 서고 그 위에
 * algorithm 이 처음부터 다시 밟는다 — 화면 안에서 두 배치가 어긋난다. 타입으로 좁혀
 * 두어 구조적으로 못 넘어가게 한다 (S-scene).
 */
type InsertIntoSortedPartBase = Pick<InsertIntoSortedPartScene, 'origin' | 'incoming'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: InsertIntoSortedPartBase): InsertIntoSortedPartScene {
  return {
    origin: base.origin,
    incoming: base.incoming,
    cells: [...base.origin],
    settledAt: null,
    boundary: null,
    probing: null,
    step: null,
  };
}

/**
 * 지금 빈자리. 아직 안 들렸거나 이미 내려앉았으면 `null`.
 *
 * 따로 쥐지 않고 `cells` 에서 센다 — 같은 사실을 두 곳에 적어 두면 언젠가 갈린다.
 * 화면과 캡션과 운동이 모두 이 함수를 지난다.
 */
export function holeOf(scene: InsertIntoSortedPartScene): number | null {
  const at = scene.cells.indexOf(null);
  return at < 0 ? null : at;
}

/**
 * 새 값이 지금 줄의 어느 칸에 앉아 있나. 허공에 들려 있으면 `null`.
 *
 * 들리기 전에는 줄의 마지막 칸(제 출발 자리)에 있고, 내려앉은 뒤에는 `settledAt` 에
 * 있다. 그 사이에는 줄에 없다.
 */
export function keySeatOf(scene: InsertIntoSortedPartScene): number | null {
  if (scene.settledAt !== null) return scene.settledAt;
  return holeOf(scene) === null ? scene.origin.length - 1 : null;
}

/**
 * 오른쪽으로 비켜선 값이 앉은 칸인가.
 *
 * 비켜선 값들은 언제나 빈자리(또는 새 값이 앉은 칸) **오른쪽**에 모여 있다. 걸음마다
 * 따로 세어 둘 필요가 없다.
 */
export function hasShifted(scene: InsertIntoSortedPartScene, index: number): boolean {
  const anchor = scene.settledAt ?? holeOf(scene);
  return anchor !== null && index > anchor && scene.cells[index] != null;
}

/** 견줌과 비켜섬을 몇 번 했나. 구조에서 세지므로 걸음이 실어 오지 않는다. */
export function tallyOf(scene: InsertIntoSortedPartScene): { compares: number; shifts: number } {
  const anchor = scene.settledAt ?? holeOf(scene);
  const shifts = anchor === null ? 0 : scene.origin.length - 1 - anchor;
  // 멈춘 값도 한 번 견주었다. 왼쪽 끝까지 갔으면 견줌 수가 곧 비켜섬 수다.
  return { compares: shifts + (scene.boundary === null ? 0 : 1), shifts };
}

/**
 * 칸 하나를 갈아 끼운 새 목록.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로 다시
 * 쓰므로, 고치면 과거가 함께 바뀐다 (S-scene).
 */
function withCell(
  cells: readonly (number | null)[],
  index: number,
  value: number | null,
): (number | null)[] {
  const next = cells.slice();
  if (index >= 0 && index < next.length) next[index] = value;
  return next;
}

export const insertIntoSortedPartScene: ScenePlan<InsertIntoSortedPartScene> = {
  /**
   * 첫 장면은 처음 늘어선 줄이다 — 이미 줄 선 값들과 그 오른쪽 칸의 새 값.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   * 정렬 조각은 특히 가까운 자리다. 아래 `map` 이 새 배열을 만든다.
   */
  initial(initialData: unknown): InsertIntoSortedPartScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const sorted = Array.isArray(raw.sorted) ? raw.sorted.map(num) : [];
    const incoming = num(raw.incoming);
    return atStart({ origin: [...sorted, incoming], incoming });
  },

  reduce(
    scene: InsertIntoSortedPartScene,
    event: FacetRuntimeEvent,
  ): InsertIntoSortedPartScene {
    switch (event.type) {
      // 새 값이 마지막 칸에서 뽑혀 허공으로 오른다. 그 칸이 빈자리가 된다.
      case 'lift': {
        const at = scene.origin.length - 1;
        return {
          ...scene,
          cells: withCell(scene.cells, at, null),
          probing: null,
          step: 'lift',
        };
      }

      // 들린 값과 빈자리 왼쪽 칸을 견준다. 견줄 자리는 빈자리가 정한다.
      case 'compare': {
        const hole = holeOf(scene);
        if (hole === null || hole === 0) return scene;
        return { ...scene, probing: hole - 1, step: 'weigh' };
      }

      // 견줌에 진 값이 오른쪽 빈자리로 비켜선다. 빈자리가 한 칸 왼쪽으로 옮겨 온다.
      case 'step-aside': {
        const hole = holeOf(scene);
        if (hole === null || hole === 0) return scene;
        const from = hole - 1;
        const value = scene.cells[from];
        if (value == null) return scene;
        return {
          ...scene,
          cells: withCell(withCell(scene.cells, hole, value), from, null),
          probing: null,
          step: 'shift',
        };
      }

      // 견준 값이 크지 않다. 여기가 경계다 — 이 표식은 끝까지 남는다.
      case 'stop': {
        const hole = holeOf(scene);
        if (hole === null || hole === 0) return scene;
        return { ...scene, boundary: hole - 1, probing: null, step: 'halt' };
      }

      // 들려 있던 값이 빈자리로 내려앉는다.
      case 'settle': {
        const hole = holeOf(scene);
        if (hole === null) return scene;
        return {
          ...scene,
          cells: withCell(scene.cells, hole, scene.incoming),
          settledAt: hole,
          probing: null,
          step: 'settle',
        };
      }

      // 줄이 다시 섰다. 몇 번 견주고 몇 번 비켰는지는 화면 구조가 이미 말한다.
      case 'done':
        return { ...scene, probing: null, step: 'done' };

      // 손으로 짚기 시작 — 처음 줄로 돌아간다. 걸음이 고친 것은 넘기지 않는다.
      case 'rewind':
        return atStart({ origin: scene.origin, incoming: scene.incoming });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
