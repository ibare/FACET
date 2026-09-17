/**
 * MatchLengthPerSpot 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 상태가 없었고(`let` 0 건), stage 의 `let` 도 하나뿐이었다. 그런데도
 * 화면이 아는 것은 넷이었다 — **변수가 없는 조각이 가장 위험하다.**
 *
 * - `let win` — 지금 겹침 구간. 글자 칸의 음영도 밴드도 전부 여기서 나왔고,
 *   구간이 미끄러지는 운동의 **출발값**도 여기서 꺼냈다. 되짚어 세운 직후에는 그
 *   값이 옛 화면의 것이라 구간이 엉뚱한 데서 출발했다. 이제 `windows` 가 자취로
 *   쌓이고 직전 구간은 그 자취의 끝에서 둘째다.
 * - `const borrowed: boolean[]` — **어느 자리가 거울에서 베껴 온 자리인가.**
 *   이 조각의 결론 그 자체인데 `const` 라 `let` grep 을 통과하고
 *   `borrowed[i] = …` 로 제자리에서 고쳐졌다. 게다가 마무리 걸음이 그 배열을 도로
 *   읽어 어느 칸을 튀게 할지 정했다 — 화면의 칠과 같은 물음에 답이 둘이었다.
 *   이제 `spot.borrow` 하나가 말한다.
 * - **견준 자국이 어디에도 없었다.** `flashPair` 가 90ms 물들였다 `regionFill` 로
 *   되돌려, 완주 화면에는 "글자를 실제로 몇 번 견줬나" 가 남지 않았다. 이 조각의
 *   주장은 *다시 안 재도 된다* 인데 **잰 쪽이 화면에 없으니 아낀 몫도 없었다.**
 *   이제 `spot.scan` 이 견준 구간을 남기고 `comparisonsAt` 이 칸마다 센다.
 * - **값 칸의 채움 하나에 두 뜻이 실려 있었다** — `c.accent` 면 베껴 온 자리,
 *   `c.bgSubtle` 이면 훑어 잰 자리. 그러면 *값이 정해졌나* 와 *어떻게 얻었나* 가
 *   한 축을 다투어, 베끼고 이어서 잰 자리(`capped`)를 어느 쪽으로도 못 그린다.
 *   이제 채움이 형편을, 테두리가 출처를 말한다.
 *
 * ── 차례는 장면이 센다
 *
 * `index` 를 싣지 않는다. 답은 왼쪽에서 오른쪽으로 하나씩만 차므로 지금 자리는 늘
 * `spots.length` 다. 다만 한 자리가 걸음 **둘**(베끼고 이어서 견주기)을 쓸 수
 * 있어, 그 둘을 한 자리로 묶는 잣대가 필요하다 — `capped` 가 그것이다.
 *
 * ── 싣는 것은 판정뿐이다
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 맨 앞 자리의 답 | 바탕 문자열의 길이. 화면의 칸 수와 한 출처다 |
 * | 견줌이 어긋나 멈췄나 | `index + value` 가 문자열 끝에 닿았나 |
 * | 새 구간의 양 끝 | 방금 찬 자리와 그 값 |
 * | 견주기의 출발점 | 바로 앞에서 베껴 온 만큼 |
 * | 거울 자리 `from` · 베낀 만큼 `value` · 닿았나 `capped` | **싣는다** |
 *
 * 마지막 줄이 이 조각의 알고리즘 그 자체다. 축을 비추어 자리를 고르는 것도,
 * 구간 끝을 넘는 몫은 베끼지 않는다는 것도 걸음이 내리는 판정이라, 장면이
 * 되풀이하면 같은 규칙이 두 곳에 적힌다.
 *
 * ── 담지 않는 것
 *
 * 좌표를 담지 않는다. 자리 번호와 값이라는 **구조**만 담고 칸 폭도 활의 솟음도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `step` 이 무엇을 말할지만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은 캡션의 갈래가
 * `step` 과 자취에서 남김없이 파생되기 때문이다 — 나란히 두면 같은 것을 두 자리에
 * 적는 꼴이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 거울에서 베껴 온 몫. */
