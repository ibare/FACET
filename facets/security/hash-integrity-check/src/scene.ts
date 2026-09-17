/**
 * HashIntegrityCheck 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 원본에서 두 선이 갈라져 받는 쪽으로 간다. 위는 파일이 오는 아무 경로, 아래는
 * 해시가 오는 믿는 경로다. 그 아래에 대조 장부가 쌓인다.
 *
 * **머무는 것**은 다섯이다.
 *
 *   - 두 경로가 갈라졌나 (`split`) — 한 번 갈라지면 끝까지 그대로다.
 *   - 받는 쪽에 서 있는 파일이 성한 것이냐 손댄 것이냐 (`file`).
 *   - 해시가 와 있나 (`hashArrived`) — 온 뒤로는 아무도 건드리지 못한다.
 *   - 오는 길에 손댄 적이 있나 (`tampered`) — 가위 자국은 남는다.
 *   - 지금까지 내린 대조 판정 (`verdicts`) — **쌓인다.** 옛 stage 는 손대는 걸음에서
 *     앞 판정을 지워, 다 끝난 화면에 "성했을 때는 맞았다" 가 남아 있지 않았다.
 *     견줄 짝을 잃으면 "어긋났다" 가 어긋남으로 읽히지 않는다 (프로토콜 4 절).
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은
 * 그것을 보고 무엇을 흐르게 할지 고른다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 맞았나 어긋났나 (`✓` / `✗`) | **장면이 센다** — 받은 것의 해시와 내걸린 해시를 견준다 |
 * | 두 내용이 처음 갈라지는 자리 (`firstDiffIndex`) | algorithm 이 내주고 장면이 부른다 |
 * | 바탕 자료 (내걸린 해시 · 성한 것 · 손댄 것) | `init` 이 **값을 베껴** 싣는다 |
 *
 * 맞았나 어긋났나는 옛 발신이 색과 표식으로 못박아 보내던 것이다. 지금은 장부의
 * 두 줄이 **그림에 뜬 것과 같은 해시**를 견주어 스스로 정한다 — 조각의 결론이
 * 그림과 같은 자료를 쓰는 자리다 (프로토콜 4 절).
 *
 * `firstDiffIndex` 는 바탕 두 문자열만 있으면 나오는 순수 함수라 내준다. 떼어 내도
 * 이 조각이 말하려는 바 — 한 글자가 달라지면 해시가 통째로 갈린다 — 는 그대로
 * 남는다. 갈리는 해시 그 자체는 실측값이라 애초에 셈하지 않는다.
 *
 * 좌표는 담지 않는다. 경로의 높이도 토큰의 자리도 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 한다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { firstDiffIndex } from './algorithm.js';

/** 받은 것 하나 — 내용과 그 해시. */
export type IntegrityItem = { content: string; hash: string };

/** 어느 쪽이 받는 쪽에 서 있나. 성한 것이냐 손댄 것이냐. */
export type IntegritySide = 'intact' | 'tampered';

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `init` 이 값을 베껴 채운다. 러너가 주는 객체를 참조로 쥐면 되짚을 때 이미 다
 * 굴러간 자료로 바탕을 그린다 (S-scene).
 */
