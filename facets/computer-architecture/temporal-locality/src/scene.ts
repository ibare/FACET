/**
 * temporalLocality 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **같은 자리를 다시 읽으면 아래층까지 내려갈 일이 없다.** 그러니 완주 화면이
 * 반드시 쥐고 있어야 하는 것은 둘이다 — 접근마다의 **적중·실패 표식**과 아래층까지
 * **내려간 자취**. 두 열의 그것이 나란히 남아야 견줄 짝이 선다. 둘 다 남는
 * 강조이므로 정적 그리기에 들어간다 (S-scene).
 *
 * 다행히 옮기기 전 화면도 그 둘을 지우지는 않았다 — `markToken` 과 `addTrail` 에는
 * 되돌리는 짝이 없었다. 그러나 **어느 칸이 방금 답했는가**는 탐침이 지나가면
 * 사라졌다. 그것을 칸 테두리에 올려 정적 그리기가 세우게 한다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에 `let` 도 조회 분기도 없었고 stage 의 `let` 은 `maxLine` 과
 * `destroyed` 둘뿐이었다. DOM 되읽기도 0 건이다. 숨은 자리는 전부 **타입 선언**과
 * **모듈 스코프 선언**에 있었다.
 *
 * - **`blocks: Map<number, Block>`** — 어느 칸에 어느 라인이 들어앉았나. 이 조각의
 *   캐시 그 자체인데 `Block = { g, rect, text, at }` 에 라인 번호를 두는 자리조차
 *   없어, **`text.textContent` 의 글자 안에만** 있었다. 이제 `resident` 가 말한다.
 * - **`Block.at: Rect`** — 화면의 지금 자리를 따로 적어 둔 **거울**이고, `evict` 와
 *   `nudge` 가 그것을 운동의 출발값으로 삼았다. `getAttribute` 도 `let` 도 아니라
 *   어떤 grep 에도 안 걸린다. 되짚어 세운 직후에는 옛 화면의 것이라 칸이 엉뚱한
 *   자리에서 출발한다. 이제 출발 자리는 장면과 배치에서 셈한다.
 * - **`RowView.trails: SVGLineElement[]`** — 그 열이 아래층까지 내려간 횟수. **이
 *   조각의 결론**인데 `const rows` 안의 배열에 쌓이기만 했다. 이제 `reads` 의
 *   실패들에서 파생된다 — 자취와 캡션의 수가 한 자료에서 나온다.
 * - **`setRowTone(index, tone: 'idle' | 'active')`** — `type` 선언조차 아닌 **함수
 *   인자의 인라인 유니온**. 지금 어느 열을 읽는 중인가가 라벨·테두리·자취의 칠에만
 *   있었다. 이제 `active` 가 말한다.
 * - **`cacheLayer` · `memLayer` 의 `opacity`** — 견줌이 섰나. 레이어 속성 하나에만
 *   있어 재건 밖에서 살아남았다. 이제 `verdict` 가 말한다.
 *
 * 그리고 **발신이 실어 오던 수 여섯이 화면과 다른 출처였다.** `stream-end` 의
 * `hits`·`total` 과 `verdict` 의 `total` 은 projector 가 읽지도 않았고, `misses`
 * 와 `near`·`far` 는 화면의 자취와 아무 관계 없이 algorithm 이 따로 센 수였다.
 * 이제 전부 `reads` 를 훑어 나온다.
 *
 * 좌표는 담지 않는다. 칸 번호·라인 번호·접근의 차례라는 구조만 담고 자리는 그리는
 * 쪽이 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지는 `step`
 * 이 이미 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { temporalLocalityLineOf } from './algorithm.js';

/** 한 번의 접근. 차례가 곧 그 열의 몇 번째 접근인가다. */
export type TemporalLocalityRead = {
  /** 이미 위층에 있었나. */
  hit: boolean;
  /** 맞은 칸, 또는 라인이 새로 올라온 칸. */
  slot: number;
};

/** 칸 하나에 들어앉아 있던 라인. 운동의 출발 그림이 여기서 나온다. */
export type TemporalLocalityHeld = { slot: number; line: number };

/**
 * 방금 밟은 걸음.
 *
 * 무엇을 흐르게 할지 고르는 데 쓰고, 캡션이 무엇을 말할지도 여기서 나온다.
 * 캡션을 따로 담지 않는 까닭이 그것이다 — 같은 물음에 답이 둘이 되지 않는다.
 *
 * `begin` 의 `dropped` 와 `verdict` 의 `cleared` 는 **떨어져 나가는 라인의 출발
 * 그림**이다. 그것을 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로
 * 장면이 계기값으로 말한다 (S-scene).
 *
 * `read` 의 `evicted` 도 같다 — 밀려난 라인은 새 장면에 이미 없으므로, 떨어지는
 * 그림을 그리려면 장면이 그것을 말해야 한다.
 */
export type TemporalLocalitySceneStep =
  | { kind: 'begin'; dropped: TemporalLocalityHeld[] }
  | { kind: 'read'; evicted: number | null }
  | { kind: 'end' }
  | { kind: 'verdict'; cleared: TemporalLocalityHeld[] };