export type Borrow = {
  /** 어느 자리에서 베꼈나. 구간 시작점을 축으로 비춘 자리다. */
  from: number;
  /** 베껴 온 만큼. 구간 끝을 넘는 몫은 베끼지 않으므로 `from` 의 답보다 작을 수 있다. */
  value: number;
  /**
   * 베낀 만큼이 구간 끝에 딱 닿았나.
   *
   * 닿았으면 그 너머는 확인된 적이 없어 이어서 글자를 견줘야 한다. 이 갈래가
   * 곧 이 방법이 틀리지 않는 까닭이고, 다음에 올 `scan` 이 **새 자리가 아니라
   * 이 자리를 잇는 것**임을 말해 주는 잣대이기도 하다.
   */
  capped: boolean;
};

/**
 * 실제로 글자를 견준 자국. 남는다 — **안 견줬다는 것**이 이 조각의 주장이라,
 * 잰 쪽이 화면에 없으면 아낀 몫도 보이지 않는다.
 */
export type ScanTrace = {
  /** 몇 글자째부터 견주기 시작했나. 베껴 온 만큼은 건너뛴다. */
  start: number;
  /** 몇 글자가 같았나. */
  value: number;
  /** `value` 자리에서 어긋나 멈췄나. 거짓이면 문자열이 끝나 멈춘 것이다. */
  mismatch: boolean;
};

/**
 * 답이 찬 자리 하나.
 *
 * 두 축이 따로 산다 — **베꼈나**(`borrow`)와 **견줬나**(`scan`). 둘 다 있는 자리가
 * `capped` 갈래이고, 옛 화면은 채움 하나에 두 뜻을 실어 그 자리를 못 그렸다.
 */
export type Spot = {
  /** 맨 앞 자리인가. 정의가 그냥 주는 자리라 베낌도 견줌도 없다. */
  whole: boolean;
  borrow: Borrow | null;
  scan: ScanTrace | null;
};

/** 겹침 구간 하나. 양 끝 모두 자리 번호다 (닫힌 구간). */
export type WindowSpan = { left: number; right: number };

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type MatchLengthStep =
  | { kind: 'whole' }
  | { kind: 'mirror' }
  | { kind: 'scan' }
  | { kind: 'window' }
  | { kind: 'done' };

export type MatchLengthPerSpotScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 답을 구하는 문자열. 화면의 칸도 맨 앞 자리의 답도 여기서 나온다. */
  text: string;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 왼쪽부터 답이 찬 자리들. 자리 번호가 곧 첨자이고 `length` 가 지금 자리다. */
  spots: readonly Spot[];
  /**
   * 구간이 옮겨 온 자취. 마지막이 지금 구간이다.
   *
   * 자취로 두는 까닭은 미끄러지는 운동의 **출발 구간**이 필요하기 때문이다.
   * `prev` 에서 꺼내면 위반이므로 (S-scene) 장면이 스스로 말한다 — 끝에서 둘째가
   * 그것이고, 첫 구간이면 그 자리에서 폭 0 으로 시작한다.
   */
  windows: readonly WindowSpan[];

  /**
   * 방금 밟은 걸음.
   *
   * "자리마다 답이 다 찼나" 를 따로 두지 않는다 — `done` 은 마지막 걸음이므로
   * `step.kind === 'done'` 이 그것이고, 둘을 나란히 두면 같은 물음에 답이 둘이 된다.
   */
  step: MatchLengthStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `spots` · `windows` · `step` 은 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 답이 다 찬 표와 오른쪽 끝까지 간 구간을 단 채로 서고, 그 위에
 * algorithm 이 처음부터 다시 놓는 값이 겹친다 (S-scene).
 */
type MatchLengthBase = Pick<MatchLengthPerSpotScene, 'text'>;

