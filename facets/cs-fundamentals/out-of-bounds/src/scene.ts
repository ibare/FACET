/**
 * OutOfBounds 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 주소 순서대로 붙어 선 메모리 띠 한 줄, 그 위를 미끄러지는 커서 하나, 그리고
 * 뒤늦게 내려서는 경계 검사 막대 하나가 전부다. 걸음마다 달라지는 것은 커서가
 * 어느 칸을 짚고 있느냐와, 그 칸을 읽었느냐다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 세 자리에 숨겨 두었다.
 *
 * - projector 의 `shadow` — 바탕 자료를 쥐고 되감을 때 stage 를 다시 세웠다.
 *   이제 바탕은 장면의 앞머리 여섯 필드이고 `initial` 이 한 번만 좁힌다.
 * - stage 의 `cellStates` — 칸마다 `rest · active · breached · scarred` 를 쥐고
 *   `releaseCells()` 가 걸음마다 한 단계씩 낮췄다. **흉터(`scarred`)는 어느
 *   이벤트도 말하지 않는 값**이라, 지나온 걸음을 다 밟아야만 복원되었다. 그것을
 *   `active` 하나와 `scarred` 목록으로 갈라 장면이 말하게 한다 — 흉터는 남는
 *   강조이므로 정적으로 그릴 때도 들어간다.
 * - stage 의 `probeLabelWidth()` — 커서가 벽 앞 어디서 멎을지를 **DOM 에 적어 둔
 *   pill 의 width 를 도로 읽어** 셈했다. 되감아 세운 직후에는 그 width 가 아직
 *   옛 라벨의 것이라 멎는 자리가 틀어졌다. 이제 라벨을 장면에서 만들고 폭도
 *   거기서 셈한다.
 *
 * 좌표는 담지 않는다. 칸 번호와 "벽 앞" 이라는 구조만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 커서가 선 자리. 좌표가 아니라 구조다.
 *
 * `cell` 은 띠의 몇 번째 칸인가 (배열 길이와 같은 번호가 이웃 변수의 칸이다).
 * `edge` 는 경계 검사에 막혀 벽 앞에 멎은 자리 — 어느 칸에도 올라서지 못했다.
 */
export type ProbeAt = { kind: 'cell'; index: number } | { kind: 'edge' };