export type TemporalLocalityScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 캐시의 칸 수. */
  slots: number;
  /** 라인 한 줄의 바이트 수. */
  lineBytes: number;
  /** 원소 하나의 바이트 수. */
  elemBytes: number;
  /** 접근열마다의 배열 색인. */
  streams: number[][];

  // ── 걸음이 고치는 것.
  /**
   * 지금까지 깨운 접근열의 수. 몇 번째 열인가를 발신에서 받지 않고 여기서 센다 —
   * 열은 깨울 때마다 하나씩 쌓이므로 이 수가 곧 그 열의 번호다.
   */
  begun: number;
  /** 지금 읽고 있는 열. 아직 시작 전이거나 그 열이 끝났으면 `null`. */
  active: number | null;
  /** 열마다 지금까지의 접근. 차례가 곧 그 열의 몇 번째 접근인가다. */
  reads: TemporalLocalityRead[][];
  /** 칸에 들어앉은 라인. 칸 수만큼이고 `null` 은 빈 칸이다. */
  resident: (number | null)[];
  /** 두 열을 견주었나. 섰으면 두 층이 물러나고 자취가 굵어진다. */
  verdict: boolean;
  /** 방금 밟은 걸음. */
  step: TemporalLocalitySceneStep | null;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`begun` · `active` · `reads` · `resident` · `verdict` · `step`)
 * 은 들지 않는다 — 그대로 넘기면 되감아도 걸어온 자취가 남는다. 호출부는 **객체
 * 리터럴**로 넘겨야 초과 속성 검사가 돌아 이 좁히기가 실제로 막는다.
 */
type TemporalLocalityBase = Pick<
  TemporalLocalityScene,
  'slots' | 'lineBytes' | 'elemBytes' | 'streams'
>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: TemporalLocalityBase): TemporalLocalityScene {
  return {
    slots: base.slots,
    lineBytes: base.lineBytes,
    elemBytes: base.elemBytes,
    streams: base.streams,
    begun: 0,
    active: null,
    reads: base.streams.map(() => []),
    resident: Array.from({ length: base.slots }, () => null),
    verdict: false,
    step: null,
  };
}

/** unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 칸에 들어앉아 있는 것들을 계기값으로 뽑는다. */
function heldOf(resident: (number | null)[]): TemporalLocalityHeld[] {
  const out: TemporalLocalityHeld[] = [];
  for (let slot = 0; slot < resident.length; slot += 1) {
    const line = resident[slot];
    if (typeof line === 'number') out.push({ slot, line });
  }
  return out;
}

export const temporalLocalityScene: ScenePlan<TemporalLocalityScene> = {
  /**
   * 첫 장면은 빈 캐시다. 아직 아무 열도 깨우지 않았다.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 색인 배열까지 새로 만들어 담는다.
   */
  initial(initialData: unknown): TemporalLocalityScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const streams: number[][] = [];
    if (Array.isArray(d.streams)) {
      for (const raw of d.streams) {
        if (typeof raw !== 'object' || raw === null) continue;
        const indices = (raw as Record<string, unknown>).indices;
        if (!Array.isArray(indices)) continue;
        streams.push(indices.filter((n): n is number => typeof n === 'number'));
      }
    }
    return atStart({
      slots: Math.max(1, Math.floor(num(d.slots, 2))),
      lineBytes: Math.max(1, num(d.lineBytes, 16)),
      elemBytes: Math.max(1, num(d.elemBytes, 4)),
      streams,
    });
  },

  reduce(scene: TemporalLocalityScene, event: FacetRuntimeEvent): TemporalLocalityScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 열 하나가 깨어나고 캐시가 비워진다. 몇 번째 열인지는 여기서 센다.
      case 'stream-begin': {
        if (scene.begun >= scene.streams.length) return scene;
        return {
          ...scene,
          begun: scene.begun + 1,
          active: scene.begun,
          resident: scene.resident.map(() => null),
          step: { kind: 'begin', dropped: heldOf(scene.resident) },
        };
      }

      // 한 번의 접근. 어느 색인을 읽는지는 바탕과 지금까지의 접근 수가 정한다.
      case 'access': {
        const stream = scene.active;
        if (stream === null) return scene;
        const hit = p.hit === true;
        const raw = Math.floor(num(p.slot, 0));
        const slot = Math.max(0, Math.min(scene.slots - 1, raw));

        const at = scene.reads[stream]?.length ?? 0;
        const index = scene.streams[stream]?.[at] ?? 0;
        const line = temporalLocalityLineOf(index, scene.elemBytes, scene.lineBytes);

        // 맞았으면 그 칸은 이미 이 라인이다. 빗나갔을 때만 자리가 갈린다.
        const evicted = hit ? null : (scene.resident[slot] ?? null);
        return {
          ...scene,
          reads: scene.reads.map((r, i) => (i === stream ? [...r, { hit, slot }] : r)),
          resident: hit ? scene.resident : scene.resident.map((l, i) => (i === slot ? line : l)),
          step: { kind: 'read', evicted },
        };
      }

      // 열 하나가 끝난다. 적중·실패의 수는 `reads` 를 훑으면 나온다.
      case 'stream-end': {
        if (scene.active === null) return scene;
        return { ...scene, active: null, step: { kind: 'end' } };
      }

      // 두 열을 견준다. 칸은 비고 두 층이 물러나며 자취만 남는다.
      case 'verdict':
        return {
          ...scene,
          active: null,
          verdict: true,
          resident: scene.resident.map(() => null),
          step: { kind: 'verdict', cleared: heldOf(scene.resident) },
        };

      case 'rewind':
        return atStart({
          slots: scene.slots,
          lineBytes: scene.lineBytes,
          elemBytes: scene.elemBytes,
          streams: scene.streams,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
