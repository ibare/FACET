/**
 * splitWhenFull 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 본체는 "어느 자리에 어느 키가 앉았나" 다
 *
 * 부모의 키 목록 하나와 자식마다의 키 목록 하나. 그 둘이 전부다. 상자의 너비도,
 * 칩의 가로도, 몇 개가 찼나도, 가운데 값이 무엇인가도 전부 그 목록에서 파생된다.
 * 그래서 **화면에 나란히 뜨는 수가 갈릴 수가 없다** — 캡션의 "3개" 와 상자 안의
 * 칩 셋이 같은 배열을 센다.
 *
 * ── 쪼개는 운동은 걸음 셋에 걸쳐 있다
 *
 * `rotate-to-balance` 는 회전이 이벤트 **하나**라 나무가 통째로 갈리고 보간 하나로
 * 끝났다. 여기는 그렇지 않다 — `overflow`(끼어들어 넘친다) · `promote`(가운데가
 * 올라간다) · `divide`(남은 것이 갈라진다) 셋이 각각 한 걸음이다.
 *
 * 그래도 중간 장면이 반쯤 끊기지는 않는다. 셋 다 **온전한 키 목록**을 내놓기
 * 때문이다 (넘친 자리는 잠시 한도를 넘을 뿐 여전히 온전한 자리다). 그러니 걸음마다
 * `배치(출발) → 배치(도착)` 보간 하나로 끝난다 — 본보기와 같은 꼴이고, 다른 것은
 * 출발 배치를 어디서 얻느냐뿐이다.
 *
 * ── 출발 배치는 `prev` 가 아니라 계기값에서 셈한다
 *
 * S-scene 은 `prev` 를 "무엇을 흐르게 할지 **고르는 데만**" 쓰라고 못박는다. 그래서
 * `mark` 가 **이번 걸음이 무엇을 했는지**만 싣고, `arrangementBefore` 가 지금 배치를
 * 거꾸로 풀어 출발 배치를 만든다.
 *
 * - 들어온 키는 도로 빼서 자리 위로 띄운다 (`insertKey` 를 안다).
 * - 올라간 키는 부모에서 빼서 자식에 되돌린다. **어디에 앉았는지는 담지 않는다** —
 *   한 자리의 키는 늘 정렬되어 있으므로 정렬이 자리를 정한다.
 * - 갈라진 둘은 도로 한 자리로 합친다.
 *
 * 그래서 `mark` 에 실리는 것은 자리 번호 하나뿐이고, 옮기는 값은 전부 장면의 키
 * 목록에서 나온다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * - **`stage.slotKeys`** — 지금 각 자식이 무엇을 담고 있나. `showOverflow` 가
 *   제자리에서 대입하고 `showPromote` 가 그것을 **되읽어** 남는 키를 셈했다
 *   (`slotKeys[childIndex].filter(...)`). 되짚어 세운 직후에는 그 값이 아직 옛
 *   화면의 것이라 셈이 틀어진다. 이제 `slots` 다.
 * - **`stage.childCount`** — 자식이 몇 자리인가. 가로 자리를 정하는 값인데
 *   `showDivide` 가 제자리에서 늘렸다. 이제 `slots.length` 다.
 * - **부모의 키 목록은 아무 데도 없었다.** `showPromote` 가 payload 의
 *   `parentKeysAfter` 로 그때그때 그렸을 뿐이라, 되감으면 부모가 무엇을 담고 있는지
 *   말하는 자리가 코드 어디에도 없었다. 이제 `parentKeys` 다.
 * - **`stage.chips: Map<number, ChipEl>`** — 값으로 칩을 찾는 명부. `let` 도
 *   `Set.has` 도 아닌 **조회로 갈리는 암묵 분기**였다 (`chips.get(v)` 가 비면 그 칩은
 *   조용히 안 움직인다). 새로 들어온 키가 화면에 있나 없나가 이 Map 의 열쇠에만
 *   있었고, 되감으면 복원되지 않았다. 이제 `hovering` 과 키 목록에서 파생된다.
 * - **`ChipEl = { g, rect, text, value }`** — DOM 손잡이와 "이 칩이 어느 값인가" 가
 *   한 객체에 묶여 있었다. 칩이 키 목록에서 파생되면 이 묶음 자체가 사라진다.
 * - **칩의 칠과 상자의 테두리가 유일한 상태 저장소였다.** 새로 들어온 키
 *   (`itemActive`) · 올라가 갈림 기준이 된 키 (`itemPivot`) · 넘친 자리
 *   (`danger`) — 셋 다 되돌리는 명령이 없어 "쌓이던" 칠인데 사실 그것이 정보였다.
 *   장면으로 옮기면 저절로 사라지므로 일부러 살린다. 다만 **필드로 적지 않고**
 *   `insertKey` · 부모 키 목록의 차 · 자리의 길이에서 파생시킨다.
 * - **견준 부모 키의 강조는 걸음 안에서 되돌아갔다.** `showDescend` 가 애니메이션
 *   끝에 칠을 거두어, 그 걸음으로 되짚으면 "무엇과 견주어 이리로 내려왔나" 가
 *   화면에서 사라졌다. 이제 `compared` 가 그 걸음 내내 머문다.
 * - **`projector.before`** — 되감기의 바탕. projector 의 `let` 이었다. 이제
 *   `baseParentKeys` · `baseSlots` 다.
 * - **`projector.capacity`** — 한도. projector 의 `let` 이었다. 이제 `capacity` 다.
 *
 * 좌표는 담지 않는다. 자리 번호와 키의 차례가 가로를, 부모/자식 행이 세로를
 * 정하므로 자리는 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 **자리 번호**만 담고 문자는 그리는 쪽이
 * 만든다 — 캡션의 수를 장면이 싣지 않는 것도 같은 까닭이다. 캡션의 "20" 과 칩 안의
 * "20" 이 두 출처면 언젠가 갈린다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 자리 번호 하나씩뿐이다. 옮기는 값도 출발 배치도 장면의 키 목록에서 셈해지므로
 * 여기 실을 것이 없다.
 */
