/**
 * cycleBlocksOrder 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 projector 에는 `let` 이 하나도 없었고, stage 의 `let` 도 `board` · `order` ·
 * `slots` · `colW` 넷뿐인데 그것은 전부 **바탕과 자리**다. 조회로 갈리는 분기도,
 * 화면을 도로 읽는 자리도 0 건이었다. 그러니 "숨은 상태가 없다" 가 아니라
 * **화면이 통째로 상태였다** — 걸어온 자취가 전부 SVG 속성에만 있었다
 * (프로토콜 3-1 의 ⑤).
 *
 * - **`paintNode` 의 `tone: 'idle' | 'ready' | 'taken' | 'stuck'`** — 선언은 있는데
 *   **값이 어디에도 저장되지 않는 타입**이다. 마디의 형편이 `fill` · `stroke` ·
 *   `stroke-width` 세 속성에만 적혀 있었다. `paintEdge` 의 `'idle' | 'released' |
 *   'ring'` 과 `paintBadge` 의 `'idle' | 'zero' | 'stuck'` 도 같은 꼴이다.
 * - **`NodeItem = { group, disc, label, ghost, home, at, scale, dx, dy }`** — DOM
 *   손잡이와 **지금 어디에 서 있나**(`at`) · **얼마나 줄었나**(`scale`) 가 한 객체에
 *   묶여 있었다. `at` 이 제 자리를 벗어나 있다는 것이 곧 "이것은 꺼내졌다" 인데
 *   `const nodes = new Map<string, NodeItem>()` 한 줄이라 `let` grep 을 통과한다.
 * - **`BadgeItem.label.textContent`** — **각자 이고 있는 수가 글자에만 있었다.**
 *   이 조각이 "0 이 되지 않는다" 를 말하는 바로 그 수인데 밖에서 읽을 길이 없었다.
 *   (도로 읽어 쓰는 자리는 없었다 — 있었다면 되감은 직후 옛 화면의 수로 셈했을 것이다.)
 * - **`SlotItem.box` 의 `stroke-dasharray` 유무와 `SlotItem.mark` 의 `opacity`** —
 *   **끝내 비는 자리가 어디인가.** 이 조각의 결론 그 자체가 속성 둘에 적혀 있었다.
 * - **`NodeItem.ghost` 의 `opacity`** — 판에서 떠난 자리의 빈 테두리.
 * - **`disc` 의 `stroke-dasharray`** — 고리 밖에서 고리 뒤에 매달린 것이라는 표식.
 * - **`layerTint` 에 덧붙던 고리 렌즈** — 지우는 명령이 없어 쌓이던 자리인데, 그
 *   쌓임이 곧 이 조각의 결론이었다. 명령을 다시 밟아야만 복원됐다.
 * - **`caption` 의 `fill`** — 붉게 물든 캡션은 `draw()` 전까지 돌아오지 않았다.
 *   정적 그리기가 매번 명시로 쓰지 않으면 되짚었을 때 앞 걸음의 색이 남는다.
 *
 * 여기서는 그 여덟이 `surveyed` · `ready` · `taken` · `stalled` · `waits` ·
 * `chain` · `ring` · `closed` 여덟이다. 꺼낸 목록 하나만 있으면 배지의 수도, 빈
 * 자리도, 풀린 화살표도 전부 셈으로 나온다.
 *
 * ── 멈춤이 화면에 남는다
 *
 * 이 조각의 주장은 "고리에 걸린 것들은 **영영 진입 차수가 0 이 되지 않아** 남는다"
 * 이다. 그러니 완주 화면이 "뽑힌 것들" 만 줄지어 보이면 주장이 통째로 사라진다
 * (프로토콜 4 절). 남는 것을 장면이 말하게 한다.
 *
 * - `stalled` — 훑었는데 꺼낼 것이 하나도 없었다. **한 번 서면 돌아가지 않는다.**
 * - `taken` — 여기 없는 정점은 못 나온 것이고, 그 수는 `loadsOf` 로 셈해져 배지에
 *   그대로 뜬다. 끝 화면의 배지 셋이 1 을 이고 있는 것이 "0 이 되지 않는다" 다.
 * - `waits` · `ring` — 서로를 기다리는 고리와, 그 고리 뒤에 매달린 기다림.
 *   **둘을 한 목록에 담되 어휘는 그리는 쪽이 가른다** (고리는 굵은 실선과 렌즈,
 *   매달린 것은 파선). 같은 모양으로 그리면 "고리에 든 것" 과 "고리에 걸린 것" 이
 *   한 말이 되어 버리는데 이 조각은 그 둘이 다르다고 말한다.
 *
 * ── 고리라는 판정은 발자국에서 나온다
 *
 * 옛 `wait` payload 는 `closes` · `trailing` · `ring` 셋을 실어 왔다. 곧 **조각의
 * 결론을 algorithm 이 적어 보내고 화면은 받아 적기만** 했다. 지금은 장면이 제
 * 발자국(`chain`)을 보고 그것이 제자리로 돌아오는 순간을 스스로 알아챈다 — 화면에
 * 뜨는 고리와 결론이 **같은 자료**를 쓴다 (프로토콜 4 절 "조각의 결론이 그림과 같은
 * 자료를 쓰게 하는 것이 이행의 알맹이다").
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 정점과 간선, 꺼낸 차례 같은 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 이번 걸음이 무슨 말을 했는지만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10). 캡션에 넣을 수와 이름도 싣지
 * 않는다. `{ids}` 는 `readyOf`, `{id}` 는 꺼낸 목록의 끝, `{a}`/`{b}` 는 마지막
 * 기다림, `{out}`/`{total}` 은 꺼낸 목록과 바탕의 길이다 — 전부 장면에 있다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { remainingLoads, type CycleBlocksOrderEdge } from './algorithm.js';

/** 기다림 한 발. `from` 이 `on` 을 기다린다 — 화살표를 거꾸로 딛은 한 걸음이다. */
export type CycleBlocksOrderWait = { from: string; on: string };

