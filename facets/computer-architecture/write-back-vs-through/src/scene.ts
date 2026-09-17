/**
 * writeBackVsThrough 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에 고치는 차례가 칩으로 늘어서고, 그 아래 두 lane 이 **나란히** 선다. 왼쪽이
 * write-through, 오른쪽이 write-back 이다. 두 lane 은 서로 다른 자리에 있어
 * 한쪽이 다른 쪽을 갈아 끼우지 않는다 — 견줄 짝이 끝까지 한 화면에 남는다.
 *
 * 각 lane 은 위에 캐시 칸, 아래에 메모리 띠를 갖는다. 고침 하나가 점 하나로
 * 떨어지는데, 왼쪽에서는 점이 줄을 스치고 곧장 아래로 내려가 **상자 하나**가 되고,
 * 오른쪽에서는 점이 줄 위에 앉아 쌓였다가 그 줄이 쫓겨날 때 상자 하나에 함께
 * 실려 내려간다. **아래 띠의 상자 수가 곧 메모리에 쓴 횟수**다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 하나도 없었다 (①③ 0 건). 숨은 자리는 전부
 * stage 의 **모듈 스코프 선언**에 있었다 (⑤).
 *
 * - **`const stacked = [0, 0]`** — 아래층으로 내려간 상자의 수. **이 조각의 결론**
 *   그 자체인데 `const` 라 `let` grep 을 통과했고, 알맹이는 `stacked[lane] = k + 1`
 *   로 제자리에서 자랐다. 게다가 다음 상자가 앉을 자리(`tokenX(lane, k)`)를 그
 *   수에서 냈으니 **화면의 거울**이기도 했다 — 되짚어 세운 직후에는 옛 화면의
 *   것이라 상자가 엉뚱한 자리에서 출발한다. 이제 `back` 배열의 길이와
 *   `throughLoads(scene).length` 가 그것을 말한다.
 * - **`countText[lane].textContent`** — 화면에 뜨는 그 수는 상자를 센 것이 아니라
 *   payload 의 `throughTotal` · `backTotal` 이었다. **같은 물음에 답이 둘**이고,
 *   화면의 상자와 다른 출처였다. 이제 둘 다 같은 배열을 센다.
 * - **`const dotsOf: SVGCircleElement[][][]`** — 그 칸에 쌓인 고침 표시 수가
 *   **DOM 손잡이 배열의 길이에만** 있었다. write-back 의 알맹이가 거기 있었다.
 *   이제 `cells[slot].marks` 가 말한다.
 * - **`const tagOf: (SVGGElement | null)[][]`** — 어느 칸에 어느 줄이 앉았나.
 *   DOM 손잡이와 뜻이 한 배열에 묶여 있었다. 이제 `cells[slot].line` 이다.
 * - **`barRect[lane]` 의 `stroke-width` 1 ↔ 1.6 과 `countText` 의 `fill`** —
 *   "셈이 매듭지어졌다" 가 재건 밖 요소의 속성에만 있었고 `rewind` 가 손으로
 *   되돌리고 있었다. 이제 `settled` 가 말하고 정적 그리기가 매번 세운다.
 *
 * ── 화면이 아직 말하지 않던 것 (함정 11)
 *
 * **모아 두는 동안 아래층이 낡아 있다**는 것이 write-back 의 대가인데, 옛 화면은
 * 그것을 말하지 않았다. 캐시의 점은 "표시가 쌓였다" 만 말할 뿐 "그래서 메모리의
 * 그 줄이 아직 옛 값이다" 는 어디에도 없었다. 그래서 `flush` 의 "공짜는 없다" 도
 * 갚을 빚이 보이지 않는 채로 나왔다.
 *
 * 이제 `pendingLoads` 가 그 빚을 낸다 — 표시가 쌓인 칸마다 메모리 띠에 **테두리만
 * 있는 빈 상자**가 하나씩 선다. 어휘를 가른다: **채움 있음 = 이미 내려갔다**,
 * **테두리만 = 아직 내려가지 않았다**. write-through 쪽에는 그 빈 상자가 한
 * 번도 서지 않고, `flush` 가 오른쪽의 빈 상자를 채운 상자로 바꾼다.
 *
 * 좌표는 담지 않는다. 줄 번호 · 칸 번호 · 표시 수만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고
 * 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 캐시 칸 하나. 비어 있으면 `null`.
 *
 * `marks` 는 **write-back 쪽에 쌓인 고침 표시 수**다. 두 정책이 같은 칸 배치를
 * 굴리므로(적중도 축출도 같다) 칸 자체는 한 벌이면 되고, 갈리는 것은 표시가
 * 쌓이느냐뿐이라 그 수를 여기 둔다. write-through lane 은 이 수를 그리지 않는다.
 */
