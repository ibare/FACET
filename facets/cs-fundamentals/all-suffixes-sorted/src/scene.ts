/**
 * allSuffixesSorted 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 숨은 상태는 어디에 있었나
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고, stage 의 `let` 도 `destroyed` ·
 * `epoch` 둘뿐이라 전부 시간 장치였다. 조회로 갈리는 분기도, DOM 되읽기도 0 건이다.
 * 그것은 숨은 상태가 없다는 뜻이 아니라 **화면이 통째로 상태**라는 뜻이었다.
 *
 * - **어느 꼬리가 줄의 몇째 자리에 앉았나** — `const placedAt: number[]` 한 줄.
 *   `const` 라 `let` 을 훑는 grep 을 통과하는데 `placedAt[k] = i` 로 제자리에서
 *   고쳐졌고, `placedAt.length = 0` 으로 비워졌다. **이 조각이 말하려는 줄 자체**가
 *   거기 있었다. 이제 `placed` 가 말한다 — 사전 순으로 쌓이므로 **길이가 곧 다음
 *   차례의 자리 번호**다.
 * - **꼬리가 어느 국면에 있나** — 각 줄 `<g>` 의 `transform`. 원본 글자 위에 겹쳐
 *   숨어 있나(아직 안 잘렸다) · 계단으로 내려섰나(잘렸다) · 왼끝을 맞췄나 ·
 *   줄로 건너갔나가 **좌표 하나에** 실려 있었다. 좌표가 아니라 *단계*를 말하는
 *   `transform` 이다 (프로토콜 3-1 의 ⑤). 이제 `cut` · `aligned` · `placed` 가 가른다.
 * - **꼬리의 형편** — `type RowState = 'default' | 'active' | 'placed'` 가 선언만
 *   있고 **값이 어디에도 저장되지 않았다.** `setRowState` 가 `fill` · `stroke` 에만
 *   썼다. 이제 `placed` 에 있나로 파생되고, `active` 는 걸음의 운동으로만 산다.
 * - **화면의 지금 자리를 적어 둔 거울** — `const pos: { x, y }[]`. `getAttribute` 도
 *   `textContent` 도 쓰지 않으니 DOM 되읽기 grep 을 통과하고 `const` 라 `let` grep 도
 *   통과하는데, `alignLeft` 와 `takePlace` 가 **운동의 출발값**을 여기서 꺼냈다
 *   (프로토콜 4 절의 "DOM 의 거울"). 되짚어 세운 직후에는 그 표가 옛 화면의 것이라
 *   줄이 엉뚱한 자리에서 출발했다. 이제 출발 자리는 장면에서 셈한다 — 아직 줄에
 *   앉지 않은 꼬리는 왼끝을 맞췄으면 `poolCellsX`, 아니면 제 계단 자리에 있다.
 * - **한 덩어리로 모였다는 표식** — 띠의 `height`/`opacity` 와 앞머리 칸의 `fill`.
 *   둘 다 mount 때 한 번 짓고 계속 쓰는 요소에 얹혀 있었다. 이제 `cluster` 가 말하고
 *   **남는 표식이라 정적 그리기에도 들어간다.**
 *
 * ── 같은 물음에 답이 둘이었다
 *
 * 한때 `cluster` 발신이 `ranks` 와 `prefix` 를 실어 왔다. 그 수는 algorithm 이 제
 * `sorted` 배열에서 셈한 것이고, 화면의 줄은 `take-place` 를 받아 쌓은
 * `placedAt` 이었다 — **같은 물음(줄이 어떻게 섰나)에 답이 둘**이라 언젠가 갈린다.
 * 이제 장면이 제 `placed` 로 덩어리를 셈한다 (`largestSharedHeadRun`). 그 규칙은
 * algorithm 이 내주고 장면이 부르므로 적힌 자리는 여전히 하나다.
 *
 * 자리 번호(`rank`)와 꼬리의 글자(`tail`)도 실려 오지 않는다 — 앞의 것은 `placed`
 * 의 길이이고 뒤의 것은 바탕 글을 시작 자리에서 자른 것이다. 걸음이 말하는 것은
 * **다음 차례가 어느 꼬리인가**(`from`) 하나뿐이고, 그것만이 걸음의 판정이다.
 *
 * 좌표는 담지 않는다. 시작 자리와 줄 자리라는 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스 폭에서 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { largestSharedHeadRun, type Tail } from './algorithm.js';

/** 앞머리를 나눠 가진 이웃 덩어리. 줄 자리들과 그들이 함께 가진 앞머리. */
export type AllSuffixesSortedCluster = {
  /** 그 구간에 속한 줄 자리(rank)들. */
  ranks: number[];
  /** 그들이 함께 가진 앞머리. */
  prefix: string;
};

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 출발 그림은 싣지 않는다 — 떨어지는 꼬리도 왼끝을 맞추는 꼬리도 줄로 건너가는
 * 꼬리도 출발 자리가 장면에서 셈해진다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type AllSuffixesSortedStep =
  | { kind: 'cut' }
  | { kind: 'align' }
  | { kind: 'place'; from: number; rank: number }
  | { kind: 'cluster' };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지다.
 *
 * 꼬리의 글자는 싣지 않는다 — 바탕 글을 `from` 에서 자르면 나온다.
 */
