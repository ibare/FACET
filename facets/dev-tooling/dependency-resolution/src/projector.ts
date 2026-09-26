/**
 * dependency-resolution projector — 알고리즘 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 정하고(MOVE_MS / 속도), 운동이 끝날 때까지 기다려
 * 걸음 = stepMs + 운동 이 되게 한다. payload 는 typeof 로 좁히고, 없는 값은 던진다.
 */
import type { ProjectorFactory, FacetRuntimeEvent } from '@ffacet/core/runtime';
import type {
  AxisPayload,
  BandPayload,
  DependencyResolutionStage,
  DonePayload,
  RoundPayload,
} from './dependency-resolution-stage.js';

const MOVE_MS = 400;

type CodePanel = { highlightPhase(phase: string | null): void };

type Rec = Record<string, unknown>;

function rec(v: unknown, where: string): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`dependency-resolution: ${where} 가 객체가 아니다`);
  return v as Rec;
}
function str(p: Rec, key: string, where: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`dependency-resolution: ${where}.${key} 가 문자열이 아니다`);
  return v;
}
function num(p: Rec, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dependency-resolution: ${where}.${key} 가 수가 아니다`);
  return v;
}
function bool(p: Rec, key: string, where: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`dependency-resolution: ${where}.${key} 가 참거짓이 아니다`);
  return v;
}
function list(p: Rec, key: string, where: string): unknown[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`dependency-resolution: ${where}.${key} 가 배열이 아니다`);
  return v;
}
function numList(p: Rec, key: string, where: string): number[] {
  return list(p, key, where).map((x, i) => {
    if (typeof x !== 'number') throw new Error(`dependency-resolution: ${where}.${key}[${i}] 가 수가 아니다`);
    return x;
  });
}
function strList(p: Rec, key: string, where: string): string[] {
  return list(p, key, where).map((x, i) => {
    if (typeof x !== 'string') throw new Error(`dependency-resolution: ${where}.${key}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function readAxis(p: Rec): AxisPayload {
  const slots = rec(p.slots, 'axis.slots');
  return {
    ticks: strList(p, 'ticks', 'axis'),
    published: numList(p, 'published', 'axis'),
    root: str(p, 'root', 'axis'),
    callers: list(p, 'callers', 'axis').map((x) => {
      const r = rec(x, 'axis.callers[]');
      return { name: str(r, 'name', 'axis.callers[]'), version: str(r, 'version', 'axis.callers[]') };
    }),
    target: str(p, 'target', 'axis'),
    slots: { top: str(slots, 'top', 'axis.slots'), inner: str(slots, 'inner', 'axis.slots') },
  };
}

function readRound(p: Rec): RoundPayload {
  const solver = str(p, 'solver', 'round');
  if (solver !== 'nested' && solver !== 'single') throw new Error(`dependency-resolution: 모르는 해결기 '${solver}'`);
  const bands: BandPayload[] = list(p, 'bands', 'round').map((x) => {
    const b = rec(x, 'round.bands[]');
    return { from: str(b, 'from', 'round.bands[]'), range: str(b, 'range', 'round.bands[]'), lo: num(b, 'lo', 'round.bands[]'), hi: num(b, 'hi', 'round.bands[]') };
  });
  const o = p.overlap;
  const overlap = o === null ? null : (() => {
    const r = rec(o, 'round.overlap');
    return { lo: num(r, 'lo', 'round.overlap'), hi: num(r, 'hi', 'round.overlap') };
  })();
  return { solver, bands, overlap };
}

function readDone(p: Rec): DonePayload {
  return {
    copies: num(p, 'copies', 'done'),
    uses: list(p, 'uses', 'done').map((x) => {
      const u = rec(x, 'done.uses[]');
      const slot = str(u, 'slot', 'done.uses[]');
      if (slot !== 'top' && slot !== 'inner') throw new Error(`dependency-resolution: 모르는 자리 '${slot}'`);
      return { from: str(u, 'from', 'done.uses[]'), slot };
    }),
    shared: numList(p, 'shared', 'done'),
  };
}

export const dependencyResolutionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as (DependencyResolutionStage & { destroy(): void }) | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (stage === undefined) throw new Error('dependency-resolution: stage 블록이 없다');
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const moveMs = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? MOVE_MS / speed : MOVE_MS;
  };
  /** 운동이 끝날 때까지 기다린다 */
  const settle = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const id = setTimeout(() => {
        timers.delete(id);
        resolve();
      }, ms);
      timers.add(id);
    });

  return {
    async onEvent(event: FacetRuntimeEvent) {
      const where = event.type;
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase', 'phase'));
          return;
        }
        case 'axis':
          stage.setAxis(readAxis(rec(event.payload, where)));
          return;
        case 'round': {
          code?.highlightPhase(null);
          const ms = moveMs();
          stage.beginRound(readRound(rec(event.payload, where)), ms);
          await settle(ms);
          return;
        }
        case 'pick': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.pick({ version: str(p, 'version', where), tick: num(p, 'tick', where), by: str(p, 'by', where), range: str(p, 'range', where) }, ms);
          await settle(ms);
          return;
        }
        case 'check': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.check(
            { version: str(p, 'version', where), range: str(p, 'range', where), tick: num(p, 'tick', where), inside: bool(p, 'inside', where) },
            ms,
          );
          await settle(ms);
          return;
        }
        case 'reuse': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.reuse({ version: str(p, 'version', where), tick: num(p, 'tick', where) }, ms);
          await settle(ms);
          return;
        }
        case 'nest': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.nest({ version: str(p, 'version', where), tick: num(p, 'tick', where), range: str(p, 'range', where) }, ms);
          await settle(ms);
          return;
        }
        case 'shared-range': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.sharedRange(
            {
              lo: str(p, 'lo', where),
              hi: str(p, 'hi', where),
              loTick: num(p, 'loTick', where),
              hiTick: num(p, 'hiTick', where),
              empty: bool(p, 'empty', where),
            },
            ms,
          );
          await settle(ms);
          return;
        }
        case 'pick-shared': {
          const p = rec(event.payload, where);
          const ms = moveMs();
          stage.pickShared({ version: str(p, 'version', where), tick: num(p, 'tick', where) }, ms);
          await settle(ms);
          return;
        }
        case 'fail': {
          const p = rec(event.payload, where);
          const reason = str(p, 'reason', where);
          if (reason !== 'empty-range' && reason !== 'nothing-published') throw new Error(`dependency-resolution: 모르는 실패 까닭 '${reason}'`);
          const ms = moveMs();
          stage.fail({ reason }, ms);
          await settle(ms);
          return;
        }
        case 'done': {
          const ms = moveMs();
          stage.done(readDone(rec(event.payload, where)), ms);
          await settle(ms);
          return;
        }
        default:
          throw new Error(`dependency-resolution: 모르는 이벤트 '${event.type}'`);
      }
    },
    onReset() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      code?.highlightPhase(null);
      stage.clearRound();
    },
    onDestroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
};
