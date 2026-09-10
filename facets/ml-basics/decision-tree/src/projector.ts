/**
 * decisionTree projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 두 가지를 맡는다.
 *   1. 나무의 사건(`node-open` · `cut-try` · `node-split` · `node-leaf` …)을
 *      `decision-tree-stage` 의 메서드로 번역한다.
 *   2. `phase` 를 code-view 의 `highlightPhase` 로 넘겨 코드 줄과 재생을 맞물린다.
 *
 * 화면 문안은 전부 여기서 `runtime.t` 로 조회한다 (C10). algorithm 은 수와
 * **키**만 보내고, 어떤 말로 부를지는 저작자가 `facet.ts::messages` 에서 정한다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { NodeOpened, TreeNodeShape } from './algorithm.js';

/** stage 가 노출하는 표면 (C9 — 열린 ViewInstance 를 한 곳에서 좁힌다). */
type Stage = {
  resetTree?(limit: number): void;
  openNode?(node: NodeOpened): void;
  showCut?(id: number, axis: 0 | 1, cut: number): void;
  keepBest?(id: number, axis: 0 | 1, cut: number): void;
  splitNode?(id: number, axis: 0 | 1, cut: number): void;
  markLeaf?(id: number, label: 0 | 1): void;
  focusNode?(id: number): void;
  setTree?(nodes: TreeNodeShape[], limit: number): void;
  setCaption?(text: string): void;
  setSummary?(text: string): void;
  setVerdict?(text: string): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** 축 이름과 이름표는 도형에 새겨진 표식이라 번역하지 않는다 (C10). */
const AXIS_MARK = ['x', 'y'] as const;
const CLASS_MARK = ['A', 'B'] as const;

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function axisOf(v: unknown): 0 | 1 {
  return v === 1 ? 1 : 0;
}

function labelOf(v: unknown): 0 | 1 {
  return v === 1 ? 1 : 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  // 런타임 가드가 뒤따르는 좁히개다 — 필드는 아래에서 하나씩 typeof 로 거른다 (C9).
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function readOpened(payload: unknown): NodeOpened {
  const p = asRecord(payload);
  const side = p.side === 'L' || p.side === 'R' ? p.side : 'root';
  return {
    id: num(p.id),
    parent: num(p.parent, -1),
    side,
    depth: num(p.depth),
    a: num(p.a),
    b: num(p.b),
    gini: num(p.gini),
  };
}

function readShapes(payload: unknown): TreeNodeShape[] {
  const p = asRecord(payload);
  if (!Array.isArray(p.nodes)) return [];
  const out: TreeNodeShape[] = [];
  for (const raw of p.nodes) {
    const n = asRecord(raw);
    const side = n.side === 'L' || n.side === 'R' ? n.side : 'root';
    out.push({
      id: num(n.id),
      parent: num(n.parent, -1),
      side,
      depth: num(n.depth),
      a: num(n.a),
      b: num(n.b),
      gini: num(n.gini),
      leaf: n.leaf === true,
      label: labelOf(n.label),
      axis: axisOf(n.axis),
      cut: num(n.cut),
      wgini: num(n.wgini),
      drop: num(n.drop),
      left: num(n.left, -1),
      right: num(n.right, -1),
    });
  }
  return out;
}

export const decisionTreeProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const t: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as Stage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;

  const say = (text: string): void => stage?.setCaption?.(text);

  const summaryLine = (p: Record<string, unknown>): string =>
    t('summary.line', 'depth cap {depthLimit} · leaves {leafCount} · correct {correct} of {total}', {
      depthLimit: num(p.depthLimit),
      leafCount: num(p.leafCount),
      correct: num(p.correct),
      total: num(p.total),
    });

  const verdictLine = (p: Record<string, unknown>): string => {
    const correct = num(p.correct);
    const total = num(p.total);
    if (p.verdictKey === 'verdict.noGain') {
      return t(
        'verdict.noGain',
        'One more question, and nothing was gained — still {correct} right out of {total}.',
        { correct, total },
      );
    }
    if (p.verdictKey === 'verdict.onePoint') {
      return t(
        'verdict.onePoint',
        'The last questions fence off a single point. {correct} of {total} — the tree has learned the noise by heart.',
        { correct, total },
      );
    }
    return t('verdict.gain', 'One more question, and more points land right — {correct} of {total}.', {
      correct,
      total,
    });
  };

  const startCaption = (): string =>
    t('caption.start', 'At every node, try each cut and keep the one that mixes least.');

  function onEvent(event: FacetRuntimeEvent): void {
    const p = asRecord(event.payload);
    switch (event.type) {
      case 'phase': {
        const name = typeof p.phase === 'string' ? p.phase : null;
        code?.highlightPhase?.(name);
        return;
      }
      case 'tree-reset': {
        stage?.resetTree?.(num(p.depthLimit, 1));
        stage?.setSummary?.('');
        stage?.setVerdict?.('');
        say(startCaption());
        return;
      }
      case 'node-open': {
        const node = readOpened(event.payload);
        stage?.openNode?.(node);
        say(
          t('caption.open', 'Node {id} at depth {depth} — A {a}, B {b}, gini {gini}.', {
            id: node.id,
            depth: node.depth,
            a: node.a,
            b: node.b,
            gini: node.gini.toFixed(3),
          }),
        );
        return;
      }
      case 'axis-sorted': {
        const axis = axisOf(p.axis);
        stage?.focusNode?.(num(p.id));
        say(t('caption.axis', 'Lining the points up along {axis}.', { axis: AXIS_MARK[axis] }));
        return;
      }
      case 'cut-try': {
        const axis = axisOf(p.axis);
        const cut = num(p.cut);
        stage?.showCut?.(num(p.id), axis, cut);
        say(
          t('caption.try', 'Trying {axis} < {cut} — weighted gini {wgini}.', {
            axis: AXIS_MARK[axis],
            cut: cut.toFixed(2),
            wgini: num(p.wgini).toFixed(3),
          }),
        );
        return;
      }
      case 'cut-best': {
        const axis = axisOf(p.axis);
        const cut = num(p.cut);
        stage?.keepBest?.(num(p.id), axis, cut);
        say(
          t('caption.best', 'Best so far — {axis} < {cut}, gini falls by {drop}.', {
            axis: AXIS_MARK[axis],
            cut: cut.toFixed(2),
            drop: num(p.drop).toFixed(3),
          }),
        );
        return;
      }
      case 'node-partition': {
        const axis = axisOf(p.axis);
        const cut = num(p.cut);
        stage?.splitNode?.(num(p.id), axis, cut);
        say(
          t('caption.partition', 'Dealing the points into two piles at {axis} < {cut}.', {
            axis: AXIS_MARK[axis],
            cut: cut.toFixed(2),
          }),
        );
        return;
      }
      case 'node-split': {
        const axis = axisOf(p.axis);
        const cut = num(p.cut);
        stage?.splitNode?.(num(p.id), axis, cut);
        say(
          t('caption.split', 'Node {id} settles on {axis} < {cut} — gini falls by {drop}.', {
            id: num(p.id),
            axis: AXIS_MARK[axis],
            cut: cut.toFixed(2),
            drop: num(p.drop).toFixed(3),
          }),
        );
        return;
      }
      case 'recurse-into': {
        stage?.focusNode?.(num(p.id));
        say(
          p.side === 'R'
            ? t('caption.recurseRight', 'The same question again, now on the right pile.')
            : t('caption.recurseLeft', 'The same question again, now on the left pile.'),
        );
        return;
      }
      case 'node-leaf': {
        const label = labelOf(p.label);
        stage?.markLeaf?.(num(p.id), label);
        say(
          t('caption.leaf', 'A leaf — A {a}, B {b}. It answers {label}.', {
            a: num(p.a),
            b: num(p.b),
            label: CLASS_MARK[label],
          }),
        );
        return;
      }
      case 'tree-snapshot': {
        stage?.setTree?.(readShapes(event.payload), num(p.depthLimit, 1));
        stage?.setSummary?.(summaryLine(p));
        stage?.setVerdict?.(verdictLine(p));
        say(
          t('caption.snapshot', 'Depth cap {depthLimit} — the tree regrown to that cap.', {
            depthLimit: num(p.depthLimit),
          }),
        );
        code?.clearHighlight?.();
        return;
      }
      case 'done': {
        stage?.setSummary?.(summaryLine(p));
        stage?.setVerdict?.(verdictLine(p));
        say(
          t('caption.done', 'Depth cap {depthLimit} — the tree has stopped growing.', {
            depthLimit: num(p.depthLimit),
          }),
        );
        code?.clearHighlight?.();
        return;
      }
      default:
        // 그 밖의 어휘는 조용히 흘린다 — 이 facet 이 내는 것은 위가 전부다 (C2).
        return;
    }
  }

  return {
    onInit(): void {
      stage?.setSummary?.('');
      stage?.setVerdict?.('');
      say(startCaption());
    },
    onEvent,
    onReset(): void {
      code?.clearHighlight?.();
      stage?.setSummary?.('');
      stage?.setVerdict?.('');
      say(startCaption());
    },
  };
};
