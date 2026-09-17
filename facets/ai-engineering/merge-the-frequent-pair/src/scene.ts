/**
 * mergeTheFrequentPair 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 줄들이 조각으로 서 있고, 걸음마다 셋 중 하나가 달라진다 — 쪼개지거나, 이음매에
 * 수가 앉거나, 이음매가 닫힌다. 그래서 장면이 쥐는 것은 넷이다.
 *
 *   rows      지금 서 있는 줄들.
 *   baseRows  쪼갠 직후의 줄들. 가장 넓은 상태라 이음매 폭을 여기서 정한다 —
 *             합쳐지기만 하므로 그 뒤로는 줄어들기만 하고, 폭이 걸음마다 흔들리면
 *             같은 열이 네 줄에서 함께 닫히는 그림이 깨진다.
 *   seams     재고 있는 이음매의 셈과 이번에 닫힐 자리. 닫히고 나면 걷힌다.
 *   learned   합쳐져 나온 조각들. 어휘가 자라는 자취라 되감기 전까지 쌓인다.
 *
 * ── 닫히는 운동을 장면 하나로 그릴 수 있게
 *
 * `merged.at` 은 새 줄의 어느 조각이 이번에 합쳐져 나왔는지를 표시한다. 그 표시를
 * 되짚으면 합치기 **직전**의 줄이 그대로 나오므로, 앞 장면이 없어도 미끄러지는
 * 운동을 셈할 수 있다. `merged.counts` 는 그때 이음매에 적혀 있던 수다 — 닫히는
 * 틈에서 밀려 나가는 것이 그 수라 장면이 알고 있어야 한다.
 *
 * 문안은 담지 않는다 — 무엇을 말할지와 그 인자만 담고, 문자는 그리는 쪽이 만든다
 * (C10 의 조회는 View 의 `params.t` 로).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 재고 있는 이음매. `counts[r][i]` 는 r 번째 줄 i 번째 이음매에 놓인 짝의 셈. */
export type MergeSeams = {
  counts: number[][];
  /** 이번 걸음에 실제로 닫힐 이음매. 겹침은 건너뛴 뒤라 한 줄에 여럿일 수 있다. */
  winner: boolean[][];
};

/** 방금 닫힌 이음매. */
export type MergedSeam = {
  a: string;
  b: string;
  token: string;
  /** `at[r][i]` — `rows[r][i]` 가 이번 걸음에 합쳐져 나온 조각인가. */
  at: boolean[][];
  /** 닫히기 직전에 이음매에 적혀 있던 수. 밀려 나가는 운동에만 쓴다. */
  counts: number[][];
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type MergeCaption =
  | { kind: 'split'; mark: string }
  | { kind: 'weigh'; a: string; b: string; count: number }
  | { kind: 'merge'; a: string; b: string; token: string }
  | { kind: 'done'; pieces: number };

export type MergeScene = {
  baseRows: string[][];
  rows: string[][];
  seams: MergeSeams | null;
  merged: MergedSeam | null;
  learned: string[];
  caption: MergeCaption | null;
};

const EMPTY: MergeScene = {
  baseRows: [],
  rows: [],
  seams: null,
  merged: null,
  learned: [],
  caption: null,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readRows(v: unknown): string[][] {
  if (!Array.isArray(v)) return [];
  return v.map((line) =>
    Array.isArray(line) ? line.filter((token): token is string => typeof token === 'string') : [],
  );
}

function readNumberGrid(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  return v.map((line) => (Array.isArray(line) ? line.map(num) : []));
}

function readFlagGrid(v: unknown): boolean[][] {
  if (!Array.isArray(v)) return [];
  return v.map((line) => (Array.isArray(line) ? line.map((flag) => flag === true) : []));
}

/**
 * 합치기 전 줄과 닫힐 자리에서 **합친 뒤** 줄 기준의 표식을 얻는다.
 *
 * 걷는 방식이 algorithm 의 `mergeRow` 와 같아야 한다 — 겹치는 자리를 건너뛰는 규칙이
 * 어긋나면 표식이 한 칸씩 밀리고, 되짚어 세운 줄이 실제와 달라진다.
 */
function markMerged(before: string[][], winner: boolean[][]): boolean[][] {
  return before.map((tokens, r) => {
    const flags = winner[r] ?? [];
    const at: boolean[] = [];
    for (let i = 0; i < tokens.length; ) {
      if (flags[i] === true && i + 1 < tokens.length) {
        at.push(true);
        i += 2;
      } else {
        at.push(false);
        i += 1;
      }
    }
    return at;
  });
}

export const mergeTheFrequentPairScene: ScenePlan<MergeScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 낱말을 낱글자로 쪼개는 것도 표식을 붙이는 것도 algorithm 의 몫이고 `split`
   * 이벤트로 실려 온다. 여기서 `initialData` 를 다시 쪼개면 같은 규칙이 두 곳에
   * 살게 되고, 넘겨받은 객체를 참조로 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그린다 (S-scene).
   */
  initial(): MergeScene {
    return EMPTY;
  },

  reduce(scene: MergeScene, event: FacetRuntimeEvent): MergeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'split': {
        const rows = readRows(p.rows);
        // 쪼개기는 한 바퀴의 처음이다. 앞 바퀴에서 자란 어휘는 여기서 거둔다.
        return {
          baseRows: rows,
          rows,
          seams: null,
          merged: null,
          learned: [],
          caption: { kind: 'split', mark: str(p.mark) },
        };
      }

      case 'weigh': {
        const a = str(p.a);
        const b = str(p.b);
        return {
          ...scene,
          seams: { counts: readNumberGrid(p.counts), winner: readFlagGrid(p.winner) },
          // 앞 걸음에 닫힌 이음매는 이제 지난 일이다.
          merged: null,
          caption: { kind: 'weigh', a, b, count: num(p.count) },
        };
      }

      case 'merge': {
        const a = str(p.a);
        const b = str(p.b);
        const token = str(p.token);
        const winner = scene.seams?.winner ?? [];
        const counts = scene.seams?.counts ?? [];
        return {
          ...scene,
          rows: readRows(p.rows),
          // 재는 일은 끝났다. 그 수는 닫히는 운동에 쓰이려고 `merged` 로 옮겨 간다.
          seams: null,
          merged: { a, b, token, at: markMerged(scene.rows, winner), counts },
          learned: scene.learned.includes(token) ? scene.learned : [...scene.learned, token],
          caption: { kind: 'merge', a, b, token },
        };
      }

      case 'done':
        return { ...scene, caption: { kind: 'done', pieces: num(p.pieces) } };

      // 손으로 짚기 시작 — 한 바퀴를 처음부터 다시 세운다.
      case 'rewind':
        return EMPTY;

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
