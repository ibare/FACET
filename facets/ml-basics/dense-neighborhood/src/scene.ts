/**
 * denseNeighborhood 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 도 조회 분기도 없었다. **상태는 전부 stage 에 있었고 다섯
 * 자리였다.**
 *
 * - **`finish()` 가 제 칠을 도로 읽었다** — `if (node.getAttribute('stroke') ===
 *   c.textMuted) continue;`. 뜻은 "이 점은 불이 끝내 닿지 않은 점인가" 였다. 점은
 *   무리에 들 때 `paint()` 가 `stroke` 를 무리 색으로 갈아 끼우므로, **테두리가 아직
 *   기본색이라는 것**이 곧 "어느 무리에도 안 들었다" 였던 것이다. 같은 물음에 답이
 *   둘이고(화면의 칠과 algorithm 의 `label`), 되짚어 세운 직후에는 그 칠이 옛 화면의
 *   것이라 부풀릴 점과 건너뛸 점이 뒤바뀐다. 지금은 `clusters` 가 그 답을 쥔다.
 * - `let spanX` · `let spanY` · `let midX` · `let midY` — **연속 좌표의 척도.**
 *   화면의 모든 자리가 `fx` · `fy` 를 지나고 그 둘이 이 넷을 읽었다. `mount` 이
 *   한 번 셈해 적어 둔 값이라 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다.
 *   지금은 바탕의 점과 eps 에서 `render` 가 매번 셈한다 — 장면이 담는 것은 픽셀이
 *   아니라 **값의 범위**다 (S-piece).
 * - `const openDisks = new Map<number, SVGCircleElement>()` — 손잡이 맵처럼 보이지만
 *   **자리가 있느냐가 곧 "이 점이 지금 앞자락인가"** 였다. `closeDisks(keep)` 가
 *   `keep` 에 없는 것만 오므리는 것이 그 증거다. 지금은 마지막 물결의 닿은 점에서
 *   파생한다 (`openFrontier`).
 * - `const bucket = new Map<number, number>()` — 손잡이가 아니라 **수**를 담는 맵이다.
 *   거리 눈금에서 같은 값끼리 옆으로 나란히 설 때 **몇 번째 자리인가**를 적어 두었다.
 *   값이 아니라 **넣은 차례**가 가로 자리를 정하던 자리라, 걸음을 건너뛰어 세우면
 *   같은 점이 다른 칸에 앉는다. 지금은 자취 전체를 정해진 차례로 한 번 훑어 센다
 *   (`axisMarks`).
 * - `let linkNodes: SVGLineElement[]` — **지금까지 그은 이음 전부.** `finish()` 가
 *   이 배열로만 굵기를 올렸고, 다시 그릴 길이 없었다. 지금은 `clusters` 의 물결이
 *   그 목록이다.
 * - `type Scene = { points, eps }` — 이름이 장면과 부딪혀 있었다. 좁히개가 통째로
 *   여기로 옮겨 오며 stage 에서 사라졌다.
 *
 * ── 이웃을 세는 것은 내주지 않는다 (프로토콜 4 절 B 갈래의 경계)
 *
 * **eps 안의 이웃을 세고 번짐을 이어 가는 셈이 이 조각의 알고리즘 그 자체다.**
 * 장면이 그것을 다시 풀면 조각이 피하려는 셈을 장면이 하게 되고 발신이 장식이 된다.
 * 그래서 **판정만** 싣는다 — 어느 점에 불씨를 놓았나(`index`), 그 점의 eps 안 이웃이
 * 몇인가(`neighborCount`), 이번 겹에 어느 쌍이 이어졌나(`links`), 가장 가까운데도
 * 못 붙은 쌍은 무엇인가(`rejected`), 번짐이 어디서 멎었나(`blocked`).
 *
 * 나머지는 전부 걷어냈다. **무리 번호**는 불씨가 하나씩 쌓이므로 `clusters.length`
 * 가 그 번호이고, **무리에 든 점 수**는 물결의 닿은 점을 세면 나오며, **무리마다의
 * 크기**도 같은 자리에서 나온다. **쌍의 거리**는 두 점을 알면 `Math.hypot` 하나로
 * 나오는 순수 함수라 — 탐색이 아니다 — 장면이 셈한다. 그래서 화면에 뜨는 거리는
 * 눈금에 앉는 점도, 벌어짐에 달리는 숫자도, 캡션의 수도 전부 `distanceOf` 하나를
 * 지난다.
 *
 * ── 번지지 못한 자리가 논증의 절반이다
 *
 * 이 조각의 주장은 "이웃이 넉넉한 데까지만 번진다" 이고, 그 결정타는 **번지지 못한
 * 자리**다. 옛 화면에서 그것이 살아남은 것은 `gGap` 과 `gDot` 에 칠이 *쌓이고*
 * 있었기 때문이다 — 되돌리는 명령이 없어서. 장면으로 옮기면 그 누적이 저절로
 * 사라지므로, `clusters[i].blocked` 와 `waves[j].reject` 를 **일부러 자취로 올려**
 * 정적 그리기가 매번 다시 세운다.
 *
 * 좌표는 담지 않는다. 점의 값과 eps 라는 **구조**만 담고 화면 자리는 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지는
 * `step` 과 자취에서 파생되고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 자료 좌표의 점 하나. 값이지 자리가 아니다. */
