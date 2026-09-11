/**
 * trust-the-smallest — Count-Min Sketch 에서 세어 둔 수를 읽는 일.
 *
 * 한 질문에만 답한다: 세 줄에서 읽은 값이 저마다 다를 때 왜 **가장 작은 것**을
 * 믿는가. 칸은 남의 셈까지 함께 이고 있으므로 값은 부풀 수는 있어도 모자랄 수는
 * 없다 — 그래서 셋 중 가장 낮은 것이 참값에 가장 가깝다.
 *
 * ## 자리를 셈하는 법
 *
 * 이중 해싱이다. 줄 r 의 자리는 `(h1 + r·h2) mod width` 이고
 *   h1 = Java `String.hashCode` 를 `& 0x7FFFFFFF` 한 값
 *   h2 = FNV-1a 32bit 를 `& 0x7FFFFFFF` 한 뒤 홀수로 만든(`| 1`) 값
 * 이다.
 *
 * **자리도 표의 값도 여기서 직접 셈한다.** 선언에 박아 두면 데이터를 고칠 때
 * 화면이 조용히 거짓을 말하게 된다 (S-piece "화면에 쓰는 값은 실측한다").
 * 1차 데이터는 키 문자열과 빈도뿐이다.
 *
 * ## 이벤트
 *
 *   Cell = { row: number; col: number; value: number }
 *
 *   ingest  { key: string; count: number; cells: Cell[] }
 *           키 하나가 들어와 줄마다 한 칸씩 올랐다. `cells[r].value` 는 오른 **뒤**의 값.
 *   probe   { key: string; truth: number; min: number; reads: Cell[] }
 *           키 하나를 물었다. `reads[r]` 는 줄 r 에서 읽은 칸, `min` 은 셋 중 가장
 *           작은 값, `truth` 는 실제로 들어온 횟수.
 *   rewind  {}
 *           처음으로 되감았다. 자동 재생이 끝난 뒤 `advance` 를 처음 받았을 때 나간다.
 *   done    { keys: number }
 *           다 물어봤다. `keys` 는 물어본 키의 수.
 *
 * 넷 다 `silent` 가 아니다 — 모두 화면이 바뀌는 걸음이다.
 * 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TrustTheSmallestStreamItem = {
  /** 들어오는 키. */
  key: string;
  /** 그 키가 들어온 횟수 = 참값. */
  count: number;
};

export type TrustTheSmallestData = {
  type: string;
  /** 줄 수 (= 해시 함수의 수). */
  depth: number;
  /** 줄마다의 칸 수. */
  width: number;
  /**
   * 걸음이 끝난 뒤 쉬는 시간. 읽을 틈을 주는 것은 저작 결정이라 선언에 둔다
   * (S-piece). 그림의 애니메이션은 이 위에 더해진다.
   */
  stepMs: number;
  /** 들어오는 것들. 키마다 몇 번인지. */
  stream: TrustTheSmallestStreamItem[];
};

export type TrustTheSmallestCell = { row: number; col: number; value: number };

/** 부호 비트를 떨어내는 자리. */
const INT31 = 0x7fffffff;

/** Java `String.hashCode` — h = 31·h + ch, int32 로 감긴다. */
function javaHashCode(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h;
}

/** FNV-1a 32bit — 바이트마다 xor 한 뒤 곱한다. */
function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = (h ^ text.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 키 하나가 줄마다 짚는 자리.
 *
 * `h1 + r·h2` 는 r 이 2 여도 3·2^31 을 넘지 않아 배정도 안에서 정확하다.
 */
export function trustTheSmallestCellsOf(key: string, depth: number, width: number): number[] {
  const h1 = javaHashCode(key) & INT31;
  const h2 = (fnv1a32(key) & INT31) | 1;
  const out: number[] = [];
  for (let r = 0; r < depth; r += 1) out.push((h1 + r * h2) % width);
  return out;
}

export const trustTheSmallestAlgorithm = async (
  ctx: FacetContext<TrustTheSmallestData>,
): Promise<void> => {
  const rx = ctx as ReactiveContext<TrustTheSmallestData>;
  const { depth, width, stepMs, stream } = ctx.data;

  /** 수동 진행으로 넘어갔는가. 자동 재생이 끝난 뒤 `advance` 를 받으면 참이 된다. */
  let manual = false;
  /** 이번 회차의 첫 문인가. */
  let firstGate = true;

  /**
   * 걸음 사이의 문.
   *
   * **마운트 직후와 되감기 직후의 첫 걸음은 문을 지나지 않는다** (S-piece). 문을
   * 먼저 두면 `stepMs` 만큼 빈 화면이 보인 뒤에야 그림이 서고, 되감기 직후라면
   * 눌러도 반응이 없는 것으로 읽힌다.
   */
  const gate = async (): Promise<boolean> => {
    if (firstGate) {
      firstGate = false;
      return true;
    }
    if (!manual) return rx.sleep(stepMs);
    for (;;) {
      const input = await rx.waitForInput();
      // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 그것까지 걸음으로 세지 않도록.
      if (input.type !== 'advance') continue;
      return true;
    }
  };

  /**
   * 한 회차. 자동 재생과 되감은 뒤의 수동 진행이 같은 길을 지난다 — 두 벌이 되면
   * 언젠가 어긋난다.
   */
  const runScene = async (): Promise<void> => {
    const table: number[][] = Array.from({ length: depth }, () => new Array<number>(width).fill(0));

    // ── 세는 동안. 한 키가 들어오면 줄 각각에서 한 칸씩 올린다.
    for (const item of stream) {
      if (!(await gate())) return;
      const cells: TrustTheSmallestCell[] = trustTheSmallestCellsOf(item.key, depth, width).map(
        (col, row) => {
          table[row][col] += item.count;
          return { row, col, value: table[row][col] };
        },
      );
      await ctx.emit({ type: 'ingest', payload: { key: item.key, count: item.count, cells } });
    }

    // ── 읽는 동안. 같은 자리를 다시 짚어 읽고, 셋 중 가장 작은 것을 답으로 삼는다.
    for (const item of stream) {
      if (!(await gate())) return;
      const reads: TrustTheSmallestCell[] = trustTheSmallestCellsOf(item.key, depth, width).map(
        (col, row) => ({ row, col, value: table[row][col] }),
      );
      const min = reads.reduce((acc, cell) => Math.min(acc, cell.value), Number.POSITIVE_INFINITY);
      await ctx.emit({
        type: 'probe',
        payload: { key: item.key, truth: item.count, min, reads },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: { keys: stream.length } });
  };

  await runScene();

  // 자동 재생이 끝났다. 처음 누르는 `advance` 는 되감고 **첫 걸음까지** 보인다 —
  // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    firstGate = true;
    await ctx.emit({ type: 'rewind', payload: {} });
    await runScene();
  }
};
