/**
 * IndexAndTag 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 아무것도 쥐지 않았고 (`let` 0 건 · 조회 분기 0 건), 옛 stage 에
 * 여섯이 흩어져 있었다.
 *
 * - `Chip = { g, rect, label, glyphs, bits, w, x, y, … }` — **DOM 손잡이와 값과
 *   지금 좌표가 한 객체.** `dispatch` 가 `from: { x: indexChip.x, y: indexChip.y }`
 *   로 **화면의 거울을 운동의 출발값**으로 삼았다. 되짚어 `pieces-dispatched` 만
 *   세우면 칩 셋이 옛 화면의 자리에서 출발한다. `chip.bits` 에는 **앞 주소의
 *   태그 비트열**이 남아 있었다.
 * - `let dockedLine: number | null` — 태그 칩이 앉아 있는 줄. **다음 주소가 올
 *   때에야** `absorbDocked()` 가 그것을 줄의 것으로 굳혔다. 화면의 한 사실이
 *   한 걸음 늦게 확정되는 자리다.
 * - `let markedTick: SVGRectElement | null` — 어느 바이트 눈금이 짚혔나.
 * - `Row = { field, stored, ticks }` — **어느 줄이 어느 태그를 들고 있나**가
 *   `stored` 의 자식 글자와 `opacity` 속성에만 있었다. 이 조각의 결론이다.
 * - `finish()` 의 `row.stored.getAttribute('opacity') !== '1'` — 그 결론을
 *   **화면에서 도로 읽어** 어느 줄을 울릴지 골랐다 (④ 자리).
 * - `type Scene = { lineSize, lineCount, indexWidth, tagWidth }` — stage 가 폭을
 *   **제 나름으로 다시 셈했다.** 같은 잣대가 algorithm 에도 있어 두 출처였다.
 *
 * 여기서는 그 여섯이 `held` · `passed` · `current` · `phase` 넷으로 올라오고,
 * 폭은 `indexAndTagFields` 하나가 낸다.
 *
 * ── 한 줄을 여럿이 거쳐 간 것이 완주 화면에 남는다
 *
 * 이 조각의 결론은 "서로 다른 곳이 한 줄을 함께 쓴다. 가르는 것은 태그다" 이다.
 * 그런데 옛 화면은 쫓겨나는 태그를 580ms 동안 떨궈 보이고 **지웠다.** 다 끝난
 * 화면에는 한 번도 다툰 적 없는 줄과 세 주인이 거쳐 간 줄의 구별이 없었다 —
 * 되짚기 이전에 이미 주장이 안 보였다 (프로토콜 4 절).
 *
 * 그래서 `passed` 를 둔다. 거쳐 간 태그가 줄마다 쌓이고 정적 그리기가 그것을
 * 세우므로, 완주 화면에서 줄 0 만 두 앞주인을 달고 있다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 폭 · 줄 높이 · 칩이 앉는 자리는 캔버스에서 역산하는
 * 값이라 그리는 쪽의 몫이다 (S-piece). **비트열도 담지 않는다** — 값과 폭이
 * 정하는 표기라 그리는 쪽이 만든다. 문안도 담지 않는다. 무엇을 말할지는
 * `phase` 와 `current` 가 이미 가르므로 캡션 필드를 따로 두지 않고, 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 *
 * `step` 필드도 두지 않는다. 걸음마다 국면이 정확히 하나씩 나아가므로 "방금 무슨
 * 걸음을 밟았나" 가 `phase` 와 같은 말이 된다. 그래서 그리는 쪽은 `prev` 를 아예
 * 들추지 않는다 (S-scene).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { indexAndTagFields, type IndexAndTagFields } from './algorithm.js';

/**
 * 갈린 주소 하나. **셋이 함께 남는다** — 이 조각의 주장이 "하나가 셋으로 갈려
 * 각자 다른 일을 한다" 이므로 어느 토막도 화면에서 먼저 사라지지 않는다.
 */
export type AddressSplit = {
  /** 통째의 주소. 캡션과 띠 표식이 쓴다. */
  addr: number;
  tag: number;
  line: number;
  offset: number;
  /**
   * 이 태그가 앉으며 밀어낸 앞 태그. 아직 안 앉았거나 밀어낼 것이 없으면 `null`.
   *
   * **`reduce` 가 `held` 에서 셈한다** — 발신이 실어 오지 않는다. 어느 줄이
   * 무엇을 들고 있었나는 장면이 쌓아 온 것이라 장면이 셀 수 있다.
   */
  evicted: number | null;
};