export type IntegrityBase = {
  /** 화면에 인쇄할 해시 함수 이름. 장부 두 줄이 무엇의 해시인지 말한다. */
  algorithmLabel: string;
  /** 원본이 믿는 경로로 함께 내건 해시. */
  referenceHash: string;
  /** 손대지 않은 채 도착한 것. */
  intact: IntegrityItem;
  /** 한 글자가 바뀐 채 도착한 것. */
  tampered: IntegrityItem;
  /**
   * 두 내용이 처음으로 갈라지는 자리. 같으면 -1.
   *
   * algorithm 이 내준 순수 함수로 셈한다 — 발신에 싣지 않는다 (프로토콜 4 절).
   */
  diffIndex: number;
};

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type IntegrityStep =
  | { kind: 'split' }
  | { kind: 'deliver' }
  | { kind: 'tamper' }
  | { kind: 'detect' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type IntegrityCaption =
  | { kind: 'split' }
  | { kind: 'match' }
  | { kind: 'tampered' }
  | { kind: 'detected' };

export type IntegrityScene = {
  /** 바탕. `init` 이 오기 전에는 `null` 이라 두 끝점만 서 있다. */
  base: IntegrityBase | null;
  /** 두 경로가 갈라졌나. */
  split: boolean;
  /** 받는 쪽에 서 있는 파일. 아직 아무것도 안 왔으면 `null`. */
  file: IntegritySide | null;
  /** 해시가 건너와 있나. */
  hashArrived: boolean;
  /** 오는 길에 손댄 적이 있나. 가위 자국은 머문다. */
  tampered: boolean;
  /**
   * 내린 대조 판정이 온 차례대로. 맞았나 어긋났나는 담지 않는다 — 장부를 그리는
   * 쪽이 그 편의 해시와 내걸린 해시를 견주어 정한다.
   */
  verdicts: IntegritySide[];
  step: IntegrityStep | null;
  caption: IntegrityCaption | null;
};

/**
 * 아무것도 건너오지 않은 처음 화면.
 *
 * 호출부는 반드시 객체 리터럴을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (프로토콜 4 절).
 */
function atStart(base: Pick<IntegrityScene, 'base'>): IntegrityScene {
  return {
    base: base.base,
    split: false,
    file: null,
    hashArrived: false,
    tampered: false,
    verdicts: [],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function item(v: unknown): IntegrityItem {
  const i = (v ?? {}) as { content?: unknown; hash?: unknown };
  return { content: str(i.content), hash: str(i.hash) };
}

export const hashIntegrityCheckScene: ScenePlan<IntegrityScene> = {
  /**
   * 첫 장면은 빈 장면이다. 바탕은 `init` 이 **값을 베껴** 채운다 — 러너가 주는
   * 객체를 여기서 쥐면 되짚기가 이미 굴러간 자료를 그린다 (S-scene).
   */
  initial(): IntegrityScene {
    return atStart({ base: null });
  },

  reduce(scene: IntegrityScene, event: FacetRuntimeEvent): IntegrityScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 바탕이 선다. 실려 오는 것을 값으로 베껴 담는다.
      case 'init': {
        const intact = item(p.intact);
        const tampered = item(p.tampered);
        return atStart({
          base: {
            algorithmLabel: str(p.algorithmLabel),
            referenceHash: str(p.referenceHash),
            intact,
            tampered,
            diffIndex: firstDiffIndex(intact.content, tampered.content),
          },
        });
      }

      // 원본에서 두 경로가 갈라진다. 갈라짐 자체가 이 조각의 전제다.
      case 'split-paths':
        return { ...scene, split: true, step: { kind: 'split' }, caption: { kind: 'split' } };

      // 둘 다 건너와 만난다. 장부에 첫 줄이 선다.
      case 'deliver':
        return {
          ...scene,
          file: 'intact',
          hashArrived: true,
          verdicts: [...scene.verdicts, 'intact'],
          step: { kind: 'deliver' },
          caption: { kind: 'match' },
        };

      // 파일만 다시 오는데 도중에 손댄다. 아래 해시 경로는 아무 일도 없다.
      // 앞 판정을 지우지 않는다 — 성했을 때 맞았다는 사실이 견줄 짝이다.
      case 'tamper':
        return {
          ...scene,
          file: 'tampered',
          tampered: true,
          step: { kind: 'tamper' },
          caption: { kind: 'tampered' },
        };

      // 대조가 어긋난다. 장부의 둘째 줄이 첫 줄 아래 나란히 선다.
      case 'detect':
        return {
          ...scene,
          verdicts: [...scene.verdicts, 'tampered'],
          step: { kind: 'detect' },
          caption: { kind: 'detected' },
        };

      // 손으로 짚기 시작 — 바탕만 남기고 건너온 자취를 전부 거둔다.
      case 'rewind':
        return atStart({ base: scene.base });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
