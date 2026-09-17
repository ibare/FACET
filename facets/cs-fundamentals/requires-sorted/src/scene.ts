/**
 * requiresSorted 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **줄이 서 있지 않으면 같은 절차가 있는 값을 없다고 답한다.** 그러니 다 끝난
 * 화면에 반드시 남아야 하는 것은 셋이다.
 *
 *   ① 어느 자리를 짚어 보았나 (`looks` 전체)
 *   ② 어느 구간을 버렸나 (버린 구간은 되돌아오지 않으므로 `looks` 에서 파생된다)
 *   ③ **버린 그 구간 안에 답이 있었다** (`lostAt`)
 *
 * 옮기기 전에는 셋 다 화면에만 있었고, 그중 ①은 **걸음마다 지워졌다** —
 * `paintCells` 가 `i === p.probed` 한 칸만 물들여서 다음 걸음이 오면 앞서 짚어 본
 * 자리가 사라졌다. "왜 못 찾았나" 를 되짚어 볼 근거가 화면에서 없어진 것이다.
 * 여기서는 `looks` 가 쌓이므로 마지막 화면에 짚어 온 자취가 통째로 남는다
 * (프로토콜 4 절 "되돌림이 지우던 것이 정보였을 수 있다").
 *
 * ── 옛 stage 가 화면에 대해 알던 것은 어디 있었나
 *
 * `let` 은 `destroyed` 하나뿐이었다. **변수가 없는 조각이 가장 위험하다** 는 말
 * 그대로였고, 실제 상태는 다섯 자리에 흩어져 있었다.
 *
 * - `const parts: RowParts[]` — **DOM 손잡이(`cellRects`·`ring`·`probe`)와 뜻·수치
 *   (`lo`·`hi`·`probed`·`found`·`closed`)가 한 객체에 묶여 있었다.** `const` 라
 *   `let` grep 을 통과하는데 `p.lo = r.lo` 로 제자리에서 고쳐진다. 이 조각이 화면에
 *   대해 아는 것의 거의 전부가 여기 있었다.
 * - `probe` 의 `transform` — 짚개가 **어느 칸에 서 있나**. `settle` 이 `p.probed = -1`
 *   로 지운 뒤에는 그 사실이 `transform` 문자열 안에만 남았다. 좌표가 아니라 단계를
 *   말하는 자리다.
 * - `ring` 의 `stroke` — **답이 밀려났나.** `markAnswerLost` 가 칠만 바꿔 놓고
 *   되돌리지 않아, 이 조각의 결론이 SVG 속성 하나에 적혀 있었다.
 * - `verdict.textContent` 와 `cellTexts[answerAt]` 의 `fill` — 줄마다의 답.
 * - projector 의 `let target` — 캡션의 `{target}` 자리. 이제 장면의 바탕이다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전 `probe` 는 `{ row, index, value }` 를, `settle` 은 `{ action, lo, hi,
 * foundAt }` 를, `done` 은 `{ found, index }` 를 실어 왔다. 전부 **바탕 자료에
 * `midOf`·`narrowAt` 을 먹이면 나오는 값**이라 payload 에서 걷어내고 algorithm 이
 * 내주는 그 두 함수를 장면이 직접 부른다 (프로토콜 4 절 B 갈래). 화면에 나란히 뜨는
 * 수 — 짚은 자리 번호 · 구간의 두 끝 · "{i}번 자리에서 찾음" — 가 모두 한 함수를
 * 지나므로 갈릴 자리가 없다.
 *
 * 남긴 것은 `answer-lost` 의 `row` 하나다. 그것은 **수가 아니라 줄 이름**이고 (이
 * 조각의 정규 식별자 경로), "버린 절반이 답을 품었나" 라는 판정을 algorithm 한 곳에만
 * 두려면 그 줄을 지목해 오는 편이 옳다 — 장면이 다시 판정하면 같은 규칙이 두 곳에
 * 적힌다.
 *
 * 좌표는 담지 않는다. 칸 수와 자리 번호라는 **구조**만 담고 칸 폭·짚개 자리·구간 자의
 * 두 끝은 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지
 * 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { midOf, narrowAt, type LookAction, type Narrowed } from './algorithm.js';

/**
 * 한 번 짚어 본 자취.
 *
 * 목록의 차례가 곧 **몇 번째로 짚었나**다 — 차례를 따로 싣지 않는다 (발신이 오는
 * 순서가 이미 말한다).
 *
 * `from` 은 이 짚기가 **짚기 전에** 들여다보던 구간이다. 구간 자가 줄어드는 운동의
 * 출발 그림이 여기서 나오므로 `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type RowLook = {
  /** 짚은 칸. `midOf(from.lo, from.hi)` 에서 나온다. */
  slot: number;
  /** 짚기 전의 구간. */
  from: { lo: number; hi: number };
  /** 견준 결과. 아직 견주지 않았으면 `null` — 짚기만 하고 멈춘 걸음이다. */
  narrow: Narrowed | null;
};

