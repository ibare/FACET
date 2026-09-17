/**
 * KMustBeGiven 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 158 줄인데 `let` 이 한 자리도 없고 조회로 갈리는 분기도 없었다.
 * **숨은 상태는 전부 stage 에 있었고, 그중 둘은 어떤 grep 에도 걸리지 않는 모양이었다.**
 *
 * - `const logged: LoggedRun[]` — **k 마다의 답을 통째로 쥔 배열**(⑤). `const` 라
 *   `let` grep 을 지나가는데 `logged.push(...)` 로 알맹이가 제자리에서 고쳐지고
 *   `logged.length = 0` 으로 비워졌다. 흩어짐 눈금의 점, 줄어든 폭의 계단, 곧은 선의
 *   양 끝, 마지막에 겹쳐 피는 테두리 셋이 **전부 이 배열 하나**에서 나왔다. 이 조각의
 *   결론이 여기 살고 있었다. 지금은 `settled` 가 그 자리다.
 * - `let scatterTop` — **연속 좌표의 척도.** 흩어짐 눈금의 모든 세로 자리가 `elbowY`
 *   를 지나고 그것이 이 변수를 읽었다. 첫 걸음이 실어 온 `scatterMax` 를 stage 가
 *   적어 두고 그 뒤로 계속 쓴 자리다 — 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다.
 *   지금은 담긴 흩어짐 값에서 `render` 가 매번 셈한다. 담는 것은 픽셀이 아니라
 *   **값의 범위**다 (S-piece).
 * - `let ringSeeds: number[]` — **화면의 거울**(함정 28). 고리가 어느 점에 씌워졌는지를
 *   따로 적어 두고 `settle` 이 `ringSeeds[j]` 로 도로 읽어 고리의 도착 자리를 셈했다.
 *   손잡이가 아니라 **수**를 담은 배열이라 ④ 의 grep 도 ② 의 grep 도 지나간다.
 *   지금은 `chosen[i].seeds` 가 자취에 있다.
 * - `rectOf(node)` — `node.getAttribute('x'/'y'/'width'/'height')` 로 **운동의 출발
 *   그림을 화면에서 되읽었다** (④, 네 건). `settle` 은 고리의 `cx`/`cy` 도 같은 식으로
 *   꺼냈다 (두 건 더). 되짚어 세운 직후에는 그것이 **옛 화면의 사각**이라 테두리가
 *   엉뚱한 데서 자란다. 지금은 앞 k 의 답이 자취에 있으므로 출발 사각을 셈으로 얻는다.
 * - `hulls.length === 0` 과 `merged !== null` — **한 덩이 테두리가 지금 서 있나.**
 *   `chooseK` 의 갈래가 DOM 손잡이 배열의 **비었음** 하나로 갈렸다 (⑤). 지금은
 *   `chosen.length` 와 `settled.length` 를 견주면 나온다.
 * - `let dots` · `let hulls` · `let rings` · `let cursor` · `let captionNode` — DOM
 *   손잡이. 되돌리는 명령이 `rewind()` 뿐이라 걸음 밖에서는 알 길이 없었다.
 * - `type Scene = { points, ks }` — **이름이 부딪히던 자리**(함정 21). 장면이 아니라
 *   선언을 좁힌 것이었다. 좁히개가 여기 `initial` 로 옮겨 오며 통째로 없어졌다.
 *
 * ── 셈하는 것과 판정하는 것 (프로토콜 4 절 B 갈래)
 *
 * **무리를 나누고 중심을 옮기고 흩어짐을 재는 셈은 이 조각의 알고리즘 그 자체라
 * 내주지 않는다.** 장면이 그것을 다시 풀면 조각이 피하려는 셈을 장면이 하게 된다.
 * 그래서 셋만 싣는다.
 *
 * - `k-chosen` 의 `seeds` — 가장 먼 점부터 고르는 시작 중심. 거리 셈이다.
 * - `split-settled` 의 `assign` — 어느 점이 어느 무리에 들었나. Lloyd 가 멎은 자리다.
 * - `split-settled` 의 `centers` — 중심이 옮겨 가 멎은 자리. 중심 이동이 그 셈이다.
 * - `split-settled` 의 `scatter` — 흩어짐 합. **이 조각이 재는 바로 그 값**이다.
 *
 * 나머지는 전부 걷어냈다. **몇 번째 k 인가**는 답이 하나씩 쌓이므로 `settled.length`
 * 가 그 번호이고 그 k 값은 선언의 `ks` 가 말한다. **무리 크기**는 `assign` 을 세면
 * 나오고, **줄어든 폭**은 담긴 흩어짐 둘의 뺄셈이며, **눈금의 꼭대기**는 담긴 흩어짐의
 * 최댓값이다.
 *
 * ── 꺾임이 없다는 결론이 그림의 막대와 같은 자료에서 나온다 (함정 34)
 *
 * 옛 화면은 줄어든 폭을 **두 출처**로 그렸다. 계단의 높이는 `logged[i].scatter` 에서
 * 나오고 곁에 적히는 수는 `elbow-tested` 가 실어 온 `drops[i]` 에서 나왔다. 둘이
 * 같은 뺄셈이라 지금은 맞지만, 한쪽만 바뀌면 **계단의 높이와 적힌 수가 갈린다** —
 * 조각의 결론("뒤가 오히려 더 크다")이 그림과 다른 자료를 쓰는 자리였다.
 *
 * 지금은 `dropsOf` 하나가 그 뺄셈을 맡는다. 계단의 높이도, 곁의 수도, 곧은 선의 양
 * 끝도, 캡션이 말하는 두 수도 전부 `settled` 의 `scatter` 열 하나를 지난다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 무리의 소속이라는 **구조**만 담고 화면 자리는
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * `captionOf` 가 무엇을 말할지와 그 인자만 내놓고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 점 하나. 값이지 자리가 아니다 — 화면 자리는 그리는 쪽이 역산한다. */
export type ScenePoint = { x: number; y: number };

