/**
 * noiseLeftOut 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도 없었다.
 * **상태는 전부 stage 에 있었고, 그중 여럿은 변수가 아니라 화면 자신이었다.**
 *
 * - `let dots` · `discs` · `countTags` · `centroids` — DOM 손잡이 배열이지만
 *   **알맹이는 손잡이가 아니라 그 요소의 속성**이었다. 점의 `fill` 이 "어느 무리에
 *   들었나", `r`/`stroke-width` 가 "속이냐", 원반의 `stroke-dasharray` 가 "문턱을
 *   못 넘었다", 원반의 유무가 "지금 어느 방법을 걸고 있나" 였다.
 * - **`ghosts = new Map<number, SVGCircleElement>()`** — `Map` 은 값만이 아니라
 *   **자리가 있느냐**도 상태다. 여기서는 자리 유무가 곧 "밀도가 이 점을 남겼다"
 *   였고, 그 뒤 `r` 을 0 으로 접는 것이 "가까운 쪽이 데려갔다" 였다. 한 요소에
 *   두 방법의 답이 겹쳐 실려 **뒤엣것이 앞엣것을 지웠다.**
 * - **`rowValues = new Map<number, SVGTextElement>()`** — 선반 줄의 값 글자.
 *   `nbrs {n}`(밀도가 남긴 까닭) 이 `reach {d}`(가까운 쪽이 뻗은 거리) 로 **갈아
 *   끼워졌다.** 같은 자리에 두 답을 실은 두 번째 자리다.
 * - `rowGroups` 의 `opacity` 0.55 — 그 줄이 처리되었나.
 * - **`letters = new Map<number, string>()`** — 남은 점의 표식(a·b·c·d). 넣는 순서가
 *   곧 표식이라 **`Map` 의 삽입 순서가 상태**였다. 지금은 남은 점 열의 자리에서
 *   셈한다 (`letterOf`).
 * - `let liveBar` — 자 위의 지난 막대. 걷는 것이 옳았으나(막대가 쌓이면 길이를 못
 *   읽는다) **눈금 표식은 걷지 않아 쌓였다** — 그것이 네 뻗음을 한눈에 견주게 하는
 *   정보였다. 장면이 `claims` 로 쥐고 정적 그리기가 넷을 다 세운다 (함정 8).
 * - `let tabMark` · `tabTexts` — 활성 표시의 가로 자리와 글자 칠이 "어느 방법을 걸고
 *   있나" 를 쥐었다. 지금은 `begun` 하나가 말한다.
 * - `let countText` — 선반 머리의 수. DASH → 남은 수 → 남은 수에서 하나씩 줄어드는
 *   값으로 **세 뜻이 한 글자에 실렸다.**
 * - **`layers.edge.children`** — 번짐이 어디까지 이었나가 `<g>` 의 자식으로만 있었다
 *   (`Array.from(layers.edge.children)` 로 도로 읽어 흐리게 만들었다). 지금은
 *   `waves` 다.
 * - **`grow()` 의 `line.getAttribute('x1'/'y1'/'x2'/'y2')`** — 운동의 출발 그림을
 *   **화면에서 되읽었다** (함정 28). 되짚어 세운 직후에는 그것이 옛 화면의 선이라
 *   엉뚱한 데서 자란다. 지금은 두 점의 값에서 셈한다.
 * - **척도(`unit` · `originX` · `originY`)** — `mount` 이 한 번 셈해 클로저에 적어
 *   두고 화면의 모든 자리가 `sx`/`sy` 를 지났다. `const` 라 어느 grep 에도 안 걸린다.
 *   지금은 바탕의 점과 eps 에서 그리는 쪽이 **매번** 셈한다 — 장면이 담는 것은
 *   픽셀이 아니라 **값**이다 (S-piece).
 *
 * ── 수는 한 출처에서만 나온다 (프로토콜 4 절의 잣대 표)
 *
 * 옛 발신은 payload 를 열한 줄에 실어 왔다. 그 대부분이 **바탕과 자취에서 곧바로
 * 나오는 수**다.
 *
 * - **점의 개수 · eps · minPts · 시작 중심** — 선언에 있다. `initial` 이 값을 베낀다.
 * - **속과 성김** — `counts[i] >= minPts` 라는 문턱 견줌 하나다. 문턱은 선언에 있고
 *   이웃 수는 이미 자취에 있으므로 다시 실으면 **같은 물음에 답이 둘**이 된다.
 * - **무리 번호 · 무리 크기 · 가장자리 · 남겨진 것** — `waves` 를 접으면 나온다
 *   (`labelsOf`). 물결은 올 때마다 하나씩 쌓이므로 몇 번째 무리인가도 거기서 센다.
 * - **표식(a·b·c) · 몇 번째 남은 점인가 · 아직 남은 수** — `claims` 의 길이와 남은
 *   점 열의 자리에서 나온다.
 * - **뻗은 거리 · eps 의 몇 배** — 남은 점과 그 닻의 **좌표에서** 셈한다. 자 위의
 *   막대도 같은 두 점에서 길이를 얻으므로 **글자와 그림이 한 자료를 쓴다** (함정 34).
 *
 * 남긴 것은 넷이다. 전부 **거리 셈이 내린 판정**이라 내주면 장면이 이 조각이
 * 피하려는 셈을 하게 된다 (프로토콜 4 절 B 갈래의 경계).
 *
 * - `radius-shown` 의 `counts` — 이웃 반지름 안에 든 점의 수. 거리 셈이다.
 * - `spread-advanced` 의 `edges` — 어느 속에서 어느 점으로 번졌나. 이웃 그래프다.
 * - `centroids-settled` 의 `centroids` · `rounds` — 중심이 수렴한 자리와 횟수.
 * - `stray-claimed` 의 `cluster` · `anchor` — 어느 무리이고 그 무리의 어느 점이 가장
 *   가까운가. `index` 는 그 걸음이 누구를 말하는지 가리키는 이름이다.
 *
 * ── 이 조각의 주장은 *견줌*이라 양쪽 답이 함께 서야 한다
 *
 * 밀도는 "어디에도 넣지 않는다" 고 답하고 가까운 쪽은 "아무리 멀어도 넣는다" 고
 * 답한다. 옛 화면은 뒤엣답이 앞엣답을 지웠다 — 남은 점의 점선 고리가 접히고, 선반
 * 줄의 이웃 수가 뻗은 거리로 갈아 끼워지고, 머리의 수가 하나씩 줄어 0 이 되었다.
 * 그래서 완주 화면에는 **가까운 쪽의 답만** 남았다.
 *
 * 지금은 어휘를 갈라 둘을 한 화면에 세운다. **채움은 형편**(어느 무리에 들었나),
 * **점선 고리는 표식**(밀도가 이것을 남겼다) 이므로 서로를 지우지 않는다. 자세한
 * 것은 stage 머리 주석에 적는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 eps 라는 **구조**만 담고 화면 자리는 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — `step` 과
 * 자취가 무엇을 말할지를 정하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 점 하나. 값이지 자리가 아니다 — 화면 자리는 그리는 쪽이 역산한다. */
