import type { BodyControl, BodyInstance, EventBus } from '@facet/core';

export type ControlsHandle = {
  element: HTMLElement;
  setRunning(running: boolean): void;
  setComplete(complete: boolean): void;
  destroy(): void;
};

export type ControlsParams = {
  eventBus: EventBus;
  bodyInstance: BodyInstance;
  bodyId: string;
  bodyControls: BodyControl[];
};

const SPEEDS = [
  { label: '빠르게', value: 2 },
  { label: '보통', value: 1 },
  { label: '느리게', value: 0.5 },
];
const DEFAULT_SPEED = 1;

export function createControls(params: ControlsParams): ControlsHandle {
  const { eventBus, bodyId, bodyControls } = params;

  const root = document.createElement('div');
  root.className = 'facet-circuit__controls';

  // --- playback group ---
  const playbackGroup = document.createElement('div');
  playbackGroup.className = 'facet-group';

  const playBtn = document.createElement('button');
  playBtn.textContent = '시작';
  let running = false;
  let complete = false;

  function renderPlayLabel() {
    playBtn.textContent = complete ? '처음부터' : running ? '정지' : '시작';
  }

  playBtn.addEventListener('click', () => {
    if (complete) {
      eventBus.emit({ type: 'ui:reset' });
      return;
    }
    if (running) {
      eventBus.emit({ type: 'ui:stop' });
    } else {
      eventBus.emit({ type: 'ui:start' });
    }
  });

  const stepBtn = document.createElement('button');
  stepBtn.textContent = '한 펄스';
  stepBtn.addEventListener('click', () => {
    eventBus.emit({ type: 'ui:step' as unknown as 'ui:start' });
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '처음부터';
  resetBtn.addEventListener('click', () => {
    eventBus.emit({ type: 'ui:reset' });
  });

  playbackGroup.append(playBtn, stepBtn, resetBtn);
  root.appendChild(playbackGroup);

  // --- speed group ---
  const speedGroup = document.createElement('div');
  speedGroup.className = 'facet-group';
  const speedLabel = document.createElement('label');
  speedLabel.textContent = '속도';
  speedGroup.appendChild(speedLabel);

  const speedButtons: HTMLButtonElement[] = [];
  for (const s of SPEEDS) {
    const btn = document.createElement('button');
    btn.textContent = s.label;
    btn.dataset.active = s.value === DEFAULT_SPEED ? 'true' : 'false';
    btn.addEventListener('click', () => {
      for (const b of speedButtons) b.dataset.active = 'false';
      btn.dataset.active = 'true';
      eventBus.emit({ type: 'ui:speed-changed', multiplier: s.value });
    });
    speedButtons.push(btn);
    speedGroup.appendChild(btn);
  }
  root.appendChild(speedGroup);

  // --- body controls (auto-generated from metadata) ---
  for (const control of bodyControls) {
    const group = document.createElement('div');
    group.className = 'facet-group';
    const label = document.createElement('label');
    label.textContent = control.label;
    group.appendChild(label);

    if (control.type === 'preset') {
      const buttons: HTMLButtonElement[] = [];
      let activeValue = control.default;
      for (const opt of control.options) {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.dataset.active = opt.value === activeValue ? 'true' : 'false';
        btn.addEventListener('click', () => {
          activeValue = opt.value;
          for (const b of buttons) b.dataset.active = 'false';
          btn.dataset.active = 'true';
          eventBus.emit({
            type: 'ui:control-changed',
            bodyId,
            controlId: control.id,
            value: opt.value,
          });
        });
        buttons.push(btn);
        group.appendChild(btn);
      }
    } else if (control.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step ?? 1);
      input.value = String(control.default);
      const out = document.createElement('span');
      out.textContent = String(control.default);
      input.addEventListener('input', () => {
        const value = Number(input.value);
        out.textContent = String(value);
        eventBus.emit({
          type: 'ui:control-changed',
          bodyId,
          controlId: control.id,
          value,
        });
      });
      group.append(input, out);
    }
    root.appendChild(group);
  }

  renderPlayLabel();

  return {
    element: root,
    setRunning(next) {
      running = next;
      renderPlayLabel();
    },
    setComplete(next) {
      complete = next;
      if (next) running = false;
      renderPlayLabel();
    },
    destroy() {
      root.remove();
    },
  };
}
