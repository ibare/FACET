/**
 * 굴러가는 해시 조각의 projector.
 *
 * algorithm 이 내는 다섯 이벤트를 stage 메서드 호출로 옮긴다. payload 는 여기서
 * 좁혀 정형 객체로 만들어 넘기고 (C9), 화면 문안은 키로 조회해 넘긴다 (C10).
 * stage 의 애니메이션 promise 를 그대로 돌려주므로 `await ctx.emit` 이 그림이
 * 끝난 뒤에야 돌아온다 (S-piece 의 걸음 벽시계).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

type RollingHashStage = {
  setCaption?(text: string): void;
  showPattern?(p: { hash: number }): Promise<void> | void;
  openWindow?(w: { start: number; hash: number; match: boolean }): Promise<void> | void;
  roll?(r: {
    start: number;
    outIndex: number;
    outTerm: number;
    inIndex: number;
    inValue: number;
    hash: number;
    match: boolean;
    wrapped: boolean;
  }): Promise<void> | void;
  finish?(): Promise<void> | void;
  rewind?(): void;
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function flag(v: unknown): boolean {
  return v === true;
}

export const rollingHashProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as RollingHashStage;
  const tr = runtime?.t ?? makeTranslator();

  async function onEvent(event: FacetRuntimeEvent): Promise<void> {
    const p = (
      typeof event.payload === 'object' && event.payload !== null ? event.payload : {}
    ) as Record<string, unknown>;

    switch (event.type) {
      case 'pattern-hash': {
        const hash = num(p.hash);
        stage.setCaption?.(tr('caption.pattern', 'Hash of the pattern: {h}.', { h: hash }));
        await stage.showPattern?.({ hash });
        return;
      }

      case 'window-init': {
        const hash = num(p.hash);
        stage.setCaption?.(
          tr('caption.first', 'The first window reads every letter. Hash: {h}.', { h: hash }),
        );
        await stage.openWindow?.({
          start: num(p.start),
          hash,
          match: flag(p.match),
        });
        return;
      }

      case 'window-roll': {
        const hash = num(p.hash);
        const match = flag(p.match);
        const wrapped = flag(p.wrapped);
        stage.setCaption?.(
          match
            ? tr('caption.match', 'The same hash as the pattern: {h}.', { h: hash })
            : wrapped
              ? tr('caption.wrapped', 'Back to the same letters, and the same hash: {h}.', {
                  h: hash,
                })
              : tr('caption.roll', 'Two touches: one letter out, one in. Hash: {h}.', {
                  h: hash,
                }),
        );
        await stage.roll?.({
          start: num(p.start),
          outIndex: num(p.outIndex),
          outTerm: num(p.outTerm),
          inIndex: num(p.inIndex),
          inValue: num(p.inValue),
          hash,
          match,
          wrapped,
        });
        return;
      }

      case 'rewind': {
        stage.rewind?.();
        return;
      }

      case 'done': {
        const windows = num(p.windows);
        const rolls = num(p.rolls);
        stage.setCaption?.(
          tr('caption.done', '{windows} windows, {rolls} rolls — each roll touched two letters.', {
            windows,
            rolls,
          }),
        );
        await stage.finish?.();
        return;
      }

      default:
        // 위 다섯이 이 조각 algorithm 이 내는 이벤트의 전부다. 그 밖의 것은
        // 화면에 옮길 것이 없어 조용히 버린다 (C2).
        return;
    }
  }

  function onReset(): void {
    stage.rewind?.();
  }

  return { onEvent, onReset };
};
