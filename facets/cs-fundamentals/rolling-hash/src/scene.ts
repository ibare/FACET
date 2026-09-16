/**
 * RollingHash 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 글자 줄 위로 창틀이 밀려가고, 그 아래 레일 위를 바퀴가 굴러간다. 바퀴에 적힌
 * 수가 지금 창의 해시이고, 지나온 자리마다 그 수가 자취로 남는다.
 *
 * **머무는 것**은 넷이다.
 *
 *   - 찾는 조각의 해시 (`patternHash`) — 한 번 서면 끝까지 그대로다.
 *   - 지나온 창들 (`marks`) — 차례가 곧 창의 왼쪽 끝이고, 쌓이는 자취다.
 *   - 이번 걸음이 만진 글자 (`readAt` · `goneAt`) — **이 조각의 주장 그 자체**라
 *     정적 그리기에도 넣는다. 옛 화면은 이것을 200ms 물들였다 지워, 다 끝난
 *     화면에 "만진 것은 둘뿐" 이 남아 있지 않았다 (프로토콜 4 절).
 *   - 이번 구르기의 두 몫 (`terms`) — 뺀 값과 더한 값. 그 둘이 곧 손질 둘이다.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은
 * 그것을 보고 무엇을 흐르게 할지 고른다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 창의 차례 · 빠지는/들어오는 글자 자리 · 맞았나 · 한 바퀴 돌았나 | 장면이 센다 |
 * | 처음부터 셈하는 해시 (`hashOf`) | algorithm 이 내주고 장면이 부른다 |
 * | 굴리는 식의 두 항과 그 결과 (`outTerm` · `inValue` · `hash`) | **싣는다** |
 *
 * 가운데 줄에 경계가 있다. `hashOf` 는 **이 조각이 피하려는 셈**이라 내주어도
 * 조각이 말하려는 바가 그대로 남는다 — 오히려 첫 창이 치르는 값이 무엇인지
 * 분명해진다. 반대로 `(h − 빠지는 글자·밑^(m−1))·밑 + 들어오는 글자값` 은
 * **이 조각의 알고리즘 그 자체**다. 내주면 장면이 알고리즘을 되풀이하고 발신이
 * 장식이 되며, 더 나쁘게는 화면이 "다시 셈하지 않았다" 고 말하면서 실제로는
 * `hashOf` 로 다시 셈한 수를 띄우게 된다. 그래서 굴린 값과 그 두 항만 싣는다
 * (`bottom-up-table` 의 점화식이 그 자리였다).
 *
 * 좌표는 담지 않는다. 글자 수와 창의 왼쪽 끝이 자리를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { hashOf } from './algorithm.js';

/**
 * 지나온 창 하나가 남긴 자국.
 *
 * 창의 왼쪽 끝은 담지 않는다 — 창은 왼쪽부터 한 칸씩 밀리므로 **배열의 차례가
 * 곧 그 자리**다 (프로토콜 4 절 "차례는 발신이 오는 순서가 이미 말한다").
 */
export type RollingHashMark = {
  /** 그 창의 해시. 첫 창은 처음부터 셈한 값이고, 그 뒤는 굴러 나온 값이다. */
  hash: number;
  /** 그 창을 세우는 데 만진 글자 수. 첫 창은 창 너비, 구르기는 둘. */
  reads: number;
};

/** 이번 구르기의 두 몫 — 빼는 값과 더하는 값. 굴리는 식의 두 항이다. */
export type RollTerms = { minus: number; plus: number };

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type RollingHashStep =
  | { kind: 'pattern' }
  | { kind: 'first' }
  | { kind: 'roll' }
  | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type RollingHashCaption =
  | { kind: 'pattern'; h: number }
  | { kind: 'first'; h: number }
  | { kind: 'roll'; h: number }
  | { kind: 'match'; h: number }
  | { kind: 'wrapped'; h: number }
  | { kind: 'done'; windows: number; rolls: number; touches: number };