/** 한 k 가 시작 중심으로 고른 점들. 고른 차례대로. */
export type ChosenRun = { seeds: readonly number[] };

/**
 * 한 k 가 남긴 답. **넷 다 판정이라 걸음이 싣는다.**
 *
 * 옛 stage 의 `LoggedRun` 이 이 자리였다 — 다만 그쪽은 `k` 와 `slots`(색 자리)까지
 * 쥐고 있었다. 앞의 것은 `ks` 가 말하고 뒤의 것은 색을 고르는 일이라 그리는 쪽의
 * 몫이다.
 */
export type SettledRun = {
  /** assign[i] = i 번 점이 든 무리 번호. 무리 번호는 중심의 자리 순이다. */
  assign: readonly number[];
  /** 무리마다의 중심. 차례가 곧 무리 번호다. */
  centers: readonly ScenePoint[];
  /** 각 점에서 제 중심까지 거리의 제곱을 다 더한 값. */
  scatter: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 테두리가 어느 사각에서 자라 오는지도, 고리가 어느
 * 점에서 떠나는지도 자취 한 칸을 물려 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type KStep =
  /** 점 열둘이 한 덩이로 돋는다. */
  | { kind: 'cloud' }
  /** 앞 답의 테두리가 한 덩이로 되돌아오고 시작 중심에 고리가 씌워진다. */
  | { kind: 'choose' }
  /** 한 덩이가 k 조각으로 찢어지고 답이 줄에 적히고 흩어짐이 눈금에 찍힌다. */
  | { kind: 'split' }
  /** 흩어짐이 줄어든 폭을 계단으로 잰다. */
  | { kind: 'drops' }
  /** 첫 점과 끝 점을 잇는 곧은 선을 긋는다 — 가운데가 그 선 위에 있다. */
  | { kind: 'chord' }
  /** 세 답의 테두리가 함께 피어 한 화면에 남는다. */
  | { kind: 'bloom' };

export type KMustBeGivenScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 점 열둘. 자료는 끝까지 그대로고 바뀌는 것은 나눔뿐이다. */
  points: readonly ScenePoint[];
  /** 차례로 돌려 볼 군집 수. 줄의 수와 눈금의 칸 수가 여기서 나온다. */
  ks: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점을 놓았나. 놓기 전에는 화면에 아무것도 없다. */
  placed: boolean;
  /** k 마다 고른 시작 중심, 고른 차례대로. 길이가 곧 몇 번째 k 를 묻고 있나다. */
  chosen: readonly ChosenRun[];
  /**
   * k 마다 나온 답, 나온 차례대로. **남는 자취**다.
   *
   * 옛 화면의 `logged` 가 이 자리다. 눈금의 점, 계단의 높이, 곧은 선, 마지막에 겹쳐
   * 피는 테두리 셋이 전부 여기서 나온다 — **먼저 나온 답을 지우지 않는다.**
   */
  settled: readonly SettledRun[];
  /** 줄어든 폭을 재었나. 계단이 남는다. */
  measured: boolean;
  /** 곧은 선을 그었나. 꺾임이 없다는 표식이 남는다. */
  chorded: boolean;
  /** 세 답을 겹쳐 남겼나. 이 조각의 맺음 화면이다. */
  overlaid: boolean;

  step: KStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `placed` 아래 여섯은 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 갈린 테두리와 쌓인 줄을 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<KMustBeGivenScene, 'points' | 'ks'>;

/**
 * 되돌린 뒤의 장면 — 빈 화면이다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): KMustBeGivenScene {
  return {
    points: base.points,
    ks: base.ks,
    placed: false,
    chosen: [],
    settled: [],
    measured: false,
    chorded: false,
    overlaid: false,
    step: null,
  };
}

// ── 선언 좁히기 ─────────────────────────────────────────────────────────────
//
// 좁히는 자리는 여기 하나다. **새 배열에 새 객체를 담아 돌려준다** — 러너가 주는
// 것은 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 고쳐진
// 자료로 바탕을 그린다 (S-scene MUST).

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `[x, y]` 쌍의 열 → 점의 열. */
function readPoints(raw: unknown): ScenePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenePoint[] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const x = num(pair[0]);
    const y = num(pair[1]);
    if (x === null || y === null) continue;
    out.push({ x, y });
  }
  return out;
}

