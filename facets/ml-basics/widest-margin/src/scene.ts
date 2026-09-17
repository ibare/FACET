/**
 * WidestMargin 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었다. **상태는 전부 stage 에 있었다.**
 *
 * - `let domainMin` · `let domainSpan` · `let unit` · `let railUnit` · `let rowHeight`
 *   — **척도 다섯.** `px` · `py` · `rowCenter` 가 이 다섯으로 자리를 셈했으므로
 *   **화면의 모든 좌표가 여기서 나왔다.** `setModel` 이 한 번 적어 두고 그 뒤로 계속
 *   쓰는 짜임이라 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다. 지금은 장면이 값의
 *   범위(점과 후보 수)만 말하고 척도는 그리는 쪽의 `layoutOf` 가 매번 셈한다.
 * - `let model` — 러너가 주는 바탕의 두 벌째 사본.
 * - `let activeSlope` · `let activeIntercept` · `let activeHalf` — **지금 서 있는 띠.**
 *   `growBand` 와 `pivotLine` 이 이 셋을 운동의 **출발값**으로 읽었다 (`lineShown ?
 *   activeSlope : spec.slope`). `getAttribute` 를 안 써서 되읽기 grep 을 통과하는데,
 *   되짚어 세운 직후에는 그것이 **옛 화면의 띠**라 접히고 도는 운동이 엉뚱한 자세에서
 *   출발한다 — DOM 의 거울이다. 지금은 `pose` 가 장면에 있고, 출발 자세는 `step.from`
 *   이 실어 말한다 (S-scene: `prev` 는 고르는 데만).
 * - `let lineShown` — 중심선을 켰나. 곧 *후보를 재기 시작했나* 이고, 띠의 opacity 를
 *   통째로 막는 빗장이기도 했다. 지금은 `pose !== null` 이 그 말을 한다.
 * - `let caliperAt` — 캘리퍼(두께를 재는 자)를 어디에 놓았나. `pickCaliperSpot` 이
 *   걸음마다 골라 적어 두고 그 뒤의 모든 프레임이 그것을 썼다. 지금은 그리는 쪽이
 *   띠 하나를 받아 매번 고른다 — 같은 띠면 같은 자리가 나오는 순수 함수다.
 * - `let pointNodes` · `let ringNodes` · `let supportNodes` · `let barNodes` ·
 *   `let barLabels` · `let barValues` — DOM 손잡이 배열. 알맹이는 없다.
 * - `const pastLines: SVGLineElement[]` — **어느 후보 선이 그어졌나.** `const` 라
 *   `let` grep 을 통과하는데 `drawCandidates` 가 `push` 로 제자리에서 늘렸고, 그것이
 *   곧 "후보가 다섯 그어져 있다" 는 자취였다. 지금은 `candidates` 가 값만 쌓는다.
 * - `Number(bar.getAttribute('width') ?? 0)` — **화면 되읽기.** 우승 눈금선이 설 가로
 *   자리를 막대의 `width` 속성에서 꺼냈다. 되짚어 세운 직후에는 그것이 옛 화면의
 *   막대라 눈금선이 엉뚱한 데 선다. 지금은 우승 줄의 두께에서 셈한다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다
 *
 * 옛 발신은 `band-grow` 에 `best: boolean` 을, `done` 에 `{ row, thickness }` 를
 * 실었다 — **"어느 줄이 답인가" 를 algorithm 이 적어 보내고 화면은 그대로 받아
 * 적었다.** 지금은 `bestRowIndex` 가 기록장에 쌓인 줄을 훑어 가장 두꺼운 것을 고른다.
 * 막대를 그리는 수와 답을 가리는 수가 같은 배열에서 나오므로 갈릴 자리가 없다.
 * 캡션의 "어느 후보보다 두껍다" 도 `beatsCandidates` 가 실제로 견주어 본 뒤에만
 * 그렇게 말한다.
 *
 * `row` 도 걷어냈다 — 줄은 올 때마다 하나씩 쌓이므로 `rows.length` 가 그 줄의
 * 번호다.
 *
 * ── 그래도 싣는 것
 *
 * 띠의 두께와 절편, 그리고 어느 점이 띠를 멈췄는가(`target`)는 **걸음이 내리는
 * 판정**이라 그대로 싣는다. 기울기 하나에서 가장 두꺼운 띠를 푸는 셈이 곧 이 조각의
 * 알고리즘이므로, 함수를 내주어 장면이 부르게 하면 장면이 조각을 되풀이하는 꼴이
 * 된다 (프로토콜 4 절 B 갈래의 경계).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 띠의 기울기·절편·두께라는 **구조**만 담고 화면
 * 자리는 그리는 쪽이 셈한다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을 말할지만
 * 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 이름표가 붙은 점 하나. 값이지 자리가 아니다. */