export type RollingHashScene = {
  /** 훑을 텍스트. */
  text: string;
  /** 찾는 조각. 창의 너비가 된다. */
  pattern: string;
  /** 자릿수의 밑. `hashOf` 에 먹인다. */
  radix: number;
  /** 법(modulus). */
  mod: number;
  /** 찾는 조각의 해시. 아직 셈하지 않았으면 `null`. */
  patternHash: number | null;
  /** 지나온 창들. 차례가 곧 창의 왼쪽 끝이다. */
  marks: RollingHashMark[];
  /** 이번 걸음이 읽은 글자 자리 — 첫 창은 창 전체, 구르기는 들어온 하나. */
  readAt: number[];
  /** 이번 걸음에 창 밖으로 빠져나간 글자 자리. */
  goneAt: number | null;
  /** 이번 구르기의 두 몫. 구르기 걸음에서만 있다. */
  terms: RollTerms | null;
  /** 창의 글자가 첫 창과 같아진 자리들. 그 자리와 0 에 눈금이 선다. */
  wrapAt: number[];
  /** 바퀴가 지나온 길을 한 줄로 긋는 총평 걸음까지 왔나. */
  done: boolean;
  step: RollingHashStep | null;
  caption: RollingHashCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `marks` · `wrapAt` 은 걸어온 자취이므로 여기 넣지 않는다. 넣으면 되감은 화면에
 * 앞 주행의 자취가 남은 채로 서고 그 위에 algorithm 이 새로 굴린 수가 겹친다
 * (프로토콜 4 절).
 */
type RollingHashBase = Pick<RollingHashScene, 'text' | 'pattern' | 'radix' | 'mod'>;

/**
 * 아무것도 굴러가지 않은 처음 화면. 글자 줄과 레일만 깔려 있다.
 *
 * 호출부는 반드시 객체 리터럴을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (프로토콜 4 절).
 */
function atStart(base: RollingHashBase): RollingHashScene {
  return {
    text: base.text,
    pattern: base.pattern,
    radix: base.radix,
    mod: base.mod,
    patternHash: null,
    marks: [],
    readAt: [],
    goneAt: null,
    terms: null,
    wrapAt: [],
    done: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function posInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : fallback;
}

/**
 * 이번 걸음이 만진 글자 수.
 *
 * 화면에 표식이 서는 자리를 그대로 센다 — 결론이 상수로 박히지 않도록
 * **그림과 같은 자료**에서 나오게 한다 (프로토콜 4 절).
 */
function touchCount(readAt: readonly number[], goneAt: number | null): number {
  return readAt.length + (goneAt === null ? 0 : 1);
}

export const rollingHashScene: ScenePlan<RollingHashScene> = {
  /**
   * 첫 장면은 바탕만 안다 — 글자 줄과 찾는 조각은 저작 선언이 정하므로 첫 그림부터
   * 서 있어야 한다. 넘겨받은 객체를 쥐지 않고 **값만 복사해** 온다. 참조를 쥐면
   * 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): RollingHashScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      text: str(d.text),
      pattern: str(d.pattern),
      radix: posInt(d.base, 1),
      mod: posInt(d.mod, 1),
    });
  },

  reduce(scene: RollingHashScene, event: FacetRuntimeEvent): RollingHashScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 찾는 조각의 해시가 기준 자리에 오른다. 값은 algorithm 이 내준 함수로 셈한다.
      case 'pattern-hash': {
        const h = hashOf(scene.pattern, scene.radix, scene.mod);
        return {
          ...scene,
          patternHash: h,
          readAt: [],
          goneAt: null,
          terms: null,
          step: { kind: 'pattern' },
          caption: { kind: 'pattern', h },
        };
      }

      // 첫 창 — 글자를 하나씩 다 읽어 처음부터 셈한다. 이 조각이 덜어 내려는 값이다.
      case 'window-init': {
        const m = scene.pattern.length;
        if (m === 0 || scene.text.length < m) return scene;
        const h = hashOf(scene.text.slice(0, m), scene.radix, scene.mod);
        const readAt: number[] = [];
        for (let k = 0; k < m; k += 1) readAt.push(k);
        return {
          ...scene,
          marks: [{ hash: h, reads: touchCount(readAt, null) }],
          readAt,
          goneAt: null,
          terms: null,
          step: { kind: 'first' },
          caption: { kind: 'first', h },
        };
      }

      // 창이 한 칸 구른다. 실려 오는 것은 굴리는 식의 두 항과 그 결과뿐이다.
      case 'window-roll': {
        if (
          typeof p.hash !== 'number' ||
          typeof p.outTerm !== 'number' ||
          typeof p.inValue !== 'number'
        ) {
          return scene;
        }
        const m = scene.pattern.length;
        // 창은 왼쪽부터 한 칸씩 밀리므로 지나온 창의 수가 곧 지금 창의 왼쪽 끝이다.
        const start = scene.marks.length;
        if (m === 0 || start < 1 || start + m > scene.text.length) return scene;

        const readAt = [start + m - 1];
        const goneAt = start - 1;
        // 창의 글자가 첫 창과 같아졌나 — 바탕만 보면 나오는 판정이라 장면이 센다.
        const wrapped = scene.text.slice(start, start + m) === scene.text.slice(0, m);
        const match = scene.patternHash !== null && p.hash === scene.patternHash;

        return {
          ...scene,
          marks: [...scene.marks, { hash: p.hash, reads: touchCount(readAt, goneAt) }],
          readAt,
          goneAt,
          terms: { minus: p.outTerm, plus: p.inValue },
          wrapAt: wrapped ? [...scene.wrapAt, start] : scene.wrapAt,
          step: { kind: 'roll' },
          caption: match
            ? { kind: 'match', h: p.hash }
            : wrapped
              ? { kind: 'wrapped', h: p.hash }
              : { kind: 'roll', h: p.hash },
        };
      }

      // 할 말을 마치고 결론만 말한다. 만진 글자의 표식은 그대로 두어, 다 끝난
      // 화면에도 "이번 구르기가 만진 것은 둘뿐" 이 남는다.
      case 'done': {
        const windows = scene.marks.length;
        const rolls = Math.max(0, windows - 1);
        const last = rolls > 0 ? scene.marks[windows - 1] : null;
        return {
          ...scene,
          done: true,
          step: { kind: 'done' },
          caption: {
            kind: 'done',
            windows,
            rolls,
            // 마지막 구르기가 만진 글자 수 — 완주 화면에 표식으로 서 있는 그 수다.
            touches: last === null ? 0 : last.reads,
          },
        };
      }

      // 손으로 짚기 시작 — 바탕만 남기고 굴러온 자취를 전부 거둔다.
      case 'rewind':
        return atStart({
          text: scene.text,
          pattern: scene.pattern,
          radix: scene.radix,
          mod: scene.mod,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
