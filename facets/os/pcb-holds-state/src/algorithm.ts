/**
 * pcb-holds-state — 프로세스가 받은 것은 그 표에 적히고, 끝날 때 그 표만 따라가 거둬들인다.
 *
 * 규약 (사양에서 옮김 — 하나라도 다르면 걸음 수와 차례가 달라진다)
 *   - 받기: 칸이면 빈 칸 모음에서 빼서 그 표의 칸 목록 끝에, 파일이면 그 표의 파일 목록 끝에 적는다.
 *     이미 쓰이는 칸을 받으려 하면 · 없는 번호의 표에 적으려 하면 던진다.
 *   - 끝: 커널은 끝난 프로세스의 표만 읽는다. 칸 목록을 적힌 차례로 하나씩 돌려받고(빈 칸 모음으로),
 *     그다음 파일 목록을 적힌 차례로 하나씩 닫는다. 목록이 다 비면 표를 지운다.
 *     (부모가 끝난 값을 거둘 때까지 표가 남는 일은 다루지 않는다 — 끝나면 바로 지운다)
 *   - 한 걸음 = 받기 하나 · 돌려받기 하나 · 표 지우기 하나. 걸음 0 = 빈 표들과 빈 칸 열.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 *   grant    payload { pid: number; kind: 'slot'; slot: number }
 *                 | { pid: number; kind: 'file'; file: string }
 *            프로세스 pid 가 칸 하나 또는 파일 하나를 받아 그 표 목록 끝에 적혔다.
 *   release  payload { pid: number; kind: 'slot'; slot: number }
 *                 | { pid: number; kind: 'file'; file: string }
 *            끝난 프로세스 pid 의 표 맨 앞 줄을 따라가 칸을 돌려받았거나 파일을 닫았다.
 *   drop     payload { pid: number; followed: number; untouched: number }
 *            pid 의 표가 비어 지웠다. followed = 그 표를 따라 거둔 줄 수,
 *            untouched = 남은 다른 표들에 적힌 줄 수 (건드리지 않은 것).
 *
 * ctx.metric 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PcbGrant =
  | { pid: number; kind: 'slot'; slot: number }
  | { pid: number; kind: 'file'; file: string };

export type PcbProcess = { pid: number; id: string };

export type PcbHoldsStateFacetData = {
  type: 'pcb-holds-state';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 메모리 칸 수 (0 부터 번호) */
  slotCount: number;
  /** 표를 가진 프로세스 — 번호와 식별자. 표시 이름은 messages 의 label.proc.* */
  processes: PcbProcess[];
  /** 받는 일 — 이 차례로 */
  grants: PcbGrant[];
  /** 받는 일을 다 한 뒤 끝나는 프로세스 번호 */
  exit: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readGrant(raw: unknown, at: number): PcbGrant {
  if (!isRecord(raw) || typeof raw.pid !== 'number') {
    throw new Error(`pcb-holds-state: grants[${at}] 에 pid 가 없다`);
  }
  if (raw.kind === 'slot') {
    if (typeof raw.slot !== 'number' || !Number.isInteger(raw.slot)) {
      throw new Error(`pcb-holds-state: grants[${at}] 의 slot 이 정수가 아니다`);
    }
    return { pid: raw.pid, kind: 'slot', slot: raw.slot };
  }
  if (raw.kind === 'file') {
    if (typeof raw.file !== 'string' || raw.file === '') {
      throw new Error(`pcb-holds-state: grants[${at}] 의 file 이 비었다`);
    }
    return { pid: raw.pid, kind: 'file', file: raw.file };
  }
  throw new Error(`pcb-holds-state: grants[${at}] 의 kind 를 모른다 — ${String(raw.kind)}`);
}

