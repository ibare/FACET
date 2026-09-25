/**
 * echo-and-reply 장면.
 *
 * - 바탕: 두 끝의 주소 · 식별자 · ICMP 종류 번호 · 보낼 seq 들 · 간격 · 기한 (initialData 에서 베낀다)
 * - 자취: seq 마다 돌아온 답 또는 기한 지남 — 칸이 차는 차례
 * - 이번 걸음: 방금 무엇이 일어났는가 (`start` · `echo` · `lost` · `summary`)
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트의 값을 옮겨 담기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type EchoBase = {
  source: string;
  target: string;
  identifier: number;
  intervalMs: number;
  timeoutMs: number;
  requestType: number;
  requestCode: number;
  replyType: number;
  replyCode: number;
  seqs: number[];
};

export type EchoOutcome =
  | { kind: 'reply'; seq: number; sentAt: number; reachedAt: number; receivedAt: number; rtt: number }
  | { kind: 'lost'; seq: number; sentAt: number; deadlineAt: number };

export type EchoSummaryScene = {
  sent: number;
  received: number;
  lossPercent: number;
  min: number;
  avg: number;
  max: number;
  minSeq: number;
  maxSeq: number;
};

export type EchoStep =
  | { kind: 'start' }
  | { kind: 'echo'; seq: number }
  | { kind: 'lost'; seq: number }
  | { kind: 'summary' };

export type EchoAndReplyScene = {
  base: EchoBase;
  trail: EchoOutcome[];
  summary: EchoSummaryScene | null;
  step: EchoStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`echo-and-reply: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`echo-and-reply: ${what}.${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`echo-and-reply: ${what}.${key} 가 비었다`);
  return v;
}

function readBase(initialData: unknown): EchoBase {
  const d = rec(initialData, 'initialData');
  const request = rec(d['request'], 'request');
  const reply = rec(d['reply'], 'reply');
  const probes = d['probes'];
  if (!Array.isArray(probes) || probes.length === 0) throw new Error('echo-and-reply: probes 가 비었다');
  const seqs = probes.map((p: unknown, i) => num(rec(p, `probes[${i}]`), 'seq', `probes[${i}]`));
  return {
    source: str(d, 'source', 'initialData'),
    target: str(d, 'target', 'initialData'),
    identifier: num(d, 'identifier', 'initialData'),
    intervalMs: num(d, 'intervalMs', 'initialData'),
    timeoutMs: num(d, 'timeoutMs', 'initialData'),
    requestType: num(request, 'type', 'request'),
    requestCode: num(request, 'code', 'request'),
    replyType: num(reply, 'type', 'reply'),
    replyCode: num(reply, 'code', 'reply'),
    seqs,
  };
}

export const echoAndReplyScene: ScenePlan<EchoAndReplyScene> = {
  initial(initialData: unknown): EchoAndReplyScene {
    return { base: readBase(initialData), trail: [], summary: null, step: { kind: 'start' } };
  },

  reduce(scene: EchoAndReplyScene, event: FacetRuntimeEvent): EchoAndReplyScene {
    if (event.type === 'echo') {
      const p = rec(event.payload, 'echo.payload');
      const seq = num(p, 'seq', 'echo');
      const outcome: EchoOutcome = {
        kind: 'reply',
        seq,
        sentAt: num(p, 'sentAt', 'echo'),
        reachedAt: num(p, 'reachedAt', 'echo'),
        receivedAt: num(p, 'receivedAt', 'echo'),
        rtt: num(p, 'rtt', 'echo'),
      };
      return { ...scene, trail: [...scene.trail, outcome], step: { kind: 'echo', seq } };
    }
    if (event.type === 'lost') {
      const p = rec(event.payload, 'lost.payload');
      const seq = num(p, 'seq', 'lost');
      const outcome: EchoOutcome = {
        kind: 'lost',
        seq,
        sentAt: num(p, 'sentAt', 'lost'),
        deadlineAt: num(p, 'deadlineAt', 'lost'),
      };
      return { ...scene, trail: [...scene.trail, outcome], step: { kind: 'lost', seq } };
    }
    if (event.type === 'summary') {
      const p = rec(event.payload, 'summary.payload');
      const summary: EchoSummaryScene = {
        sent: num(p, 'sent', 'summary'),
        received: num(p, 'received', 'summary'),
        lossPercent: num(p, 'lossPercent', 'summary'),
        min: num(p, 'min', 'summary'),
        avg: num(p, 'avg', 'summary'),
        max: num(p, 'max', 'summary'),
        minSeq: num(p, 'minSeq', 'summary'),
        maxSeq: num(p, 'maxSeq', 'summary'),
      };
      return { ...scene, summary, step: { kind: 'summary' } };
    }
    return scene;
  },
};
