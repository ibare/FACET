/**
 * resolveSymbols 장면 — 이벤트를 잇기만 한다. 셈(어느 정의가 어느 자리를 메우는가)은 알고리즘이 payload 로 보낸다.
 *
 * 바탕: files (initialData 에서 베낀 오브젝트 파일)
 * 자취: defined (정의 표에 오른 D 항목, 오른 차례) · waiting (기다리는 빈 자리, 올린 차례) · links (메운 자리 → 정의)
 * 이번 걸음: step · cursor (지금 읽은 항목)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readResolveSymbolsData, type EntryRef, type ObjectFile } from './algorithm.js';

export interface WaitingHole {
  readonly ref: EntryRef;
  readonly name: string;
}

export interface HoleLink {
  /** 메운 빈 자리(U) */
  readonly hole: EntryRef;
  /** 그 자리를 메운 정의(D) */
  readonly def: EntryRef;
}

export type ResolveSymbolsStep =
  | { readonly kind: 'start' }
  | {
      readonly kind: 'define';
      readonly at: EntryRef;
      readonly name: string;
      /** 이 걸음에 메운 자리 — 기다림 목록에서 빠진 것 */
      readonly filled: readonly WaitingHole[];
      /** 이 걸음 앞의 기다림 목록 — 남은 자리가 어디서 미끄러지는지 말하는 계기값 */
      readonly before: readonly WaitingHole[];
    }
  | { readonly kind: 'use'; readonly at: EntryRef; readonly name: string; readonly def: EntryRef | null };

export interface ResolveSymbolsScene {
  readonly files: readonly ObjectFile[];
  readonly defined: readonly EntryRef[];
  readonly waiting: readonly WaitingHole[];
  readonly links: readonly HoleLink[];
  readonly cursor: EntryRef | null;
  readonly step: ResolveSymbolsStep;
}

function sameRef(a: EntryRef, b: EntryRef): boolean {
  return a.file === b.file && a.entry === b.entry;
}

function readRef(raw: unknown, what: string): EntryRef {
  if (typeof raw !== 'object' || raw === null) throw new Error(`resolveSymbolsScene: ${what} 자리가 없다`);
  const file: unknown = Reflect.get(raw, 'file');
  const entry: unknown = Reflect.get(raw, 'entry');
  if (typeof file !== 'number' || typeof entry !== 'number') throw new Error(`resolveSymbolsScene: ${what} 자리가 수가 아니다`);
  return { file, entry };
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error('resolveSymbolsScene: payload 가 없다');
  return Reflect.get(payload, key);
}

/** payload 의 자리가 바탕에 있는 그 종류의 항목인지 본다. 아니면 던진다. */
function checkEntry(files: readonly ObjectFile[], ref: EntryRef, kind: 'D' | 'U', name: string): void {
  const file = files[ref.file];
  const entry = file === undefined ? undefined : file.entries[ref.entry];
  if (entry === undefined) throw new Error(`resolveSymbolsScene: 없는 자리 ${ref.file}:${ref.entry}`);
  if (entry.kind !== kind || entry.name !== name) {
    throw new Error(`resolveSymbolsScene: ${ref.file}:${ref.entry} 는 ${kind} ${name} 가 아니다`);
  }
}

export const resolveSymbolsScene: ScenePlan<ResolveSymbolsScene> = {
  initial(initialData: unknown): ResolveSymbolsScene {
    const data = readResolveSymbolsData(initialData);
    return {
      files: data.files.map((f) => ({ name: f.name, entries: f.entries.map((e) => ({ kind: e.kind, name: e.name })) })),
      defined: [],
      waiting: [],
      links: [],
      cursor: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ResolveSymbolsScene, event: FacetRuntimeEvent): ResolveSymbolsScene {
    const p = event.payload;
    if (event.type === 'define') {
      const at = readRef(p, 'define');
      const name = field(p, 'name');
      const filledRaw = field(p, 'filled');
      if (typeof name !== 'string') throw new Error('resolveSymbolsScene: define 이름이 없다');
      if (!Array.isArray(filledRaw)) throw new Error('resolveSymbolsScene: define filled 가 배열이 아니다');
      checkEntry(scene.files, at, 'D', name);
      const filled = filledRaw.map((r: unknown): WaitingHole => {
        const ref = readRef(r, 'filled');
        const w = scene.waiting.find((x) => sameRef(x.ref, ref));
        if (w === undefined) throw new Error(`resolveSymbolsScene: 기다리지 않던 자리 ${ref.file}:${ref.entry}`);
        if (w.name !== name) throw new Error(`resolveSymbolsScene: ${ref.file}:${ref.entry} 는 ${name} 를 기다리지 않았다`);
        return w;
      });
      return {
        files: scene.files,
        defined: [...scene.defined, at],
        waiting: scene.waiting.filter((w) => !filled.some((f) => sameRef(f.ref, w.ref))),
        links: [...scene.links, ...filled.map((f) => ({ hole: f.ref, def: at }))],
        cursor: at,
        step: { kind: 'define', at, name, filled, before: scene.waiting },
      };
    }
    if (event.type === 'use') {
      const at = readRef(p, 'use');
      const name = field(p, 'name');
      const defRaw = field(p, 'def');
      if (typeof name !== 'string') throw new Error('resolveSymbolsScene: use 이름이 없다');
      checkEntry(scene.files, at, 'U', name);
      if (defRaw === null) {
        return {
          files: scene.files,
          defined: scene.defined,
          waiting: [...scene.waiting, { ref: at, name }],
          links: scene.links,
          cursor: at,
          step: { kind: 'use', at, name, def: null },
        };
      }
      const def = readRef(defRaw, 'use.def');
      if (!scene.defined.some((d) => sameRef(d, def))) throw new Error('resolveSymbolsScene: 표에 없는 정의로 메웠다');
      checkEntry(scene.files, def, 'D', name);
      return {
        files: scene.files,
        defined: scene.defined,
        waiting: scene.waiting,
        links: [...scene.links, { hole: at, def }],
        cursor: at,
        step: { kind: 'use', at, name, def },
      };
    }
    throw new Error(`resolveSymbolsScene: 모르는 이벤트 ${event.type}`);
  },
};
