/**
 * pruneBranch 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 숨겨 두었던 것은 "어디를 안 열었나" 다
 *
 * 명령형 stage 에서 그 답은 **유령 원의 `opacity` 속성**에 있었다. 자리를 열 때마다
 * 그 자리의 유령을 `opacity: 0` 으로 지우고, 다 끝난 뒤
 *
 * ```ts
 * if (ghost.getAttribute('opacity') !== '0') left.push(ghost);   // ← 여기
 * ```
 *
 * 로 **화면을 도로 읽어** "끝내 안 연 자리" 를 골라냈다. `let` 도 `Set.has` 도 아니라
 * 어떤 grep 에도 걸리지 않는 자리다. 되감으면 그 속성이 아직 옛 화면의 것이라
 * 셈이 통째로 틀어진다.
 *
 * 함께 숨어 있던 것 넷.
 *
 * - `LiveNode = { circle, label, verdict }` — **DOM 손잡이와 판정이 한 객체**다.
 *   어느 자리가 닫혔는지가 그 Map 에만 있었고, `const` 라 `let` grep 을 통과한다.
 * - `activeId` · `lastSkipped` — 지금 짚은 자리와 "이번에 셈이 튀었나".
 * - `liveEdgeLayer` · `capLayer` · `shadeLayer` 의 **`<g>` 자식 누적** — 어디까지
 *   뻗었고 어디에 뚜껑을 덮었는지가 DOM 자식 수에만 있었다.
 * - `depth` · `pitch` · `originX` · `nodeR` — `init()` 이 한 번 재고 마는 기하.
 *
 * 그 전부가 `opened` 하나로 줄어든다. **열린 자리를 차례대로 적어 두면 나머지가
 * 전부 셈으로 나온다** — 뻗은 가지도, 닫힌 자리의 뚜껑도, 안 볼 자리의 색지도,
 * 연 자리·안 연 자리의 셈도.
 *
 * ── 잘린 가지는 끝 화면에 남는다
 *
 * 이 조각의 주장이 "안 볼 가지를 미리 자른다" 인데, 자른 가지를 지우면 **무엇을
 * 아꼈는지가 화면에 없다.** 그래서 닫힌 자리의 붉은 굳음 · 뚜껑 · 그 아래 색지 ·
 * 끝내 안 열린 유령이 전부 **정적 그리기**에 들어간다. 되짚어도 사라지지 않는다.
 *
 * ── 안 연 자리의 수는 한 함수를 지난다
 *
 * 셈판의 "안 연 자리 {n}" 과 캡션의 "이 아래 {below} 자리" 와 끝걸음에 부푸는
 * 유령들이 **전부 `descendantsOf` 하나**에서 나온다. 같은 물음에 두 번째 답을
 * 두지 않는다.
 *
 * ── 걸음이 실어 오는 것은 자리 하나뿐이다
 *
 * `branch-*` 넷은 `target: 'node:r0011'` 만 싣는다. 그 자리까지의 합도, 층도,
 * 고른 수도, 연 자리 수도 payload 가 아니라 **경로와 바탕 자료**에서 나온다.
 * 합은 algorithm 이 내준 순수 함수(`pathSum`)를 장면이 그대로 부른다 — 싣는
 * 순간 다음 사람이 집어 쓸 문이 열리고, 그 문이 곧 "두 자리에서 세기" 가 들어오는
 * 길이다.
 *
 * 좌표는 담지 않는다. 결정 경로가 자리를 정하므로 자리는 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { pathSum, pickedOnPath } from './algorithm.js';

/** 한 자리가 받은 판정. */
export type BranchVerdict = 'open' | 'cut' | 'dead' | 'answer';

/**
 * 열린 자리 하나.
 *
 * 자리도 층도 합도 담지 않는다 — `id` 의 결정 경로가 그 셋을 전부 정한다.
 * 명령형 stage 의 `LiveNode` 가 DOM 손잡이와 함께 쥐고 있던 것이 이 자리다.
 */