export type AllSuffixesSortedCaption =
  | { kind: 'cutTails' }
  | { kind: 'alignLeft' }
  | { kind: 'takePlace'; from: number }
  | { kind: 'cluster' };

export type AllSuffixesSortedScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 꼬리를 뗄 원본 문자열. 칸 수도 꼬리 길이도 글자도 이것 하나가 정한다. */
  text: string;

  // ── 걸어온 자취.
  /** 꼬리들이 글에서 떨어져 나와 제 계단 자리에 내려섰나. */
  cut: boolean;
  /** 꼬리들의 왼끝을 맞췄나 — 서로 견줄 수 있는 꼴이 되었나. */
  aligned: boolean;
  /**
   * 줄에 앉은 꼬리들. 사전 순으로, 각각 **시작 자리**다.
   *
   * 배열의 자리가 곧 줄 자리(rank)이므로 **길이가 다음 차례의 번호**다. 걸음이
   * 자리 번호를 실어 오지 않는 까닭이 이것이다.
   */
  placed: number[];
  /**
   * 앞머리를 나눠 가진 이웃 덩어리. `cluster` 걸음에서 선다.
   *
   * **이 조각의 결론이 여기 있다.** 남는 표식이라 정적 그리기에도 반드시 들어간다 —
   * 빠뜨리면 완주 화면에 줄만 남고 어느 것들이 왜 한 덩어리인지가 사라진다.
   */
  cluster: AllSuffixesSortedCluster | null;

  step: AllSuffixesSortedStep | null;
  caption: AllSuffixesSortedCaption | null;
};

/**
 * 걸음이 고치지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 걸음이 고치는 `cut` · `placed` · `cluster` 는 여기 들지 않는다 — 들면 되감은
 * 화면이 이미 다 선 줄을 단 채로 서고, 그 위에 algorithm 이 처음부터 다시 세운
 * 줄이 겹친다 (프로토콜 4 절).
 */
type AllSuffixesSortedBase = Pick<AllSuffixesSortedScene, 'text'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: AllSuffixesSortedBase): AllSuffixesSortedScene {
  return {
    text: base.text,
    cut: false,
    aligned: false,
    placed: [],
    cluster: null,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function idx(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * 줄에 앉은 꼬리들을 장면의 바탕 글에서 되살린다.
 *
 * 꼬리의 글자를 걸음이 실어 오지 않는 까닭이 이것이다 — 시작 자리와 바탕 글이
 * 있으면 자르면 나온다. 두 자리에서 만든 글자는 언젠가 갈린다.
 */
export function placedTails(scene: AllSuffixesSortedScene): Tail[] {
  return scene.placed.map((from) => ({ from, text: scene.text.slice(from) }));
}

export const allSuffixesSortedScene: ScenePlan<AllSuffixesSortedScene> = {
  /**
   * 첫 장면은 바탕 글만 쥐고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 문자열은
   * 값이라 쥐어도 제자리에서 고쳐지지 않지만, 넘겨받은 객체 자체는 mechanism 과
   * view 가 함께 쓰는 것이라 참조로 담지 않는다 (S-scene).
   */
  initial(initialData: unknown): AllSuffixesSortedScene {
    const d = (initialData ?? {}) as { text?: unknown };
    return atStart({ text: typeof d.text === 'string' ? d.text : '' });
  },

  reduce(scene: AllSuffixesSortedScene, event: FacetRuntimeEvent): AllSuffixesSortedScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 자리마다 잘라 꼬리를 만든다. 꼬리들이 글에서 떨어져 계단으로 내려선다.
      case 'cut-tails':
        return { ...scene, cut: true, step: { kind: 'cut' }, caption: { kind: 'cutTails' } };

      // 왼끝을 맞춘다. 잘려 나온 뒤에만 뜻이 있다.
      case 'align-left':
        if (!scene.cut) return scene;
        return { ...scene, aligned: true, step: { kind: 'align' }, caption: { kind: 'alignLeft' } };

      // 사전 순으로 다음 차례인 꼬리가 줄의 제 자리로 건너간다.
      case 'take-place': {
        const from = idx(p.from);
        if (from === null || from >= scene.text.length) return scene;
        if (scene.placed.includes(from)) return scene;
        // 자리 번호는 지금까지 앉은 수다. 걸음이 실어 온 수를 쓰지 않는다.
        const rank = scene.placed.length;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          placed: [...scene.placed, from],
          step: { kind: 'place', from, rank },
          caption: { kind: 'takePlace', from },
        };
      }

      // 앞머리가 같은 꼬리들이 이룬 구간을 짚는다. 그림과 같은 자료에서 셈한다.
      case 'cluster': {
        const run = largestSharedHeadRun(placedTails(scene));
        if (run.ranks.length === 0) return scene;
        return {
          ...scene,
          cluster: { ranks: run.ranks, prefix: run.prefix },
          step: { kind: 'cluster' },
          caption: { kind: 'cluster' },
        };
      }

      case 'rewind':
        // 바탕만 넘긴다. 변수째 넘기면 초과 속성 검사가 돌지 않아 자취가 딸려 간다.
        return atStart({ text: scene.text });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
