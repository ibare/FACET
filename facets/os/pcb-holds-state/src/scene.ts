import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * pcb-holds-state 의 장면.
 *
 * 바탕  slotCount · procs · fileCount — initialData 에서 한 번 정한다
 * 자취  tables · owner · openFiles · opened · exiting — 걸음이 쌓는다
 * 이번  step — 이번 걸음에 일어난 일 (그림이 무엇을 흐르게 할지 고르는 데 쓴다)
 *
 * 셈(빈 칸인가 · 무엇을 따라 거둘까 · 몇 줄을 따라갔나)은 알고리즘이 한다.
 * 장면은 이벤트를 잇기만 하고, 잇는 도중 표가 없거나 목록 맨 앞이 어긋나면 던진다.
 */

export type PcbEntry = { kind: 'slot'; slot: number } | { kind: 'file'; file: string };

export type PcbSceneTable = { pid: number; slots: number[]; files: string[] };

/** 커널의 열린 파일 한 줄. at = 연 차례 (자리) */
export type PcbOpenFile = { pid: number; file: string; at: number };

export type PcbStep =
  | { kind: 'grant'; pid: number; entry: PcbEntry }
  /**
   * was = 그 목록에서 빠지기 전의 자리. place = 닫힌 파일이 커널 열린 파일 줄에서 서 있던 자리
   * (칸이면 null — 칸 번호가 곧 자리). first = 끝난 뒤 첫 걸음인가
   */
  | { kind: 'release'; pid: number; entry: PcbEntry; was: number; place: number | null; first: boolean }
  | { kind: 'drop'; pid: number; followed: number; untouched: number };

