/**
 * append-only-log — 파티션 하나의 추가 전용 로그에 기록이 차례로 붙는다.
 *
 * 기록 하나 = 걸음 하나. 새 기록은 붙는 순간의 로그 길이를 오프셋으로 받고,
 * 끝 오프셋(다음에 붙을 자리 = 로그 길이)이 하나 오른다. 앞의 기록은 고치지 않는다 —
 * 같은 키가 다시 와도 뒤에 또 붙는다. 읽는 쪽 · 보존 기간 · 지우기 · 압축은 모형에 없다.
 *
 * 이벤트
 *   init    (silent)  { end: number }
 *     걸음 0 의 끝 오프셋. 빈 로그라 로그 길이 0.
 *   append            { key: string; value: number; offset: number; end: number; sameKey: number[] }
 *     들어올 기록의 맨 앞 하나가 로그 끝에 붙었다.
 *     offset  = 붙기 전 로그 길이 · end = 붙은 뒤 로그 길이
 *     sameKey = 붙은 뒤 로그에서 같은 키를 가진 기록의 오프셋들 (오름차순, 이번 것 포함)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 들어올 기록 하나 — 센서 키와 온도. 둘 다 번역하지 않는 자료다. */
export type LogRecord = { key: string; value: number };

export type AppendOnlyLogFacetData = {
  type: 'append-only-log';
  stepMs: number;
  /** 들어올 차례대로. 오프셋은 적지 않는다 — 알고리즘이 셈한다. */
  records: LogRecord[];
};

/** `ctx.data` · 장면의 `initial` 이 함께 쓰는 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowAppendOnlyLogData(raw: unknown): AppendOnlyLogFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('append-only-log: initialData 가 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'append-only-log') {
    throw new Error(`append-only-log: initialData.type 이 'append-only-log' 가 아니다 (${String(o.type)})`);
  }
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) {
    throw new Error('append-only-log: initialData.stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(o.records) || o.records.length === 0) {
    throw new Error('append-only-log: initialData.records 가 비었거나 배열이 아니다');
  }
  const records: LogRecord[] = o.records.map((r: unknown, i: number) => {
    if (typeof r !== 'object' || r === null) {
      throw new Error(`append-only-log: initialData.records[${i}] 가 객체가 아니다`);
    }
    const rec = r as Record<string, unknown>;
    if (typeof rec.key !== 'string' || rec.key === '') {
      throw new Error(`append-only-log: initialData.records[${i}].key 가 빈 문자열이거나 문자열이 아니다`);
    }
    if (typeof rec.value !== 'number' || !Number.isFinite(rec.value)) {
      throw new Error(`append-only-log: initialData.records[${i}].value 가 수가 아니다`);
    }
    return { key: rec.key, value: rec.value };
  });
  return { type: 'append-only-log', stepMs: o.stepMs, records };
}

export async function appendOnlyLog(ctx: FacetContext<AppendOnlyLogFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<AppendOnlyLogFacetData>;
  const data = narrowAppendOnlyLogData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 로그 — 붙기만 하고 고치거나 빼지 않는다.
  const log: { key: string; value: number; offset: number }[] = [];

  await ctx.emit({ type: 'init', payload: { end: log.length }, silent: true });

  // 걸음 0(빈 로그와 들어올 기록 다섯)에도 읽을 것이 있어 첫 붙기 앞에 stepMs 를 둔다.
  for (const rec of data.records) {
    if (!(await pause())) return;
    const offset = log.length;
    log.push({ key: rec.key, value: rec.value, offset });
    const sameKey = log.filter((e) => e.key === rec.key).map((e) => e.offset);
    await ctx.emit({
      type: 'append',
      payload: { key: rec.key, value: rec.value, offset, end: log.length, sameKey },
    });
  }
}