export type DensePoint = { x: number; y: number };

/** 두 점을 가리키는 쌍. 거리는 담지 않는다 — 두 점을 알면 셈해진다. */
export type DensePair = { from: number; to: number };

/** 물결 한 겹. */
export type DenseWave = {
  /**
   * 이번 겹에 이어 붙은 쌍들.
   *
   * 한 점이 두 앞자락에서 닿으면 **쌍은 둘, 점은 하나**다. 그래서 이 배열의 길이가
   * 곧 새로 든 점 수는 아니다 — 점을 셀 때는 `to` 를 겹치지 않게 모은다.
   */
  links: readonly DensePair[];
  /**
   * 이 겹의 앞자락에서 **가장 가까운데도** eps 밖이라 못 붙은 쌍. 없으면 null.
   *
   * 거리 눈금의 위쪽 무더기가 여기서 나온다. 못 붙은 것이 보여야 붙은 것의 뜻이 선다.
   */
  reject: DensePair | null;
};

/** 불씨 하나가 낸 무리. */
export type DenseCluster = {
  /** 불씨를 놓은 점. */
  seed: number;
  /**
   * 그 점의 eps 안 이웃 수 (자기 자신을 넣는다).
   *
   * **거리 셈이라 걸음이 싣는 판정이다** — 장면이 다시 세면 조각의 알고리즘을
   * 장면이 되풀이하는 꼴이 된다.
   */
  neighborCount: number;
  /** 물결. 겹이 쌓인 차례대로. */
  waves: readonly DenseWave[];
  /**
   * 번짐이 멎은 자리 — 무리 안과 무리 밖에서 **가장 가까운 한 쌍**.
   *
   * 밖에 남은 점이 없으면 null 이다. 이 쌍이 곧 "무리가 왜 여기서 그쳤나" 의 답이라
   * 완주 화면까지 남는다.
   */
  blocked: DensePair | null;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 오므라드는 원이 어디에 서 있었는지도, 이음이 어디서
 * 뻗어 나오는지도 전부 자취 한 칸을 물려 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type DenseStep =
  /** 불씨가 놓이고 그 자리에서 eps 원이 자란다. */
  | { kind: 'ignite' }
  /** 물결 한 겹 — 이음이 뻗고, 닿은 자리에서 새 원이 자라고, 앞의 원이 오므라든다. */
  | { kind: 'spread' }
  /** 번짐이 멎는다. 손이 닿지 않는 만큼이 그어진다. */
  | { kind: 'blocked' }
  /** 불이 다 앉는다. */
  | { kind: 'settle' };

export type DenseNeighborhoodScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 자료 좌표의 점 열. 차례가 곧 발신이 가리키는 인덱스다. */
  points: readonly DensePoint[];
  /** 이웃으로 치는 거리. 눈금을 가르는 줄이 여기서 선다. */
  eps: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 불이 앉은 무리들, 불씨가 놓인 차례대로. 길이가 곧 무리의 수다. */
  clusters: readonly DenseCluster[];
  /** 불이 다 앉았나. 마지막 걸음에서 참이 되고 이음과 점이 굵어진다. */
  settled: boolean;

  step: DenseStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `clusters` · `settled` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 번진 불을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는 것이
 * 겹친다 (S-scene).
 */
type Base = Pick<DenseNeighborhoodScene, 'points' | 'eps'>;

/**
 * 되돌린 뒤의 장면 — 점과 눈금만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): DenseNeighborhoodScene {
  return { points: base.points, eps: base.eps, clusters: [], settled: false, step: null };
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

/** 두 점을 가리키는 쌍 하나. 인덱스가 바탕 밖이면 버린다. */
function readPair(v: unknown, count: number): DensePair | null {
  const f = fields(v);
  if (f === null) return null;
  const from = num(f.from);
  const to = num(f.to);
  if (from === null || to === null) return null;
  if (from < 0 || from >= count || to < 0 || to >= count) return null;
  return { from, to };
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 눈금에 앉는 거리도, 벌어짐에 달리는 숫자도,
// 캡션의 수도 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * 쌍 하나의 거리.
 *
 * **이것은 내주는 함수가 아니라 장면이 셈하는 것이다** — 두 점을 이미 알고 있을 때의
 * `Math.hypot` 은 탐색이 아니라 자로 재는 일이고, 어느 쌍을 잴지는 걸음이 이미
 * 정해 주었다. 어느 쌍이 이웃인지 **찾는** 셈만 algorithm 의 몫이다.
 */
export function distanceOf(scene: DenseNeighborhoodScene, pair: DensePair): number {
  const a = scene.points[pair.from];
  const b = scene.points[pair.to];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 이음들이 닿은 점, 겹치지 않게 닿은 차례대로. */
export function targetsOf(links: readonly DensePair[]): number[] {
  const seen: number[] = [];
  for (const link of links) if (!seen.includes(link.to)) seen.push(link.to);
  return seen;
}

/**
 * 물결 `waveCount` 겹을 지난 뒤의 앞자락.
 *
 * 0 이면 불씨 하나뿐이다. 오므라드는 원의 **출발 자리**도 여기서 나온다 — 자취 한
 * 칸을 물려 부르면 되므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export function frontierAt(cluster: DenseCluster, waveCount: number): number[] {
  if (waveCount <= 0) return [cluster.seed];
  const wave = cluster.waves[waveCount - 1];
  return wave === undefined ? [cluster.seed] : targetsOf(wave.links);
}

/**
 * 지금 eps 원이 열려 있는 점들.
 *
 * 번짐이 멎었거나(`blocked`) 불이 다 앉았으면 하나도 열려 있지 않다 — 옛 stage 의
 * `closeDisks(new Set())` 가 그 자리였다.
 */
export function openFrontier(scene: DenseNeighborhoodScene): number[] {
  const last = scene.clusters[scene.clusters.length - 1];
  if (last === undefined || scene.settled || last.blocked !== null) return [];
  return frontierAt(last, last.waves.length);
}

/** 그 무리에 든 점들, 든 차례대로. 불씨가 맨 앞이다. */
export function membersOf(cluster: DenseCluster): number[] {
  const out = [cluster.seed];
  for (const wave of cluster.waves) {
    for (const index of targetsOf(wave.links)) if (!out.includes(index)) out.push(index);
  }
  return out;
}

/** 점마다 든 무리의 차례 (0 부터). 어느 무리에도 안 들었으면 null. */
export function membershipOf(scene: DenseNeighborhoodScene): (number | null)[] {
  const out: (number | null)[] = scene.points.map(() => null);
  scene.clusters.forEach((cluster, at) => {
    for (const index of membersOf(cluster)) {
      if (index >= 0 && index < out.length) out[index] = at;
    }
  });
  return out;
}

/** 무리마다의 크기, 무리 번호 순. 맺음 캡션의 목록이 여기서 나온다. */
export function sizesOf(scene: DenseNeighborhoodScene): number[] {
  return scene.clusters.map((cluster) => membersOf(cluster).length);
}

/** 거리 눈금에 앉는 자국 하나. 어느 무리의 것인지도 함께 안다. */
export type DenseMark = {
  /** 이었나 · 못 이었나 · 거기서 멎었나. 어휘를 가른다. */
  kind: 'link' | 'reject' | 'blocked';
  /** 같은 자국을 두 번 세지 않게 가르는 이름. 그리는 쪽이 손잡이를 이 이름으로 쥔다. */
  key: string;
  pair: DensePair;
  /** 그 자국을 낸 무리의 차례. 이은 자국의 빛깔이 여기서 나온다. */
  cluster: number;
};

/**
 * 눈금에 앉는 자국 전부를, **앉은 차례대로.**
 *
 * 차례가 뜻을 갖는다 — 같은 거리끼리 옆으로 나란히 설 때 몇 번째 칸인가가 이 차례로
 * 정해진다. 옛 stage 는 그것을 `bucket` 맵에 적어 두어 *그려 온 역사*가 가로 자리를
 * 정했고, 걸음을 건너뛰어 세우면 같은 자국이 다른 칸에 앉았다. 여기서는 자취 전체를
 * 한 번 훑으므로 어느 걸음에서 오든 같은 차례가 나온다.
 */
export function axisMarks(scene: DenseNeighborhoodScene): DenseMark[] {
  const out: DenseMark[] = [];
  scene.clusters.forEach((cluster, ci) => {
    cluster.waves.forEach((wave, wi) => {
      wave.links.forEach((pair, li) => {
        out.push({ kind: 'link', key: `l:${ci}:${wi}:${li}`, pair, cluster: ci });
      });
      if (wave.reject !== null) {
        out.push({ kind: 'reject', key: `r:${ci}:${wi}`, pair: wave.reject, cluster: ci });
      }
    });
    if (cluster.blocked !== null) {
      out.push({ kind: 'blocked', key: `b:${ci}`, pair: cluster.blocked, cluster: ci });
    }
  });
  return out;
}

export const denseNeighborhoodScene: ScenePlan<DenseNeighborhoodScene> = {
  /**
   * 첫 장면은 점과 눈금만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): DenseNeighborhoodScene {
    const d = fields(initialData) ?? {};
    const points: DensePoint[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        if (p === null) continue;
        const x = num(p.x);
        const y = num(p.y);
        if (x === null || y === null) continue;
        points.push({ x, y });
      }
    }
    return atStart({ points, eps: num(d.eps) ?? 0 });
  },

  reduce(scene: DenseNeighborhoodScene, event: FacetRuntimeEvent): DenseNeighborhoodScene {
    const f = fields(event.payload);
    const count = scene.points.length;

    switch (event.type) {
      /* 불씨가 놓인다. 무리 번호는 싣지 않는다 — 불씨가 하나씩 쌓이므로 차례가 곧 번호다. */
      case 'ignite': {
        const index = num(f?.index);
        const neighborCount = num(f?.neighborCount);
        if (index === null || neighborCount === null) return scene;
        if (index < 0 || index >= count) return scene;
        return {
          ...scene,
          clusters: [...scene.clusters, { seed: index, neighborCount, waves: [], blocked: null }],
          step: { kind: 'ignite' },
        };
      }

      /* 물결 한 겹이 지금 타고 있는 무리에 얹힌다. 앞 무리는 그대로 둔다. */
      case 'spread': {
        const at = scene.clusters.length - 1;
        const cluster = scene.clusters[at];
        if (cluster === undefined) return scene;
        const links: DensePair[] = [];
        if (Array.isArray(f?.links)) {
          for (const raw of f.links) {
            const pair = readPair(raw, count);
            if (pair !== null) links.push(pair);
          }
        }
        if (links.length === 0) return scene;
        const wave: DenseWave = { links, reject: readPair(f?.rejected, count) };
        const next = { ...cluster, waves: [...cluster.waves, wave] };
        return {
          ...scene,
          clusters: [...scene.clusters.slice(0, at), next],
          step: { kind: 'spread' },
        };
      }

      /* 번짐이 멎는다. 그 쌍이 이 무리의 테두리를 말한다. */
      case 'blocked': {
        const at = scene.clusters.length - 1;
        const cluster = scene.clusters[at];
        if (cluster === undefined) return scene;
        const pair = readPair(event.payload, count);
        if (pair === null) return scene;
        return {
          ...scene,
          clusters: [...scene.clusters.slice(0, at), { ...cluster, blocked: pair }],
          step: { kind: 'blocked' },
        };
      }

      /* 맺음. 무리의 수도 크기도 자취에 이미 있으므로 실어 올 것이 없다. */
      case 'done':
        return { ...scene, settled: true, step: { kind: 'settle' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ points: scene.points, eps: scene.eps });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