export type PcbScene = {
  /** 바탕 */
  slotCount: number;
  procs: { pid: number; id: string }[];
  /** 받는 일 가운데 파일의 수 — 커널 열린 파일 줄의 자리 수 */
  fileCount: number;
  /** 자취 */
  tables: PcbSceneTable[];
  /** 칸마다 주인 번호 (비었으면 null) */
  owner: (number | null)[];
  openFiles: PcbOpenFile[];
  /** 지금까지 연 파일 수 — 다음 연 파일의 자리 */
  opened: number;
  /** 끝나서 표를 따라가는 중인 프로세스 */
  exiting: number | null;
  /** 이번 */
  step: PcbStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function emptyScene(): PcbScene {
  return {
    slotCount: 0,
    procs: [],
    fileCount: 0,
    tables: [],
    owner: [],
    openFiles: [],
    opened: 0,
    exiting: null,
    step: null,
  };
}

function readEntry(payload: Record<string, unknown>, type: string): PcbEntry {
  if (payload.kind === 'slot') {
    if (typeof payload.slot !== 'number') throw new Error(`pcb-holds-state: ${type} 의 slot 이 없다`);
    return { kind: 'slot', slot: payload.slot };
  }
  if (payload.kind === 'file') {
    if (typeof payload.file !== 'string') throw new Error(`pcb-holds-state: ${type} 의 file 이 없다`);
    return { kind: 'file', file: payload.file };
  }
  throw new Error(`pcb-holds-state: ${type} 의 kind 를 모른다 — ${String(payload.kind)}`);
}

function findTable(scene: PcbScene, pid: number): PcbSceneTable {
  const table = scene.tables.find((tb) => tb.pid === pid);
  if (table === undefined) throw new Error(`pcb-holds-state: 번호 ${pid} 의 표가 없다`);
  return table;
}

function copyTables(tables: PcbSceneTable[]): PcbSceneTable[] {
  return tables.map((tb) => ({ pid: tb.pid, slots: [...tb.slots], files: [...tb.files] }));
}

export const pcbHoldsStateScene: ScenePlan<PcbScene> = {
  initial(initialData: unknown): PcbScene {
    if (initialData === undefined || initialData === null) return emptyScene();
    if (!isRecord(initialData)) throw new Error('pcb-holds-state: initialData 가 객체가 아니다');
    const { slotCount, processes, grants } = initialData;
    if (typeof slotCount !== 'number' || !Number.isInteger(slotCount) || slotCount < 1) {
      throw new Error('pcb-holds-state: slotCount 가 양의 정수가 아니다');
    }
    if (!Array.isArray(processes) || !Array.isArray(grants)) {
      throw new Error('pcb-holds-state: processes · grants 가 배열이 아니다');
    }
    const procs = processes.map((p, i) => {
      if (!isRecord(p) || typeof p.pid !== 'number' || typeof p.id !== 'string') {
        throw new Error(`pcb-holds-state: processes[${i}] 의 모양이 틀렸다`);
      }
      return { pid: p.pid, id: p.id };
    });
    let fileCount = 0;
    for (const g of grants) if (isRecord(g) && g.kind === 'file') fileCount += 1;
    return {
      slotCount,
      procs,
      fileCount,
      tables: procs.map((p) => ({ pid: p.pid, slots: [], files: [] })),
      owner: Array.from({ length: slotCount }, () => null),
      openFiles: [],
      opened: 0,
      exiting: null,
      step: null,
    };
  },

  reduce(scene: PcbScene, event: FacetRuntimeEvent): PcbScene {
    const payload = event.payload;
    if (event.type === 'grant') {
      if (!isRecord(payload) || typeof payload.pid !== 'number') {
        throw new Error('pcb-holds-state: grant 의 pid 가 없다');
      }
      const pid = payload.pid;
      const entry = readEntry(payload, 'grant');
      const tables = copyTables(scene.tables);
      const table = findTable({ ...scene, tables }, pid);
      const owner = [...scene.owner];
      let openFiles = scene.openFiles.map((o) => ({ ...o }));
      let opened = scene.opened;
      if (entry.kind === 'slot') {
        if (entry.slot < 0 || entry.slot >= owner.length || owner[entry.slot] !== null) {
          throw new Error(`pcb-holds-state: 칸 ${entry.slot} 을 받을 수 없다`);
        }
        owner[entry.slot] = pid;
        table.slots.push(entry.slot);
      } else {
        openFiles = [...openFiles, { pid, file: entry.file, at: opened }];
        opened += 1;
        table.files.push(entry.file);
      }
      return { ...scene, tables, owner, openFiles, opened, step: { kind: 'grant', pid, entry } };
    }

    if (event.type === 'release') {
      if (!isRecord(payload) || typeof payload.pid !== 'number') {
        throw new Error('pcb-holds-state: release 의 pid 가 없다');
      }
      const pid = payload.pid;
      const entry = readEntry(payload, 'release');
      const tables = copyTables(scene.tables);
      const table = findTable({ ...scene, tables }, pid);
      const owner = [...scene.owner];
      let openFiles = scene.openFiles.map((o) => ({ ...o }));
      let was: number;
      let place: number | null = null;
      if (entry.kind === 'slot') {
        was = table.slots.indexOf(entry.slot);
        if (was < 0 || owner[entry.slot] !== pid) {
          throw new Error(`pcb-holds-state: 표 ${pid} 에 칸 ${entry.slot} 이 없다`);
        }
        table.slots.splice(was, 1);
        owner[entry.slot] = null;
      } else {
        was = table.files.indexOf(entry.file);
        const openAt = openFiles.findIndex((o) => o.pid === pid && o.file === entry.file);
        if (was < 0 || openAt < 0) {
          throw new Error(`pcb-holds-state: 표 ${pid} 에 ${entry.file} 가 없다`);
        }
        table.files.splice(was, 1);
        place = openFiles[openAt]?.at ?? null;
        if (place === null) throw new Error(`pcb-holds-state: ${entry.file} 의 자리가 없다`);
        openFiles = openFiles.filter((_, i) => i !== openAt);
      }
      const first = scene.exiting !== pid;
      return {
        ...scene,
        tables,
        owner,
        openFiles,
        exiting: pid,
        step: { kind: 'release', pid, entry, was, place, first },
      };
    }

    if (event.type === 'drop') {
      if (
        !isRecord(payload) ||
        typeof payload.pid !== 'number' ||
        typeof payload.followed !== 'number' ||
        typeof payload.untouched !== 'number'
      ) {
        throw new Error('pcb-holds-state: drop 의 모양이 틀렸다');
      }
      const pid = payload.pid;
      const table = findTable(scene, pid);
      if (table.slots.length > 0 || table.files.length > 0) {
        throw new Error(`pcb-holds-state: 표 ${pid} 가 아직 비지 않았다`);
      }
      return {
        ...scene,
        tables: copyTables(scene.tables.filter((tb) => tb.pid !== pid)),
        owner: [...scene.owner],
        openFiles: scene.openFiles.map((o) => ({ ...o })),
        exiting: null,
        step: { kind: 'drop', pid, followed: payload.followed, untouched: payload.untouched },
      };
    }

    throw new Error(`pcb-holds-state: 모르는 이벤트 — ${event.type}`);
  },
};
