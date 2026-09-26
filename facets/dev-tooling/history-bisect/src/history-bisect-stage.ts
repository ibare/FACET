/**
 * history-bisect 무대 — 한 줄기 커밋 열여섯 위에서 세 가지가 움직인다.
 *
 * - 깨진 빌드 무리(점선 울타리): 판이 열릴 때 새 k · 자리로 자라나거나 줄기를 따라 옮겨 간다
 * - 시험 표식(줄기 아래 삼각): 가운데로 가고, 가운데가 깨진 빌드면 옆 칸으로 비켜 선다
 * - 후보 괄호(줄기 아래): 판정마다 좁아지고 버린 이력 덩이는 아래로 떨어져 나간다. 끝에 답 괄호가 된다
 *
 * 무대는 셈하지 않는다 — 고른 커밋 · 버린 범위 · 후보 범위는 projector 가 payload 에서 옮겨 준다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const W = 720;
const H = 276;
const LEFT = 40;
const RIGHT = W - 40;
const R = 14;
const ROW_Y = 96;
const TAG_Y = ROW_Y - R - 10;
const FENCE_TOP = ROW_Y - R - 26;
const FENCE_BOTTOM = ROW_Y + R + 6;
const FENCE_LABEL_Y = FENCE_TOP - 8;
const MARK_TIP = ROW_Y + R + 10;
const MARK_BASE = MARK_TIP + 12;
const MARK_LABEL_Y = MARK_BASE + 14;
const BRACKET_Y = 162;
const BRACKET_TICK = 8;
const BRACKET_LABEL_Y = BRACKET_Y + 16;
const DROP = 124;
const CAPTION_Y = H - 10;
const SVG = 'http://www.w3.org/2000/svg';

export type RoundView = {
  commits: string[];
  good: number;
  bad: number;
  broken: number[];
  anchor: number;
  candidateFrom: number;
  candidateTo: number;
};

export type HistoryBisectStage = ViewInstance & {
  round(p: RoundView, ms: number): Promise<void>;
  pick(p: { mid: number; pick: number; skipped: boolean }, ms: number): Promise<void>;
  verdict(
    p: { commit: number; verdict: 'good' | 'bad'; dropFrom: number; dropTo: number; candidateFrom: number; candidateTo: number },
    ms: number,
  ): Promise<void>;
  stuck(p: { mid: number }, ms: number): Promise<void>;
  answer(p: { from: number; to: number }, ms: number): Promise<void>;
  caption(text: string): void;
  clear(): void;
};

type Node = {
  g: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  tag: SVGTextElement;
  dy: number;
  dropped: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  return e;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const historyBisectStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): HistoryBisectStage {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    const isInstant = params.isInstant ?? (() => false);
    const monoPx = parseFloat(fontSizes.xs);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /** 진행률 0→1 을 ms 동안 그린다. 되짚기 · 파기 · 0ms 면 끝 상태로 건너뛴다. */
    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          draw(1);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          if (!waiters.has(wake)) return;
          const p = Math.min(1, (now - start) / ms);
          draw(ease(p));
          if (p < 1) {
            const id = requestAnimationFrame(tick);
            frames.add(id);
          } else {
            waiters.delete(wake);
            resolve();
          }
        };
        frames.add(requestAnimationFrame(tick));
      });
    }

    const root = el('g', {});
    svg.appendChild(root);
    const linkLayer = el('g', {});
    const fenceLayer = el('g', {});
    const nodeLayer = el('g', {});
    const markLayer = el('g', {});
    root.append(fenceLayer, linkLayer, nodeLayer, markLayer);

    // 깨진 빌드 울타리 — x · 폭이 움직인다
    const fence = el('rect', {
      y: FENCE_TOP,
      height: FENCE_BOTTOM - FENCE_TOP,
      rx: 8,
      fill: c.bgSubtle,
      stroke: c.textMuted,
      'stroke-width': 1.2,
      'stroke-dasharray': '4 3',
      opacity: 0,
    });
    const fenceLabel = el('text', {
      y: FENCE_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
      opacity: 0,
    });
    fenceLabel.textContent = t('label.broken', 'Does not build');
    fenceLayer.append(fence, fenceLabel);
    const fenceNow = { x: 0, w: 0 };

    // 시험 표식 — 줄기 아래 삼각
    const mark = el('g', { opacity: 0 });
    const markTri = el('path', {
      d: `M 0 ${MARK_TIP} L -8 ${MARK_BASE} L 8 ${MARK_BASE} Z`,
      fill: c.itemActive,
      stroke: c.itemActive,
      'stroke-width': 1.5,
    });
    const markLabel = el('text', {
      y: MARK_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.text,
    });
    markLabel.textContent = t('label.test', 'Test');
    mark.append(markTri, markLabel);
    markLayer.appendChild(mark);
    let markX: number | null = null;

    // 후보 괄호 — 양 끝이 움직인다
    const bracket = el('path', { fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5, opacity: 0 });
    const bracketLabel = el('text', {
      y: BRACKET_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
      opacity: 0,
    });
    markLayer.append(bracket, bracketLabel);
    const bracketNow = { x1: 0, x2: 0 };

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    let commits: string[] = [];
    let nodes: Node[] = [];

    const xOf = (n: number): number => {
      if (commits.length < 2) throw new Error('history-bisect-stage: 커밋 줄기가 아직 없다 (round 전)');
      if (!Number.isInteger(n) || n < 1 || n > commits.length) throw new Error(`history-bisect-stage: 커밋 번호 ${n} 이 줄기 밖이다`);
      return LEFT + ((n - 1) * (RIGHT - LEFT)) / (commits.length - 1);
    };
    const nodeOf = (n: number): Node => {
      const node = nodes[n - 1];
      if (node === undefined) throw new Error(`history-bisect-stage: 커밋 번호 ${n} 의 노드가 없다`);
      return node;
    };

    function build(list: string[]): void {
      commits = [...list];
      linkLayer.replaceChildren();
      nodeLayer.replaceChildren();
      nodes = [];
      for (let i = 2; i <= commits.length; i++) {
        // 부모를 가리키는 화살 — 새것(오른쪽) → 옛것(왼쪽)
        const x1 = xOf(i) - R - 2;
        const x2 = xOf(i - 1) + R + 2;
        linkLayer.appendChild(el('line', { x1, y1: ROW_Y, x2: x2 + 5, y2: ROW_Y, stroke: c.border, 'stroke-width': 1.5 }));
        linkLayer.appendChild(el('path', { d: `M ${x2} ${ROW_Y} L ${x2 + 6} ${ROW_Y - 4} L ${x2 + 6} ${ROW_Y + 4} Z`, fill: c.border }));
      }
      commits.forEach((name, i) => {
        const g = el('g', { transform: `translate(${xOf(i + 1)}, 0)` });
        const circle = el('circle', { cx: 0, cy: ROW_Y, r: R });
        const label = el('text', {
          x: 0,
          y: ROW_Y + monoPx * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = name;
        const tag = el('text', {
          x: 0,
          y: TAG_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
        });
        g.append(circle, label, tag);
        nodeLayer.appendChild(g);
        nodes.push({ g, circle, label, tag, dy: 0, dropped: false });
      });
    }

    function paint(node: Node, look: 'plain' | 'broken' | 'good' | 'bad'): void {
      node.circle.removeAttribute('stroke-dasharray');
      if (look === 'plain') {
        node.circle.setAttribute('fill', c.itemDefault);
        node.circle.setAttribute('stroke', c.textMuted);
        node.circle.setAttribute('stroke-width', '1.5');
        node.label.setAttribute('fill', c.text);
        node.tag.textContent = '';
      } else if (look === 'broken') {
        node.circle.setAttribute('fill', c.bgSubtle);
        node.circle.setAttribute('stroke', c.textMuted);
        node.circle.setAttribute('stroke-width', '1.5');
        node.circle.setAttribute('stroke-dasharray', '3 2');
        node.label.setAttribute('fill', c.textMuted);
        node.tag.textContent = '';
      } else if (look === 'good') {
        node.circle.setAttribute('fill', c.primary);
        node.circle.setAttribute('stroke', c.primary);
        node.circle.setAttribute('stroke-width', '1.5');
        node.label.setAttribute('fill', c.textInverse);
        node.tag.setAttribute('fill', c.text);
        node.tag.textContent = t('label.good', 'good');
      } else {
        node.circle.setAttribute('fill', c.danger);
        node.circle.setAttribute('stroke', c.danger);
        node.circle.setAttribute('stroke-width', '1.5');
        node.label.setAttribute('fill', c.stateInk);
        node.tag.setAttribute('fill', c.danger);
        node.tag.textContent = t('label.bad', 'bad');
      }
    }

    const placeNode = (node: Node, x: number): void => {
      node.g.setAttribute('transform', `translate(${x}, ${node.dy})`);
      node.g.setAttribute('opacity', String(1 - 0.6 * (node.dy / DROP)));
    };

    const drawFence = (x: number, w: number): void => {
      fence.setAttribute('x', String(x));
      fence.setAttribute('width', String(Math.max(0, w)));
      fenceLabel.setAttribute('x', String(x + w / 2));
    };

    const drawBracket = (x1: number, x2: number): void => {
      bracket.setAttribute(
        'd',
        `M ${x1} ${BRACKET_Y - BRACKET_TICK} L ${x1} ${BRACKET_Y} L ${x2} ${BRACKET_Y} L ${x2} ${BRACKET_Y - BRACKET_TICK}`,
      );
      bracketLabel.setAttribute('x', String((x1 + x2) / 2));
    };
    const bracketSpan = (from: number, to: number): { x1: number; x2: number } => {
      if (from > to) throw new Error(`history-bisect-stage: 후보 범위 ${from}..${to} 가 비었다`);
      return { x1: xOf(from) - R - 4, x2: xOf(to) + R + 4 };
    };
    const moveBracket = (from: number, to: number, ms: number): Promise<void> => {
      const a = { ...bracketNow };
      const b = bracketSpan(from, to);
      return tween(ms, (p) => {
        bracketNow.x1 = lerp(a.x1, b.x1, p);
        bracketNow.x2 = lerp(a.x2, b.x2, p);
        drawBracket(bracketNow.x1, bracketNow.x2);
      });
    };

    const moveMark = (to: number, ms: number): Promise<void> => {
      const from = markX ?? to;
      mark.setAttribute('opacity', '1');
      return tween(ms, (p) => {
        markX = lerp(from, to, p);
        mark.setAttribute('transform', `translate(${markX}, 0)`);
      });
    };

    const setMarkLook = (blocked: boolean): void => {
      markTri.setAttribute('fill', blocked ? 'none' : c.itemActive);
      markTri.setAttribute('stroke', blocked ? c.danger : c.itemActive);
      markTri.setAttribute('stroke-dasharray', blocked ? '3 2' : 'none');
    };

    const instance: HistoryBisectStage = {
      async round(p, ms) {
        if (commits.length !== p.commits.length || commits.some((name, i) => name !== p.commits[i])) {
          build(p.commits);
          const s = bracketSpan(p.candidateFrom, p.candidateTo);
          bracketNow.x1 = s.x1;
          bracketNow.x2 = s.x2;
          fenceNow.x = xOf(p.anchor);
          fenceNow.w = 0;
        }
        // 앞 판의 결론을 걷는다 — 판정 딱지 · 버린 덩이 · 답 괄호 · 표식 · 캡션
        caption.textContent = '';
        mark.setAttribute('opacity', '0');
        setMarkLook(false);
        markX = null;
        bracket.setAttribute('stroke', c.textMuted);
        bracket.setAttribute('stroke-width', '1.5');
        bracket.setAttribute('opacity', '1');
        bracketLabel.setAttribute('fill', c.textMuted);
        bracketLabel.setAttribute('font-weight', '400');
        bracketLabel.setAttribute('opacity', '1');
        bracketLabel.textContent = t('label.candidates', 'Candidates');
        nodes.forEach((node, i) => {
          const num = i + 1;
          if (num === p.good) paint(node, 'good');
          else if (num === p.bad) paint(node, 'bad');
          else if (p.broken.includes(num)) paint(node, 'broken');
          else paint(node, 'plain');
        });

        // 울타리 — 새 무리로 자라나거나 옮겨 간다 (k = 0 이면 첫 칸으로 오그라든다)
        const fa = { ...fenceNow };
        const fb =
          p.broken.length === 0
            ? { x: xOf(p.anchor), w: 0 }
            : (() => {
                const lo = Math.min(...p.broken);
                const hi = Math.max(...p.broken);
                return { x: xOf(lo) - R - 6, w: xOf(hi) - xOf(lo) + 2 * (R + 6) };
              })();
        const showFence = p.broken.length > 0;
        if (showFence) {
          fence.setAttribute('opacity', '1');
          fenceLabel.setAttribute('opacity', '1');
        }
        const lifted = nodes.map((node) => ({ node, from: node.dy }));
        const bracketMove = moveBracket(p.candidateFrom, p.candidateTo, ms);
        await Promise.all([
          bracketMove,
          tween(ms, (q) => {
            fenceNow.x = lerp(fa.x, fb.x, q);
            fenceNow.w = lerp(fa.w, fb.w, q);
            drawFence(fenceNow.x, fenceNow.w);
            for (const { node, from } of lifted) {
              node.dy = lerp(from, 0, q);
              placeNode(node, xOf(nodes.indexOf(node) + 1));
            }
          }),
        ]);
        for (const node of nodes) node.dropped = false;
        if (!showFence) {
          fence.setAttribute('opacity', '0');
          fenceLabel.setAttribute('opacity', '0');
        }
      },

      async pick(p, ms) {
        setMarkLook(false);
        if (!p.skipped) {
          await moveMark(xOf(p.mid), ms);
          return;
        }
        // 가운데로 갔다가 깨진 빌드를 만나 옆 칸으로 비켜 선다
        await moveMark(xOf(p.mid), ms * 0.45);
        await moveMark(xOf(p.pick), ms * 0.55);
      },

      async verdict(p, ms) {
        paint(nodeOf(p.commit), p.verdict);
        const falling: Node[] = [];
        for (let n = p.dropFrom; n <= p.dropTo; n++) {
          const node = nodeOf(n);
          if (!node.dropped) falling.push(node);
          node.dropped = true;
        }
        await Promise.all([
          moveBracket(p.candidateFrom, p.candidateTo, ms),
          tween(ms, (q) => {
            for (const node of falling) {
              node.dy = lerp(0, DROP, q);
              placeNode(node, xOf(nodes.indexOf(node) + 1));
            }
          }),
        ]);
      },

      async stuck(p, ms) {
        setMarkLook(true);
        await moveMark(xOf(p.mid), ms);
      },

      async answer(p, ms) {
        mark.setAttribute('opacity', '0');
        markX = null;
        bracket.setAttribute('stroke', c.primary);
        bracket.setAttribute('stroke-width', '3');
        bracketLabel.setAttribute('fill', c.text);
        bracketLabel.setAttribute('font-weight', '600');
        bracketLabel.textContent = t('label.answer', 'Answer');
        await moveBracket(p.from, p.to, ms);
      },

      caption(text) {
        caption.textContent = text;
      },

      clear() {
        caption.textContent = '';
        mark.setAttribute('opacity', '0');
        markX = null;
        bracket.setAttribute('opacity', '0');
        bracketLabel.setAttribute('opacity', '0');
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
    return instance;
  },
};
