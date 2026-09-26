/**
 * relocate-addresses 장면 — 이벤트를 상태로 잇는다.
 *
 * 바탕: 두 파일의 구조 (initialData 를 베낀 것)
 * 자취: 놓인 절들 · 정해진 심볼 주소 · 고쳐 적힌 주소 칸들
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readRelocData, type RelocKind, type RelocateAddressesFacetData, type SectionName } from './algorithm.js';

export type Placement = { file: string; section: SectionName; at: number; size: number };
export type SymbolAddr = { name: string; address: number };
export type FixedField = { file: string; offset: number; value: number };

export type RelocStep =
  | { kind: 'start' }
  | { kind: 'place'; file: string; section: SectionName; at: number; size: number }
  | { kind: 'fix'; file: string; offset: number; symbol: string; reloc: RelocKind; s: number; p: number; value: number };

export type RelocScene = {
  base: RelocateAddressesFacetData;
  placements: Placement[];
  symbols: SymbolAddr[];
  fixes: FixedField[];
  step: RelocStep;
};

function bad(msg: string): never {
  throw new Error(`relocate-addresses scene: ${msg}`);
}

function field(p: Record<string, unknown>, key: string): unknown {
  if (!(key in p)) bad(`payload 에 ${key} 가 없다`);
  return p[key];
}

function num(p: Record<string, unknown>, key: string): number {
  const v = field(p, key);
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`payload.${key} 는 수여야 한다`);
  return v;
}

function text(p: Record<string, unknown>, key: string): string {
  const v = field(p, key);
  if (typeof v !== 'string' || v === '') bad(`payload.${key} 는 글자여야 한다`);
  return v;
}

function payloadOf(e: FacetRuntimeEvent): Record<string, unknown> {
  const p = e.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) bad(`${e.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function sectionOf(v: string): SectionName {
  if (v === 'text' || v === 'data') return v;
  bad(`모르는 절 ${v}`);
}

function kindOf(v: string): RelocKind {
  if (v === 'ABS' || v === 'REL') return v;
  bad(`모르는 재배치 종류 ${v}`);
}

export const relocateAddressesScene: ScenePlan<RelocScene> = {
  initial(initialData: unknown): RelocScene {
    return {
      base: readRelocData(initialData),
      placements: [],
      symbols: [],
      fixes: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: RelocScene, event: FacetRuntimeEvent): RelocScene {
    if (event.type === 'place') {
      const p = payloadOf(event);
      const rawSyms = field(p, 'symbols');
      if (!Array.isArray(rawSyms)) bad('place.symbols 는 배열이어야 한다');
      const symbols = rawSyms.map((sv: unknown): SymbolAddr => {
        if (typeof sv !== 'object' || sv === null) bad('place.symbols 의 칸이 객체가 아니다');
        const s = sv as Record<string, unknown>;
        return { name: text(s, 'name'), address: num(s, 'address') };
      });
      const placement: Placement = {
        file: text(p, 'file'),
        section: sectionOf(text(p, 'section')),
        at: num(p, 'at'),
        size: num(p, 'size'),
      };
      return {
        ...scene,
        placements: [...scene.placements, placement],
        symbols: [...scene.symbols, ...symbols],
        step: { kind: 'place', ...placement },
      };
    }
    if (event.type === 'fix') {
      const p = payloadOf(event);
      const step: RelocStep = {
        kind: 'fix',
        file: text(p, 'file'),
        offset: num(p, 'offset'),
        symbol: text(p, 'symbol'),
        reloc: kindOf(text(p, 'kind')),
        s: num(p, 's'),
        p: num(p, 'p'),
        value: num(p, 'value'),
      };
      return {
        ...scene,
        fixes: [...scene.fixes, { file: step.file, offset: step.offset, value: step.value }],
        step,
      };
    }
    bad(`모르는 이벤트 ${event.type}`);
  },
};
