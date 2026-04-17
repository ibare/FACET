import type {
  Algorithm,
  Body,
  Catalog,
  Container,
  IR,
  Transpiler,
  UIOptions,
} from './types.js';

export function createCatalog(): Catalog {
  return {
    containers: new Map(),
    algorithms: new Map(),
    bodies: new Map(),
    irs: new Map(),
    transpilers: new Map(),
  };
}

export type CatalogInput = {
  containers?: Container[];
  algorithms?: Algorithm[];
  bodies?: Body[];
  irs?: IR[];
  transpilers?: Transpiler[];
};

export function registerInto(catalog: Catalog, items: CatalogInput): void {
  items.containers?.forEach((c) => catalog.containers.set(c.id, c));
  items.algorithms?.forEach((a) => catalog.algorithms.set(a.id, a));
  items.bodies?.forEach((b) => catalog.bodies.set(b.id, b));
  items.irs?.forEach((i) => catalog.irs.set(i.id, i));
  items.transpilers?.forEach((t) => catalog.transpilers.set(t.id, t));
}

const globalCatalog: Catalog = createCatalog();

export function registerCatalog(items: CatalogInput): void {
  registerInto(globalCatalog, items);
}

export function getCatalog(): Catalog {
  return globalCatalog;
}

export function deriveUIOptions(bodyId: string, catalog: Catalog): UIOptions | null {
  const body = catalog.bodies.get(bodyId);
  if (!body) return null;
  const algorithm = catalog.algorithms.get(body.algorithm);
  if (!algorithm) return null;

  const paradigms: { id: string; irId: string }[] = [];
  for (const irId of body.available_irs) {
    const ir = catalog.irs.get(irId);
    if (ir) paradigms.push({ id: ir.paradigm, irId: ir.id });
  }

  const languages = new Set<string>();
  for (const p of paradigms) {
    for (const t of catalog.transpilers.values()) {
      if (t.paradigm === p.id) languages.add(t.target);
    }
  }

  return {
    paradigms,
    languages: [...languages],
    phases: algorithm.phases,
    controls: body.controls,
  };
}

export function validateCatalog(catalog: Catalog): string[] {
  const warnings: string[] = [];

  for (const body of catalog.bodies.values()) {
    if (!catalog.algorithms.has(body.algorithm)) {
      warnings.push(
        `body "${body.id}" references unknown algorithm "${body.algorithm}"`,
      );
    }
    if (!body.available_irs.includes(body.default_ir)) {
      warnings.push(
        `body "${body.id}" default_ir "${body.default_ir}" not in available_irs`,
      );
    }
    for (const irId of body.available_irs) {
      if (!catalog.irs.has(irId)) {
        warnings.push(`body "${body.id}" references unknown ir "${irId}"`);
      }
    }
  }

  for (const ir of catalog.irs.values()) {
    if (!catalog.algorithms.has(ir.algorithm)) {
      warnings.push(`ir "${ir.id}" references unknown algorithm "${ir.algorithm}"`);
    }
  }

  const paradigms = new Set([...catalog.irs.values()].map((i) => i.paradigm));
  for (const t of catalog.transpilers.values()) {
    if (!paradigms.has(t.paradigm)) {
      warnings.push(
        `transpiler "${t.id}" paradigm "${t.paradigm}" matches no registered ir`,
      );
    }
  }

  return warnings;
}
