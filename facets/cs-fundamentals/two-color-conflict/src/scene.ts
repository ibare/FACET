/**
 * twoColorConflict 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 정점이 한 줄로 서고 변이 그 사이를 잇는다. 걸음마다 달라지는 것은 둘이다 —
 * **어느 정점이 어느 색으로 칠해졌는가**, 그리고 고리를 닫는 마지막 변이 섰는가.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 없었고, stage 의 `let` 셋은 전부 DOM 손잡이나
 * 폭에서 역산한 값이었다. 상태는 모두 stage 의 **모듈 스코프 선언**과 **DOM 속성**에
 * 있었다.
 *
 * - `painted: Map<string, number>` — **어느 정점이 어느 색인가.** 이 조각의 주장
 *   그 자체인데 `paintStep()` 명령의 부수 효과로만 켜졌다. 더 나쁜 것은 `closeStep()`
 *   이 그 맵을 **도로 읽어** 마지막 두 알의 색을 정한 자리다. algorithm 은 `colorA` ·
 *   `colorB` 를 payload 로 보내고 있었는데 아무도 읽지 않았으니, 같은 물음에 답이
 *   둘이었다. 되짚어 세운 직후에는 맵이 옛 화면의 것이라 두 알이 엉뚱한 색으로 온다.
 *   이제 `painted` 가 장면의 필드이고 정적 그리기도 그것으로 칠한다.
 * - `dangerRings: Map<string, SVGCircleElement>` — **어느 두 끝이 부딪혔나.** 조각의
 *   결론이 DOM 손잡이 맵에 얹혀 있었고, 되돌리는 길은 `rewind()` 로 통째로 지우는
 *   것뿐이었다. 이제 `closing` 과 두 끝의 색에서 파생한다 (`conflictOf`).
 * - `type EdgeState = 'idle' | 'settled' | 'conflict'` — **선언만 있고 값이 어디에도
 *   저장되지 않는 타입**이다. 변의 형편은 `path` 의 `stroke` 와 `stroke-width` 에만
 *   있었다. 이제 `edgeStateOf` 가 칠해진 차례와 닫는 변에서 셈한다.
 * - 커서 링의 `cx`/`cy`/`opacity` — "지금 보는 자리" 가 속성에만 있었다. 숨기기만
 *   하고 좌표는 앞 걸음 값으로 남아 되짚기 판정에서 어긋나던 자리다. 이제 커서는
 *   `painted` 의 맨 끝에서 파생되고 정적 그리기가 매번 새로 짓는다.
 * - `gTokens` · `gMarks` 에 쌓이던 것 — 마지막 변에서 맞선 두 알과 부딪힌 자국.
 *   되돌리는 명령이 없어 쌓이던 자리인데, **그 누적이 곧 결론이었다.** 장면으로
 *   옮기면 저절로 사라지므로 일부러 `closing` 에서 파생시켜 정적 그리기가 세운다.
 *
 * ── 수는 한 자리에서만 센다
 *
 * 화면에 뜨는 수 — 고리의 길이 · 홀짝 · 두 끝이 같은 색인가 — 는 전부 `painted` 와
 * `ring` 에서 나온다. algorithm 은 한때 `step` · `total` · `edge` · `prev` · `colorA` ·
 * `colorB` · `same` · `ringLength` · `odd` · `conflict` · `conflictEdge` 를 실었고
 * 화면은 그중 어느 것도 믿지 않았다. 실려 있으면 다음 사람이 집어 쓰므로 **발신
 * 쪽에서 걷어냈다.** 이제 payload 에 오는 것은 걸음이 내리는 판정뿐이다 —
 * `walk-step` 의 `{ node, color }` 와 `close-edge` 의 `{ a, b }`.
 *
 * **색은 남겼다.** "이웃끼리 다른 색" 이 곧 이 조각의 알고리즘이라, 장면이 차례의
 * 홀짝으로 되셈하면 발신이 장식이 되고 규칙이 두 곳에 적히게 된다 (프로토콜 4절의
 * 가운데 줄 경계).
 *
 * 좌표는 담지 않는다. 정점의 차례만 담고 자리는 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 무방향 변 하나. 방향은 선언이 적은 그대로 보존한다. */
export type TwoColorSceneEdge = { a: string; b: string };

