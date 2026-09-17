/**
 * FalseSharing 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * `let` 은 넷뿐이었고 projector 는 아무것도 기억하지 않았다. 정작 이 조각의 결론은
 * 전부 **타입 선언과 `const` 로 묶인 그릇** 안에 있었다.
 *
 * - `type Slab = { g, box, minis, values, owner, dy }` — **DOM 손잡이와 뜻이 한
 *   객체에 묶인** 자리. `owner` 는 "그 줄을 지금 누가 쥐고 있나" 이고 `dy` 는 그것이
 *   어느 선반에 앉아 있나다. `dy` 는 화면의 지금 자리를 따로 적어 둔 **거울**이라
 *   운동의 출발값으로 쓰였다 (`const from = held.dy`).
 * - `const badges = new Map<number, { node, count }>()` — `count` 가 **그 줄이 몇 번
 *   무효화되었나**, 곧 이 조각의 결론이다. DOM 손잡이와 한 객체에 묶여 있었고
 *   `badge.count += 1` 로 제자리에서 자랐다.
 * - `const values: number[]` — 칸마다 담긴 수. `const` 인데 `values[i] = …` 로
 *   알맹이가 제자리에서 고쳐진다.
 * - `const ghosts = new Map<string, SVGRectElement>()` — 빼앗겨 빈 선반이 어디인가.
 * - `let connA / connB` — 선이 있나 없나가 곧 **"이미 한 번 배치를 세웠나"** 라는
 *   암묵 분기였다 (`if (connA === null)` 이 첫 배치와 옮겨 앉기를 갈랐다).
 * - `slideConnector` 의 `Number(node.getAttribute('x1'))` — **화면을 도로 읽어** 선의
 *   출발 자리를 셈했다.
 *
 * 여기서는 그 여섯이 `runs` 하나다. 슬랩의 자리도, 빈 자국도, 무효화 셈도, 칸의
 * 수도 전부 `pictureOf` 가 그 쓰기 목록에서 낸다.
 *
 * ── 수는 한 출처에서만 나온다 — 쓰기 목록
 *
 * - **`writes` · `invalidations` 를 받지 않는다.** 둘 다 쓰기 목록을 훑으면 나온다.
 *   화면의 자취(빈 자국·값)와 캡션의 수가 **같은 목록**에서 나와야 갈리지 않는다.
 * - **`round` 를 받지 않는다.** 바퀴는 올 때마다 하나씩 쌓이므로 `rounds.length` 가
 *   곧 그 바퀴의 번호다.
 * - **`indices` · `values` 를 받지 않는다.** 코어가 맡은 칸은 그 배치가 정하고
 *   (`indexOf`), 칸에 담긴 수는 그 칸에 몇 번 썼나다.
 * - **`aLine` · `bLine` · `sameLine` · `bAddr` · `lineBytes` · `elemBytes` 를 받지
 *   않는다.** 줄 번호는 algorithm 이 내주는 `falseSharingLine` 을 그대로 부른다 —
 *   베끼는 것이 아니라 **같은 함수를 지나는 것**이라 둘이 갈릴 수 없다.
 * - **`sharedCount` 를 받지 않는다.** 두 코어가 함께 쓰는 값의 수는 두 색인이 같은가
 *   뿐이고, 그것이 곧 "거짓" 이라는 말의 근거다.
 * - **`mode` 와 `textKey` 를 받지 않는다.** 무엇을 말할지는 두 칸이 한 줄에 앉았나가
 *   정하고 그것은 장면이 안다.
 *
 * 남기는 것은 둘뿐이다 — 누가 썼나(`core`)와 **그 쓰기가 상대의 사본을 무르게
 * 했나**(`stole`). 뒤의 것은 걸음이 내리는 **판정**이라 싣는다 (프로토콜 3 절의
 * 셋째 줄). 아무도 쥔 적 없는 첫 쓰기는 빼앗을 것이 없어 세지 않는다는 잣대가
 * 거기 들어 있고, 그 잣대가 곧 이 조각이 말하려는 바다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 색인과 줄이라는 **구조**만 담고, 칸 폭도 선반 높이도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { falseSharingLine } from './algorithm.js';

/** 코어의 표식. 도형에 새기는 글자라 번역하지 않는다 (C10). */
export type CoreMark = 'A' | 'B';

