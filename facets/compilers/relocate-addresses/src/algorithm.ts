/**
 * relocate-addresses — 파일마다 0 부터 센 주소를 이어 붙인 뒤 맞춘다 (재배치).
 *
 * 규약 (사양):
 *  - 놓기: text 절을 파일 차례로 textBase 부터 이어 붙이고, 이어서 data 절을 파일 차례로 dataBase 부터.
 *    절 하나 = 한 걸음. 명령 하나는 instrBytes 바이트, data 절의 크기는 항목 크기의 합.
 *  - 심볼 주소 S = 제 절이 놓인 자리 + 절 안 자리.
 *  - 고치기: 재배치 항목을 파일 차례 · 항목 차례로, 항목 하나 = 한 걸음.
 *    P = 고칠 명령의 주소 (그 파일 text 가 놓인 자리 + 항목 자리). ABS 칸 = S · REL 칸 = S − P.
 *  - 주소 칸이 있는 명령과 재배치 항목은 하나씩 짝이 맞아야 한다. 어긋나면 던진다 (C6).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *  - `place`  { file: string; section: 'text' | 'data'; at: number; size: number;
 *               symbols: { name: string; address: number }[] }
 *      절 하나가 at 부터 size 바이트 자리에 놓였다. symbols 는 이 절에 정의된 심볼과 그 주소 S.
 *  - `fix`    { file: string; offset: number; symbol: string; kind: 'ABS' | 'REL';
 *               s: number; p: number; value: number }
 *      file 의 text 절 offset 자리 명령의 주소 칸이 0 에서 value 로 고쳐 적혔다.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (init 이벤트 없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RelocKind = 'ABS' | 'REL';
export type SectionName = 'text' | 'data';

/** 명령 구조. addr 가 참이면 주소 칸이 하나 있다 (load 는 읽는 자리, store 는 쓰는 자리, call 은 뛸 곳). */
export type Instr = {
  op: 'load' | 'store' | 'call' | 'add' | 'sub' | 'mul' | 'ret';
  dst: string | null;
  srcs: string[];
  addr: boolean;
};

export type DataItem = { name: string; size: number };
export type SymbolDef = { name: string; section: SectionName; offset: number };
export type Reloc = { offset: number; symbol: string; kind: RelocKind };

export type ObjFile = {
  name: string;
  text: Instr[];
  data: DataItem[];
  symbols: SymbolDef[];
  relocs: Reloc[];
};

export type RelocateAddressesFacetData = {
  type: 'relocate-addresses';
  stepMs: number;
  instrBytes: number;
  textBase: number;
  dataBase: number;
  files: ObjFile[];
};

// ─── 좁히개 (algorithm · scene 이 함께 쓴다) ───

function fail(msg: string): never {
  throw new Error(`relocate-addresses: ${msg}`);
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${where} 는 객체여야 한다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') fail(`${where} 는 빈 칸 아닌 글자여야 한다`);
  return v;
}

