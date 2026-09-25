/**
 * virtual-memory projector — 'run-start' · 'chunk' 을 stage 메서드로 옮긴다.
 * 운동 길이는 부를 때마다 runtime.getSpeed() 를 읽어 정한다 (재생 속도를 따라간다).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

export type StageCpuTick = { kind: 'run' | 'fault' | 'idle'; proc: number };
export type StageLoad = { tick: number; frame: number; proc: number; page: number; evictedProc: number; evictedPage: number };

export type StageRunStart = {
  procCount: number;
  workingSet: number;
  frames: number;
  ticks: number;
  chunkTicks: number;
  processes: string[];
  ladder: number[];
  curve: number[];
  caption: string;
  ms: number;
};

export type StageChunk = {
  from: number;
  to: number;
  cpu: StageCpuTick[];
  disk: number[];
  loads: StageLoad[];
  usePct: number;
  caption: string;
  ms: number;
};

/** stage 가 여는 구조적 표면 (C9). */
export type VirtualMemoryStage = {
  startRun(p: StageRunStart): void;
  playChunk(p: StageChunk): void;
  clear(): void;
};

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`virtual-memory projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function int(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`virtual-memory projector: ${key} 가 정수가 아니다 (${String(v)})`);
  return v;
}

function ints(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`virtual-memory projector: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`virtual-memory projector: ${key}[${i}] 가 정수가 아니다`);
    return x;
  });
}

function strs(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`virtual-memory projector: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`virtual-memory projector: ${key}[${i}] 가 글자가 아니다`);
    return x;
  });
}

function cpuTicks(o: Record<string, unknown>): StageCpuTick[] {
  const v = o.cpu;
  if (!Array.isArray(v)) throw new Error('virtual-memory projector: cpu 가 배열이 아니다');
  return v.map((x, i) => {
    const c = obj(x, `cpu[${i}]`);
    const kind = c.kind;
    if (kind !== 'run' && kind !== 'fault' && kind !== 'idle') throw new Error(`virtual-memory projector: cpu[${i}].kind 를 모른다 (${String(kind)})`);
    return { kind, proc: int(c, 'proc') };
  });
}

function frameLoads(o: Record<string, unknown>): StageLoad[] {
  const v = o.loads;
  if (!Array.isArray(v)) throw new Error('virtual-memory projector: loads 가 배열이 아니다');
  return v.map((x, i) => {
    const l = obj(x, `loads[${i}]`);
    return {
      tick: int(l, 'tick'),
      frame: int(l, 'frame'),
      proc: int(l, 'proc'),
      page: int(l, 'page'),
      evictedProc: int(l, 'evictedProc'),
      evictedPage: int(l, 'evictedPage'),
    };
  });
}

export const virtualMemoryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as VirtualMemoryStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  /** 속도 1 에서의 운동 길이 — onInit 이 initialData.motionMs 에서 받는다. */
  let motion = -1;

  const ms = (): number => {
    if (!(motion > 0)) throw new Error('virtual-memory projector: motionMs 를 initialData 에서 받지 못했다');
    const speed = runtime?.getSpeed() ?? 1;
    return motion / Math.max(0.01, speed);
  };

  return {
    onInit(initialData) {
      const d = obj(initialData, 'initialData');
      motion = int(d, 'motionMs');
    },
    onEvent(e) {
      if (!stage) return;
      if (e.type === 'run-start') {
        const p = obj(e.payload, 'run-start payload');
        const procCount = int(p, 'procCount');
        const workingSet = int(p, 'workingSet');
        const frames = int(p, 'frames');
        stage.startRun({
          procCount,
          workingSet,
          frames,
          ticks: int(p, 'ticks'),
          chunkTicks: int(p, 'chunkTicks'),
          processes: strs(p, 'processes'),
          ladder: ints(p, 'ladder'),
          curve: ints(p, 'curve'),
          caption: t('caption.start', 'Processes: {procs} · Working set: {ws} · Total: {sum} · Frames: {frames}', {
            procs: procCount,
            ws: workingSet,
            sum: procCount * workingSet,
            frames,
          }),
          ms: ms(),
        });
        return;
      }
      if (e.type === 'chunk') {
        const p = obj(e.payload, 'chunk payload');
        const from = int(p, 'from');
        const to = int(p, 'to');
        stage.playChunk({
          from,
          to,
          cpu: cpuTicks(p),
          disk: ints(p, 'disk'),
          loads: frameLoads(p),
          usePct: int(p, 'usePct'),
          caption: t('caption.chunk', 'Ticks: {from}–{to} · Useful ticks: {useful} · Faults: {faults} · Evicted: {evicted} · Disk queue: {queue}', {
            from,
            to,
            useful: int(p, 'useful'),
            faults: int(p, 'faults'),
            evicted: int(p, 'evicted'),
            queue: int(p, 'queue'),
          }),
          ms: ms(),
        });
        return;
      }
      throw new Error(`virtual-memory projector: 모르는 이벤트 '${e.type}'`);
    },
    onReset() {
      stage?.clear();
    },
  };
};
