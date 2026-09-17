/**
 * growAndCopy 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 블록이 하나 또는 둘 서 있고, 걸음마다 그 사이에서 한 가지가 달라진다 — 값이
 * 막히거나, 새 블록이 펼쳐지거나, 값 하나가 건너가거나, 옛 블록이 사라지거나,
 * 기다리던 값이 앉는다. 그래서 장면이 쥐는 것은 다섯이다.
 *
 *   seed      처음 블록. 되감을 때 돌아갈 자리라 아무도 고치지 않는다.
 *   oldBlock  옛 블록. 버려지면 null 이 되고, 그 사라짐이 곧 "주소가 바뀌었다" 다.
 *   copied    옛 블록에서 이미 복사해 낸 앞칸 수. 그만큼이 어두워진다.
 *   newBlock  새 블록. 얻기 전에는 null. 칸마다의 값이 복사를 따라 찬다.
 *   pending   들어가려다 막혀 줄 위에 떠 있는 값. 자리를 얻으면 null.
 *
 * 자리는 담지 않는다. 블록 둘이 나란히 설지 하나가 가운데 설지는 `oldBlock` 의
 * 있고 없음이 이미 말하므로, 좌표는 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * ── 사라진 것에서 출발하는 운동은 표식으로 되짚는다
 *
 * 옛 블록이 아래로 떨어지고 새 블록이 가운데로 미끄러지는 걸음은, 다 그리고 난
 * 장면에 옛 블록이 없다. 앞 장면을 그리기 재료로 쓰면 "`prev` 는 고르는 데만" 을
 * 어기므로, `mark` 가 **이번에 무엇이 달라졌는지**와 그 계기값을 함께 싣는다 —
 * `{ kind: 'freed', gone }` 의 `gone` 이 떨어지는 블록의 출발 그림이다.
 *
 * 문안은 담지 않는다. 무엇을 말할지와 그 인자만 담고, 문자는 그리는 쪽이 `params.t`
 * 로 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 한다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 블록 하나. 자리는 없다 — 값과 칸 수라는 구조만 담는다. */
export type GrowBlockScene = {
  /** 주소 표기. 데이터 그대로다. */
  address: string;
  /** 칸 수. */
  capacity: number;
  /** 블록이 차지하는 바이트 수. 크기 표기가 이 수를 쓴다. */
  bytes: number;
  /** 칸마다의 값. 빈 칸은 null 이고, 길이는 언제나 `capacity` 다. */
  cells: (number | null)[];
};

/**
 * 이번 걸음에 달라진 것. 흐르게 할 것을 고르는 표식이자 출발 그림의 계기값이다.
 *
 * 되짚기(`animate` 거짓)에서는 쳐다보지 않는다 — 지나온 걸음을 되밟을 까닭이 없다.
 */
