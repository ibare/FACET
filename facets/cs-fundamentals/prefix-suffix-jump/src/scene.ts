/**
 * PrefixSuffixJump 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 가 92 줄인데 stage 는 713 줄이었다. 번역할 것이 없었다는 뜻이 아니라
 * **화면이 통째로 상태였다**는 뜻이다. 옛 자리를 하나씩 적어 둔다.
 *
 * - `let ghostShift` · `let ghostDrop` — 복제가 지금 몇 칸 밀려 있나. 좌표처럼
 *   생겼지만 좌표가 아니라 **몇 번째 겹침을 시험하고 있나**였다. 이제 `fold.tries`
 *   의 마지막 시험이 그것을 말하고 자리는 그리는 쪽이 역산한다.
 * - `let blockAt` — 패턴 덩어리가 텍스트의 어느 칸에 놓였나. 이제 `hunt.align`.
 * - **`Number(band.getAttribute('width'))` · `getAttribute('opacity')`** — 띠가 지금
 *   어디까지 벌어져 있나를 **화면에서 도로 읽어** 다음 운동의 출발값으로 삼았다.
 *   되짚어 세운 직후에는 그 값이 옛 화면의 것이라 띠가 엉뚱한 데서 출발한다. 이제
 *   `fails.length` 가 앞 자리를 말하므로 출발 폭을 셈으로 얻는다.
 * - **`blockGroup.getAttribute('opacity') === '1'`** — 덩어리가 이미 떴나. 같은 물음에
 *   답이 둘(화면과 장면)이던 자리다. 이제 `hunt === null` 하나다.
 * - **`type CellState`** — 선언만 있고 값이 어디에도 저장되지 않는다. 칸의 형편이
 *   `fill` 과 `stroke` 에만 있었고, 게다가 `'default' | 'ghost' | 'compare' | 'same'
 *   | 'differ' | 'kept'` 여섯을 **한 축에** 실어 `kept`(물려받아 다시 보지 않은 글자)
 *   가 `same`(이번에 맞혀 본 글자)에 덮여 사라졌다. 이제 형편(채움)과 표식(테두리)을
 *   갈라 각자 제 축에 둔다.
 * - **`skipLayer` 의 자식 노드** — 건너뛴 정렬 자리가 `<g>` 의 자식으로만 쌓였다.
 *   어떤 변수도 그것을 말하지 않았다. 이제 `hunt.skips`.
 * - **`failCells[i].ink.textContent`** — 표의 값이 글자로만 있었다. 이제 `fails`.
 *
 * ── 표의 값은 자취에서 나온다
 *
 * 옛 발신 `fail-set { index, value }` 는 표의 값을 실어 보냈다. 그런데 그 값은 방금
 * 화면에서 맞은 시험의 `border` 와 **같은 수**다. 둘을 따로 두면 같은 물음에 답이
 * 둘이 되고, 그 자리가 언젠가 갈린다. 지금은 `settledValue` 가 `fold.tries` 의 마지막
 * 시험에서 꺼내므로 **표의 값이 화면에 남은 시험 자국과 같은 자료**에서 나온다.
 *
 * 마찬가지로 `borrow-overlap` 은 아무것도 싣지 않는다 — 빌려 오는 겹침 길이는
 * **장면이 세운 표**에서 읽는다 (`borrowOf`). 표가 화면에 이미 서 있는데 그 값을
 * 다시 실어 보내면 표와 캡션이 다른 출처가 된다.
 *
 * ── 싣는 것은 판정뿐이다
 *
 * `overlap-try` 의 `border` · `matched` 와 `scan-align` 의 `matched`, `jump` 의 `to`
 * 만 남았다. 앞 조각과 뒤 조각이 같은가, 어디까지 맞았다고 볼 것인가, 어디에 내려
 * 놓을 것인가 — 전부 **걸음이 내리는 판정**이다. 이것까지 장면이 셈하면 장면이
 * 알고리즘을 통째로 되풀이하고 발신은 장식이 된다 (프로토콜 4 절의 경계).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 번호라는 **구조**만 담고 칸 폭도 띠의 길이도 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `captionOf` 가 **무엇을 말할지**와 그 인자만 내고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 걸음이 고치지 않는 바탕. 패턴과 텍스트는 처음부터 끝까지 그대로다. */
