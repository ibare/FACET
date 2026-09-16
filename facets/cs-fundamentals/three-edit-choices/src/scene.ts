/**
 * threeEditChoices 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 `let` 이 하나도 없는 순수 번역기였다. **상태는 전부 stage 에 있었고,
 * 그중 절반은 `let` 도 `Map` 조회도 아니었다.**
 *
 * - **`let levels`** — 사다리의 눈금 수. `levelY` 가 여기 매여 있어 **화면의 모든
 *   높이가 이 수 하나에서 나왔다.** 되짚어 `weigh` 걸음에 세우면 앞 회차의 값이 남는다.
 * - **`let neighbour: Record<Branch, number>`** — `cell-open` 이 적어 두고 `offer` 가
 *   칩의 첫 글자로 꺼내 썼다. 걸음 **사이**를 건너는 값이라 되짚기가 가장 깨지기 쉬운 자리.
 * - **`let won: Branch[]`** — 이긴 갈래. `weigh` 가 적고 `settle` 이 읽는다.
 * - **`let rowAt` · `let colAt`** — 표시자가 지금 선 자리. `openCell` 이 이것을
 *   **미끄러짐의 출발값**으로 삼았다 (`const fromRow = rowAt`). 화면의 지금 자리를 따로
 *   적어 둔 **거울**이라 `getAttribute` 도 `textContent` 도 안 쓰고 ④ 의 grep 을
 *   통과한다 (프로토콜 4 절 함정 28). 되짚어 세운 직후에는 옛 화면의 자리다.
 * - **`type Chip = { g, box, label, badge, …, x, y }`** — DOM 손잡이와 좌표가 한 객체.
 *   `moveChip` 이 `chip.x`/`chip.y` 를 출발값으로 읽고 `settle` 이 `const fromY =
 *   chip.y` 를 읽었다. 위와 같은 거울이고, `const chips = new Map` 이라 `let` grep 을
 *   통과한다 (⑤).
 * - **`type Slot = { box, value, tag }`** — **칸 넷의 값과 이름표가 `textContent` 에만
 *   있었다.** 표의 값이라는 자료가 stage 어디에도 없었다.
 * - **칩의 칠 셋 (`tone(chip, 'rest'|'compare'|'win')`)** — 함수 인자의 **인라인
 *   유니온**이라 `type` 선언조차 없다. 게다가 **한 축에 값을 셋 욱여넣어**
 *   "겨루었다" 와 "이겼다" 가 같은 자리를 다퉜다 (함정 29). 여기서는 형편(채움)과
 *   표식(테두리)을 갈랐다 — 아래 "셋 중" 절.
 * - **`laneLabel[b]` 의 `fill`** · **`letterMarkRow/Col` 의 `opacity`** ·
 *   **`floor` 의 `y1`** · **`slotTarget.box` 의 `stroke-dasharray`** — 이긴 갈래가
 *   누구인가 · 두 글자가 같은가 · 가장 싼 값이 얼마인가 · 칸이 정해졌나가 전부
 *   **속성에만** 적혀 있었다. 어느 것도 변수가 아니다.
 * - **`gGrid` 의 자식 유무** — 사다리가 서 있나. `rewind` 가 비우는 것이 전부였다.
 *
 * 여기서는 그 열둘이 `levels` · `cells` · `finished` · `step` 넷이다. 칸마다
 * **이웃 셋의 값과 후보 셋의 값**만 있으면 높이도 이긴 갈래도 칠도 전부 셈으로 나온다.
 *
 * ── "셋 중" 이 마지막 화면에 남아야 한다
 *
 * 이 조각의 이름은 *세 갈래* 이고 주장은 *셋 중 가장 싼 것* 이다. 그런데 옛 화면은
 * `settle` 에서 진 칩 둘을 아래로 떨어뜨려 지우고 이긴 칩은 칸으로 옮겨 버려,
 * **다 끝난 화면에 후보가 하나도 남지 않았다.** 겨룸이 있었다는 자취가 없으니
 * *셋 중* 도 *가장* 도 사라진다 (프로토콜 4 절 함정 7 · 29).
 *
 * 그래서 칩 셋이 제 높이에 그대로 선 채로 끝난다. 두 축을 갈라 두면 부딪히지 않는다.
 *
 * - **채움 = 값의 형편** — 겨루는 중(흰 바탕) / 이겼다(노랑) / 물러났다(회색·작아짐).
 * - **테두리 = 견줌의 표식** — 한 번 견주어진 칩은 셋 다 같은 테를 두르고 끝까지 둔다.
 *
 * 이긴 값은 칩째 옮기지 않고 **복제본이 칸으로 올라간다.** 칩이 제자리를 떠나면
 * "가장 낮았다" 는 증거가 함께 사라지기 때문이다. 비긴 칸에서 둘이 같은 높이에 나란히
 * 서는 것도 이제 정지 화면에 남는다 — 옛 화면은 둘을 같은 칸으로 겹쳐 보냈다.
 *
 * ── payload 를 걷어낸 자리와 멈춘 자리
 *
 * | 무엇 | 어디로 |
 * | --- | --- |
 * | `i` · `j` | **장면이 센다.** `visits` 가 바탕이고 `cells.length` 가 몇 번째인가다 |
 * | `rowChar` · `colChar` · `same` | **장면이 센다.** `source[i-1]` · `target[j-1]` |
 * | `subCost` | **장면이 센다.** `sub - diag` — 배지 셋이 한 함수(`costOf`)를 지난다 |
 * | `best` · `winners` | **장면이 센다.** 셋의 최솟값과 그것을 낸 갈래 |
 * | `settle` 의 `value` | **장면이 센다.** 곧 `best` 다 |
 * | `up` · `left` · `diag` · `del` · `ins` · `sub` | **싣는다** (아래) |
 * | `levels` | **싣는다** (아래) |
 *
 * **이웃 셋의 값과 후보 셋의 값은 내주지 않고 싣는다.** 잣대대로라면 *바탕 + 순수
 * 함수*라 `computeEditTable` 을 내주면 그만이지만, 그러면 **장면이 편집거리 표를 통째로
 * 채우게 된다** — 이 조각이 첫 줄에서 "표를 채우는 것은 이 조각의 일이 아니다" 라고
 * 말하면서 그렇게 해서 얻은 수를 띄우는 꼴이다. 화면과 주장이 어긋나는 자리이고,
 * 세 후보를 짓는 규칙(`up+1` · `left+1` · `diag+subCost`)은 `bottom-up-table` 의
 * 피보나치 점화식과 같은 급이라 걸음이 내리는 판정으로 남긴다 (프로토콜 4 절의 잣대 표).
 *
 * **`levels` 도 싣는다.** 사다리 눈금은 방문할 칸 **전부**를 통틀어 한 번 정해야
 * 같은 값이 늘 같은 높이에 서는데, 장면은 아직 오지 않은 칸을 셀 수 없다.
 * `greedy-can-fail` 의 `capacity` 와 같은 자리다 — 내주어야 할 함수가 알고리즘 그
 * 자체라 멈추고 싣는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 갈래와 값이라는 **구조**만 담고 레인의 폭도 칩의 크기도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * `step` 이 무엇을 말할지만 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 * 캡션 필드를 따로 두지 않는 까닭은 `step` 과 캡션의 갈래가 1 대 1 이기 때문이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 칸으로 들어오는 세 갈래. 위에서 지움, 왼쪽에서 넣음, 왼쪽 위에서 바꿈. */
