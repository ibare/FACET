import type {
  BodyInstance,
  Catalog,
  ContainerInstance,
  FacetExpr,
} from './types.js';
import { EventBus } from './event-bus.js';

export type LensMountParams = {
  container: HTMLElement;
  eventBus: EventBus;
  catalog: Catalog;
  expr: FacetExpr;
  containerInstance: ContainerInstance;
  bodyInstance: BodyInstance;
};

export type LensInstance = {
  destroy(): void;
};

export type LensFactory = (params: LensMountParams) => LensInstance;

const globalLensRegistry = new Map<string, LensFactory>();

export function registerLens(id: string, factory: LensFactory): void {
  globalLensRegistry.set(id, factory);
}

export function getLensRegistry(): Map<string, LensFactory> {
  return globalLensRegistry;
}

export type InstanceParams = {
  expr: FacetExpr;
  catalog: Catalog;
  lenses: string[];
  mountPoint: HTMLElement;
  lensRegistry?: Map<string, LensFactory>;
};

export type FacetInstance = {
  start(): void;
  stop(): void;
  reset(): void;
  setSpeed(multiplier: number): void;
  destroy(): void;
};

export function createInstance(params: InstanceParams): FacetInstance {
  const { expr, catalog, lenses, mountPoint } = params;
  const lensRegistry = params.lensRegistry ?? globalLensRegistry;

  const containerDef = catalog.containers.get(expr.container.name);
  if (!containerDef) {
    throw new Error(`Unknown container: facet:${expr.container.name}`);
  }
  if (expr.bodies.length !== 1) {
    throw new Error('v1 requires exactly one body identifier');
  }
  const bodyDef = catalog.bodies.get(expr.bodies[0].name);
  if (!bodyDef) {
    throw new Error(`Unknown body: facet:${expr.bodies[0].name}`);
  }

  const containerInstance = containerDef.init();
  const bodyInstance = bodyDef.init();
  const eventBus = new EventBus();

  const unsubs: Array<() => void> = [];

  unsubs.push(
    containerInstance.onTick(() => {
      const { tickCount } = containerInstance.getState();
      eventBus.emit({ type: 'container:tick', tickCount });
      bodyInstance.tick();
    }),
  );
  unsubs.push(
    containerInstance.onComplete(() => {
      eventBus.emit({ type: 'container:complete' });
    }),
  );
  unsubs.push(
    bodyInstance.onComplete(() => {
      containerInstance.signalComplete();
    }),
  );
  unsubs.push(
    bodyInstance.onPhase((phase) => {
      eventBus.emit({ type: 'body:phase', phase });
    }),
  );
  unsubs.push(
    bodyInstance.onStateChange((state) => {
      eventBus.emit({ type: 'body:state-changed', state });
    }),
  );

  unsubs.push(
    eventBus.on('ui:start', () => containerInstance.start()),
  );
  unsubs.push(
    eventBus.on('ui:stop', () => containerInstance.stop()),
  );
  unsubs.push(
    eventBus.on('ui:reset', () => {
      containerInstance.reset();
      bodyInstance.reset();
    }),
  );
  unsubs.push(
    eventBus.on('ui:speed-changed', (event) => {
      const mul = (event as { multiplier: number }).multiplier;
      containerInstance.setSpeed(mul);
      bodyInstance.setSpeed(mul);
    }),
  );
  unsubs.push(
    eventBus.on('ui:control-changed', (event) => {
      const e = event as { bodyId: string; controlId: string; value: unknown };
      if (e.bodyId === bodyDef.id) {
        bodyInstance.setControl(e.controlId, e.value);
      }
    }),
  );

  const lensInstances: LensInstance[] = [];
  for (const id of lenses) {
    const factory = lensRegistry.get(id);
    if (!factory) {
      console.warn(`[facet] unknown lens: "${id}"`);
      continue;
    }
    lensInstances.push(
      factory({
        container: mountPoint,
        eventBus,
        catalog,
        expr,
        containerInstance,
        bodyInstance,
      }),
    );
  }

  return {
    start: () => containerInstance.start(),
    stop: () => containerInstance.stop(),
    reset: () => {
      containerInstance.reset();
      bodyInstance.reset();
    },
    setSpeed: (m: number) => {
      containerInstance.setSpeed(m);
      bodyInstance.setSpeed(m);
    },
    destroy: () => {
      for (const lens of lensInstances) lens.destroy();
      for (const unsub of unsubs) unsub();
      containerInstance.stop();
      bodyInstance.destroy();
      eventBus.clear();
    },
  };
}
