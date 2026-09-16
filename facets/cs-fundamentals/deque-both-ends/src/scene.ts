/**
 * DequeBothEnds 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`enter` · `leave` ·
 * `openBothEnds`)를 부르지 않고 그저 다음 장면을 돌려준다는 것이다. 그래서 어느
 * 걸음의 화면이든 셈으로 얻는다 (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어디에 상태를 숨겨 두었나
 *
 * 이 조각의 주장은 **문이 둘인데 그 둘이 넣기와 빼기를 겸한다** 이다. 그러니 화면을
 * 다시 그리는 데 필요한 것은 셋이다.
 *
 *   · 통 안에 어느 값이 어느 자리에 앉아 있나 — `values` + `frontSlot`
 *   · 어느 문이 지금까지 쓰였나 — `used` (칠이 찬다. 넷이 다 차면 그것이 곧 주장이다)
 *   · 어느 문이 지금 쓰이는 중인가 — `ringed` (테가 켜진다)
 *
 * 옮기기 전에는 이 셋이 전부 stage 안에만 있었다. `cells` 배열과 `frontSlot` 변수,
 * 그리고 칩마다 달린 `used` 불리언과 `activeChip` 이다. 명령(`enter` · `leave`)이
 * 그것을 제자리에서 고쳤고 역이 없었으므로, 되짚으면 통 안에 무엇이 남아 있어야
 * 하는지도 어느 문에 불이 들어와 있어야 하는지도 아무도 몰랐다.
 *
 * ── 어느 끝에서 일어났나를 걸음이 말한다
 *
 * 네 조작(양끝에서 넣고 빼기)은 **어느 끝에서 일어났나**가 다를 뿐 나머지가 같다.
 * 그 사실이 운동에만 남으면 되짚은 화면이 그것을 말할 수 없으므로, `step` 이 끝
 * (`side`)과 자리(`slot`)와 값(`value`)을 함께 싣는다. 특히 **나가는** 걸음은 그
 * 값이 `values` 에서 이미 빠진 뒤라, 나가는 그림을 그리려면 `step` 말고는 출처가
 * 없다 — `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 *
 * 좌표는 담지 않는다. 자리 수가 칸 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { FacetEventTarget, FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 통의 두 끝. 이 조각에서는 이것이 곧 "문" 이다. */
export type DequeSide = 'front' | 'back';

/** 한 문이 겸하는 두 일. */
export type DoorKind = 'in' | 'out';

/** 문 넷의 이름. 조작이 넷인 것이 곧 문이 넷인 것이다. */
export type DoorKey = 'front:in' | 'front:out' | 'back:in' | 'back:out';

/** 문 넷 전부. `done` 이 한꺼번에 켜는 것이 이것이다. */
export const ALL_DOORS: readonly DoorKey[] = ['front:in', 'front:out', 'back:in', 'back:out'];

