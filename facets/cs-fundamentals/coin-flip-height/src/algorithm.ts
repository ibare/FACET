/**
 * coin-flip-height — 층의 높이를 무엇이 정하는가 (조각).
 *
 * 값마다 동전을 던진다. 앞이 나오면 한 층 더 쌓고, 뒤가 나오면 거기서 멈춘다.
 * 아무도 모양을 관리하지 않는데 층마다 노드가 절반쯤 남는다 — 균형 트리가
 * 회전으로 하던 일을 무작위가 대신한다.
 *
 * ── 1차 데이터
 * 동전 결과(`flips`)가 1차다. **높이와 층별 노드 수는 여기서 셈한다** — 선언에
 * 적어 두고 읽어 오면 그것은 셈이 아니라 베끼기다.
 *
 * ── 식별자
 *   index:<i>   i 번째 값의 기둥
 *
 * ── 이벤트 (넷 다 화면이 바뀌므로 silent 없음)
 *   stack         { index: number; value: number; flips: ('H'|'T')[];
 *                   heads: number; height: number }
 *                 heads 는 층으로 이어진 앞면 수 (= height - 1). 상한에 걸려
 *                 쓰이지 못한 앞면은 세지 않는다.
 *   level-counts  { counts: number[] }   층 0..꼭대기의 노드 수
 *   done          {}
 *   rewind        {}                     되감아 처음부터 다시 짚는다
 *
 * ── 메트릭 없음. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type CoinFace = 'H' | 'T';

export type CoinFlipHeightData = {
  type: 'coin-flip-height';
  /** 오름차순 값. */
  values: number[];
  /** 값마다 실제로 던진 동전 결과. 앞(H)이 이어지는 동안 층이 오른다. */
  flips: CoinFace[][];
  /** 층의 상한. 앞이 계속 나와도 여기서 멈춘다. */
  maxLevels: number;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 한 값이 차지하는 기둥. */
type Row = { index: number; value: number; flips: CoinFace[]; height: number };

const DEFAULT_STEP_MS = 600;
const DEFAULT_MAX_LEVELS = 4;

/** 앞면이 이어지는 동안 한 층씩 올린다. 뒷면이 나오면 거기서 멈춘다. */
function heightOf(flips: readonly CoinFace[], maxLevels: number): number {
  let height = 1;
  for (const face of flips) {
    if (face !== 'H' || height >= maxLevels) break;
    height += 1;
  }
  return height;
}

/** 층 L 에 놓이는 것은 높이가 L 보다 큰 값이다. */
function levelCounts(rows: readonly Row[]): number[] {
  let top = 1;
  for (const row of rows) if (row.height > top) top = row.height;
  const counts: number[] = [];
  for (let level = 0; level < top; level += 1) {
    let n = 0;
    for (const row of rows) if (row.height > level) n += 1;
    counts.push(n);
  }
  return counts;
}

function readRows(data: CoinFlipHeightData): Row[] {
  const values = Array.isArray(data.values) ? data.values : [];
  const flips = Array.isArray(data.flips) ? data.flips : [];
  const maxLevels =
    typeof data.maxLevels === 'number' && data.maxLevels >= 1
      ? data.maxLevels
      : DEFAULT_MAX_LEVELS;

  return values.map((value, index) => {
    const raw: unknown = flips[index];
    const faces: CoinFace[] = Array.isArray(raw)
      ? (raw as unknown[]).filter((f): f is CoinFace => f === 'H' || f === 'T')
      : [];
    return { index, value, flips: faces, height: heightOf(faces, maxLevels) };
  });
}

export async function coinFlipHeight(ctx: FacetContext<CoinFlipHeightData>): Promise<void> {
  const rc = ctx as ReactiveContext<CoinFlipHeightData>;
  const rows = readRows(rc.data);
  if (rows.length === 0) return;

  const counts = levelCounts(rows);
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : DEFAULT_STEP_MS;

  /** 걸음 사이의 문. 열리면 true, 취소됐으면 false. */
  type Gate = () => Promise<boolean>;

  const sleepGate: Gate = () => rc.sleep(stepMs);

  const advanceGate: Gate = async () => {
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await rc.waitForInput();
      } catch {
        return false; // 되돌리기 / 접기로 취소됐다
      }
      if (rc.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게.
      if (input.type !== 'advance') continue;
      return true;
    }
  };

  /**
   * 한 판을 처음부터 끝까지 발신한다.
   *
   * **첫 걸음은 문을 지나지 않는다.** 문은 걸음 *사이*의 것이라 첫 걸음 앞에는
   * 기다릴 앞걸음이 없다. 문을 먼저 두면 stepMs 만큼 빈 화면이 보인 뒤에야
   * 그림이 선다 (S-piece).
   */
  const play = async (gate: Gate): Promise<boolean> => {
    for (const row of rows) {
      if (row.index > 0 && !(await gate())) return false;
      await rc.emit({
        type: 'stack',
        target: `index:${row.index}`,
        payload: {
          index: row.index,
          value: row.value,
          flips: row.flips,
          heads: row.height - 1,
          height: row.height,
        },
      });
      if (rc.cancelled) return false;
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'level-counts', payload: { counts } });
    if (rc.cancelled) return false;

    if (!(await gate())) return false;
    await rc.emit({ type: 'done', payload: {} });
    return !rc.cancelled;
  };

  if (!(await play(sleepGate))) return;

  /*
   * 자동 재생이 끝났다. 이제부터는 누를 때마다 한 걸음씩 간다.
   *
   * 처음 누르는 advance 는 **되감고 첫 걸음까지** 간다 — 되감기만 하고 멈추면
   * 눌러도 반응이 없는 것으로 읽힌다. `play` 의 첫 걸음이 문 밖에 있으므로
   * 되감기 바로 뒤에 첫 기둥이 선다 (S-piece).
   */
  for (;;) {
    if (!(await advanceGate())) return;
    await rc.emit({ type: 'rewind', payload: {} });
    if (rc.cancelled) return;
    if (!(await play(advanceGate))) return;
  }
}