export type SplitWhenFullMark =
  /** 넣을 키가 `slot` 위로 내려와 떠 있다. */
  | { readonly kind: 'descend'; readonly slot: number }
  /** 떠 있던 키가 `slot` 안으로 끼어들어 한도를 넘겼다. */
  | { readonly kind: 'overflow'; readonly slot: number }
  /** `slot` 의 가운데 키가 부모로 올라갔다. */
  | { readonly kind: 'promote'; readonly slot: number }
  /** `slot` 이 `slot` 과 `slot + 1` 로 갈라졌다. */
  | { readonly kind: 'divide'; readonly slot: number };

/**
 * 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지와 자리 번호**다 (C10).
 *
 * 값은 싣지 않는다 — 칩 안의 글자와 같은 곳(키 목록)에서 풀어야 두 수가 갈리지
 * 않는다. 몇 개가 찼나도 같은 까닭으로 싣지 않는다.
 */
export type SplitWhenFullCaption =
  /** 넣을 키와 견준 부모 키. 둘 다 장면이 이미 쥐고 있다. */
  | { readonly kind: 'descend' }
  | { readonly kind: 'overflow'; readonly slot: number }
  | { readonly kind: 'promote' }
  | { readonly kind: 'divide'; readonly slot: number };

export type SplitWhenFullScene = {
  /**
   * 넣기 전 부모의 키. 되감기가 여기로 돌아가고 어느 걸음도 고치지 않는다.
   *
   * 두 몫을 한다 — 되감기의 바탕, 그리고 **올라간 키가 무엇인지 가르는 자** (지금
   * 부모에 있는데 여기 없는 키가 올라간 키다).
   */
  readonly baseParentKeys: readonly number[];
  /** 넣기 전 자식들의 키. 되감기의 바탕이고 어느 걸음도 고치지 않는다. */
  readonly baseSlots: readonly (readonly number[])[];
  /** 넣을 키. 하나뿐이라 값으로 담는다 — 어느 칩이 새로 온 것인지 이것으로 갈린다. */
  readonly insertKey: number;
  /** 한 자리가 담을 수 있는 키의 수. 넘침 판정의 유일한 자다. */
  readonly capacity: number;
  /** 지금 부모가 담은 키. **걸음이 고치는 것이 이것이다.** */
  readonly parentKeys: readonly number[];
  /** 지금 자식들이 담은 키. 바깥 배열의 길이가 곧 자리 수다. */
  readonly slots: readonly (readonly number[])[];
  /** 넣을 키가 아직 어느 자리 위에 떠 있나. 자리에 들어가면 `null`. */
  readonly hovering: number | null;
  /** 내려갈 자리를 고르며 견준 부모 키. 그 걸음에만 머문다. */
  readonly compared: number | null;
  readonly mark: SplitWhenFullMark | null;
  readonly caption: SplitWhenFullCaption | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `parentKeys` · `slots` · `hovering` · `compared` 를 일부러 빼 둔다. 걸음이 고치는
 * 키 목록을 바탕과 같은 급으로 묶어 넘기면 되감은 화면이 **이미 쪼개진 나무**로
 * 서고, 그 위에 algorithm 이 새로 셈한 첫 걸음이 겹쳐 화면 안에서 두 모양이
 * 어긋난다. 타입으로 좁혀 둔다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<
  SplitWhenFullScene,
  'baseParentKeys' | 'baseSlots' | 'insertKey' | 'capacity'
>;

// ── 키 목록에서 세는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 캡션의 "몇 개" 와 "가운데 값", 칠이
// 갈리는 기준, 넘침 판정까지 — payload 에서 곧바로 오는 수가 하나도 없다.

/**
 * 부모로 올라간 키. 아직 아무것도 올라가지 않았으면 `null`.
 *
 * 지금 부모에 있는데 넣기 전 부모에는 없던 키가 그것이다. `reduce` 도 캡션도 칠도
 * 이 한 규칙을 쓰므로 **가운데 값이 두 자리에서 갈릴 수가 없다.**
 */
export function promotedKey(scene: SplitWhenFullScene): number | null {
  return scene.parentKeys.find((k) => !scene.baseParentKeys.includes(k)) ?? null;
}

/** 그 자리가 한도를 넘겼나. 넘친 자리만 테두리가 갈린다. */
export function overflowing(scene: SplitWhenFullScene, slot: number): boolean {
  return (scene.slots[slot]?.length ?? 0) > scene.capacity;
}

/**
 * 그 자리가 **넣을 키를 빼고** 담고 있는 수.
 *
 * "이 자리는 이미 N개가 차 있다" 의 N 이다. 자리 번호로 `baseSlots` 를 들추지 않는
 * 까닭은 `divide` 뒤로 자리 번호가 한 칸씩 밀리기 때문이다 — 지금 보이는 칩을
 * 세는 쪽이 어느 걸음에서 보아도 옳다.
 */
export function heldWithoutInsert(scene: SplitWhenFullScene, slot: number): number {
  return (scene.slots[slot] ?? []).filter((k) => k !== scene.insertKey).length;
}

// ── 배치 — 상자와 칩이 어디에 서는가 (좌표는 없다) ──────────────────────────

/**
 * 한 순간의 키 배치. 좌표가 아니라 **구조**다 — 자리는 그리는 쪽이 셈한다.
 */
export type SplitArrangement = {
  readonly parentKeys: readonly number[];
  readonly slots: readonly (readonly number[])[];
  /** 넣을 키가 떠 있는 자리. 떠 있지 않으면 `null`, 화면에 없으면 칩도 없다. */
  readonly hovering: number | null;
};

/** 지금 서 있는 배치. */
export function arrangementOf(scene: SplitWhenFullScene): SplitArrangement {
  return { parentKeys: scene.parentKeys, slots: scene.slots, hovering: scene.hovering };
}

/**
 * 이번 걸음이 출발한 배치.
 *
 * `prev` 를 들추지 않는다 (S-scene). `mark` 가 가리키는 자리와 장면이 이미 쥔 값
 * (`insertKey` · 부모 키의 차)으로 지금 배치를 거꾸로 풀면 출발 배치가 나온다.
 */
export function arrangementBefore(
  scene: SplitWhenFullScene,
  mark: SplitWhenFullMark,
): SplitArrangement {
  switch (mark.kind) {
    // 아직 아무것도 내려오지 않았다 — 나무는 그대로고 떠 있는 키도 없다.
    // 화면에 없던 칩이라 그리는 쪽이 들어오는 운동으로 다룬다.
    case 'descend':
      return { parentKeys: scene.parentKeys, slots: scene.slots, hovering: null };

    // 끼어든 키를 도로 빼서 그 자리 위로 띄운다.
    case 'overflow': {
      const slots = scene.slots.map((keys, i) =>
        i === mark.slot ? keys.filter((k) => k !== scene.insertKey) : keys,
      );
      return { parentKeys: scene.parentKeys, slots, hovering: mark.slot };
    }

    // 올라간 키를 부모에서 빼고 제 자리에 되돌린다. 어디에 앉았는지는 담지
    // 않는다 — 한 자리의 키는 늘 정렬되어 있으므로 정렬이 자리를 정한다.
    case 'promote': {
      const key = promotedKey(scene);
      if (key === null) return arrangementOf(scene);
      const parentKeys = scene.parentKeys.filter((k) => k !== key);
      const slots = scene.slots.map((keys, i) =>
        i === mark.slot ? [...keys, key].sort((a, b) => a - b) : keys,
      );
      return { parentKeys, slots, hovering: null };
    }

    // 갈라진 둘을 도로 한 자리로 합친다. 자리 수가 하나 줄어드는 유일한 갈래다.
    case 'divide': {
      const slots = [...scene.slots];
      const left = slots[mark.slot] ?? [];
      const right = slots[mark.slot + 1] ?? [];
      slots.splice(mark.slot, 2, [...left, ...right]);
      return { parentKeys: scene.parentKeys, slots, hovering: null };
    }
  }
}

/**
 * 지금 자리 `slot` 이 출발 배치의 어느 자리에서 왔나.
 *
 * `divide` 만 자리 수를 바꾸므로 그때만 갈린다 — 갈라져 나온 둘은 **둘 다** 원래
 * 자리에서 출발한다. 한 상자가 둘로 벌어지는 그림이 된다.
 */
export function slotOrigin(mark: SplitWhenFullMark, slot: number): number {
  if (mark.kind !== 'divide') return slot;
  return slot <= mark.slot ? slot : slot - 1;
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** 수 배열을 **복사해** 읽는다. 참조를 쥐면 과거가 함께 바뀐다 (S-scene). */
function readNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

/** `{ keys: number[] }` 꼴의 노드 하나를 키 목록으로 읽는다. */
function readNodeKeys(raw: unknown): number[] {
  if (!raw || typeof raw !== 'object') return [];
  return readNumbers((raw as { keys?: unknown }).keys);
}

function readSlots(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map(readNodeKeys);
}

/** 아직 아무 걸음도 밟지 않은 화면 — 넣기 전 나무만 서 있다. */
function atStart(b: Base): SplitWhenFullScene {
  return {
    baseParentKeys: b.baseParentKeys,
    baseSlots: b.baseSlots,
    insertKey: b.insertKey,
    capacity: b.capacity,
    parentKeys: b.baseParentKeys,
    slots: b.baseSlots,
    hovering: null,
    compared: null,
    mark: null,
    caption: null,
  };
}

export const splitWhenFullScene: ScenePlan<SplitWhenFullScene> = {
  /**
   * 첫 장면은 넣기 전 나무 그대로다.
   *
   * 이 조각은 `init` 이벤트를 내지 않는다 — 첫 걸음이 시작되기 전에도 꽉 찬 자리가
   * 서 있어야 "이 자리는 이미 찼다" 를 볼 대상이 있기 때문이다. 그래서 여기서
   * `initialData` 를 한 번 좁혀 담는다. **값을 복사해** 담는다.
   */
  initial(initialData: unknown): SplitWhenFullScene {
    const d = (initialData ?? {}) as {
      parent?: unknown;
      children?: unknown;
      insertKey?: unknown;
      capacity?: unknown;
    };
    return atStart({
      baseParentKeys: readNodeKeys(d.parent),
      baseSlots: readSlots(d.children),
      insertKey: typeof d.insertKey === 'number' ? d.insertKey : 0,
      capacity: typeof d.capacity === 'number' ? d.capacity : 0,
    });
  },

  reduce(scene: SplitWhenFullScene, event: FacetRuntimeEvent): SplitWhenFullScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const slotOf = (v: unknown): number | null => (typeof v === 'number' ? v : null);

    switch (event.type) {
      // 부모 키와 견주어 어느 자식으로 내려갈지 정한다. 나무는 아직 그대로고,
      // 넣을 키가 그 자리 위로 내려와 떠 있을 뿐이다.
      //
      // 넣을 키는 payload 에서 다시 받지 않는다 — `insertKey` 가 이미 있고, 둘을
      // 다 쓰면 칩의 글자와 캡션의 수가 두 출처에서 온다.
      case 'descend': {
        const slot = slotOf(p.childIndex);
        if (slot === null) return scene;
        const compared = typeof p.comparedKey === 'number' ? p.comparedKey : null;
        return {
          ...scene,
          hovering: slot,
          compared,
          mark: { kind: 'descend', slot },
          caption: { kind: 'descend' },
        };
      }

      // 떠 있던 키가 자리 안으로 끼어든다. 그 자리가 한도를 넘는다 — 넘침 판정은
      // 여기서 하지 않는다. 길이와 `capacity` 를 견주면 어느 걸음에서든 나온다.
      case 'overflow': {
        const slot = slotOf(p.childIndex);
        const tempKeys = readNumbers(p.tempKeys);
        if (slot === null || tempKeys.length === 0) return scene;
        return {
          ...scene,
          slots: scene.slots.map((keys, i) => (i === slot ? tempKeys : keys)),
          hovering: null,
          compared: null,
          mark: { kind: 'overflow', slot },
          caption: { kind: 'overflow', slot },
        };
      }

      // 가운데 키가 부모로 올라간다. **어느 키가 올라갔는지는 부모 키의 차에서
      // 나온다** — payload 의 `middleKey`/`middleIndex` 를 따로 쓰면 자식에서 빠지는
      // 키와 부모에 꽂히는 키가 두 자리에서 정해져 갈릴 수 있다.
      case 'promote': {
        const slot = slotOf(p.childIndex);
        const parentKeysAfter = readNumbers(p.parentKeysAfter);
        if (slot === null || parentKeysAfter.length === 0) return scene;
        const risen = parentKeysAfter.find((k) => !scene.baseParentKeys.includes(k));
        if (risen === undefined) return scene;
        return {
          ...scene,
          parentKeys: parentKeysAfter,
          slots: scene.slots.map((keys, i) =>
            i === slot ? keys.filter((k) => k !== risen) : keys,
          ),
          compared: null,
          mark: { kind: 'promote', slot },
          caption: { kind: 'promote' },
        };
      }

      // 남은 것이 둘로 갈라진다. 자리 수가 하나 늘고 형제들이 한 칸씩 밀린다 —
      // 나무는 옆으로 넓어지고 층수는 그대로다.
      case 'divide': {
        const slot = slotOf(p.childIndex);
        const leftKeys = readNumbers(p.leftKeys);
        const rightKeys = readNumbers(p.rightKeys);
        if (slot === null) return scene;
        const slots = [...scene.slots];
        slots.splice(slot, 1, leftKeys, rightKeys);
        return {
          ...scene,
          slots,
          compared: null,
          mark: { kind: 'divide', slot },
          caption: { kind: 'divide', slot },
        };
      }

      // 손으로 짚기 시작 — 넣기 전 나무로 돌아간다.
      //
      // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({
          baseParentKeys: scene.baseParentKeys,
          baseSlots: scene.baseSlots,
          insertKey: scene.insertKey,
          capacity: scene.capacity,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
