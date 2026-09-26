/**
 * resolveSymbols — 링커가 오브젝트 파일을 차례로 읽으며 빈 자리(U)를 같은 이름의 정의(D)로 메운다.
 *
 * 규약: 파일을 적힌 차례로, 파일 안에서는 항목을 적힌 차례로 읽는다. 한 항목 = 한 걸음.
 *  - `D s` — 정의 표에 s → 이 항목을 올린다 (이미 있으면 던진다 — 두 번 정의).
 *            기다림 목록에 s 를 찾는 자리가 있으면 그 자리들을 이 정의로 메우고 목록에서 뺀다.
 *  - `U s` — 정의 표에 s 가 있으면 곧바로 그 정의로 메운다. 없으면 기다림 목록 끝에 올린다.
 *  - 끝에 기다림이 남으면 던진다 (정의 없는 이름).
 * 주소는 셈하지 않는다 — 어느 파일의 어느 정의인지만 잇는다.
 *
 * 이벤트 (모두 silent 아님 — 한 이벤트가 한 걸음):
 *  - `define` payload `{ file: number; entry: number; name: string; filled: { file: number; entry: number }[] }`
 *      file · entry 는 이 D 항목의 자리(파일 차례 · 파일 안 항목 차례, 0 부터).
 *      filled 는 이 정의로 메운, 기다리던 U 자리들 (기다림 목록 차례).
 *  - `use` payload `{ file: number; entry: number; name: string; def: { file: number; entry: number } | null }`
 *      def 가 있으면 이미 표에 있던 정의로 곧바로 메웠다. null 이면 기다림 목록 끝에 올렸다.
 *
 * ctx.metric 은 부르지 않는다 (조각).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 오브젝트 파일 항목 — `D` 이 파일이 정의한다 · `U` 이 파일이 쓰지만 정의하지 않는다(빈 자리). */
export interface SymbolEntry {
  readonly kind: 'D' | 'U';
  readonly name: string;
}

export interface ObjectFile {
  readonly name: string;
  readonly entries: readonly SymbolEntry[];
}

export interface ResolveSymbolsFacetData {
  readonly type: 'resolve-symbols';
  readonly stepMs: number;
  readonly files: readonly ObjectFile[];
}

/** 항목의 자리 — 파일 차례와 파일 안 항목 차례. */
export interface EntryRef {
  readonly file: number;
  readonly entry: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readEntry(raw: unknown, where: string): SymbolEntry {
  if (!isRecord(raw)) throw new Error(`resolve-symbols: ${where} 항목이 객체가 아니다`);
  const { kind, name } = raw;
  if (kind !== 'D' && kind !== 'U') throw new Error(`resolve-symbols: ${where} 모르는 항목 종류 ${String(kind)}`);
  if (typeof name !== 'string' || name === '') throw new Error(`resolve-symbols: ${where} 이름이 없다`);
  return { kind, name };
}

/** 오브젝트 파일 목록을 좁힌다. 모양이 틀리면 던진다 — 장면과 그림이 같은 좁히개를 쓴다. */
export function readObjectFiles(raw: unknown): ObjectFile[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('resolve-symbols: files 가 비었거나 배열이 아니다');
  return raw.map((f: unknown, fi): ObjectFile => {
    if (!isRecord(f)) throw new Error(`resolve-symbols: 파일 ${fi} 가 객체가 아니다`);
    const { name, entries } = f;
    if (typeof name !== 'string' || name === '') throw new Error(`resolve-symbols: 파일 ${fi} 이름이 없다`);
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`resolve-symbols: ${name} 항목이 없다`);
    return { name, entries: entries.map((e: unknown, ei) => readEntry(e, `${name} #${ei}`)) };
  });
}

export function readResolveSymbolsData(raw: unknown): ResolveSymbolsFacetData {
  if (!isRecord(raw)) throw new Error('resolve-symbols: initialData 가 객체가 아니다');
  if (raw['type'] !== 'resolve-symbols') throw new Error(`resolve-symbols: type 이 다르다 (${String(raw['type'])})`);
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('resolve-symbols: stepMs 가 양수가 아니다');
  }
  return { type: 'resolve-symbols', stepMs, files: readObjectFiles(raw['files']) };
}

/** 빈 자리(U 항목)의 총수 — 바탕에서 정해지는 셈이라 장면 · 그림이 이 함수를 부른다. */
export function countHoles(files: readonly ObjectFile[]): number {
  let n = 0;
  for (const f of files) for (const e of f.entries) if (e.kind === 'U') n += 1;
  return n;
}

export async function resolveSymbols(ctx: FacetContext<ResolveSymbolsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ResolveSymbolsFacetData>;
  const data = readResolveSymbolsData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  /** 정의 표 — 이름 → 그 이름을 정의한 항목. */
  const table = new Map<string, EntryRef>();
  /** 기다림 목록 — 정의를 아직 못 찾은 빈 자리, 올린 차례. */
  let waiting: { ref: EntryRef; name: string }[] = [];

  // 링커가 읽는 차례 — 파일 차례, 파일 안에서는 항목 차례. 데이터 순회의 결과다
  const order = data.files.flatMap((file, fi) =>
    file.entries.map((entry, ei) => ({ file, entry, here: { file: fi, entry: ei } as EntryRef })),
  );

  for (const { file, entry, here } of order) {
    // 걸음 0(파일 전체가 보이는 처음 화면)을 읽을 틈을 주려고 문이 발신보다 앞에 선다
    if (!(await pause())) return;
    if (entry.kind === 'D') {
      const already = table.get(entry.name);
      if (already !== undefined) {
        const first = data.files[already.file];
        throw new Error(
          `resolve-symbols: ${entry.name} 두 번 정의 (${first === undefined ? already.file : first.name} · ${file.name})`,
        );
      }
      table.set(entry.name, here);
      const filled = waiting.filter((w) => w.name === entry.name).map((w) => w.ref);
      waiting = waiting.filter((w) => w.name !== entry.name);
      await rctx.emit({ type: 'define', payload: { file: here.file, entry: here.entry, name: entry.name, filled } });
    } else if (entry.kind === 'U') {
      const found = table.get(entry.name);
      const def = found === undefined ? null : found;
      if (def === null) waiting.push({ ref: here, name: entry.name });
      await rctx.emit({ type: 'use', payload: { file: here.file, entry: here.entry, name: entry.name, def } });
    } else {
      throw new Error(`resolve-symbols: ${file.name} #${here.entry} 모르는 항목 종류`);
    }
  }

  if (waiting.length > 0) {
    throw new Error(`resolve-symbols: 정의 없는 이름 ${waiting.map((w) => w.name).join(', ')}`);
  }
}
