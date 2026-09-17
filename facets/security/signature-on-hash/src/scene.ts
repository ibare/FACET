/**
 * signatureOnHash 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 없었고 stage 의 `let` 은 둘, 조회로 갈리는 분기도 DOM
 * 되읽기도 0 건이었다. **곧 화면이 통째로 상태였다는 뜻이다.**
 *
 * - `let rows: Row[]` — `Row = { group, bar, size, width, color }` 로 **DOM 손잡이와
 *   수치가 한 객체**에 묶여 있었다. `width` 와 `color` 는 바탕에서 나오는 값이라
 *   상태가 아니고, 진짜 상태는 `group.style.opacity` 였다 — 그 세 값이
 *   "몇 마디까지 섰나" 를 쥐고 있었다. 지금은 `standing` 하나가 말한다.
 * - `let arrows: SVGGElement[]` — 같은 물음의 **둘째 답**이었다. 화살의
 *   `style.opacity` 가 "몇 번 접혔나" 를 따로 쥐고 있었고, 걸음마다 둘을 같이
 *   올려야 했다. 지금은 `standing` 에서 파생된다 (`standing - 1`).
 * - `size` 글자의 `fill` — 셋째 자리. `compare()` 가 서명 줄의 크기 글자를 강조색으로
 *   갈아 두는 것이 "짚었다" 의 유일한 기록이었다. 지금은 `marked` 가 말한다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다 (함정 34)
 *
 * 이 조각의 주장은 "문서 전체가 아니라 해시에 서명한다" 이고, 그 논증은 **비율**이다.
 * 그런데 옛 화면은 비율을 그리지 않고 있었다.
 *
 * - 척도가 문서 막대에서 나왔다 (`scale = BAR_MAX_W / documentBytes`). 그래서 문서
 *   막대는 자료가 무엇이든 **언제나 430px** 였고, 해시와 서명은 최소 폭 6·12px 로
 *   깎여 셋 다 사실상 상수였다. 실제 비율은 1 : 115,625 인데 그림은 1 : 72 를
 *   말하고 있었다.
 * - stage 머리 주석은 "문서 막대는 화면 폭을 넘어간다 — 잘림이 곧 얼마든지 커진다는
 *   표시다" 라고 적어 두었는데, 150 + 430 = 580 이라 **넘어가지 않았다.**
 *
 * 지금은 척도가 **가장 작은 마디**에서 나온다 (그리는 쪽의 `geomOf`). 해시를
 * 알아볼 수 있는 최소 폭에 맞추면 나머지는 참된 비율로 따라 나오고, 문서 막대가
 * 화면을 한참 넘어간다 — 잘림이 곧 논증이 된다. 눈속임은 하나뿐이고(해시의 최소 폭)
 * 그 전제는 `description.ts` 가 밝힌다 (S-piece: 화면에 각주를 두지 않는다).
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 몇 마디가 섰나 · 화살이 몇인가 | **장면이 센다** (`standing`) |
 * | 문서가 서명보다 몇 배인가 | **장면이 센다** (`timesLargerOf`) |
 * | 막대의 폭 · 자리 | **그리는 쪽이 캔버스에서 역산한다** (S-piece) |
 * | 이름 · 바이트 수 | **`init` 이 값을 베껴 싣는다** — 저작 자료다 |
 *
 * 좌표는 담지 않는다. 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 걸음이 고치지 않는 바탕. `init` 이 **값을 베껴** 채운다.
 *
 * 러너가 주는 객체를 참조로 쥐면 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다
 * (S-scene).
 */
