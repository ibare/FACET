/**
 * ProjectAndLose 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도, 화면을 되읽는 자리도
 * 없었다. **상태는 전부 stage 에 있었고 그 가운데 둘이 DOM 의 거울이었다**
 * (프로토콜 3-1 의 ②⑤ 와 함정 28).
 *
 * - `let axis = { midX, midY, ux, uy }` — **투영 축을 화면 좌표로 적어 둔 자리.**
 *   `showScene` 이 한 번 채우고 그 뒤로 `showAmbiguity` 가 직각 방향을 여기서 꺼냈다.
 *   되짚어 `ambiguity` 걸음으로 곧장 뛰면 축이 `{ ux: 1, uy: 0 }` 인 채라 후보 선이
 *   엉뚱한 방향으로 섰다. 지금은 `render` 가 바탕의 점과 기울기에서 매번 셈한다.
 * - `let markedIndex = -1` — 어느 점을 짚었나. `-1` 이 "아직 없다" 였다.
 *   `collapseTraces` 가 이것을 읽어 거리 딱지를 따라 내렸으므로, 되짚어 `collapse`
 *   로 뛰면 딱지가 제자리에 얼어붙었다. 지금은 가장 멀리 떨어진 점이 파생값이고
 *   짚었는지는 `marked` 가 말한다.
 * - `let rings: SVGCircleElement[]` — DOM 손잡이인데 **`rings.length === 0` 이 곧
 *   분기였다** (③ 의 얼굴만 다른 것). `finish()` 가 그 조건으로 곧장 물러나므로
 *   `ambiguity` 를 안 밟고 `done` 에 닿으면 마지막 걸음이 **아무 말도 하지 않았다.**
 *   지금은 `ambiguous` 가 고리를 정적으로 세우고 `finished` 가 그 위에 얹힌다.
 * - `let markTag` — 거리 딱지 하나. 위와 같은 자리다.
 * - `type Bead = { ox, oy, fx, fy, dropped, dot, ghost, trace }` — **DOM 손잡이와
 *   뜻·수치가 한 객체다** (⑤). `const beads: Bead[]` 라 `let` grep 을 통과하는데,
 *   `b.dropped` 가 **이 조각의 자취 그 자체**(어느 점이 이미 떨어졌나)였고
 *   `b.fx`/`b.fy` 는 **그 점이 지금 화면에서 선 자리를 적어 둔 거울**이었다.
 *   `getAttribute` 를 안 쓰니 ④ 의 grep 을 지나가지만 병은 같다 — 운동 셋이 전부
 *   그 거울에서 출발값을 꺼냈다. 지금은 발이 `projectOnAxis` 의 파생값이라
 *   자취(`waves`)만 있으면 어느 걸음의 자리든 셈으로 나온다.
 * - `b.ghost`/`b.trace` 가 `null` 이냐 — 그 점에 흔적이 있나. `collapsed` 가 말한다.
 * - `type Scene = { points }` — **이름이 장면과 부딪혔다** (함정 21). 그것은 장면이
 *   아니라 stage 가 `initialData` 를 좁혀 쥔 밑감이었고, 좁히는 자리가 여기 `initial`
 *   로 옮겨 오면서 `readScene` 과 함께 통째로 없어졌다. 좁히는 규칙이 두 벌이 되지
 *   않게 stage 는 이제 `params.initialData` 를 읽지 않는다.
 *
 * ── 무엇을 싣고 무엇을 세는가 (프로토콜 4 절의 갈래)
 *
 * **싣는 것이 하나도 없다.** 축을 *찾는* 셈이라면 내주지 않았겠지만 여기서 축은
 * 선언에 적힌 기울기이고, **축이 정해지면 내려 찍기는 순수 함수**다. 그래서
 * `algorithm.ts` 가 `projectOnAxis` 를 내주고 장면이 그것을 부른다.
 *
 * - `centerX` · `centerY` · `angleDeg` — 무게중심은 점의 평균이고 기울기는 선언에 있다.
 * - `footXs` · `footYs` — 축 위로 내린 발. 축이 정해진 뒤의 순수 함수다.
 * - `indices` — 어느 점들이 이번에 떨어지나. 축 위 자리 순으로 셋씩 끊은 결과라
 *   **몇 무리째인가**만 알면 나온다. 무리는 올 때마다 하나씩 쌓이므로 장면이 센다.
 * - `index` · `maxDist` · `meanDist` — 가장 멀리 떨어진 점과 그 거리. 위와 같다.
 * - `keepPct` · `losePct` — 자의 눈금. **화면의 흔적 길이와 같은 셈을 지나야** 결론이
 *   그림에서 나온다 (함정 10 · 34).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점의 화면 자리도 축의 두 끝도 캔버스에서 역산하는 값이라
 * 그리는 쪽의 몫이다 (S-piece). 담는 것은 **값의 자리**다. 문안도 담지 않는다 —
 * `phaseOf` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { projectOnAxis, type Projection } from './algorithm.js';

/** 셈은 `algorithm.ts` 가 쥔다. 그리는 쪽도 같은 것을 부르라고 그대로 내보낸다. */
export { projectOnAxis, type Projection, type ProjectionShot } from './algorithm.js';

