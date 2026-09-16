/**
 * OpenAddressingProbe 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **몇 칸을 짚어 보고 어디에 앉았나.** 그러니 화면이 반드시 쥐고 있어야 하는 것은
 * 둘이다 — 걷는 열쇠가 지금까지 짚어 본 칸들과, 이미 앉은 열쇠들의 제 자리 ↔ 앉은
 * 자리다. 둘 다 **남는 강조**이므로 정적 그리기에도 들어간다. 빠뜨리면 되짚었을 때
 * 화면이 주장을 잃는다 (S-scene).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 네 자리에 숨겨 두었다.
 *
 * - **projector 의 `let size`** — 버킷 수를 쥐고 해시 줄 문안을 지었다. 이제 장면의
 *   `size` 이고 `initial` 이 한 번만 좁힌다.
 * - **stage 의 `let chip`** — 지금 걷는 열쇠가 무엇이고 어느 칸 위에 서 있는지가
 *   `<g>` 의 `transform` 안에만 있었다. 되감아 세운 화면에는 칩을 되살릴 근거가
 *   아예 없다. 이제 `walk` 가 말한다.
 * - **`arcs` Map 의 조회 분기** — `spill()` 이 `arcs.get(v.key)` 로 호를 찾고 없으면
 *   조용히 물러났다. 그 조회가 곧 "이 열쇠가 밀려 앉았나" 라는 상태였다. 이제
 *   `seats` 가 제 자리와 앉은 자리를 말하고 `spilled` 가 짚을 하나를 가리킨다.
 * - **`Map<string, { path; head }>` 자체** — 열쇠 이름(뜻)과 DOM 손잡이를 한 구조에
 *   묶어 둔 자리다. 호의 두 끝점이 곧 "제 자리에서 여기까지 밀려났다" 는 이 조각의
 *   결론인데, 그 수치가 `d` 속성의 문자열 안에만 있었다. `let` 도 `Set.has` 도 DOM
 *   되읽기도 아니라 grep 으로는 걸리지 않는다 — 타입 선언을 읽어야 나온다.
 *
 * 그리고 **자취가 칠에만 남던 자리**가 있었다. 짚어 보아 차 있던 칸은 잠깐 물들었다
 * 원래 색으로 돌아갔고, 지나온 길은 점선 하나의 `x2` 속성에만 있었다. 되짚으면
 * 둘 다 사라져 "몇 칸을 짚어 보았나" 를 화면이 말하지 못했다. 이제 `walk.probed` 가
 * 그것을 쥔다.
 *
 * 좌표는 담지 않는다. 칸 번호와 앉음/걸음이라는 구조만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 표 안을 걸어 다니는 열쇠 하나.
 *
 * `probed` 가 이 조각의 요점이다 — 짚어 보았더니 차 있던 칸들을 걸어온 차례대로
 * 쥔다. 지나가는 깜빡임이 아니라 **남는 표식**이라 정적 그리기에도 들어간다.
 */
export type ProbeWalk = {
  key: string;
  /** 제 자리. `(hash & 0x7FFFFFFF) % size` 가 정한 칸이고 caret 이 여기 선다. */
  home: number;
  /** 지금 선 칸. 아직 앉기 전이면 레인 위, 앉았으면 그 칸 안이다. */
  at: number;
  /** 짚어 보았더니 차 있던 칸들. 걸어온 차례대로. */
  probed: number[];
  /** 이미 표 안으로 내려앉았나. 앉으면 레인의 칩이 사라진다. */
  seated: boolean;
};

/** 표 안에 앉은 열쇠 하나. `home !== slot` 이면 밀려난 거리가 호로 남는다. */
export type ProbeSeat = { key: string; home: number; slot: number };

