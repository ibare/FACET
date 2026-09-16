/**
 * fewerHopsNotShorter 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 무대의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 두 길이 같은 출발선에서 나란히 눕는다. 처음에는 간선 하나가 모두 같은 길이라
 * 간선을 적게 밟는 길이 먼저 끝난다. 간선마다 무게를 재기 시작하면 그 간선이 제
 * 무게만큼 늘거나 줄고, 뒤따르는 정점이 통째로 밀려 도착점이 자리를 바꾼다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 무대의 `let` 과 **타입 선언** 두 자리에 숨겨 두었다.
 *
 * - **`Seg.weighed`** — 이 간선을 이미 재었나. `Seg` 가 DOM 손잡이(`line`·`label`)와
 *   함께 묶여 있어 `const`/`let` 어느 grep 에도 안 걸렸다. 그런데 차선의 길이가
 *   통째로 이 깃발에서 나온다 (안 잰 간선은 간선 수 축척, 잰 간선은 무게 축척).
 *   **화면의 가로 길이가 곧 이 조각의 주장**이므로 이것이 가장 무거운 상태였다.
 *   이제 `weighed` 가 말한다.
 * - **`Seg.len`** — 지금 그려지는 길이. 위 깃발에서 파생되는 값인데 제자리에서
 *   고쳐져 되짚을 길이 없었다. 장면에는 담지 않는다 — 좌표이자 파생값이라 그리는
 *   쪽이 `weighed` 에서 셈한다 (S-piece).
 * - **`verdictLane` · `verdictPrev` · `verdictBlend`** — 지금 가장 짧다고 주장되는
 *   길. **이 조각의 결론 그 자체**인데 무대의 `let` 세 개로만 있었다. `byHops` 와
 *   `byWeight` 로 갈라 올린다.
 * - **`hopUnit` · `weightUnit`** — 축척. `routes-found` 가 실어 오던 `maxHops` ·
 *   `maxTotalWeight` 를 받아 쥐고 있었다. 길 목록에서 한 번에 셈해지므로 장면이
 *   센다 (`maxHopsOf` · `maxWeightOf`).
 * - **`hopBadge.textContent` · `weightBadge.textContent`** — 간선 수와 지금까지의
 *   무게. 글자로만 있어 되짚으면 사라졌다. `counted` 와 `weighed` 가 말한다.
 * - projector 의 **`let routes`** — 캡션이 길 이름과 간선 수를 다시 쓰려고 쥐던
 *   그림자. `routes` 필드가 그 자리를 잇는다.
 *
 * ── 두 판정을 갈라 둔 까닭
 *
 * 옮기기 전에는 판정이 하나뿐이라 (`setVerdict(routeId)`) 무게로 재고 나면 **간선
 * 수로 이겼던 쪽의 표식이 지워졌다.** 그러면 완주 화면이 "이쪽이 짧다" 만 말하고
 * "간선은 저쪽이 적은데" 를 말하지 않는다 — 이 조각이 하려는 말의 절반이 사라진
 * 자리다. 그래서 어휘를 가른다.
 *
 * | 표식 | 뜻 | 어디에 |
 * | --- | --- | --- |
 * | **채움**(accent) | 지금 가장 짧다고 주장되는 도착점 | `byWeight ?? byHops` |
 * | **테두리**(accent 테) | 간선 수로는 이쪽이 적었다 | `byHops` |
 *
 * 끝 화면에 테는 간선 둘짜리 길에, 채움은 간선 넷짜리 길에 남는다. 그림 하나가
 * 조각의 문장을 그대로 말한다.
 *
 * 좌표는 담지 않는다. 길·간선·무게 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 선언에 적힌 간선 하나. `id` 는 target prefix 를 벗긴 알맹이다 (`S-A`). */
export type FewerHopsNotShorterEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
};

/**
 * 출발에서 도착까지의 길 하나.
 *
 * 간선 수를 담지 않는다 — `edgeIds.length` 가 곧 그 수다. 옮기기 전에는 `hops` 가
 * payload 로 따로 실려 와 같은 물음에 답이 둘이었다.
 */
