/**
 * AngleNotLength 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도 없었다. 상태는
 * 전부 stage 에 있었는데, 그중 뜻을 쥔 것은 **하나뿐**이고 나머지는 통째로
 * **화면 자신**이었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `let swept` — **부채꼴이 몇 개나 벌어졌나.** `sweep()` 이 `swept += 1` 하고
 *   `swept === 1` 일 때 길이 자를 전부 0.28 로 내렸다. 곧 "각이 순위를 지는
 *   순간부터 길이는 뒤로 물러난다" 는 국면 전환이 이 수 하나에만 살았고, 되감아
 *   세운 직후에는 그 수가 옛 화면의 것이라 자가 밝은 채로 남거나 이미 어두운
 *   채로 다시 시작했다. 지금은 `sweeps.length` 가 그 말을 한다.
 * - `let cands` · `qDot` · `qTag` · `qRay` · `qExt` · `caption` — 전부 DOM 손잡이다.
 *   `cands` 는 `build()` 가 바탕을 통째로 다시 돌며 채우므로 자취가 아니다.
 * - `type Cand = { id, color, px, py, ang, pxLen, arcR, ray, ext, dot, … }` —
 *   **DOM 손잡이와 뜻·수치가 한 객체.** 다만 여기 실린 수치(`px` · `ang` · `arcR`)는
 *   전부 바탕에서 나오는 자리라 뜻을 쥔 상태는 아니었다. 지금은 `spotsOf(scene)`
 *   가 그릴 때마다 셈한다 (S-piece: 장면에 좌표를 담지 않는다).
 * - `ext` 의 `dataset.fx` / `dataset.fy` — 점선이 뻗어 나갈 **끝점을 DOM 속성에
 *   적어 두고** `Number(...)` 로 꺼내 썼다. `getAttribute` 를 안 쓰니 ④ 의 grep 을
 *   비켜 가지만 병은 같다 (DOM 의 거울). 지금은 각에서 매번 셈한다.
 * - `arc` 의 `d` 가 빈 문자열인가 — **이 후보를 이미 짚었나.**
 * - `degText` · `cosText` 의 글자 — **재어 낸 각과 코사인이 오직 DOM 글자에만** 살았다.
 * - `angleBadge` · `distBadge` 의 `transform` 이 `scale(0)` 인가 `scale(1)` 인가 —
 *   좌표가 아니라 **어느 국면인가**. 두 줄 세우기가 끝났는지가 여기 있었다.
 * - `angleNum` · `distNum` 의 글자 — **두 줄의 순위 번호**. 이 조각의 결론을 이는
 *   수인데 화면 글자 말고는 어디에도 없었다.
 * - `dimG` · `arcG` · `chordG` 의 `opacity` — 0 / 1 / 0.34 / 0.28 / 0.22 / 0.18 이
 *   **한 축에 예닐곱 뜻**을 실었다. "아직 없다" · "무대 앞이다" · "뒤로 물러났다" ·
 *   "뒤집힘에서 진 쪽이다" 가 한 수에 겹쳐 어느 것도 복원되지 않았다 (함정 29).
 * - `arc` · `chord` 의 `stroke-width` 1.8 / 2.6 — "견주는 중" 과 "이것이 그 하나" 두
 *   뜻. 위와 같은 병이다.
 *
 * 여기서는 그 전부가 `placed` · `lengthsShown` · `sweeps` · `angleOrder` ·
 * `chords` · `distOrder` · `concluded` 일곱으로 줄었다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다
 *
 * 옛 발신은 `done` 에 `id` 를 실었다 — **"각 1등이 거리 꼴찌인가" 를 algorithm 이
 * 판정해 적어 보내고 화면은 그대로 받아 적었다.** 지금은 `flipOf` 가 화면에 뜬
 * 두 줄(`angleOrder` · `distOrder`)을 그대로 견준다. 표에 찍힌 번호와 캡션이
 * 말하는 것이 같은 자리에서 나오므로 갈릴 곳이 없다 (프로토콜 4 절 10 · 34).
 *
 * ── 그래도 싣는 것
 *
 * `deg` · `cos` · `dists` 와 두 `order` 는 싣는다. **재고 줄 세우는 것이 이 조각의
 * 알고리즘 그 자체**라 함수를 내주어 장면이 부르게 하면 장면이 조각을 되풀이하는
 * 꼴이 된다 (프로토콜 4 절 B 갈래의 경계).
 *
 * 반대로 **바탕에서 곧바로 나오는 것**은 걷어냈다 — 길이(`vectorLength`) · 누구를
 * 짚었나(온 차례) · 후보의 `id` 목록 · 그리고 뒤집힘의 판정.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 재어 낸 각·거리라는 **구조**만 담고 화면 자리는
 * 그리는 쪽이 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 장면의 형편이
 * 무엇을 말할지 정하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  readAngleCandidates,
  readAngleQuery,
  vectorLength,
  type AngleNotLengthPoint,
} from './algorithm.js';

export type { AngleNotLengthPoint };

/** 한 후보를 재어 낸 두 수. 벌어진 각과 그 코사인. */
export type AngleReading = { deg: number; cos: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 출발 그림이 필요한 자리가 하나(부채꼴이 어느
 * 각에서 벌어지기 시작하나)인데, 그것은 질의의 방향이라 바탕이 말한다.
 */
export type AngleNotLengthStep =
  /** 원점에서 화살 넷이 자란다. */
  | { kind: 'place' }
  /** 화살마다 길이를 재는 자가 나란히 자란다. */
  | { kind: 'lengths' }
  /** q 의 방향에서 후보의 방향까지 부채꼴이 벌어진다. */
  | { kind: 'sweep' }
  /** 각이 좁은 순서로 동그란 표가 선다. */
  | { kind: 'rank-angle' }
  /** 끝점에서 끝점으로 현이 뻗는다. */
  | { kind: 'chords' }
  /** 거리가 가까운 순서로 마름모 표가 선다. */
  | { kind: 'rank-dist' }
  /** 두 줄이 어긋난 그 하나를 짚는다. */
  | { kind: 'conclude' };

export type AngleNotLengthScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 견줌의 기준. 없으면 이 조각은 할 말이 없다. */
  query: AngleNotLengthPoint | null;
  /** 후보들. 색도 부채꼴 반지름도 순위의 자리도 전부 여기서 나온다. */
  candidates: readonly AngleNotLengthPoint[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 화살이 섰나. */
  placed: boolean;
  /** 길이를 재는 자가 나왔나. */
  lengthsShown: boolean;
  /** 짚어 본 각. **온 차례가 곧 후보의 차례다.** */
  sweeps: readonly AngleReading[];
  /** 각으로 매긴 줄. 좁은 것이 앞이다. */
  angleOrder: readonly string[];
  /** 끝점 사이의 직선 거리. 바탕과 같은 차례다. 없으면 아직 재지 않았다. */
  chords: readonly number[] | null;
  /** 거리로 매긴 줄. 가까운 것이 앞이다. */
  distOrder: readonly string[];
  /** 두 줄을 나란히 놓고 결론을 말했나. */
  concluded: boolean;

  step: AngleNotLengthStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 자취는 하나도 들이지 않는다 — 들이면 되감은 화면이 이미 그려진 부채꼴을 단 채
 * 서고 그 위에 algorithm 이 처음부터 다시 재는 것이 겹친다 (S-scene, 함정 14).
 */
type Base = Pick<AngleNotLengthScene, 'query' | 'candidates'>;

/**
 * 아무것도 재지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (함정 15).
 */
function atStart(base: Base): AngleNotLengthScene {
  return {
    query: base.query,
    candidates: base.candidates,
    placed: false,
    lengthsShown: false,
    sweeps: [],
    angleOrder: [],
    chords: null,
    distOrder: [],
    concluded: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 재어 낸 두 수. 하나라도 수가 아니면 그 걸음이 조용히 흘러간다 (C2). */
function readReading(payload: unknown): AngleReading | null {
  const p = fields(payload);
  if (p === null) return null;
  const deg = num(p.deg);
  const cos = num(p.cos);
  return deg === null || cos === null ? null : { deg, cos };
}

/** 줄 세운 결과. 글자가 아닌 것이 섞이면 줄이 거짓이 되므로 통째로 흘린다 (C2). */
function readOrder(payload: unknown): string[] | null {
  const p = fields(payload);
  if (p === null || !Array.isArray(p.order)) return null;
  const out: string[] = [];
  for (const v of p.order) {
    if (typeof v !== 'string') return null;
    out.push(v);
  }
  return out.length === 0 ? null : out;
}

/** 후보마다 하나씩인 거리. 수가 모자라거나 남으면 자리가 어긋나므로 흘린다 (C2). */
function readDists(payload: unknown, count: number): number[] | null {
  const p = fields(payload);
  if (p === null || !Array.isArray(p.dists) || p.dists.length !== count) return null;
  const out: number[] = [];
  for (const v of p.dists) {
    const n = num(v);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수와 이 조각의 결론이 전부 여기를 지난다. 그림을 그리는 수와
// 캡션이 말하는 수가 같은 자리에서 나오므로 갈릴 곳이 없다.

/** 화살의 길이. algorithm 이 내준 한 벌을 쓴다 — 규칙이 두 벌이 되지 않게. */
export function lengthOf(p: AngleNotLengthPoint): number {
  return vectorLength(p);
}

/** 방금 짚은 후보. 아직 아무것도 안 짚었으면 null. */
export function lastSweptOf(scene: AngleNotLengthScene): AngleNotLengthPoint | null {
  const i = scene.sweeps.length - 1;
  return i < 0 ? null : (scene.candidates[i] ?? null);
}

/** 그 줄에서 몇 번째인가 (1 부터). 줄에 없으면 null. */
export function rankIn(order: readonly string[], id: string): number | null {
  const i = order.indexOf(id);
  return i < 0 ? null : i + 1;
}

/**
 * 각으로 1등인 것이 거리로는 꼴찌인가 — **이 조각의 결론이다.**
 *
 * 옛 발신이 적어 보내던 것을 여기로 옮겼다. 표에 찍힌 번호와 캡션이 말하는 것이
 * 이제 한 자리에서 나온다. 지금 자료에서 참이어도 좌표가 바뀌면 거짓이 될 수
 * 있으므로 **매번 견준다** — 아니라면 화면이 없는 말을 하지 않게 null 을 낸다.
 */
export function flipOf(scene: AngleNotLengthScene): string | null {
  const n = scene.candidates.length;
  if (n < 2) return null;
  if (scene.angleOrder.length !== n || scene.distOrder.length !== n) return null;
  const first = scene.angleOrder[0];
  const last = scene.distOrder[n - 1];
  return first !== undefined && first === last ? first : null;
}

/** 지금 무대 앞에 선 자. 채움의 짙기가 이것 하나로 갈린다 (함정 29). */
export type AngleFocus = 'none' | 'length' | 'angle' | 'dist' | 'both';

/**
 * 어느 자가 지금 무대 앞인가.
 *
 * 결론을 말하는 자리에서는 **둘 다 앞**이다 — 두 줄이 어긋난다는 말은 두 자가
 * 한 화면에 나란히 읽혀야 성립한다 (함정 7).
 */
export function focusOf(scene: AngleNotLengthScene): AngleFocus {
  if (!scene.placed) return 'none';
  if (scene.concluded) return 'both';
  if (scene.chords !== null) return 'dist';
  if (scene.sweeps.length > 0) return 'angle';
  if (scene.lengthsShown) return 'length';
  return 'none';
}

export const angleNotLengthScene: ScenePlan<AngleNotLengthScene> = {
  /**
   * 첫 장면은 바탕만 쥐고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 좁히는
   * 규칙은 algorithm 이 내준 한 벌을 쓰고, 넘겨받은 배열을 참조로 쥐지 않는다
   * (S-scene).
   */
  initial(initialData: unknown): AngleNotLengthScene {
    return atStart({
      query: readAngleQuery(initialData),
      candidates: readAngleCandidates(initialData),
    });
  },

  reduce(scene: AngleNotLengthScene, event: FacetRuntimeEvent): AngleNotLengthScene {
    switch (event.type) {
      /* 원점에서 화살이 섰다. 어디로 뻗는지는 바탕이 안다. */
      case 'place':
        return { ...scene, placed: true, step: { kind: 'place' } };

      /* 길이를 재는 자가 나왔다. 값은 바탕에서 나온다. */
      case 'length-shown':
        return { ...scene, placed: true, lengthsShown: true, step: { kind: 'lengths' } };

      /* 한 후보를 재었다. 온 차례가 곧 그 후보의 자리다. */
      case 'sweep': {
        const reading = readReading(event.payload);
        // 후보 수를 넘어서는 걸음은 앉을 자리가 없다. 조용히 흘린다 (C2).
        if (reading === null || scene.sweeps.length >= scene.candidates.length) return scene;
        return {
          ...scene,
          placed: true,
          lengthsShown: true,
          sweeps: [...scene.sweeps, reading],
          step: { kind: 'sweep' },
        };
      }

      /* 각으로 줄을 세웠다. */
      case 'angle-ranked': {
        const order = readOrder(event.payload);
        if (order === null) return scene;
        return { ...scene, angleOrder: order, step: { kind: 'rank-angle' } };
      }

      /* 끝점 사이를 재었다. 바탕과 같은 차례로 온다. */
      case 'chord-shown': {
        const dists = readDists(event.payload, scene.candidates.length);
        if (dists === null) return scene;
        return { ...scene, chords: dists, step: { kind: 'chords' } };
      }

      /* 거리로 줄을 세웠다. */
      case 'dist-ranked': {
        const order = readOrder(event.payload);
        if (order === null) return scene;
        return { ...scene, distOrder: order, step: { kind: 'rank-dist' } };
      }

      /* 두 줄이 다 섰을 때만 결론을 말한다. 어긋났는지는 `flipOf` 가 견준다. */
      case 'done':
        return scene.distOrder.length === 0
          ? scene
          : { ...scene, concluded: true, step: { kind: 'conclude' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (함정 15).
        return atStart({ query: scene.query, candidates: scene.candidates });

      default:
        // 이 algorithm 이 발신하는 것은 위 여덟이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