/** 점 하나. 화면 좌표가 아니라 데이터 좌표다. */
export type ScenePoint = readonly [number, number];

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 떨어지는 점이 어디서 출발하는지도, 거리 딱지가 어느
 * 자리에서 내려오는지도 전부 바탕과 자취에서 셈하므로 `prev` 를 들출 일이 없다
 * (S-scene).
 */
export type ProjectAndLoseStep =
  /** 점이 서고 축이 가운데에서 양쪽으로 자란다. */
  | { kind: 'stand' }
  /** 한 무리가 축까지 수직으로 떨어진다. */
  | { kind: 'drop' }
  /** 가장 멀리 떨어진 하나를 짚는다. */
  | { kind: 'mark' }
  /** 흔적이 축으로 빨려 들어가 사라지고 잃은 몫이 자로 남는다. */
  | { kind: 'collapse' }
  /** 축 위의 한 자리에서 직각으로 후보들이 줄줄이 선다. */
  | { kind: 'spread' }
  /** 후보들이 한 번 함께 부푼다. */
  | { kind: 'pulse' };

/**
 * 지금 화면이 서 있는 국면. 걸음이 아니라 **자취**에서 나온다.
 *
 * 정적 그리기가 `step` 을 읽지 않는 것이 이 조각의 규율이다 — 같은 장면을 흘려
 * 세우든 곧바로 세우든 같은 화면이 나와야 하는데, `step` 을 읽으면 두 길이 같은
 * 것을 보아 검사가 그 어긋남을 구조적으로 못 잡는다.
 */
export type ProjectAndLosePhase =
  /** 아직 아무것도 안 섰다. */
  | { kind: 'blank' }
  /** 축만 섰고 아직 아무도 안 떨어졌다. */
  | { kind: 'axis' }
  /** 떨어지는 중. */
  | { kind: 'drop' }
  /** 떨어진 거리를 재었다. */
  | { kind: 'measure'; maxDist: number; meanDist: number }
  /** 흔적을 지웠다. */
  | { kind: 'erase' }
  /** 후보들이 섰다. */
  | { kind: 'ambiguous' }
  /** 마쳤다. */
  | { kind: 'done' };

export type ProjectAndLoseScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 흩어진 점들. 차례가 곧 점의 번호다. */
  points: readonly ScenePoint[];
  /** 내려 찍을 축의 기울기(도). 축은 점들의 무게중심을 지난다. */
  angleDeg: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점과 축이 섰나. */
  ready: boolean;
  /**
   * 떨어진 무리의 수.
   *
   * 어느 점이 떨어졌나가 여기서 나온다 — `projectOnAxis` 의 `waves` 를 앞에서부터
   * 이만큼 끊으면 된다. 무리는 올 때마다 하나씩 쌓이므로 번호를 따로 싣지 않는다.
   */
  waves: number;
  /** 가장 멀리 떨어진 하나를 짚었나. 어느 점인지는 파생값이다. */
  marked: boolean;
  /** 흔적을 지웠나. 지운 뒤에는 자가 선다. */
  collapsed: boolean;
  /** 후보 자리들이 섰나. */
  ambiguous: boolean;
  /** 마쳤나. */
  finished: boolean;

  step: ProjectAndLoseStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 자취(`ready` 아래 여섯)는 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 다 떨어진
 * 점과 선 자를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다
 * (S-scene, 함정 14).
 */
type Base = Pick<ProjectAndLoseScene, 'points' | 'angleDeg'>;

/**
 * 되돌린 뒤의 장면 — 아직 아무것도 서지 않았다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene, 함정 15).
 */
function atStart(base: Base): ProjectAndLoseScene {
  return {
    points: base.points,
    angleDeg: base.angleDeg,
    ready: false,
    waves: 0,
    marked: false,
    collapsed: false,
    ambiguous: false,
    finished: false,
    step: null,
  };
}

