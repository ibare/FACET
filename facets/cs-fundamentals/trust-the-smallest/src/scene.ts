/**
 * TrustTheSmallest 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에 **다섯 자리**로 흩어져 있었고, 그중 넷은 `let` grep 에 걸리지 않는다.
 *
 * - `let scaleMax` — **자의 눈금.** ingest 걸음에서만 자라고 되감기에서만 1 로
 *   돌아갔다. 되짚어 세운 화면은 그 눈금이 앞 걸음의 것이라 참값 점선과 막대 높이가
 *   통째로 틀어질 자리였다. 이제 `scaleMaxOf` 가 **표에서 센다.**
 * - `const results: Array<{ min, inflated } | null>` — **이 조각의 결론.** 어느 키를
 *   물었고 답이 무엇이었으며 부풀었나. `const` 라 `let` grep 을 통과하고, 이름에
 *   상태라는 티도 없다. 칩의 라벨(`→ 8`)과 잉크 색이 전부 여기서 나왔는데
 *   `rewind()` 만 그것을 털었다 — 되짚어 중간 걸음에 가면 앞 주행의 답이 남는다.
 *   이제 `answers` 가 말하고 최솟값은 `minOf` 가 센다.
 * - **표의 값 자체가 `cellTexts[row][col].textContent` 에만 있었다.** `setCellValue`
 *   가 쓰기만 하고 아무 데서도 읽지 않는다. 코드 어디에도 "표" 라는 자료가 없었다 —
 *   화면이 통째로 상태였다. 이제 `table` 이 그것이다.
 * - `paintChip` 의 `state: 'idle' | 'active' | 'query'` 와 `paintCell` 의
 *   `mark: 'none' | 'touched' | 'read'` — **선언만 있고 어디에도 저장되지 않는
 *   타입**이다. "지금 무슨 칸을 짚고 있나" 가 `rect` 의 `stroke` 속성 안에만 있었고
 *   다음 걸음이 `clearCellMarks()` 로 지웠다. 이제 `touch` 와 `probe` 가 말한다.
 * - `let sweepNode` — 결론 띠를 놓았나. 이제 `finished` 다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 이 조각은 수가 여럿 나란히 뜬다 — 줄마다의 칸 값, 그중 최솟값, 참값, 부푼 몫.
 * 그것들이 서로 다른 출처에서 오면 그림이 제 안에서 거짓이 된다. 그래서 **걸음이
 * 실어 오던 수를 전부 버리고 표에서 센다.**
 *
 * - `ingest` 의 `cells[r].value` 와 `count` 를 받지 않는다 — 올린 값은 `table` 이
 *   쥐고, 얼마나 올릴지는 `stream[i].count` 가 이미 정한다.
 * - `probe` 의 `min` 을 받지 않는다 — `minOf` 가 읽은 칸들에서 센다. 자에 가라앉는
 *   막대의 높이도 답 선의 자리도 캡션의 `{min}` 도 그 한 함수에서 나온다.
 * - `probe` 의 `truth` 를 받지 않는다 — 참값은 `stream[i].count` 그 자체다
 *   (`truthOf`). 점선의 높이와 캡션의 `{truth}` 가 한 출처가 된다.
 * - `done` 의 `keys` 를 받지 않는다 — 물어본 키의 수는 `stream.length` 다.
 *
 * 남기는 것은 **칸 자리**(`row`/`col`) 하나뿐이다. 그것은 표의 구조에서 세는 값이
 * 아니라 **해시 함수가 정하는** 값이고, 이 조각의 algorithm 이 실제로 하는 일이다.
 * 장면이 해시를 다시 돌리면 오히려 출처가 둘이 된다.
 *
 * ── 나눠 쓰는 칸을 장면이 센다 — 옮기며 드러난 주장
 *
 * 이 조각의 주장은 "함께 쓰는 칸이 값을 부풀렸다" 인데, **어느 칸이 함께 쓰였나가
 * 옛 화면에 남아 있지 않았다.** `clearCellMarks()` 가 걸음마다 테두리를 지워
 * 부딪힘의 자취가 사라졌고, 표의 값만 보아서는 그것이 한 키의 셈인지 여럿의 셈인지
 * 알 수 없었다. `shares` 가 그것을 세므로 정적 그리기가 나눠 쓰는 칸을 물들인다 —
 * 부푼 몫과 같은 잉크로.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄 번호와 칸 번호라는 **구조**만 담고, 칸 폭도 자의 눈금도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `step` 이 **무엇을 말할지**만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은 이 조각에서
 * `step` 과 캡션의 갈래가 **정확히 1 대 1** 이기 때문이다 — 나란히 두면 같은 것을
 * 두 자리에 적는 꼴이 된다. 참값 그대로인지 부풀었는지의 갈림은 문안의 갈래일 뿐이고
 * `isInflated` 가 표에서 판정한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 표의 한 자리. 해시가 정하는 값이라 걸음이 실어 온다. */