/**
 * 아무 답도 차지 않은 처음 화면. 점선 값 칸만 줄지어 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: MatchLengthBase): MatchLengthPerSpotScene {
  return { text: base.text, spots: [], windows: [], step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ── 화면이 읽는 수는 전부 아래를 지난다 ─────────────────────────────────────

/** 그 자리에 적혀 있는 답. 아직 안 찼으면 `null`. */
export function valueAt(scene: MatchLengthPerSpotScene, index: number): number | null {
  const spot = scene.spots[index];
  if (spot === undefined) return null;
  if (spot.whole) return scene.text.length;
  if (spot.scan !== null) return spot.scan.value;
  return spot.borrow?.value ?? 0;
}

/** 방금 답이 찬 자리의 번호. 아직 아무것도 안 찼으면 `null`. */
export function freshIndex(scene: MatchLengthPerSpotScene): number | null {
  return scene.spots.length === 0 ? null : scene.spots.length - 1;
}

/** 지금 겹침 구간. 아직 없으면 `null`. */
export function currentWindow(scene: MatchLengthPerSpotScene): WindowSpan | null {
  return scene.windows[scene.windows.length - 1] ?? null;
}

/**
 * 구간이 미끄러지기 **전**의 구간.
 *
 * 첫 구간이면 새 구간의 왼쪽 끝에서 폭 0 으로 시작한다 — 없던 것이 왼쪽 끝에서
 * 자라 나오는 꼴이다. `prev` 를 들추지 않고 자취만으로 셈한다 (S-scene).
 */
export function previousWindow(scene: MatchLengthPerSpotScene): WindowSpan | null {
  const count = scene.windows.length;
  if (count === 0) return null;
  const before = scene.windows[count - 2];
  if (before !== undefined) return before;
  const now = scene.windows[count - 1]!;
  return { left: now.left, right: now.left - 1 };
}

/**
 * 글자 칸 하나가 지금까지 **몇 번 견줘졌나**.
 *
 * 견줌은 언제나 앞쪽 자리 `k` 와 뒤쪽 자리 `index + k` 를 짝지으므로 칸 둘이
 * 함께 센다. 베껴 온 자리는 여기에 한 번도 들지 않는다 — 그것이 이 조각이 하는
 * 말이고, 이 수가 곧 **아끼지 못한 몫**이다.
 */
export function comparisonsAt(scene: MatchLengthPerSpotScene): readonly number[] {
  const n = scene.text.length;
  const counts = new Array<number>(n).fill(0);
  scene.spots.forEach((spot, index) => {
    const scan = spot.scan;
    if (scan === null) return;
    // 어긋나 멈췄으면 그 자리도 한 번 본 것이다.
    const last = scan.mismatch ? scan.value : scan.value - 1;
    for (let k = scan.start; k <= last; k += 1) {
      if (k >= 0 && k < n) counts[k] += 1;
      const mate = index + k;
      if (mate >= 0 && mate < n) counts[mate] += 1;
    }
  });
  return counts;
}

/** 견줌의 총 횟수 — 글자 **쌍**을 센다. 마무리 캡션의 `{compares}` 가 여기서 나온다. */
export function comparisonCount(scene: MatchLengthPerSpotScene): number {
  let total = 0;
  for (const spot of scene.spots) {
    const scan = spot.scan;
    if (scan === null) continue;
    const last = scan.mismatch ? scan.value : scan.value - 1;
    total += Math.max(0, last - scan.start + 1);
  }
  return total;
}

/**
 * 글자를 **한 번도** 견주지 않은 자리의 수 — 이 조각의 결론.
 *
 * 베끼기만 하고 끝난 자리다. 베낀 뒤 이어서 견준 자리(`capped`)는 들지 않는다.
 */
export function borrowOnlyCount(scene: MatchLengthPerSpotScene): number {
  let count = 0;
  for (const spot of scene.spots) {
    if (spot.borrow !== null && spot.scan === null) count += 1;
  }
  return count;
}

/**
 * 마지막 자리가 아직 **열려** 있나 — 베꼈는데 구간 끝에 닿아 이어서 견줄 자리.
 *
 * 다음에 오는 `scan` 이 새 자리인지 이 자리를 잇는 것인지를 가르는 유일한 잣대다.
 * `capped` 를 싣지 않으면 장면이 `value >= limit` 를 스스로 셈해야 하는데, 그것이
 * 곧 알고리즘의 갈래를 두 곳에 적는 일이다.
 */