function readData(raw: unknown): PcbHoldsStateFacetData {
  if (!isRecord(raw)) throw new Error('pcb-holds-state: 자료가 없다');
  const { stepMs, slotCount, processes, grants, exit } = raw;
  if (typeof stepMs !== 'number') throw new Error('pcb-holds-state: stepMs 가 없다');
  if (typeof slotCount !== 'number' || !Number.isInteger(slotCount) || slotCount < 1) {
    throw new Error('pcb-holds-state: slotCount 가 양의 정수가 아니다');
  }
  if (!Array.isArray(processes)) throw new Error('pcb-holds-state: processes 가 배열이 아니다');
  if (!Array.isArray(grants)) throw new Error('pcb-holds-state: grants 가 배열이 아니다');
  if (typeof exit !== 'number') throw new Error('pcb-holds-state: exit 가 없다');
  const procs = processes.map((p, i): PcbProcess => {
    if (!isRecord(p) || typeof p.pid !== 'number' || typeof p.id !== 'string') {
      throw new Error(`pcb-holds-state: processes[${i}] 의 모양이 틀렸다`);
    }
    return { pid: p.pid, id: p.id };
  });
  return {
    type: 'pcb-holds-state',
    stepMs,
    slotCount,
    processes: procs,
    grants: grants.map((g, i) => readGrant(g, i)),
    exit,
  };
}

type Table = { slots: number[]; files: string[] };

export async function pcbHoldsState(ctxBase: FacetContext<PcbHoldsStateFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PcbHoldsStateFacetData>;
  const data = readData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const tables = new Map<number, Table>();
  for (const p of data.processes) {
    if (tables.has(p.pid)) throw new Error(`pcb-holds-state: 표 ${p.pid} 가 둘이다`);
    tables.set(p.pid, { slots: [], files: [] });
  }
  const free = new Set<number>();
  for (let i = 0; i < data.slotCount; i += 1) free.add(i);
  /** 커널 전체의 열린 파일 — 누가 열었는지와 함께 */
  const open: { pid: number; file: string }[] = [];

  // 받기 — 걸음 0 (빈 표들) 이 이미 읽을 화면이라 첫 발신 앞에도 문을 둔다
  for (const g of data.grants) {
    if (!(await pause())) return;
    const table = tables.get(g.pid);
    if (table === undefined) throw new Error(`pcb-holds-state: 번호 ${g.pid} 의 표가 없다`);
    if (g.kind === 'slot') {
      if (!free.has(g.slot)) throw new Error(`pcb-holds-state: 칸 ${g.slot} 은 비어 있지 않다`);
      free.delete(g.slot);
      table.slots.push(g.slot);
      await ctx.emit({ type: 'grant', payload: { pid: g.pid, kind: 'slot', slot: g.slot } });
    } else {
      if (open.some((o) => o.pid === g.pid && o.file === g.file)) {
        throw new Error(`pcb-holds-state: ${g.pid} 가 ${g.file} 를 이미 열었다`);
      }
      open.push({ pid: g.pid, file: g.file });
      table.files.push(g.file);
      await ctx.emit({ type: 'grant', payload: { pid: g.pid, kind: 'file', file: g.file } });
    }
  }

  // 끝 — 커널은 끝난 프로세스의 표 한 장만 읽는다
  const pid = data.exit;
  const dying = tables.get(pid);
  if (dying === undefined) throw new Error(`pcb-holds-state: 끝날 표 ${pid} 가 없다`);
  let followed = 0;

  while (dying.slots.length > 0) {
    if (!(await pause())) return;
    const slot = dying.slots.shift();
    if (slot === undefined) throw new Error('pcb-holds-state: 칸 목록이 비었다');
    if (free.has(slot)) throw new Error(`pcb-holds-state: 칸 ${slot} 은 이미 비어 있다`);
    free.add(slot);
    followed += 1;
    await ctx.emit({ type: 'release', payload: { pid, kind: 'slot', slot } });
  }

  while (dying.files.length > 0) {
    if (!(await pause())) return;
    const file = dying.files.shift();
    if (file === undefined) throw new Error('pcb-holds-state: 파일 목록이 비었다');
    const at = open.findIndex((o) => o.pid === pid && o.file === file);
    if (at < 0) throw new Error(`pcb-holds-state: ${pid} 의 ${file} 가 열린 파일에 없다`);
    open.splice(at, 1);
    followed += 1;
    await ctx.emit({ type: 'release', payload: { pid, kind: 'file', file } });
  }

  if (!(await pause())) return;
  tables.delete(pid);
  let untouched = 0;
  for (const rest of tables.values()) untouched += rest.slots.length + rest.files.length;
  await ctx.emit({ type: 'drop', payload: { pid, followed, untouched } });
}