/**
 * 이번 걸음이 무슨 말을 했나.
 *
 * **캡션도 운동도 여기 하나에서 나온다.** 말과 움직임이 같은 자리를 가리키므로 갈릴
 * 자리가 없다. 인자는 싣지 않는다 — 누구를 꺼냈는지도 누가 누구를 기다리는지도
 * 장면의 목록이 이미 말하고 있다.
 */
export type CycleBlocksOrderStep =
  /** 각자 이고 있는 수가 얹힌다. */
  | { kind: 'survey' }
  /** 꺼낼 수 있는 것이 떠오른다. */
  | { kind: 'ready' }
  /** 훑었는데 아무것도 못 나온다 — **이 조각의 멈춤**. */
  | { kind: 'stall' }
  /** 하나가 자리로 내려가고 그것이 겨누던 화살표가 풀린다. */
  | { kind: 'extract' }
  /** 화살표를 한 발 거슬러 올라간다. */
  | { kind: 'wait' }
  /** 거슬러 올라간 발이 제자리로 돌아왔다 — 고리가 닫힌다. */
  | { kind: 'ring' }
  /** 고리 밖에서 고리 뒤에 매달린 것의 기다림. */
  | { kind: 'trail' }
  /** 빈 자리가 굳는다. */
  | { kind: 'halt' };

export type CycleBlocksOrderScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 정점 id. 알파벳 순으로 담는다 — 여럿이 꺼낼 수 있을 때 고르는 순서다. */
  vertices: readonly string[];
  /** 방향 간선. `from` 이 `to` 에게 짐 하나를 지운다. */
  edges: readonly CycleBlocksOrderEdge[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 각자 이고 있는 수가 드러났나. 그 전에는 배지가 아예 없다. */
  surveyed: boolean;
  /** 마지막 훑기가 고른, 지금 꺼낼 수 있는 것들. **남는 강조**라 정적으로도 그린다. */
  ready: readonly string[];
  /** 꺼낸 차례. **길이가 곧 다음 자리 번호**이고, 여기 없는 것이 끝내 못 나온 것이다. */
  taken: readonly string[];
  /** 훑었는데 꺼낼 것이 없었다. 한 번 서면 돌아가지 않는다 — 이 조각의 주장. */
  stalled: boolean;
  /** 거슬러 올라간 기다림, 딛은 차례대로. 고리와 매달림이 여기 함께 있다. */
  waits: readonly CycleBlocksOrderWait[];
  /** 발자국이 지나온 정점, 차례대로. 여기로 돌아오면 고리가 닫힌다. */
  chain: readonly string[];
  /** 서로를 기다리는 고리. 아직 닫히지 않았으면 null. */
  ring: readonly string[] | null;
  /** 다 보였다고 말했나. 끝내 빈 자리에 막대가 서는 것이 여기서 갈린다. */
  closed: boolean;

  step: CycleBlocksOrderStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 꺼낸 목록도 발자국도 여기 들지 않는다 — 전부 걸어오며 얻은 것이라 되감기에 그대로
 * 넘기면 되감은 화면이 이미 다 굴러간 채로 선다 (S-scene).
 */
type CycleBlocksOrderBase = Pick<CycleBlocksOrderScene, 'vertices' | 'edges'>;

/**
 * 아직 아무것도 꺼내지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: CycleBlocksOrderBase): CycleBlocksOrderScene {
  return {
    vertices: base.vertices,
    edges: base.edges,
    surveyed: false,
    ready: [],
    taken: [],
    stalled: false,
    waits: [],
    chain: [],
    ring: null,
    closed: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 값만 베껴 담는다 — 넘겨받은 배열을 쥐지 않는다 (S-scene). */
function vertexList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').sort();
}

