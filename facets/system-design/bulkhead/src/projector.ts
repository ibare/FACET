/**
 * 벌크헤드 projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽어 무대의 타입으로 옮긴다. 모르는 이벤트 · 모르는 모양 · 없는 값은 던진다.
 * 운동 길이 = 판 머리의 motionMs ÷ 그때그때의 재생 속도.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  BulkheadStage,
  BulkheadStageArrive,
  BulkheadStageBegin,
  BulkheadStageRelease,
  BulkheadStageSeat,
  BulkheadStageServiceId,
} from './bulkhead-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`bulkhead: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`bulkhead: ${what} 가 수가 아니다`);
  return x;
}
function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`bulkhead: ${what} 가 글자가 아니다`);
  return x;
}
function arr(x: unknown, what: string): unknown[] {
  if (!Array.isArray(x)) throw new Error(`bulkhead: ${what} 가 배열이 아니다`);
  return x;
}
function svcId(x: unknown, what: string): BulkheadStageServiceId {
  if (x === 'a' || x === 'b') return x;
  throw new Error(`bulkhead: ${what} 가 a · b 가 아니다 (${String(x)})`);
}
function range(x: unknown, what: string): { from: number; to: number } {
  const r = rec(x, what);
  return { from: num(r.from, `${what}.from`), to: num(r.to, `${what}.to`) };
}
function seats(x: unknown): BulkheadStageSeat[] {
  return arr(x, 'seats').map((raw, i) => {
    const s = rec(raw, `seats[${i}]`);
    const call = s.call === null ? null : str(s.call, `seats[${i}].call`);
    const service = s.service === null ? null : svcId(s.service, `seats[${i}].service`);
    if ((call === null) !== (service === null)) throw new Error(`bulkhead: seats[${i}] 의 호출과 서비스가 어긋난다`);
    return {
      seat: num(s.seat, `seats[${i}].seat`),
      call,
      service,
      left: num(s.left, `seats[${i}].left`),
      hold: num(s.hold, `seats[${i}].hold`),
    };
  });
}

export const bulkheadProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BulkheadStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const need = (): BulkheadStage => {
    if (stage === undefined) throw new Error('bulkhead: 무대(stage)가 없다');
    return stage;
  };
  const dur = (): number => {
    if (motionMs === null) throw new Error('bulkhead: 판 머리(init) 전에 걸음이 왔다');
    const speed = runtime?.getSpeed() ?? 1;
    if (!(speed > 0)) throw new Error(`bulkhead: 재생 속도 ${speed} 가 0 이하다 — 운동 길이를 셀 수 없다`);
    return motionMs / speed;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'init': {
          const p = rec(event.payload, 'init');
          motionMs = num(p.motionMs, 'init.motionMs');
          const rg = rec(p.ranges, 'init.ranges');
          const begin: BulkheadStageBegin = {
            aSlots: num(p.aSlots, 'init.aSlots'),
            pool: num(p.pool, 'init.pool'),
            ranges: { a: range(rg.a, 'init.ranges.a'), b: range(rg.b, 'init.ranges.b') },
            services: arr(p.services, 'init.services').map((raw, i) => {
              const s = rec(raw, `init.services[${i}]`);
              return {
                id: svcId(s.id, `init.services[${i}].id`),
                rate: num(s.rate, `init.services[${i}].rate`),
                hold: num(s.hold, `init.services[${i}].hold`),
              };
            }),
            seats: seats(p.seats),
          };
          code?.highlightPhase?.(null);
          need().begin(begin, dur());
          return;
        }
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase?.(str(p.phase, 'phase.phase'));
          return;
        }
        case 'release': {
          const p = rec(event.payload, 'release');
          const release: BulkheadStageRelease = {
            tick: num(p.tick, 'release.tick'),
            freed: arr(p.freed, 'release.freed').map((raw, i) => {
              const f = rec(raw, `release.freed[${i}]`);
              return { seat: num(f.seat, `release.freed[${i}].seat`), call: str(f.call, `release.freed[${i}].call`) };
            }),
            seats: seats(p.seats),
          };
          need().release(release, dur());
          return;
        }
        case 'arrive': {
          const p = rec(event.payload, 'arrive');
          const c = rec(p.counts, 'arrive.counts');
          const arrive: BulkheadStageArrive = {
            tick: num(p.tick, 'arrive.tick'),
            calls: arr(p.calls, 'arrive.calls').map((raw, i) => {
              const k = rec(raw, `arrive.calls[${i}]`);
              return {
                call: str(k.call, `arrive.calls[${i}].call`),
                service: svcId(k.service, `arrive.calls[${i}].service`),
                seat: k.seat === null ? null : num(k.seat, `arrive.calls[${i}].seat`),
              };
            }),
            counts: {
              aTaken: num(c.aTaken, 'arrive.counts.aTaken'),
              aRefused: num(c.aRefused, 'arrive.counts.aRefused'),
              bTaken: num(c.bTaken, 'arrive.counts.bTaken'),
              bRefused: num(c.bRefused, 'arrive.counts.bRefused'),
            },
            seats: seats(p.seats),
          };
          need().arrive(arrive, dur());
          return;
        }
        default:
          throw new Error(`bulkhead: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      stage?.reset();
      code?.highlightPhase?.(null);
    },
  };
};