export type FewerHopsNotShorterRoute = {
  id: string;
  /** 출발부터 도착까지의 정점 이름 (출발 포함). */
  nodes: string[];
  /** 밟는 간선의 id. 순서가 곧 밟는 차례다. */
  edgeIds: string[];
};

/** 무게를 잰 간선 하나. 같은 간선이 두 길에 있을 수 있어 길과 짝으로 적는다. */
export type FewerHopsNotShorterWeighed = { routeId: string; edgeId: string };

/** 견줌의 결과 — 어느 길을 골랐고 무엇과 견주었나. 걸음이 내리는 판정이다. */
export type FewerHopsNotShorterPick = { routeId: string; rivalId: string | null };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type FewerHopsNotShorterCaption =
  | { kind: 'twoRoutes' }
  | { kind: 'countHops' }
  | { kind: 'fewerHops'; routeId: string; rivalId: string | null }
  | { kind: 'weighing'; routeId: string }
  | { kind: 'reversed'; routeId: string; rivalId: string | null };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * `verdict` 의 `from` 은 판정선이 서 있던 차선이다. 운동이 그 자리에서 출발하는데
 * 그것을 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene) 계기값을
 * 장면이 말하게 한다.
 */
export type FewerHopsNotShorterStep =
  | { kind: 'routes' }
  | { kind: 'hops'; routeId: string }
  | { kind: 'weigh'; routeId: string; edgeId: string }
  | { kind: 'verdict'; by: 'hops' | 'weight'; routeId: string; from: string | null };

export type FewerHopsNotShorterScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  source: string;
  target: string;
  /** 선언에 적힌 간선. 무게를 여기서 찾는다. */
  edges: FewerHopsNotShorterEdge[];

  // ── 걸어온 자취.
  /** 찾아낸 길. 아직 안 열렸으면 빈 배열이다. */
  routes: FewerHopsNotShorterRoute[];
  /** 간선 수를 센 길. 배지가 올라오고 남는다. */
  counted: string[];
  /** 무게를 잰 간선. 쌓이는 것이 차선의 길이를 정한다. */
  weighed: FewerHopsNotShorterWeighed[];
  /** 간선 수로 고른 쪽. 머무는 표식이라 뒤집힌 뒤에도 테두리로 남는다. */
  byHops: FewerHopsNotShorterPick | null;
  /** 무게로 고른 쪽. 판정선과 채움이 여기 선다. */
  byWeight: FewerHopsNotShorterPick | null;
  step: FewerHopsNotShorterStep | null;
  caption: FewerHopsNotShorterCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `routes` 는 여기 들지 않는다 — `routes-found` 가 세우는 자취라 그대로 넘기면
 * 되감아도 차선이 남는다.
 */
type FewerHopsNotShorterBase = Pick<FewerHopsNotShorterScene, 'source' | 'target' | 'edges'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: FewerHopsNotShorterBase): FewerHopsNotShorterScene {
  return {
    source: base.source,
    target: base.target,
    edges: base.edges,
    routes: [],
    counted: [],
    weighed: [],
    byHops: null,
    byWeight: null,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `edge:S-A` → `S-A`. 식별자 파싱은 언제나 parseTarget 경유 (C1). */
function edgeIdOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = parseTarget(value);
  if (!parsed || parsed.prefix !== 'edge' || parsed.id.length === 0) return null;
  return parsed.id;
}

/** target 은 하나일 수도 여럿일 수도 있다. 이 조각은 언제나 하나를 짚는다. */
function firstTarget(target: string | string[] | undefined): unknown {
  return Array.isArray(target) ? target[0] : target;
}

/** 선언에서 간선을 좁힌다. 값만 베껴 담아 참조를 쥐지 않는다 (S-scene). */
function readEdges(value: unknown): FewerHopsNotShorterEdge[] {
  if (!Array.isArray(value)) return [];
  const edges: FewerHopsNotShorterEdge[] = [];
  for (const item of value) {
    const e = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof e?.from !== 'string' || typeof e?.to !== 'string') continue;
    if (typeof e?.weight !== 'number' || !Number.isFinite(e.weight)) continue;
    edges.push({ id: `${e.from}-${e.to}`, from: e.from, to: e.to, weight: e.weight });
  }
  return edges;
}