/** 커서의 지금 모습. 라벨의 문자는 그리는 쪽이 만든다. */
export type ProbeScene = {
  /** 선 자리. */
  at: ProbeAt;
  /** 라벨에 박히는 번호. `null` 이면 아직 정해지지 않아 `i` 로 선다. */
  index: number | null;
  /** 읽어 온 값. 읽기 전이면 `null`. */
  read: number | null;
  /** 남의 자리를 짚고 있나 — 색이 갈린다. */
  danger: boolean;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type OutOfBoundsCaption =
  | { kind: 'compute'; index: number; baseHex: string; stride: number; addressHex: string }
  | { kind: 'keepsCounting'; index: number; addressHex: string }
  | { kind: 'inside'; index: number }
  | { kind: 'crossed'; addressHex: string }
  | { kind: 'readInside'; value: number }
  | { kind: 'readsNeighbor'; index: number; value: number }
  | { kind: 'guard'; lo: number; hi: number }
  | { kind: 'blocked'; index: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 을 함께 담는 까닭 — 커서의 운동은 **지나간 자리에서 출발**하는데,
 * 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 * 그래서 출발 자리를 표식으로 장면에 남긴다.
 */
export type OutOfBoundsStep =
  | { kind: 'move'; from: ProbeAt }
  | { kind: 'guard'; from: ProbeAt }
  | { kind: 'bump'; from: ProbeAt };

export type OutOfBoundsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  arrayName: string;
  values: number[];
  baseAddress: number;
  stride: number;
  neighborName: string;
  neighborValue: number;

  /** 주소 셈 한 줄. `null` 이면 번호가 아직 `i` 로 서 있다. */
  expr: { index: number; addressHex: string } | null;
  probe: ProbeScene;
  /** 지금 읽고 있는 칸. 다음 걸음이 놓아 준다. */
  active: { index: number; outOfBounds: boolean } | null;
  /**
   * 경계 밖으로 한 번 읽힌 칸들. **흉터는 남는다.**
   *
   * 남의 값이 읽혔다는 것이 이 조각의 주장이므로 정적으로 그릴 때도 넣는다.
   * 빠뜨리면 되짚었을 때 사라져 화면이 주장을 잃는다.
   */
  scarred: number[];
  /** 경계 검사. 내려서기 전에는 `null`. */
  guard: { lo: number; hi: number } | null;
  step: OutOfBoundsStep | null;
  caption: OutOfBoundsCaption | null;
  /** 할 말을 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  done: boolean;
};

/** 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다. */
type OutOfBoundsBase = Pick<
  OutOfBoundsScene,
  'arrayName' | 'values' | 'baseAddress' | 'stride' | 'neighborName' | 'neighborValue'
>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: OutOfBoundsBase): OutOfBoundsScene {
  return {
    arrayName: base.arrayName,
    values: base.values,
    baseAddress: base.baseAddress,
    stride: base.stride,
    neighborName: base.neighborName,
    neighborValue: base.neighborValue,
    expr: null,
    probe: { at: { kind: 'cell', index: 0 }, index: null, read: null, danger: false },
    active: null,
    scarred: [],
    guard: null,
    step: null,
    caption: null,
    done: false,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

/**
 * 읽고 있던 칸을 놓아 준다. 경계를 넘어 읽힌 칸은 흉터를 남긴다.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로
 * 다시 쓰므로, 고치면 과거가 함께 바뀐다.
 */
function release(scene: OutOfBoundsScene): Pick<OutOfBoundsScene, 'active' | 'scarred'> {
  const cell = scene.active;
  if (!cell || !cell.outOfBounds || scene.scarred.includes(cell.index)) {
    return { active: null, scarred: scene.scarred };
  }
  return { active: null, scarred: [...scene.scarred, cell.index] };
}

/**
 * 걸음이 실어 보낸 문안 키를 캡션으로 옮긴다.
 *
 * algorithm 은 키만 보내고 문자는 그리는 쪽이 만든다 (C10). 여기서는 키를 타입이
 * 갈라지는 갈래로 바꿔 두어, 그리는 쪽이 인자를 빠뜨리면 tsc 가 잡게 한다.
 */
function captionOf(key: string, p: Record<string, unknown>): OutOfBoundsCaption | null {
  switch (key) {
    case 'caption.compute':
      return {
        kind: 'compute',
        index: num(p.index, 0),
        baseHex: str(p.baseHex, ''),
        stride: num(p.stride, 0),
        addressHex: str(p.addressHex, ''),
      };
    case 'caption.keepsCounting':
      return { kind: 'keepsCounting', index: num(p.index, 0), addressHex: str(p.addressHex, '') };
    case 'caption.inside':
      return { kind: 'inside', index: num(p.index, 0) };
    case 'caption.crossed':
      return { kind: 'crossed', addressHex: str(p.addressHex, '') };
    case 'caption.readInside':
      return { kind: 'readInside', value: num(p.value, 0) };
    case 'caption.readsNeighbor':
      return { kind: 'readsNeighbor', index: num(p.index, 0), value: num(p.value, 0) };
    case 'caption.guard':
      return { kind: 'guard', lo: num(p.lo, 0), hi: num(p.hi, 0) };
    case 'caption.blocked':
      return { kind: 'blocked', index: num(p.index, 0) };
    default:
      return null;
  }
}

export const outOfBoundsScene: ScenePlan<OutOfBoundsScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): OutOfBoundsScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      arrayName: str(d.arrayName, 'arr'),
      values: nums(d.values),
      baseAddress: num(d.baseAddress, 0),
      stride: num(d.stride, 4),
      neighborName: str(d.neighborName, 'next'),
      neighborValue: num(d.neighborValue, 0),
    });
  },

  reduce(scene: OutOfBoundsScene, event: FacetRuntimeEvent): OutOfBoundsScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const caption = captionOf(str(p.textKey, ''), p);

    switch (event.type) {
      // 주소 셈이 결과를 냈다. 수식 줄만 갱신되고 커서는 제자리다.
      case 'address-computed':
        return {
          ...scene,
          expr: { index: num(p.index, 0), addressHex: str(p.addressHex, '') },
          step: null,
          caption,
        };

      // 커서가 그 주소의 칸으로 미끄러져 간다.
      case 'probe-move': {
        const index = num(p.index, 0);
        return {
          ...scene,
          ...release(scene),
          probe: {
            at: { kind: 'cell', index },
            index,
            read: null,
            danger: p.crossed === true,
          },
          step: { kind: 'move', from: scene.probe.at },
          caption,
        };
      }

      // 커서가 선 자리의 값을 읽는다. 운동은 없고 색과 라벨만 갈린다.
      case 'slot-read': {
        const index = num(p.index, 0);
        const outOfBounds = p.outOfBounds === true;
        return {
          ...scene,
          probe: { ...scene.probe, index, read: num(p.value, 0), danger: outOfBounds },
          active: { index, outOfBounds },
          step: null,
          caption,
        };
      }

      // 커서가 기준 자리로 물러난 뒤 경계 검사가 배열의 끝에 내려선다.
      case 'guard-drop': {
        const home = num(p.homeIndex, 0);
        return {
          ...scene,
          ...release(scene),
          probe: { at: { kind: 'cell', index: home }, index: null, read: null, danger: false },
          guard: { lo: num(p.lo, 0), hi: num(p.hi, 0) },
          step: { kind: 'guard', from: scene.probe.at },
          caption,
        };
      }

      // 커서가 다시 나아가지만 벽에 부딪혀 그 앞에서 멎는다. 접근이 일어나지 않는다.
      case 'probe-blocked':
        return {
          ...scene,
          probe: { at: { kind: 'edge' }, index: num(p.index, 0), read: null, danger: false },
          step: { kind: 'bump', from: scene.probe.at },
          caption,
        };

      // 할 말을 마쳤다. 화면은 그대로 두고 완료만 표시한다.
      case 'done':
        return { ...scene, step: null, done: true };

      case 'rewind':
        return atStart(scene);

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