export type EditBranch = 'delete' | 'insert' | 'diag';

/** 화면에 선 차례. 레인도 이 순서로 왼쪽부터 선다. */
export const EDIT_BRANCHES: readonly EditBranch[] = ['delete', 'insert', 'diag'];

/** 들여다볼 칸 하나. 바탕이 쥐고 있고 걸음이 고치지 않는다. */
export type EditVisit = { i: number; j: number };

/**
 * 칸 하나의 겨룸.
 *
 * `offers` 가 `null` 이면 아직 내놓기 전이고, `weighed` 는 바닥선이 올라와 가장 낮은
 * 것에 닿았다는 뜻이며, `settled` 는 이긴 값이 칸에 앉았다는 뜻이다. 셋이 차례로
 * 참이 되므로 한 축에 욱여넣지 않고 따로 둔다 (함정 29).
 */
export type EditCell = {
  /**
   * 이웃 셋의 값. 갈래 이름으로 담는다 — 지움은 위 칸에서, 넣음은 왼쪽 칸에서,
   * 바꿈은 왼쪽 위 칸에서 온다.
   */
  neighbours: Record<EditBranch, number>;
  /** 갈래 셋이 제 비용을 더해 내놓은 값. 더한 만큼은 `costOf` 가 뺄셈으로 잰다. */
  offers: Record<EditBranch, number> | null;
  /** 견주었나. **남는 표식**이라 정적 그리기에도 들어간다. */
  weighed: boolean;
  /** 이긴 값이 칸에 앉았나. */
  settled: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 표시자가 미끄러져 오는 자리는 **앞 칸의 방문**이고 그것은
 * `visits[cells.length - 2]` 로 자취에서 나온다. 칩이 떠나는 자리도 이웃 칸의
 * 한가운데라 장면이 이미 말한다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type EditStep =
  /** 칸 하나가 열린다. 표시자가 두 글자로 미끄러진다. */
  | { kind: 'open' }
  /** 이웃 셋이 값을 들고 제 레인으로 날아가 비용을 더하고 내려앉는다. */
  | { kind: 'offer' }
  /** 바닥에서 선이 올라와 가장 낮은 것에 닿아 멈춘다. */
  | { kind: 'weigh' }
  /** 이긴 값이 칸으로 올라가고 진 것은 제자리에서 물러난다. */
  | { kind: 'settle' }
  /** 볼 칸이 다 끝났다. */
  | { kind: 'done' };

export type ThreeEditChoicesScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 행을 이루는 낱말 — 고치기 전. */
  source: string;
  /** 열을 이루는 낱말 — 고친 뒤. */
  target: string;
  /** 들여다볼 칸들, 적힌 순서대로. **몇 번째 칸인가는 `cells.length` 가 말한다.** */
  visits: readonly EditVisit[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 비용 사다리의 눈금 수. 0 이면 아직 사다리가 서지 않았다. */
  levels: number;
  /** 지금까지 연 칸들. 마지막이 지금 보고 있는 칸이다. */
  cells: readonly EditCell[];
  /** 볼 칸이 다 끝났나. */
  finished: boolean;

  step: EditStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `levels` 도 `cells` 도 여기 들지 않는다 — 둘 다 걸어오며 얻은 것이라 되감기에
 * 그대로 넘기면 되감은 화면이 이미 사다리를 세우고 칸을 채운 채로 선다 (S-scene).
 * 되감기 다음 걸음이 `cell-open` 이므로 눈금은 곧바로 다시 온다.
 */
type Base = Pick<ThreeEditChoicesScene, 'source' | 'target' | 'visits'>;

/**
 * 아직 아무 칸도 열지 않은 처음 화면. 낱말 두 줄과 빈 레인만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): ThreeEditChoicesScene {
  return {
    source: base.source,
    target: base.target,
    visits: base.visits,
    levels: 0,
    cells: [],
    finished: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 값만 베껴 담는다 — 러너가 준 배열을 참조로 쥐지 않는다 (S-scene). */
function visits(v: unknown): EditVisit[] {
  if (!Array.isArray(v)) return [];
  const out: EditVisit[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const i = num((item as Record<string, unknown>).i);
    const j = num((item as Record<string, unknown>).j);
    if (i === null || j === null) continue;
    out.push({ i, j });
  }
  return out;
}

/** 갈래 셋의 수를 한꺼번에 좁힌다. 하나라도 빠지면 그 걸음을 흘린다. */
function triple(
  p: Record<string, unknown>,
  keys: Record<EditBranch, string>,
): Record<EditBranch, number> | null {
  const del = num(p[keys.delete]);
  const ins = num(p[keys.insert]);
  const dia = num(p[keys.diag]);
  if (del === null || ins === null || dia === null) return null;
  return { delete: del, insert: ins, diag: dia };
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ─────────────────────────────
//
// 칩의 글자도 배지의 `+n` 도 바닥선의 높이도 캡션의 수도 같은 함수를 부르므로 갈릴
// 자리가 없다.

/** 지금 보고 있는 칸의 번호. 아직 아무 칸도 안 열었으면 `null`. */
export function currentIndex(scene: ThreeEditChoicesScene): number | null {
  return scene.cells.length === 0 ? null : scene.cells.length - 1;
}

/** 그 번째 칸의 겨룸. */
export function cellAt(scene: ThreeEditChoicesScene, index: number): EditCell | null {
  return scene.cells[index] ?? null;
}

/**
 * 그 번째 칸이 표의 어느 자리인가.
 *
 * 걸음이 `i`/`j` 를 실어 오던 자리다. 칸은 `visits` 에 적힌 순서로 하나씩 열리므로
 * 몇 번째 열림인가가 곧 어느 칸인가다 (프로토콜 4 절 "차례는 발신이 오는 순서가
 * 이미 말한다").
 */
export function visitAt(scene: ThreeEditChoicesScene, index: number): EditVisit | null {
  return scene.visits[index] ?? null;
}

/** 그 칸에서 만나는 두 글자와, 그 둘이 같은가. 낱말과 자리에서 나온다. */
export function charsAt(
  scene: ThreeEditChoicesScene,
  index: number,
): { rowChar: string; colChar: string; same: boolean } | null {
  const visit = visitAt(scene, index);
  if (visit === null) return null;
  const rowChar = scene.source[visit.i - 1] ?? '';
  const colChar = scene.target[visit.j - 1] ?? '';
  return { rowChar, colChar, same: rowChar !== '' && rowChar === colChar };
}

/** 그 칸의 가장 싼 값. 아직 안 내놓았으면 `null`. */
export function bestOf(cell: EditCell): number | null {
  if (cell.offers === null) return null;
  return Math.min(cell.offers.delete, cell.offers.insert, cell.offers.diag);
}

/**
 * 가장 싼 값을 낸 갈래들. 둘 이상이면 비긴 칸이다.
 *
 * 걸음이 `winners` 를 실어 오던 자리다. 셋이 이미 장면에 있으므로 여기서 센다.
 */
export function winnersOf(cell: EditCell): readonly EditBranch[] {
  const offers = cell.offers;
  const best = bestOf(cell);
  if (offers === null || best === null) return [];
  return EDIT_BRANCHES.filter((b) => offers[b] === best);
}

/**
 * 그 갈래가 제 값에 더한 비용.
 *
 * **뺄셈으로 잰다.** 옛 화면은 지움·넣음의 `+1` 을 stage 에 리터럴로 박아 두고
 * 대각선의 몫만 `subCost` 로 받았다 — 등식의 한 항이 상수면 그것도 두 자리에서
 * 세기다 (프로토콜 4 절). 이제 배지 셋이 모두 이 함수를 지난다.
 */
export function costOf(cell: EditCell, branch: EditBranch): number | null {
  if (cell.offers === null) return null;
  return cell.offers[branch] - cell.neighbours[branch];
}

/**
 * 표시자가 설 글자의 자리 — 행 낱말과 열 낱말에서 각각 몇 번째인가.
 *
 * 걸음의 미끄러짐은 **앞 칸의 자리**에서 출발한다. 첫 칸이면 왼쪽 끝이다.
 */
export function markAt(scene: ThreeEditChoicesScene, index: number): { row: number; col: number } {
  const visit = visitAt(scene, index);
  if (visit === null) return { row: 0, col: 0 };
  return { row: Math.max(0, visit.i - 1), col: Math.max(0, visit.j - 1) };
}

/** 앞 장면을 고치지 않고 마지막 칸만 갈아 끼운다 (S-scene). */
function withLastCell(
  scene: ThreeEditChoicesScene,
  patch: (cell: EditCell) => EditCell,
  step: EditStep,
): ThreeEditChoicesScene {
  const index = currentIndex(scene);
  if (index === null) return scene;
  return {
    ...scene,
    cells: scene.cells.map((cell, k) => (k === index ? patch(cell) : cell)),
    step,
  };
}

export const threeEditChoicesScene: ScenePlan<ThreeEditChoicesScene> = {
  /**
   * 첫 장면은 낱말 두 줄과 빈 겨룸터만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다 — projector 가
   * 사라진 지금 `initialData` 가 들어오는 길은 여기와 stage 의 `mount` 둘인데, stage 는
   * 장면에서 받으므로 좁히는 규칙은 이 한 벌이다 (S-piece). 넘겨받은 배열을 **참조로
   * 쥐지 않는다** — 러너가 주는 것은 mechanism 과 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): ThreeEditChoicesScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ source: str(d.source), target: str(d.target), visits: visits(d.visits) });
  },

  reduce(scene: ThreeEditChoicesScene, event: FacetRuntimeEvent): ThreeEditChoicesScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 칸 하나가 열린다.
       *
       * 실려 오는 것은 이웃 셋의 값과 사다리 눈금뿐이다. 어느 칸인지도 어느 두 글자가
       * 만나는지도 바탕과 차례에서 나온다.
       */
      case 'cell-open': {
        const neighbours = triple(p, { delete: 'up', insert: 'left', diag: 'diag' });
        const levels = num(p.levels);
        if (neighbours === null || levels === null) return scene;
        return {
          ...scene,
          levels: Math.max(1, Math.trunc(levels)),
          cells: [...scene.cells, { neighbours, offers: null, weighed: false, settled: false }],
          step: { kind: 'open' },
        };
      }

      /*
       * 세 갈래가 제 비용을 더해 내놓는다.
       *
       * 더한 만큼(`subCost`)은 받지 않는다 — `costOf` 가 이웃 값과의 차로 잰다.
       */
      case 'offers': {
        const offers = triple(p, { delete: 'del', insert: 'ins', diag: 'sub' });
        if (offers === null) return scene;
        return withLastCell(scene, (cell) => ({ ...cell, offers }), { kind: 'offer' });
      }

      /*
       * 견준다. 가장 싼 값도 이긴 갈래도 실려 오지 않는다 — 셋이 이미 여기 있다.
       */
      case 'weigh':
        return withLastCell(scene, (cell) => ({ ...cell, weighed: true }), { kind: 'weigh' });

      /* 이긴 값이 칸에 앉는다. 무슨 값인지는 `bestOf` 가 안다. */
      case 'settle':
        return withLastCell(scene, (cell) => ({ ...cell, settled: true }), { kind: 'settle' });

      case 'done':
        return { ...scene, finished: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ source: scene.source, target: scene.target, visits: scene.visits });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
