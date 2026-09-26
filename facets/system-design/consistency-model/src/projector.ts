/**
 * consistency-model projector — 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 비거나 어긋나면 무엇이 없는지 담아 던진다. 운동 길이는 init 의 motionMs 를
 * 그때그때의 재생 속도로 나눈다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type {
  ConsistencyInitView,
  ConsistencyModelStage,
  ConsistencyPushView,
  ConsistencyReadView,
  ConsistencyWriteView,
} from './consistency-model-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

function bad(what: string): never {
  throw new Error(`consistency-model projector: ${what}`);
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) bad(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') bad(`${k} 가 문자열이 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') bad(`${k} 가 참거짓이 아니다`);
  return v;
}
function strs(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v)) bad(`${k} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') bad(`${k}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function readInit(p: Record<string, unknown>): ConsistencyInitView & { motionMs: number } {
  return {
    replicas: strs(p, 'replicas'),
    key: str(p, 'key'),
    client: str(p, 'client'),
    writer: str(p, 'writer'),
    oldValue: num(p, 'oldValue'),
    oldVersion: num(p, 'oldVersion'),
    newValue: num(p, 'newValue'),
    newVersion: num(p, 'newVersion'),
    rounds: num(p, 'rounds'),
    rule: num(p, 'rule'),
    motionMs: num(p, 'motionMs'),
    oldAxisMax: num(p, 'oldAxisMax'),
    wastedAxisMax: num(p, 'wastedAxisMax'),
  };
}

function readWrite(p: Record<string, unknown>): ConsistencyWriteView {
  return {
    client: str(p, 'client'),
    writer: str(p, 'writer'),
    value: num(p, 'value'),
    version: num(p, 'version'),
    oldCount: num(p, 'oldCount'),
  };
}

function readPush(p: Record<string, unknown>): ConsistencyPushView {
  const sendsRaw = p.sends;
  if (!Array.isArray(sendsRaw)) bad('sends 가 배열이 아니다');
  return {
    round: num(p, 'round'),
    sends: sendsRaw.map((s, i) => {
      const o = rec(s, `sends[${i}]`);
      return { from: str(o, 'from'), to: str(o, 'to'), wasted: bool(o, 'wasted') };
    }),
    newly: strs(p, 'newly'),
    oldCount: num(p, 'oldCount'),
    convergedNow: bool(p, 'convergedNow'),
    convergedRound: num(p, 'convergedRound'),
    wastedTotal: num(p, 'wastedTotal'),
  };
}

function readRead(p: Record<string, unknown>): ConsistencyReadView {
  return {
    round: num(p, 'round'),
    rule: num(p, 'rule'),
    asked: strs(p, 'asked'),
    bounced: strs(p, 'bounced'),
    served: str(p, 'served'),
    value: num(p, 'value'),
    stale: bool(p, 'stale'),
  };
}

export const consistencyModelProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ConsistencyModelStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;

  const need = (): ConsistencyModelStage => {
    if (!stage) bad('stage 블록이 없다');
    return stage;
  };
  const duration = (): number => {
    if (motionMs === null) bad('init 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent): void {
      const p = rec(event.payload ?? {}, `${event.type} payload`);
      switch (event.type) {
        case 'init': {
          const init = readInit(p);
          motionMs = init.motionMs;
          const s = need();
          s.init(init);
          code?.highlightPhase?.(null);
          s.setCaption(
            t('caption.init', 'All {n} copies hold {v} (version {ver})', {
              n: init.replicas.length,
              v: init.oldValue,
              ver: init.oldVersion,
            }),
          );
          return;
        }
        case 'phase': {
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'write': {
          const w = readWrite(p);
          const s = need();
          s.write(w, duration());
          s.setCaption(
            t('caption.write', '{client} writes {v} to {replica} · version {ver}', {
              client: w.client,
              v: w.value,
              replica: w.writer,
              ver: w.version,
            }),
          );
          return;
        }
        case 'push': {
          const push = readPush(p);
          const s = need();
          s.push(push, duration());
          s.setCaption(
            t('caption.push', 'Round {r} · push · newly reached: {n}', { r: push.round, n: push.newly.length }),
          );
          return;
        }
        case 'read': {
          const read = readRead(p);
          const s = need();
          s.read(read, duration());
          if (read.bounced.length > 0) {
            s.setCaption(
              t('caption.readBounce', 'Round {r} · sent back {n} times · {replica} answers {v}', {
                r: read.round,
                n: read.bounced.length,
                replica: read.served,
                v: read.value,
              }),
            );
          } else if (read.stale) {
            s.setCaption(
              t('caption.readStale', 'Round {r} · {replica} answers {v} · old value', {
                r: read.round,
                replica: read.served,
                v: read.value,
              }),
            );
          } else {
            s.setCaption(
              t('caption.readFresh', 'Round {r} · {replica} answers {v}', {
                r: read.round,
                replica: read.served,
                v: read.value,
              }),
            );
          }
          return;
        }
        default:
          bad(`모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onDestroy(): void {
      motionMs = null;
    },
  };
};
