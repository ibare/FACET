/**
 * IndexAddressCalc 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에는 메모리 칸이 늘어서 있고, 아래에는 계산 레일이 있다. 레일 위를 **칩 하나**가
 * 왼쪽에서 들어와 곱셈 관문과 덧셈 관문을 지나며 번호 → 오프셋 → 주소로 바뀌고,
 * 마지막에 레일을 떠나 제 칸으로 곧장 날아간다.
 *
 * 그러니 이 조각에서 **머무는 것**은 셋뿐이다.
 *
 *   - 늘어선 칸 (`cells`)                  — 한 번 놓이면 끝까지 그대로다.
 *   - 레일 위 칩이 어디까지 갔나 (`chip`)  — 관문 셋 중 하나에 서 있다.
 *   - 닿아서 물든 칸 (`landed`)            — 다음 번호를 묻기 전까지 남는다.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은 그것을
 * 보고 무엇을 흐르게 할지 고른다. 관문이 잠깐 빛나는 것은 걸음 안에서만 살다 가므로
 * 장면에 담지 않는다.
 *
 * 좌표는 담지 않는다. 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 관문의 x, 칸의 폭, 궤적의 제어점은 전부 그림의 몫이다.
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10). 주소 표기 (`0x100C`) 도 문안이 아니라 표식이므로
 * 수를 그대로 담고 그리는 쪽이 만든다 (C10 판정 3).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 메모리에 놓인 칸 하나. 자리는 담지 않는다 — 번호가 자리를 정한다. */
export type AddressCell = { index: number; addr: number; value: number };

/**
 * 레일 위 칩 — 어느 관문까지 갔고 무엇을 들고 있나.
 *
 * 칩의 x 좌표를 담지 않는 것이 핵심이다. `stage` 가 구조이고 좌표는 그것의 결과다.
 * 지나온 값 (`index` → `offset` → `addr`) 을 함께 지니는 것은, 흐르게 그릴 때
 * 출발 그림을 셈으로 복원하기 위해서다 — 그리는 쪽이 `prev` 를 들춰 보지 않아도
 * 된다.
 */
export type RailChip =
  | { stage: 'index'; index: number }
  | { stage: 'offset'; index: number; offset: number }
  | { stage: 'address'; index: number; offset: number; addr: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type AddressCaption =
  | { kind: 'memory'; base: number; unit: number }
  | { kind: 'ask'; index: number }
  | { kind: 'scale'; index: number; unit: number; offset: number }
  | { kind: 'add'; base: number; offset: number; addr: number }
  | { kind: 'reach'; index: number; addr: number; value: number }
  | { kind: 'done' };

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type AddressStep = 'laid' | 'ask' | 'scale' | 'add' | 'land';

export type IndexAddressCalcScene = {
  /** 배열이 시작하는 기준 주소. 덧셈 관문의 라벨이 된다. */
  base: number;
  /** 원소 하나의 크기. 곱셈 관문의 라벨이 된다. */
  unit: number;
  /** 늘어선 칸. 비어 있으면 아직 아무것도 놓이지 않았다. */
  cells: AddressCell[];
  /** 레일 위 칩. 없으면 레일이 비어 있다. */
  chip: RailChip | null;
  /** 칩이 닿아 물든 칸. 다음 번호를 묻는 순간 거둬진다. */
  landed: AddressCell | null;
  step: AddressStep | null;
  caption: AddressCaption | null;
};

const EMPTY: IndexAddressCalcScene = {
  base: 0,
  unit: 0,
  cells: [],
  chip: null,
  landed: null,
  step: null,
  caption: null,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readCells(v: unknown): AddressCell[] {
  if (!Array.isArray(v)) return [];
  const cells: AddressCell[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.index !== 'number' ||
      typeof c.addr !== 'number' ||
      typeof c.value !== 'number'
    ) {
      continue;
    }
    cells.push({ index: c.index, addr: c.addr, value: c.value });
  }
  return cells;
}

export const indexAddressCalcScene: ScenePlan<IndexAddressCalcScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 칸의 주소는 algorithm 이 `base + i × unit` 로 셈해 `memory-laid` 에 실어 보낸다.
   * 여기서 `initialData` 를 다시 셈하면 같은 계산이 두 곳에 살게 되고, 넘겨받은
   * 객체를 참조로 쥐면 되짚을 때 이미 다 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   */
  initial(): IndexAddressCalcScene {
    return EMPTY;
  },

  reduce(scene: IndexAddressCalcScene, event: FacetRuntimeEvent): IndexAddressCalcScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'memory-laid': {
        const cells = readCells(p.cells);
        if (cells.length === 0) return scene;
        const base = num(p.base, scene.base);
        const unit = num(p.unit, scene.unit);
        return {
          base,
          unit,
          cells,
          chip: null,
          landed: null,
          step: 'laid',
          caption: { kind: 'memory', base, unit },
        };
      }

      case 'index-asked': {
        const index = num(p.index);
        return {
          ...scene,
          chip: { stage: 'index', index },
          // 앞 번호가 물들여 놓은 칸은 여기서 거둬진다 — 한 번에 한 자리만 말한다.
          landed: null,
          step: 'ask',
          caption: { kind: 'ask', index },
        };
      }

      case 'offset-scaled': {
        const index = num(p.index, scene.chip?.index ?? 0);
        const unit = num(p.unit, scene.unit);
        const offset = num(p.offset);
        return {
          ...scene,
          chip: { stage: 'offset', index, offset },
          step: 'scale',
          caption: { kind: 'scale', index, unit, offset },
        };
      }

      case 'address-formed': {
        const chip = scene.chip;
        // 레일에 오르지 않은 칩은 관문을 지날 수 없다. 조용히 흘린다 (C2).
        if (chip === null) return scene;
        const base = num(p.base, scene.base);
        const offset = num(p.offset, chip.stage === 'index' ? 0 : chip.offset);
        const addr = num(p.addr);
        return {
          ...scene,
          chip: { stage: 'address', index: chip.index, offset, addr },
          step: 'add',
          caption: { kind: 'add', base, offset, addr },
        };
      }

      case 'cell-reached': {
        const index = num(p.index, scene.chip?.index ?? 0);
        const addr = num(p.addr);
        const value = num(p.value);
        return {
          ...scene,
          // 칩은 레일을 떠나 칸에 스며든다 — 자리에 남는 것은 물든 칸이다.
          chip: null,
          landed: { index, addr, value },
          step: 'land',
          caption: { kind: 'reach', index, addr, value },
        };
      }

      // 손으로 짚기 시작 — 놓인 칸은 그대로 두고 레일 위의 것만 거둔다.
      case 'rewind':
        return {
          ...scene,
          chip: null,
          landed: null,
          step: null,
          caption:
            scene.cells.length > 0 ? { kind: 'memory', base: scene.base, unit: scene.unit } : null,
        };

      // 할 말을 마치고 결론만 말한다. 화면은 그대로 두고 캡션만 바뀐다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'done' } };

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
