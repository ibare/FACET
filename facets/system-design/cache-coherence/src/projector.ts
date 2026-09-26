/**
 * 캐시 일관성 projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * init → stage.setup (판 머리, 코드 패널 강조를 끈다)
 * phase → codePanel.highlightPhase
 * write · read → stage.write · stage.read (운동 길이 = motionMs ÷ 지금 재생 속도)
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { CoherenceRead, CoherenceSetup, CoherenceStage, CoherenceWrite } from './cache-coherence-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function fail(what: string): never {
  throw new Error(`cacheCoherenceProjector: ${what}`);
}

function obj(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) fail(`${type} payload 가 객체가 아니다`);
  return payload as Record<string, unknown>;
}

function int(p: Record<string, unknown>, name: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${name} 가 정수가 아니다`);
  return v;
}

function bool(p: Record<string, unknown>, name: string): boolean {
  const v = p[name];
  if (typeof v !== 'boolean') fail(`${name} 가 참거짓이 아니다`);
  return v;
}

function str(p: Record<string, unknown>, name: string): string {
  const v = p[name];
  if (typeof v !== 'string') fail(`${name} 가 문자열이 아니다`);
  return v;
}

function intList(p: Record<string, unknown>, name: string): number[] {
  const v = p[name];
  if (!Array.isArray(v)) fail(`${name} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${name}[${i}] 가 정수가 아니다`);
    return x;
  });
}

function strList(p: Record<string, unknown>, name: string): string[] {
  const v = p[name];
  if (!Array.isArray(v)) fail(`${name} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') fail(`${name}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function cacheList(p: Record<string, unknown>): (number | null)[] {
  const v = p.cache;
  if (!Array.isArray(v)) fail('cache 가 목록이 아니다');
  return v.map((x, i) => {
    if (x === null) return null;
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`cache[${i}] 가 정수도 빈 칸도 아니다`);
    return x;
  });
}

function carryOf(p: Record<string, unknown>): number | null {
  const v = p.carry;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) fail('carry 가 정수도 null 도 아니다');
  return v;
}

function readSetup(payload: unknown): CoherenceSetup & { motionMs: number } {
  const p = obj(payload, 'init');
  return {
    servers: strList(p, 'servers'),
    writer: int(p, 'writer'),
    readers: intList(p, 'readers'),
    key: str(p, 'key'),
    db: int(p, 'db'),
    cache: cacheList(p),
    run: int(p, 'run'),
    rounds: int(p, 'rounds'),
    tileAxis: int(p, 'tileAxis'),
    motionMs: int(p, 'motionMs'),
  };
}

function readWrite(payload: unknown): CoherenceWrite {
  const p = obj(payload, 'write');
  return {
    round: int(p, 'round'),
    index: int(p, 'index'),
    run: int(p, 'run'),
    writer: int(p, 'writer'),
    db: int(p, 'db'),
    targets: intList(p, 'targets'),
    carry: carryOf(p),
    cache: cacheList(p),
    messages: int(p, 'messages'),
    dbReads: int(p, 'dbReads'),
    staleReads: int(p, 'staleReads'),
  };
}

function readRead(payload: unknown): CoherenceRead {
  const p = obj(payload, 'read');
  return {
    round: int(p, 'round'),
    reader: int(p, 'reader'),
    value: int(p, 'value'),
    db: int(p, 'db'),
    refill: bool(p, 'refill'),
    stale: bool(p, 'stale'),
    cache: cacheList(p),
    messages: int(p, 'messages'),
    dbReads: int(p, 'dbReads'),
    staleReads: int(p, 'staleReads'),
  };
}

export const cacheCoherenceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CoherenceStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const need = (): CoherenceStage => {
    if (!stage) fail('stage 가 없다');
    return stage;
  };
  const duration = (): number => {
    if (motionMs === null) fail('init 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'init': {
          const s = readSetup(event.payload);
          motionMs = s.motionMs;
          need().setup(s);
          code?.highlightPhase(null);
          return;
        }
        case 'phase': {
          const phase = str(obj(event.payload, 'phase'), 'phase');
          code?.highlightPhase(phase);
          return;
        }
        case 'write':
          need().write(readWrite(event.payload), duration());
          return;
        case 'read':
          need().read(readRead(event.payload), duration());
          return;
        default:
          fail(`모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
