/**
 * KChangesBoundary 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 `let` 이 한 자리도 없었다. **상태는 전부 stage 에 있었고 스무 자리였다.**
 *
 * - `let scale` · `let qx` · `let qy` — **연속 좌표의 척도.** 화면의 모든 자리가
 *   `toX` · `toY` 를 지나고 그 둘이 이 셋을 읽었다. 걸음이 실어 온 것이 아니라
 *   `build()` 가 한 번 셈해 적어 둔 값이라, 척도를 정하는 자리와 쓰는 자리가
 *   갈라져 있었다. 지금은 바탕의 점과 물음점에서 `render` 가 매번 셈한다 — 담는
 *   것은 픽셀이 아니라 **값의 범위**다 (S-piece).
 * - `let classColors` — **색판이 두 번 정해졌다.** 선언 자리에서 `categorical(2)`
 *   로 시작했다가 `build()` 가 `categorical(Math.max(2, next.labels.length))` 로
 *   다시 정했다. 색판을 *지금까지 드러난 수*로 정하면 이름표가 늘어나는 순간 이미
 *   칠한 점들의 hue 가 통째로 갈린다. 지금은 바탕의 이름표 열에서 한 번에 센다.
 * - `let ringR` · `let angle` · `let pillX` — **DOM 의 거울.** 테두리의 반지름,
 *   저울대의 각, 알약의 가로 자리를 따로 적어 두고 다음 운동의 **출발값**으로 삼았다
 *   (`const from = ringR`). `getAttribute` 를 안 쓰니 ④ 의 grep 을 지나가지만 병은
 *   같다 — 되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 테두리가 엉뚱한 크기에서
 *   출발한다. 지금은 셋 다 자취에서 셈한다.
 * - `let cardLabel` — **카드에 새겨진 답.** 뒤집을지 말지를 가르는 조건
 *   (`if (cardLabel === tally.verdict) return;`) 이 오직 여기 있었다. 지금은
 *   `verdicts` 의 마지막 둘이 말한다.
 * - `type Pan = { group, letter, tokens, side }` · `type PointParts = { group, dot, spoke }`
 *   — **DOM 손잡이와 뜻이 한 객체다** (⑤). `Pan.tokens` 의 **길이**가 그 이름표에
 *   던져진 표의 수였고 (`tokenSlot(pan.tokens.length)`), `PointParts.spoke` 가
 *   `null` 이냐 아니냐가 "이 점이 테두리에 들었나" 였다. `side: -1 | 1` 은 저울의
 *   어느 쪽인가인데 이름표 순서에서 곧바로 나오는 값이라 적어 둘 까닭이 없었다.
 *   `let` 도 `Set.has` 도 아니라 어느 grep 에도 안 걸린다.
 * - `type Tally = { labels, counts, verdict, flipped }` — 넷 중 **판정은 `verdict`
 *   하나**다. `labels` 는 바탕이고 `counts` 는 담긴 이웃을 세면 나오며, `flipped` 는
 *   앞선 답과 견주면 나온다. 그런데도 넷이 걸음에 실려 왔다.
 * - **`root.textContent = ''` 이 유일한 되돌림이었다** — `clearRun()` 이 스물한 줄에
 *   걸쳐 칠과 속성을 하나씩 되돌렸다. 그 목록이 통째로 없어졌다.
 *
 * ── 표를 세는 것과 답을 내리는 것은 다르다 (프로토콜 4 절 B 갈래)
 *
 * **이웃 거리 셈은 이 조각의 알고리즘 그 자체라 내주지 않는다.** 누가 가까운지를
 * 장면이 다시 풀면 조각이 피하려는 셈을 장면이 하게 된다. 그래서 두 가지만 싣는다.
 *
 * - `ring-grow` 의 `radius` — k 번째와 k+1 번째 이웃 사이를 잡은 값이라 거리 셈이다.
 * - `tally-settled` 의 `verdict` — 표가 같을 때 **가장 가까운 이웃**을 따르는
 *   규칙이 역시 거리 셈에 기댄다.
 *
 * 나머지는 전부 걷어냈다. 담긴 이웃이 누구인지는 `neighbor-captured` 의 target 이
 * 말하므로 **표의 수는 여기서 센다**. 몇 번째 k 인가도 테두리가 하나씩 쌓이므로
 * `rings.length` 가 그 번호이고, 그 k 값은 `effectiveK` 를 algorithm 과 나눠 쓴다.
 *
 * ── 뒤집혔다는 결론이 그림과 같은 자료에서 나온다
 *
 * 옛 발신은 `previous` 를 실어 보내 표현 계층이 `previous !== verdict` 로 뒤집힘을
 * 가렸다. 답의 자취가 화면 어디에도 남지 않았으므로 그 수의 출처가 발신뿐이었다.
 * 지금은 `verdicts` 가 답을 차례로 쥐고 있어 뒤집힘이 **이웃한 두 답의 차이**다 —
 * 캡션이 "뒤집혔다" 고 말하는 근거와 화면이 그리는 근거가 한 배열이다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 테두리의 반지름이라는 **구조**만 담고 화면 자리는
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 캡션은 `step` 과 자취에서 파생되므로 따로 실을 것이 없고, 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import { effectiveK } from './algorithm.js';

/** 이름표 있는 점 하나. 값이지 자리가 아니다 — 화면 자리는 그리는 쪽이 역산한다. */
export type ScenePoint = { x: number; y: number; label: string };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 테두리가 어디서 자라 왔는지도, 표가 어느 점에서
 * 날아오는지도, 저울이 어느 각에서 기우는지도 전부 자취 한 칸을 물려 셈하므로
 * `prev` 를 들출 일이 없다 (S-scene).
 */
