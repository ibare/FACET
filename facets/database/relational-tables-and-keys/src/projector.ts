/**
 * RelationalTablesAndKeys Projector — algorithm 이벤트를 tables-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 두 카드형 격자 — 컬럼 헤더 + 본문 행이 살아 있는 동시 존재.
 *   2. 기본키 컬럼의 시각적 무게 — 채움 열쇠 + 굵은 밑줄.
 *   3. 외래키 컬럼의 비대칭 시각 — 윤곽 열쇠 + 베지어 곡선 + Crow's Foot 카디널리티.
 *   4. 참조 무결성의 셀 단위 짝짓기 — 같은 값을 같은 옅은 배경으로 묶기 (호버 시 점선).
 *   5. 충돌과 거부의 인서트 — 빨간 어휘로 "유일성 충돌" 과 "참조 거부" 두 제약을 사건화.
 *   6. 후보키 둘과 기본키 선택의 분기 — alt 라벨 + 토글 칩 자리바꿈.
 *
 * 호버 인터랙션은 view 내부 SVG 마우스 이벤트로 직접 처리 (algorithm 미경유).
 * projector 는 init / pk-toggle / rejects-visible / auto-hover / demo-end /
 * invalid-input 만 stage 메서드로 번역한다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';

type ColumnPayload = {
  id: string;
  label: string;
  kind: 'pk' | 'alt' | 'fk' | 'plain';
  references?: { tableId: string; columnId: string };
};

type TablePayload = {
  id: string;
  label: string;
  columns: ColumnPayload[];
  rows: Array<{ id: string; cells: Record<string, string> }>;
};

type RejectPayload = {
  tableId: string;
  kind: 'duplicate-pk' | 'missing-fk';
  cells: Record<string, string>;
  failingColumn: string;
  message: string;
};

type RelationPayload = {
  id: string;
  from: { tableId: string; columnId: string };
  to: { tableId: string; columnId: string };
};

type TablesStage = {
  reset(): void;
  init(payload: {
    tables: TablePayload[];
    relations: RelationPayload[];
    candidateKeys: Record<string, string[]>;
    pkChoice: Record<string, string>;
    rejectsVisible: boolean;
    rejects: RejectPayload[];
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  applyPkToggle(payload: {
    tableId: string;
    fromColumn: string;
    toColumn: string;
  }): Promise<void>;
  setRejectsVisible(visible: boolean): void;
  autoHover(payload: {
    tableId: string;
    rowIndex: number;
    columnId: string;
    value: string;
    kind: 'fk' | 'pk';
    durationMs: number;
  }): Promise<void>;
  signalInvalid(op: string, raw: string): void;
  signalDemoEnd(): void;
};

const BASE_CAPTION =
  '테이블은 같은 형태의 행을 모은 이름 붙은 격자이고, 기본키가 한 행을 유일하게 식별하며 외래키가 다른 격자의 기본키 값을 가리켜 두 격자를 한 구조로 엮는다.';

export const relationalTablesAndKeysProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TablesStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            tables: TablePayload[];
            relations: RelationPayload[];
            candidateKeys: Record<string, string[]>;
            pkChoice: Record<string, string>;
            rejectsVisible: boolean;
            rejects: RejectPayload[];
          }>;
          stage.init({
            tables: Array.isArray(p.tables) ? p.tables : [],
            relations: Array.isArray(p.relations) ? p.relations : [],
            candidateKeys:
              p.candidateKeys && typeof p.candidateKeys === 'object'
                ? p.candidateKeys
                : {},
            pkChoice:
              p.pkChoice && typeof p.pkChoice === 'object' ? p.pkChoice : {},
            rejectsVisible: Boolean(p.rejectsVisible),
            rejects: Array.isArray(p.rejects) ? p.rejects : [],
          });
          break;
        }

        case 'pk-toggle': {
          const p = (event.payload ?? {}) as {
            tableId?: string;
            fromColumn?: string;
            toColumn?: string;
          };
          await stage.applyPkToggle({
            tableId: String(p.tableId ?? ''),
            fromColumn: String(p.fromColumn ?? ''),
            toColumn: String(p.toColumn ?? ''),
          });
          break;
        }

        case 'rejects-visible': {
          const p = (event.payload ?? {}) as { visible?: boolean };
          stage.setRejectsVisible(Boolean(p.visible));
          break;
        }

        case 'auto-hover': {
          const p = (event.payload ?? {}) as {
            tableId?: string;
            rowIndex?: number;
            columnId?: string;
            value?: string;
            kind?: 'fk' | 'pk';
            durationMs?: number;
          };
          const dur = (typeof p.durationMs === 'number' ? p.durationMs : 1200) / speed;
          await stage.autoHover({
            tableId: String(p.tableId ?? ''),
            rowIndex: typeof p.rowIndex === 'number' ? p.rowIndex : 0,
            columnId: String(p.columnId ?? ''),
            value: String(p.value ?? ''),
            kind: p.kind === 'pk' ? 'pk' : 'fk',
            durationMs: dur,
          });
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        case 'demo-end': {
          stage.signalDemoEnd();
          break;
        }

        default:
          // phase 등 silent 메타 이벤트는 시각 변화 없음 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};
