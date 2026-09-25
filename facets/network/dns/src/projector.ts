/**
 * dns projector — `round` · `window` · `phase` 를 무대와 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 900ms 를 재생 속도로 나눈 값이다. 속도는 이벤트마다 그때그때 읽는다.
 * 캡션의 수는 모두 알고리즘이 실은 값이다 — 여기서 셈하지 않는다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type {
  DnsStage,
  DnsStageChange,
  DnsStageHop,
  DnsStageKind,
  DnsStageQuestion,
  DnsStageRound,
  DnsStageWindow,
} from './dns-stage.js';

const MOTION_MS = 900;

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`${key} 가 글자가 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${key} 가 참거짓이 아니다`);
  return v;
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${key} 가 목록이 아니다`);
  return v;
}
function kindOf(v: string): DnsStageKind {
  if (v === 'walk' || v === 'owner' || v === 'hit' || v === 'stale') return v;
  throw new Error(`모르는 판정: ${v}`);
}

function readRound(p: Record<string, unknown>): DnsStageRound & { layers: number; questionCount: number; askEverySec: number } {
  const ladder = list(p, 'ttlLadder').map((x) => {
    if (typeof x !== 'number') throw new Error('ttlLadder 에 수가 아닌 값');
    return x;
  });
  if (ladder.length === 0) throw new Error('ttlLadder 가 비었다');
  const path: DnsStageHop[] = list(p, 'path').map((h) => {
    const o = obj(h, 'path 원소');
    return { name: str(o, 'name'), address: str(o, 'address'), zone: str(o, 'zone') };
  });
  const questionSecs = list(p, 'questionSecs').map((x) => {
    if (typeof x !== 'number') throw new Error('questionSecs 에 수가 아닌 값');
    return x;
  });
  return {
    ttl: num(p, 'ttl'),
    maxTtl: Math.max(...ladder),
    name: str(p, 'name'),
    playEndSec: num(p, 'playEndSec'),
    questionSecs,
    answerBefore: str(p, 'answerBefore'),
    path,
    layers: num(p, 'layers'),
    questionCount: num(p, 'questionCount'),
    askEverySec: num(p, 'askEverySec'),
  };
}

function readWindow(p: Record<string, unknown>): DnsStageWindow & { step: number; hiSec: number; hits: number; misses: number; stale: number } {
  const questions: DnsStageQuestion[] = list(p, 'questions').map((q) => {
    const o = obj(q, 'questions 원소');
    return {
      sec: num(o, 'sec'),
      kind: kindOf(str(o, 'kind')),
      answer: str(o, 'answer'),
      expirySec: num(o, 'expirySec'),
      missOrdinal: num(o, 'missOrdinal'),
      queries: num(o, 'queries'),
    };
  });
  let change: DnsStageChange | null = null;
  if (p.change !== null) {
    const c = obj(p.change, 'change');
    change = {
      atSec: num(c, 'atSec'),
      before: str(c, 'before'),
      after: str(c, 'after'),
      heldUntilSec: num(c, 'heldUntilSec'),
      heldSeconds: num(c, 'heldSeconds'),
    };
  }
  return {
    step: num(p, 'step'),
    loSec: num(p, 'loSec'),
    hiSec: num(p, 'hiSec'),
    last: bool(p, 'last'),
    questions,
    hits: num(p, 'hits'),
    misses: num(p, 'misses'),
    stale: num(p, 'stale'),
    missesSoFar: num(p, 'missesSoFar'),
    change,
  };
}

export const dnsProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as DnsStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    async onEvent(e: FacetRuntimeEvent) {
      switch (e.type) {
        case 'phase': {
          const ph = obj(e.payload, 'phase payload').phase;
          if (ph === null) code?.clearHighlight?.();
          else if (typeof ph === 'string') code?.highlightPhase?.(ph);
          else throw new Error('phase 가 글자도 null 도 아니다');
          return;
        }
        case 'round': {
          if (!stage) return;
          const r = readRound(obj(e.payload, 'round payload'));
          const caption = t('caption.round', 'TTL {ttl}s · {count} questions, one every {every}s', {
            ttl: r.ttl,
            count: r.questionCount,
            every: r.askEverySec,
          });
          await stage.beginRound(r, caption, motion());
          return;
        }
        case 'window': {
          if (!stage) return;
          const w = readWindow(obj(e.payload, 'window payload'));
          const q0 = w.questions[0];
          if (!q0) throw new Error('빈 창');
          const qn = w.questions[w.questions.length - 1]!;
          const caption =
            q0.kind === 'walk'
              ? t('caption.first', 'Asked at {sec}s · cache empty · {n} queries down the tree', { sec: q0.sec, n: q0.queries })
              : t('caption.window', 'Asked {from}–{to}s · hits {hits} (stale {stale}) · misses {misses}', {
                  from: q0.sec,
                  to: qn.sec,
                  hits: w.hits,
                  misses: w.misses,
                  stale: w.stale,
                });
          await stage.playWindow(w, caption, motion());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