/** 줄 하나. `key`·`values` 는 바탕이고 `looks`·`lostAt` 은 걸어온 자취다. */
export type SceneRow = {
  key: string;
  values: readonly number[];
  /** 짚어 온 자취. 쌓이기만 하고 지워지지 않는다 — 그 누적이 이 조각의 근거다. */
  looks: readonly RowLook[];
  /**
   * 답이 든 칸을 밀어낸 짚기의 차례. 밝혀진 뒤로는 **남는다.**
   *
   * 옛 화면은 이것을 고리의 `stroke` 칠 하나로만 남겼다. 어느 짚기가 밀어냈는지,
   * 그래서 어느 구간을 버린 것인지는 아무 데도 없었다 — 결론만 있고 까닭이 없었다.
   */
  lostAt: number | null;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 짚개가 출발하는 칸도, 구간 자가 출발하는 두 끝도 전부
 * `looks` 에서 셈으로 나온다. 그래서 그리는 쪽이 `prev` 를 아예 들추지 않는다.
 *
 * `lost` 만 줄 이름을 싣는다. 한 걸음 앞의 `settle` 에서 두 줄이 함께 밀려날 수
 * 있어 "방금 밀려난 줄" 이 장면만으로는 하나로 좁혀지지 않기 때문이다.
 */
export type RequiresSortedStep =
  | { kind: 'probe' }
  | { kind: 'settle' }
  | { kind: 'lost'; row: string }
  | { kind: 'verdict' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다 (C10).
 *
 * 인자를 싣지 않는다 — `{i}` 는 방금 짚은 자리가, `{target}` 은 바탕이 쥐고 있다.
 * 캡션에 따로 실으면 화면의 짚개와 캡션의 수가 갈릴 자리가 생긴다.
 */
export type RequiresSortedCaption =
  | { kind: 'setup' }
  | { kind: 'probeBoth' }
  | { kind: 'probeOne' }
  | { kind: 'probeApart' }
  | { kind: 'dropRight' }
  | { kind: 'dropLeft' }
  | { kind: 'narrow' }
  | { kind: 'split' }
  | { kind: 'empty' }
  | { kind: 'lost' }
  | { kind: 'verdict' };

export type RequiresSortedScene = {
  /** 두 줄이 찾는 값. 바탕. */
  target: number;
  /** 줄들. 바탕(`key`·`values`) 위에 자취(`looks`·`lostAt`)가 얹혀 있다. */
  rows: readonly SceneRow[];
  /** 답을 말했나. `done` 이 세우는 머무는 강조라 정적 그리기에도 들어간다. */
  announced: boolean;
  step: RequiresSortedStep | null;
  caption: RequiresSortedCaption | null;
};

/** 걸음이 고치지 않는 줄. 자취를 담을 자리가 **타입에 아예 없다.** */
type RowBase = { key: string; values: readonly number[] };

/** 걸음이 고치지 않는 바탕. `announced` 도 자취라 여기 넣지 않는다. */
type Base = { target: number; rows: readonly RowBase[] };

/**
 * 아무것도 짚지 않은 처음 화면.
 *
 * 부르는 쪽은 줄을 **객체 리터럴**로 지어 넘긴다 — 변수를 그대로 넘기면 초과 속성
 * 검사가 돌지 않아 자취가 실린 줄도 통과한다 (S-scene · 프로토콜 4 절). 여기서
 * 읽는 것이 `key`·`values` 둘뿐이라 새 나갈 길 자체가 없다.
 */
function atStart(base: Base): RequiresSortedScene {
  return {
    target: base.target,
    rows: base.rows.map((r) => ({ key: r.key, values: r.values, looks: [], lostAt: null })),
    announced: false,
    step: null,
    caption: { kind: 'setup' },
  };
}

// ── 장면에서 읽어 내는 것들. 화면도 `reduce` 도 이 함수들만 지난다.

/** 마지막으로 짚은 자취. 없으면 `null`. */
export function lastLook(row: SceneRow): RowLook | null {
  return row.looks.length > 0 ? (row.looks[row.looks.length - 1] as RowLook) : null;
}

/** 짚어 놓고 아직 견주지 않았나 — `probe` 와 `settle` 사이에 참이다. */
export function isPending(row: SceneRow): boolean {
  const last = lastLook(row);
  return last !== null && last.narrow === null;
}

/** 찾았거나 구간이 닫혔나. 닫힌 줄은 더 짚지 않는다. */
export function isClosed(row: SceneRow): boolean {
  const last = lastLook(row);
  if (last === null || last.narrow === null) return false;
  return last.narrow.action === 'found' || last.narrow.action === 'empty';
}

/** 지금 살아 있는 구간. 아직 아무것도 안 짚었으면 줄 전체다. */
export function windowOf(row: SceneRow): { lo: number; hi: number } {
  const last = lastLook(row);
  if (last === null) return { lo: 0, hi: row.values.length - 1 };
  if (last.narrow === null) return { lo: last.from.lo, hi: last.from.hi };
  return { lo: last.narrow.lo, hi: last.narrow.hi };
}

/** 지금까지 짚어 본 칸들. 되돌리지 않는 자취라 걸음마다 늘기만 한다. */
export function probedSlots(row: SceneRow): number[] {
  return row.looks.map((l) => l.slot);
}

/** 찾아 멈춘 칸. 못 찾았으면 `null`. "{i}번 자리에서 찾음" 의 `{i}` 가 여기서 나온다. */
export function foundSlot(row: SceneRow): number | null {
  for (const look of row.looks) {
    if (look.narrow !== null && look.narrow.action === 'found') return look.slot;
  }
  return null;
}

/** 찾는 값이 실제로 있는 칸. 구조에서 센다 — 실어 오지 않는다. */
export function answerSlot(scene: RequiresSortedScene, row: SceneRow): number {
  return row.values.indexOf(scene.target);
}

/** 답을 밀어낸 짚기. 아직 밀려나지 않았으면 `null`. */
export function lostLook(row: SceneRow): RowLook | null {
  if (row.lostAt === null) return null;
  return (row.looks[row.lostAt] as RowLook | undefined) ?? null;
}

/**
 * 그 짚기가 **버린** 구간.
 *
 * `'left'` 는 왼쪽을 남겼으니 짚은 칸부터 오른쪽 끝까지를 버린 것이고, `'right'` 는
 * 그 반대다. `'empty'` 는 들여다보던 구간을 통째로 닫은 것이다. 답을 밀어낼 수
 * 있는 갈래가 이 셋뿐이라 `'found'` 는 `null` 이다.
 */
export function droppedSpan(look: RowLook): { lo: number; hi: number } | null {
  if (look.narrow === null) return null;
  switch (look.narrow.action) {
    case 'left':
      return { lo: look.slot, hi: look.from.hi };
    case 'right':
      return { lo: look.from.lo, hi: look.slot };
    case 'empty':
      return { lo: look.from.lo, hi: look.from.hi };
    case 'found':
      return null;
  }
}

/**
 * 이번 회차에 함께 움직인 줄들.
 *
 * 닫힌 줄은 더 짚지 않아 자취가 그 자리에 멎으므로, **자취가 가장 긴 줄들**이 곧
 * 방금 한 회차를 함께 밟은 줄이다. 그것을 걸음에 실어 오지 않아도 되는 까닭이다.
 */
export function atLatestRound(scene: RequiresSortedScene): SceneRow[] {
  let most = 0;
  for (const row of scene.rows) most = Math.max(most, row.looks.length);
  if (most === 0) return [];
  return scene.rows.filter((r) => r.looks.length === most);
}

/** 방금 짚은 자리. 캡션의 `{i}` 가 여기서 나온다 — 짚개가 선 칸과 같은 출처다. */
export function justProbedSlot(scene: RequiresSortedScene): number | null {
  for (const row of scene.rows) {
    const last = lastLook(row);
    if (last !== null && last.narrow === null) return last.slot;
  }
  return null;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function readRows(v: unknown): RowBase[] {
  if (!Array.isArray(v)) return [];
  const out: RowBase[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const rec = raw as { key?: unknown; values?: unknown };
    if (typeof rec.key !== 'string' || !Array.isArray(rec.values)) continue;
    // 값을 **복사**한다. 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
    // (S-scene). 이 조각의 algorithm 은 자료를 고치지 않지만 규약은 같다.
    const values = rec.values.filter((n): n is number => typeof n === 'number');
    if (values.length === 0) continue;
    out.push({ key: rec.key, values });
  }
  return out;
}

export const requiresSortedScene: ScenePlan<RequiresSortedScene> = {
  /**
   * 첫 장면. 두 줄과 찾는 값만 서 있고 짚은 자취는 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): RequiresSortedScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const target = typeof d.target === 'number' && Number.isFinite(d.target) ? d.target : NaN;
    return atStart({ target, rows: readRows(d.rows) });
  },

  reduce(scene: RequiresSortedScene, event: FacetRuntimeEvent): RequiresSortedScene {
    switch (event.type) {
      /*
       * 아직 도는 줄들이 각자 제 구간의 가운데를 짚는다.
       *
       * 어느 줄이 도는지는 자취가 말하고 (닫혔나 · 이미 짚어 두었나), 어느 칸을
       * 짚는지는 algorithm 이 내주는 `midOf` 가 정한다. 실어 올 것이 없다.
       */
      case 'probe': {
        const rows = scene.rows.map((row) => {
          if (isClosed(row) || isPending(row)) return row;
          const w = windowOf(row);
          return {
            ...row,
            looks: [...row.looks, { slot: midOf(w.lo, w.hi), from: w, narrow: null }],
          };
        });
        const pending = rows.filter(isPending);
        const first = pending[0];
        if (first === undefined) return scene;
        const firstSlot = lastLook(first)?.slot;
        const together = pending.every((r) => lastLook(r)?.slot === firstSlot);
        return {
          ...scene,
          rows,
          step: { kind: 'probe' },
          caption: {
            kind: pending.length === 1 ? 'probeOne' : together ? 'probeBoth' : 'probeApart',
          },
        };
      }

      /*
       * 견주고 절반을 버린다. 판정은 algorithm 의 `narrowAt` 이 내리고 장면은 같은
       * 함수를 부른다 — 화면이 그리는 구간과 algorithm 이 쥔 구간이 갈릴 수 없다.
       */
      case 'settle': {
        const actions: LookAction[] = [];
        const rows = scene.rows.map((row) => {
          const last = lastLook(row);
          if (last === null || last.narrow !== null) return row;
          const narrow = narrowAt(row.values, scene.target, last.slot, last.from.lo, last.from.hi);
          actions.push(narrow.action);
          return { ...row, looks: [...row.looks.slice(0, -1), { ...last, narrow }] };
        });
        if (actions.length === 0) return scene;
        return { ...scene, rows, step: { kind: 'settle' }, caption: { kind: settleCaption(actions) } };
      }

      /*
       * 방금 버린 절반 안에 답이 있었다. 어느 짚기가 밀어냈는지를 굳혀 둔다 —
       * 그 자취가 있어야 "왜 못 갔나" 를 다 끝난 화면에서도 읽는다.
       */
      case 'answer-lost': {
        const p = (event.payload ?? {}) as { row?: unknown };
        const key = typeof p.row === 'string' ? p.row : '';
        if (key === '') return scene;
        let marked = false;
        const rows = scene.rows.map((row) => {
          if (row.key !== key || row.lostAt !== null || row.looks.length === 0) return row;
          marked = true;
          return { ...row, lostAt: row.looks.length - 1 };
        });
        // 이미 밝혀진 줄이면 조용히 흘린다 (C2).
        if (!marked) return scene;
        return { ...scene, rows, step: { kind: 'lost', row: key }, caption: { kind: 'lost' } };
      }

      // 줄마다의 답을 말한다. 무엇이라 답했는지는 짚어 온 자취가 이미 안다.
      case 'done':
        return {
          ...scene,
          announced: true,
          step: { kind: 'verdict' },
          caption: { kind: 'verdict' },
        };

      // 바탕만 남기고 자취를 턴다. 줄을 객체 리터럴로 다시 지어 넘긴다 (S-scene).
      case 'rewind':
        return atStart({
          target: scene.target,
          rows: scene.rows.map((r) => ({ key: r.key, values: r.values })),
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};

/**
 * 한 회차의 판정들을 보고 무엇을 말할지 고른다.
 *
 * 옛 projector 의 `switch` 가 그대로 옮겨 온 자리다. 다른 점은 문안을 짓지 않고
 * 무엇을 말할지만 고른다는 것뿐이다 (C10).
 */
function settleCaption(actions: readonly LookAction[]): RequiresSortedCaption['kind'] {
  if (actions.includes('empty')) return 'empty';
  if (actions.includes('found')) return 'split';
  if (actions.every((a) => a === 'left')) return 'dropRight';
  if (actions.every((a) => a === 'right')) return 'dropLeft';
  return 'narrow';
}
