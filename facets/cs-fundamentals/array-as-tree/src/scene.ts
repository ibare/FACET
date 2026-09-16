/**
 * ArrayAsTree 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에는 번호 순으로 늘어선 칸이, 아래에는 같은 값을 나무로 본 자리가 있다. 칸과
 * 마디는 **같은 것의 두 모습**이므로 커서도 하나다 — 짚어진 자리 번호 하나가 위의
 * 테두리와 아래의 동그라미를 동시에 정하고, 점선이 그 둘을 잇는다.
 *
 * 옛 stage 는 그 번호를 `let currentIndex` 로 자기 안에 쥐고 있었다. 되짚어도
 * 되돌아가지 않아, 되감은 화면이 지나온 자리에서 미끄러져 나왔다. 여기서는 그것이
 * 장면의 `cursor` 하나다.
 *
 * ── 머무는 것 셋
 *
 *   - 늘어선 값 (`values`)   — 한 번 놓이면 끝까지 그대로다. 걸음이 고치지 않는다.
 *   - 짚어진 자리 (`cursor`) — 배열 칸과 나무 마디가 이 하나를 같이 쓴다.
 *   - 잎임을 보인 자리 (`leaf`) — 다음으로 건너뛸 때까지 유령 자식 둘이 남는다.
 *   - 마무리 (`concluded`)   — 커서를 거두고 칸과 마디 전부가 물든다.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은 그것을
 * 보고 무엇을 흐르게 할지 고른다. 미끄러짐의 출발 자리는 `step.from` 이 말한다 —
 * 그리는 쪽이 `prev` 를 들춰 보지 않게 하려는 것이다 (S-scene).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸의 폭도, 마디의 자리도, 유령 자식이 뜨는 곳도 전부 번호와
 * 칸 수에서 역산되므로 그리는 쪽의 몫이다 (S-piece).
 *
 * 반면 `2i+1` · `2i+2` · `⌊(i−1)/2⌋` 의 **결과**는 담는다. 그 셈이 이 조각의
 * 주장 자체이고, algorithm 이 실제로 센 값이다. 그리는 쪽에서 같은 공식을 다시
 * 두면 그림이 제 주장을 스스로 증명하는 꼴이 되어 뜻이 없어진다 — 담기는 것은
 * 준-좌표가 아니라 논증의 수다.
 *
 * 문안은 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 `params.t`
 * 로 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 한다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 잎임을 보인 자리. 자식 번호 둘이 칸 수를 넘었다는 사실이 곧 이 표식이다.
 *
 * `left` · `right` 는 algorithm 이 `2·at+1` · `2·at+2` 로 실제로 센 값이다.
 * 유령이 뜨는 자리는 담지 않는다 — 그것은 좌표다.
 */