/**
 * 쓰기 한 번.
 *
 * 칸도 값도 담지 않는다 — 코어가 맡은 칸은 배치가 정하고(`indexOf`), 칸의 수는 그
 * 칸에 몇 번 썼나다. 담는 것은 **누가**와 **그것이 빼앗은 것이었나** 둘뿐이다.
 */
export type WriteMark = {
  core: CoreMark;
  /**
   * 이 쓰기가 상대의 사본을 무르게 했나.
   *
   * 걸음이 내리는 판정이라 싣는다. 슬랩이 어느 선반에서 오는가(기하)는 쥔 이를
   * 훑어 알고, **무효화로 셈할 것인가(결론)** 는 이 깃발이 정한다. 둘을 갈라 두면
   * 한 물음에 답이 둘이 되지 않는다.
   */
  stole: boolean;
};

/** 두 코어가 한 번씩 고치는 한 바퀴. */
export type WriteRound = {
  writes: readonly WriteMark[];
};

/**
 * 한 배치 — 두 코어가 어느 칸을 맡았고, 그 위에서 무슨 일이 있었나.
 *
 * `settled` 는 셈을 맺었나다. 띠에 선 줄이 아직 자라는 중인지 닫혔는지를 가른다.
 */
export type Arrangement = {
  aIndex: number;
  bIndex: number;
  rounds: readonly WriteRound[];
  settled: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 대상을 싣지 않는다 — 흐를 것은 늘 마지막 배치의 마지막 바퀴이고, 그 바퀴가 무엇을
 * 했는지는 `rounds` 가 말한다. 걸음에 대상을 도로 실으면 방금 걷어낸 "두 출처" 를
 * 운동 쪽으로 다시 들이는 꼴이 된다.
 */
export type FalseSharingStep =
  /** 첫 배치가 선다. 두 선이 각자 제 칸으로 자란다. */
  | { kind: 'arrange' }
  /** 옮겨 앉는다. 앞 배치가 메모리로 내려앉고 선이 새 칸으로 미끄러진다. */
  | { kind: 'rearrange' }
  /** 한 바퀴. 줄이 끌려오고 값이 튀어 오른다. */
  | { kind: 'round' }
  /** 이 배치의 셈을 맺는다. */
  | { kind: 'settle' }
  /** 두 배치를 견준다. */
  | { kind: 'conclude' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다.
 *
 * 인자를 담지 않는다 — 색인도 주소도 줄 번호도 고친 횟수도 무효화 수도 전부 `runs`
 * 와 바탕에서 나온다. 캡션이 제 수를 따로 들고 있으면 화면의 자취와 갈릴 자리가
 * 생긴다.
 */
export type FalseSharingCaption =
  | { kind: 'together' }
  | { kind: 'apart' }
  | { kind: 'collide' }
  | { kind: 'quiet' }
  | { kind: 'tally' }
  | { kind: 'tallyApart' }
  | { kind: 'done' };

export type FalseSharingScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 캐시 라인 한 줄의 크기(바이트). */
  lineBytes: number;
  /** 배열 원소 하나의 크기(바이트). */
  elemBytes: number;
  /**
   * 그림이 품어야 하는 가장 큰 색인.
   *
   * 선언의 두 쌍에서 한 번에 셈한다. 배치가 바뀌어도 띠의 칸 수가 흔들리지 않게
   * **바탕에서 한 번에** 정하는 값이다 — 배열을 참조로 쥐지 않으려고 수 하나로
   * 좁혀 둔다 (S-scene).
   */
  spanIndex: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 세워진 배치들, 선 순서대로. 마지막이 지금 배치다.
   *
   * **남는 자취**다. 끝난 배치도 지우지 않는다 — 이 조각의 주장은 두 배치를
   * **견주는 것**이라 앞 배치의 셈이 사라지면 견줄 짝이 없어진다.
   */
  runs: readonly Arrangement[];
  /** 두 배치를 다 견주었나. */
  concluded: boolean;

  step: FalseSharingStep | null;
  caption: FalseSharingCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `runs` 와 `concluded` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 셈이 쌓인 채로 선다 (S-scene).
 */
type FalseSharingBase = Pick<FalseSharingScene, 'lineBytes' | 'elemBytes' | 'spanIndex'>;

/**
 * 아무 배치도 서지 않은 처음 화면. 메모리 띠만 0 으로 깔려 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: FalseSharingBase): FalseSharingScene {
  return {
    lineBytes: base.lineBytes,
    elemBytes: base.elemBytes,
    spanIndex: base.spanIndex,
    runs: [],
    concluded: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function coreMark(v: unknown): CoreMark | null {
  return v === 'A' || v === 'B' ? v : null;
}

/** 한 바퀴에 실려 온 쓰기들. 모양이 맞지 않는 것은 버린다 (C9). */
function marksOf(v: unknown): WriteMark[] {
  if (!Array.isArray(v)) return [];
  const out: WriteMark[] = [];
  for (const raw of v as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const core = coreMark(rec.core);
    if (core === null) continue;
    out.push({ core, stole: rec.stole === true });
  }
  return out;
}

/** 그 코어가 이 배치에서 맡은 칸. */
export function indexOf(run: Arrangement, core: CoreMark): number {
  return core === 'A' ? run.aIndex : run.bIndex;
}

/** 두 코어의 칸이 한 줄에 앉았나. 이 조각이 가리려는 **단 하나의 차이**다. */
export function sameLineOf(run: Arrangement, lineBytes: number, elemBytes: number): boolean {
  return (
    falseSharingLine(run.aIndex, lineBytes, elemBytes) ===
    falseSharingLine(run.bIndex, lineBytes, elemBytes)
  );
}

/**
 * 두 코어가 정말로 함께 쓰는 값의 수.
 *
 * 서로 다른 칸을 맡으면 영이고, 그것이 "거짓" 공유라는 말의 근거다. `done` 이
 * 실어 오던 수를 여기서 센다.
 */
export function sharedCountOf(run: Arrangement): number {
  return run.aIndex === run.bIndex ? 1 : 0;
}

/**
 * 한 배치의 화면이 말하는 것 전부 — 쓰기 목록 하나에서 낸다.
 *
 * **이 함수 하나가 슬랩의 자리와 빈 자국과 무효화 셈과 칸의 수를 전부 낸다.**
 * 그래서 띠에 뜨는 수와 그림의 자취가 갈릴 자리가 없다.
 *
 * `cut` 은 그 배치를 **몇 번째 쓰기까지** 반영할지다. 한 바퀴 안에서 코어 둘이
 * 차례로 움직이므로, 운동이 그 사이 화면을 세우려면 중간을 셈할 수 있어야 한다.
 * 생략하면 끝까지다.
 */
export type Picture = {
  /** 칸 → 지금 담긴 수. 쓰지 않은 칸은 없다(0 으로 읽는다). */
  values: ReadonlyMap<number, number>;
  /** 줄 → 지금 그 줄을 쥔 코어. 아무도 안 쥐었으면 없다. */
  holder: ReadonlyMap<number, CoreMark>;
  /** 줄 → 빼앗겨 빈 자국만 남은 코어. */
  vacated: ReadonlyMap<number, CoreMark>;
  /** 줄 → 그 줄에서 일어난 무효화 횟수. */
  invalid: ReadonlyMap<number, number>;
  /** 이 배치에서 고친 횟수. */
  writes: number;
  /** 이 배치에서 무효화된 횟수. */
  invalidations: number;
};

export function pictureOf(
  run: Arrangement,
  lineBytes: number,
  elemBytes: number,
  cut?: number,
): Picture {
  const values = new Map<number, number>();
  const holder = new Map<number, CoreMark>();
  const everHeld = new Map<number, Set<CoreMark>>();
  const invalid = new Map<number, number>();
  let writes = 0;
  let invalidations = 0;

  const limit = cut ?? Number.POSITIVE_INFINITY;
  outer: for (const round of run.rounds) {
    for (const mark of round.writes) {
      if (writes >= limit) break outer;
      const index = indexOf(run, mark.core);
      const line = falseSharingLine(index, lineBytes, elemBytes);
      if (mark.stole) {
        invalidations += 1;
        invalid.set(line, (invalid.get(line) ?? 0) + 1);
      }
      const seen = everHeld.get(line) ?? new Set<CoreMark>();
      seen.add(mark.core);
      everHeld.set(line, seen);
      holder.set(line, mark.core);
      values.set(index, (values.get(index) ?? 0) + 1);
      writes += 1;
    }
  }

  const vacated = new Map<number, CoreMark>();
  for (const [line, seen] of everHeld) {
    const now = holder.get(line);
    for (const core of seen) if (core !== now) vacated.set(line, core);
  }

  return { values, holder, vacated, invalid, writes, invalidations };
}

/** 이 배치에서 이 색인이 담은 수. 안 쓴 칸은 0 이다. */
export function valueAt(pic: Picture, index: number): number {
  return pic.values.get(index) ?? 0;
}

/** 지금 배치. 아직 아무 배치도 안 섰으면 null. */
export function currentRun(scene: FalseSharingScene): Arrangement | null {
  return scene.runs[scene.runs.length - 1] ?? null;
}

export const falseSharingScene: ScenePlan<FalseSharingScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). 여기서는 수 하나(`spanIndex`)로 좁혀 담는다.
   */
  initial(initialData: unknown): FalseSharingScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const lineBytes = num(d.lineBytes);
    const elemBytes = num(d.elemBytes);
    let span = 0;
    for (const key of ['together', 'apart']) {
      const pair = d[key];
      if (!Array.isArray(pair)) continue;
      for (const v of pair as unknown[]) {
        const n = num(v);
        if (n !== null && n >= 0 && n > span) span = n;
      }
    }
    return atStart({
      lineBytes: lineBytes !== null && lineBytes > 0 ? lineBytes : 0,
      elemBytes: elemBytes !== null && elemBytes > 0 ? elemBytes : 0,
      spanIndex: span,
    });
  },

  reduce(scene: FalseSharingScene, event: FacetRuntimeEvent): FalseSharingScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 배치가 선다. 두 코어가 어느 칸을 맡는지가 이 걸음의 전부다.
       *
       * 줄 번호도 주소도 `sameLine` 도 받지 않는다 — 색인과 바탕만 있으면
       * `falseSharingLine` 이 낸다. 앞 배치는 지우지 않고 뒤에 쌓는다.
       */
      case 'arrange': {
        const aIndex = num(p.aIndex);
        const bIndex = num(p.bIndex);
        if (aIndex === null || bIndex === null) return scene;
        const run: Arrangement = { aIndex, bIndex, rounds: [], settled: false };
        const first = scene.runs.length === 0;
        return {
          ...scene,
          runs: [...scene.runs, run],
          step: { kind: first ? 'arrange' : 'rearrange' },
          caption: {
            kind: sameLineOf(run, scene.lineBytes, scene.elemBytes) ? 'together' : 'apart',
          },
        };
      }

      /*
       * 한 바퀴 — 두 코어가 차례로 제 칸을 고친다.
       *
       * 바퀴 번호도 칸도 값도 받지 않는다. 남는 것은 누가 썼나와 **그 쓰기가
       * 빼앗은 것이었나** 라는 판정뿐이다.
       *
       * 앞 장면을 제자리에서 고치지 않는다 — 마지막 배치만 새 객체로 갈아 끼운다.
       */
      case 'write-round': {
        const writes = marksOf(p.writes);
        const at = scene.runs.length - 1;
        const run = scene.runs[at];
        if (run === undefined || writes.length === 0) return scene;
        const next: Arrangement = { ...run, rounds: [...run.rounds, { writes }] };
        return {
          ...scene,
          runs: [...scene.runs.slice(0, at), next],
          step: { kind: 'round' },
          caption: {
            kind: sameLineOf(next, scene.lineBytes, scene.elemBytes) ? 'collide' : 'quiet',
          },
        };
      }

      /*
       * 이 배치의 셈을 맺는다. 실어 오는 수가 없다 — 고친 횟수도 무효화도
       * 무효화 셈도 전부 쓰기 목록이 쥐고 있다.
       */
      case 'settle': {
        const at = scene.runs.length - 1;
        const run = scene.runs[at];
        if (run === undefined) return scene;
        const next: Arrangement = { ...run, settled: true };
        return {
          ...scene,
          runs: [...scene.runs.slice(0, at), next],
          step: { kind: 'settle' },
          caption: {
            kind: sameLineOf(next, scene.lineBytes, scene.elemBytes) ? 'tally' : 'tallyApart',
          },
        };
      }

      /*
       * 두 배치를 견준다. `sharedCount` 를 받지 않는다 — 두 색인이 같은가일 뿐이다.
       */
      case 'done':
        return { ...scene, concluded: true, step: { kind: 'conclude' }, caption: { kind: 'done' } };

      /*
       * 처음으로 되감는다. 바탕만 남기고 자취를 턴다 — 변수가 아니라 객체 리터럴을
       * 넘긴다 (S-scene). 화면이 통째로 비므로 흐를 것도 말할 것도 없다.
       */
      case 'rewind':
        return atStart({
          lineBytes: scene.lineBytes,
          elemBytes: scene.elemBytes,
          spanIndex: scene.spanIndex,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
