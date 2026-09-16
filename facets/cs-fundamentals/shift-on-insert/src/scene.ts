/**
 * ShiftOnInsert 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 칸(주소)은 고정되어 있고 값(내용)만 옮겨 다닌다. 그러니 이 장면이 쥐어야 할
 * **머무는 것**은 셋이다 —
 *
 *   · `cells`   지금 어느 칸에 어느 값이 앉아 있나. 미는 걸음마다 갈아 끼운다.
 *   · `phase`   논증이 어디까지 왔나. 목표 칸의 테두리가 이것으로 갈린다.
 *   · `moves`   지금까지 몇 개를 옮겼나.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은 그것을
 * 보고 무엇을 흐르게 할지 고른다.
 *
 * 좌표는 담지 않는다. 칸 수와 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 논증이 어디까지 왔나.
 *
 * 칸이 차 있는지만으로는 목표 칸의 테두리를 정할 수 없다 — 값이 떠난 직후의 빈
 * 칸과 "이제 들어와도 된다" 고 말하는 빈 칸이 다른 그림이기 때문이다.
 *
 *   ready    아직 아무 말도 안 했다. 처음 배치 그대로.
 *   blocked  넣을 자리를 지목했는데 이미 차 있다 (문제 제시).
 *   shifting 뒤에서부터 미는 중.
 *   cleared  목표 칸이 비었다. 새 값이 들어갈 수 있다.
 *   placed   새 값이 칸에 앉았다.
 *   done     다 끝나고 값을 말한다.
 */
export type ShiftPhase = 'ready' | 'blocked' | 'shifting' | 'cleared' | 'placed' | 'done';

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type ShiftStep =
  /** 새 값이 막힌 자리에 부딪혔다 튕긴다. */
  | { kind: 'bump' }
  /** 한 칸이 옆으로 밀려 간다. */
  | { kind: 'shift'; from: number; to: number }
  /** 새 값이 비워 둔 칸으로 내려앉는다. */
  | { kind: 'drop'; index: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ShiftCaption =
  | { kind: 'plan'; at: number; occupied: number; incoming: number }
  | { kind: 'shift'; value: number; from: number; to: number }
  | { kind: 'cleared'; at: number }
  | { kind: 'placed'; value: number; at: number }
  | { kind: 'done'; moves: number };

export type ShiftOnInsertScene = {
  /**
   * 처음 배치. `rewind` 가 이것으로 돌아간다.
   *
   * 아무도 고치지 않는 공유 구조다 (S-scene 예외) — 고치면 과거가 함께 바뀐다.
   * projector 시절 `let initial` 이 쥐고 있던 것이 이 자리로 올라왔다.
   */
  readonly base: readonly (number | null)[];
  /** 칸마다 지금 앉은 값. `null` 이면 빈 칸. 길이가 곧 배열이 잡아 둔 칸 수다. */
  readonly cells: readonly (number | null)[];
  /** 새 값을 넣을 자리. */
  readonly targetIndex: number;
  /** 넣을 값. 아직 칸에 앉지 않았으면 위에 떠서 기다린다. */
  readonly incoming: number;
  /** 지금까지 옮긴 횟수. */
  readonly moves: number;
  readonly phase: ShiftPhase;
  readonly step: ShiftStep | null;
  readonly caption: ShiftCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
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

/**
 * 처음 배치를 셈한다.
 *
 * 값을 **복사해** 담는다. 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
 * 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readCells(raw: unknown): { cells: (number | null)[]; target: number; incoming: number } {
  const d = (raw ?? {}) as { values?: unknown; capacity?: unknown; targetIndex?: unknown; incoming?: unknown };
  const values = Array.isArray(d.values) ? d.values.map(num) : [];
  const capacity = Math.max(values.length, Math.trunc(num(d.capacity)));
  const cells: (number | null)[] = [];
  for (let i = 0; i < capacity; i += 1) cells.push(i < values.length ? values[i] : null);
  return { cells, target: Math.trunc(num(d.targetIndex)), incoming: num(d.incoming) };
}

export const shiftOnInsertScene: ScenePlan<ShiftOnInsertScene> = {
  /**
   * 첫 장면은 처음 배치 그대로다.
   *
   * 이 조각은 `init` 이벤트를 내지 않는다 — 걸음이 시작되기 전에도 칸과 값이 서
   * 있어야 "넣을 자리가 이미 차 있다" 는 문제 제시가 성립하기 때문이다. 그래서
   * 여기서 `initialData` 를 한 번 좁혀 담는다.
   */
  initial(initialData: unknown): ShiftOnInsertScene {
    const { cells, target, incoming } = readCells(initialData);
    return {
      base: cells,
      cells,
      targetIndex: target,
      incoming,
      moves: 0,
      phase: 'ready',
      step: null,
      caption: null,
    };
  },

  reduce(scene: ShiftOnInsertScene, event: FacetRuntimeEvent): ShiftOnInsertScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 문제 — 넣으려는 자리가 이미 차 있다.
      case 'plan-insert': {
        const at = Math.trunc(num(p.targetIndex));
        return {
          ...scene,
          targetIndex: at,
          incoming: num(p.incoming),
          phase: 'blocked',
          step: { kind: 'bump' },
          caption: {
            kind: 'plan',
            at,
            occupied: num(p.occupied),
            incoming: num(p.incoming),
          },
        };
      }

      // 장치 — 뒤에서부터 한 칸씩. 목적지가 늘 비어 있어 아무것도 덮이지 않는다.
      case 'shift-cell': {
        const from = Math.trunc(num(p.from));
        const to = Math.trunc(num(p.to));
        const value = num(p.value);
        return {
          ...scene,
          cells: withCell(withCell(scene.cells, to, value), from, null),
          moves: Math.trunc(num(p.moves)),
          phase: 'shifting',
          step: { kind: 'shift', from, to },
          caption: { kind: 'shift', value, from, to },
        };
      }

      // 자리가 비었다. 칸은 그대로 두고 그 칸이 무슨 뜻인지만 바뀐다.
      case 'slot-cleared': {
        const at = Math.trunc(num(p.index));
        return {
          ...scene,
          phase: 'cleared',
          step: null,
          caption: { kind: 'cleared', at },
        };
      }

      case 'place-value': {
        const at = Math.trunc(num(p.index));
        const value = num(p.value);
        return {
          ...scene,
          cells: withCell(scene.cells, at, value),
          phase: 'placed',
          step: { kind: 'drop', index: at },
          caption: { kind: 'placed', value, at },
        };
      }

      // 결과 — 자리는 그대로인데 값들이 한 칸씩 옮겨 앉았다.
      case 'done':
        return {
          ...scene,
          moves: Math.trunc(num(p.moves)),
          phase: 'done',
          step: null,
          caption: { kind: 'done', moves: Math.trunc(num(p.moves)) },
        };

      // 손으로 짚기 시작 — 처음 배치로 돌아간다.
      case 'rewind':
        return {
          ...scene,
          cells: scene.base,
          moves: 0,
          phase: 'ready',
          step: null,
          caption: null,
        };

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
