/**
 * map-filter-reduce — 세 단계가 각자 한 가지만 바꾼다.
 *
 * `marks` 가 filter(x > 문턱) → map(x * x) → reduce(시작값, acc + x) 를 차례로 지난다. filter 는 **개수**를
 * (값은 그대로, 차례도 원래 차례), map 은 **값**을 (개수 그대로, 같은 자리로), reduce 는 **모양**을 (목록 → 수 하나)
 * 바꾼다. 누적은 앞에서부터 접는다.
 *
 * ── 판의 짜임 (reactive) ───────────────────────────────────────────────
 *   한 판을 끝까지 재생 → `waitForInput` → 받은 문턱으로 다시 재생. 첫 판은 `initialData.threshold`.
 *   걸음 수 = 시작 1 + 원소 len(marks) + map k + fold k + 답 1 (k = filter 를 지난 수).
 *
 * ── 이벤트 (silent 가 아닌 것은 뒤에 걸음 경계 `sleep` 이 온다) ─────────────
 *   round-start  { threshold: number, start: number, marks: number[], maxResult: number }
 *                판의 시작. 원소 여섯이 출발 자리로 돌아온다. maxResult 는 사다리 전체에서 가장 큰 답
 *                (답 막대의 눈금을 판마다 바꾸지 않으려고 알고리즘이 셈해 준다)
 *   filter-keep  { index: number, x: number, threshold: number, slot: number, revived: boolean }
 *                marks[index] 가 문을 지나 kept 의 slot 자리에 선다. revived = 앞 판에선 떨어졌다
 *   filter-drop  { index: number, x: number, threshold: number, dropSlot: number, lost: boolean }
 *                marks[index] 가 문 앞에서 떨어진다. dropSlot = 이 판에서 몇 번째로 떨어졌는가 (0 부터).
 *                lost = 앞 판에선 문을 지났다
 *   map-step     { index: number, slot: number, x: number, y: number }
 *                kept[slot] (= marks[index]) 가 map 문을 지나 y = x * x 로 바뀌어 squares[slot] 에 선다
 *   fold-step    { index: number, slot: number, acc: number, y: number, next: number }
 *                squares[slot] 이 누적으로 접혀 든다 — acc + y = next
 *   answer       { sum: number, count: number }
 *   phase        { phase: string }  silent — 코드 패널 줄
 *
 * ── phase 어휘 (irs.ts 와 정확히 같다) ───────────────────────────────────
 *   test    filter 의 견줌 (떨어지는 원소의 걸음에서 켜진다)
 *   keep    filter 가 남긴다 (`test` 다음 곧바로 — 남는 원소의 걸음에서 켜진다)
 *   map     map 의 한 바퀴
 *   fold    reduce 의 한 바퀴
 *   answer  답을 돌려준다
 *   시작 걸음에는 phase 가 없다 (projector 가 clearHighlight)
 *
 * ── 계기 (그 판 하나의 값 — 판이 바뀌면 0 으로 되돌린다) ─────────────────────
 *   filter-kept    filter 를 지난 수
 *   map-out        map 이 낸 수 (늘 filter-kept 와 같다)
 *   reduce-result  누적값 — 판 끝에 답
 *
 * ── 동률 · 경계 ─────────────────────────────────────────────────────────
 *   견줌은 `x > 문턱` (엄격). 문턱과 같은 원소는 떨어진다 — 이 데이터에서는 문턱 6 과 원소 6, 문턱 8 과
 *   원소 8 이 걸린다. 모두 정수라 실수 동률은 없다.
 *
 * ── 던지는 자리 (C6) ────────────────────────────────────────────────────
 *   marks · thresholds · start 가 정수가 아님, 사다리에 없는 문턱, 32 비트를 넘는 중간값,
 *   버퍼(kept · squares)가 marks 보다 짧음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface MapFilterReduceData {
  type: 'map-filter-reduce';
  stepMs: number;
  marks: number[];
  thresholds: number[];
  start: number;
  threshold: number;
  [key: string]: unknown;
}

const INT32_MAX = 2147483647;

/** 한 판의 셈 — 화면과 IR 이 같은 답을 내는지 대조하는 자리이기도 하다. */
export interface PipelineResult {
  kept: number[];
  keptIndex: number[];
  dropped: number[];
  squares: number[];
  sum: number;
  /** 누적의 차례 — acc 들 (시작값 포함, 길이 k + 1) */
  accs: number[];
}

function assertInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`map-filter-reduce: ${what} 가 정수가 아니다 (${String(v)})`);
  if (Math.abs(v) > INT32_MAX) throw new Error(`map-filter-reduce: ${what} 가 32 비트를 넘는다 (${v})`);
  return v;
}

/** 자료를 읽고 확인한다. 모르는 모양은 던진다. */
export function readData(data: MapFilterReduceData): { marks: number[]; thresholds: number[]; start: number; threshold: number; stepMs: number } {
  if (!Array.isArray(data.marks) || data.marks.length === 0) throw new Error('map-filter-reduce: marks 가 비었거나 목록이 아니다');
  if (!Array.isArray(data.thresholds) || data.thresholds.length === 0) throw new Error('map-filter-reduce: thresholds 가 비었거나 목록이 아니다');
  const marks = data.marks.map((m, i) => assertInt(m, `marks[${i}]`));
  const thresholds = data.thresholds.map((m, i) => assertInt(m, `thresholds[${i}]`));
  const start = assertInt(data.start, 'start');
  const threshold = assertInt(data.threshold, 'threshold');
  if (!thresholds.includes(threshold)) throw new Error(`map-filter-reduce: 첫 문턱 ${threshold} 가 사다리 [${thresholds.join(', ')}] 에 없다`);
  const stepMs = typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : 600;
  return { marks, thresholds, start, threshold, stepMs };
}

