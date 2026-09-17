/**
 * BadCharSkip 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 텍스트는 한 줄의 띠로 깔려 움직이지 않고, 패턴이 그 아래를 **띄엄띄엄 옮겨
 * 선다**. 어긋난 글자는 표의 칸으로 날아오르고, 그 칸이 가진 수만큼 패턴이 민다.
 *
 * 그러니 **머무는 것**은 셋이다.
 *
 *   - 짚어 본 자리들 (`probes`) — 패턴이 실제로 선 자리와 거기서 몇 글자가
 *     맞았나. 차례가 곧 몇 번째로 밟았나다.
 *   - 민 것들 (`jumps`)         — 어디서 어디로 뛰었나. 호(arc)가 **쌓여 남아서**
 *     건너뛴 칸이 아예 짚히지 않았다는 것을 보인다.
 *   - 패턴이 선 자리 (`stand`)  — 지금 어디에 서 있나.
 *
 * `probes` 와 `jumps` 를 자취로 쥐는 것이 이 이행이 화면을 고친 자리다. 옛
 * 화면은 걸음마다 앞 걸음의 칠과 호를 지워, 다 끝난 화면에 **얼마나 아꼈나가
 * 남지 않았다** — 이 조각이 자랑하는 것이 바로 그것인데도 그랬다.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은
 * 그것을 보고 무엇을 흐르게 할지 고른다.
 *
 * ── 걸음이 싣는 것은 판정 둘뿐이다
 *
 * `matched`(오른쪽부터 몇 글자가 맞았나)와 `shift`(이만큼 민다)만 온다. 선 자리는
 * 민 거리를 쌓은 것이고, 어긋난 글자는 텍스트에서 읽으면 되고, 그 글자가 패턴
 * 안에서 마지막으로 선 자리는 표가 말한다. 표는 바탕에 순수 함수를 먹여 얻으므로
 * `algorithm.ts` 의 `badCharSlots` 를 여기서 부른다 (프로토콜 4 절의 B 갈래 —
 * 장면이 projector 자리를 잇는 것이라 원칙 1 의 허용 방향이다).
 *
 * 좌표는 담지 않는다. 자리 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

import { badCharSlots, lastStandOf, type BadCharSlot } from './algorithm.js';

export type { BadCharSlot } from './algorithm.js';

/**
 * 패턴이 한 번 선 자리와 거기서 견준 결과.
 *
 * `matched` 가 패턴 길이와 같으면 통째로 맞은 것이고, 그보다 작으면
 * `at + 패턴길이 − 1 − matched` 자리에서 어긋난 것이다. 어느 칸을 짚어 보았는지도
 * 이 둘에서 나온다 — 그리는 쪽이 셈한다.
 */
export type Probe = { at: number; matched: number };