function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${where} 는 0 이상의 정수여야 한다`);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(`${where} 는 배열이어야 한다`);
  return v;
}

const OPS: readonly Instr['op'][] = ['load', 'store', 'call', 'add', 'sub', 'mul', 'ret'];

function readInstr(v: unknown, where: string): Instr {
  const o = rec(v, where);
  const op = o.op;
  if (typeof op !== 'string' || !(OPS as readonly string[]).includes(op)) fail(`${where}: 모르는 명령 ${String(op)}`);
  const dst = o.dst === null ? null : str(o.dst, `${where}.dst`);
  const srcs = list(o.srcs, `${where}.srcs`).map((s, k) => str(s, `${where}.srcs[${k}]`));
  if (typeof o.addr !== 'boolean') fail(`${where}.addr 는 참 · 거짓이어야 한다`);
  const ins: Instr = { op: op as Instr['op'], dst, srcs, addr: o.addr };
  instrParts(ins, where); // 모양이 맞는지 여기서 확인한다
  return ins;
}

function readKind(v: unknown, where: string): RelocKind {
  if (v === 'ABS' || v === 'REL') return v;
  fail(`${where}: 모르는 재배치 종류 ${String(v)}`);
}

function readSection(v: unknown, where: string): SectionName {
  if (v === 'text' || v === 'data') return v;
  fail(`${where}: 모르는 절 ${String(v)}`);
}

/** initialData 를 좁힌다. 모르는 모양 · 어긋난 짝은 던진다. 값을 베껴 돌려준다. */
export function readRelocData(raw: unknown): RelocateAddressesFacetData {
  const o = rec(raw, 'initialData');
  if (o.type !== 'relocate-addresses') fail(`initialData.type 이 다르다: ${String(o.type)}`);
  const stepMs = int(o.stepMs, 'stepMs');
  const instrBytes = int(o.instrBytes, 'instrBytes');
  if (instrBytes === 0) fail('instrBytes 는 0 일 수 없다');
  const textBase = int(o.textBase, 'textBase');
  const dataBase = int(o.dataBase, 'dataBase');
  const files = list(o.files, 'files').map((fv, fi): ObjFile => {
    const f = rec(fv, `files[${fi}]`);
    const name = str(f.name, `files[${fi}].name`);
    const text = list(f.text, `${name}.text`).map((iv, k) => readInstr(iv, `${name}.text[${k}]`));
    const data = list(f.data, `${name}.data`).map((dv, k): DataItem => {
      const d = rec(dv, `${name}.data[${k}]`);
      const size = int(d.size, `${name}.data[${k}].size`);
      if (size === 0) fail(`${name}.data[${k}] 의 크기가 0 이다`);
      return { name: str(d.name, `${name}.data[${k}].name`), size };
    });
    const symbols = list(f.symbols, `${name}.symbols`).map((sv, k): SymbolDef => {
      const s = rec(sv, `${name}.symbols[${k}]`);
      return {
        name: str(s.name, `${name}.symbols[${k}].name`),
        section: readSection(s.section, `${name}.symbols[${k}].section`),
        offset: int(s.offset, `${name}.symbols[${k}].offset`),
      };
    });
    const relocs = list(f.relocs, `${name}.relocs`).map((rv, k): Reloc => {
      const r = rec(rv, `${name}.relocs[${k}]`);
      return {
        offset: int(r.offset, `${name}.relocs[${k}].offset`),
        symbol: str(r.symbol, `${name}.relocs[${k}].symbol`),
        kind: readKind(r.kind, `${name}.relocs[${k}].kind`),
      };
    });
    return { name, text, data, symbols, relocs };
  });
  if (files.length === 0) fail('files 가 비었다');
  const data: RelocateAddressesFacetData = { type: 'relocate-addresses', stepMs, instrBytes, textBase, dataBase, files };
  // 짝 맞추기 — 주소 칸이 있는 명령마다 항목 하나, 항목마다 주소 칸 하나
  for (const f of files) {
    for (let k = 0; k < f.text.length; k += 1) {
      const ins = f.text[k] as Instr;
      const r = relocAt(f, k * instrBytes);
      if (ins.addr !== (r !== null)) fail(`${f.name}+${k * instrBytes}: 주소 칸과 재배치 항목이 어긋난다`);
    }
    for (const r of f.relocs) {
      if (r.offset % instrBytes !== 0 || r.offset / instrBytes >= f.text.length) {
        fail(`${f.name}+${r.offset}: 재배치 항목이 명령 자리에 없다`);
      }
    }
    for (const s of f.symbols) {
      const size = sectionSize(data, f, s.section);
      if (s.offset >= size) fail(`${f.name} 의 심볼 ${s.name}: 절 밖 자리 +${s.offset}`);
    }
  }
  return data;
}

// ─── 공용 셈 (algorithm · scene · stage 가 같은 함수를 부른다) ───

/** 절의 바이트 수. */
export function sectionSize(d: RelocateAddressesFacetData, f: ObjFile, section: SectionName): number {
  if (section === 'text') return f.text.length * d.instrBytes;
  let n = 0;
  for (const item of f.data) n += item.size;
  return n;
}

/** 파일의 offset 자리 재배치 항목. 없으면 null. 둘이면 던진다. */
export function relocAt(f: ObjFile, offset: number): Reloc | null {
  const found = f.relocs.filter((r) => r.offset === offset);
  if (found.length > 1) fail(`${f.name}+${offset}: 재배치 항목이 둘이다`);
  return found[0] ?? null;
}

/** 주소 칸 글자 — 절대는 `@주소`, 상대는 부호 붙인 거리. */
export function fieldText(kind: RelocKind, value: number): string {
  if (kind === 'ABS') return `@${value}`;
  return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * 명령 글자를 주소 칸 앞 · 칸 · 뒤로 나눠 찍는다. field 는 칸에 넣을 글자
 * (주소 칸이 없는 명령이면 무시). 칸이 없는 명령의 field 자리는 null.
 */
export function instrParts(
  ins: Instr,
  where: string,
  field = '@0',
): { pre: string; field: string | null; post: string } {
  const need = (cond: boolean, what: string): void => {
    if (!cond) fail(`${where}: ${ins.op} 명령의 모양이 다르다 (${what})`);
  };
  switch (ins.op) {
    case 'load':
      need(ins.addr && ins.dst !== null && ins.srcs.length === 0, 'load 레지스터, 주소');
      return { pre: `load ${ins.dst as string}, `, field, post: '' };
    case 'store':
      need(ins.addr && ins.dst === null && ins.srcs.length === 1, 'store 주소, 레지스터');
      return { pre: 'store ', field, post: `, ${ins.srcs[0] as string}` };
    case 'call':
      need(ins.addr && ins.dst === null && ins.srcs.length === 0, 'call 주소');
      return { pre: 'call ', field, post: '' };
    case 'add':
    case 'sub':
    case 'mul':
      need(!ins.addr && ins.dst !== null && ins.srcs.length === 2, `${ins.op} 레지스터, 레지스터, 레지스터`);
      return { pre: `${ins.op} ${ins.dst as string}, ${ins.srcs[0] as string}, ${ins.srcs[1] as string}`, field: null, post: '' };
    case 'ret':
      need(!ins.addr && ins.dst === null && ins.srcs.length === 0, 'ret');
      return { pre: 'ret', field: null, post: '' };
  }
}

// ─── 알고리즘 ───

export async function relocateAddresses(context: FacetContext<RelocateAddressesFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RelocateAddressesFacetData>;
  const d = readRelocData(ctx.data);
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 두 파일 전체가 이미 보이는 화면이다 — 읽을 틈을 준다
  if (!(await pause())) return;

  // 놓기 — text 절을 파일 차례로, 이어서 data 절을 파일 차례로
  const placed = new Map<string, number>(); // `${file}:${section}` → 놓인 자리
  const symAddr = new Map<string, number>(); // 심볼 → S
  const order: { section: SectionName; base: number }[] = [
    { section: 'text', base: d.textBase },
    { section: 'data', base: d.dataBase },
  ];
  let first = true;
  for (const { section, base } of order) {
    if (ctx.cancelled) return;
    let at = base;
    for (const f of d.files) {
      if (ctx.cancelled) return;
      if (!first && !(await pause())) return;
      first = false;
      const size = sectionSize(d, f, section);
      placed.set(`${f.name}:${section}`, at);
      const symbols: { name: string; address: number }[] = [];
      for (const s of f.symbols.filter((sym) => sym.section === section)) {
        if (symAddr.has(s.name)) fail(`심볼 ${s.name} 이 두 번 정의됐다`);
        const address = at + s.offset;
        symAddr.set(s.name, address);
        symbols.push({ name: s.name, address });
      }
      await ctx.emit({ type: 'place', payload: { file: f.name, section, at, size, symbols } });
      at += size;
    }
  }

  // 고치기 — 재배치 항목을 파일 차례 · 항목 차례로
  for (const f of d.files) {
    if (ctx.cancelled) return;
    const textAt = placed.get(`${f.name}:text`);
    if (textAt === undefined) fail(`${f.name} text 가 놓이지 않았다`);
    for (const r of f.relocs) {
      if (!(await pause())) return;
      const s = symAddr.get(r.symbol);
      if (s === undefined) fail(`${f.name}+${r.offset}: 심볼 ${r.symbol} 의 주소를 모른다`);
      const p = textAt + r.offset;
      const value = r.kind === 'ABS' ? s : s - p;
      await ctx.emit({
        type: 'fix',
        payload: { file: f.name, offset: r.offset, symbol: r.symbol, kind: r.kind, s, p, value },
      });
    }
  }
}