/** 간선도 하나씩 새 객체로 베낀다. 러너가 준 객체는 algorithm 과 함께 쓰는 것이다. */
function edgeList(value: unknown): CycleBlocksOrderEdge[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): CycleBlocksOrderEdge[] => {
    const e = raw as { from?: unknown; to?: unknown };
    const from = str(e?.from);
    const to = str(e?.to);
    return from !== null && to !== null ? [{ from, to }] : [];
  });
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 배지의 수도, 꺼낼 수 있는 것도, 좌우 차례도
// `remainingLoads` 하나에서 나오므로 갈릴 자리가 없다 — algorithm 도 같은 함수를
// 쓴다 (프로토콜 4 절).

/** 아직 안 나간 것들이 지금 이고 있는 수. 배지에 그대로 뜬다. */
export function loadsOf(scene: CycleBlocksOrderScene): Map<string, number> {
  return remainingLoads(scene.vertices, scene.edges, scene.taken);
}

/** 아직 안 나간 것들. 여기 남은 채로 끝나는 것이 이 조각의 답이다. */
export function stuckOf(scene: CycleBlocksOrderScene): string[] {
  return scene.vertices.filter((v) => !scene.taken.includes(v));
}

/** 지금 꺼낼 수 있는 것 — 이고 있는 수가 0 인 것. 비면 그 자리가 멈춤이다. */
export function readyOf(scene: CycleBlocksOrderScene): string[] {
  const load = loadsOf(scene);
  return scene.vertices.filter((v) => !scene.taken.includes(v) && (load.get(v) ?? 0) === 0);
}

/**
 * 방금 꺼낸 것 때문에 짐이 준 것들과 줄어든 뒤의 값.
 *
 * `id` 가 **이미 꺼낸 목록에 든 장면**에서 부른다 — 지금 짐이 곧 줄어든 뒤의 값이다.
 */
export function releasedBy(
  scene: CycleBlocksOrderScene,
  id: string,
): { to: string; load: number }[] {
  const load = loadsOf(scene);
  const seen = new Set<string>();
  const out: { to: string; load: number }[] = [];
  for (const e of scene.edges) {
    if (e.from !== id || seen.has(e.to)) continue;
    const now = load.get(e.to);
    if (now === undefined) continue; // 이미 나간 것에게는 지울 짐이 없다
    seen.add(e.to);
    out.push({ to: e.to, load: now });
  }
  return out;
}

/** 방금 꺼낸 것. 아직 하나도 안 꺼냈으면 null. */
export function lastTakenOf(scene: CycleBlocksOrderScene): string | null {
  return scene.taken[scene.taken.length - 1] ?? null;
}

/** 방금 딛은 기다림. 아직 하나도 없으면 null. */
export function lastWaitOf(scene: CycleBlocksOrderScene): CycleBlocksOrderWait | null {
  return scene.waits[scene.waits.length - 1] ?? null;
}

/**
 * 고리 뒤에 매달린 기다림 — 고리에 들지 않은 것이 딛은 발.
 *
 * 고리가 아직 닫히지 않았으면 딛은 발이 모두 고리 후보라 하나도 없다.
 */
export function isTrailing(scene: CycleBlocksOrderScene, wait: CycleBlocksOrderWait): boolean {
  return scene.ring !== null && !scene.ring.includes(wait.from);
}

/**
 * 좌우 차례. 짐 0 인 것부터 알파벳 순으로 벗겨 내고, 끝내 안 벗겨지는 것을 뒤에 붙인다.
 *
 * 흐름이 왼쪽에서 오른쪽으로 읽히고 고리에 걸린 것들이 오른편에 모인다. **바탕만으로
 * 정해지므로 걸음이 지나도 자리가 흔들리지 않는다.**
 */
