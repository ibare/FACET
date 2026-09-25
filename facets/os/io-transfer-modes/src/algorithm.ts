/**
 * 입출력 방식 — 폴링 · 인터럽트 · DMA 가 같은 낱말들을 받는 동안 CPU 가 잃은 틱.
 *
 * 손잡이 둘(낱말 수 `words` · 낱말 하나에 드는 틱 `deviceTicks`)로 한 판을 정하고, 세 방식이 한 걸음에
 * 함께 나아간다. 잃은 틱 = CPU 가 제 일 대신 입출력에 쓴 틱.
 *
 * - 폴링     = 낱말 × d — 낱말마다 준비될 때까지 틱마다 묻고, 준비된 틱의 묻기가 그 낱말을 가져온다
 * - 인터럽트 = 낱말 × 처리기 — 낱말마다 부름 하나. 기다리는 동안은 제 일을 한다
 * - DMA      = 준비 + 처리기 — 준비(제어기에 적기)와 끝 부름 한 번. 옮기는 동안 CPU 는 제 일을 한다
 *
 * 가장 적게 잃는 방식이 둘 이상이면 모두 싣는다 (winners). 잃은 틱은 정수라 동률은 정수 비교로 가린다.
 * 이 사다리(1 · 2 · 4 · 8 × 1 · 2 · 4 · 8, 처리기 3 · 준비 2)에서 동률 칸은 0 이다 — 테스트가 센다.
 *
 * ## 이벤트 (전부 silent 아님 — 하나가 한 걸음)
 *
 * - `round`  판 시작 (걸음 0). 세 띠 0.
 *   payload `{ words: number; deviceTicks: number; handlerTicks: number; setupTicks: number; wordLadder: number[]; tickLadder: number[];
 *             modes: string[];                       // 줄 차례 = 식별자 'polling' | 'interrupt' | 'dma'
 *             plane: { words: number; deviceTicks: number; lost: Lost; winners: string[] }[];  // 낱말 사다리 먼저, 틱 사다리 다음
 *             target: Lost;                          // 이 판 끝에 이를 잃은 틱
 *             lost: Lost }`                          // 지금 잃은 틱 (0)
 * - `setup`  DMA 준비 (걸음 1). payload `{ add: Lost; lost: Lost }`
 * - `word`   낱말 하나 (걸음 2..W+1). payload `{ index: number; words: number; add: Lost; lost: Lost }` — index 는 1 부터
 * - `finish` DMA 끝 부름 (걸음 W+2). payload `{ add: Lost; lost: Lost; winners: string[] }`
 *
 * `Lost` = `{ polling: number; interrupt: number; dma: number }`.
 *
 * ## phase
 *
 * 없다 — IR 을 두지 않는다 (`irs.ts` 의 까닭 주석). 코드 패널도 없다.
 *
 * ## 계기 (C5)
 *
 * `polling-lost` · `interrupt-lost` · `dma-lost` — 각 줄이 지금까지 잃은 틱. 판 시작에 0 으로 되돌리고
 * 걸음마다 차이만 보낸다. 회차 끝 값 = 그 판의 세 수.
 *
 * ## 입력
 *
 * `{ type: 'words' | 'deviceTicks', payload: { value: number, words?: string, deviceTicks?: string } }`.
 * 값은 사다리 소속을 확인하고, 사다리 밖이면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ModeId = 'polling' | 'interrupt' | 'dma';

export const MODE_IDS: readonly ModeId[] = ['polling', 'interrupt', 'dma'];

export type Lost = { polling: number; interrupt: number; dma: number };

export type PlaneCell = { words: number; deviceTicks: number; lost: Lost; winners: ModeId[] };

export type IoTransferModesData = {
  type: 'io-transfer-modes';
  stepMs: number;
  /** 인터럽트 한 번의 처리기 길이 (틱) */
  handlerTicks: number;
  /** DMA 준비 — CPU 가 제어기에 적는 틱 */
  setupTicks: number;
  /** 줄 차례 — 세 방식 식별자 */
  modes: string[];
  wordLadder: number[];
  tickLadder: number[];
  /** 첫 판의 손잡이 값 */
  words: number;
  deviceTicks: number;
};

function positiveInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`${what} 는 양의 정수여야 한다: ${String(v)}`);
  return v;
}