export type WriteBackCell = { line: number; marks: number } | null;

/** 아래층으로 내려간 짐 하나. `marks` 는 그 한 번에 실려 간 고침 수다. */
export type WriteBackLoad = { line: number; marks: number };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 운동의 출발 그림에 필요한 계기값은 여기가 싣는다 — `flush` 의 `from` 이 그
 * 예다. 그것을 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type WriteBackSceneStep =
  /** 고침 하나. `loaded` 면 새 줄이 칸에 앉았고, `evicted` 면 앞 줄이 쫓겨났다. */
  | { kind: 'write'; slot: number; loaded: boolean; evicted: boolean }
  /** 끝에 남은 고쳐진 줄들. `from` 이 각 짐이 출발한 칸 번호다. */
  | { kind: 'flush'; from: number[] }
  /** 셈이 매듭지어진다. 두 계기가 굳는다. */
  | { kind: 'settle' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). 수는 장면이 센다. */
export type WriteBackSceneCaption =
  | { kind: 'start' }
  | { kind: 'again' }
  | { kind: 'load' }
  | { kind: 'evict' }
  | { kind: 'flush' }
  | { kind: 'done' };

export type WriteBackVsThroughScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 캐시 칸 수. */
  slotCount: number;
  /** 라인 한 줄의 크기(바이트). 화면에는 `2 × 16 B` 표식으로만 나온다. */
  lineBytes: number;
  /** 고치는 줄의 차례. 선언에서 값으로 베껴 온다. */
  writes: number[];
  /**
   * 서로 다른 줄의 수 — 줄마다 다른 색을 주려고 센다.
   *
   * **바탕 전체에서 한 번에** 센다. 지금까지 드러난 수로 정하면 줄이 하나 더
   * 드러날 때 이미 칠한 줄의 색이 통째로 갈린다.
   */
  lineCount: number;

  // ── 걸음이 고치는 것.
  /**
   * 지금까지 치른 고침 수. 차례표에서 몇 번째까지 왔나이기도 하다.
   *
   * write-through 가 내려보낸 상자는 이것에서 통째로 파생된다 — 고칠 때마다
   * 한 번이라는 것이 그 정책의 정의이기 때문이다 (`throughLoads`).
   */
  done: number;
  /** 캐시 칸의 형편. 두 lane 이 같은 칸 배치를 굴리므로 한 벌이다. */
  cells: WriteBackCell[];
  /** write-back 이 지금까지 내려보낸 짐. 내려간 차례대로. */
  back: WriteBackLoad[];
  /** 셈이 매듭지어졌나. */
  settled: boolean;
  step: WriteBackSceneStep | null;
  caption: WriteBackSceneCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`done` · `cells` · `back` · `settled` · `step` ·
 * `caption`)은 들지 않는다 — 그대로 넘기면 되감아도 걸어온 자취가 남는다.
 * 호출부는 **객체 리터럴**로 넘겨야 초과 속성 검사가 돌아 이 좁히기가 실제로
 * 막는다.
 */
type WriteBackBase = Pick<
  WriteBackVsThroughScene,
  'slotCount' | 'lineBytes' | 'writes' | 'lineCount'
>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: WriteBackBase): WriteBackVsThroughScene {
  return {
    slotCount: base.slotCount,
    lineBytes: base.lineBytes,
    writes: base.writes,
    lineCount: base.lineCount,
    done: 0,
    cells: Array.from({ length: base.slotCount }, () => null),
    back: [],
    settled: false,
    step: null,
    caption: null,
  };
}

/**
 * write-through 가 지금까지 내려보낸 짐.
 *
 * "고칠 때마다 곧장 한 번" 이 그 정책의 정의이므로 고침 차례에서 통째로 나온다 —
 * 장면에 따로 쌓지 않는다. 옛 발신이 싣던 `throughTotal` 이 하던 말이고, 이제
 * 화면의 상자와 계기의 수가 이 한 배열을 함께 센다.
 */
export function throughLoads(scene: WriteBackVsThroughScene): WriteBackLoad[] {
  return scene.writes.slice(0, scene.done).map((line) => ({ line, marks: 1 }));
}

/**
 * 아직 아래층으로 내려가지 않은 짐 — write-back 이 진 빚.
 *
 * 표시가 쌓인 칸마다 하나. 메모리가 그만큼 낡아 있다는 뜻이고, 그것이 write-back
 * 이 치르는 대가다. `flush` 가 이것을 상자로 바꾼다.
 */