/** 발신이 실어 온 길 목록을 좁힌다. */
function readRoutes(value: unknown): FewerHopsNotShorterRoute[] {
  if (!Array.isArray(value)) return [];
  const routes: FewerHopsNotShorterRoute[] = [];
  for (const item of value) {
    const r = item as { id?: unknown; nodes?: unknown; edgeIds?: unknown };
    const id = str(r?.id);
    if (id === '' || !Array.isArray(r?.edgeIds)) continue;
    const edgeIds: string[] = [];
    for (const raw of r.edgeIds) {
      const edgeId = edgeIdOf(raw);
      if (edgeId !== null) edgeIds.push(edgeId);
    }
    if (edgeIds.length === 0) continue;
    routes.push({ id, nodes: names(r?.nodes), edgeIds });
  }
  return routes;
}

// ── 파생. 그리는 쪽이 부른다. 같은 물음에 답이 하나만 있게 하는 자리다 ─────────

/** 그 길이 밟는 간선의 수. 구조가 곧 답이라 payload 로 받지 않는다. */
export function hopsOf(route: FewerHopsNotShorterRoute): number {
  return route.edgeIds.length;
}

export function routeOf(
  scene: FewerHopsNotShorterScene,
  routeId: string | null,
): FewerHopsNotShorterRoute | null {
  if (routeId === null) return null;
  return scene.routes.find((r) => r.id === routeId) ?? null;
}

/** 선언에 적힌 그 간선의 무게. 없는 간선이면 0 이다. */
export function weightOf(scene: FewerHopsNotShorterScene, edgeId: string): number {
  return scene.edges.find((e) => e.id === edgeId)?.weight ?? 0;
}

/** 이 길의 이 간선을 이미 재었나. 차선의 길이가 통째로 이 답에서 나온다. */
export function isWeighed(
  scene: FewerHopsNotShorterScene,
  routeId: string,
  edgeId: string,
): boolean {
  return scene.weighed.some((w) => w.routeId === routeId && w.edgeId === edgeId);
}

/**
 * 지금까지 잰 무게의 합.
 *
 * 배지의 글자도 캡션의 수도 차선의 길이도 전부 이 하나를 쓴다 — 조각의 결론이
 * 그림과 같은 자료를 쓰게 하는 자리다.
 */
export function weighedTotalOf(scene: FewerHopsNotShorterScene, routeId: string | null): number {
  const route = routeOf(scene, routeId);
  if (!route) return 0;
  let sum = 0;
  for (const edgeId of route.edgeIds) {
    if (isWeighed(scene, route.id, edgeId)) sum += weightOf(scene, edgeId);
  }
  return sum;
}

/** 다 재었을 때의 무게 합. 축척을 처음에 한 번 정하는 데만 쓴다. */
function fullTotalOf(scene: FewerHopsNotShorterScene, route: FewerHopsNotShorterRoute): number {
  let sum = 0;
  for (const edgeId of route.edgeIds) sum += weightOf(scene, edgeId);
  return sum;
}

/**
 * 간선 수 축척의 상한. 길 목록 전체에서 한 번에 센다.
 *
 * "지금까지 드러난 수" 로 정하면 길이 하나 더 열릴 때 이미 그린 차선의 길이가
 * 통째로 갈린다. 길 목록은 `routes-found` 한 번에 다 오므로 그럴 일이 없지만,
 * 셈의 출처를 바탕 자료로 못박아 둔다.
 */
