/**
 * reduceToKnown 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 왼쪽에 시험 시간표, 오른쪽에 그래프. 걸음마다 달라지는 것은 **몇 과목이 마디
 * 자리로 건너갔는가** 하나뿐이다. 나머지는 전부 그 수에서 파생한다 — 어느 겹침이
 * 선이 되었는지도(두 끝이 다 건너갔나), 어느 자리에 자국이 남았는지도.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 없었고 (`①③` 0 건), DOM 을 도로 읽는 자리도
 * 없었다 (`④` 0 건). 상태는 전부 stage 의 **타입 선언**과 **DOM 속성**에 있었다.
 *
 * - `Card = { id, group, box, text, home, seat, width, at }` — DOM 손잡이와 뜻이 한
 *   객체다. `at` 은 **그 카드가 지금 어디 서 있나**를 따로 적어 둔 표였고
 *   (`const from = card.at`) 날아가는 운동의 **출발값**으로 쓰였다. `getAttribute`
 *   를 안 쓰니 DOM 되읽기 grep 을 통과하고 `const cards` 라 `let` grep 도 통과한다.
 *   되짚어 세운 직후에는 그 표가 옛 화면의 것이라 카드가 엉뚱한 데서 출발한다.
 *   이제 출발 자리는 `seated` 가 정하고 (`homes[i]` → `seats[i]`) 표 자체가 없다.
 * - `width` 는 CARD_W 냐 NODE_W 냐로 **그 카드가 아직 시간표 칸인지 이미 마디인지**를
 *   혼자 알고 있었다. 지금은 `i < seated` 가 말한다.
 * - `Bracket.opened` — **어느 겹침이 선이 되었나.** 환원의 대응 그 자체인데 `seat()`
 *   명령의 부수 효과로만 켜지고 되돌리는 길은 `rewind()` 로 통째로 지우는 것뿐이었다.
 *   이제 `edgeIndicesAt` 이 앉은 수에서 셈한다.
 * - `periodOf: Map<string, number>` 와 `palette` — `paint()` 가 적어 두고
 *   `readBack()` 이 **도로 읽어** 시간표 줄을 만들었다. 화면이 제 칠을 되읽어 다음
 *   칠을 정하는 자리라, 되짚어 `schedule` 로 곧장 뛰면 그 맵이 비어 있다. 이제 둘 다
 *   바탕에서 한 번에 나온다 (`periodsOf` · `slotCount`).
 *
 * ── 수는 한 자리에서만 센다
 *
 * algorithm 은 한때 `subject` · `linkedTo` · `subjects` · `periods` · `total` 을
 * 실었다. 전부 **바탕 다섯과 여섯**에서 나오는 것이라 걷어냈다 — 옮겨 앉는 차례는
 * 선언한 차례이고, 선이 되는 겹침은 두 끝이 앉았는지가 정하며, 교시 배정은
 * `assignPeriods` 가 정한다. 그 함수는 algorithm 이 내주고 여기서 부른다.
 *
 * **색칠은 이 조각의 주장이 아니다.** "바꿔 놓으면 이미 아는 문제가 된다" 까지가
 * 주장이고 어떻게 칠하는가는 그 너머다 — 그래서 `assignPeriods` 를 내주어도 조각이
 * 말하려는 바가 남는다 (프로토콜 4 절의 가운데 줄 경계).
 *
 * 좌표는 담지 않는다. 차례만 담고 자리는 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 * 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { assignPeriods } from './algorithm.js';

/** 같은 교시에 둘 수 없는 두 과목. 선언한 차례가 곧 골의 차례다. */
export type ReduceToKnownOverlap = [string, string];

/** 그림의 바탕. 걸음이 고치지 않으므로 되감기가 여기로 돌아간다. */
export type ReduceToKnownBoard = {
  /** 과목 식별자. **선언한 차례가 곧 옮겨 앉는 차례다.** */
  subjects: string[];
  overlaps: ReduceToKnownOverlap[];
};

/**
 * 이번 걸음에 무엇이 일어났나. 무엇을 흐르게 할지 고르는 표식이다.
 *
 * 출발 그림은 싣지 않는다 — 이 조각의 운동은 전부 `seated` 가 말하는 자리에서
 * 출발한다 (제 줄 → 마디 자리). 되짚기(`animate` 거짓)에서는 쳐다보지 않는다.
 */
export type ReduceToKnownStep =
  | { kind: 'board' }
  | { kind: 'seat' }
  | { kind: 'color' }
  | { kind: 'plan' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다.
 *
 * 인자를 담지 않는다 — 거기 들어갈 것(과목 이름 · 선이 된 겹침 수 · 교시 수)은
 * 전부 그 장면의 `board` 와 `seated` 에서 유일하게 나온다. 담아 두면 같은 것을 두
 * 자리에서 세게 된다.
 */
export type ReduceToKnownCaption =
  | { kind: 'board' }
  | { kind: 'seat' }
  | { kind: 'color' }
  | { kind: 'schedule' };

export type ReduceToKnownScene = {
  board: ReduceToKnownBoard;
  /** 판이 섰나 — 과목 카드와 겹침 괄호가 왼쪽 판에 들어섰나. */
  shown: boolean;
  /**
   * 마디 자리로 건너간 과목 수. **이 조각이 화면에 대해 아는 거의 전부**다.
   *
   * 차례가 뜻을 갖는다 — 앞에서부터 `seated` 개가 건너갔고, 두 끝이 다 건너간
   * 겹침이 곧 선이며, 건너간 자리에 자국이 남는다.
   */
  seated: number;
  /** 이어진 마디가 서로 다른 색을 받았나 (교시가 색이 되었나). */
  colored: boolean;
  /** 색을 교시로 되읽어 시간표가 왼쪽 판으로 돌아왔나. */
  planned: boolean;
  step: ReduceToKnownStep | null;
  caption: ReduceToKnownCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function subjectList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0 && !out.includes(item)) out.push(item);
  }
  return out;
}

