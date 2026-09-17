/**
 * impurityDrops 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회 분기도 DOM 되읽기도 0 건이었다.
 * 곧 **화면이 통째로 상태**였다는 뜻이고, 실제로 stage 의 타입 선언과 SVG 속성에
 * 흩어져 있었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `type Bar = { id, n, counts, gini, g, segs, segLabels, bounds, tick, label,
 *   outline, x, w, cy }` — **DOM 손잡이와 뜻·수치가 한 객체다.** 그중
 *   - `cy` 는 **DOM 의 거울**이었다. 갈라지는 운동의 출발 높이를 `existing.cy` 와
 *     `parent.cy` 에서 꺼냈으므로 (프로토콜 4 절 ④ 의 변종), 되짚어 세운 직후에는
 *     그것이 옛 화면의 높이라 막대가 엉뚱한 데서 떨어졌다. 지금은 **자취**가
 *     말한다 — `layers` 가 층마다의 통 목록을 쥐고 있어 바로 앞 층에서 셈한다.
 *   - `gini` · `n` 은 발신이 실어 온 수를 옮겨 적은 것이었다. 같은 막대의
 *     `counts` 에서 나오는 수라 **한 물음에 답이 둘**이었다.
 *   - `outline` 의 `stroke` — 이 통이 더 가를 것 없는 통인가. `'none'` 과
 *     `itemSorted` 두 값이 화면에만 있었다.
 * - `const bars = new Map<string, Bar>()` — **지금 자 위에 선 통이 무엇인가.**
 *   `let` 이 아니라 `const` 라 어느 grep 에도 안 걸린다.
 * - `let totalN` — 자의 전 폭을 몇으로 나눌 것인가. 걸음이 실어 온 통에서 stage 가
 *   적어 두고 그 뒤로 계속 썼다. 지금은 층의 개수 합이라 장면이 센다.
 * - `let levelBand` · `let ghostLine` — 띠와 유령선이 **서 있나**, 그리고 그 `y`.
 *   `markLevel` 이 `setAttribute('y', …)` 로 제자리에서 고쳤으므로 지금 층의 섞임은
 *   그 속성에만 있었다.
 * - `gCuts` · `gLevel` 의 **자식들** — 그은 가름선과 내려간 화살이 명령으로만 쌓였다.
 *
 * ── 이행이 화면을 고친 자리 — 앞 층의 섞임이 지워지고 있었다
 *
 * 이 조각의 주장은 **두 수의 견줌**이다 ("가른 뒤에 떨어진다"). 그런데 옛 화면은
 * 유령선을 걸음마다 `ghostLine.remove()` 로 지우고 새로 그렸다. 그래서 완주 화면에
 * 남는 것은 **직전 층 하나**뿐이었고 뿌리의 0.5 는 사라졌다 — 떨어진 폭이 캡션의
 * 글자로만 남고 그림에서는 읽히지 않았다 (프로토콜 4 절 "조각의 주장이 마지막
 * 화면에 안 남아 있는 수가 있다").
 *
 * 지금은 잰 층이 `levels` 에 쌓이고 정적 그리기가 **지나온 층마다** 유령선을
 * 세운다. 완주 화면에 0.5 · 0.3714 · 0 이 사다리로 서고 화살이 그 사이를 잇는다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 막대의 섞임도, 층의 섞임도, 내려간 폭도 전부 `counts` 에서 나온다. 옛 발신은
 * `gini` · `n` · `pureClass` · `from` · `to` · `drop` 을 전부 실어 보냈는데, 그러면
 * 화면의 막대와 캡션의 수가 다른 출처가 된다. 지금 발신이 싣는 것은 **갈랐다는
 * 판정**(`cuts` · `buckets`)뿐이다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 막대의 가로세로도 가름선의 자리도 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). 담는 것은 **값의 범위**에 해당하는 것뿐이다
 * (`classes` 가 자의 꼭대기를, `points` 가 산점도의 축척을 정한다).
 *
 * 문안도 담지 않는다. `step` 이 무엇을 말할지만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  IMPURITY_ROOT_BOX,
  tallyOf,
  type ImpurityBox,
  type ImpurityPoint,
} from './algorithm.js';

/** 자 위에 선 통 하나. 개수도 섞임도 순수 여부도 `counts` 에서 나온다. */
export type ImpurityBucket = {
  id: string;
  box: ImpurityBox;
  /** classes 순서대로의 개수. */
  counts: readonly number[];
};