/** 그림의 바탕. 걸음이 고치지 않는다. */
export type TwoColorRing = {
  nodes: string[];
  edges: TwoColorSceneEdge[];
};

/**
 * 칠해진 정점 하나. **칠한 차례대로** 쌓인다.
 *
 * 차례가 뜻을 갖는다 — 이웃한 두 항이 곧 답사가 밟은 변이고, 맨 끝이 곧 커서가
 * 앉은 자리이며, 길이가 곧 고리의 길이다.
 */
export type PaintedNode = { id: string; color: number };

/**
 * 이번 걸음에 달라진 것. 무엇을 흐르게 할지 고르는 표식이다.
 *
 * 출발 그림은 싣지 않는다 — 이 조각의 운동은 전부 `painted` 의 끝 두 항에서
 * 출발하므로 **그 장면 자체**가 출발 자리를 말한다. 되짚기(`animate` 거짓)에서는
 * 쳐다보지 않는다.
 */
export type TwoColorConflictStep =
  | { kind: 'paint'; node: string }
  | { kind: 'close' }
  | { kind: 'verdict' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다.
 *
 * 인자를 하나도 담지 않는다 — 거기 들어갈 것(정점 이름 · 고리의 길이)은 전부 그
 * 장면의 `painted` 와 `closing` 에서 유일하게 나오므로, 담아 두면 같은 것을 두
 * 자리에서 세게 된다. 홀짝 갈래도 `painted.length` 가 정한다.
 */
export type TwoColorConflictCaption =
  | { kind: 'start' }
  | { kind: 'first' }
  | { kind: 'alternate' }
  | { kind: 'lastEdge' }
  | { kind: 'collide' }
  | { kind: 'verdict' };

export type TwoColorConflictScene = {
  /** 정점과 변. 걸음이 고치지 않는 바탕이고 되감기가 여기로 돌아간다. */
  ring: TwoColorRing;
  /**
   * 칠해진 정점들. 이 조각이 화면에 대해 아는 **거의 전부**다.
   *
   * 색이 칠에만 남으면 되짚었을 때 주장이 사라지므로 장면이 직접 쥔다. 다만 여기
   * 있는 것은 색 **번호**이지 색이 아니다 — 무슨 빛깔로 칠할지는 그리는 쪽이 정한다.
   */
  painted: PaintedNode[];
  /**
   * 고리를 닫는 마지막 변. `close-edge` 걸음에서 선다.
   *
   * 이것이 서 있다는 것만으로 화면이 달라진다 — 두 알이 활 위에 맞서 서고, 두 끝의
   * 색이 같으면 그 변이 부러진 것으로 그려진다. 결론이 여기서 파생된다.
   */
  closing: TwoColorSceneEdge | null;
  step: TwoColorConflictStep | null;
  caption: TwoColorConflictCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 초기 자료의 정점 목록을 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** `{ a, b }` 짝들을 변 목록으로. 양 끝이 정점 명부에 있어야 한다. */
function edgeList(v: unknown, nodes: string[]): TwoColorSceneEdge[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(nodes);
  const out: TwoColorSceneEdge[] = [];
  for (const raw of v) {
    const pair = raw as { a?: unknown; b?: unknown };
    const a = str(pair?.a);
    const b = str(pair?.b);
    if (a.length === 0 || b.length === 0) continue;
    if (!known.has(a) || !known.has(b)) continue;
    out.push({ a, b });
  }
  return out;
}

/** 정점 → 칠해진 색 번호. 아직 칠하지 않은 정점은 들어 있지 않다. */
export function colorOf(painted: PaintedNode[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of painted) map.set(n.id, n.color);
  return map;
}

/** 두 변이 같은 변인가. 선언의 방향은 뜻을 갖지 않는다. */
export function sameEdge(x: TwoColorSceneEdge, y: TwoColorSceneEdge): boolean {
  return (x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a);
}

/**
 * 닫는 변의 두 끝이 같은 색으로 맞섰나 — **이 조각의 결론**.
 *
 * 한때 algorithm 이 `same` 과 `conflict` 두 이름으로 실어 보냈고 화면은 칠에서
 * 도로 읽었다. 결론이 그림과 같은 자료를 쓰게 하는 것이 이행의 알맹이라, 여기
 * 한 자리에서만 셈한다.
 */
export function conflictOf(scene: TwoColorConflictScene): boolean {
  const closing = scene.closing;
  if (closing === null) return false;
  const color = colorOf(scene.painted);
  const ca = color.get(closing.a);
  const cb = color.get(closing.b);
  return ca !== undefined && cb !== undefined && ca === cb;
}

/** 변 하나의 형편. 한때 stage 에 타입만 선언되고 값은 어디에도 없던 것이다. */
export type TwoColorEdgeState = 'idle' | 'settled' | 'conflict';

/**
 * 변이 어떤 형편인가를 칠해진 차례에서 셈한다.
 *
 * 답사가 밟은 변은 `painted` 에서 **이웃한 두 항**이다 — 따로 담으면 밟은 변과
 * 칠한 차례를 두 자리에서 세는 꼴이 된다. 닫는 변만 예외로, 그것이 섰는가와 두
 * 끝의 색이 형편을 정한다.
 */
export function edgeStateOf(
  scene: TwoColorConflictScene,
  edge: TwoColorSceneEdge,
): TwoColorEdgeState {
  if (scene.closing !== null && sameEdge(scene.closing, edge)) {
    return conflictOf(scene) ? 'conflict' : 'settled';
  }
  for (let i = 1; i < scene.painted.length; i += 1) {
    const from = scene.painted[i - 1];
    const to = scene.painted[i];
    if (from === undefined || to === undefined) continue;
    if (sameEdge({ a: from.id, b: to.id }, edge)) return 'settled';
  }
  return 'idle';
}

/**
 * 처음 자리로 돌아간 장면. `initial` 과 되감기가 같은 자리를 쓴다.
 *
 * 바탕은 `ring` **하나뿐**이다. 걸음이 고치는 것(`painted` · `closing`)을 여기로
 * 넘기면 되감은 화면에 지난 주행의 칠이 남는다. 타입으로 좁혀 두고 호출부는 객체
 * 리터럴로 넘겨 초과 속성 검사가 실제로 돌게 한다.
 */
function atStart(base: Pick<TwoColorConflictScene, 'ring'>): TwoColorConflictScene {
  return {
    ring: base.ring,
    painted: [],
    closing: null,
    step: null,
    caption: { kind: 'start' },
  };
}

export const twoColorConflictScene: ScenePlan<TwoColorConflictScene> = {
  /**
   * 첫 장면은 바탕만 세운다. 아직 아무것도 칠하지 않았다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체다 (S-scene).
   */
  initial(initialData: unknown): TwoColorConflictScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const nodes = nodeList(d.nodes);
    return atStart({ ring: { nodes, edges: edgeList(d.edges, nodes) } });
  },

  reduce(scene: TwoColorConflictScene, event: FacetRuntimeEvent): TwoColorConflictScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 앞 정점에서 변을 타고 건너와 이 정점을 칠한다. 색은 걸음이 내리는 판정이다.
      case 'walk-step': {
        const node = str(p.node);
        const color = typeof p.color === 'number' ? p.color : null;
        if (node.length === 0 || color === null) return scene;
        if (scene.painted.some((n) => n.id === node)) return scene;
        return {
          ...scene,
          painted: [...scene.painted, { id: node, color }],
          step: { kind: 'paint', node },
          // 첫 걸음인가는 지금까지 칠한 수가 말한다.
          caption: scene.painted.length === 0 ? { kind: 'first' } : { kind: 'alternate' },
        };
      }

      // 마지막 남은 변이 선다. 두 끝의 색이 같은가는 장면이 셈한다.
      case 'close-edge': {
        const a = str(p.a);
        const b = str(p.b);
        if (a.length === 0 || b.length === 0) return scene;
        const next: TwoColorConflictScene = {
          ...scene,
          closing: { a, b },
          step: { kind: 'close' },
          caption: null,
        };
        return { ...next, caption: conflictOf(next) ? { kind: 'collide' } : { kind: 'lastEdge' } };
      }

      // 할 말을 마쳤다. 화면은 그대로 두고 캡션만 갈린다 — 왜 그런가를 말한다.
      case 'done':
        return { ...scene, step: { kind: 'verdict' }, caption: { kind: 'verdict' } };

      // 처음 자리로. 칠도 닫는 변도 함께 사라진다.
      case 'rewind':
        return atStart({ ring: scene.ring });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
