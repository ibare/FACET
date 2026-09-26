/**
 * 스코프와 심볼 테이블 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * - round  → 무대 `startRound` (앞 회차의 선은 자국으로), 코드 패널 강조를 끈다
 * - line   → 무대 `showLine` (운동 길이는 재생 속도를 그때그때 읽는다)
 * - phase  → 코드 패널 `highlightPhase`
 *
 * 캡션은 payload 의 셈한 값(찾은 선언 줄 · 훑은 표 수 · 부딪힌 선언 줄 · 높이)으로만 짓는다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type {
  ScopeAndSymbolsStage,
  StageLine,
  StageOp,
  StageRound,
  StageTable,
} from './scope-and-symbols-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

/** 걸음 안 운동의 상한 (재생 속도 1 에서) */
const MOTION_MS = 560;

// ── payload 좁히개 ─────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`projector: ${what} 가 객체가 아니다`);
  return v as Obj;
};
const num = (o: Obj, k: string): number => {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`projector: ${k} 가 수가 아니다`);
  return v;
};
const str = (o: Obj, k: string): string => {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`projector: ${k} 가 글자가 아니다`);
  return v;
};
const bool = (o: Obj, k: string): boolean => {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`projector: ${k} 가 참거짓이 아니다`);
  return v;
};
const list = (o: Obj, k: string): unknown[] => {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`projector: ${k} 가 목록이 아니다`);
  return v;
};
const nums = (o: Obj, k: string): number[] =>
  list(o, k).map((x) => {
    if (typeof x !== 'number') throw new Error(`projector: ${k} 에 수 아닌 것이 있다`);
    return x;
  });

const readStack = (o: Obj): StageTable[] =>
  list(o, 'stack').map((x) => {
    const tb = obj(x, 'stack 항목');
    return { scope: num(tb, 'scope'), entries: nums(tb, 'entries') };
  });

const readLines = (o: Obj): StageLine[] =>
  list(o, 'lines').map((x) => {
    const ln = obj(x, 'lines 항목');
    return {
      no: num(ln, 'no'),
      indent: num(ln, 'indent'),
      text: str(ln, 'text'),
      tokens: list(ln, 'tokens').map((y) => {
        const tk = obj(y, 'tokens 항목');
        const kind = str(tk, 'kind');
        if (kind !== 'decl' && kind !== 'use') throw new Error(`projector: 모르는 토큰 종류 ${kind}`);
        return { start: num(tk, 'start'), len: num(tk, 'len'), kind, ref: num(tk, 'ref') };
      }),
    };
  });

const readOps = (o: Obj): StageOp[] =>
  list(o, 'ops').map((x) => {
    const op = obj(x, 'ops 항목');
    const k = str(op, 'k');
    switch (k) {
      case 'pop':
        return { k, scope: num(op, 'scope') };
      case 'push':
        return { k, scope: num(op, 'scope'), height: num(op, 'height') };
      case 'lookup':
        return { k, use: num(op, 'use'), found: bool(op, 'found'), decl: num(op, 'decl'), scanned: num(op, 'scanned') };
      case 'declare':
        return { k, decl: num(op, 'decl'), table: num(op, 'table'), accepted: bool(op, 'accepted'), clash: num(op, 'clash') };
      default:
        throw new Error(`projector: 모르는 걸음 조각 ${k}`);
    }
  });

type NameRef = { name: string; nameId: number; line: number };
const readRefs = (o: Obj, k: string): NameRef[] =>
  list(o, k).map((x) => {
    const r = obj(x, `${k} 항목`);
    return { name: str(r, 'name'), nameId: num(r, 'nameId'), line: num(r, 'line') };
  });