/**
 * 버퍼를 받아 쓰는 셈 — IR 의 `pipeline` 과 같은 꼴. 버퍼는 부르는 쪽이 marks 길이로 만든다.
 */
export function pipeline(marks: number[], kept: number[], squares: number[], threshold: number, start: number): PipelineResult {
  if (kept.length < marks.length || squares.length < marks.length) {
    throw new Error(`map-filter-reduce: 버퍼가 marks(${marks.length}) 보다 짧다 (kept ${kept.length} · squares ${squares.length})`);
  }
  const keptIndex: number[] = [];
  const dropped: number[] = [];
  let n = 0;
  for (let i = 0; i < marks.length; i++) {
    if (marks[i]! > threshold) {
      kept[n] = marks[i]!;
      keptIndex.push(i);
      n = n + 1;
    } else {
      dropped.push(marks[i]!);
    }
  }
  for (let i = 0; i < n; i++) {
    const y = kept[i]! * kept[i]!;
    if (y > INT32_MAX) throw new Error(`map-filter-reduce: ${kept[i]} * ${kept[i]} 가 32 비트를 넘는다`);
    squares[i] = y;
  }
  const accs = [start];
  let acc = start;
  for (let i = 0; i < n; i++) {
    acc = acc + squares[i]!;
    if (Math.abs(acc) > INT32_MAX) throw new Error('map-filter-reduce: 누적이 32 비트를 넘는다');
    accs.push(acc);
  }
  return { kept: kept.slice(0, n), keptIndex, dropped, squares: squares.slice(0, n), sum: acc, accs };
}

export async function mapFilterReduceAlgorithm(ctx: FacetContext<MapFilterReduceData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MapFilterReduceData>;
  const { marks, thresholds, start, stepMs } = readData(ctx.data);
  let threshold = readData(ctx.data).threshold;

  // 사다리 전체에서 가장 큰 답 — 답 막대의 눈금
  let maxResult = 0;
  for (const th of thresholds) {
    const r = pipeline(marks, new Array<number>(marks.length).fill(0), new Array<number>(marks.length).fill(0), th, start);
    maxResult = Math.max(maxResult, Math.abs(r.sum));
  }

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rctx.sleep(stepMs);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  // 앞 판에서 문을 지났는가 — 첫 판에는 없다
  let prevKept: boolean[] | null = null;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const kept = new Array<number>(marks.length).fill(0);
      const squares = new Array<number>(marks.length).fill(0);
      const r = pipeline(marks, kept, squares, threshold, start);

      setMetric('filter-kept', 0);
      setMetric('map-out', 0);
      setMetric('reduce-result', start);

      // 1. 시작
      await ctx.emit({ type: 'round-start', payload: { threshold, start, marks: [...marks], maxResult } });
      if (!(await pause())) return;

      // 2. filter — 원소마다 문에 선다
      const passed: boolean[] = marks.map(() => false);
      let slot = 0;
      let dropSlot = 0;
      for (let i = 0; i < marks.length; i++) {
        if (ctx.cancelled) return;
        const x = marks[i]!;
        await phase('test');
        if (x > threshold) {
          await phase('keep');
          passed[i] = true;
          const revived = prevKept !== null && prevKept[i] === false;
          await ctx.emit({ type: 'filter-keep', payload: { index: i, x, threshold, slot, revived } });
          slot = slot + 1;
          setMetric('filter-kept', slot);
        } else {
          const lost = prevKept !== null && prevKept[i] === true;
          await ctx.emit({ type: 'filter-drop', payload: { index: i, x, threshold, dropSlot, lost } });
          dropSlot = dropSlot + 1;
        }
        if (!(await pause())) return;
      }

      // 3. map — kept 의 원소마다 같은 자리로
      for (let k = 0; k < r.kept.length; k++) {
        if (ctx.cancelled) return;
        await phase('map');
        await ctx.emit({ type: 'map-step', payload: { index: r.keptIndex[k]!, slot: k, x: r.kept[k]!, y: r.squares[k]! } });
        setMetric('map-out', k + 1);
        if (!(await pause())) return;
      }

      // 4. reduce — 앞에서부터 누적으로 접는다
      for (let k = 0; k < r.squares.length; k++) {
        if (ctx.cancelled) return;
        await phase('fold');
        await ctx.emit({
          type: 'fold-step',
          payload: { index: r.keptIndex[k]!, slot: k, acc: r.accs[k]!, y: r.squares[k]!, next: r.accs[k + 1]! },
        });
        setMetric('reduce-result', r.accs[k + 1]!);
        if (!(await pause())) return;
      }

      // 5. 답 — 걸음 경계는 아래의 입력 대기
      await phase('answer');
      await ctx.emit({ type: 'answer', payload: { sum: r.sum, count: r.kept.length } });
      prevKept = passed;

      // 손잡이를 기다린다
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput<{ type: string; payload?: unknown }>();
        if (ctx.cancelled) return;
        if (input.type !== 'threshold') continue;
        const p = input.payload as { value?: unknown } | undefined;
        const v = p?.value;
        if (typeof v !== 'number') throw new Error(`map-filter-reduce: 문턱 값이 수가 아니다 (${String(v)})`);
        if (!thresholds.includes(v)) throw new Error(`map-filter-reduce: 문턱 ${v} 가 사다리 [${thresholds.join(', ')}] 에 없다`);
        next = v;
      }
      threshold = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