export function readingOrderOf(scene: CycleBlocksOrderScene): string[] {
  const peeled: string[] = [];
  for (;;) {
    const load = remainingLoads(scene.vertices, scene.edges, peeled);
    const next = scene.vertices.find((v) => !peeled.includes(v) && (load.get(v) ?? 0) === 0);
    if (next === undefined) break;
    peeled.push(next);
  }
  return [...peeled, ...scene.vertices.filter((v) => !peeled.includes(v))];
}

export const cycleBlocksOrderScene: ScenePlan<CycleBlocksOrderScene> = {
  /**
   * 첫 장면은 판과 빈 자리만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열도 그 안의 객체도 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): CycleBlocksOrderScene {
    const d = (initialData ?? {}) as { vertices?: unknown; edges?: unknown };
    return atStart({ vertices: vertexList(d.vertices), edges: edgeList(d.edges) });
  },

  reduce(scene: CycleBlocksOrderScene, event: FacetRuntimeEvent): CycleBlocksOrderScene {
    switch (event.type) {
      /*
       * 전제가 드러난다. 무엇이 드러나는지는 싣지 않는다 — 각자 이고 있는 수는
       * 바탕에서 세어지므로 "이제 그것이 보인다" 는 말만 있으면 된다.
       */
      case 'survey':
        return { ...scene, surveyed: true, step: { kind: 'survey' } };

      /*
       * 훑는다. 무엇이 꺼낼 수 있는지도 장면이 센다.
       *
       * **비어 있으면 그 자리가 멈춤이고, 그 멈춤은 끝까지 남는다.** 이 조각이 하려는
       * 말이 그것이라 지나가는 신호가 아니라 머무는 상태다.
       */
      case 'scan': {
        const ready = readyOf(scene);
        if (ready.length === 0) {
          return { ...scene, ready, stalled: true, step: { kind: 'stall' } };
        }
        return { ...scene, ready, step: { kind: 'ready' } };
      }

      /*
       * 하나를 꺼낸다. 실려 오는 것은 **어느 것을 꺼내는가** 하나뿐이다.
       *
       * 몇 번째 자리에 놓이는지는 지금까지 꺼낸 수가 말하고, 그 바람에 짐이 준 것이
       * 무엇인지는 간선과 꺼낸 목록이 말한다 (`releasedBy`).
       */
      case 'extract': {
        const p = event.payload as { id?: unknown } | undefined;
        const id = str(p?.id);
        // 꺼낼 수 없는 것을 꺼냈다고 하면 화면이 할 말이 없다. 조용히 흘린다 (C2).
        if (id === null || !scene.vertices.includes(id) || scene.taken.includes(id)) return scene;
        return { ...scene, taken: [...scene.taken, id], step: { kind: 'extract' } };
      }

      /*
       * 화살표를 한 발 거슬러 올라간다.
       *
       * **고리인지 아닌지는 여기서 판정한다.** 딛는 발이 앞 발이 가리키던 곳에서
       * 이어지는 동안은 발자국(`chain`)이 늘고, 그 발이 이미 지나온 정점을 가리키면
       * 그때 고리가 닫힌다 — 발자국의 그 지점부터가 고리다. 이어지지 않는 발은 고리
       * 밖에서 고리 뒤에 매달린 것이라 발자국을 늘리지 않는다.
       */
      case 'wait': {
        const p = event.payload as { from?: unknown; on?: unknown } | undefined;
        const from = str(p?.from);
        const on = str(p?.on);
        if (from === null || on === null) return scene;
        const waits = [...scene.waits, { from, on }];
        const last = lastWaitOf(scene);
        const continues = scene.ring === null && (last === null || last.on === from);
        if (!continues) {
          return { ...scene, waits, step: { kind: 'trail' } };
        }
        const chain = [...scene.chain, from];
        // 제자리를 가리키는 발은 고리가 아니다 (기다릴 것이 없어 멈춘 자리).
        const closes = on !== from && chain.includes(on);
        return {
          ...scene,
          waits,
          chain,
          ring: closes ? chain.slice(chain.indexOf(on)) : null,
          step: closes ? { kind: 'ring' } : { kind: 'wait' },
        };
      }

      /*
       * 다 보였다. 꺼낸 것도 못 꺼낸 것도 장면이 이미 쥐고 있으므로, 이 발신은
       * "여기가 끝이다" 라는 말만 한다 — 끝내 빈 자리가 굳는 것이 그 말이다.
       */
      case 'done':
        return { ...scene, closed: true, step: { kind: 'halt' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ vertices: scene.vertices, edges: scene.edges });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