export type ScenePoint = { x: number; y: number };

/** 번짐 한 물결. `[속, 새로 닿은 점]` 쌍의 열이다. */
export type Wave = readonly (readonly [number, number])[];

/**
 * 남았던 점 하나가 무리에 든 자취.
 *
 * 셋 다 거리 셈이 내린 판정이라 걸음이 싣는다. 뻗은 거리는 여기 담지 않는다 —
 * `index` 와 `anchor` 의 좌표에서 나오는 값이고, 자 위의 막대도 같은 두 점에서
 * 길이를 얻는다.
 */
export type ClaimMark = {
  /** 무리에 든 남은 점. */
  index: number;
  /** 어느 중심의 무리인가. */
  cluster: number;
  /** 그 무리에서 가장 가까운 점. 뻗음의 출발이다. */
  anchor: number;
};

/** 중심이 수렴한 자리와 배정을 다시 매긴 횟수. 수렴 셈은 내주지 않는다. */
export type Settled = { centroids: readonly ScenePoint[]; rounds: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 원반이 어느 크기에서 접히는지도, 중심이 어느
 * 자리에서 미끄러지는지도, 선이 어디서 자라는지도 전부 바탕과 자취에서 셈하므로
 * `prev` 를 들출 일이 없다 (S-scene).
 */
export type NoiseStep =
  /** 점 열여섯을 놓는다. */
  | { kind: 'place' }
  /** 점마다 이웃 반지름을 펴고 그 안에 든 수를 적는다. 아래 자도 함께 깔린다. */
  | { kind: 'radius' }
  /** 문턱을 넘은 점과 못 넘은 점을 가른다. */
  | { kind: 'cores' }
  /** 번짐이 한 물결 나아간다. */
  | { kind: 'spread' }
  /** 번짐이 멎는다. 멎은 자리가 가장자리다. */
  | { kind: 'halt' }
  /** 어느 번짐도 닿지 않은 점들을 선반에 적는다. */
  | { kind: 'list' }
  /** 두 번째 방법을 건다. 시작 중심이 들어선다. */
  | { kind: 'begin' }
  /** 중심이 자리를 잡는다. */
  | { kind: 'settle' }
  /** 남았던 점 하나가 무리에 든다. */
  | { kind: 'claim' }
  /** 두 방법이 각각 남긴 수를 나란히 놓는다. */
  | { kind: 'close' };

export type NoiseLeftOutScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 점 전부. 값을 베껴 담는다 — 러너가 주는 객체를 참조로 쥐지 않는다 (S-scene). */
  points: readonly ScenePoint[];
  /** 이웃이라 부를 거리. 자의 도막이고 견줌의 기준이다. */
  eps: number;
  /** 속이 되는 문턱. 자기 자신을 셈에 넣는다. */
  minPts: number;
  /** 가까운 쪽에 붙이기의 시작 중심. 중심이 미끄러지는 운동의 출발이다. */
  seeds: readonly ScenePoint[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점을 놓았나. */
  placed: boolean;
  /** 점마다의 이웃 수. 빈 열이면 아직 반지름을 안 펼쳤다. */
  counts: readonly number[];
  /** 속과 성김을 가르는 것을 보였나. 문턱 견줌 자체는 `counts` 와 `minPts` 가 한다. */
  cored: boolean;
  /**
   * 번짐의 물결들, 온 차례대로.
   *
   * **남는 자취**다 — 무리 번호 · 무리 크기 · 가장자리 · 남겨진 것이 전부 여기서
   * 나온다 (`labelsOf`). 옛 stage 는 그것을 `<g>` 의 자식과 점의 `fill` 에만 적어
   * 두었다.
   */
  waves: readonly Wave[];
  /** 번짐이 멎었나. 가장자리 표식은 이 뒤로 남는다. */
  halted: boolean;
  /** 남겨진 것을 선반에 적었나. */
  listed: boolean;
  /** 두 번째 방법을 걸었나. 원반이 걷히고 중심이 들어선 뒤다. */
  begun: boolean;
  /** 중심이 수렴한 자리. 아직 안 잡았으면 null 이라 시작 중심에 서 있다. */
  settled: Settled | null;
  /** 무리에 든 남은 점들, 든 차례대로. 거리 오름차순으로 온다. */
  claims: readonly ClaimMark[];
  /** 두 답을 나란히 놓았나. */
  closed: boolean;

  step: NoiseStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `placed` 부터 `closed` 까지는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 번진 무리와 수렴한 중심을 단 채로 서고 그 위에 algorithm 이
 * 처음부터 다시 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<NoiseLeftOutScene, 'points' | 'eps' | 'minPts' | 'seeds'>;

/**
 * 되돌린 뒤의 장면 — 아무것도 서 있지 않다. 첫 걸음이 점을 놓는다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): NoiseLeftOutScene {
  return {
    points: base.points,
    eps: base.eps,
    minPts: base.minPts,
    seeds: base.seeds,
    placed: false,
    counts: [],
    cored: false,
    waves: [],
    halted: false,
    listed: false,
    begun: false,
    settled: null,
    claims: [],
    closed: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function readPoints(raw: unknown): ScenePoint[] {
  const out: ScenePoint[] = [];
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const p = fields(item);
    if (p === null) continue;
    const x = num(p.x);
    const y = num(p.y);
    if (x === null || y === null) continue;
    out.push({ x, y });
  }
  return out;
}

function readWave(raw: unknown): Wave | null {
  if (!Array.isArray(raw)) return null;
  const out: [number, number][] = [];
  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const a = num(item[0]);
    const b = num(item[1]);
    if (a === null || b === null) continue;
    out.push([a, b]);
  }
  return out.length > 0 ? out : null;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 점의 칠도 선반의 수도 자의 막대도 캡션의
// 수도 같은 함수를 부르므로 갈릴 자리가 없다.

/** 이 점이 문턱을 넘었나. 이웃 수와 문턱의 견줌 하나다. */
export function isCore(scene: NoiseLeftOutScene, index: number): boolean {
  const n = scene.counts[index];
  return n !== undefined && n >= scene.minPts;
}

/** 문턱을 넘은 점들. */
export function coreIndices(scene: NoiseLeftOutScene): number[] {
  return scene.points.map((_, i) => i).filter((i) => isCore(scene, i));
}

/** 문턱을 못 넘은 점들. */
export function sparseIndices(scene: NoiseLeftOutScene): number[] {
  return scene.points.map((_, i) => i).filter((i) => !isCore(scene, i));
}

/**
 * 물결 `upTo` 개까지만 접었을 때 점마다의 무리 번호. 아직 닿지 않았으면 -1.
 *
 * 무리 번호도 여기서 센다 — 물결은 무리 차례대로 오고 새 무리의 첫 물결은 아직
 * 번호 없는 속에서 출발하므로, 그때 번호 하나를 새로 떼면 algorithm 의 셈과 같다.
 *
 * 물결이 하나도 없는 무리(이웃이 전부 남의 가장자리인 외딴 속)는 자취에 자국을
 * 남기지 않는다. 그래서 접기를 마친 뒤 **번호 없는 속**을 홀로 선 무리로 센다 —
 * 속은 반드시 어딘가에 들기 때문이다. 남겨진 것에 속이 섞이지 않는 것이 이 한
 * 줄이 지키는 바다.
 */
export function labelsUpTo(scene: NoiseLeftOutScene, upTo: number): number[] {
  const labels = scene.points.map(() => -1);
  let nextCluster = 0;
  for (const wave of scene.waves.slice(0, Math.max(0, upTo))) {
    for (const [a, b] of wave) {
      if (labels[a] === undefined || labels[b] === undefined) continue;
      if (labels[a] === -1) {
        labels[a] = nextCluster;
        nextCluster += 1;
      }
      labels[b] = labels[a];
    }
  }
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === -1 && isCore(scene, i)) {
      labels[i] = nextCluster;
      nextCluster += 1;
    }
  }
  return labels;
}