/** `[a, b]` 짝들을 겹침 목록으로. 양 끝이 과목 명부에 있어야 한다. */
function overlapList(v: unknown, subjects: string[]): ReduceToKnownOverlap[] {
  if (!Array.isArray(v)) return [];
  const out: ReduceToKnownOverlap[] = [];
  for (const raw of v) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const [a, b] = raw as unknown[];
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    if (a === b || !subjects.includes(a) || !subjects.includes(b)) continue;
    out.push([a, b]);
  }
  return out;
}

/**
 * 두 끝이 다 건너간 겹침의 차례들 — **선이 된 것**.
 *
 * 한때 stage 의 `Bracket.opened` 깃발이 쥐고 있었다. 앉은 수가 정하는 것이라
 * 따로 담으면 같은 물음에 답이 둘이 된다.
 */
export function edgeIndicesAt(board: ReduceToKnownBoard, seated: number): number[] {
  const crossed = new Set(board.subjects.slice(0, Math.max(0, seated)));
  const out: number[] = [];
  board.overlaps.forEach(([a, b], k) => {
    if (crossed.has(a) && crossed.has(b)) out.push(k);
  });
  return out;
}

/**
 * **그 걸음에 비로소** 선이 된 겹침들. 늦게 앉는 쪽의 걸음에서 한 번만 펴진다.
 *
 * 앞 걸음에는 없고 이 걸음에는 있는 것 — 곧 두 끝 중 하나가 방금 앉은 과목인 것이다.
 */
export function edgesOpenedAt(board: ReduceToKnownBoard, seated: number): number[] {
  if (seated <= 0) return [];
  const just = board.subjects[seated - 1];
  if (just === undefined) return [];
  const before = new Set(edgeIndicesAt(board, seated - 1));
  return edgeIndicesAt(board, seated).filter((k) => {
    if (before.has(k)) return false;
    const pair = board.overlaps[k];
    return pair !== undefined && (pair[0] === just || pair[1] === just);
  });
}

/**
 * 과목 차례별 교시. **바탕에서 한 번에 나온다.**
 *
 * 한때 algorithm 이 `periods` 배열로 실어 보내고 stage 가 `periodOf` 맵에 적어
 * 두었다가 시간표를 만들 때 도로 읽었다. 이제 바탕 + 순수 함수 하나다.
 */
export function periodsOf(board: ReduceToKnownBoard): number[] {
  const period = assignPeriods(board.subjects, board.overlaps);
  return board.subjects.map((s) => period.get(s) ?? 1);
}

/** 필요한 교시 수 — 곧 쓰인 색의 가짓수. 색판의 크기가 여기서 나온다. */
export function slotCount(board: ReduceToKnownBoard): number {
  return new Set(periodsOf(board)).size;
}

/**
 * 처음 자리로 돌아간 장면. `initial` 과 되감기가 같은 자리를 쓴다.
 *
 * 바탕은 `board` **하나뿐**이다. 걸음이 고치는 것(`seated` · `colored` · `planned`)을
 * 여기로 넘기면 되감은 화면에 지난 주행의 자취가 남는다. 타입으로 좁혀 두고
 * 호출부는 객체 리터럴로 넘겨 초과 속성 검사가 실제로 돌게 한다.
 */
function atStart(base: Pick<ReduceToKnownScene, 'board'>): ReduceToKnownScene {
  return {
    board: base.board,
    shown: false,
    seated: 0,
    colored: false,
    planned: false,
    step: null,
    caption: null,
  };
}

export const reduceToKnownScene: ScenePlan<ReduceToKnownScene> = {
  /**
   * 첫 장면은 빈 판이다. 카드도 괄호도 아직 없다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체다 (S-scene).
   */
  initial(initialData: unknown): ReduceToKnownScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const subjects = subjectList(d['subjects']);
    return atStart({ board: { subjects, overlaps: overlapList(d['overlaps'], subjects) } });
  },

  reduce(scene: ReduceToKnownScene, event: FacetRuntimeEvent): ReduceToKnownScene {
    switch (event.type) {
      // 판을 세운다. 카드 다섯과 괄호 여섯이 왼쪽 판으로 들어선다.
      case 'board':
        return {
          ...atStart({ board: scene.board }),
          shown: true,
          step: { kind: 'board' },
          caption: { kind: 'board' },
        };

      // 과목 하나가 마디 자리로 건너간다. 어느 과목인가는 선언한 차례가 말한다.
      case 'place': {
        if (!scene.shown || scene.seated >= scene.board.subjects.length) return scene;
        return {
          ...scene,
          seated: scene.seated + 1,
          step: { kind: 'seat' },
          caption: { kind: 'seat' },
        };
      }

      // 이어진 마디가 서로 다른 색을 받는다. 어느 색인가는 바탕이 정한다.
      case 'color':
        return { ...scene, colored: true, step: { kind: 'color' }, caption: { kind: 'color' } };

      // 색 하나가 교시 하나. 시간표가 빈 판으로 돌아온다.
      case 'schedule':
        return {
          ...scene,
          planned: true,
          step: { kind: 'plan' },
          caption: { kind: 'schedule' },
        };

      // 처음 자리로. 카드도 선도 자국도 함께 사라진다.
      case 'rewind':
        return atStart({ board: scene.board });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
