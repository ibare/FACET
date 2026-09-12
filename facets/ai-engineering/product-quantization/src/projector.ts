/**
 * 곱 양자화 projector — algorithm 의 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 좁힌 뒤에만 넘긴다 (C9). 문안은 키로만 들고 있고 문장은
 * `facet.ts` 의 messages 가 정한다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core';
import { makeTranslator } from '@ffacet/core';

type Stage = {
  setParts?(parts: number, size: number): Promise<void> | void;
  chooseCode?(info: {
    sector: number;
    from: number;
    size: number;
    code: number;
    value: number;
  }): Promise<void> | void;
  settle?(): void;
  setCaption?(text: string): void;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const productQuantizationProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (event.type === 'parts-changed') {
        const p = event.payload as { parts?: unknown; size?: unknown } | undefined;
        const parts = num(p?.parts);
        const size = num(p?.size);
        if (parts === null || size === null) return;
        stage.setCaption?.(
          tr('caption.split', 'Split into {parts} chunks of {size}.', { parts, size }),
        );
        await stage.setParts?.(parts, size);
        return;
      }

      if (event.type === 'code-chosen') {
        const p = event.payload as
          | { sector?: unknown; from?: unknown; size?: unknown; code?: unknown; value?: unknown }
          | undefined;
        const sector = num(p?.sector);
        const from = num(p?.from);
        const size = num(p?.size);
        const code = num(p?.code);
        const value = num(p?.value);
        if (sector === null || from === null || size === null || code === null || value === null) return;
        stage.setCaption?.(
          tr('caption.code', 'Chunk {index}: nearest grid value {value}, number #{code}.', {
            index: sector + 1,
            value,
            code,
          }),
        );
        await stage.chooseCode?.({ sector, from, size, code, value });
        return;
      }

      if (event.type === 'settled') {
        const p = event.payload as
          | { codes?: unknown; bytes?: unknown; errorX100?: unknown }
          | undefined;
        const codes = num(p?.codes);
        const bytes = num(p?.bytes);
        const errorX100 = num(p?.errorX100);
        if (codes === null || bytes === null || errorX100 === null) return;
        stage.settle?.();
        // 오차는 소수 두 자리로 고정한다 — 6.56 과 1.73 을 견주는 것이 이 화면의
        // 값이라 자릿수가 들쭉날쭉하면 견주기 어렵다.
        stage.setCaption?.(
          tr('caption.settled', 'Error {error} · numbers {codes} · {bytes} B of 32 B.', {
            error: (errorX100 / 100).toFixed(2),
            codes,
            bytes,
          }),
        );
        return;
      }

      // 그 밖의 이벤트는 조용히 흘린다 — 이 facet 의 algorithm 은 위 셋만 발신한다.
    },
  };
};