export type LeafMark = { at: number; left: number; right: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ArrayAsTreeCaption =
  | { kind: 'start'; i: number }
  | { kind: 'descendLeft'; from: number; to: number }
  | { kind: 'descendRight'; from: number; to: number }
  | { kind: 'ascend'; from: number; to: number }
  | { kind: 'root'; from: number; to: number }
  | { kind: 'leaf'; at: number; l: number; r: number; n: number }
  | { kind: 'saved'; n: number; links: number; hypo: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 옛 stage 는 `currentIndex === null` 인지로 "나타나기" 와 "미끄러지기" 를 말없이
 * 갈랐다. 그 분기가 곧 상태였으므로 여기서 갈래를 드러내 둔다.
 */
export type ArrayAsTreeStep =
  | { kind: 'appear'; at: number }
  | { kind: 'slide'; from: number; to: number }
  | { kind: 'leaf'; at: number }
  | { kind: 'conclude' };

export type ArrayAsTreeScene = {
  /** 칸에 담긴 값. 길이가 곧 칸 수이고 나무의 마디 수다. */
  values: readonly number[];
  /** 지금 짚어진 자리. 배열 칸과 나무 마디가 이 하나를 같이 쓴다. */
  cursor: number | null;
  /** 잎임을 보인 자리. 다음으로 건너뛰거나 마무리하면 거둬진다. */
  leaf: LeafMark | null;
  /** 마무리했나. 커서가 사라지고 칸과 마디 전부가 물든다. */
  concluded: boolean;
  step: ArrayAsTreeStep | null;
  caption: ArrayAsTreeCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * 되감기는 이 바탕만 남기고 나머지를 처음으로 되돌린다. 타입을 `Pick` 으로 좁혀
 * 두는 것은, 걸어온 자취(`cursor` · `leaf` · `concluded`)를 실수로 바탕에 섞어
 * 넘기면 **되감은 화면에 지나온 흔적이 남기** 때문이다 (S-scene).
 */
type Base = Pick<ArrayAsTreeScene, 'values'>;

function atStart(base: Base): ArrayAsTreeScene {
  return { ...base, cursor: null, leaf: null, concluded: false, step: null, caption: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readValues(initialData: unknown): number[] {
  const d = (initialData ?? {}) as { values?: unknown };
  if (!Array.isArray(d.values)) return [];
  // 넘겨받은 배열을 참조로 쥐지 않는다 — 러너가 주는 것은 mechanism 과 함께 쓰는
  // 한 객체다 (S-scene).
  return d.values.filter((v): v is number => typeof v === 'number');
}

function readVars(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * `textKey` → 캡션. algorithm 이 키와 인자만 보내므로 여기서 갈래로 옮긴다.
 *
 * `from` 은 짚고 있던 자리다. algorithm 이 인자로도 실어 보내지만 화면의 정본은
 * 커서이므로 그쪽을 먼저 본다 — 둘이 갈릴 자리를 아예 만들지 않는다.
 */
function jumpCaption(
  key: string,
  to: number,
  from: number,
): ArrayAsTreeCaption | null {
  switch (key) {
    case 'caption.start':
      return { kind: 'start', i: to };
    case 'caption.descendLeft':
      return { kind: 'descendLeft', from, to };
    case 'caption.descendRight':
      return { kind: 'descendRight', from, to };
    case 'caption.ascend':
      return { kind: 'ascend', from, to };
    case 'caption.root':
      return { kind: 'root', from, to };
    default:
      return null;
  }
}

export const arrayAsTreeScene: ScenePlan<ArrayAsTreeScene> = {
  /**
   * 첫 장면 — 칸과 나무는 서 있고 커서는 아직 없다.
   *
   * 이 조각에는 바탕을 채우는 `init` 이벤트가 없다. 칸에 담긴 값은 걸음이 고치지
   * 않는 순수한 바탕이라 여기서 복사해 둔다.
   */
  initial(initialData: unknown): ArrayAsTreeScene {
    return atStart({ values: readValues(initialData) });
  },

  reduce(scene: ArrayAsTreeScene, event: FacetRuntimeEvent): ArrayAsTreeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'jump': {
        const to = num(p.toIndex);
        const key = typeof p.textKey === 'string' ? p.textKey : '';

        // 손으로 짚기 시작 — 바탕만 남기고 걸어온 자취를 거둔 뒤 뿌리에 선다.
        // 커서가 없던 자리에서 새로 나타나므로 갈래도 `appear` 다.
        if (p.rewind === true) {
          const fresh = atStart({ values: scene.values });
          return {
            ...fresh,
            cursor: to,
            step: { kind: 'appear', at: to },
            caption: jumpCaption(key, to, to),
          };
        }

        const vars = readVars(p.vars);
        const from = scene.cursor ?? num(vars.from, to);
        return {
          ...scene,
          cursor: to,
          // 건너뛰면 유령은 거둬진다 — 한 번에 한 자리만 말한다.
          leaf: null,
          // 마무리한 뒤 다시 짚기 시작하면 물든 칸도 함께 풀린다.
          concluded: false,
          step:
            scene.cursor === null
              ? { kind: 'appear', at: to }
              : { kind: 'slide', from: scene.cursor, to },
          caption: jumpCaption(key, to, from),
        };
      }

      case 'leaf-miss': {
        const at = num(p.atIndex);
        const left = num(p.leftIndex);
        const right = num(p.rightIndex);
        return {
          ...scene,
          leaf: { at, left, right },
          step: { kind: 'leaf', at },
          caption: { kind: 'leaf', at, l: left, r: right, n: scene.values.length },
        };
      }

      case 'conclude': {
        const vars = readVars(p.vars);
        return {
          ...scene,
          // 커서와 유령을 거둔다 — 마지막에 남는 것은 물든 칸과 마디 전부다.
          cursor: null,
          leaf: null,
          concluded: true,
          step: { kind: 'conclude' },
          caption: {
            kind: 'saved',
            n: num(vars.n, scene.values.length),
            links: num(vars.links),
            hypo: num(vars.hypo, scene.values.length * 2),
          },
        };
      }

      default:
        // 이 algorithm 이 발신하는 이벤트는 위 셋이 전부다. 그 밖의 것은 조용히
        // 버린다 (C2).
        return scene;
    }
  },
};
