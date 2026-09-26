/**
 * append-only-log 장면 — 이벤트를 잇기만 한다. 오프셋 · 끝 · 같은 키의 자리는 알고리즘이 셈해 싣는다.
 *
 * 바탕  waiting — 아직 붙지 않은 기록 (들어올 차례대로)
 * 자취  log     — 붙은 기록 (오프셋 차례대로. 고쳐 쓰지 않는다)
 *       end     — 끝 오프셋. silent init 이 채우기 전에는 null
 * 이번  step    — 이번 걸음에 붙은 기록과 같은 키의 자리
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAppendOnlyLogData, type LogRecord } from './algorithm.js';

export type LogEntry = { key: string; value: number; offset: number };

export type AppendStep = { kind: 'append'; offset: number; key: string; sameKey: number[] };

export type AppendOnlyLogScene = {
  waiting: LogRecord[];
  log: LogEntry[];
  end: number | null;
  step: AppendStep | null;
};

function fail(msg: string): never {
  throw new Error(`appendOnlyLogScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function intField(p: Record<string, unknown>, type: string, name: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    fail(`${type}.payload.${name} 가 0 이상의 정수가 아니다`);
  }
  return v;
}

export const appendOnlyLogScene: ScenePlan<AppendOnlyLogScene> = {
  initial(initialData: unknown): AppendOnlyLogScene {
    const data = narrowAppendOnlyLogData(initialData);
    return {
      waiting: data.records.map((r) => ({ key: r.key, value: r.value })),
      log: [],
      end: null,
      step: null,
    };
  },

  reduce(scene: AppendOnlyLogScene, event: FacetRuntimeEvent): AppendOnlyLogScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const end = intField(p, 'init', 'end');
        if (scene.log.length !== 0) fail('init 이 붙은 기록이 있는 장면에 왔다');
        if (end !== scene.log.length) fail(`init.payload.end ${end} 가 로그 길이 ${scene.log.length} 와 다르다`);
        return { waiting: scene.waiting.map((r) => ({ ...r })), log: [], end, step: null };
      }
      case 'append': {
        const p = payloadOf(event);
        const key = p.key;
        const value = p.value;
        if (typeof key !== 'string') fail('append.payload.key 가 문자열이 아니다');
        if (typeof value !== 'number') fail('append.payload.value 가 수가 아니다');
        const offset = intField(p, 'append', 'offset');
        const end = intField(p, 'append', 'end');
        const rawSame = p.sameKey;
        if (!Array.isArray(rawSame)) fail('append.payload.sameKey 가 배열이 아니다');
        const sameKey = rawSame.map((o: unknown, i: number) => {
          if (typeof o !== 'number' || !Number.isInteger(o)) fail(`append.payload.sameKey[${i}] 가 정수가 아니다`);
          return o;
        });

        const head = scene.waiting[0];
        if (head === undefined) fail('append 가 왔는데 들어올 기록이 없다');
        if (head.key !== key || head.value !== value) {
          fail(`append.payload 의 ${key}=${value} 가 들어올 기록의 맨 앞 ${head.key}=${head.value} 와 다르다`);
        }
        if (scene.end === null) fail('append 가 init 보다 먼저 왔다');
        if (offset !== scene.end) fail(`append.payload.offset ${offset} 가 지금 끝 ${scene.end} 와 다르다`);
        if (end !== offset + 1) fail(`append.payload.end ${end} 가 offset ${offset} 의 다음 자리가 아니다`);

        const log = [...scene.log.map((e) => ({ ...e })), { key, value, offset }];
        for (const o of sameKey) {
          const at = log[o];
          if (at === undefined || at.key !== key) fail(`append.payload.sameKey 의 ${o} 자리에 키 ${key} 가 없다`);
        }
        if (!sameKey.includes(offset)) fail(`append.payload.sameKey 에 이번 오프셋 ${offset} 가 없다`);

        return {
          waiting: scene.waiting.slice(1).map((r) => ({ ...r })),
          log,
          end,
          step: { kind: 'append', offset, key, sameKey: [...sameKey] },
        };
      }
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
