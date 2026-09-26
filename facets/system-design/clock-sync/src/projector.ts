/**
 * clock-sync projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 *   phase          → 코드 패널 highlightPhase
 *   clock-init     → stage.init (판 머리 · 걸음 0) — 코드 패널 강조를 끈다
 *   clock-send     → stage.send
 *   clock-receive  → stage.receive
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다. payload 는 typeof 로 좁히고 없는 값은 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { CLOCK_SYNC_MOTION_MS } from './algorithm.js';
import type {
  ClockAxesView,
  ClockInitView,
  ClockReceiveView,
  ClockSendView,
  ClockSyncStage,
} from './clock-sync-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`clock-sync projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`clock-sync projector: ${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`clock-sync projector: ${key} 가 글자가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`clock-sync projector: ${key} 가 참거짓이 아니다`);
  return v;
}

function nums(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`clock-sync projector: ${what} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`clock-sync projector: ${what}[${i}] 가 수가 아니다`);
    return x;
  });
}

function rows(v: unknown, what: string): number[][] {
  if (!Array.isArray(v)) throw new Error(`clock-sync projector: ${what} 가 목록이 아니다`);
  return v.map((r, i) => nums(r, `${what}[${i}]`));
}

function readInit(p: unknown): ClockInitView {
  const o = obj(p, 'clock-init payload');
  const procs = o.processes;
  if (!Array.isArray(procs)) throw new Error('clock-sync projector: processes 가 목록이 아니다');
  const processes = procs.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`clock-sync projector: processes[${i}] 가 글자가 아니다`);
    return x;
  });
  const ms = o.messages;
  if (!Array.isArray(ms)) throw new Error('clock-sync projector: messages 가 목록이 아니다');
  const messages = ms.map((m, i) => {
    const q = obj(m, `messages[${i}]`);
    return { id: str(q, 'id'), src: num(q, 'src'), dst: num(q, 'dst') };
  });
  const a = obj(o.axes, 'axes');
  const axes: ClockAxesView = {
    offMin: num(a, 'offMin'),
    offMax: num(a, 'offMax'),
    relMin: num(a, 'relMin'),
    relMax: num(a, 'relMax'),
    lamportMax: num(a, 'lamportMax'),
  };
  return {
    drift: num(o, 'drift'),
    resync: num(o, 'resync'),
    lastMinute: num(o, 'lastMinute'),
    processes,
    messages,
    before: rows(o.before, 'before'),
    after: rows(o.after, 'after'),
    resyncMinutes: nums(o.resyncMinutes, 'resyncMinutes'),
    offsets: nums(o.offsets, 'offsets'),
    axes,
  };
}

function readSend(p: unknown): ClockSendView {
  const o = obj(p, 'clock-send payload');
  return {
    index: num(o, 'index'),
    id: str(o, 'id'),
    minute: num(o, 'minute'),
    src: num(o, 'src'),
    dst: num(o, 'dst'),
    rel: num(o, 'rel'),
    lamport: num(o, 'lamport'),
    offsets: nums(o.offsets, 'offsets'),
    skew: num(o, 'skew'),
    hi: num(o, 'hi'),
    lo: num(o, 'lo'),
  };
}

function readReceive(p: unknown): ClockReceiveView {
  const o = obj(p, 'clock-receive payload');
  return {
    index: num(o, 'index'),
    id: str(o, 'id'),
    minute: num(o, 'minute'),
    src: num(o, 'src'),
    dst: num(o, 'dst'),
    rel: num(o, 'rel'),
    sendRel: num(o, 'sendRel'),
    diff: num(o, 'diff'),
    lamportSend: num(o, 'lamportSend'),
    lamportRecv: num(o, 'lamportRecv'),
    inverted: bool(o, 'inverted'),
  };
}

export const clockSyncProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ClockSyncStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return speed > 0 ? CLOCK_SYNC_MOTION_MS / speed : CLOCK_SYNC_MOTION_MS;
  };
  const board = (): ClockSyncStage => {
    if (!stage) throw new Error('clock-sync projector: stage 블록이 없다');
    return stage;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const o = obj(event.payload, 'phase payload');
          code?.highlightPhase?.(str(o, 'phase'));
          return;
        }
        case 'clock-init':
          code?.highlightPhase?.(null);
          board().init(readInit(event.payload), motion());
          return;
        case 'clock-send':
          board().send(readSend(event.payload), motion());
          return;
        case 'clock-receive':
          board().receive(readReceive(event.payload), motion());
          return;
        default:
          throw new Error(`clock-sync projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
  };
};