export type OpenedSpot = {
  /** `r` + 결정 경로. `'1'` 넣는다(왼쪽) / `'0'` 안 넣는다(오른쪽). */
  readonly id: string;
  readonly verdict: BranchVerdict;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 다만 `spot` 은 머무는 강조(짚인 자리 · 짚인 층)도 함께 정한다 — 그 둘은 정적
 * 그리기에도 들어간다 (S-scene).
 */
export type PruneBranchStep =
  /** 문제가 서는 걸음. */
  | { readonly kind: 'task' }
  /** 가지가 한 자리까지 뻗어 판정을 받는 걸음. */
  | { readonly kind: 'spot'; readonly id: string; readonly verdict: BranchVerdict }
  /** 다 돌았다. 끝내 안 연 자리를 한 번에 짚는 걸음. */
  | { readonly kind: 'finish' };

/**
 * 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지**다 (C10).
 *
 * 수는 하나도 싣지 않는다 — 합도 층도 자리 수도 화면이 그리는 구조에서 나와야
 * 캡션의 수와 그림이 갈리지 않는다.
 */
export type PruneBranchCaption = {
  readonly kind:
    | 'task'
    | 'start'
    | 'take'
    | 'skip'
    | 'cut'
    | 'cutLeaf'
    | 'dead'
    | 'answer'
    | 'done';
};

export type PruneBranchScene = {
  /**
   * 고를 수 목록. 되감기가 여기로 돌아가고 **어느 걸음도 고치지 않는다.**
   * 층 수도 이 길이가 정한다.
   */
  readonly values: readonly number[];
  /** 맞춰야 하는 합. 지금까지의 합이 이것을 넘은 자리에서 닫는다. */
  readonly target: number;
  /** 문제가 이미 섰나. 서기 전에는 유령 나무만 있다. */
  readonly taskShown: boolean;
  /**
   * 열린 자리들. **깊이 우선으로 밟은 차례 그대로**이고 지워지지 않는다.
   *
   * 이 조각의 본체다. 뻗은 가지도, 닫힌 자리도, 안 볼 자리도, 셈판의 두 수도
   * 전부 이 목록 하나에서 풀린다.
   */
  readonly opened: readonly OpenedSpot[];
  /** 다 돌았다고 선언되었나. 안 연 유령의 짙기가 여기서 갈린다. */
  readonly finished: boolean;
  readonly step: PruneBranchStep | null;
  readonly caption: PruneBranchCaption | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `opened` · `taskShown` · `finished` 를 일부러 뺀다. 걸음이 고치는 것을 바탕과
 * 같은 급으로 묶어 넘기면 되감은 화면이 **이미 다 뻗은 나무**로 서고, 그 위에
 * algorithm 이 새로 셈한 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<PruneBranchScene, 'values' | 'target'>;

// ── 결정 경로가 말하는 것 ──────────────────────────────────────────────────

/** 층 수. 값 하나가 한 층을 정한다. */
export function depthOf(scene: PruneBranchScene): number {
  return scene.values.length;
}

/** `r0011` → `0011`. 뿌리는 빈 경로다. */
export function pathOf(id: string): string {
  return id.slice(1);
}

/** 뿌리는 0. 경로 글자 수가 곧 층이다. */
export function levelOf(id: string): number {
  return id.length - 1;
}

/** 뿌리면 `null`. 결정 하나를 물리면 부모다. */
export function parentOf(id: string): string | null {
  return id.length <= 1 ? null : id.slice(0, -1);
}

/** 뿌리에서 이 자리까지의 자리들. 답까지의 길을 긋는 데 쓴다. */
export function lineageOf(id: string): string[] {
  const out: string[] = [];
  for (let len = 1; len <= id.length; len += 1) out.push(id.slice(0, len));
  return out;
}

/**
 * 이 자리 **아래**에 있는 자리 전부. 층 순으로.
 *
 * 화면에 뜨는 "안 연 자리" 는 전부 이 함수를 지난다 — 캡션의 `{below}` 도,
 * 셈판의 수도, 끝걸음에 부푸는 유령들도. 같은 물음에 두 번째 답을 두지 않는다.
 */
export function descendantsOf(id: string, depth: number): string[] {
  const out: string[] = [];
  let frontier: string[] = [id];
  for (let level = levelOf(id); level < depth; level += 1) {
    const next: string[] = [];
    for (const p of frontier) next.push(`${p}1`, `${p}0`);
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** 다 뻗었을 때의 나무 — 유령이 그리는 자리 전부. 짧은 것부터. */
export function allSpotIds(depth: number): string[] {
  return ['r', ...descendantsOf('r', depth)];
}

// ── 장면이 셈하는 것들 ─────────────────────────────────────────────────────

/**
 * 이 자리까지의 합.
 *
 * algorithm 이 내준 순수 함수를 그대로 부른다 — 닫는 잣대(`sum > target`)가 두
 * 곳에 적히지 않게. 걸음이 실어 오지 않는 까닭이 이것이다.
 */
export function sumAt(scene: PruneBranchScene, id: string): number {
  return pathSum(scene.values, pathOf(id));
}

/** 이 자리가 고른 수들. 답의 문장이 쓴다. */
export function pickedAt(scene: PruneBranchScene, id: string): number[] {
  return pickedOnPath(scene.values, pathOf(id));
}

/** 이 층에서 정하는 수. 층 0(뿌리)은 아직 아무것도 안 정했으므로 `null`. */
export function valueAt(scene: PruneBranchScene, id: string): number | null {
  const level = levelOf(id);
  return level === 0 ? null : (scene.values[level - 1] ?? null);
}

/** 이 자리로 오며 그 수를 넣었나. 경로의 마지막 결정이 말한다. */
export function tookAt(id: string): boolean {
  return id.endsWith('1');
}

/** 열린 자리의 id 들. 유령을 지을지 말지가 여기서 갈린다. */
export function openedIds(scene: PruneBranchScene): Set<string> {
  return new Set(scene.opened.map((s) => s.id));
}

/** 연 자리 수. 목록 길이가 곧 그 수다 — 걸음이 세어 싣지 않는다. */
export function openedCount(scene: PruneBranchScene): number {
  return scene.opened.length;
}

/**
 * 끝내 열지 않기로 선포된 자리들 — 닫힌 자리 **아래** 전부.
 *
 * 셈판의 수도 끝걸음에 부푸는 유령도 이 하나에서 나온다.
 */
export function prunedIds(scene: PruneBranchScene): Set<string> {
  const depth = depthOf(scene);
  const out = new Set<string>();
  for (const spot of scene.opened) {
    if (spot.verdict !== 'cut') continue;
    for (const id of descendantsOf(spot.id, depth)) out.add(id);
  }
  return out;
}

/** 안 연 자리 수. */
export function skippedCount(scene: PruneBranchScene): number {
  return prunedIds(scene).size;
}

/** 이 자리를 닫으면 몇 자리를 안 보게 되나. 캡션의 `{below}` 가 이것이다. */
export function belowCount(scene: PruneBranchScene, id: string): number {
  return descendantsOf(id, depthOf(scene)).length;
}

/** 답을 만난 자리. 없으면 `null`. 답까지의 길이 여기서 갈린다. */
export function answerId(scene: PruneBranchScene): string | null {
  for (const spot of scene.opened) {
    if (spot.verdict === 'answer') return spot.id;
  }
  return null;
}

/**
 * 지금 짚인 자리. **머무는 강조**라 정적 그리기에도 들어간다 (S-scene).
 *
 * 판정이 난 자리(닫힘 · 답)는 그 걸음 안에서 판정색으로 굳으므로 짚인 채로
 * 남지 않는다. 뻗기만 한 자리와 막다른 자리만 다음 걸음까지 짚여 있다.
 */
export function activeId(scene: PruneBranchScene): string | null {
  const step = scene.step;
  if (step === null || step.kind !== 'spot') return null;
  return step.verdict === 'open' || step.verdict === 'dead' ? step.id : null;
}

/** 지금 정하고 있는 층. 홈통 라벨의 강조가 이것을 따른다. 없으면 `-1`. */
export function activeRow(scene: PruneBranchScene): number {
  const step = scene.step;
  if (step === null || step.kind !== 'spot') return -1;
  return levelOf(step.id) - 1;
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 수 배열을 **복사해** 읽는다.
 *
 * 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을
 * 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

/** `node:r0011` 에서 자리를 꺼낸다. 식별자 파싱은 `parseTarget` 을 경유한다 (원칙 4). */
function spotId(target: FacetRuntimeEvent['target']): string | null {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (!parsed || parsed.prefix !== 'node' || parsed.id === '') return null;
  return parsed.id;
}

/** 아직 아무 걸음도 밟지 않은 화면 — 다 뻗었을 때의 유령 나무만 서 있다. */
function atStart(b: Base): PruneBranchScene {
  return {
    values: b.values,
    target: b.target,
    taskShown: false,
    opened: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/** 뻗기만 한 자리가 하는 말. 뿌리와 그 아래가 다르다. */
function growCaption(id: string): PruneBranchCaption {
  if (levelOf(id) === 0) return { kind: 'start' };
  return { kind: tookAt(id) ? 'take' : 'skip' };
}

/** 한 자리를 열어 판정을 얹는다. */
function open(
  scene: PruneBranchScene,
  id: string,
  verdict: BranchVerdict,
  caption: PruneBranchCaption,
): PruneBranchScene {
  return {
    ...scene,
    opened: [...scene.opened, { id, verdict }],
    step: { kind: 'spot', id, verdict },
    caption,
  };
}

export const pruneBranchScene: ScenePlan<PruneBranchScene> = {
  /**
   * 첫 장면은 유령 나무뿐이다.
   *
   * 문제도 층 라벨도 아직 서지 않는다 — `task-set` 이 그것을 세우고, 그 전의
   * 화면이 "다 뻗으면 이만큼이다" 만 말한다.
   */
  initial(initialData: unknown): PruneBranchScene {
    const d = (initialData ?? {}) as { values?: unknown; target?: unknown };
    return atStart({ values: readNumbers(d.values), target: num(d.target) });
  },

  reduce(scene: PruneBranchScene, event: FacetRuntimeEvent): PruneBranchScene {
    switch (event.type) {
      // 무엇을 맞춰야 하는지 선다. 수 목록도 목표도 바탕에 이미 있으므로
      // 걸음은 "이제 보인다" 만 말한다.
      case 'task-set':
        return { ...scene, taskShown: true, step: { kind: 'task' }, caption: { kind: 'task' } };

      // 가지가 한 자리까지 뻗는다. 층도 합도 싣지 않는다 — 결정 경로가 말한다.
      case 'branch-grow': {
        const id = spotId(event.target);
        if (id === null) return scene;
        return open(scene, id, 'open', growCaption(id));
      }

      // 합이 이미 목표를 넘었다. 이 아래는 열지 않는다 — 이 조각의 주장이다.
      // 마지막 층이면 아래에 건너뛸 자리가 없어 하는 말이 달라진다.
      case 'branch-cut': {
        const id = spotId(event.target);
        if (id === null) return scene;
        const kind = belowCount(scene, id) > 0 ? 'cut' : 'cutLeaf';
        return open(scene, id, 'cut', { kind });
      }

      // 끝까지 정했으나 합이 목표가 아니다.
      case 'branch-leaf': {
        const id = spotId(event.target);
        if (id === null) return scene;
        return open(scene, id, 'dead', { kind: 'dead' });
      }

      // 합이 정확히 목표다.
      case 'branch-answer': {
        const id = spotId(event.target);
        if (id === null) return scene;
        return open(scene, id, 'answer', { kind: 'answer' });
      }

      // 다 돌았다. 남은 유령이 곧 안 연 자리다.
      case 'done':
        return { ...scene, finished: true, step: { kind: 'finish' }, caption: { kind: 'done' } };

      // 손으로 짚기 시작 — 유령 나무만 남은 처음으로 돌아간다.
      //
      // 객체 리터럴로 넘긴다. 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ values: scene.values, target: scene.target });

      default:
        // 이 algorithm 이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