function doorKey(side: DequeSide, kind: DoorKind): DoorKey {
  return `${side}:${kind}` as DoorKey;
}

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type DequeCaption =
  | { kind: 'push'; side: DequeSide }
  | { kind: 'pop'; side: DequeSide }
  | { kind: 'bothEnds' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 들고 나는 운동의 출발 그림은 전부 여기 실린 계기값으로 복원한다 — `side` 가 어느
 * 밖 대기 자리에서 오고 가는지를, `slot` 이 통 안의 어느 자리인지를, `value` 가
 * 나가는 칸에 무엇이 적혀 있었는지를 말한다.
 */
export type DequeStep =
  | { kind: 'enter'; side: DequeSide; value: number; slot: number }
  | { kind: 'leave'; side: DequeSide; value: number; slot: number }
  | { kind: 'open' };

export type DequeBothEndsScene = {
  /**
   * 처음 통 안에 앉아 있던 값. **걸음이 고치지 않는 바탕**이고 `rewind` 가 여기로
   * 돌아온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  seed: readonly number[];
  /** 통 안의 자리 수. 바탕이라 걸음이 고치지 않는다. */
  capacity: number;
  /** 지금 통 안에 앉은 값들 — 앞 문 쪽에서 뒤 문 쪽으로. */
  values: readonly number[];
  /** `values[0]` 이 앉은 자리 번호. `values[i]` 는 `frontSlot + i` 에 앉는다. */
  frontSlot: number;
  /** 칠이 찬 문 — 한 번이라도 쓰인 문. 넷이 다 차는 것이 이 조각의 결론이다. */
  used: readonly DoorKey[];
  /** 테가 켜진 문 — 지금 쓰이는 중인 문. `done` 에서는 넷이 한꺼번에 켜진다. */
  ringed: readonly DoorKey[];
  caption: DequeCaption | null;
  step: DequeStep | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `rewind` 가 이 둘만 넘겨받고 나머지는 선언에서 다시 셈한다. `values` 나 `used` 를
 * 여기 넣으면 되감은 화면이 이미 걸어온 자취를 단 채로 서고 그 위에 algorithm 이
 * 다시 밟는 걸음이 겹친다 (프로토콜 4 절).
 */
type DequeBase = Pick<DequeBothEndsScene, 'seed' | 'capacity'>;

/** 아무 일도 일어나지 않은 처음 장면. 앉은 값은 가운데로 모은다. */
function fresh(base: DequeBase): DequeBothEndsScene {
  return {
    seed: base.seed,
    capacity: base.capacity,
    values: base.seed,
    frontSlot: Math.max(0, Math.floor((base.capacity - base.seed.length) / 2)),
    used: [],
    ringed: [],
    caption: null,
    step: null,
  };
}

/** target 이 가리키는 문. `queue:` prefix 는 `parseTarget` 을 거친다 (원칙 4). */
function readSide(target: FacetEventTarget | undefined): DequeSide | null {
  const raw = Array.isArray(target) ? target[0] : target;
  if (typeof raw !== 'string') return null;
  const parsed = parseTarget(raw);
  if (parsed?.prefix !== 'queue') return null;
  if (parsed.id === 'front') return 'front';
  if (parsed.id === 'back') return 'back';
  return null;
}

/** payload 는 믿지 않고 좁힌다 (C9). */
function readValue(payload: unknown): number | null {
  const p = payload as { value?: unknown } | undefined;
  return typeof p?.value === 'number' && Number.isFinite(p.value) ? p.value : null;
}

/** 이미 켜진 문이면 그대로. 앞 장면을 제자리에서 고치지 않는다 (S-scene). */
function withDoor(used: readonly DoorKey[], key: DoorKey): readonly DoorKey[] {
  return used.includes(key) ? used : [...used, key];
}

export const dequeBothEndsScene: ScenePlan<DequeBothEndsScene> = {
  /**
   * 첫 장면은 통 안에 앉아 있는 처음 값들이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): DequeBothEndsScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const seed = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number')
      : [];
    const declared = typeof raw.capacity === 'number' ? Math.floor(raw.capacity) : seed.length;
    return fresh({ seed, capacity: Math.max(1, declared) });
  },

  reduce(scene: DequeBothEndsScene, event: FacetRuntimeEvent): DequeBothEndsScene {
    switch (event.type) {
      // 그 문으로 값 하나가 들어간다. 앞 문이면 앞자리가 하나 앞으로 늘어난다.
      case 'enqueue': {
        const side = readSide(event.target);
        const value = readValue(event.payload);
        if (side === null || value === null) return scene;
        const slot = side === 'front' ? scene.frontSlot - 1 : scene.frontSlot + scene.values.length;
        if (slot < 0 || slot >= scene.capacity) return scene;
        const key = doorKey(side, 'in');
        return {
          ...scene,
          values: side === 'front' ? [value, ...scene.values] : [...scene.values, value],
          frontSlot: side === 'front' ? slot : scene.frontSlot,
          used: withDoor(scene.used, key),
          ringed: [key],
          caption: { kind: 'push', side },
          step: { kind: 'enter', side, value, slot },
        };
      }

      // 그 문으로 끝의 값 하나가 나온다. 나간 값과 그 자리는 여기서만 알 수 있으므로
      // 걸음에 싣는다 — 다음 장면의 `values` 에는 이미 없다.
      case 'dequeue': {
        const side = readSide(event.target);
        if (side === null || scene.values.length === 0) return scene;
        const last = scene.values.length - 1;
        const slot = side === 'front' ? scene.frontSlot : scene.frontSlot + last;
        const value = side === 'front' ? scene.values[0] : scene.values[last];
        const key = doorKey(side, 'out');
        return {
          ...scene,
          values: side === 'front' ? scene.values.slice(1) : scene.values.slice(0, last),
          frontSlot: side === 'front' ? scene.frontSlot + 1 : scene.frontSlot,
          used: withDoor(scene.used, key),
          ringed: [key],
          caption: { kind: 'pop', side },
          step: { kind: 'leave', side, value, slot },
        };
      }

      // 마무리. 네 문이 한꺼번에 열려 양방향임을 보인다 — 남는 강조라 정적으로도
      // 그려야 되짚었을 때 살아 있다 (S-scene PREFER).
      case 'done':
        return {
          ...scene,
          used: ALL_DOORS,
          ringed: ALL_DOORS,
          caption: { kind: 'bothEnds' },
          step: { kind: 'open' },
        };

      // 처음으로 되감는다. 바탕 둘만 넘기고 나머지는 선언에서 다시 셈한다.
      case 'rewind':
        return fresh(scene);

      default:
        // 이 facet 의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
