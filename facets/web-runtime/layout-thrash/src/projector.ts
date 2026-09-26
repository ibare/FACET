/**
 * layoutThrashProjector — algorithm 의 이벤트를 stage · codePanel 호출로 옮긴다.
 *
 * 애니메이션 길이는 재생 속도를 그때그때 읽어 정한다 — 요소를 만들 때 한 번
 * 박으면 속도를 올려도 걸음 경계를 넘는 시간이 그대로 남는다.
 *
 * 상자 하나를 처리하는 한 걸음 안에 강제 레이아웃 표시등 + 상자 성장, 둘 다
 * 애니메이션이 있는 상자 수만큼 겹쳐(순서대로) 걸린다 — 표시등은 짧게(80ms),
 * 상자 성장(실제 밀림)은 운동의 핵심이라 300ms 안쪽을 다 쓴다. 그래야
 * boxCount=16 · 번갈아 조합에서도 재생이 20 초 밑에 들어온다(실측 보고 참고).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { LayoutThrashStageInstance } from './layout-thrash-stage.js';

const GROW_ANIM_MS = 280;
const FLASH_ANIM_MS = 80;

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

export const layoutThrashProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LayoutThrashStageInstance | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const speed = () => runtime?.getSpeed() ?? 1;
  const growDur = () => Math.max(40, GROW_ANIM_MS / speed());
  const flashDur = () => Math.max(20, FLASH_ANIM_MS / speed());

  return {
    onInit(initialData) {
      const d = initialData as { boxCount?: unknown; order?: unknown; boxWidths?: unknown };
      if (typeof d.boxCount !== 'number' || typeof d.order !== 'number' || !Array.isArray(d.boxWidths)) return;
      const widths = d.boxWidths.slice(0, d.boxCount).filter((w): w is number => typeof w === 'number');
      stage?.resetRound(d.order, widths);
    },
    onEvent(e) {
      const payload = e.payload;
      switch (e.type) {
        case 'phase': {
          const p = typeof payload === 'object' && payload !== null ? (payload as { phase?: unknown }).phase : undefined;
          const phase = typeof p === 'string' ? p : null;
          if (phase) codePanel?.highlightPhase(phase);
          else codePanel?.clearHighlight();
          stage?.highlightCode(phase);
          return;
        }
        case 'round': {
          const d = payload as { boxCount?: unknown; order?: unknown; widths?: unknown };
          if (typeof d.order !== 'number' || !Array.isArray(d.widths)) {
            throw new Error('layout-thrash projector: round payload 이 비었다');
          }
          const widths = d.widths.filter((w): w is number => typeof w === 'number');
          stage?.resetRound(d.order, widths);
          return;
        }
        case 'read': {
          const d = payload as { boxIndex?: unknown };
          if (typeof d.boxIndex !== 'number') throw new Error('layout-thrash projector: read payload 이 비었다');
          stage?.markReading([d.boxIndex]);
          return;
        }
        case 'read-all': {
          const d = payload as { widths?: unknown };
          if (!Array.isArray(d.widths)) throw new Error('layout-thrash projector: read-all payload 이 비었다');
          stage?.markReading(d.widths.map((_, i) => i + 1));
          return;
        }
        case 'forced-layout':
          return stage?.flashLayout('forced', flashDur());
        case 'frame-layout':
          return stage?.flashLayout('frame', flashDur());
        case 'write': {
          const d = payload as { boxIndex?: unknown; from?: unknown; to?: unknown };
          if (typeof d.boxIndex !== 'number' || typeof d.from !== 'number' || typeof d.to !== 'number') {
            throw new Error('layout-thrash projector: write payload 이 비었다');
          }
          return stage?.growBox(d.boxIndex, d.from, d.to, growDur());
        }
        case 'write-all': {
          const d = payload as { from?: unknown; to?: unknown };
          if (!Array.isArray(d.from) || !Array.isArray(d.to)) {
            throw new Error('layout-thrash projector: write-all payload 이 비었다');
          }
          const from = d.from.filter((x): x is number => typeof x === 'number');
          const to = d.to.filter((x): x is number => typeof x === 'number');
          return stage?.growBoxes(from, to, growDur());
        }
        default:
          return;
      }
    },
  };
};