/** 한 번의 밀기. 호의 양 끝이자, 그 사이가 통째로 안 짚힌 자리다. */
export type Jump = { from: number; to: number };

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type BadCharStep = { kind: 'scan' } | { kind: 'skip' } | { kind: 'found' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type BadCharCaption =
  | { kind: 'allMatch'; n: number }
  | { kind: 'missAtEnd'; ch: string }
  | { kind: 'missAfter'; n: number; ch: string }
  | { kind: 'skipKnown'; ch: string; last: number; n: number }
  | { kind: 'skipNone'; ch: string; n: number }
  | { kind: 'found'; at: number };

export type BadCharSkipScene = {
  /** 훑을 텍스트와 찾을 패턴. 걸음이 고치지 않는다. */
  base: { text: string; pattern: string };
  /** 나쁜 문자 표. 패턴에서 나오는 값이라 바탕과 함께 다시 셈해진다. */
  slots: BadCharSlot[];
  /** 짚어 본 자리들. 쌓이는 자취라 되짚어도 남는다. */
  probes: Probe[];
  /** 민 것들. 쌓이는 자취라 되짚어도 남는다. */
  jumps: Jump[];
  /** 패턴이 지금 서 있는 자리. 밀고 나면 아직 짚지 않은 자리에 선다. */
  stand: number;
  /** 답을 만났나. 자리는 `probes` 의 마지막이 말한다. */
  found: boolean;
  step: BadCharStep | null;
  caption: BadCharCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `slots` 를 넣지 않는다 — 패턴에서 다시 셈해야 같은 물음에 답이 하나로 남는다.
 * `probes` · `jumps` · `stand` 는 걸어온 자취라 더더욱 아니다 (프로토콜 4 절).
 */
type BadCharBase = Pick<BadCharSkipScene, 'base'>;

/**
 * 아무것도 짚지 않은 처음 화면. 표와 텍스트 띠가 깔리고 패턴은 왼쪽 끝에 선다.
 *
 * 호출부는 반드시 객체 리터럴을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다.
 */
function atStart(base: BadCharBase): BadCharSkipScene {
  return {
    base: base.base,
    slots: badCharSlots(base.base.pattern),
    probes: [],
    jumps: [],
    stand: 0,
    found: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 그 자리에서 어긋난 텍스트 칸. 전부 맞았으면 null. */
export function mismatchAt(scene: BadCharSkipScene, probe: Probe): number | null {
  const m = scene.base.pattern.length;
  if (probe.matched >= m) return null;
  return probe.at + m - 1 - probe.matched;
}

export const badCharSkipScene: ScenePlan<BadCharSkipScene> = {
  /**
   * 첫 장면은 텍스트와 패턴만 안다.
   *
   * 넘겨받은 객체를 쥐지 않고 **글자 둘을 복사해** 온다. 참조를 쥐면 되짚을 때
   * 이미 다 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): BadCharSkipScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ base: { text: str(d.text), pattern: str(d.pattern) } });
  },

  reduce(scene: BadCharSkipScene, event: FacetRuntimeEvent): BadCharSkipScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const { text, pattern } = scene.base;

    switch (event.type) {
      case 'scan': {
        const m = pattern.length;
        if (m === 0) return scene;
        const matched = Math.max(0, Math.min(m, num(p.matched)));
        const probe: Probe = { at: scene.stand, matched };
        const next: BadCharSkipScene = {
          ...scene,
          probes: [...scene.probes, probe],
          step: { kind: 'scan' },
          caption: null,
        };
        if (matched >= m) return { ...next, caption: { kind: 'allMatch', n: matched } };
        const miss = mismatchAt(next, probe);
        const ch = miss === null ? '' : (text[miss] ?? '');
        return {
          ...next,
          caption:
            matched === 0 ? { kind: 'missAtEnd', ch } : { kind: 'missAfter', n: matched, ch },
        };
      }

      case 'skip': {
        const probe = scene.probes[scene.probes.length - 1];
        // 짚어 보지 않은 자리에서는 밀 까닭이 없다. 조용히 흘린다 (C2).
        if (!probe) return scene;
        const shift = Math.max(1, Math.round(num(p.shift, 1)));
        const from = scene.stand;
        const to = from + shift;
        const miss = mismatchAt(scene, probe);
        const ch = miss === null ? '' : (text[miss] ?? '');
        const last = lastStandOf(scene.slots, ch);
        return {
          ...scene,
          jumps: [...scene.jumps, { from, to }],
          stand: to,
          step: { kind: 'skip' },
          caption:
            last >= 0
              ? { kind: 'skipKnown', ch, last, n: shift }
              : { kind: 'skipNone', ch, n: shift },
        };
      }

      case 'found': {
        const probe = scene.probes[scene.probes.length - 1];
        if (!probe) return scene;
        return {
          ...scene,
          found: true,
          step: { kind: 'found' },
          caption: { kind: 'found', at: probe.at },
        };
      }

      // 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 거둔다.
      case 'rewind':
        return atStart({ base: scene.base });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