export type TrustCellRef = { row: number; col: number };

/** 들어오는 것 하나. 빈도가 곧 참값이다. */
export type TrustStreamKey = { key: string; count: number };

/** 방금 올린 칸들. 어느 키였나는 `stream` 의 자리 번호로 가리킨다. */
export type TrustTouch = { index: number; cells: readonly TrustCellRef[] };

/**
 * 물어본 것 하나 — 어느 키를 어느 칸들에서 읽었나.
 *
 * **읽은 값을 담지 않는다.** 값은 `table` 이 쥐고 있으므로 `valueAt` 이 꺼낸다.
 * 여기 값을 함께 담으면 표와 갈릴 자리가 생긴다.
 */
export type TrustProbe = { index: number; reads: readonly TrustCellRef[] };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 그림이 필요한 곳은 두 군데인데 둘 다 장면이 이미
 * 말한다. 알갱이는 `touch.index` 의 칩에서 출발하고, 오르기 전의 칸 값은
 * `valueAt - truthOf` 로 셈한다. `prev` 를 들출 일이 없다 (S-scene).
 */
export type TrustStep = { kind: 'ingest' } | { kind: 'probe' } | { kind: 'verdict' };

export type TrustTheSmallestScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 줄 수 = 해시 함수의 수. 1 이상으로 좁혀 둔 것이라 그리는 쪽이 다시 자르지 않는다. */
  depth: number;
  /** 줄마다의 칸 수. 위와 같이 여기서 한 번만 좁힌다. */
  width: number;
  /** 들어오는 것들. 자리 번호가 곧 칩의 자리이고 `count` 가 참값이다. */
  stream: readonly TrustStreamKey[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 표의 값. `table[row][col]`. 자의 눈금도 읽는 값도 여기서 나온다. */
  table: readonly (readonly number[])[];
  /**
   * 칸마다 몇 개의 키가 얹혔나.
   *
   * 둘 이상이면 그 칸은 남의 셈까지 이고 있다 — 부풀림의 원인이고, 표의 값만으로는
   * 알 수 없는 것이라 따로 센다.
   */
  shares: readonly (readonly number[])[];
  /** 방금 올린 칸들. 그 걸음 동안 머무는 표식이다. */
  touch: TrustTouch | null;
  /** 지금 물은 것. 없으면 자 위가 비어 있다. */
  probe: TrustProbe | null;
  /**
   * 물어본 것들, 차례대로. 칩의 라벨이 여기서 나오는 **남는 자취**다.
   *
   * 답을 수로 적어 두지 않고 **읽은 자리만** 적어 둔다 — 값은 `minOf` 가 표에서
   * 다시 센다. 이 조각은 다 세고 나서 묻기 시작하므로 묻는 동안 표가 바뀌지 않고,
   * 그래서 앞서 물은 답을 지금 표로 세어도 같은 수가 나온다. 셈과 물음이 섞이는
   * 조각이라면 이 자리에 그때의 표를 함께 담아야 한다.
   */
  answers: readonly TrustProbe[];
  /** 다 물어봤나. 결론 띠가 칩 줄을 훑는다. */
  finished: boolean;

  step: TrustStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `table` · `shares` · `touch` · `probe` · `answers` · `finished` 는 전부 걸어온
 * 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 다 채워진 표와 앉은 답을 단 채로
 * 서고, 그 위에 algorithm 이 처음부터 다시 올리는 값이 겹친다 (S-scene).
 */
type TrustBase = Pick<TrustTheSmallestScene, 'depth' | 'width' | 'stream'>;

/** 줄 × 칸 크기의 0 판. 표와 나눠 씀이 같은 모양이라 한 함수로 낸다. */
function zeros(depth: number, width: number): number[][] {
  return Array.from({ length: depth }, () => new Array<number>(width).fill(0));
}

/**
 * 아무것도 들어오지 않은 처음 화면. 빈 표와 빈 자만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: TrustBase): TrustTheSmallestScene {
  return {
    depth: base.depth,
    width: base.width,
    stream: base.stream,
    table: zeros(base.depth, base.width),
    shares: zeros(base.depth, base.width),
    touch: null,
    probe: null,
    answers: [],
    finished: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 칸 자리 배열을 좁힌다. 하나라도 모양이 어긋나면 통째로 버린다. */
function readRefs(value: unknown): TrustCellRef[] | null {
  if (!Array.isArray(value)) return null;
  const out: TrustCellRef[] = [];
  for (const raw of value as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const cell = raw as Record<string, unknown>;
    const row = num(cell.row);
    const col = num(cell.col);
    if (row === null || col === null) return null;
    out.push({ row: Math.trunc(row), col: Math.trunc(col) });
  }
  return out;
}

/** 들어오는 것들을 좁힌다. 넘겨받은 배열을 쥐지 않고 새로 낸다 (S-scene). */
function readStream(value: unknown): TrustStreamKey[] {
  if (!Array.isArray(value)) return [];
  const out: TrustStreamKey[] = [];
  for (const raw of value as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const count = num(item.count);
    if (typeof item.key === 'string' && count !== null) out.push({ key: item.key, count });
  }
  return out;
}

/** 1 이상의 정수. 줄 수와 칸 수를 여기 한 자리에서만 좁힌다. */
function positive(v: unknown, fallback: number): number {
  const n = num(v);
  return n === null ? fallback : Math.max(1, Math.trunc(n));
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ─────────────────────────────

/** 그 칸에 지금 적혀 있는 값. 범위를 벗어나면 0. */
export function valueAt(scene: TrustTheSmallestScene, ref: TrustCellRef): number {
  return scene.table[ref.row]?.[ref.col] ?? 0;
}

/** 그 칸에 몇 개의 키가 얹혔나. */
export function sharesAt(scene: TrustTheSmallestScene, row: number, col: number): number {
  return scene.shares[row]?.[col] ?? 0;
}

/** 남의 셈까지 이고 있는 칸인가. 부풀림의 원인이고 표의 값만으로는 모른다. */
export function isShared(scene: TrustTheSmallestScene, row: number, col: number): boolean {
  return sharesAt(scene, row, col) >= 2;
}

/** 그 키가 실제로 들어온 횟수 = 참값. 점선의 높이도 캡션의 참값도 여기서 나온다. */
export function truthOf(scene: TrustTheSmallestScene, index: number): number {
  return scene.stream[index]?.count ?? 0;
}

/**
 * 읽은 값들 가운데 가장 작은 것 — **이 조각의 답**.
 *
 * 답 선이 멎는 자리, 칩의 라벨, 캡션의 `{min}` 이 전부 이 한 함수에서 나온다.
 * 걸음이 실어 오던 `min` 을 버린 자리다.
 */
export function minOf(scene: TrustTheSmallestScene, probe: TrustProbe): number {
  let min: number | null = null;
  for (const ref of probe.reads) {
    const v = valueAt(scene, ref);
    if (min === null || v < min) min = v;
  }
  return min ?? 0;
}

/** 읽은 값들 가운데 가장 큰 것. 답 선이 여기서 출발해 내려앉는다. */
export function maxOf(scene: TrustTheSmallestScene, probe: TrustProbe): number {
  let max = 0;
  for (const ref of probe.reads) {
    const v = valueAt(scene, ref);
    if (v > max) max = v;
  }
  return max;
}

/** 답이 참값보다 부풀었나. 캡션의 갈래와 부푼 띠가 같은 판정을 쓴다. */
export function isInflated(scene: TrustTheSmallestScene, probe: TrustProbe): boolean {
  return minOf(scene, probe) > truthOf(scene, probe.index);
}

/**
 * 자의 꼭대기 — 표에서 본 가장 큰 값.
 *
 * 옛 stage 의 `let scaleMax` 자리다. 그것은 ingest 걸음에서만 자라 되짚은 화면에서
 * 틀어질 값이었고, 여기서는 그 걸음의 표에서 세므로 어느 걸음에서 오든 같다.
 */
export function scaleMaxOf(scene: TrustTheSmallestScene): number {
  let max = 1;
  for (const row of scene.table) {
    for (const v of row) if (v > max) max = v;
  }
  return max;
}

/** 그 키를 이미 물어보았나. 칩의 라벨이 그 답을 단다. */
export function answerFor(scene: TrustTheSmallestScene, index: number): TrustProbe | null {
  for (const probe of scene.answers) if (probe.index === index) return probe;
  return null;
}

export const trustTheSmallestScene: ScenePlan<TrustTheSmallestScene> = {
  /**
   * 첫 장면은 바탕만 세우고 표가 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   * `readStream` 이 새 배열을 낸다.
   */
  initial(initialData: unknown): TrustTheSmallestScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      depth: positive(d.depth, 3),
      width: positive(d.width, 5),
      stream: readStream(d.stream),
    });
  },

  reduce(scene: TrustTheSmallestScene, event: FacetRuntimeEvent): TrustTheSmallestScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 키 하나가 들어와 줄마다 한 칸씩 오른다.
       *
       * 얼마나 오를지는 `stream` 이 정한다 — `count` 를 받지 않는 자리다. 나눠 쓴
       * 횟수도 여기서 함께 센다.
       */
      case 'ingest': {
        const cells = readRefs(p.cells);
        if (typeof p.key !== 'string' || cells === null) return scene;
        const index = scene.stream.findIndex((item) => item.key === p.key);
        // 선언에 없는 키는 칩도 참값도 없다. 조용히 흘린다 (C2).
        if (index < 0) return scene;

        const table = scene.table.map((row) => [...row]);
        const shares = scene.shares.map((row) => [...row]);
        const count = truthOf(scene, index);
        for (const cell of cells) {
          if (table[cell.row]?.[cell.col] === undefined) continue;
          table[cell.row][cell.col] += count;
          shares[cell.row][cell.col] += 1;
        }

        return {
          ...scene,
          table,
          shares,
          touch: { index, cells },
          probe: null,
          step: { kind: 'ingest' },
        };
      }

      /*
       * 키 하나를 묻는다. 같은 자리를 다시 짚어 읽을 뿐이고 **무엇이 가장 작은지는
       * 여기서 셈하지 않는다** — `minOf` 가 표에서 센다.
       */
      case 'probe': {
        const reads = readRefs(p.reads);
        if (typeof p.key !== 'string' || reads === null) return scene;
        const index = scene.stream.findIndex((item) => item.key === p.key);
        if (index < 0) return scene;

        const probe: TrustProbe = { index, reads };
        return {
          ...scene,
          touch: null,
          probe,
          answers: [...scene.answers, probe],
          step: { kind: 'probe' },
        };
      }

      /*
       * 다 물어봤다. 자 위를 거두고 칩 줄만 남긴다 — 다섯이 같은 말을 한다는 것이
       * 결론이므로 물어본 답들은 칩에 그대로 앉아 있다.
       */
      case 'done':
        return { ...scene, touch: null, probe: null, finished: true, step: { kind: 'verdict' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ depth: scene.depth, width: scene.width, stream: scene.stream });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