export function pendingLoads(scene: WriteBackVsThroughScene): WriteBackLoad[] {
  const out: WriteBackLoad[] = [];
  for (const cell of scene.cells) {
    if (cell !== null && cell.marks > 0) out.push({ line: cell.line, marks: cell.marks });
  }
  return out;
}

/** 아래층으로 내려간 짐의 자리가 몇 칸까지 필요한가. 두 lane 이 같은 폭을 쓴다. */
export function loadCapacity(scene: WriteBackVsThroughScene): number {
  return Math.max(1, scene.writes.length);
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function lines(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) out.push(Math.max(0, Math.trunc(item)));
  }
  return out;
}

function count(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  return n >= 1 ? n : fallback;
}

function slotIndex(value: unknown, slotCount: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const i = Math.trunc(value);
  return i >= 0 && i < slotCount ? i : null;
}

export const writeBackVsThroughScene: ScenePlan<WriteBackVsThroughScene> = {
  /**
   * 첫 장면은 빈 캐시와 빈 메모리 띠다.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 고침 차례는 값으로 베껴 둔다.
   */
  initial(initialData: unknown): WriteBackVsThroughScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const writes = lines(d.writes);
    const lineBytes =
      typeof d.lineBytes === 'number' && d.lineBytes > 0 ? Math.trunc(d.lineBytes) : 0;
    return atStart({
      slotCount: count(d.slotCount, 2),
      lineBytes,
      writes,
      lineCount: writes.reduce((acc, line) => Math.max(acc, line + 1), 1),
    });
  },

  reduce(
    scene: WriteBackVsThroughScene,
    event: FacetRuntimeEvent,
  ): WriteBackVsThroughScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /**
       * 고침 하나.
       *
       * 실려 오는 것은 **어느 칸이 이 고침을 받나** 하나뿐이다. 자리가 모자랄 때
       * 누가 나가는가는 걸음이 내리는 판정이라 싣고 (LRU 순서를 장면이 또 쥐면
       * 같은 규칙이 두 곳에 적힌다), 나머지 — 어느 줄인가 · 적중인가 · 무엇이
       * 쫓겨나나 · 표시가 몇인가 · 몇 번 내려갔나 — 는 전부 여기서 파생된다.
       */
      case 'line-write': {
        const slot = slotIndex(p.slot, scene.cells.length);
        if (slot === null || scene.done >= scene.writes.length) return scene;

        const line = scene.writes[scene.done];
        const cell = scene.cells[slot];
        const hit = cell !== null && cell.line === line;

        const cells = [...scene.cells];
        let back = scene.back;
        let evicted = false;

        if (hit && cell !== null) {
          // 같은 줄을 또 고쳤다. 표시가 하나 는다 — write-back 은 이것만 하고 만다.
          cells[slot] = { line, marks: cell.marks + 1 };
        } else {
          if (cell !== null && cell.marks > 0) {
            // 쫓겨나는 줄이 쌓아 둔 표시를 한 상자에 싣고 내려간다.
            back = [...back, { line: cell.line, marks: cell.marks }];
            evicted = true;
          }
          cells[slot] = { line, marks: 1 };
        }

        return {
          ...scene,
          done: scene.done + 1,
          cells,
          back,
          step: { kind: 'write', slot, loaded: !hit, evicted },
          caption:
            scene.done === 0
              ? { kind: 'start' }
              : hit
                ? { kind: 'again' }
                : evicted
                  ? { kind: 'evict' }
                  : { kind: 'load' },
        };
      }

      /**
       * 끝에 남은 고쳐진 줄들. 줄은 캐시에 그대로 있고 표시만 걷힌다.
       *
       * 무엇이 남았나는 장면이 이미 안다 — `pendingLoads` 가 그것이다. 발신은
       * "이제 갚는다" 는 국면만 말한다.
       */
      case 'flush': {
        const pending = pendingLoads(scene);
        const from: number[] = [];
        scene.cells.forEach((cell, slot) => {
          if (cell !== null && cell.marks > 0) from.push(slot);
        });
        return {
          ...scene,
          cells: scene.cells.map((cell) => (cell === null ? null : { line: cell.line, marks: 0 })),
          back: [...scene.back, ...pending],
          step: { kind: 'flush', from },
          caption: { kind: 'flush' },
        };
      }

      // 셈이 매듭지어진다. 수는 장면이 세므로 실어 올 것이 없다.
      case 'done':
        return { ...scene, settled: true, step: { kind: 'settle' }, caption: { kind: 'done' } };

      case 'rewind':
        return atStart({
          slotCount: scene.slotCount,
          lineBytes: scene.lineBytes,
          writes: scene.writes,
          lineCount: scene.lineCount,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