/** 점마다의 무리 번호, 지금까지 온 물결 전부를 접은 것. */
export function labelsOf(scene: NoiseLeftOutScene): number[] {
  return labelsUpTo(scene, scene.waves.length);
}

/** 지금까지 드러난 무리의 수. */
export function clusterCount(scene: NoiseLeftOutScene): number {
  const labels = labelsOf(scene);
  return labels.reduce((n, label) => Math.max(n, label + 1), 0);
}

/** 무리마다 몇 점이 들었나. 구조에서 세지는 것이라 장면이 센다. */
export function clusterSizes(scene: NoiseLeftOutScene): number[] {
  const labels = labelsOf(scene);
  const sizes = new Array<number>(clusterCount(scene)).fill(0);
  for (const label of labels) if (label >= 0) sizes[label] += 1;
  return sizes;
}

/**
 * 가장자리 — 무리에 들었으나 스스로는 번지지 못한 점.
 *
 * 번짐이 여기서 멎은 까닭이 곧 이것이다. 이웃 수가 문턱에 모자라 다음 물결을
 * 잇지 못했고, 그 모자란 수는 점 곁에 적힌 이웃 수가 말한다.
 */
export function borderRows(scene: NoiseLeftOutScene): { index: number; cluster: number }[] {
  const labels = labelsOf(scene);
  const out: { index: number; cluster: number }[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    if (label >= 0 && !isCore(scene, i)) out.push({ index: i, cluster: label });
  }
  return out;
}

