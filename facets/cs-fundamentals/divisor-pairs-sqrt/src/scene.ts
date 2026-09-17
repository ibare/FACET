/**
 * 약수의 짝 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **√n 까지만 짚어도 나머지 절반은 짝으로 저절로 덮인다.** 그러니 다 끝난 화면에
 * 반드시 남아 있어야 하는 것이 둘이다.
 *
 *   - **짚어 본 자리** — 1..√n 의 여섯 칸. 약수였든 아니었든 **짚어 보았다는
 *     사실**이 남아야 "몇 자리를 보았나" 가 화면에서 세어진다.
 *   - **덮인 자리** — 짚지 않았는데 짝 덕에 알게 된 칸. 그것이 남아야 "안 봐도
 *     된다" 가 "다 봤다" 와 구별된다.
 *
 * 옮기기 전 화면은 **둘 다 없었다.** `miss` 는 260ms 물들었다 `paint(d,'idle')`
 * 로 통째로 되돌아가, 다 끝난 화면에서 "짚었는데 약수가 아니었던 5" 와 "아예 안
 * 본 7" 이 **글자 그대로 같은 모양**이었다. 덮개(wash)는 √n 너머를 한 덩어리
 * 회색으로 가릴 뿐 그 안에서 짝으로 알게 된 칸을 가리키지 않았다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었고 stage 에도 `destroyed` 를 빼면 둘뿐이었다.
 * **화면이 통째로 상태였다는 뜻이다.**
 *
 * - **`type CellState = 'idle' | 'probe' | 'divisor' | 'gone'`** — 선언만 있고
 *   값이 어디에도 저장되지 않았다. 지금 어느 칸이 무슨 형편인지는 `rect` 의
 *   `fill` · `stroke` · `stroke-dasharray` 와 `tint` 의 `opacity` 안에만 있었다.
 *   게다가 **한 축에 두 뜻이 실려 있었다** — `probe` 는 짚음의 표식이고
 *   `divisor` · `gone` 은 값의 형편인데 서로를 덮어썼다. 이제 `probes` 가
 *   그 둘을 각자 말한다.
 * - **`gDock` 의 자식 목록** — 어느 짝이 어디에 앉았나가 `<g>` 자식들 안에만
 *   있었다. 이제 `pairsOf()` 가 `probes` 에서 셈한다.
 * - **`wash` 의 `x` · `width` · `opacity`** — √n 너머가 덮였나가 rect 속성 셋에
 *   흩어져 있었다. 이제 `covered` 하나다.
 * - **`axis` 의 `y1`/`y2` 와 `rootLabel.textContent`** — 접는 자리가 좌표 문자열과
 *   글자 안에만 있었고, 그 자리를 **자기 자신과 짝을 이룬 칸**에서 얻었다.
 *   제곱수가 아닌 n 이면 축이 아예 서지 않는다. 이제 `sqrtLimit(n)` 한 곳이다.
 * - **`let cursorX` · `let cursorShown`** — 커서의 지금 자리를 따로 적어 둔
 *   **화면의 거울**이었고, 그것을 운동의 **출발값**으로 삼았다. 되짚어 세운
 *   직후에는 그 거울이 옛 화면의 것이라 커서가 엉뚱한 데서 출발한다. 이제
 *   출발 자리를 `step.from` 에 실어 장면이 말한다.
 *
 * ── 걸음이 싣고 오던 수를 전부 걷어냈다
 *
 * `d` · `q` · `n` · `self` · `from` 이 payload 로 왔는데 하나도 남김없이 구조에서
 * 나온다. 몇 번째 짚기인가는 발신이 오는 순서가 이미 말하고(`probes.length + 1`),
 * 짝은 `n / d` 이고, 자기 짝인가는 `d === q` 이고, 덮는 자리는 `sqrtLimit(n) + 1`
 * 이다. 그래서 **다섯 발신의 payload 가 전부 비었다.**
 *
 * 좁히는 잣대(`readN`)와 자르는 잣대(`sqrtLimit`)는 `algorithm.ts` 가 함수로
 * 내주고 여기서 부른다 (프로토콜 4 절의 B 갈래 — 장면이 projector 자리를 잇는
 * 것이라 원칙 1 의 허용 방향이다). 잣대를 떼어 내도 "약수는 짝을 이룬다" 는 주장은
 * 남으므로 알고리즘 자체가 아니다.
 *
 * 좌표는 담지 않는다. 수가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { readN, sqrtLimit } from './algorithm.js';

/** 한 번 짚어 본 결과. `pending` 은 짚기만 하고 아직 답하지 않은 자리다. */
export type Verdict = 'pending' | 'divisor' | 'none';

