/**
 * PartitionAroundPivot 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 어디에 상태를 숨겨 두었나
 *
 * `let` 도 `Set`/`Map` 조회도 화면 되읽기도 한 건이 없었다. 그것이 "숨은 상태가
 * 없다" 는 뜻이 아니라 **화면이 통째로 상태였다**는 뜻이다. 찾아 보니 네 자리다.
 *
 *   - `Chip = { group, box, label, railX }` 의 `group.transform` — 그 값이 줄에
 *     있는지, 기준선 위에 걸터앉았는지, 어느 방 몇 번째 자리에 앉았는지가
 *     **좌표가 아니라 단계로** 거기 적혀 있었다. 되돌릴 명령이 없다.
 *   - `line` 의 `y1` — 기준선이 펴졌나 접혔나. `armPivot` / `settlePivot` 한 쌍이
 *     제자리에서 고쳤다.
 *   - `badgeDisc` 의 `stroke-width` — 1.5 와 3 두 값에 **"지금 견주는 중"** 과
 *     **"기준 자리가 확정됐다"** 라는 서로 다른 두 뜻이 겹쳐 얹혀 있었다.
 *   - `roomLeft/Right` 의 `stroke` 와 두 이름표의 `fill` — `finish()` 가 한 번
 *     쓰고 마는, 되돌릴 짝이 없는 명령.
 *
 * ── 이 조각의 주장은 **가른 결과**다
 *
 * "기준을 두고 작은 것은 왼쪽, 큰 것은 오른쪽." 그런데 옛 화면은 견줌의 표식
 * (`dressChip(chip, true)`)을 다음 걸음에서 곧바로 지웠다. 다 끝난 화면에는 방이
 * 갈렸다는 것만 남고 **어느 값이 왜 그쪽에 있는지**가 없었다. 그래서 칠을 둘로
 * 가른다.
 *
 *   - **채움은 값의 형편** — 아직 안 봤다 / 지금 기준 위에 있다 / 기준보다 작다 /
 *     크다. 값이 자리를 옮기는 조각이라 형편을 **값**에 실어 두어야 뒤집히지
 *     않는다. 자리에 실으면 맞바꾼 뒤 그 자리에 다른 값이 앉아 읽기가 뒤집힌다.
 *   - **테두리는 견줌의 표식** — 이 값은 기준과 맞대어 보았다. 한 번 서면
 *     **지우지 않는다.** 마지막 화면에서 다섯 모두 표식을 단 채 좌우로 갈려 있는
 *     것이 곧 이 조각의 결론이다.
 *
 * ── 어느 쪽인가는 걸음이 실어 오지 않는다
 *
 * `side` 와 `slot` 은 옛 payload 에 실려 있었다. 둘 다 이 장면에서 나온다 —
 * 자리는 **건넌 차례**가 정하므로 앞서 그 쪽으로 간 수를 세면 되고 (발신이 오는
 * 순서가 이미 말한다), 어느 쪽인가는 **바탕(값·기준)에 순수 함수를 먹이면** 나온다.
 * 뒤엣것은 가르는 잣대 자체라 algorithm 이 `partitionSideOf` 를 내주고 장면이
 * 그것을 부른다 — 잣대가 두 곳에 적히지 않게 (원칙 1 의 허용 방향).
 *
 * 좌표는 담지 않는다. 자리 번호와 쪽이 좌표를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import { partitionSideOf, type PartitionSide } from './algorithm.js';

/**
 * 쪽의 어휘는 가르는 잣대와 같은 자리(algorithm)에 있다. 여기서 다시 내주어
 * **stage 는 장면 타입 하나만 알면 되게** 한다 — View 는 algorithm 을 모른다 (원칙 1).
 */
export type { PartitionSide };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type PartitionCaption =
  | { kind: 'intro' }
  | { kind: 'weigh'; index: number }
  | { kind: 'crossed'; index: number }
  | { kind: 'pivotFinal' }
  | { kind: 'done' };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기 실린 자리 번호에서 셈한다.
 *
 * 값이 실제로 자리를 옮기는 조각이라 출발 그림이 꼭 필요하다. 그것을 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type PartitionStep =
  | { kind: 'arm' }
  | { kind: 'weigh'; index: number }
  | { kind: 'cross'; index: number }
  | { kind: 'settle' }
  | { kind: 'group' };

export type PartitionAroundPivotScene = {
  /**
   * 처음 늘어선 값들. `rewind` 가 여기로 돌아오고, 줄의 간격과 칩 크기도 이
   * 길이가 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 모든 견줌의 한쪽 끝. 이 값만 건너지 않는다. */
  readonly pivot: number;
  /**
   * 자리 i 의 값이 어느 쪽으로 건넜나. `null` 이면 아직 줄에 있다. 길이는 `origin`
   * 과 같다. 방 안의 자리는 여기서 **앞선 같은 쪽의 수를 세어** 나온다.
   */
  readonly placed: readonly (PartitionSide | null)[];
  /** 지금 기준선 위에 걸터앉은 자리. 없으면 `null`. */
  readonly onLine: number | null;
  /** 기준선이 펴져 화면을 좌우로 가르고 있나. */
  readonly lineArmed: boolean;
  /** 기준의 자리가 확정됐나. **남는 표식**이다 (S-scene). */
  readonly pivotSettled: boolean;
  /** 두 쪽이 각각 한 덩어리로 묶였나. **남는 표식**이다. */
  readonly grouped: boolean;
  readonly step: PartitionStep | null;
  readonly caption: PartitionCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `placed` · `onLine` · `lineArmed` 따위를 여기 넣지 않는다. 그것들은 걸음이 고치는
 * 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 화면이 이미 다 갈린 채로 서고 그
 * 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 두어 구조적으로 못
 * 넘어가게 한다 — 다만 **호출부가 객체 리터럴이어야** 초과 속성 검사가 돈다.
 */
type PartitionBase = Pick<PartitionAroundPivotScene, 'origin' | 'pivot'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: PartitionBase): PartitionAroundPivotScene {
  return {
    origin: base.origin,
    pivot: base.pivot,
    placed: base.origin.map(() => null),
    onLine: null,
    lineArmed: false,
    pivotSettled: false,
    grouped: false,
    step: null,
    caption: null,
  };
}