export type PrefixSuffixJumpBase = { pattern: string; text: string };

/**
 * 한 자리에서 복제를 밀어 본 시험 하나.
 *
 * 실패한 시험도 남긴다 — "여기까지 밀어 보았으나 아니었다" 가 남지 않으면 뒤에서
 * 표를 빌려 쓰는 일이 왜 특별한지 보이지 않는다.
 */
export type OverlapTry = { border: number; matched: boolean };

/** 위층 — 패턴이 제 몸을 접어 겹치는 자리를 찾는 국면. */
export type FoldScene = {
  /** 이 자리에서 밀어 본 자취. 긴 겹침부터 하나씩 줄여 간다. */
  tries: readonly OverlapTry[];
  /** 값이 표로 떨어졌나. 떨어지면 접었던 몸을 거둔다. */
  settled: boolean;
};

/** 아래층 — 세운 표로 텍스트를 훑는 국면. */
export type HuntScene = {
  /** 패턴이 놓인 칸. */
  align: number;
  /** 물려받아 다시 보지 않는 앞 글자 수. */
  keep: number;
  /** 이번 정렬에서 맞은 글자 수. 아직 견주기 전이면 `null`. */
  scan: { matched: number } | null;
  /** 표에서 빌린 겹침 길이. 빌리는 걸음에만 켜진다. */
  borrow: number | null;
  /** 가 보지 않은 정렬 자리. **쌓이고 지워지지 않는다** — 이 조각의 결론이다. */
  skips: readonly number[];
  /** 패턴이 통째로 맞았나. */
  found: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `jump` 만 계기값을 싣는다 — 덩어리가 어디에서 출발하는지는 이미 `align` 이 새
 * 자리로 바뀐 뒤라 장면이 말해 주어야 한다. `prev` 에서 꺼내면 위반이다 (S-scene).
 */
export type PrefixSuffixJumpStep =
  | { kind: 'focus' }
  | { kind: 'try' }
  | { kind: 'settle' }
  | { kind: 'scan' }
  | { kind: 'borrow' }
  | { kind: 'jump'; from: number }
  | { kind: 'found' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type PrefixSuffixJumpCaption =
  | { kind: 'lookPrefix'; n: number }
  | { kind: 'overlapSame'; n: number }
  | { kind: 'overlapDiffer'; n: number }
  | { kind: 'noOverlap' }
  | { kind: 'tableTakes'; n: number }
  | { kind: 'matchedThenDiffer'; n: number }
  | { kind: 'fullMatch' }
  | { kind: 'borrowOverlap'; n: number }
  | { kind: 'slideBy'; n: number }
  | { kind: 'slideOne' }
  | { kind: 'found'; i: number };

export type PrefixSuffixJumpScene = {
  base: PrefixSuffixJumpBase;
  /** 표. 자리 번호가 곧 인덱스이고 `length` 가 지금 보고 있는 자리다. */
  fails: readonly number[];
  fold: FoldScene | null;
  hunt: HuntScene | null;
  step: PrefixSuffixJumpStep | null;
};

/**
 * 아무것도 걷지 않은 처음 화면 — 패턴과 텍스트만 줄지어 서 있다.
 *
 * 걸음이 쌓는 것(`fails` · `fold` · `hunt`)은 바탕이 아니므로 인자로 받지 않는다.
 * 받으면 되감은 화면이 다 찬 표를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 놓는 값이 겹친다 (S-scene · 프로토콜 4 절의 `rewind` 갈래).
 */
function atStart(base: PrefixSuffixJumpBase): PrefixSuffixJumpScene {
  return {
    base: { pattern: base.pattern, text: base.text },
    fails: [],
    fold: null,
    hunt: null,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * `initialData` 를 좁히는 자리.
 *
 * projector 방식에서는 stage 의 mount 가 이 일을 했다 — `initialData` 가 거기로만
 * 왔기 때문이다. 장면 방식에서는 바탕이 장면을 타고 그리는 쪽에 가므로 좁히개도
 * 여기 하나뿐이다 (S-piece 의 "좁히는 규칙이 두 벌이 되지 않게").
 */
function readBase(raw: unknown): PrefixSuffixJumpBase {
  const d = (raw ?? {}) as Record<string, unknown>;
  const pattern = typeof d.pattern === 'string' ? d.pattern : '';
  const text = typeof d.text === 'string' ? d.text : '';
  if (pattern.length === 0 || text.length < pattern.length) {
    throw new Error(
      'prefix-suffix-jump: initialData 에 pattern 과 그보다 짧지 않은 text 가 있어야 한다',
    );
  }
  return { pattern, text };
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ───────────────────────────────

/**
 * 지금 보고 있는 자리 (앞에서 몇 글자를 보는가 − 1). 위층이 쉬면 `null`.
 *
 * 값이 떨어진 뒤에는 표가 한 칸 늘었으므로 하나를 물린다. 걸음이 실어 오던 `end` ·
 * `index` 자리다 — 칸은 왼쪽부터 하나씩만 차므로 차례는 셈으로 나온다.
 */
export function focusIndex(scene: PrefixSuffixJumpScene): number | null {
  if (scene.fold === null) return null;
  return scene.fold.settled ? scene.fails.length - 1 : scene.fails.length;
}

/** 겹침 `border` 를 견주려면 복제를 몇 칸 밀어야 하나. */
export function shiftFor(end: number, border: number): number {
  return end + 1 - border;
}

/** 복제가 지금 밀려 있는 칸 수. 아직 밀기 전이면 0 이다. */
export function currentShift(scene: PrefixSuffixJumpScene): number {
  const end = focusIndex(scene);
  const fold = scene.fold;
  if (end === null || fold === null) return 0;
  const last = fold.tries[fold.tries.length - 1];
  return last === undefined ? 0 : shiftFor(end, last.border);
}

/** 이 자리의 값으로 정해진 겹침 — 마지막 시험이 곧 답이다. */
export function settledValue(fold: FoldScene): number {
  return fold.tries[fold.tries.length - 1]?.border ?? 0;
}

/**
 * 지금 빌려 쓰는 표 칸의 번호. 빌리는 걸음이 아니면 `null`.
 *
 * 맞은 글자가 `matched` 면 그 마지막 글자의 자리가 `matched - 1` 이다.
 */
export function borrowAt(scene: PrefixSuffixJumpScene): number | null {
  const hunt = scene.hunt;
  if (hunt === null || hunt.borrow === null || hunt.scan === null) return null;
  return hunt.scan.matched - 1;
}

/**
 * 이 장면이 할 말. 갈래가 걸음과 장면에서 온전히 나오므로 장면에 따로 담지 않는다.
 */
export function captionOf(scene: PrefixSuffixJumpScene): PrefixSuffixJumpCaption | null {
  const step = scene.step;
  if (step === null) return null;
  const m = scene.base.pattern.length;

  switch (step.kind) {
    case 'focus': {
      const end = focusIndex(scene);
      return end === null ? null : { kind: 'lookPrefix', n: end + 1 };
    }
    case 'try': {
      const last = scene.fold?.tries[scene.fold.tries.length - 1];
      if (last === undefined) return null;
      if (last.border === 0) return { kind: 'noOverlap' };
      return last.matched
        ? { kind: 'overlapSame', n: last.border }
        : { kind: 'overlapDiffer', n: last.border };
    }
    case 'settle': {
      const value = scene.fails[scene.fails.length - 1];
      return value === undefined ? null : { kind: 'tableTakes', n: value };
    }
    case 'scan': {
      const matched = scene.hunt?.scan?.matched;
      if (matched === undefined) return null;
      return matched >= m ? { kind: 'fullMatch' } : { kind: 'matchedThenDiffer', n: matched };
    }
    case 'borrow': {
      const border = scene.hunt?.borrow;
      return border === null || border === undefined ? null : { kind: 'borrowOverlap', n: border };
    }
    case 'jump': {
      const hunt = scene.hunt;
      if (hunt === null) return null;
      return hunt.keep > 0
        ? { kind: 'slideBy', n: hunt.align - step.from }
        : { kind: 'slideOne' };
    }
    case 'found': {
      const hunt = scene.hunt;
      return hunt === null ? null : { kind: 'found', i: hunt.align };
    }
  }
}

/** 아직 훑기에 들어가지 않은 화면의 출발 상태. */
const HUNT_START: HuntScene = {
  align: 0,
  keep: 0,
  scan: null,
  borrow: null,
  skips: [],
  found: false,
};

export const prefixSuffixJumpScene: ScenePlan<PrefixSuffixJumpScene> = {
  /**
   * 첫 장면은 바탕만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 정한다. 받는 것이
   * 문자열 둘이라 참조를 쥐지 않고 값을 옮겨 담는다 (S-scene).
   */
  initial(initialData: unknown): PrefixSuffixJumpScene {
    return atStart(readBase(initialData));
  },

  reduce(scene: PrefixSuffixJumpScene, event: FacetRuntimeEvent): PrefixSuffixJumpScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 다음 자리를 본다. 어느 자리인지는 받지 않는다 — 표에 찬 칸 수가 곧 그 자리다.
       */
      case 'prefix-focus':
        return { ...scene, fold: { tries: [], settled: false }, step: { kind: 'focus' } };

      /*
       * 복제를 한 칸 더 밀어 겹침을 견주었다. 실패한 시험도 자취로 남는다.
       */
      case 'overlap-try': {
        const border = num(p.border);
        const fold = scene.fold;
        if (border === null || fold === null || fold.settled) return scene;
        return {
          ...scene,
          fold: {
            ...fold,
            tries: [...fold.tries, { border, matched: p.matched === true }],
          },
          step: { kind: 'try' },
        };
      }

      /*
       * 값이 표로 떨어진다. 그 값은 방금 맞은 시험의 겹침 길이이므로 여기서 받지
       * 않는다 — 같은 수가 두 자리에 살면 언젠가 갈린다.
       */
      case 'fail-set': {
        const fold = scene.fold;
        if (fold === null || fold.settled) return scene;
        return {
          ...scene,
          fails: [...scene.fails, settledValue(fold)],
          fold: { ...fold, settled: true },
          step: { kind: 'settle' },
        };
      }

      /*
       * 텍스트를 훑는다. 첫 발신에서 위층을 접고 아래층을 연다.
       */
      case 'scan-align': {
        const matched = num(p.matched);
        if (matched === null) return scene;
        const hunt = scene.hunt ?? HUNT_START;
        return {
          ...scene,
          fold: null,
          hunt: { ...hunt, scan: { matched }, borrow: null },
          step: { kind: 'scan' },
        };
      }

      /*
       * 맞은 부분의 끝 몇 글자가 그 앞 몇 글자와 같다 — **표가 그렇게 말한다.**
       * 그 수를 받지 않고 장면이 세운 표에서 읽는다.
       */
      case 'borrow-overlap': {
        const hunt = scene.hunt;
        if (hunt === null || hunt.scan === null) return scene;
        const border = scene.fails[hunt.scan.matched - 1] ?? 0;
        return { ...scene, hunt: { ...hunt, borrow: border }, step: { kind: 'borrow' } };
      }

      /*
       * 덩어리를 민다. 떠나온 자리는 `step.from` 이 말하고(운동의 출발 그림),
       * 물려받는 글자 수는 방금 빌린 겹침이며, 건너뛴 자리는 두 칸 사이를 센다.
       */
      case 'jump': {
        const to = num(p.to);
        const hunt = scene.hunt;
        if (to === null || hunt === null) return scene;
        const from = hunt.align;
        const skips = [...hunt.skips];
        for (let s = from + 1; s < to; s += 1) skips.push(s);
        return {
          ...scene,
          hunt: {
            ...hunt,
            align: to,
            keep: hunt.borrow ?? 0,
            scan: null,
            borrow: null,
            skips,
          },
          step: { kind: 'jump', from },
        };
      }

      /*
       * 통째로 맞았다. 자리는 이미 `align` 이 쥐고 있다.
       */
      case 'found': {
        const hunt = scene.hunt;
        if (hunt === null) return scene;
        return { ...scene, hunt: { ...hunt, found: true }, step: { kind: 'found' } };
      }

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 걸음이 쌓은 것은 인자로 넘어갈 길이 없다.
        return atStart(scene.base);

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