/**
 * 그어진 가름선 하나.
 *
 * `box` 는 발신이 실어 오지 않는다 — 가름선이 그어지는 순간 그 통이 아직 장면에
 * 서 있으므로 `reduce` 가 거기서 집어 온다 (갈라진 뒤에는 사라지는 칸이라
 * 자취에 함께 적어 두어야 한다).
 */
export type ImpurityCutMark = {
  bucketId: string;
  axis: 'x' | 'y';
  at: number;
  box: ImpurityBox;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 높이도 출발 폭도 `layers` · `levels` 가 이미
 * 말하므로 `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type ImpurityStep =
  /** 전부가 한 통에 담겨 자의 꼭대기에 부어진다. */
  | { kind: 'sample' }
  /** 이 층의 질문이 산점도에 그어진다. */
  | { kind: 'cut' }
  /** 통이 갈라져 조각마다 제 섞임 높이로 내려간다. */
  | { kind: 'split' }
  /** 층 전체의 섞임을 잰다 — 띠가 무게중심까지 내려온다. */
  | { kind: 'level' }
  /** 더 가를 것이 없다. 순수한 칸이 제 이름표 색으로 물든다. */
  | { kind: 'settle' };

export type ImpurityDropsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 산점도의 점. 축척이 여기서 나온다. */
  points: readonly ImpurityPoint[];
  /** 이름표의 차례. 색판의 크기와 자의 꼭대기가 여기서 나온다. */
  classes: readonly string[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 층마다의 통 목록, 왼쪽→오른쪽. 마지막이 지금 선 층, 그 앞이 떨어지기 전이다. */
  layers: readonly (readonly ImpurityBucket[])[];
  /** 층마다 그은 가름선. **쌓인다** — 지나온 질문이 산점도에 남는 것이 자취다. */
  cutLayers: readonly (readonly ImpurityCutMark[])[];
  /** 잰 층의 섞임, 잰 차례대로. 첫 값이 뿌리 층이고 마지막이 지금 띠의 자리다. */
  levels: readonly number[];
  /** 더 물을 것이 없다고 판정됐나. */
  settled: boolean;

  step: ImpurityStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `layers` 도 `cutLayers` 도 `levels` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 갈라진 통과 그은 선을 단 채로 서고, 그 위에 algorithm 이
 * 처음부터 다시 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<ImpurityDropsScene, 'points' | 'classes'>;

/**
 * 아무것도 서지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): ImpurityDropsScene {
  return {
    points: base.points,
    classes: base.classes,
    layers: [],
    cutLayers: [],
    levels: [],
    settled: false,
    step: null,
  };
}

// ── unknown 좁히개 — 생산자가 같은 패키지라도 경계는 경계다 (C9) ──────────────

function fields(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function side(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toBox(v: unknown): ImpurityBox {
  const b = fields(v);
  return { xLo: side(b?.xLo), xHi: side(b?.xHi), yLo: side(b?.yLo), yHi: side(b?.yHi) };
}

function toCounts(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) out.push(num(raw) ?? 0);
  return out;
}

function toBuckets(v: unknown): ImpurityBucket[] {
  if (!Array.isArray(v)) return [];
  const out: ImpurityBucket[] = [];
  for (const item of v) {
    const b = fields(item);
    if (typeof b?.id !== 'string') continue;
    out.push({ id: b.id, box: toBox(b.box), counts: toCounts(b.counts) });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 막대의 높이도 띠의 자리도 캡션의 수도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/** 통에 담긴 개수. 이름표별 개수의 합이라 막대의 폭과 늘 맞는다. */
export function countOf(counts: readonly number[]): number {
  let n = 0;
  for (const cnt of counts) n += cnt;
  return n;
}

/** 지니 불순도. 1 − Σ 비율². 빈 통은 0. */
export function giniOf(counts: readonly number[]): number {
  const n = countOf(counts);
  if (n <= 0) return 0;
  let sum = 0;
  for (const cnt of counts) sum += (cnt / n) * (cnt / n);
  return 1 - sum;
}

/** 한 가지 이름표만 담겼으면 그 class 인덱스, 아니면 -1. */
export function pureClassOf(counts: readonly number[]): number {
  let found = -1;
  for (let k = 0; k < counts.length; k += 1) {
    if ((counts[k] ?? 0) === 0) continue;
    if (found >= 0) return -1;
    found = k;
  }
  return found;
}

/** 통 크기로 가중한 층의 섞임. 그냥 평균이 아니다. */
export function levelOf(buckets: readonly ImpurityBucket[]): number {
  let total = 0;
  let sum = 0;
  for (const b of buckets) {
    const n = countOf(b.counts);
    total += n;
    sum += n * giniOf(b.counts);
  }
  return total <= 0 ? 0 : sum / total;
}

/** 지금 자 위에 선 통들, 왼쪽부터. 아직 붓지 않았으면 빈 목록. */
export function bucketsOf(scene: ImpurityDropsScene): readonly ImpurityBucket[] {
  return scene.layers[scene.layers.length - 1] ?? [];
}

/**
 * 이 걸음이 오기 **전**의 통들. 갈라지는 운동의 출발 높이가 여기서 나온다.
 *
 * 자취를 한 칸 물려 셈하므로 `prev` 를 들추지 않는다 — 어느 걸음에서 와도 같은
 * 곳에서 출발한다 (S-scene).
 */
export function previousBucketsOf(scene: ImpurityDropsScene): readonly ImpurityBucket[] {
  return scene.layers[scene.layers.length - 2] ?? [];
}

/** 자의 전 폭을 몇으로 나눌 것인가. 층이 갈려도 개수 합은 그대로다. */
export function totalOf(scene: ImpurityDropsScene): number {
  let total = 0;
  for (const b of bucketsOf(scene)) total += countOf(b.counts);
  return total;
}

/** 이름표의 수. 색판의 크기이자 자의 꼭대기(`1 − 1/k`)를 정한다. */
export function classCountOf(scene: ImpurityDropsScene): number {
  return Math.max(2, scene.classes.length);
}

/** 지금 띠가 선 높이. 아직 재지 않았으면 null. */
export function currentLevelOf(scene: ImpurityDropsScene): number | null {
  return scene.levels[scene.levels.length - 1] ?? null;
}

/** 방금 내려오기 전에 띠가 있던 높이. 잰 것이 하나뿐이면 null. */
export function previousLevelOf(scene: ImpurityDropsScene): number | null {
  return scene.levels[scene.levels.length - 2] ?? null;
}

/**
 * 방금 내려간 폭.
 *
 * **선언에서도 발신에서도 가져오지 않는다.** "가른 뒤에 떨어진다" 가 이 조각의
 * 결론인데 그 낙차를 실어 오면 결론이 화면의 띠와 다른 자료를 쓰게 된다. 여기서는
 * 실제로 그어진 두 띠의 거리를 잰다.
 */
export function dropOf(scene: ImpurityDropsScene): number | null {
  const from = previousLevelOf(scene);
  const to = currentLevelOf(scene);
  return from === null || to === null ? null : from - to;
}

/** 방금 그은 가름선들. 아직 하나도 안 그었으면 빈 목록. */
export function lastCutsOf(scene: ImpurityDropsScene): readonly ImpurityCutMark[] {
  return scene.cutLayers[scene.cutLayers.length - 1] ?? [];
}

/** 뿌리 통 — 바탕 자료 전부가 한 통에 담긴 것. 발신이 실어 올 것이 없다. */
function rootBucketOf(scene: ImpurityDropsScene): ImpurityBucket {
  return { id: 'root', box: IMPURITY_ROOT_BOX, counts: tallyOf(scene.points, scene.classes) };
}

export const impurityDropsScene: ScenePlan<ImpurityDropsScene> = {
  /**
   * 첫 장면은 점과 이름표만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 것을 **참조로 쥐지 않는다** — 점마다 새 객체를 지어 담는다. 러너가 주는 배열은
   * mechanism 과 view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): ImpurityDropsScene {
    const d = fields(initialData);
    const points: ImpurityPoint[] = [];
    if (Array.isArray(d?.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = num(p?.x);
        const y = num(p?.y);
        if (x === null || y === null) continue;
        points.push({ x, y, label: typeof p?.label === 'string' ? p.label : '' });
      }
    }
    const classes: string[] = [];
    if (Array.isArray(d?.classes)) {
      for (const cls of d.classes) if (typeof cls === 'string') classes.push(cls);
    }
    return atStart({ points, classes });
  },

  reduce(scene: ImpurityDropsScene, event: FacetRuntimeEvent): ImpurityDropsScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 전부가 한 통에 담긴다. 그 통은 바탕 자료 그 자체라 여기서 짓는다 —
       * 발신이 실어 온 것을 옮겨 적으면 같은 물음에 답이 둘이 된다.
       */
      case 'sample-shown': {
        const root = rootBucketOf(scene);
        return {
          ...scene,
          layers: [[root]],
          cutLayers: [],
          levels: [levelOf([root])],
          settled: false,
          step: { kind: 'sample' },
        };
      }

      /*
       * 이 층의 질문이 그어진다. 가름선을 가둘 칸은 지금 서 있는 통에서 집어 온다 —
       * 갈라진 뒤에는 그 통이 사라지므로 자취에 함께 적어 둔다.
       */
      case 'cut-drawn': {
        if (!p || !Array.isArray(p.cuts)) return scene;
        const standing = bucketsOf(scene);
        const marks: ImpurityCutMark[] = [];
        for (const raw of p.cuts) {
          const cut = fields(raw);
          if (cut?.axis !== 'x' && cut?.axis !== 'y') continue;
          const at = num(cut.at);
          if (at === null) continue;
          const bucketId = typeof cut.bucketId === 'string' ? cut.bucketId : '';
          const box = standing.find((b) => b.id === bucketId)?.box ?? IMPURITY_ROOT_BOX;
          marks.push({ bucketId, axis: cut.axis, at, box });
        }
        if (marks.length === 0) return scene;
        return { ...scene, cutLayers: [...scene.cutLayers, marks], step: { kind: 'cut' } };
      }

      /*
       * 통이 갈라진다. 앞 층을 제자리에서 고치지 않고 새 층을 얹는다 — 갈라지는
       * 운동의 출발 높이가 그 앞 층에서 나오기 때문이다 (S-scene).
       */
      case 'buckets-split': {
        if (!p) return scene;
        const buckets = toBuckets(p.buckets);
        if (buckets.length === 0) return scene;
        return { ...scene, layers: [...scene.layers, buckets], step: { kind: 'split' } };
      }

      /*
       * 층 전체의 섞임을 잰다. 잴 대상도 잰 값도 자취에 이미 있다 — 방금 선
       * 막대들의 가중 평균이 곧 그 값이다.
       */
      case 'level-measured':
        return {
          ...scene,
          levels: [...scene.levels, levelOf(bucketsOf(scene))],
          step: { kind: 'level' },
        };

      /* 더 물을 것이 없다. 어느 통이 순수한지는 `counts` 가 말한다. */
      case 'settled':
        return { ...scene, settled: true, step: { kind: 'settle' } };

      /*
       * 발신이 끝났다는 표시. 화면은 'settled' 에서 할 말을 마쳤으므로 장면을
       * 그대로 돌려준다 — 조용한 발신이라 앞 걸음의 장면을 갈아 끼우는데, 같은
       * 것으로 갈아 끼우면 아무 일도 일어나지 않는다 (SceneTrack.push).
       */
      case 'done':
        return scene;

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 턴다 (S-scene). */
      case 'rewind':
        return atStart({ points: scene.points, classes: scene.classes });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
