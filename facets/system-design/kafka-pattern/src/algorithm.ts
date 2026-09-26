/**
 * Kafka 패턴 — 파티션 하나의 로그에 기록이 틱마다 붙고, 보존 길이만큼만 남는다.
 * 빠른 그룹(live)은 틱마다 끝까지 읽고, 느린 그룹(batch)은 every 틱에 하나 읽는다.
 * 보존이 차면 로그 앞이 끝을 따라 밀리고, 그 앞에 걸린 batch 오프셋은 로그 앞으로 튕긴다.
 *
 * 한 틱 안의 차례 (사양이 정한 것 — 이 차례가 이긴다)
 *   ① 붙음: 기록 하나가 끝에 붙는다 (오프셋 = 붙기 전 길이)
 *   ② 보존: 로그 앞 = max(로그 앞, 끝 − R) (R 0 = 지우지 않음)
 *   ③ live 가 끝까지 읽는다 (로그 앞보다 앞이면 건너뛴 수를 잃음으로 센다 — 이 모형에서는 늘 0)
 *   ④ batch 오프셋이 로그 앞보다 앞이면 로그 앞으로 튕기고, 건너뛴 수를 잃음으로 센다
 *   ⑤ 틱 % every == 0 이고 batch < 끝이면 batch 가 하나 읽는다
 * 끝 걸음: live 가 오프셋 rewindTo(0) 로 되감기를 청한다 → 실제 자리 = max(rewindTo, 로그 앞).
 * 오프셋 = 다음에 읽을 자리, 읽은 즉시 커밋.
 * 동률 · 무작위 · 실수 없음 — 모든 셈이 정수다.
 *
 * 이벤트 (payload 스키마)
 *   init   (silent) { ticks: number, values: number[], fastId: string, slowId: string,
 *                     retention: number, every: number, window: number, motionMs: number }
 *          window = 보존 틀의 칸 수 (retention, 0 이면 ticks)
 *   tick            { tick: number, offset: number, value: number, start: number, end: number,
 *                     trimmed: number, live: number, batch: number, skipFrom: number,
 *                     skipped: number, read: boolean }
 *          start..end−1 = 남은 로그, trimmed = 이 틱에 지운 수, skipped = 이 틱에 batch 가 튕긴 수(0 = 튕김 없음),
 *          skipFrom = 튕기기 전 batch 오프셋
 *   rewind          { requested: number, offset: number, from: number, end: number }
 *   phase  (silent) { phase: string }
 *
 * phase 어휘 — irs.ts 와 같다
 *   append · trim · skip · read · rewind
 *   틱 걸음의 대표 = skip > read > trim > append (그 틱에 일어난 것 가운데 앞선 것)
 *
 * 계기 (판마다 0 에서, 판 끝 값이 사양 표)
 *   batch-lost  batch 가 튕겨 잃은 기록 수
 *   live-lost   live 가 잃은 기록 수 (견줌 자리)
 *   batch-lag   끝 − batch
 *   retained    지금 로그에 남은 기록 수 = 끝 − 로그 앞 (끝 값 = 되감아 다시 읽을 수)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KafkaPatternData = {
  type: 'kafka-pattern';
  stepMs: number;
  motionMs: number;
  /** 오프셋 0.. 차례의 기록 값. 틱마다 하나씩 붙는다 */
  values: number[];
  /** 빠른 그룹 식별자 (틱마다 끝까지 읽는다) */
  fastId: string;
  /** 느린 그룹 식별자 (every 틱에 하나 읽는다) */
  slowId: string;
  /** 끝 걸음에 빠른 그룹이 되감기를 청하는 오프셋 */
  rewindTo: number;
  /** 보존 길이 사다리 (0 = 끝없음) */
  retentions: number[];
  /** 느린 그룹 간격 사다리 (틱) */
  everies: number[];
  /** 처음 보존 길이 */
  retention: number;
  /** 처음 느린 그룹 간격 */
  every: number;
};

export type KafkaTick = {
  tick: number;
  offset: number;
  value: number;
  start: number;
  end: number;
  trimmed: number;
  live: number;
  batch: number;
  skipFrom: number;
  skipped: number;
  read: boolean;
  batchLost: number;
  liveLost: number;
  phase: 'append' | 'trim' | 'skip' | 'read';
};