export function maxHopsOf(scene: FewerHopsNotShorterScene): number {
  let max = 0;
  for (const r of scene.routes) max = Math.max(max, hopsOf(r));
  return max;
}

/** 무게 축척의 상한. 재는 도중에 바뀌지 않도록 **다 잰 뒤의** 합으로 잰다. */
export function maxWeightOf(scene: FewerHopsNotShorterScene): number {
  let max = 0;
  for (const r of scene.routes) max = Math.max(max, fullTotalOf(scene, r));
  return max;
}

/** 판정선과 채움이 선 차선. 무게로 고른 쪽이 있으면 그쪽이 이긴다. */
export function verdictRouteOf(scene: FewerHopsNotShorterScene): string | null {
  return scene.byWeight?.routeId ?? scene.byHops?.routeId ?? null;
}

export const fewerHopsNotShorterScene: ScenePlan<FewerHopsNotShorterScene> = {
  /**
   * 첫 장면은 바탕만 세운다. 길은 `routes-found` 가 연다.
   *
   * 넘겨받은 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은
   * mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간
   * 자료로 바탕을 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): FewerHopsNotShorterScene {
    const d = (initialData ?? {}) as { source?: unknown; target?: unknown; edges?: unknown };
    return atStart({ source: str(d.source), target: str(d.target), edges: readEdges(d.edges) });
  },

  reduce(
    scene: FewerHopsNotShorterScene,
    event: FacetRuntimeEvent,
  ): FewerHopsNotShorterScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 길을 다 찾았다. 두 차선이 출발선에서 뻗어 나온다.
      case 'routes-found': {
        const routes = readRoutes(p.routes);
        if (routes.length === 0) return scene;
        return { ...scene, routes, step: { kind: 'routes' }, caption: { kind: 'twoRoutes' } };
      }

      // 이 길이 밟는 간선의 수를 센다. 몇인지는 장면이 안다.
      case 'hops-counted': {
        const routeId = str(p.routeId);
        if (routeOf(scene, routeId) === null) return scene;
        return {
          ...scene,
          counted: [...scene.counted, routeId],
          step: { kind: 'hops', routeId },
          caption: { kind: 'countHops' },
        };
      }

      // 전제의 결론 — 간선 수로는 이쪽이 적다.
      case 'hops-verdict': {
        const routeId = str(p.routeId);
        if (routeOf(scene, routeId) === null) return scene;
        const rivalId = routeOf(scene, str(p.rivalId))?.id ?? null;
        return {
          ...scene,
          byHops: { routeId, rivalId },
          step: { kind: 'verdict', by: 'hops', routeId, from: verdictRouteOf(scene) },
          caption: { kind: 'fewerHops', routeId, rivalId },
        };
      }

      // 간선 하나가 제 무게만큼 늘거나 준다. 뒤따르는 정점이 통째로 밀린다.
      case 'edge-weighed': {
        const routeId = str(p.routeId);
        const edgeId = edgeIdOf(firstTarget(event.target));
        if (edgeId === null || routeOf(scene, routeId) === null) return scene;
        return {
          ...scene,
          weighed: [...scene.weighed, { routeId, edgeId }],
          step: { kind: 'weigh', routeId, edgeId },
          caption: { kind: 'weighing', routeId },
        };
      }

      // 결론 — 무게로 재면 순위가 뒤집힌다. 판정선이 차선을 건넌다.
      case 'weight-verdict': {
        const routeId = str(p.routeId);
        if (routeOf(scene, routeId) === null) return scene;
        const rivalId = routeOf(scene, str(p.rivalId))?.id ?? null;
        return {
          ...scene,
          byWeight: { routeId, rivalId },
          step: { kind: 'verdict', by: 'weight', routeId, from: verdictRouteOf(scene) },
          caption: { kind: 'reversed', routeId, rivalId },
        };
      }

      case 'rewind':
        // 걸음이 고치는 것은 바탕이 아니다. 선언에서 다시 세운다.
        return atStart({ source: scene.source, target: scene.target, edges: scene.edges });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
