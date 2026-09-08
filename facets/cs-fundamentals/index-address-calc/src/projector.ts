/**
 * indexAddressCalcProjector — 셈의 재료를 stage 의 운동으로 옮긴다.
 *
 * algorithm 은 문안을 모르고 stage 는 이벤트를 모른다. 이 파일만 양쪽을 안다.
 * payload 는 여기서 정형 객체로 좁혀 넘기고 (C9), 문장이 되는 캡션·각주는
 * 여기서 tr 로 해석한다 (C10). 주소 표기 (0x100C) 는 문안이 아니라 표식이라
 * 값으로 만들어 vars 에 실어 보낸다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type CellSpec = { index: number; addr: number; value: number };

/** stage 가 노출하는 계약. 없는 메서드가 있어도 견디도록 전부 optional (C9). */
type AddressCalcStage = {
  showMemory?(cells: CellSpec[], base: number, unit: number): Promise<void> | void;
  askIndex?(index: number): Promise<void> | void;
  scaleToOffset?(offset: number): Promise<void> | void;
  addBase?(addr: number): Promise<void> | void;
  landOn?(index: number): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
  setNote?(text: string): void;
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toCells(value: unknown): CellSpec[] {
  if (!Array.isArray(value)) return [];
  const cells: CellSpec[] = [];
  for (const raw of value) {
    const c = raw as { index?: unknown; addr?: unknown; value?: unknown };
    const index = num(c?.index);
    const addr = num(c?.addr);
    const cellValue = num(c?.value);
    if (index === null || addr === null || cellValue === null) continue;
    cells.push({ index, addr, value: cellValue });
  }
  return cells;
}

/** 0x100C. 화면 문안이 아니라 표기이므로 코드가 만든다 (C10 판정 3). */
function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

export const indexAddressCalcProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as AddressCalcStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  // 그림이 기대는 전제 — algorithm 의 ctx.data 가 원본이고 여기서는 캡션을
  // 다시 쓰기 위해 필요한 만큼만 그림자로 쥔다 (원칙 5).
  let base = 0;
  let unit = 0;

  const laidCaption = (): string =>
    tr('caption.memory', 'The array sits in memory: {unit} bytes per slot from {base}.', {
      unit,
      base: hex(base),
    });

  return {
    onInit(initialData: unknown) {
      const d = initialData as { base?: unknown; unit?: unknown } | undefined;
      base = num(d?.base) ?? 0;
      unit = num(d?.unit) ?? 0;
      stage?.setNote?.(
        tr('label.note', 'Declared, not measured: int32 elements ({unit} bytes) based at {base}.', {
          unit,
          base: hex(base),
        }),
      );
      stage?.setCaption?.('');
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'memory-laid': {
          const p = event.payload as { base?: unknown; unit?: unknown; cells?: unknown } | undefined;
          const cells = toCells(p?.cells);
          base = num(p?.base) ?? base;
          unit = num(p?.unit) ?? unit;
          if (cells.length === 0) return;
          stage?.setCaption?.(laidCaption());
          await stage?.showMemory?.(cells, base, unit);
          return;
        }

        case 'index-asked': {
          const p = event.payload as { index?: unknown } | undefined;
          const index = num(p?.index);
          if (index === null) return;
          stage?.setCaption?.(tr('caption.ask', 'Where is arr[{index}]?', { index }));
          await stage?.askIndex?.(index);
          return;
        }

        case 'offset-scaled': {
          const p = event.payload as
            | { index?: unknown; unit?: unknown; offset?: unknown }
            | undefined;
          const index = num(p?.index);
          const size = num(p?.unit);
          const offset = num(p?.offset);
          if (index === null || size === null || offset === null) return;
          stage?.setCaption?.(
            tr('caption.scale', 'Index times element size: {index} × {unit} = {offset}.', {
              index,
              unit: size,
              offset,
            }),
          );
          await stage?.scaleToOffset?.(offset);
          return;
        }

        case 'address-formed': {
          const p = event.payload as
            | { base?: unknown; offset?: unknown; addr?: unknown }
            | undefined;
          const from = num(p?.base);
          const offset = num(p?.offset);
          const addr = num(p?.addr);
          if (from === null || offset === null || addr === null) return;
          stage?.setCaption?.(
            tr('caption.add', 'Add the base address: {base} + {offset} = {addr}.', {
              base: hex(from),
              offset,
              addr: hex(addr),
            }),
          );
          await stage?.addBase?.(addr);
          return;
        }

        case 'cell-reached': {
          const p = event.payload as
            | { index?: unknown; addr?: unknown; value?: unknown }
            | undefined;
          const index = num(p?.index);
          const addr = num(p?.addr);
          const value = num(p?.value);
          if (index === null || addr === null || value === null) return;
          stage?.setCaption?.(
            tr('caption.reach', 'One multiply, one add: {addr} holds arr[{index}] = {value}.', {
              addr: hex(addr),
              index,
              value,
            }),
          );
          await stage?.landOn?.(index);
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          stage?.setCaption?.(laidCaption());
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', 'Any index, the same one calculation. Nothing in between is read.'),
          );
          return;
        }

        default:
          // 이 조각의 algorithm 은 위 일곱 이벤트만 발신한다. 그 밖의 것이
          // 들어오면 조용히 버린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.rewind?.();
      stage?.setCaption?.('');
    },
  };
};