function ladderOf(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${what} 사다리가 비었다`);
  return v.map((x, i) => positiveInt(x, `${what}[${i}]`));
}

/** 데이터 모양을 확인한다 — 모르는 모양이면 던진다 (C6). */
export function checkData(data: IoTransferModesData): void {
  positiveInt(data.stepMs, 'stepMs');
  positiveInt(data.handlerTicks, 'handlerTicks');
  positiveInt(data.setupTicks, 'setupTicks');
  const modes = data.modes;
  if (!Array.isArray(modes) || modes.length !== MODE_IDS.length || modes.some((m, i) => m !== MODE_IDS[i])) {
    throw new Error(`modes 는 ${MODE_IDS.join(', ')} 이어야 한다: ${String(modes)}`);
  }
  const wl = ladderOf(data.wordLadder, 'wordLadder');
  const tl = ladderOf(data.tickLadder, 'tickLadder');
  if (!wl.includes(data.words)) throw new Error(`첫 판 낱말 수 ${String(data.words)} 가 사다리 밖이다`);
  if (!tl.includes(data.deviceTicks)) throw new Error(`첫 판 틱 ${String(data.deviceTicks)} 가 사다리 밖이다`);
}

/** 세 방식이 한 판에 잃는 틱. */
export function lostTicks(words: number, deviceTicks: number, handlerTicks: number, setupTicks: number): Lost {
  return {
    polling: words * deviceTicks,
    interrupt: words * handlerTicks,
    dma: setupTicks + handlerTicks,
  };
}

/** 가장 적게 잃는 방식 — 동률이면 모두 (줄 차례대로). 정수 비교. */
export function winnersOf(lost: Lost): ModeId[] {
  const least = Math.min(lost.polling, lost.interrupt, lost.dma);
  return MODE_IDS.filter((m) => lost[m] === least);
}

/** 평면 16 칸 — 낱말 사다리 먼저, 틱 사다리 다음. */
export function planeOf(data: IoTransferModesData): PlaneCell[] {
  const cells: PlaneCell[] = [];
  for (const w of data.wordLadder) {
    for (const d of data.tickLadder) {
      const lost = lostTicks(w, d, data.handlerTicks, data.setupTicks);
      cells.push({ words: w, deviceTicks: d, lost, winners: winnersOf(lost) });
    }
  }
  return cells;
}

function ladderValue(v: unknown, ladder: number[], what: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n) || !ladder.includes(n)) throw new Error(`${what} 값 ${String(v)} 가 사다리 밖이다`);
  return n;
}

type MetricName = 'polling-lost' | 'interrupt-lost' | 'dma-lost';

export async function ioTransferModesAlgorithm(base: FacetContext<IoTransferModesData>): Promise<void> {
  const ctx = base as ReactiveContext<IoTransferModesData>;
  const data = ctx.data;
  checkData(data);
  const plane = planeOf(data);

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number): void => {
    const before = shown.get(name);
    if (before === value) return;
    ctx.metric(name, value - (before ?? 0));
    shown.set(name, value);
  };
  const showLost = (lost: Lost): void => {
    setMetric('polling-lost', lost.polling);
    setMetric('interrupt-lost', lost.interrupt);
    setMetric('dma-lost', lost.dma);
  };

  /** 한 판을 끝까지. 취소되면 false. */
  const playRound = async (words: number, deviceTicks: number): Promise<boolean> => {
    const target = lostTicks(words, deviceTicks, data.handlerTicks, data.setupTicks);
    const lost: Lost = { polling: 0, interrupt: 0, dma: 0 };
    showLost(lost);
    await ctx.emit({
      type: 'round',
      payload: {
        words,
        deviceTicks,
        handlerTicks: data.handlerTicks,
        setupTicks: data.setupTicks,
        wordLadder: [...data.wordLadder],
        tickLadder: [...data.tickLadder],
        modes: [...MODE_IDS],
        plane: plane.map((c) => ({ ...c, lost: { ...c.lost }, winners: [...c.winners] })),
        target: { ...target },
        lost: { ...lost },
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 1 — DMA 준비: CPU 가 제어기에 적는다
    const setupAdd: Lost = { polling: 0, interrupt: 0, dma: data.setupTicks };
    lost.dma += setupAdd.dma;
    showLost(lost);
    await ctx.emit({ type: 'setup', payload: { add: setupAdd, lost: { ...lost } } });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 2..W+1 — 낱말 하나씩
    for (let i = 1; i <= words; i += 1) {
      if (ctx.cancelled) return false;
      const add: Lost = { polling: deviceTicks, interrupt: data.handlerTicks, dma: 0 };
      lost.polling += add.polling;
      lost.interrupt += add.interrupt;
      showLost(lost);
      await ctx.emit({ type: 'word', payload: { index: i, words, add, lost: { ...lost } } });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    // 걸음 W+2 — DMA 끝 부름: 처리기 한 번
    const finishAdd: Lost = { polling: 0, interrupt: 0, dma: data.handlerTicks };
    lost.dma += finishAdd.dma;
    if (lost.polling !== target.polling || lost.interrupt !== target.interrupt || lost.dma !== target.dma) {
      throw new Error('걸음으로 쌓은 잃은 틱이 판의 셈과 다르다');
    }
    showLost(lost);
    await ctx.emit({ type: 'finish', payload: { add: finishAdd, lost: { ...lost }, winners: winnersOf(lost) } });
    return true;
  };

  let words = data.words;
  let deviceTicks = data.deviceTicks;
  try {
    while (!ctx.cancelled) {
      if (!(await playRound(words, deviceTicks))) return;
      // 판이 끝났다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      let accepted = false;
      while (!accepted) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'words' && input.type !== 'deviceTicks') continue;
        const p = (typeof input.payload === 'object' && input.payload !== null ? input.payload : {}) as Record<string, unknown>;
        if (typeof p.value !== 'number') throw new Error(`손잡이 ${input.type} 의 value 가 수가 아니다`);
        if (input.type === 'words') {
          words = ladderValue(p.value, data.wordLadder, 'words');
          if (p.deviceTicks !== undefined) deviceTicks = ladderValue(p.deviceTicks, data.tickLadder, 'deviceTicks');
        } else {
          deviceTicks = ladderValue(p.value, data.tickLadder, 'deviceTicks');
          if (p.words !== undefined) words = ladderValue(p.words, data.wordLadder, 'words');
        }
        accepted = true;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
