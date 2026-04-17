import type { Body, LensFactory } from '@facet/core';
import { createCircuitStage } from './circuit.js';
import { createControls } from './controls.js';
import { injectStyles } from './styles.js';

export const circuitLens: LensFactory = ({
  container,
  eventBus,
  catalog,
  expr,
  containerInstance,
  bodyInstance,
}) => {
  injectStyles();

  const root = document.createElement('div');
  root.className = 'facet-circuit';
  container.appendChild(root);

  const bodyDef: Body | null =
    catalog.bodies.get(expr.bodies[0].name) ??
    [...catalog.bodies.values()].find((b) => b.algorithm === expr.bodies[0].name) ??
    null;

  const stage = createCircuitStage({
    containerName: expr.container.name,
    bodyName: bodyDef?.id ?? expr.bodies[0].name,
    containerInstance,
    bodyInstance,
    eventBus,
  });

  const controls = createControls({
    eventBus,
    bodyInstance,
    bodyId: bodyDef?.id ?? expr.bodies[0].name,
    bodyControls: bodyDef?.controls ?? [],
  });

  root.append(stage.root, controls.element);

  // body mounts its own visualization inside the SVG foreignObject slot
  bodyInstance.render(stage.bodySlot);

  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on('container:tick', (e) => {
      stage.pulseForward();
      stage.setTickCount((e as { tickCount: number }).tickCount);
      controls.setRunning(true);
      controls.setComplete(false);
    }),
  );
  unsubs.push(
    eventBus.on('body:phase', (e) => {
      const phase = (e as { phase: string }).phase;
      stage.setPhase(phase);
      if (phase === 'pass_complete') {
        stage.setComplete(true);
        stage.pulseReverse();
        controls.setComplete(true);
      }
    }),
  );
  unsubs.push(
    eventBus.on('container:complete', () => {
      stage.setComplete(true);
      controls.setComplete(true);
    }),
  );
  unsubs.push(
    eventBus.on('ui:stop', () => controls.setRunning(false)),
  );
  unsubs.push(
    eventBus.on('ui:reset', () => {
      stage.setPhase(null);
      stage.setComplete(false);
      stage.setTickCount(0);
      controls.setRunning(false);
      controls.setComplete(false);
    }),
  );
  unsubs.push(
    eventBus.on('ui:speed-changed', (e) => {
      stage.setSpeed((e as { multiplier: number }).multiplier);
    }),
  );

  return {
    destroy() {
      for (const unsub of unsubs) unsub();
      controls.destroy();
      stage.destroy();
      if (root.parentElement) root.remove();
    },
  };
};