/**
 * 지금 주소가 어디까지 왔나.
 *
 *   arrived  한 몸으로 떠올랐다. 아직 끊기지 않았다.
 *   split    끊긴 자리가 벌어졌다. 셋이 제 색을 입는다.
 *   placed   셋이 제 자리로 갔다 — 줄 · 태그 칸 · 바이트 눈금.
 *   done     다 끝났다. 줄에 남은 증언들을 한 번 울린다.
 */
export type IndexAndTagPhase = 'arrived' | 'split' | 'placed' | 'done';

export type IndexAndTagScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 줄 수와 세 토막의 폭. algorithm 과 **같은 함수**가 낸다. */
  fields: IndexAndTagFields;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 지금 화면에 있는 주소. `null` 이면 아직 아무것도 오지 않았다. */
  current: AddressSplit | null;
  /** 지금 국면. `null` 이면 처음과 되감은 뒤다. */
  phase: IndexAndTagPhase | null;
  /** 줄마다 지금 들고 있는 태그. 비어 있으면 `null`. */
  held: (number | null)[];
  /**
   * 줄마다 그 줄을 거쳐 간 앞 태그들 (밀려난 차례대로).
   *
   * **이 조각의 결론이 여기 쌓인다.** 한 줄에 둘 이상이 쌓였다는 것이 곧 "서로
   * 다른 곳이 한 줄을 함께 썼다" 이다.
   */
  passed: number[][];
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `held` · `passed` · `current` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 태그를 앉힌 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 앉히는 것이 겹친다 (S-scene · 프로토콜 4 절).
 */
type Base = Pick<IndexAndTagScene, 'fields'>;

/**
 * 되돌린 뒤의 장면 — 캐시 상자가 비어 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): IndexAndTagScene {
  const n = base.fields.lineCount;
  return {
    fields: base.fields,
    current: null,
    phase: null,
    held: Array.from({ length: n }, () => null),
    passed: Array.from({ length: n }, () => []),
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const indexAndTagScene: ScenePlan<IndexAndTagScene> = {
  /**
   * 첫 장면은 무엇을 그릴지만 알고 아직 아무것도 그리지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   * `indexAndTagFields` 가 원시값만 꺼내 새 객체를 내므로 넘겨받은 자료를
   * 참조로 쥐지 않는다 (S-scene MUST).
   */
  initial(initialData: unknown): IndexAndTagScene {
    return atStart({ fields: indexAndTagFields(initialData) });
  },

  reduce(scene: IndexAndTagScene, event: FacetRuntimeEvent): IndexAndTagScene {
    const p = (typeof event.payload === 'object' && event.payload !== null
      ? event.payload
      : {}) as Record<string, unknown>;

    switch (event.type) {
      case 'address-arrives': {
        // 가르는 셈은 조각의 알고리즘 그 자체라 발신이 싣는다 (프로토콜 4 절).
        const line = clamp(num(p.line), 0, scene.fields.lineCount - 1);
        const offset = clamp(num(p.offset), 0, scene.fields.lineSize - 1);
        return {
          ...scene,
          current: { addr: num(p.addr), tag: num(p.tag), line, offset, evicted: null },
          phase: 'arrived',
        };
      }

      case 'address-splits':
        return scene.current === null ? scene : { ...scene, phase: 'split' };

      case 'pieces-dispatched': {
        const c = scene.current;
        if (c === null) return scene;
        // 밀려나는 앞 태그를 **여기서 센다.** 발신이 실어 오면 같은 물음에 답이
        // 둘이 되고, 되짚어 세운 뒤 둘이 갈린다 (프로토콜 4 절).
        const before = scene.held[c.line] ?? null;
        const evicted = before !== null && before !== c.tag ? before : null;
        const held = [...scene.held];
        held[c.line] = c.tag;
        const passed =
          evicted === null
            ? scene.passed
            : scene.passed.map((v, i) => (i === c.line ? [...v, evicted] : v));
        return { ...scene, current: { ...c, evicted }, phase: 'placed', held, passed };
      }

      case 'done':
        return { ...scene, phase: 'done' };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ fields: scene.fields });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