/**
 * 어느 번짐도 닿지 않은 점들, 인덱스 오름차순.
 *
 * 번짐이 멎은 뒤에만 뜻이 있다 — 그 전에는 "아직 안 닿았다" 와 "끝내 안 닿는다"
 * 가 갈리지 않는다. 그래서 부르는 자리를 `listed` 뒤로 둔다.
 */
export function leftOutOf(scene: NoiseLeftOutScene): number[] {
  const labels = labelsOf(scene);
  return scene.points.map((_, i) => i).filter((i) => labels[i] === -1);
}

/**
 * 남은 점의 표식 (a · b · c …). 남은 점 열의 자리가 곧 표식이다.
 *
 * 옛 stage 는 `Map` 에 넣는 순서로 이것을 쥐고 있었다 — 값이 아니라 **삽입 순서**가
 * 상태였다.
 */
export function letterOf(scene: NoiseLeftOutScene, index: number): string {
  const at = leftOutOf(scene).indexOf(index);
  return at < 0 ? '' : String.fromCharCode(97 + at);
}

/** 그 점이 무리에 들었나. 들었으면 어느 무리인지, 아니면 null. */
export function claimOf(scene: NoiseLeftOutScene, index: number): ClaimMark | null {
  return scene.claims.find((claim) => claim.index === index) ?? null;
}