/** 해시 줄이 말할 인자. 문안은 그리는 쪽이 만든다 (C10). */
export type ProbeHashLine = { key: string; hash: number; home: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ProbeCaption =
  | { kind: 'arrive'; key: string; home: number }
  | { kind: 'probe'; from: number; to: number; holder: string }
  | { kind: 'seat'; key: string; slot: number }
  | { kind: 'spill'; key: string; home: number; slot: number; blocker: string }
  | { kind: 'done' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 운동의 **출발 자리를 함께 싣는 까닭** — 칩이 옆으로 밀려가는 운동은 지나간 칸에서
 * 출발하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 그래서 `slide` 가 `from` 을 직접 싣는다.
 */
export type ProbeStep =
  | { kind: 'arrive'; key: string; slot: number }
  | { kind: 'slide'; key: string; from: number; to: number }
  | { kind: 'seat'; key: string; slot: number }
  | { kind: 'spill'; key: string }
  | { kind: 'finish' };

export type OpenAddressingProbeScene = {
  /** 버킷 수. 바탕 — 걸음이 바꾸지 않는다. */
  size: number;
  /** 칸마다 앉은 열쇠. 비었으면 `null`. **걸음이 고치므로 바탕이 아니다.** */
  cells: (string | null)[];
  /** 앉은 열쇠들. 밀림 호는 여기서 나온다. 남는 강조다. */
  seats: ProbeSeat[];
  /** 지금 걷는 열쇠. 다음 열쇠가 올 때와 할 말을 마칠 때 비워진다. */
  walk: ProbeWalk | null;
  /** 해시 줄. 아직 아무도 오지 않았으면 `null`. */
  hashLine: ProbeHashLine | null;
  /** 남의 충돌이 번진 것으로 짚힌 열쇠. 그 호가 도드라진다. 남는 강조다. */
  spilled: string | null;
  /** 전부 표 안에 들어갔나. 테두리가 그 사실을 말한다. */
  closed: boolean;
  step: ProbeStep | null;
  caption: ProbeCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * **`cells` 를 여기 넣지 않는다.** 칸의 내용은 걸음이 고치는 자취이지 바탕이
 * 아니다. 넣어 두면 되감은 화면이 이미 다 찬 표로 서고 그 위에 algorithm 이 처음부터
 * 다시 앉히므로, 화면 안에서 두 이야기가 어긋난다 (S-scene).
 */
type ProbeBase = Pick<OpenAddressingProbeScene, 'size'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
function atStart(base: ProbeBase): OpenAddressingProbeScene {
  return {
    size: base.size,
    cells: new Array<string | null>(Math.max(0, base.size)).fill(null),
    seats: [],
    walk: null,
    hashLine: null,
    spilled: null,
    closed: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** initialData 가 버킷 수를 말하지 않는 자리에서 mount 될 때. */
const FALLBACK_SIZE = 8;

export const openAddressingProbeScene: ScenePlan<OpenAddressingProbeScene> = {
  /**
   * 첫 장면은 빈 표 하나다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 버킷 수를 여기서 좁힌다. 수 하나라
   * 참조를 쥘 일이 없다 — `cells` 는 여기서 새로 짓는다 (S-scene).
   */
  initial(initialData: unknown): OpenAddressingProbeScene {
    const d = (initialData ?? {}) as { size?: unknown };
    const size = num(d.size, FALLBACK_SIZE);
    return atStart({ size: size > 0 ? Math.floor(size) : FALLBACK_SIZE });
  },

  reduce(
    scene: OpenAddressingProbeScene,
    event: FacetRuntimeEvent,
  ): OpenAddressingProbeScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 열쇠가 제 자리 위에 내려앉는다. 아직 아무 칸도 짚어 보지 않았다.
      case 'key-arrive': {
        const key = str(p.key, '');
        const home = num(p.home, 0);
        return {
          ...scene,
          walk: { key, home, at: home, probed: [], seated: false },
          hashLine: { key, hash: num(p.hash, 0), home },
          step: { kind: 'arrive', key, slot: home },
          caption: { kind: 'arrive', key, home },
        };
      }

      // 짚어 본 칸이 차 있다 → 한 칸 옆으로 밀려간다. 짚어 본 자리가 자취로 남는다.
      case 'probe-step': {
        const key = str(p.key, scene.walk?.key ?? '');
        const from = num(p.from, 0);
        const to = num(p.to, 0);
        const walk = scene.walk;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          walk: {
            key,
            home: walk?.home ?? from,
            at: to,
            probed: [...(walk?.probed ?? []), from],
            seated: false,
          },
          step: { kind: 'slide', key, from, to },
          caption: { kind: 'probe', from, to, holder: str(p.holder, '') },
        };
      }

      // 빈 자리를 만나 표 안으로 떨어진다. 걸어온 자취는 그 걸음 동안 남아 있다.
      case 'key-seated': {
        const key = str(p.key, '');
        const home = num(p.home, 0);
        const slot = num(p.slot, 0);
        const cells = scene.cells.slice();
        if (slot >= 0 && slot < cells.length) cells[slot] = key;
        return {
          ...scene,
          cells,
          seats: [...scene.seats, { key, home, slot }],
          walk: { key, home, at: slot, probed: scene.walk?.probed ?? [], seated: true },
          step: { kind: 'seat', key, slot },
          caption: { kind: 'seat', key, slot },
        };
      }

      // 남의 충돌이 번진 자리를 짚는다. 그 열쇠의 호가 도드라진 채 남는다.
      case 'spill-noted': {
        const key = str(p.key, '');
        return {
          ...scene,
          spilled: key,
          step: { kind: 'spill', key },
          caption: {
            kind: 'spill',
            key,
            home: num(p.home, 0),
            slot: num(p.slot, 0),
            blocker: str(p.blocker, ''),
          },
        };
      }

      // 할 말을 마쳤다. 걷던 자취를 거두고 표 전체를 테두리로 부른다.
      case 'done':
        return {
          ...scene,
          walk: null,
          closed: true,
          step: { kind: 'finish' },
          caption: { kind: 'done' },
        };

      case 'rewind':
        // 바탕은 버킷 수뿐이다. 칸의 내용은 걸어온 자취라 여기서 다시 비워진다.
        return atStart({ size: scene.size });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
