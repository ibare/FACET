/**
 * 더미 counter Projector — state-changed 이벤트로 text-display 갱신.
 */

import type { ProjectorFactory } from '../../runtime/projector.js';

type Display = { setText(s: string): void; reset(): void };

export const counterProjector: ProjectorFactory = (views) => {
  const display = views.display as unknown as Display | undefined;

  return {
    onInit() {
      display?.setText('대기 중');
    },
    onEvent(event) {
      if (event.type === 'state-changed') {
        const value = (event.payload as { value: number }).value;
        display?.setText(String(value));
      } else if (event.type === 'done') {
        display?.setText('완료');
      }
    },
    onReset() {
      display?.reset();
    },
  };
};