// ── 선언 좁히기 ───────────────────────────────────────────────────────────
//
// 생산자가 같은 패키지라도 경계는 경계다 (C9). 좁히는 자리는 여기 하나이고 그리는
// 쪽은 장면만 받는다 — 두 벌이 되면 점의 수가 갈린다.

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 점 목록. 값만 베껴 **새 배열로** 돌려준다.
 *
 * 넘겨받은 것을 참조로 쥐지 않는다 — 점 배열은 러너가 mechanism 과 view 에 함께
 * 주는 한 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readPoints(raw: unknown): ScenePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenePoint[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const x = num(row[0]);
    const y = num(row[1]);
    if (x !== null && y !== null) out.push([x, y]);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 흔적의 길이도 자의 눈금도 캡션의 수도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/**
 * 이 장면의 내려 찍기. 점이 하나도 없으면 null.
 *
 * `algorithm.ts` 가 내준 함수를 그대로 부른다 — 셈이 두 벌이 되면 화면과 결론이
 * 갈린다 (프로토콜 4 절).
 */
export function projectionOf(scene: ProjectAndLoseScene): Projection | null {
  if (scene.points.length === 0) return null;
  return projectOnAxis(scene.points, scene.angleDeg);
}

/** `k` 무리째에 떨어지는 점들 (1 부터). 범위 밖이면 빈 목록. */
export function waveAt(scene: ProjectAndLoseScene, k: number): readonly number[] {
  const proj = projectionOf(scene);
  if (proj === null) return [];
  return proj.waves[k - 1] ?? [];
}

/** 여태 떨어진 점들. 떨어진 차례 그대로다. */
export function droppedOf(scene: ProjectAndLoseScene): number[] {
  const proj = projectionOf(scene);
  if (proj === null) return [];
  const out: number[] = [];
  for (let k = 0; k < Math.min(scene.waves, proj.waves.length); k += 1) {
    for (const index of proj.waves[k]) out.push(index);
  }
  return out;
}

/**
 * 지금 화면이 선 국면.
 *
 * `step` 이 아니라 **자취**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 국면이
 * 나와야 하고, 장면에 국면 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function phaseOf(scene: ProjectAndLoseScene): ProjectAndLosePhase {
  if (!scene.ready) return { kind: 'blank' };
  if (scene.finished) return { kind: 'done' };
  if (scene.ambiguous) return { kind: 'ambiguous' };
  if (scene.collapsed) return { kind: 'erase' };
  if (scene.marked) {
    const proj = projectionOf(scene);
    return {
      kind: 'measure',
      maxDist: proj === null ? 0 : proj.maxDist,
      meanDist: proj === null ? 0 : proj.meanDist,
    };
  }
  if (scene.waves > 0) return { kind: 'drop' };
  return { kind: 'axis' };
}

export const projectAndLoseScene: ScenePlan<ProjectAndLoseScene> = {
  /**
   * 첫 장면은 비어 있다 — 점도 축도 아직 서지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): ProjectAndLoseScene {
    const d = fields(initialData) ?? {};
    return atStart({ points: readPoints(d.points), angleDeg: num(d.axisAngleDeg) ?? 0 });
  },

  reduce(scene: ProjectAndLoseScene, event: FacetRuntimeEvent): ProjectAndLoseScene {
    switch (event.type) {
      /*
       * 점과 축이 선다. 옛 stage 의 `showScene` 이 첫 줄에서 화면을 되돌렸으므로
       * 자취도 함께 턴다 — 두 번 와도 같은 화면이어야 한다.
       */
      case 'scene-ready':
        return {
          ...atStart({ points: scene.points, angleDeg: scene.angleDeg }),
          ready: true,
          step: { kind: 'stand' },
        };

      /*
       * 한 무리가 떨어진다. 어느 점들인지도 몇 무리째인지도 싣지 않는다 — 무리는
       * 올 때마다 하나씩 쌓이고 그 알맹이는 `projectOnAxis` 가 말한다.
       */
      case 'drop': {
        const proj = projectionOf(scene);
        if (!scene.ready || proj === null) return scene;
        if (scene.waves >= proj.waves.length) return scene;
        return { ...scene, waves: scene.waves + 1, step: { kind: 'drop' } };
      }

      /* 가장 멀리 떨어진 하나를 짚는다. 어느 점인지도 그 거리도 파생값이다. */
      case 'residual-mark':
        if (!scene.ready || scene.marked) return scene;
        return { ...scene, marked: true, step: { kind: 'mark' } };

      /* 흔적을 지운다. 담은 몫과 잃은 몫은 흔적과 같은 셈에서 나온다. */
      case 'collapse':
        if (!scene.marked || scene.collapsed) return scene;
        return { ...scene, collapsed: true, step: { kind: 'collapse' } };

      /* 축 위의 한 자리에서 직각으로 후보들이 선다. */
      case 'ambiguity':
        if (!scene.collapsed || scene.ambiguous) return scene;
        return { ...scene, ambiguous: true, step: { kind: 'spread' } };

      /* 마침. 후보들이 한 번 함께 부푼다. */
      case 'done':
        if (!scene.ready || scene.finished) return scene;
        return { ...scene, finished: true, step: { kind: 'pulse' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, angleDeg: scene.angleDeg });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