export type KStep =
  /** 이름표 없는 물음점을 세운다. */
  | { kind: 'pose' }
  /** 테두리가 다음 k 를 담는 크기까지 자란다. */
  | { kind: 'grow' }
  /** 테두리에 든 이웃 하나가 이어지고 표 하나가 저울로 날아간다. */
  | { kind: 'capture' }
  /** 표를 세어 저울이 기울고, 답이 달라지면 카드가 뒤집힌다. */
  | { kind: 'settle' }
  /** 가장 가까운 하나를 짚어 답과 나란히 놓는다. */
  | { kind: 'conclude' };

export type KChangesBoundaryScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 이름표 없는 물음점. 모든 거리의 기준이다. */
  query: { x: number; y: number };
  /** 이름표 있는 점 열. 차례가 곧 `index:<i>` 의 i 다. */
  points: readonly ScenePoint[];
  /** 차례로 보여 줄 k 값. 세는 자리의 칸 수가 여기서 나온다. */
  ks: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 물음을 세웠나. 세우기 전에는 카드가 두드려지지 않았다. */
  posed: boolean;
  /**
   * 자라 온 테두리의 반지름들, 자란 차례대로. **데이터 공간의 길이다.**
   *
   * 길이가 곧 몇 번째 k 인가이고, 마지막이 지금 선 테두리다. 앞의 것은 그리지
   * 않지만 운동의 출발 크기가 거기서 나온다.
   */
  rings: readonly number[];
  /**
   * 테두리에 든 이웃의 인덱스, 가까운 차례대로.
   *
   * **남는 자취**다 — 표의 수도, 점의 또렷함도, 살이 뻗은 자리도 전부 여기서
   * 나온다. 옛 stage 는 그것을 `PointParts.spoke` 가 null 이냐로 적어 두었다.
   */
  captured: readonly number[];
  /**
   * 세어 낸 답, 슬롯 차례대로. **판정이라 걸음이 싣는다.**
   *
   * 뒤집힘은 이 배열의 이웃한 두 자리가 다른 것이다 — 결론이 화면과 같은 자료를
   * 쓴다. 카드에 새겨진 답도 마지막 자리다.
   */
  verdicts: readonly string[];
  /** 맺음에서 짚은 가장 가까운 이웃. 아직 안 맺었으면 null. */
  nearest: number | null;

  step: KStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `posed` · `rings` · `captured` · `verdicts` · `nearest` 는 전부 걸어온 자취라 여기
 * 넣지 않는다 — 넣으면 되감은 화면이 이미 자란 테두리와 기운 저울을 단 채로 서고
 * 그 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<KChangesBoundaryScene, 'query' | 'points' | 'ks'>;

/**
 * 되돌린 뒤의 장면 — 점과 물음표 카드만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): KChangesBoundaryScene {
  return {
    query: base.query,
    points: base.points,
    ks: base.ks,
    posed: false,
    rings: [],
    captured: [],
    verdicts: [],
    nearest: null,
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

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 점의 칠도 표의 수도 캡션의 수도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/**
 * 이름표가 처음 나타난 차례.
 *
 * **색판의 크기가 여기서 한 번에 나온다.** 지금까지 드러난 수로 정하면 이름표가
 * 늘어나는 순간 hue 간격이 통째로 갈린다 (바탕 자료에서 한 번에 센다).
 */
export function labelsOf(scene: KChangesBoundaryScene): string[] {
  const seen: string[] = [];
  for (const p of scene.points) if (!seen.includes(p.label)) seen.push(p.label);
  return seen;
}

/** 슬롯 i 에서 실제로 담기는 이웃의 수. 점의 수가 상한이라 algorithm 과 나눠 쓴다. */
export function kAt(scene: KChangesBoundaryScene, slot: number): number {
  const raw = scene.ks[slot];
  return raw === undefined ? 0 : effectiveK(scene.points.length, raw);
}

/** 지금 선 테두리의 슬롯. 아직 안 자랐으면 -1. */
export function currentSlot(scene: KChangesBoundaryScene): number {
  return scene.rings.length - 1;
}

/** 지금 묻고 있는 k. 아직 안 물었으면 0. */
export function currentK(scene: KChangesBoundaryScene): number {
  return kAt(scene, currentSlot(scene));
}