export type MarginPt = { x: number; y: number; group: string };

/** 띠 한가운데를 지나는 선. y = slope·x + intercept */
export type MarginLine = { slope: number; intercept: number };

/** 두께 기록장의 한 줄 — 기울기 하나에서 가장 두껍게 벌어진 띠. */
export type MarginRow = {
  slope: number;
  intercept: number;
  /** 띠의 두께 (선에 수직인 거리). */
  thickness: number;
  /** 띠를 멈춘 점의 색인. 걸음이 내리는 판정이라 발신이 싣는다. */
  contacts: readonly number[];
};

/**
 * 지금 화면에 서 있는 띠의 자세. 값이지 자리가 아니다.
 *
 * `half` 는 중심선에서 가장자리까지의 수직 거리다. 0 이면 띠는 아직 벌어지지
 * 않았고 중심선만 서 있다.
 */
export type BandPose = { slope: number; intercept: number; half: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 무엇을 다루는지는 `rows` · `pose` 가 이미 말하므로 여기 다시 적지 않는다.
 */
export type WidestMarginStep =
  /** 점이 제 무리 중심에서 자기 자리로 나온다. */
  | { kind: 'place' }
  /** 후보 중심선이 왼쪽에서 오른쪽으로 그어진다. */
  | { kind: 'candidates' }
  /**
   * 띠가 벌어지다 점에 닿아 멈춘다.
   *
   * `from` 은 접었다 돌아 나올 **출발 자세**다. 화면을 되읽지 않으려고 장면이
   * 말한다 — 되짚어 세운 직후의 화면은 옛 걸음의 것이라 거기서 꺼내면 어긋난다
   * (S-scene: `prev` 는 고르는 데만).
   */
  | { kind: 'grow'; from: BandPose | null }
  /** 띠가 접히고 선이 최적 기울기로 돈다. */
  | { kind: 'pivot'; from: BandPose }
  /** 닿은 점에서 중심선까지 수선이 내려온다. */
  | { kind: 'lock' }
  /** 우승 길이를 가리키는 눈금선이 기록장을 타고 올라간다. */
  | { kind: 'crown' };

export type WidestMarginScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 이름표가 붙은 점. 축의 범위도 막대 자의 눈금도 전부 여기서 나온다. */
  points: readonly MarginPt[];
  /** 견줄 후보 기울기의 수. 기록장의 줄 수(= 후보 + 최적 하나)가 여기서 나온다. */
  candidateCount: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 점이 제자리에 나왔나. */
  placed: boolean;
  /** 그어진 후보 중심선. */
  candidates: readonly MarginLine[];
  /** 기록장에 쌓인 줄. 온 차례가 곧 줄 번호다. */
  rows: readonly MarginRow[];
  /** 지금 서 있는 띠. 없으면 중심선도 없다. */
  pose: BandPose | null;
  /** 닿은 점에서 수선이 내려왔나. */
  locked: boolean;
  /** 답이 가려졌나. */
  crowned: boolean;

  step: WidestMarginStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `rows` 도 `pose` 도 `candidates` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 쌓인 막대를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 재는 것이 겹친다 (S-scene).
 */
type Base = Pick<WidestMarginScene, 'points' | 'candidateCount'>;

/**
 * 아무것도 재지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): WidestMarginScene {
  return {
    points: base.points,
    candidateCount: base.candidateCount,
    placed: false,
    candidates: [],
    rows: [],
    pose: null,
    locked: false,
    crowned: false,
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

/** 발신이 실은 선. 둘 중 하나라도 수가 아니면 그 걸음이 조용히 흘러간다 (C2). */
function readLine(payload: unknown): MarginLine | null {
  const p = fields(payload);
  if (p === null) return null;
  const slope = num(p.slope);
  const intercept = num(p.intercept);
  return slope === null || intercept === null ? null : { slope, intercept };
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수와 조각의 결론이 전부 여기를 지난다. 막대를 그리는 수와 답을
// 가리는 수가 같은 배열에서 나오므로 갈릴 자리가 없다.

/**
 * 가장 두껍게 벌어진 줄. 기록장에 쌓인 것만 보고 고른다 — 답을 따로 싣지 않는다.
 *
 * 한 줄도 없으면 null.
 */
export function bestRowIndex(scene: WidestMarginScene): number | null {
  let best = -1;
  let bestThickness = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < scene.rows.length; i += 1) {
    const thickness = scene.rows[i].thickness;
    if (thickness > bestThickness) {
      bestThickness = thickness;
      best = i;
    }
  }
  return best < 0 ? null : best;
}

/** 그 줄. 범위 밖이면 null. */
export function rowAt(scene: WidestMarginScene, index: number | null): MarginRow | null {
  return index === null ? null : (scene.rows[index] ?? null);
}

/** 후보를 다 잰 뒤에 오는 줄인가 — 곧 최적 기울기로 돌려 잰 줄인가. */
export function isAnswerRow(scene: WidestMarginScene, index: number): boolean {
  return index >= scene.candidateCount;
}

/**
 * 그 줄이 후보 전부보다 두꺼운가.
 *
 * 캡션이 "어느 후보보다 두껍게 벌어진다" 고 말할 자격을 여기서 얻는다. 지금
 * 자료에서 참이어도 자료가 바뀌면 거짓이 될 수 있으므로 매번 견준다.
 */
export function beatsCandidates(scene: WidestMarginScene, index: number): boolean {
  const row = scene.rows[index];
  if (row === undefined || !isAnswerRow(scene, index)) return false;
  for (let i = 0; i < scene.candidateCount && i < scene.rows.length; i += 1) {
    if (scene.rows[i].thickness >= row.thickness) return false;
  }
  return true;
}

export const widestMarginScene: ScenePlan<WidestMarginScene> = {
  /**
   * 첫 장면은 점과 기록장의 칸만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 배열을 참조로 쥐지 않는다 — 값만 꺼내 새 목록을 만든다 (S-scene).
   */
  initial(initialData: unknown): WidestMarginScene {
    const d = fields(initialData) ?? {};
    const rawSlopes = d.candidateSlopes;
    const candidateCount = Array.isArray(rawSlopes) ? rawSlopes.length : 0;
    const points: MarginPt[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = p === null ? null : num(p.x);
        const y = p === null ? null : num(p.y);
        // 점 하나가 수가 아니면 축의 범위가 통째로 거짓이 된다. 빈 채로 선다 (C2).
        if (p === null || x === null || y === null) {
          return atStart({ points: [], candidateCount });
        }
        points.push({ x, y, group: typeof p.group === 'string' ? p.group : '' });
      }
    }
    return atStart({ points, candidateCount });
  },

  reduce(scene: WidestMarginScene, event: FacetRuntimeEvent): WidestMarginScene {
    switch (event.type) {
      /* 두 무리가 제자리를 잡는다. */
      case 'points-placed':
        return { ...scene, placed: true, step: { kind: 'place' } };

      /* 후보 중심선이 그어진다. 전부 두 무리를 가른다. */
      case 'candidates-drawn': {
        const p = fields(event.payload);
        const raw = p === null ? null : p.lines;
        if (!Array.isArray(raw)) return scene;
        const lines: MarginLine[] = [];
        for (const item of raw) {
          const line = readLine(item);
          // 한 줄이라도 못 읽으면 후보가 몇인지 거짓이 된다. 통째로 흘린다 (C2).
          if (line === null) return scene;
          lines.push(line);
        }
        return { ...scene, placed: true, candidates: lines, step: { kind: 'candidates' } };
      }

      /*
       * 띠가 벌어지다 멈춘다. 줄이 하나 쌓이고 그 띠가 화면에 남는다 —
       * 앞 장면을 제자리에서 고치지 않고 새 배열을 짓는다 (S-scene).
       */
      case 'band-grow': {
        const p = fields(event.payload);
        const line = readLine(event.payload);
        const thickness = p === null ? null : num(p.thickness);
        if (line === null || thickness === null || thickness < 0) return scene;
        const row: MarginRow = {
          slope: line.slope,
          intercept: line.intercept,
          thickness,
          contacts: toIndexArray(event.target).filter(
            (i) => i >= 0 && i < scene.points.length,
          ),
        };
        return {
          ...scene,
          placed: true,
          rows: [...scene.rows, row],
          pose: { slope: line.slope, intercept: line.intercept, half: thickness / 2 },
          step: { kind: 'grow', from: scene.pose },
        };
      }

      /* 띠가 접히고 선이 최적 기울기로 돈다. 아직 벌어지지 않았다. */
      case 'line-pivot': {
        const line = readLine(event.payload);
        if (line === null) return scene;
        const from = scene.pose ?? { slope: line.slope, intercept: line.intercept, half: 0 };
        return {
          ...scene,
          pose: { slope: line.slope, intercept: line.intercept, half: 0 },
          step: { kind: 'pivot', from },
        };
      }

      /* 닿은 점에서 중심선까지 수선이 내려온다. 어느 점인지는 우승 줄이 안다. */
      case 'contacts-locked':
        return { ...scene, locked: true, step: { kind: 'lock' } };

      /* 가장 두꺼운 줄이 답이다. 어느 줄인지는 기록장이 정한다. */
      case 'done':
        return { ...scene, crowned: true, step: { kind: 'crown' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, candidateCount: scene.candidateCount });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
