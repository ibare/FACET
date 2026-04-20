/**
 * 알고리즘 / Projector / IR / Transpiler / Facet JSON 등록·조회.
 *
 * 호스트 앱이 setup 시 모듈을 등록하고, 러너는 JSON 의 module: 참조로 조회.
 */

import type { AlgorithmFn } from './context.js';
import type { FacetJson } from '../types/facet-json.js';
import type { ProjectorFactory } from './projector.js';

type AlgorithmEntry = {
  fn: AlgorithmFn;
  /** 알고리즘 실행과 별개로 "정렬된/완료된 최종 상태" 를 미리 계산. goal-preview(computeFrom: 'sorted') 가 사용. */
  computeResult?: (initialData: unknown) => unknown;
};

const algorithms = new Map<string, AlgorithmEntry>();
const projectors = new Map<string, ProjectorFactory>();
const facets = new Map<string, FacetJson>();

import type { IR, Transpiler } from '../types/ir.js';

const irs = new Map<string, IR>();
const transpilers = new Map<string, Transpiler>();

type FacetLoader = () => Promise<unknown>;
const facetLoaders = new Map<string, FacetLoader>();
const inflightLoads = new Map<string, Promise<void>>();
const descriptions = new Map<string, string>();

export type RegisterAlgorithmOptions<TData = unknown> = {
  /** 알고리즘 실행과 별개로 최종 결과 상태를 즉시 계산하는 순수 함수. */
  computeResult?: (initialData: TData) => TData;
};

export function registerAlgorithm<TData = unknown>(
  name: string,
  fn: AlgorithmFn<TData>,
  options?: RegisterAlgorithmOptions<TData>,
): void {
  algorithms.set(name, {
    fn: fn as AlgorithmFn,
    computeResult: options?.computeResult as ((d: unknown) => unknown) | undefined,
  });
}

export function getAlgorithm(name: string): AlgorithmFn | undefined {
  return algorithms.get(name)?.fn;
}

export function getAlgorithmComputeResult(name: string): ((initialData: unknown) => unknown) | undefined {
  return algorithms.get(name)?.computeResult;
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

/**
 * facet 패키지의 lazy loader 등록.
 * loader 는 호출 시 동적 import 를 수행하고 그 결과로 모듈의 register 함수를
 * 실행해 facet/algorithm/projector/IR 등을 등록해야 한다.
 */
export function registerFacetLoader(id: string, loader: FacetLoader): void {
  facetLoaders.set(id, loader);
}

export function hasFacetLoader(id: string): boolean {
  return facetLoaders.has(id);
}

/**
 * facet JSON 을 가져온다. 등록되어 있지 않고 loader 가 있으면 loader 를 실행한 뒤 재조회.
 * 동일 id 동시 호출은 동일한 inflight Promise 를 공유한다.
 */
export async function loadFacet(id: string): Promise<FacetJson | undefined> {
  if (facets.has(id)) return facets.get(id);
  const loader = facetLoaders.get(id);
  if (!loader) return undefined;

  const existing = inflightLoads.get(id);
  if (existing) {
    await existing;
    return facets.get(id);
  }
  const p = (async () => {
    await loader();
  })().finally(() => inflightLoads.delete(id));
  inflightLoads.set(id, p);
  await p;
  return facets.get(id);
}

/** facet id 에 대응하는 설명 마크다운 등록 (단일 문자열, locale 분기 없음). */
export function registerDescription(id: string, markdown: string): void {
  descriptions.set(id, markdown);
}

export function getDescription(id: string): string | undefined {
  return descriptions.get(id);
}

export function clearRegistry(): void {
  algorithms.clear();
  projectors.clear();
  facets.clear();
  irs.clear();
  transpilers.clear();
  facetLoaders.clear();
  inflightLoads.clear();
  descriptions.clear();
}

/** 참조 문자열 helper — `module:foo` → `foo` */
export function stripPrefix(ref: string, prefix: string): string {
  const p = `${prefix}:`;
  return ref.startsWith(p) ? ref.slice(p.length) : ref;
}