/**
 * 가장 가까운 `upTo` 개만 세었을 때 이름표마다의 표.
 *
 * `captured` 는 가까운 차례대로 쌓이므로 앞에서 자르는 것이 곧 "가장 가까운 k 개"
 * 다. 표를 세는 자리 순서는 `labelsOf` 가 정한다.
 */
export function countsUpTo(scene: KChangesBoundaryScene, upTo: number): number[] {
  const labels = labelsOf(scene);
  const counts = labels.map(() => 0);
  for (const index of scene.captured.slice(0, Math.max(0, upTo))) {
    const point = scene.points[index];
    if (point === undefined) continue;
    const at = labels.indexOf(point.label);
    if (at >= 0) counts[at] += 1;
  }
  return counts;
}

/**
 * 마지막으로 **세어 낸** 표. 저울의 기울기가 여기서 나온다.
 *
 * 담긴 이웃이 아니라 세어 낸 이웃을 센다 — 표가 저울에 하나씩 얹히는 동안에는
 * 저울이 아직 기울지 않아야 하기 때문이다.
 */
export function settledCounts(scene: KChangesBoundaryScene): number[] {
  const settled = scene.verdicts.length;
  return settled === 0 ? labelsOf(scene).map(() => 0) : countsUpTo(scene, kAt(scene, settled - 1));
}

/** 그 답이 바로 앞의 답을 뒤집은 것인가. 첫 답은 뒤집은 것이 아니다. */
export function flippedAt(scene: KChangesBoundaryScene, slot: number): boolean {
  const now = scene.verdicts[slot];
  const before = scene.verdicts[slot - 1];
  return now !== undefined && before !== undefined && now !== before;
}

/** 카드에 새겨진 답. 아직 아무것도 안 세었으면 null 이라 물음표가 선다. */
export function currentVerdict(scene: KChangesBoundaryScene): string | null {
  return scene.verdicts[scene.verdicts.length - 1] ?? null;
}

export const kChangesBoundaryScene: ScenePlan<KChangesBoundaryScene> = {
  /**
   * 첫 장면은 점과 물음점만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): KChangesBoundaryScene {
    const d = fields(initialData) ?? {};
    const rawQuery = fields(d.query) ?? {};
    const qx = num(rawQuery.x) ?? 0;
    const qy = num(rawQuery.y) ?? 0;

    const points: ScenePoint[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        if (p === null) continue;
        const x = num(p.x);
        const y = num(p.y);
        if (x === null || y === null || typeof p.label !== 'string') continue;
        points.push({ x, y, label: p.label });
      }
    }

    const ks: number[] = [];
    if (Array.isArray(d.ks)) {
      for (const raw of d.ks) {
        const k = num(raw);
        if (k !== null) ks.push(k);
      }
    }

    return atStart({ query: { x: qx, y: qy }, points, ks });
  },

  reduce(scene: KChangesBoundaryScene, event: FacetRuntimeEvent): KChangesBoundaryScene {
    const p = fields(event.payload);

    switch (event.type) {
      /* 물음점이 선다. 이름표가 없다는 것을 한 번 두드려 보이는 걸음이다. */
      case 'question-posed':
        return { ...scene, posed: true, step: { kind: 'pose' } };

      /*
       * 테두리가 자란다. 반지름은 이웃 거리에서 나온 값이라 걸음이 싣는다 —
       * 장면이 다시 풀면 조각이 피하려는 셈을 장면이 하게 된다.
       */
      case 'ring-grow': {
        const radius = num(p?.radius);
        if (radius === null) return scene;
        return { ...scene, rings: [...scene.rings, radius], step: { kind: 'grow' } };
      }

      /*
       * 이웃 하나가 담긴다. 이름표도 표의 수도 여기서 셈하지 않는다 — 인덱스 하나면
       * 바탕이 나머지를 말한다.
       */
      case 'neighbor-captured': {
        const index = toIndexArray(event.target)[0];
        if (typeof index !== 'number') return scene;
        if (scene.points[index] === undefined) return scene;
        if (scene.captured.includes(index)) return scene;
        return { ...scene, captured: [...scene.captured, index], step: { kind: 'capture' } };
      }

      /*
       * 답이 정해진다. 뒤집혔는지는 여기서 가리지 않는다 — 자취에 앞선 답이 있으므로
       * 이웃한 두 자리를 견주면 나온다.
       */
      case 'tally-settled': {
        if (typeof p?.verdict !== 'string') return scene;
        return { ...scene, verdicts: [...scene.verdicts, p.verdict], step: { kind: 'settle' } };
      }

      /* 맺음. target 이 가장 가까운 이웃이고, 카드의 답은 이미 자취에 있다. */
      case 'done': {
        const index = toIndexArray(event.target)[0];
        if (typeof index !== 'number') return scene;
        if (scene.points[index] === undefined) return scene;
        return { ...scene, nearest: index, step: { kind: 'conclude' } };
      }

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ query: scene.query, points: scene.points, ks: scene.ks });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