function openIndex(scene: MatchLengthPerSpotScene): number | null {
  const last = scene.spots.length - 1;
  const spot = scene.spots[last];
  if (spot === undefined) return null;
  return spot.borrow?.capped === true && spot.scan === null ? last : null;
}

/** 자리 하나를 갈아 끼운 새 목록. 앞 장면의 배열을 제자리에서 고치지 않는다. */
function withSpot(spots: readonly Spot[], index: number, spot: Spot): readonly Spot[] {
  const next = spots.slice();
  next[index] = spot;
  return next;
}

export const matchLengthPerSpotScene: ScenePlan<MatchLengthPerSpotScene> = {
  /**
   * 첫 장면은 빈 표만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 정한다. 넘겨받는
   * 것이 문자열 하나라 참조를 쥘 일이 없고 (문자열은 제자리에서 고쳐지지 않는다),
   * 좁히는 잣대가 여기 한 벌만 산다 — stage 는 `scene.text` 를 쓴다 (S-piece).
   */
  initial(initialData: unknown): MatchLengthPerSpotScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ text: typeof d.text === 'string' ? d.text : '' });
  },

  reduce(
    scene: MatchLengthPerSpotScene,
    event: FacetRuntimeEvent,
  ): MatchLengthPerSpotScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 맨 앞 자리. 문자열 전체가 곧 맨 앞과의 겹침이다.
       *
       * 그 길이는 바탕에서 잰다 — 화면의 칸 수와 같은 자료라 둘이 갈릴 자리가 없다.
       */
      case 'whole-prefix':
        return {
          ...scene,
          spots: [...scene.spots, { whole: true, borrow: null, scan: null }],
          step: { kind: 'whole' },
        };

      /*
       * 구간 안이라 거울 자리에서 답을 베껴 온다.
       *
       * 어느 자리에 놓는지는 받지 않는다 — 답은 왼쪽부터 하나씩만 차므로 다음
       * 자리가 늘 `spots.length` 다.
       */
      case 'mirror': {
        const from = num(p.from);
        const value = num(p.value);
        if (from === null || value === null) return scene;
        return {
          ...scene,
          spots: [
            ...scene.spots,
            { whole: false, borrow: { from, value, capped: p.capped === true }, scan: null },
          ],
          step: { kind: 'mirror' },
        };
      }

      /*
       * 실제로 글자를 견줬다.
       *
       * 바로 앞이 구간 끝에 닿은 베낌이면 **그 자리를 잇는 것**이고, 아니면 구간
       * 밖의 새 자리다. 어디서부터 견줬는지는 베껴 온 만큼이 말한다.
       */
      case 'scan': {
        const value = num(p.value);
        if (value === null) return scene;
        const open = openIndex(scene);
        const index = open ?? scene.spots.length;
        const borrow = open === null ? null : scene.spots[open]!.borrow;
        const trace: ScanTrace = {
          start: borrow?.value ?? 0,
          value,
          // 문자열이 끝나 멈춘 것이 아니면 그 자리에서 어긋나 멈춘 것이다.
          mismatch: index + value < scene.text.length,
        };
        const spot: Spot = { whole: false, borrow, scan: trace };
        return {
          ...scene,
          spots: withSpot(scene.spots, index, spot),
          step: { kind: 'scan' },
        };
      }

      /*
       * 겹침이 여태보다 오른쪽에 닿아 구간을 그리로 옮긴다.
       *
       * 양 끝은 받지 않는다 — 방금 답이 찬 자리가 왼쪽 끝이고 그 값이 폭이다.
       */
      case 'window': {
        const left = freshIndex(scene);
        if (left === null) return scene;
        const span = valueAt(scene, left);
        if (span === null || span <= 0) return scene;
        return {
          ...scene,
          windows: [...scene.windows, { left, right: left + span - 1 }],
          step: { kind: 'window' },
        };
      }

      /* 자리마다 답이 다 찼다. 무엇을 아꼈는지는 자취가 센다. */
      case 'done':
        return { ...scene, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ text: scene.text });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
