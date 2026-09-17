/**
 * keepNeighborsClose 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 도 조회 분기도 없었고 stage 는 `getAttribute` 를 한 번도 쓰지
 * 않았다. **상태는 전부 stage 의 `let` 다섯과 그것이 쥔 한 덩이 안에 있었다.**
 *
 * - `let st = blank()` — **자취가 통째로 이 한 덩이였다.** 열셋 가운데 여덟이
 *   되짚기가 어긋나던 자리다.
 *   - `visible` · `grow` — 고리가 섰나. 지금은 `raised` 다.
 *   - `t` — 얼마나 펴졌나. **좌표가 아니라 *어느 국면에 있나*를 말하는 수**였다
 *     (프로토콜 3-1 의 ⑤). 지금은 `line !== null` 이 그 자리를 말하고 `t` 는
 *     운동이 흐르는 동안에만 산다.
 *   - `guide` — 안내 고리의 진하기. 펴지면 0 이 되는 파생값이라 담지 않는다.
 *   - `cut` · `tear` — 끊겼나. 지금은 `cut` 하나다.
 *   - `keptWave` — 지켜진 쌍을 훑었나. 훑고 나면 1 로 남아 **모든 변의 굵기와
 *     숫자의 색을 정했다.** 지금은 `keptMarked` 다.
 *   - `kept: Map<number, number>` — **이 조각의 결론이 stage 의 `Map` 에 있었다**
 *     (함정 36). 값만이 아니라 *자리가 있느냐*가 곧 "이 쌍은 지켜졌다" 였고,
 *     `st.kept.get(a) ?? st.gaps[a] ?? model.seg[i]` 라는 세 겹 되읽기로 숫자가
 *     나왔다 — **같은 물음에 답이 셋**이었다 (함정 25). 지금은 `line` 하나에서
 *     `gapOf` 가 낸다.
 *   - `gaps: number[]` — 걸음이 실어 온 고리의 거리를 적어 두었다. 그런데
 *     `buildChain` 이 같은 거리를 좌표에서 또 셈하고 있었다 (`seg`). 지금은
 *     `algorithm.ts` 가 내주는 `keepNeighborsCloseGaps` 한 군데를 지난다.
 *   - `tornLabel: string` — **문안이 stage 의 변수에 살았다** (C10). projector 가
 *     `t('label.torn', …)` 로 만들어 밀어 넣었고, 빈 문자열이면 "아직 안 짚었다"
 *     라는 뜻까지 겸했다. 지금은 `tornMarked` 가 그 뜻을 맡고 문자는 그리는 쪽이
 *     만든다.
 *   - `far` · `farGrow` — 마주 보는 쌍을 견주었나. 지금은 `farMarked` 다.
 * - `let lineX: number[] | null` — **펴진 뒤 점들이 선 가로 자리를 픽셀로 적어 둔
 *   화면의 거울**이다 (함정 28). `getAttribute` 를 안 쓰니 ④ 의 grep 을 지나가지만
 *   병은 같다. 지금은 `line` 이 **데이터 단위**로 값의 자리만 쥐고 픽셀은 그리는
 *   쪽이 캔버스에서 역산한다 (S-piece).
 * - `let ringCy` · `let ringR` — 안내 고리의 지금 자리와 크기. mount 에서 한 번
 *   재어 `guideRing` 에 박아 두었고 **그 뒤로 어느 경로도 다시 쓰지 않았다** —
 *   재건 밖 요소다 (함정 18). 지금은 정적 그리기가 매번 바탕에서 역산한다.
 * - `type ChainModel = { order, seg, cum, mid, scale, slot }` — **`const model` 로
 *   묶였는데 `unroll` 이 `model.scale` 을 제자리에서 고쳤다** (⑤). 그 척도가 변의
 *   길이·거리 숫자·마주 보는 쌍의 자까지 화면의 모든 가로 길이를 정했고, 되감기는
 *   그것을 되돌리지 않았다. 지금은 그리는 쪽이 매번 셈해 없앴다.
 * - `type Row = { group; chip; text }` — **DOM 손잡이 셋뿐이고 뜻이 없다** (함정 24).
 *   곧 "이 쌍이 지켜졌나 찢어졌나" 와 "이미 짚었나" 가 통째로 `chip` 의 칠과
 *   `text` 의 색에만 있었다는 뜻이다. 지금은 장면이 그 둘을 말하고 어휘도 갈랐다.
 *
 * ── 무엇을 싣고 무엇을 세는가 (프로토콜 4 절의 갈래)
 *
 * **이웃 간격을 그대로 쌓아 한 줄을 만드는 셈이 이 조각의 알고리즘 그 자체다.**
 * 그것을 장면이 다시 풀면 조각이 보이려는 셈을 장면이 하게 되고 발신이 장식이 된다.
 * 그래서 걸음이 싣는 것은 **판정 하나**뿐이다.
 *
 * - `unroll` 의 `positions` — 편 뒤 각 점이 줄 위 어디에 놓이는가. 끊은 자리 다음
 *   점을 왼쪽 끝에 두고 이웃 간격을 차례로 쌓은 결과라 이 조각의 답이다.
 *
 * 나머지는 전부 걷어냈다.
 *
 * - `ring` 의 `gaps` — 고리 위 이웃의 거리는 **바탕의 좌표에서 곧바로 나온다.**
 *   게다가 stage 의 `buildChain` 이 이미 같은 수를 따로 셈하고 있었다. 잣대는
 *   `algorithm.ts` 가 내주어 한 군데로 모은다.
 * - `cut` 의 `a` · `b` — 어디를 끊을지는 선언에 적힌 `cutAt` 이고 `b` 는 그 다음
 *   이웃이다. 걸음이 정하는 것이 아니다.
 * - `kept` 의 `pairs` · `dists` — 끊긴 하나를 뺀 나머지가 지켜진 쌍이고, 그 거리는
 *   `positions` 의 이웃한 두 칸 사이다. **둘 다 세면 나온다.**
 * - `torn` 의 `before` · `after` · `ratio` — 고리에서의 거리와 줄에서의 거리, 그리고
 *   그 배수. 셋 다 위와 같은 자료를 지난다.
 * - `far` 의 `a` · `b` · `before` · `after` — 쌍은 선언의 `farPair` 이고 두 거리는
 *   좌표와 `positions` 에서 나온다.
 *
 * 그래서 **화면의 숫자와 캡션의 숫자와 "아홉이 지켜졌다" 는 결론이 한 자리를
 * 지난다.** 옛 화면은 그 결론을 `messages` 에 영어 낱말로 적어 두고 있었다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점의 화면 자리도 줄의 길이도 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). 담는 것은 **값의 자리**다 (`line` 은 데이터 단위).
 * 문안도 담지 않는다 — `phaseOf` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { keepNeighborsCloseGaps } from './algorithm.js';

/**
 * 고리 위 이웃 쌍의 거리. `algorithm.ts` 가 쥔 것을 그대로 내보낸다 — 그리는 쪽이
 * 따로 적으면 같은 물음에 답이 둘이 된다.
 */
