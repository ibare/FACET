/**
 * 알고리즘 / Projector / IR / Transpiler / Facet JSON 등록·조회.
 *
 * 호스트 앱이 setup 시 모듈을 등록하고, 러너는 JSON 의 module: 참조로 조회.
 */

import type { AlgorithmFn } from './context.js';
import type { FacetJson } from '../types/facet-json.js';
import type { ProjectorFactory } from './projector.js';

const algorithms = new Map<string, AlgorithmFn>();
const projectors = new Map<string, ProjectorFactory>();
const facets = new Map<string, FacetJson>();

import type { IR, Transpiler } from '../types/ir.js';

const irs = new Map<string, IR>();
const transpilers = new Map<string, Transpiler>();

export function registerAlgorithm<TData = unknown>(name: string, fn: AlgorithmFn<TData>): void {
  algorithms.set(name, fn as AlgorithmFn);
}

export function getAlgorithm(name: string): AlgorithmFn | undefined {
  return algorithms.get(name);
}

export function registerProjector(name: string, factory: ProjectorFactory): void {
  projectors.set(name, factory);
}

export function getProjector(name: string): ProjectorFactory | undefined {
  return projectors.get(name);
}

export function registerFacets(jsons: FacetJson[]): void {
  for (const j of jsons) facets.set(j.id, j);
}

export function getFacetById(id: string): FacetJson | undefined {
  return facets.get(id);
}

export function listFacets(): string[] {
  return [...facets.keys()];
}

export function registerIR(id: string, ir: IR): void {
  irs.set(id, ir);
}

export function getIR(id: string): IR | undefined {
  return irs.get(id);
}

export function registerTranspiler(id: string, t: Transpiler): void {
  transpilers.set(id, t);
}

export function getTranspiler(id: string): Transpiler | undefined {
  return transpilers.get(id);
}

export function listTranspilers(): Transpiler[] {
  return [...transpilers.values()];
}

export function clearRegistry(): void {
  algorithms.clear();
  projectors.clear();
  facets.clear();
  irs.clear();
  transpilers.clear();
}

/** 참조 문자열 helper — `module:foo` → `foo` */
export function stripPrefix(ref: string, prefix: string): string {
  const p = `${prefix}:`;
  return ref.startsWith(p) ? ref.slice(p.length) : ref;
}