export type SignHashBase = {
  /** 화면에 인쇄할 해시 함수 이름. 첫 화살이 이것을 단다. */
  hashLabel: string;
  /** 화면에 인쇄할 서명 방식 이름. 둘째 화살이 이것을 단다. */
  signatureLabel: string;
  /** 서명할 문서의 크기 (바이트). 실측값이다. */
  documentBytes: number;
  /** 해시 길이 (바이트). */
  digestBytes: number;
  /** 서명 길이 (바이트). */
  signatureBytes: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 접힘이 어느 폭에서 출발하는지도 어느 색에서
 * 출발하는지도 전부 바탕에서 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type SignHashStep =
  /** 문서가 놓인다. */
  | { kind: 'document' }
  /** 문서가 해시로 접힌다. */
  | { kind: 'hash' }
  /** 해시가 서명이 된다. 같은 운동이되 이번엔 늘어난다. */
  | { kind: 'sign' }
  /** 서명 크기가 문서 크기와 무관함을 짚는다. */
  | { kind: 'mark' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type SignHashCaption =
  | { kind: 'document' }
  | { kind: 'hashed'; bytes: number }
  | { kind: 'signed'; bytes: number }
  | { kind: 'fixed'; bytes: number; times: number };

export type SignatureOnHashScene = {
  /** 바탕. `init` 이 오기 전에는 `null` 이라 빈 캔버스다. */
  base: SignHashBase | null;
  /**
   * 몇 마디가 서 있나 — 0 아무것도 · 1 문서 · 2 해시까지 · 3 서명까지.
   *
   * 화살은 마디 **사이**의 것이라 따로 세지 않는다. `standing - 1` 이 그 수다.
   */
  standing: number;
  /** 서명 크기가 문서 크기와 무관함을 짚었나. 짚은 자국은 머문다. */
  marked: boolean;
  step: SignHashStep | null;
};

/** 걸음이 고치지 않는 바탕만 추린 것. */
type Base = Pick<SignatureOnHashScene, 'base'>;

/**
 * 되돌린 뒤의 장면 — 아무 마디도 서 있지 않다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (프로토콜 4 절).
 */
function atStart(base: Base): SignatureOnHashScene {
  return { base: base.base, standing: 0, marked: false, step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────

/**
 * 문서가 서명보다 몇 배 큰가. 셀 수 없으면 `null`.
 *
 * 이 조각의 결론 그 자체라 상수로 적어 두지 않는다. 막대의 폭을 정하는 바로 그
 * 바이트 수에서 나오므로, 자료를 바꾸면 그림과 글자가 함께 움직인다 (함정 34).
 */
export function timesLargerOf(scene: SignatureOnHashScene): number | null {
  const base = scene.base;
  if (base === null) return null;
  if (base.documentBytes <= 0 || base.signatureBytes <= 0) return null;
  return Math.round(base.documentBytes / base.signatureBytes);
}

/**
 * 지금 화면이 말할 것.
 *
 * 걸음이 아니라 **자취**에서 나온다 — 정적 그리기가 `step` 을 읽지 않아야 흘려
 * 세운 화면과 곧바로 세운 화면이 같아진다 (S-scene, 공통 지시문 8 절).
 */
export function captionOf(scene: SignatureOnHashScene): SignHashCaption | null {
  const base = scene.base;
  if (base === null) return null;
  if (scene.marked) {
    const times = timesLargerOf(scene);
    return times === null ? null : { kind: 'fixed', bytes: base.signatureBytes, times };
  }
  if (scene.standing >= 3) return { kind: 'signed', bytes: base.digestBytes };
  if (scene.standing >= 2) return { kind: 'hashed', bytes: base.digestBytes };
  if (scene.standing >= 1) return { kind: 'document' };
  return null;
}

export const signatureOnHashScene: ScenePlan<SignatureOnHashScene> = {
  /**
   * 첫 장면은 빈 장면이다. 바탕은 `init` 이 **값을 베껴** 채운다 — 넘겨받은
   * `initialData` 는 algorithm 이 제자리에서 고칠 수 있는 객체라 여기서 쳐다보지
   * 않는다 (S-scene).
   */
  initial(): SignatureOnHashScene {
    return atStart({ base: null });
  },

  reduce(scene: SignatureOnHashScene, event: FacetRuntimeEvent): SignatureOnHashScene {
    switch (event.type) {
      // 바탕이 들어선다. 실려 오는 것을 값으로 베껴 담는다.
      case 'init': {
        const p = (event.payload ?? {}) as Record<string, unknown>;
        return atStart({
          base: {
            hashLabel: str(p.hashLabel),
            signatureLabel: str(p.signatureLabel),
            documentBytes: num(p.documentBytes),
            digestBytes: num(p.digestBytes),
            signatureBytes: num(p.signatureBytes),
          },
        });
      }

      // 문서가 놓인다. 화면을 넘어가는 막대가 "얼마든지 커진다" 를 말한다.
      case 'show-document':
        return { ...scene, standing: 1, step: { kind: 'document' } };

      // 문서가 해시로 접힌다. 마디가 하나 늘고 그 사이에 화살이 선다.
      case 'hash-it':
        return { ...scene, standing: 2, step: { kind: 'hash' } };

      // 해시가 서명이 된다. 같은 운동이되 이번엔 늘어난다.
      case 'sign-it':
        return { ...scene, standing: 3, step: { kind: 'sign' } };

      // 서명 크기가 문서 크기와 무관함을 짚는다. 표식은 머문다.
      case 'compare':
        return { ...scene, marked: true, step: { kind: 'mark' } };

      // 손으로 짚기 시작 — 바탕만 남기고 걸어온 자취를 전부 거둔다.
      case 'rewind':
        return atStart({ base: scene.base });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