/**
 * 뻗은 거리 — 남은 점과 그 닻 사이. **좌표에서 셈한다.**
 *
 * 자 위의 막대도 같은 두 점에서 길이를 얻으므로, 글자로 적히는 수와 그림으로
 * 그려지는 길이가 한 자료에서 나온다 (함정 34).
 */
export function reachOf(scene: NoiseLeftOutScene, claim: ClaimMark): number {
  const from = scene.points[claim.anchor];
  const to = scene.points[claim.index];
  if (from === undefined || to === undefined) return 0;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** 그 뻗음이 eps 의 몇 배인가. 이웃이라 부르는 거리와 실제로 뻗은 거리의 견줌이다. */
export function ratioOf(scene: NoiseLeftOutScene, claim: ClaimMark): number {
  return scene.eps > 0 ? reachOf(scene, claim) / scene.eps : 0;
}

/**
 * 아직 어느 무리에도 안 든 남은 점의 수.
 *
 * **가까운 쪽에 붙이기가 남기는 수**다. 이 방법에는 남기는 길이 없으므로 끝에서
 * 0 이 되는데, 그 0 이 상수로 박힌 것이 아니라 선반에 적힌 줄과 무리에 든 자취의
 * 차이라는 것이 이 조각의 결론이다 (함정 34).
 */
export function remainingOf(scene: NoiseLeftOutScene): number {
  return Math.max(0, leftOutOf(scene).length - scene.claims.length);
}

/** 중심이 지금 서 있는 자리. 수렴하기 전에는 선언의 시작 중심이다. */
export function centroidsNow(scene: NoiseLeftOutScene): readonly ScenePoint[] {
  return scene.settled?.centroids ?? scene.seeds;
}

export const noiseLeftOutScene: ScenePlan<NoiseLeftOutScene> = {
  /**
   * 첫 장면은 비어 있다. 첫 걸음이 점을 놓는다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): NoiseLeftOutScene {
    const d = fields(initialData) ?? {};
    const eps = num(d.eps);
    const minPts = num(d.minPts);
    return atStart({
      points: readPoints(d.points),
      eps: eps !== null && eps > 0 ? eps : 1,
      minPts: minPts !== null && minPts > 0 ? Math.round(minPts) : 1,
      seeds: readPoints(d.seeds),
    });
  },

  reduce(scene: NoiseLeftOutScene, event: FacetRuntimeEvent): NoiseLeftOutScene {
    const p = fields(event.payload);

    switch (event.type) {
      /* 점이 놓인다. 몇 개인가는 바탕이 말한다. */
      case 'points-placed':
        return { ...scene, placed: true, step: { kind: 'place' } };

      /*
       * 이웃 반지름이 펴진다. 그 안에 든 수는 거리 셈이라 걸음이 싣는다 — 장면이
       * 다시 풀면 조각이 피하려는 셈을 장면이 하게 된다.
       */
      case 'radius-shown': {
        if (!Array.isArray(p?.counts)) return scene;
        const counts: number[] = [];
        for (const raw of p.counts) {
          const n = num(raw);
          counts.push(n === null ? 0 : n);
        }
        return { ...scene, counts, step: { kind: 'radius' } };
      }

      /*
       * 속과 성김이 갈린다. 어느 쪽인지는 여기서 싣지 않는다 — 이웃 수도 문턱도
       * 이미 장면에 있으므로, 다시 실으면 같은 물음에 답이 둘이 된다.
       */
      case 'cores-marked':
        return { ...scene, cored: true, step: { kind: 'cores' } };

      /*
       * 번짐이 한 물결 나아간다. 어느 속에서 어느 점으로 이었는지는 이웃 그래프라
       * 걸음이 싣고, 몇 번째 무리인가는 물결이 쌓이는 차례에서 나온다.
       */
      case 'spread-advanced': {
        const wave = readWave(p?.edges);
        if (wave === null) return scene;
        return { ...scene, waves: [...scene.waves, wave], step: { kind: 'spread' } };
      }

      /* 번짐이 멎는다. 무리 크기도 가장자리도 접어 둔 물결에서 나온다. */
      case 'spread-halted':
        return { ...scene, halted: true, step: { kind: 'halt' } };

      /* 남겨진 것이 선반에 적힌다. 누가 남았는지는 물결이 닿지 않은 자리다. */
      case 'left-out-listed':
        return { ...scene, listed: true, step: { kind: 'list' } };

      /* 두 번째 방법을 건다. 시작 중심은 선언에 있다. */
      case 'nearest-begun':
        return { ...scene, begun: true, step: { kind: 'begin' } };

      /* 중심이 자리를 잡는다. 수렴 셈은 내주지 않는다. */
      case 'centroids-settled': {
        const centroids = readPoints(p?.centroids);
        const rounds = num(p?.rounds);
        if (centroids.length === 0 || rounds === null) return scene;
        return {
          ...scene,
          settled: { centroids, rounds: Math.round(rounds) },
          step: { kind: 'settle' },
        };
      }

      /*
       * 남았던 점 하나가 무리에 든다. 어느 무리이고 어느 점이 가장 가까운가는 거리
       * 셈이 내린 판정이라 싣는다. 뻗은 거리 · eps 의 몇 배 · 몇 번째인가 · 아직
       * 남은 수는 전부 이 셋과 바탕에서 나온다.
       */
      case 'stray-claimed': {
        const index = num(p?.index);
        const cluster = num(p?.cluster);
        const anchor = num(p?.anchor);
        if (index === null || cluster === null || anchor === null) return scene;
        if (scene.points[index] === undefined || scene.points[anchor] === undefined) return scene;
        if (scene.claims.some((claim) => claim.index === index)) return scene;
        return {
          ...scene,
          claims: [...scene.claims, { index, cluster, anchor }],
          step: { kind: 'claim' },
        };
      }

      /* 두 방법이 각각 남긴 수가 나란히 선다. 두 수 다 자취에서 나온다. */
      case 'done':
        return { ...scene, closed: true, step: { kind: 'close' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          points: scene.points,
          eps: scene.eps,
          minPts: scene.minPts,
          seeds: scene.seeds,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 열하나가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