export type GrowMark =
  | { kind: 'blocked'; value: number; slotIndex: number }
  | { kind: 'allocated' }
  | { kind: 'copied'; index: number; value: number }
  | { kind: 'freed'; gone: GrowBlockScene }
  | { kind: 'appended'; index: number; value: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type GrowCaption =
  | { kind: 'blocked'; value: number; capacity: number }
  | { kind: 'allocated'; address: string; capacity: number; bytes: number }
  | { kind: 'copying'; done: number; total: number }
  | { kind: 'freed'; oldAddress: string; newAddress: string }
  | { kind: 'appended'; index: number; value: number }
  | { kind: 'done'; capacity: number; size: number; free: number };

export type GrowAndCopyScene = {
  /** 처음 블록. 되감기가 여기로 돌아간다. 어느 걸음도 이것을 고치지 않는다. */
  seed: GrowBlockScene;
  oldBlock: GrowBlockScene | null;
  /** 옛 블록에서 이미 복사해 낸 앞칸 수. */
  copied: number;
  newBlock: GrowBlockScene | null;
  /** 들어가려다 막혀 줄 위에 떠 있는 값. */
  pending: number | null;
  mark: GrowMark | null;
  caption: GrowCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 칸 배열을 새로 짓는다. 넘겨받은 배열을 그대로 쥐지 않는다 (S-scene). */
function cellsOf(values: unknown, capacity: number): (number | null)[] {
  const src = Array.isArray(values) ? values : [];
  const out: (number | null)[] = [];
  for (let i = 0; i < capacity; i += 1) {
    const v = src[i];
    out.push(typeof v === 'number' && Number.isFinite(v) ? v : null);
  }
  return out;
}

/** 칸 하나에 값을 앉힌 **새** 블록. 앞 장면의 블록은 건드리지 않는다. */
function withValue(block: GrowBlockScene, index: number, value: number): GrowBlockScene {
  const cells = [...block.cells];
  if (index >= 0 && index < cells.length) cells[index] = value;
  return { ...block, cells };
}

/** 처음 장면으로 돌아간 모양. `initial` 과 `rewind` 가 같은 자리를 쓴다. */
function atStart(seed: GrowBlockScene): GrowAndCopyScene {
  return {
    seed,
    oldBlock: seed,
    copied: 0,
    newBlock: null,
    pending: null,
    mark: null,
    caption: null,
  };
}

export const growAndCopyScene: ScenePlan<GrowAndCopyScene> = {
  /**
   * 처음 장면 — 꽉 찬 블록 하나.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 세운다. 다만 러너가
   * 넘기는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라, 값 배열을 참조로 쥐면
   * 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다. 그래서 **복사해서** 담는다
   * (S-scene).
   */
  initial(initialData: unknown): GrowAndCopyScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const capacity = num(d.oldCapacity);
    return atStart({
      address: str(d.oldAddress),
      capacity,
      bytes: capacity * num(d.elementBytes),
      cells: cellsOf(d.values, capacity),
    });
  },

  reduce(scene: GrowAndCopyScene, event: FacetRuntimeEvent): GrowAndCopyScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'insert-blocked': {
        const value = num(p.value);
        const capacity = num(p.capacity);
        return {
          ...scene,
          // 막힌 값은 줄 위에서 기다린다. 들어갈 자리가 생길 때까지 장면에 남는다.
          pending: value,
          mark: { kind: 'blocked', value, slotIndex: capacity },
          caption: { kind: 'blocked', value, capacity },
        };
      }

      case 'block-allocated': {
        const address = str(p.address);
        const capacity = num(p.capacity);
        const bytes = num(p.bytes);
        return {
          ...scene,
          newBlock: { address, capacity, bytes, cells: cellsOf([], capacity) },
          mark: { kind: 'allocated' },
          caption: { kind: 'allocated', address, capacity, bytes },
        };
      }

      case 'value-copied': {
        const index = num(p.index);
        const value = num(p.value);
        if (!scene.newBlock) return scene;
        return {
          ...scene,
          newBlock: withValue(scene.newBlock, index, value),
          // 복사는 앞칸부터 차례로 간다. 몇 칸까지 갔는지가 곧 어두워진 칸 수다.
          copied: index + 1,
          mark: { kind: 'copied', index, value },
          caption: { kind: 'copying', done: num(p.done), total: num(p.total) },
        };
      }

      case 'block-freed': {
        const gone = scene.oldBlock;
        return {
          ...scene,
          oldBlock: null,
          copied: 0,
          // 떨어지는 블록은 이 장면에 없다. 그 출발 그림을 표식이 싣는다.
          mark: gone ? { kind: 'freed', gone } : null,
          caption: {
            kind: 'freed',
            oldAddress: str(p.address),
            newAddress: str(p.movedTo),
          },
        };
      }

      case 'value-appended': {
        const index = num(p.index);
        const value = num(p.value);
        if (!scene.newBlock) return scene;
        return {
          ...scene,
          newBlock: withValue(scene.newBlock, index, value),
          pending: null,
          mark: { kind: 'appended', index, value },
          caption: { kind: 'appended', index, value },
        };
      }

      case 'done':
        return {
          ...scene,
          // 마지막 걸음은 말만 한다 — 흐르게 할 것이 없다.
          mark: null,
          caption: {
            kind: 'done',
            capacity: num(p.capacity),
            size: num(p.size),
            free: num(p.free),
          },
        };

      // 손으로 짚기 시작 — 자료는 그대로 두고 처음 자리로 돌아간다.
      case 'rewind':
        return atStart(scene.seed);

      default:
        // 이 facet 의 algorithm 은 위 일곱만 발신한다. 그 밖의 것은 흘린다 (C2).
        return scene;
    }
  },
};