function readKs(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    const k = num(value);
    if (k !== null && k >= 1) out.push(Math.floor(k));
  }
  return out;
}

/** 걸음이 실어 온 수의 열. 한 자리라도 수가 아니면 그 걸음을 흘린다. */
function readNumbers(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const value of raw) {
    const n = num(value);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

function readSpots(raw: unknown): ScenePoint[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ScenePoint[] = [];
  for (const item of raw) {
    const c = fields(item);
    const x = num(c?.x);
    const y = num(c?.y);
    if (x === null || y === null) return null;
    out.push({ x, y });
  }
  return out;
}

// ── 파생. 화면에 뜨는 수는 전부 여기를 지난다 ───────────────────────────────

/** 몇 번째 k 를 묻고 있나. 아직 아무것도 안 물었으면 -1. */
export function activeSlot(scene: KMustBeGivenScene): number {
  return scene.chosen.length - 1;
}

/** 슬롯 i 가 묻는 k. 선언의 `ks` 가 그 값을 말하므로 걸음이 싣지 않는다. */
export function kAt(scene: KMustBeGivenScene, slot: number): number {
  return scene.ks[slot] ?? 0;
}

/** 슬롯 i 의 답. 아직 안 나왔으면 null. */
export function settledAt(scene: KMustBeGivenScene, slot: number): SettledRun | null {
  if (slot < 0) return null;
  return scene.settled[slot] ?? null;
}

/**
 * 지금 화면을 차지한 답. 물었는데 아직 안 나왔거나 셋을 겹쳐 남긴 뒤면 null.
 *
 * 점의 칠, 지금 선 테두리, 고리의 크기가 전부 이 하나에서 갈린다.
 */
export function activeRun(scene: KMustBeGivenScene): SettledRun | null {
  if (scene.overlaid) return null;
  return settledAt(scene, activeSlot(scene));
}

/** 무리 j 에 든 점의 번호들, 자료에 적힌 차례대로. */
export function membersOf(assign: readonly number[], group: number): number[] {
  const out: number[] = [];
  assign.forEach((g, i) => {
    if (g === group) out.push(i);
  });
  return out;
}

/**
 * 무리마다의 크기. **`assign` 을 세면 나오므로 걸음이 싣지 않는다.**
 *
 * 줄 위의 배지에 적히는 수도 캡션이 말하는 수도 이 하나를 지난다 — 칸의 칠을 정하는
 * 바로 그 배열에서 나오므로 배지가 다른 수를 말할 수 없다 (함정 34).
 */
export function sizesOf(run: SettledRun): number[] {
  const sizes = run.centers.map(() => 0);
  for (const g of run.assign) if (g >= 0 && g < sizes.length) sizes[g] += 1;
  return sizes;
}

/** 답이 나온 차례대로의 흩어짐 합. 눈금의 모든 수가 여기서 나온다. */
export function scattersOf(scene: KMustBeGivenScene): number[] {
  return scene.settled.map((run) => run.scatter);
}

/**
 * 흩어짐 눈금의 꼭대기.
 *
 * **담긴 값에서 셈한다** — 걸음이 실어 오던 `scatterMax` 가 없어진 자리다. 흩어짐은
 * k 가 커질수록 줄어들므로 첫 답이 들어온 순간 꼭대기가 정해지고 그 뒤로 바뀌지
 * 않는다. 점이 하나도 없을 때는 눈금을 쓰는 자리가 없으므로 1 로 둔다.
 */
export function scatterTopOf(scene: KMustBeGivenScene): number {
  let top = 0;
  for (const value of scattersOf(scene)) top = Math.max(top, value);
  return top > 0 ? top : 1;
}

/**
 * 이웃한 k 사이에서 흩어짐이 줄어든 폭.
 *
 * 계단의 높이와 곁에 적히는 수가 **한 함수**를 지난다. 옛 화면은 앞의 것을
 * `logged[i].scatter` 에서 뒤의 것을 발신의 `drops[i]` 에서 얻어 출처가 둘이었다.
 */
export function dropsOf(scene: KMustBeGivenScene): number[] {
  const scatters = scattersOf(scene);
  const out: number[] = [];
  for (let i = 1; i < scatters.length; i += 1) out.push(scatters[i - 1] - scatters[i]);
  return out;
}

/** 캡션이 말할 것. 문자가 아니라 **무엇을 말할지**와 그 인자다 (C10). */
export type KCaption =
  | { kind: 'none' }
  | { kind: 'cloud' }
  | { kind: 'chosen'; k: number }
  | { kind: 'split'; k: number; sizes: readonly number[] }
  | { kind: 'drops'; drops: readonly number[] }
  | { kind: 'noKink' }
  | { kind: 'allAlive' };

/**
 * 자취에서 곧바로 나온다 — `step` 을 읽지 않는다.
 *
 * 장면에 캡션 필드를 두지 않는다. 물은 k 의 수와 나온 답의 수, 그리고 뒤의 깃발 셋이
 * 걸음의 갈래와 1 대 1 이므로 따로 실으면 같은 것을 두 번 말하는 꼴이 된다.
 * 정적 그리기가 `step` 을 들추지 않는 것은 규율로만 지킬 수 있는 자리다 (S-scene).
 */
export function captionOf(scene: KMustBeGivenScene): KCaption {
  if (!scene.placed) return { kind: 'none' };
  if (scene.overlaid) return { kind: 'allAlive' };
  if (scene.chorded) return { kind: 'noKink' };
  if (scene.measured) return { kind: 'drops', drops: dropsOf(scene) };
  const slot = activeSlot(scene);
  if (slot < 0) return { kind: 'cloud' };
  const run = settledAt(scene, slot);
  if (run === null) return { kind: 'chosen', k: kAt(scene, slot) };
  return { kind: 'split', k: kAt(scene, slot), sizes: sizesOf(run) };
}

export const kMustBeGivenScene: ScenePlan<KMustBeGivenScene> = {
  /**
   * 첫 장면은 비어 있다 — 점조차 아직 놓이지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 좁히개가
   * **새 배열에 새 객체**를 담아 돌려주므로 러너의 자료를 참조로 쥐지 않는다.
   */
  initial(initialData: unknown): KMustBeGivenScene {
    const d = fields(initialData) ?? {};
    return atStart({ points: readPoints(d.points), ks: readKs(d.ks) });
  },

  reduce(scene: KMustBeGivenScene, event: FacetRuntimeEvent): KMustBeGivenScene {
    const p = fields(event.payload);

    switch (event.type) {
      /* 점 열둘이 한 덩이로 돋는다. 아직 아무것도 자르지 않았다. */
      case 'points-placed':
        return { ...scene, placed: true, step: { kind: 'cloud' } };

      /*
       * 다음 k 를 묻는다. 시작 중심은 가장 먼 점부터 고른 것이라 거리 셈이고,
       * 그래서 걸음이 싣는다. k 값 자체는 선언의 `ks` 가 말하므로 싣지 않는다.
       */
      case 'k-chosen': {
        const seeds = readNumbers(p?.seeds);
        if (seeds === null) return scene;
        if (scene.chosen.length >= scene.ks.length) return scene;
        return { ...scene, chosen: [...scene.chosen, { seeds }], step: { kind: 'choose' } };
      }

      /*
       * 무리가 갈려 자리를 잡았다. 셋 다 판정이다 — 소속과 중심은 Lloyd 가 멎은
       * 자리이고 흩어짐은 이 조각이 재는 바로 그 값이다. 무리 크기는 `assign` 을
       * 세면 나오므로 싣지 않는다.
       */
      case 'split-settled': {
        const assign = readNumbers(p?.assign);
        const centers = readSpots(p?.centers);
        const scatter = num(p?.scatter);
        if (assign === null || centers === null || scatter === null) return scene;
        if (scene.settled.length >= scene.chosen.length) return scene;
        return {
          ...scene,
          settled: [...scene.settled, { assign, centers, scatter }],
          step: { kind: 'split' },
        };
      }

      /* 줄어든 폭을 잰다. 그 폭은 담긴 흩어짐 둘의 뺄셈이라 실을 것이 없다. */
      case 'elbow-tested':
        return { ...scene, measured: true, step: { kind: 'drops' } };

      /* 꺾임이 없다는 판정. 곧은 선이 그것을 화면에 세운다. */
      case 'no-kink':
        return { ...scene, chorded: true, step: { kind: 'chord' } };

      /* 세 답을 한 화면에 겹쳐 남긴다. 이 조각의 맺음이다. */
      case 'all-alive':
        return { ...scene, overlaid: true, step: { kind: 'bloom' } };

      /*
       * 한 바퀴가 끝났다. `silent` 로 오므로 **앞 걸음의 장면을 갈아 끼운다** —
       * 걸음을 늘리지 않고 겹침 걸음의 운동만 내려놓는다. `step` 을 비우지 않으면
       * 러너가 같은 장면을 다시 그릴 때 그 운동이 한 번 더 돈다.
       */
      case 'done':
        return { ...scene, step: null };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, ks: scene.ks });

      default:
        // 이 algorithm 이 발신하는 것은 위 여덟이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