export type KafkaRun = {
  ticks: KafkaTick[];
  /** 끝 걸음 되감기가 실제로 선 자리 */
  replayFrom: number;
  /** [batch 잃음, live 잃음, 다시 읽을 수, batch 밀림] — IR 의 result 와 같은 차례 */
  result: [number, number, number, number];
};

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** ctx.data 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다 */
export function narrowKafkaPatternData(raw: unknown): KafkaPatternData {
  if (typeof raw !== 'object' || raw === null) throw new Error('kafkaPattern: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'kafka-pattern') throw new Error(`kafkaPattern: type 이 'kafka-pattern' 이 아니다 (${String(d.type)})`);
  for (const k of ['stepMs', 'motionMs', 'rewindTo', 'retention', 'every'] as const) {
    if (!isInt(d[k]) || (d[k] as number) < 0) throw new Error(`kafkaPattern: ${k} 가 음이 아닌 정수가 아니다`);
  }
  for (const k of ['values', 'retentions', 'everies'] as const) {
    const a = d[k];
    if (!Array.isArray(a) || a.length === 0 || !a.every(isInt)) throw new Error(`kafkaPattern: ${k} 가 정수 배열이 아니다`);
  }
  for (const k of ['fastId', 'slowId'] as const) {
    if (typeof d[k] !== 'string' || d[k] === '') throw new Error(`kafkaPattern: ${k} 가 비었다`);
  }
  const data = d as unknown as KafkaPatternData;
  if (!data.retentions.includes(data.retention)) throw new Error(`kafkaPattern: 처음 보존 ${data.retention} 이 사다리에 없다`);
  if (!data.everies.includes(data.every)) throw new Error(`kafkaPattern: 처음 간격 ${data.every} 이 사다리에 없다`);
  if (data.retentions.some((r) => r < 0)) throw new Error('kafkaPattern: 보존 사다리에 음수가 있다');
  if (data.everies.some((e) => e < 1)) throw new Error('kafkaPattern: 간격 사다리에 1 보다 작은 값이 있다');
  return data;
}

/** 한 판을 셈한다 — 순수 함수. 보존 < 0 · 간격 < 1 이면 던진다 (IR 은 −1) */
export function runKafka(values: readonly number[], retention: number, every: number, rewindTo: number): KafkaRun {
  if (!isInt(retention) || retention < 0) throw new Error(`kafkaPattern: 보존 ${retention} 은 셈할 수 없다`);
  if (!isInt(every) || every < 1) throw new Error(`kafkaPattern: 간격 ${every} 은 셈할 수 없다`);
  let start = 0;
  let end = 0;
  let live = 0;
  let batch = 0;
  let liveLost = 0;
  let batchLost = 0;
  const ticks: KafkaTick[] = [];
  for (let tick = 1; tick <= values.length; tick++) {
    const offset = end;
    const value = values[offset];
    if (value === undefined) throw new Error(`kafkaPattern: 오프셋 ${offset} 의 기록 값이 없다`);
    // ① 붙음
    end = end + 1;
    // ② 보존
    let trimmed = 0;
    if (retention > 0 && end - retention > start) {
      trimmed = end - retention - start;
      start = end - retention;
    }
    // ③ live 가 끝까지
    if (live < start) liveLost += start - live;
    live = end;
    // ④ batch 튕김
    const skipFrom = batch;
    let skipped = 0;
    if (batch < start) {
      skipped = start - batch;
      batchLost += skipped;
      batch = start;
    }
    // ⑤ batch 읽기
    let read = false;
    if (tick % every === 0 && batch < end) {
      batch = batch + 1;
      read = true;
    }
    const phase = skipped > 0 ? 'skip' : read ? 'read' : trimmed > 0 ? 'trim' : 'append';
    ticks.push({ tick, offset, value, start, end, trimmed, live, batch, skipFrom, skipped, read, batchLost, liveLost, phase });
  }
  const replayFrom = Math.max(rewindTo, start);
  return { ticks, replayFrom, result: [batchLost, liveLost, end - replayFrom, end - batch] };
}

type MetricName = 'batch-lost' | 'live-lost' | 'batch-lag' | 'retained';

export async function kafkaPatternAlgorithm(rawCtx: FacetContext<KafkaPatternData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<KafkaPatternData>;
  const data = narrowKafkaPatternData(ctx.data);
  let retention = data.retention;
  let every = data.every;

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다
  const shown: Record<MetricName, number> = { 'batch-lost': 0, 'live-lost': 0, 'batch-lag': 0, retained: 0 };
  const gauge = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    for (;;) {
      if (ctx.cancelled) return;
      // 판 머리 — 계기를 0 으로 (처음에도 차이 0 을 보낸다)
      gauge('batch-lost', 0);
      gauge('live-lost', 0);
      gauge('batch-lag', 0);
      gauge('retained', 0);
      const run = runKafka(data.values, retention, every, data.rewindTo);
      const pause = (): Promise<boolean> => ctx.sleep(data.stepMs + data.motionMs);

      await ctx.emit({
        type: 'init',
        payload: {
          ticks: data.values.length,
          values: [...data.values],
          fastId: data.fastId,
          slowId: data.slowId,
          retention,
          every,
          window: retention > 0 ? retention : data.values.length,
          motionMs: data.motionMs,
        },
        silent: true,
      });
      // 걸음 0 의 경계 — 판 머리의 보존 틀 폭 운동이 끝난 뒤에 첫 틱을 보낸다
      if (!(await pause())) return;

      for (const s of run.ticks) {
        if (ctx.cancelled) return;
        await phase(s.phase);
        await ctx.emit({
          type: 'tick',
          payload: {
            tick: s.tick,
            offset: s.offset,
            value: s.value,
            start: s.start,
            end: s.end,
            trimmed: s.trimmed,
            live: s.live,
            batch: s.batch,
            skipFrom: s.skipFrom,
            skipped: s.skipped,
            read: s.read,
          },
        });
        gauge('batch-lost', s.batchLost);
        gauge('live-lost', s.liveLost);
        gauge('batch-lag', s.end - s.batch);
        gauge('retained', s.end - s.start);
        if (!(await pause())) return;
      }

      const last = run.ticks[run.ticks.length - 1];
      if (last === undefined) throw new Error('kafkaPattern: 틱이 하나도 없다');
      if (ctx.cancelled) return;
      await phase('rewind');
      await ctx.emit({
        type: 'rewind',
        payload: { requested: data.rewindTo, offset: run.replayFrom, from: last.live, end: last.end },
      });
      if (!(await pause())) return;

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as Record<string, unknown>).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'retention' && data.retentions.includes(value)) {
          retention = value;
          break;
        }
        if (input.type === 'every' && data.everies.includes(value)) {
          every = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