/** 그 자리의 값. 줄 밖이면 `null`. */
function valueAt(scene: PartitionAroundPivotScene, index: number): number | null {
  const v = scene.origin[index];
  return typeof v === 'number' ? v : null;
}

export const partitionAroundPivotScene: ScenePlan<PartitionAroundPivotScene> = {
  /**
   * 첫 장면은 줄에 흩어진 값들과 아직 접혀 있는 기준선이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): PartitionAroundPivotScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const origin = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    const pivot = typeof raw.pivot === 'number' && Number.isFinite(raw.pivot) ? raw.pivot : 0;
    return atStart({ origin, pivot });
  },

  reduce(
    scene: PartitionAroundPivotScene,
    event: FacetRuntimeEvent,
  ): PartitionAroundPivotScene {
    switch (event.type) {
      // 기준선이 배지에서 위로 자라 화면을 좌우로 가른다. 한 회차의 첫 걸음이므로
      // 지난 회차의 자취도 여기서 함께 거둔다 — 몇 번을 밟아도 같은 장면이 된다.
      case 'pivot-set':
        return {
          ...atStart({ origin: scene.origin, pivot: scene.pivot }),
          lineArmed: true,
          step: { kind: 'arm' },
          caption: { kind: 'intro' },
        };

      // 값 하나가 줄에서 내려와 기준선 위에 걸터앉는다.
      // target 파싱은 `toIndexArray` 를 경유한다 (원칙 4).
      case 'compare': {
        const index = toIndexArray(event.target)[0];
        if (typeof index !== 'number' || valueAt(scene, index) === null) return scene;
        return {
          ...scene,
          onLine: index,
          step: { kind: 'weigh', index },
          caption: { kind: 'weigh', index },
        };
      }

      // 선을 넘어 한쪽 방으로 내려간다. 어느 쪽인가는 바탕에 잣대를 먹여 셈한다 —
      // 걸음이 실어 오지 않는다.
      case 'cross': {
        const index = toIndexArray(event.target)[0];
        if (typeof index !== 'number') return scene;
        const value = valueAt(scene, index);
        if (value === null || scene.placed[index] !== null) return scene;
        const placed = scene.placed.slice();
        placed[index] = partitionSideOf(value, scene.pivot);
        return {
          ...scene,
          placed,
          onLine: null,
          step: { kind: 'cross', index },
          caption: { kind: 'crossed', index },
        };
      }

      // 기준선은 할 일을 마치고 오므라들고, 기준값의 자리만 남는다.
      case 'pivot-final':
        return {
          ...scene,
          onLine: null,
          lineArmed: false,
          pivotSettled: true,
          step: { kind: 'settle' },
          caption: { kind: 'pivotFinal' },
        };

      // 두 쪽이 각각 한 덩어리가 된다. 갈렸을 뿐 정렬은 아니라는 매듭.
      case 'done':
        return {
          ...scene,
          grouped: true,
          step: { kind: 'group' },
          caption: { kind: 'done' },
        };

      case 'rewind':
        return atStart({ origin: scene.origin, pivot: scene.pivot });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};

/**
 * 그 값이 제 쪽 방에서 몇 번째 자리에 앉았나.
 *
 * 앞서 같은 쪽으로 건넌 수를 센다 — 자리를 정하는 것은 값의 대소가 아니라 **건넌
 * 차례**이고, 그것이 "방 안은 정렬되지 않았다" 는 이 조각의 매듭이다.
 */
export function slotOf(scene: PartitionAroundPivotScene, index: number): number {
  const side = scene.placed[index];
  if (side === undefined || side === null) return 0;
  let slot = 0;
  for (let i = 0; i < index; i += 1) if (scene.placed[i] === side) slot += 1;
  return slot;
}

/** 그 쪽으로 건너간 값의 수. 캡션과 화면이 같은 셈을 지나게 한다. */
export function countOn(scene: PartitionAroundPivotScene, side: PartitionSide): number {
  let n = 0;
  for (const p of scene.placed) if (p === side) n += 1;
  return n;
}

/** 이 값은 기준과 맞대어 보았나. 한 번 참이 되면 그 회차 동안 참으로 남는다. */
export function isWeighed(scene: PartitionAroundPivotScene, index: number): boolean {
  const side = scene.placed[index];
  return scene.onLine === index || (side !== undefined && side !== null);
}