export { keepNeighborsCloseGaps } from './algorithm.js';

/** 자리 하나. 화면 좌표가 아니라 데이터 좌표다. */
export type ScenePt = { x: number; y: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 어디서 어디로 가는지가 전부 자취와 바탕에서
 * 나오므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type KeepNeighborsCloseStep =
  /** 고리가 서고 점들이 차례로 자란다. */
  | { kind: 'ring' }
  /** 이웃 한 쌍의 이음이 끊긴다. */
  | { kind: 'cut' }
  /** 고리가 꺾임을 풀며 한 줄이 된다. */
  | { kind: 'unroll' }
  /** 지켜진 쌍을 왼쪽부터 훑어 짚는다. */
  | { kind: 'kept' }
  /** 찢어진 쌍이 값을 치른 것을 짚는다. */
  | { kind: 'torn' }
  /** 마주 보는 쌍의 원래 거리와 지금 거리를 나란히 잰다. */
  | { kind: 'far' }
  /** 할 말을 마쳤다. */
  | { kind: 'finish' };

/**
 * 지금 화면이 서 있는 국면. 걸음이 아니라 **자취**에서 나온다.
 *
 * 같은 걸음을 몇 번 다시 그려도 같은 국면이 나와야 하고, 장면에 국면 필드를 따로
 * 두면 같은 것을 두 자리에 적는 꼴이다. 수는 전부 인자로만 담고 문자는 그리는
 * 쪽이 만든다 (C10).
 */
export type KeepNeighborsClosePhase =
  /** 아직 아무것도 서지 않았다. */
  | { kind: 'blank' }
  /** 고리가 섰다. `gap` 은 이웃 거리다 — 고리라 모두 같다. */
  | { kind: 'ring'; gap: number }
  /** `a`-`b` 이음을 끊는다. */
  | { kind: 'cut'; a: number; b: number }
  /** 줄이 되었다. */
  | { kind: 'unroll' }
  /** `total` 쌍 가운데 `kept` 쌍이 거리를 지켰다. */
  | { kind: 'kept'; kept: number; total: number }
  /** 찢어진 쌍이 `before` 에서 `after` 로, `ratio` 배가 되었다. */
  | { kind: 'torn'; before: number; after: number; ratio: number }
  /** 마주 보는 쌍 `a`-`b` 의 원래 거리와 편 뒤 거리. */
  | { kind: 'far'; a: number; b: number; before: number; after: number }
  /** 마쳤다. */
  | { kind: 'done' };

export type KeepNeighborsCloseScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 고리 위의 점들. 차례가 곧 이웃 관계이고 마지막의 다음은 첫 점이다. */
  points: readonly ScenePt[];
  /** 끊을 자리. 이 첨자의 점과 그 다음 점 사이를 끊는다. */
  cutAt: number;
  /** 곁들여 견줄 마주 보는 쌍. */
  farPair: readonly [number, number];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 고리와 점들이 섰나. */
  raised: boolean;
  /** 이웃 한 쌍의 이음이 끊겼나. */
  cut: boolean;
  /**
   * 편 뒤 각 점이 놓인 줄 위의 자리 (데이터 단위). 아직 고리면 `null`.
   *
   * **이 조각의 답이 통째로 여기 있다.** 지켜진 쌍의 거리도 찢어진 쌍의 거리도
   * 마주 보는 쌍의 지금 거리도 전부 이 배열의 두 칸 사이라, 화면의 숫자와 캡션의
   * 숫자가 갈릴 자리가 없다.
   */
  line: readonly number[] | null;
  /** 지켜진 쌍을 짚었나. 짚고 나면 표식이 남는다. */
  keptMarked: boolean;
  /** 찢어진 쌍을 짚었나. */
  tornMarked: boolean;
  /** 마주 보는 쌍을 견주었나. */
  farMarked: boolean;
  /** 마쳤나. */
  finished: boolean;

  step: KeepNeighborsCloseStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 자취 일곱은 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 다 펴진 줄과 짚어 둔
 * 표식을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다
 * (S-scene).
 */
type Base = Pick<KeepNeighborsCloseScene, 'points' | 'cutAt' | 'farPair'>;

/**
 * 되돌린 뒤의 장면 — 바탕만 남고 화면에는 아무것도 서지 않는다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): KeepNeighborsCloseScene {
  return {
    points: base.points,
    cutAt: base.cutAt,
    farPair: base.farPair,
    raised: false,
    cut: false,
    line: null,
    keptMarked: false,
    tornMarked: false,
    farMarked: false,
    finished: false,
    step: null,
  };
}

// ── 선언 좁히기 ───────────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고 그리는
// 쪽은 장면만 받는다 — 두 벌이 되면 점의 수와 끊을 자리가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 자리 목록. 값만 베껴 새 배열로 돌려준다 — 넘겨받은 것을 참조로 쥐지 않는다. */
function readPoints(raw: unknown): ScenePt[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenePt[] = [];
  for (const item of raw) {
    const p = fields(item);
    const x = num(p?.x);
    const y = num(p?.y);
    if (x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

/** 고리 위의 첨자 하나. 범위 밖이면 null — 그리기가 갈릴 자리다. */
function readIndex(raw: unknown, count: number): number | null {
  const v = num(raw);
  if (v === null || !Number.isInteger(v) || v < 0 || v >= count) return null;
  return v;
}

/** 마주 보는 쌍. 두 첨자가 범위 안이고 서로 달라야 한다. */
function readPair(raw: unknown, count: number): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const a = readIndex(raw[0], count);
  const b = readIndex(raw[1], count);
  if (a === null || b === null || a === b) return null;
  return [a, b];
}

/** 줄 위의 자리 목록. 점마다 하나씩 있어야 한다. */
function readLine(raw: unknown, count: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const out: number[] = [];
  for (const item of raw) {
    const v = num(item);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 변에 매달린 숫자도 캡션의 수도 마주 보는
// 쌍의 자도 같은 함수를 부르므로 갈릴 자리가 없다.

/** 이 쌍의 다음 이웃. 고리이므로 마지막의 다음은 첫 점이다. */
export function nextOf(scene: KeepNeighborsCloseScene, k: number): number {
  const n = scene.points.length;
  return n === 0 ? 0 : (k + 1) % n;
}

/** 고리 위 이웃 쌍의 거리. `gaps[k]` 는 점 k 와 그 다음 점 사이다. */
export function ringGaps(scene: KeepNeighborsCloseScene): number[] {
  return keepNeighborsCloseGaps(scene.points);
}

/**
 * 이웃 쌍 `k` 의 **지금** 거리.
 *
 * 아직 고리면 고리에서 잰 것이고, 펴졌으면 줄 위의 두 자리 사이다. 이 조각이
 * 말하려는 것이 바로 이 둘이 아홉 번은 같고 한 번은 갈린다는 것이라, 두 경우가
 * 한 함수를 지나야 한다.
 */
export function gapOf(scene: KeepNeighborsCloseScene, k: number): number {
  const line = scene.line;
  if (line === null) return ringGaps(scene)[k] ?? 0;
  const a = line[k];
  const b = line[nextOf(scene, k)];
  return a === undefined || b === undefined ? 0 : Math.abs(b - a);
}

/** 거리가 지켜진 이웃 쌍의 앞 첨자. 끊긴 하나를 뺀 나머지다. */
export function keptPairs(scene: KeepNeighborsCloseScene): number[] {
  const out: number[] = [];
  for (let k = 0; k < scene.points.length; k += 1) {
    if (k !== scene.cutAt) out.push(k);
  }
  return out;
}

/** 찢어진 쌍 — 고리에서의 거리, 줄에서의 거리, 그리고 그 배수. */
export function tornGap(scene: KeepNeighborsCloseScene): {
  before: number;
  after: number;
  ratio: number;
} {
  const before = ringGaps(scene)[scene.cutAt] ?? 0;
  const after = gapOf(scene, scene.cutAt);
  return { before, after, ratio: before === 0 ? 0 : after / before };
}

/** 마주 보는 쌍 — 원래 거리와 편 뒤의 거리. */
export function farGap(scene: KeepNeighborsCloseScene): { before: number; after: number } {
  const [a, b] = scene.farPair;
  const pa = scene.points[a];
  const pb = scene.points[b];
  const before = pa === undefined || pb === undefined ? 0 : Math.hypot(pa.x - pb.x, pa.y - pb.y);
  const line = scene.line;
  if (line === null) return { before, after: before };
  const la = line[a];
  const lb = line[b];
  return { before, after: la === undefined || lb === undefined ? 0 : Math.abs(lb - la) };
}

/**
 * 지금 화면이 선 국면.
 *
 * `step` 이 아니라 **자취**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 한다. 그리고 정적 그리기가 `step` 을 읽지 않게 하는 것이 되짚기의 어긋남을
 * 구조적으로 없애는 자리다 (S-scene).
 */
export function phaseOf(scene: KeepNeighborsCloseScene): KeepNeighborsClosePhase {
  if (scene.finished) return { kind: 'done' };
  if (scene.farMarked) {
    const [a, b] = scene.farPair;
    const { before, after } = farGap(scene);
    return { kind: 'far', a, b, before, after };
  }
  if (scene.tornMarked) return { kind: 'torn', ...tornGap(scene) };
  if (scene.keptMarked) {
    return { kind: 'kept', kept: keptPairs(scene).length, total: scene.points.length };
  }
  if (scene.line !== null) return { kind: 'unroll' };
  if (scene.cut) return { kind: 'cut', a: scene.cutAt, b: nextOf(scene, scene.cutAt) };
  if (scene.raised) {
    const gaps = ringGaps(scene);
    const mean = gaps.length === 0 ? 0 : gaps.reduce((s, v) => s + v, 0) / gaps.length;
    return { kind: 'ring', gap: mean };
  }
  return { kind: 'blank' };
}

export const keepNeighborsCloseScene: ScenePlan<KeepNeighborsCloseScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   *
   * 모양이 어긋나면 빈 바탕을 돌려주고 화면은 비어 있는다. 데이터의 옳고 그름을
   * 드러내는 자리는 algorithm 이다 — 거기서 던지면 러너가 보여 준다 (C6).
   */
  initial(initialData: unknown): KeepNeighborsCloseScene {
    const d = fields(initialData) ?? {};
    const points = readPoints(d.points);
    const n = points.length;
    const cutAt = n < 3 ? null : readIndex(d.cutAt, n);
    const farPair = n < 3 ? null : readPair(d.farPair, n);
    if (cutAt === null || farPair === null) {
      return atStart({ points: [], cutAt: 0, farPair: [0, 0] });
    }
    return atStart({ points, cutAt, farPair });
  },

  reduce(
    scene: KeepNeighborsCloseScene,
    event: FacetRuntimeEvent,
  ): KeepNeighborsCloseScene {
    const p = fields(event.payload);

    switch (event.type) {
      /* 고리가 선다. 이웃 거리는 바탕의 좌표에서 나오므로 실려 오는 것이 없다. */
      case 'ring':
        if (scene.raised || scene.points.length < 3) return scene;
        return { ...scene, raised: true, step: { kind: 'ring' } };

      /* 한 이음이 끊긴다. 어디를 끊을지는 선언의 `cutAt` 이라 싣지 않는다. */
      case 'cut':
        if (!scene.raised || scene.cut) return scene;
        return { ...scene, cut: true, step: { kind: 'cut' } };

      /*
       * 줄이 된다. **이 걸음만 값을 싣는다** — 이웃 간격을 그대로 쌓아 자리를 내는
       * 셈이 이 조각의 알고리즘 그 자체라 장면이 다시 풀지 않는다.
       */
      case 'unroll': {
        if (!scene.cut || scene.line !== null) return scene;
        const line = readLine(p?.positions, scene.points.length);
        if (line === null) return scene;
        return { ...scene, line, step: { kind: 'unroll' } };
      }

      /* 지켜진 쌍을 짚는다. 어느 쌍인지도 그 거리도 세면 나온다. */
      case 'kept':
        if (scene.line === null || scene.keptMarked) return scene;
        return { ...scene, keptMarked: true, step: { kind: 'kept' } };

      /* 찢어진 쌍을 짚는다. 두 거리와 배수는 같은 자취를 지난다. */
      case 'torn':
        if (!scene.keptMarked || scene.tornMarked) return scene;
        return { ...scene, tornMarked: true, step: { kind: 'torn' } };

      /* 마주 보는 쌍을 견준다. 쌍도 두 거리도 바탕과 자취에서 나온다. */
      case 'far':
        if (!scene.tornMarked || scene.farMarked) return scene;
        return { ...scene, farMarked: true, step: { kind: 'far' } };

      /* 마침. */
      case 'done':
        if (scene.finished) return scene;
        return { ...scene, finished: true, step: { kind: 'finish' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, cutAt: scene.cutAt, farPair: scene.farPair });

      default:
        // 이 algorithm 이 발신하는 것은 위 여덟이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