/**
 * 짚어 본 자리 하나.
 *
 * `d` 를 따로 쥐지 않는다 — 1 부터 하나씩 올라가므로 **차례가 곧 그 수**다.
 * 목록의 자리 `i` 가 `d = i + 1` 이고, 그 규칙은 `divisorOf()` 한 곳에만 있다.
 */
export type Probe = { readonly verdict: Verdict };

/** 찾은 짝 하나. `d === q` 면 짝이 자기 자신과 만난 자리, 곧 √n 이다. */
export type DivisorPair = { readonly d: number; readonly q: number };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓴다.
 *
 * `probe` 의 `from` 만 예외로 값을 싣는다 — 커서가 어디서 출발하는지는 앞 장면의
 * 그림이라, `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 * `reduce` 가 앞 장면에서 읽어 여기 싣는다.
 */
export type DivisorStep =
  /** 커서가 `from` 자리에서 방금 짚은 자리로 옮겨 간다. `null` 이면 줄 아래에서 떠오른다. */
  | { kind: 'probe'; from: number | null }
  /** 짝이 큰 쪽 자리에서 떠올라 작은 쪽 위로 날아와 앉는다. */
  | { kind: 'pair' }
  /** 짚어 본 물이 가라앉는다. 짚었다는 표식은 남는다. */
  | { kind: 'miss' }
  /** √n 너머가 덮인다. */
  | { kind: 'cover' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type DivisorCaption =
  | { kind: 'probe'; d: number; n: number }
  | { kind: 'pair'; d: number; q: number; n: number }
  | { kind: 'self'; d: number; n: number }
  | { kind: 'miss'; d: number; n: number }
  | { kind: 'stop'; n: number };

export type DivisorPairsSqrtScene = {
  /** 약수를 찾을 수. 걸음이 고치지 않는 **바탕**이다. */
  readonly base: { readonly n: number };
  /**
   * 짚어 본 자리들, 짚은 차례대로.
   *
   * 이 조각의 알맹이다 — **길이가 곧 몇 자리를 보았나**이고, 그 수가 곧 √n 이다.
   * 약수였든 아니었든 남으므로 다 끝난 화면에서 짚은 자리가 세어진다.
   */
  readonly probes: readonly Probe[];
  /** √n 너머를 덮었나. 이 조각의 결론이 정적 그리기로 선다. */
  readonly covered: boolean;
  readonly step: DivisorStep | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `probes` 와 `covered` 를 여기 넣지 않는다 — 걸어온 자취라, 바탕으로 묶어
 * 되감기에 넘기면 되감은 화면이 자취를 단 채로 선다. 타입으로 좁혀 두고 부르는
 * 쪽은 **객체 리터럴**로 넘긴다 (변수로 넘기면 초과 속성 검사가 돌지 않아 좁힌
 * 타입이 아무것도 막지 못한다).
 */
type DivisorBase = Pick<DivisorPairsSqrtScene, 'base'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: DivisorBase): DivisorPairsSqrtScene {
  return { base: base.base, probes: [], covered: false, step: null };
}

/** 목록의 그 자리가 짚은 수. 1 부터 하나씩 올라간다는 규칙이 여기 한 곳에만 있다. */
export function divisorOf(index: number): number {
  return index + 1;
}

/** 마지막으로 짚은 수. 아직 아무것도 짚지 않았으면 `null`. */
export function lastProbed(scene: DivisorPairsSqrtScene): number | null {
  return scene.probes.length === 0 ? null : divisorOf(scene.probes.length - 1);
}

/**
 * 지금까지 찾은 짝들. **`probes` 에서 셈한다.**
 *
 * 따로 목록을 두면 같은 물음에 답이 둘이 되어 언젠가 갈린다. 짝의 큰 쪽은
 * `n / d` 라 바탕에서 나온다.
 */
export function pairsOf(scene: DivisorPairsSqrtScene): DivisorPair[] {
  const out: DivisorPair[] = [];
  for (let i = 0; i < scene.probes.length; i += 1) {
    if (scene.probes[i].verdict !== 'divisor') continue;
    const d = divisorOf(i);
    out.push({ d, q: scene.base.n / d });
  }
  return out;
}

/** 칸 하나의 **값의 형편**. 짚음의 표식과 축이 다르다 — 겹치지 않는다. */
export type CellFill =
  /** 약수가 아니거나 아직 드러나지 않았다. */
  | 'plain'
  /** 지금 짚어 보는 중. 아직 답하지 않았다. */
  | 'probing'
  /** 약수다. 이 칸이 짝을 쥔다. */
  | 'divisor'
  /** 약수인데 그 값이 짝으로 날아가 앉았다 — 자리에 자국만 남는다. */
  | 'moved';

/** 칸 하나의 **짚음의 표식**. 값의 형편과 다른 축이라 둘이 한 화면에 함께 선다. */
export type CellMark =
  /** 아무 일도 없었다. 다 끝난 화면에서 이것이 곧 **안 봐도 되었던 자리**다. */
  | 'none'
  /** 이 자리를 짚어 보았다. 약수였든 아니었든 남는다. */
  | 'probed'
  /** 짚지 않았는데 짝 덕에 알게 되었다. */
  | 'covered';

/**
 * 칸마다 채움과 표식을 한 번에 셈한다.
 *
 * 그리는 쪽이 칸을 돌며 이웃을 되읽지 않도록 **먼저 한 번에 셈하고** 넘긴다
 * (프로토콜 4 절 — 그리면서 재면 순회 순서가 숨은 상태가 된다).
 */
export function cellsOf(
  scene: DivisorPairsSqrtScene,
): { fill: CellFill; mark: CellMark }[] {
  const { n } = scene.base;
  const cells: { fill: CellFill; mark: CellMark }[] = [];
  for (let v = 0; v < n; v += 1) cells.push({ fill: 'plain', mark: 'none' });

  const put = (v: number, patch: Partial<{ fill: CellFill; mark: CellMark }>): void => {
    const cell = cells[v - 1];
    if (!cell) return;
    if (patch.fill) cell.fill = patch.fill;
    if (patch.mark) cell.mark = patch.mark;
  };

  for (let i = 0; i < scene.probes.length; i += 1) {
    const d = divisorOf(i);
    const verdict = scene.probes[i].verdict;
    put(d, { mark: 'probed', fill: verdict === 'pending' ? 'probing' : 'plain' });
    if (verdict !== 'divisor') continue;
    put(d, { fill: 'divisor' });
    const q = scene.base.n / d;
    // 짝의 큰 쪽은 짚지 않았는데 알게 된 자리다. 자기 짝(d === q)은 짚어서 안
    // 자리이므로 표식을 덮어쓰지 않는다.
    if (q !== d) put(q, { fill: 'moved', mark: 'covered' });
  }
  return cells;
}

/**
 * 접는 자리가 섰나.
 *
 * 짝이 자기 자신과 만나면 그 자리가 곧 접는 자리이고, 만나지 않는 n 이라도 덮는
 * 걸음에서 선다. 자리 자체는 `sqrtLimit(n)` 한 곳에서 나온다.
 */
export function axisShown(scene: DivisorPairsSqrtScene): boolean {
  if (scene.covered) return true;
  const limit = sqrtLimit(scene.base.n);
  return scene.probes[limit - 1]?.verdict === 'divisor' && limit * limit === scene.base.n;
}

/**
 * 캡션은 **장면에서 파생한다.**
 *
 * 필드로 두면 같은 물음에 답이 둘이 된다 — 걸음과 마지막 짚기만 알면 무엇을 말할지가
 * 이미 정해진다.
 */
export function captionOf(scene: DivisorPairsSqrtScene): DivisorCaption | null {
  const { n } = scene.base;
  const d = lastProbed(scene);
  switch (scene.step?.kind) {
    case 'probe':
      return d === null ? null : { kind: 'probe', d, n };
    case 'miss':
      return d === null ? null : { kind: 'miss', d, n };
    case 'pair': {
      if (d === null) return null;
      const q = n / d;
      return d === q ? { kind: 'self', d, n } : { kind: 'pair', d, q, n };
    }
    case 'cover':
      return { kind: 'stop', n };
    default:
      return null;
  }
}

/** 마지막 짚기의 답만 갈아 낀 새 목록. 앞 장면의 배열을 제자리에서 고치지 않는다. */
function answerLast(probes: readonly Probe[], verdict: Verdict): readonly Probe[] {
  return [...probes.slice(0, -1), { verdict }];
}

export const divisorPairsSqrtScene: ScenePlan<DivisorPairsSqrtScene> = {
  /**
   * 첫 장면은 빈 줄 하나다 — 1..n 이 놓였지만 아무도 아직 짚지 않았다.
   *
   * 바탕을 실어 오는 `init` 이벤트가 없으므로 선언에서 읽는다. 담는 것이 수 하나라
   * 참조를 쥘 일이 없다 (S-scene). 좁히는 잣대는 algorithm 이 내준 `readN` 이다.
   */
  initial(initialData: unknown): DivisorPairsSqrtScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ base: { n: readN(raw['n']) } });
  },

  reduce(
    scene: DivisorPairsSqrtScene,
    event: FacetRuntimeEvent,
  ): DivisorPairsSqrtScene {
    switch (event.type) {
      /**
       * 한 자리를 짚는다.
       *
       * 무엇을 짚는지는 **차례가 정한다** — 1 부터 하나씩 올라가므로 이번이 몇
       * 번째 짚기인가가 곧 그 수다. 걸음이 실어 오면 같은 물음에 두 답이 생긴다.
       */
      case 'probe': {
        if (divisorOf(scene.probes.length) > scene.base.n) return scene;
        return {
          ...scene,
          probes: [...scene.probes, { verdict: 'pending' }],
          step: { kind: 'probe', from: lastProbed(scene) },
        };
      }

      // 약수다. 짝은 n / d 로 바탕에서 나오므로 여기서 셈하지 않고 그릴 때 읽는다.
      case 'pair': {
        const last = scene.probes[scene.probes.length - 1];
        // 짚어 보지 않은 자리에 답할 수는 없다. 조용히 흘린다 (C2).
        if (!last || last.verdict !== 'pending') return scene;
        return {
          ...scene,
          probes: answerLast(scene.probes, 'divisor'),
          step: { kind: 'pair' },
        };
      }

      // 나누어떨어지지 않는다. **짚었다는 표식은 남는다** — 그것이 이 이행이
      // 고친 자리다. 옛 화면은 여기서 칠을 통째로 되돌려 자취를 지웠다.
      case 'miss': {
        const last = scene.probes[scene.probes.length - 1];
        if (!last || last.verdict !== 'pending') return scene;
        return {
          ...scene,
          probes: answerLast(scene.probes, 'none'),
          step: { kind: 'miss' },
        };
      }

      case 'cover':
        return { ...scene, covered: true, step: { kind: 'cover' } };

      // 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 거둔다.
      case 'rewind':
        return atStart({ base: scene.base });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