export const scopeAndSymbolsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ScopeAndSymbolsStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const speed = () => (runtime ? runtime.getSpeed() : 1);

  // 회차의 표 이름 · 선언 · 쓰임 — 캡션을 짓는 데만 쥔다
  let tableLabels: string[] = [];
  let decls: NameRef[] = [];
  let uses: NameRef[] = [];

  const ruleLabel = (ruleId: string): string => {
    switch (ruleId) {
      case 'block':
        return t('label.rule.block', 'Per block');
      case 'function':
        return t('label.rule.function', 'Per function');
      case 'single':
        return t('label.rule.single', 'Just one');
      default:
        throw new Error(`projector: 모르는 스코프 규칙 ${ruleId}`);
    }
  };

  const tableLabel = (scope: number): string => {
    const s = tableLabels[scope];
    if (s === undefined) throw new Error(`projector: 표 ${scope} 의 이름이 없다`);
    return s;
  };
  const declOf = (d: number): NameRef => {
    const r = decls[d];
    if (!r) throw new Error(`projector: 선언 ${d} 가 없다`);
    return r;
  };
  const useOf = (u: number): NameRef => {
    const r = uses[u];
    if (!r) throw new Error(`projector: 쓰임 ${u} 가 없다`);
    return r;
  };

  const captionFor = (line: number, ops: StageOp[], last: boolean, meters: Obj): string[] => {
    const tablePart: string[] = [];
    const lookPart: string[] = [];
    for (const op of ops) {
      switch (op.k) {
        case 'pop':
          tablePart.push(t('caption.pop', '{table} lifted off', { table: tableLabel(op.scope) }));
          break;
        case 'push':
          tablePart.push(t('caption.push', '{table} stacked on top (height {h})', { table: tableLabel(op.scope), h: op.height }));
          break;
        case 'declare': {
          const d = declOf(op.decl);
          if (op.accepted) {
            tablePart.push(t('caption.place', '{name} written into {table}', { name: d.name, table: tableLabel(op.table) }));
          } else {
            tablePart.push(
              t('caption.clash', '{name} declared twice — {table} already holds L{line}', {
                name: d.name,
                table: tableLabel(op.table),
                line: declOf(op.clash).line,
              }),
            );
          }
          break;
        }
        case 'lookup': {
          const u = useOf(op.use);
          if (op.found) {
            lookPart.push(
              t('caption.hit', '{name} → L{line} (table {depth} from the top)', {
                name: u.name,
                line: declOf(op.decl).line,
                depth: op.scanned,
              }),
            );
          } else {
            lookPart.push(t('caption.miss', '{name} → no declaration (all {n} tables scanned)', { name: u.name, n: op.scanned }));
          }
          break;
        }
      }
    }
    const first = [`L${line}`, ...lookPart].join('  ·  ');
    const second = [...tablePart];
    if (last) {
      second.push(
        t('caption.end', 'Read to the end — links {links} · errors {errors}', {
          links: num(meters, 'links'),
          errors: num(meters, 'errors'),
        }),
      );
    }
    return lookPart.length > 0 ? [first, second.join('  ·  ')] : [[`L${line}`, ...second].join('  ·  '), ''];
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'round': {
          const p = obj(event.payload, 'round payload');
          const scopes = list(p, 'scopes').map((x) => {
            const s = obj(x, 'scopes 항목');
            return { kind: num(s, 'kind'), headName: str(s, 'headName') };
          });
          tableLabels = scopes.map((s) =>
            s.kind === 0 ? t('label.table.top', 'outermost') : t('label.table.body', '{name} body', { name: s.headName }),
          );
          decls = readRefs(p, 'decls');
          uses = readRefs(p, 'uses');
          const rule = ruleLabel(str(p, 'ruleId'));
          const round: StageRound = {
            ruleLabel: rule,
            lines: readLines(p),
            tableLabels,
            names: list(p, 'names').map((x) => {
              if (typeof x !== 'string') throw new Error('projector: names 에 글자 아닌 것이 있다');
              return x;
            }),
            decls,
            uses,
            stack: readStack(p),
            caption: [t('caption.start', '{rule}: reading starts with one empty outermost table', { rule }), ''],
          };
          code?.clearHighlight();
          stage?.startRound(round);
          return;
        }
        case 'line': {
          const p = obj(event.payload, 'line payload');
          const ops = readOps(p);
          const line = num(p, 'line');
          const caption = captionFor(line, ops, bool(p, 'last'), obj(p.meters, 'meters'));
          stage?.showLine({ line, ops, stack: readStack(p), caption }, MOTION_MS / Math.max(0.25, speed()));
          return;
        }
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        default:
          throw new Error(`projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      tableLabels = [];
      decls = [];
      uses = [];
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
