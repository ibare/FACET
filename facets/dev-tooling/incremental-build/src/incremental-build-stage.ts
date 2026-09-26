/**
 * incremental-build 무대 — 규칙 그래프 위로 "다시" 가 타고 오르다 막히는 자리.
 *
 * - 소스가 바닥, 대상이 깊이대로 위에 선다. 화살은 대상이 제 입력을 가리킨다.
 * - 마디마다 딱지 둘(시각 · 지문). 판정 방식이 읽는 딱지가 왼쪽 판정 자리로 옮겨 가 테두리를 두른다.
 * - "오른 끝" 막대가 바뀜이 올라온 마디 위로 옮겨 가며, 막히면 그 자리에서 색과 글이 바뀐다.
 * - 다시 세운 대상은 그 까닭이 된 입력에서 불빛이 화살을 타고 올라온다.
 * - 고치는 파일의 줄은 그 파일 아래에 두고, 저장하면 바뀐 줄이 그 자리에서 바뀐다.
 *
 * 무대는 셈하지 않는다 — 판정 · 시각 · 지문 · 깊이 · 오른 끝은 모두 payload 로 받는다. 자리 셈(배치)만 한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageNodeInit = { name: string; time: string; fp: string };
export type StageTargetInit = { name: string; inputs: string[]; depth: number; time: string; out: string };
export type StageInit = {
  policy: 'time' | 'input-hash' | 'output-hash';
  edited: string;
  lines: string[];
  commentLines: number[];
  sources: StageNodeInit[];
  targets: StageTargetInit[];
};
export type StageSave = {
  name: string;
  timeAfter: string;
  timeBefore: string;
  fpBefore: string;
  fpAfter: string;
  same: boolean;
  lines: string[];
  changedLines: number[];
  commentLines: number[];
};
export type StageVerdict = {
  name: string;
  verdict: 'keep' | 'rebuild' | 'hold';
  input: string | null;
  timeBefore: string;
  timeAfter: string;
  outBefore: string;
  outAfter: string;
  outSame: boolean | null;
};
export type StageReach = { at: string; state: 'rising' | 'blocked' | 'top' };

/** projector 가 부르는 표면 */
export type IncrementalBuildStage = {
  init(p: StageInit, ms: number): void;
  save(p: StageSave, ms: number): void;
  verdict(p: StageVerdict, ms: number): void;
  reach(p: StageReach, ms: number): void;
  caption(text: string): void;
  destroy(): void;
};

const W = 720;
const H = 490;
const NODE_W = 128;
const NODE_H = 60;
const SRC_TOP = 354;
const TOP_LIMIT = 84;
const BADGE_W = 56;
const BADGE_H = 18;
const SLOT_X = [6, 66];
const BADGE_Y = 24;
const SHEET_W = 230;
const LINE_H = 16;
const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);

const SVG_NS = 'http://www.w3.org/2000/svg';

type Badge = { g: SVGGElement; box: SVGRectElement; value: SVGTextElement; prev: SVGTextElement };
type NodeView = {
  name: string;
  isSource: boolean;
  cx: number;
  top: number;
  g: SVGGElement;
  frame: SVGRectElement;
  tagBox: SVGRectElement;
  tag: SVGTextElement;
  time: Badge;
  fp: Badge;
};
type EdgeView = { from: string; to: string; line: SVGLineElement; head: SVGPathElement };

export const incrementalBuildStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const frames = new Set<number>();

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const place = (g: SVGGElement, x: number, y: number, ms: number) => {
      g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out` : 'none';
      g.style.transform = `translate(${x}px, ${y}px)`;
    };

    el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);
    const captionText = el('text', {
      x: 16, y: 26, 'font-family': fonts.body, 'font-size': PX_SM, fill: colors.text, 'font-weight': 600,
    }, svg);
    const ruleText = el('text', { x: 16, y: 48, 'font-family': fonts.body, 'font-size': PX_XS, fill: colors.textMuted }, svg);
    const edgeLayer = el('g', {}, svg);
    const nodeLayer = el('g', {}, svg);
    const sheetLayer = el('g', {}, svg);
    const reachLayer = el('g', {}, svg);
    const dotLayer = el('g', {}, svg);
    const legend = el('text', {
      x: W - 12, y: H - 10, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': PX_XS, fill: colors.textMuted,
    }, svg);

    const nodes = new Map<string, NodeView>();
    const edges: EdgeView[] = [];
    let layoutKey = '';
    let sheetLines: { box: SVGRectElement; text: SVGTextElement }[] = [];

    // 오른 끝 막대
    const reachG = el('g', { opacity: 0 }, reachLayer);
    const reachBar = el('rect', { x: 0, y: 0, width: NODE_W + 8, height: 5, rx: 2.5, fill: colors.border }, reachG);
    const reachLabel = el('text', {
      x: NODE_W + 14, y: 5, 'font-family': fonts.body, 'font-size': PX_XS, 'font-weight': 700, fill: colors.text,
    }, reachG);
    let reachShown = false;

    const need = (name: string): NodeView => {
      const node = nodes.get(name);
      if (!node) throw new Error(`incremental-build-stage: 모르는 마디 '${name}'`);
      return node;
    };

    const makeBadge = (parent: SVGGElement): Badge => {
      const g = el('g', {}, parent);
      const box = el('rect', { x: 0, y: 0, width: BADGE_W, height: BADGE_H, rx: 3, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, g);
      const value = el('text', {
        x: BADGE_W / 2, y: 13, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': PX_XS, fill: colors.text,
      }, g);
      const prev = el('text', {
        x: BADGE_W / 2, y: BADGE_H + 12, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': PX_XS, fill: colors.textMuted,
      }, g);
      return { g, box, value, prev };
    };

    const build = (p: StageInit) => {
      nodeLayer.textContent = '';
      edgeLayer.textContent = '';
      sheetLayer.textContent = '';
      nodes.clear();
      edges.length = 0;

      // 소스 차례 — 대상 입력에 처음 나오는 차례 (배치만 한다)
      const srcOrder: string[] = [];
      const srcNames = new Set(p.sources.map((s) => s.name));
      for (const tg of p.targets) for (const i of tg.inputs) if (srcNames.has(i) && !srcOrder.includes(i)) srcOrder.push(i);
      for (const s of p.sources) if (!srcOrder.includes(s.name)) srcOrder.push(s.name);
      const pitch = srcOrder.length > 1 ? Math.min(155, (W - 60 - NODE_W - 70) / (srcOrder.length - 1)) : 0;
      const cxOf = new Map<string, number>();
      srcOrder.forEach((name, i) => cxOf.set(name, 130 + i * pitch));

      const maxDepth = Math.max(1, ...p.targets.map((x) => x.depth));
      const rowGap = Math.min(90, (SRC_TOP - TOP_LIMIT) / maxDepth);
      const topOf = (depth: number) => SRC_TOP - depth * rowGap;
      const byDepth = [...p.targets].sort((a, b) => a.depth - b.depth);
      for (const tg of byDepth) {
        if (tg.inputs.length === 0) throw new Error(`incremental-build-stage: '${tg.name}' 의 입력이 비었다`);
        const xs = tg.inputs.map((i) => {
          const x = cxOf.get(i);
          if (x === undefined) throw new Error(`incremental-build-stage: '${tg.name}' 의 입력 '${i}' 자리가 없다`);
          return x;
        });
        cxOf.set(tg.name, xs.reduce((a, b) => a + b, 0) / xs.length);
      }

      const makeNode = (name: string, isSource: boolean, top: number) => {
        const cx = cxOf.get(name);
        if (cx === undefined) throw new Error(`incremental-build-stage: '${name}' 자리가 없다`);
        const g = el('g', {}, nodeLayer);
        place(g, cx - NODE_W / 2, top, 0);
        const frame = el('rect', {
          x: 0, y: 0, width: NODE_W, height: NODE_H, rx: 6,
          fill: isSource ? colors.bgSubtle : colors.bg, stroke: colors.border, 'stroke-width': 1.5,
        }, g);
        el('text', {
          x: 8, y: 17, 'font-family': fonts.mono, 'font-size': PX_SM, 'font-weight': 700, fill: colors.text,
        }, g).textContent = name;
        const tagBox = el('rect', { x: NODE_W - 6, y: 5, width: 0, height: 16, rx: 3, fill: 'none' }, g);
        const tag = el('text', {
          x: NODE_W - 8, y: 17, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': PX_XS, fill: colors.textMuted,
        }, g);
        const time = makeBadge(g);
        const fp = makeBadge(g);
        nodes.set(name, { name, isSource, cx, top, g, frame, tagBox, tag, time, fp });
      };
      for (const s of p.sources) makeNode(s.name, true, SRC_TOP);
      for (const tg of p.targets) makeNode(tg.name, false, topOf(tg.depth));

      for (const tg of p.targets) {
        const a = need(tg.name);
        for (const i of tg.inputs) {
          const b = need(i);
          const x1 = a.cx;
          const y1 = a.top + NODE_H;
          const x2 = b.cx;
          const y2 = b.top - 2;
          const line = el('line', { x1, y1, x2, y2, stroke: colors.border, 'stroke-width': 1.5 }, edgeLayer);
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const hx = (d: number, s: number) => x2 - 8 * Math.cos(ang) + s * d * Math.sin(ang);
          const hy = (d: number, s: number) => y2 - 8 * Math.sin(ang) - s * d * Math.cos(ang);
          const head = el('path', {
            d: `M${x2},${y2} L${hx(4, 1)},${hy(4, 1)} L${hx(4, -1)},${hy(4, -1)} Z`, fill: colors.border,
          }, edgeLayer);
          edges.push({ from: tg.name, to: i, line, head });
        }
      }

      // 줄 이름 (소스 · 대상)
      const firstTarget = byDepth[0];
      el('text', {
        x: 8, y: SRC_TOP + NODE_H / 2 + 4, 'font-family': fonts.body, 'font-size': PX_XS, fill: colors.textMuted,
      }, nodeLayer).textContent = t('label.source', 'sources');
      if (firstTarget) {
        el('text', {
          x: 8, y: topOf(firstTarget.depth) + NODE_H / 2 + 4, 'font-family': fonts.body, 'font-size': PX_XS, fill: colors.textMuted,
        }, nodeLayer).textContent = t('label.target', 'targets');
      }

      // 고치는 파일의 줄
      const ed = need(p.edited);
      const sx = ed.cx - NODE_W / 2;
      const sy = SRC_TOP + NODE_H + 10;
      el('line', { x1: ed.cx - 30, y1: SRC_TOP + NODE_H, x2: ed.cx - 30, y2: sy, stroke: colors.border, 'stroke-dasharray': '2 2' }, sheetLayer);
      el('rect', {
        x: sx - 6, y: sy, width: SHEET_W, height: p.lines.length * LINE_H + 8, rx: 4,
        fill: colors.bgSubtle, stroke: colors.border,
      }, sheetLayer);
      sheetLines = p.lines.map((_, i) => {
        const box = el('rect', {
          x: sx - 3, y: sy + 4 + i * LINE_H, width: SHEET_W - 6, height: LINE_H, rx: 2, fill: 'none', stroke: 'none',
        }, sheetLayer);
        const text = el('text', {
          x: sx + 2, y: sy + 16 + i * LINE_H, 'font-family': fonts.mono, 'font-size': PX_XS, fill: colors.text,
          'xml:space': 'preserve',
        }, sheetLayer);
        return { box, text };
      });
    };

    const setBadge = (b: Badge, value: string, prev: string) => {
      b.value.textContent = value;
      b.prev.textContent = prev;
    };
    const frameBadge = (b: Badge, read: boolean) => {
      b.box.setAttribute('stroke', read ? colors.accent : colors.border);
      b.box.setAttribute('stroke-width', read ? '2.5' : '1');
      b.value.setAttribute('font-weight', read ? '700' : '400');
    };
    /** 판정이 읽는 딱지를 왼쪽 판정 자리로 옮긴다 */
    const arrange = (node: NodeView, reads: 'time' | 'fp' | null, ms: number) => {
      const fpFirst = reads === 'fp';
      place(node.time.g, SLOT_X[fpFirst ? 1 : 0] as number, BADGE_Y, ms);
      place(node.fp.g, SLOT_X[fpFirst ? 0 : 1] as number, BADGE_Y, ms);
      frameBadge(node.time, reads === 'time');
      frameBadge(node.fp, reads === 'fp');
    };
    const setTag = (node: NodeView, text: string, tone: 'none' | 'rebuild' | 'hold' | 'keep' | 'saved') => {
      node.tag.textContent = text;
      const w = text.length === 0 ? 0 : text.length * PX_XS * 0.62 + 10;
      node.tagBox.setAttribute('x', String(NODE_W - 4 - w));
      node.tagBox.setAttribute('width', String(w));
      const fill = tone === 'rebuild' ? colors.itemActive : 'none';
      const stroke = tone === 'hold' ? colors.itemActive : tone === 'saved' ? colors.itemComparing : 'none';
      node.tagBox.setAttribute('fill', fill);
      node.tagBox.setAttribute('stroke', stroke);
      node.tag.setAttribute('x', String(NODE_W - 9));
      node.tag.setAttribute('fill', tone === 'rebuild' ? colors.textInverse : tone === 'keep' ? colors.textMuted : colors.text);
      node.tag.setAttribute('font-weight', tone === 'keep' ? '400' : '700');
    };
    const setFrame = (node: NodeView, tone: 'plain' | 'rebuild' | 'hold' | 'keep' | 'saved') => {
      const stroke = tone === 'rebuild' || tone === 'hold' ? colors.itemActive : tone === 'saved' ? colors.itemComparing : colors.border;
      node.frame.setAttribute('stroke', stroke);
      node.frame.setAttribute('stroke-width', tone === 'plain' || tone === 'keep' ? '1.5' : '3');
      node.frame.setAttribute('stroke-dasharray', tone === 'hold' ? '6 3' : 'none');
      node.g.setAttribute('opacity', tone === 'keep' ? '0.62' : '1');
    };
    const setSheet = (lines: string[], changed: number[], comments: number[], ms: number) => {
      if (lines.length !== sheetLines.length) {
        throw new Error(`incremental-build-stage: 줄 수가 ${sheetLines.length} 에서 ${lines.length} 로 바뀌었다`);
      }
      lines.forEach((line, i) => {
        const row = sheetLines[i];
        if (!row) throw new Error(`incremental-build-stage: ${i} 번 줄 자리가 없다`);
        row.text.textContent = line;
        row.text.setAttribute('fill', comments.includes(i) ? colors.textMuted : colors.text);
        row.text.setAttribute('font-style', comments.includes(i) ? 'italic' : 'normal');
        const hit = changed.includes(i);
        row.box.setAttribute('fill', hit ? colors.bg : 'none');
        row.box.setAttribute('stroke', hit ? colors.itemComparing : 'none');
        row.text.style.transition = 'none';
        row.text.style.transform = hit ? 'translate(14px, 0px)' : 'translate(0px, 0px)';
        if (hit) {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            row.text.style.transition = `transform ${ms}ms ease-out`;
            row.text.style.transform = 'translate(0px, 0px)';
          });
          frames.add(id);
        }
      });
    };
    const stopDots = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      dotLayer.textContent = '';
    };
    /** 까닭이 된 입력에서 대상으로 불빛이 화살을 타고 오른다 */
    const climb = (edge: EdgeView, ms: number) => {
      const x0 = Number(edge.line.getAttribute('x2'));
      const y0 = Number(edge.line.getAttribute('y2'));
      const x1 = Number(edge.line.getAttribute('x1'));
      const y1 = Number(edge.line.getAttribute('y1'));
      const dot = el('circle', { cx: x0, cy: y0, r: 5, fill: colors.itemActive }, dotLayer);
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / Math.max(1, ms));
        dot.setAttribute('cx', String(x0 + (x1 - x0) * k));
        dot.setAttribute('cy', String(y0 + (y1 - y0) * k));
        if (k < 1) {
          const id = requestAnimationFrame(tick);
          frames.add(id);
        } else {
          dot.remove();
        }
      };
      const id = requestAnimationFrame(tick);
      frames.add(id);
    };

    const readsFor = (policy: StageInit['policy'], isSource: boolean): 'time' | 'fp' | null => {
      if (policy === 'time') return 'time';
      if (isSource) return 'fp';
      return policy === 'output-hash' ? 'fp' : null;
    };
    const policyName = (policy: StageInit['policy']) =>
      policy === 'time'
        ? t('label.policy.time', 'timestamp')
        : policy === 'input-hash'
          ? t('label.policy.inputHash', 'input fingerprint')
          : t('label.policy.outputHash', 'output fingerprint');
    const policyRule = (policy: StageInit['policy']) =>
      policy === 'time'
        ? t('rule.time', 'Rebuild if an input is newer than the target')
        : policy === 'input-hash'
          ? t('rule.inputHash', "Rebuild if an input's fingerprint changed or the input was rebuilt")
          : t('rule.outputHash', 'Like input fingerprint, but a rebuilt result that did not change is not passed up');

    const api: ViewInstance & IncrementalBuildStage = {
      init(p, ms) {
        stopDots();
        const key = [...p.sources.map((s) => s.name), '|', ...p.targets.map((x) => `${x.name}<${x.inputs.join(',')}`), '|', p.edited, p.lines.length].join(' ');
        if (key !== layoutKey) {
          build(p);
          layoutKey = key;
          for (const node of nodes.values()) arrange(node, readsFor(p.policy, node.isSource), 0);
        }
        for (const s of p.sources) {
          const node = need(s.name);
          setBadge(node.time, s.time, '');
          setBadge(node.fp, s.fp, '');
          setTag(node, '', 'none');
          setFrame(node, 'plain');
          arrange(node, readsFor(p.policy, true), ms);
        }
        for (const x of p.targets) {
          const node = need(x.name);
          setBadge(node.time, x.time, '');
          setBadge(node.fp, x.out, '');
          setTag(node, '', 'none');
          setFrame(node, 'plain');
          arrange(node, readsFor(p.policy, false), ms);
        }
        for (const e of edges) {
          e.line.setAttribute('stroke', colors.border);
          e.line.setAttribute('stroke-width', '1.5');
          e.head.setAttribute('fill', colors.border);
        }
        setSheet(p.lines, [], p.commentLines, ms);
        ruleText.textContent = `${policyName(p.policy)} · ${policyRule(p.policy)}`;
        legend.textContent = t('legend.read', 'Framed tag: what the verdict reads');
        // 자리는 남기고 결론(색 · 글)은 걷는다
        reachBar.setAttribute('fill', colors.border);
        reachLabel.textContent = '';
        reachG.setAttribute('opacity', reachShown ? '0.35' : '0');
        captionText.textContent = '';
      },
      save(p, ms) {
        const node = need(p.name);
        setBadge(node.time, p.timeAfter, `← ${p.timeBefore}`);
        setBadge(node.fp, p.fpAfter, p.same ? t('label.same', 'same') : `← ${p.fpBefore}`);
        setTag(node, t('label.saved', 'saved'), 'saved');
        setFrame(node, 'saved');
        setSheet(p.lines, p.changedLines, p.commentLines, ms);
      },
      verdict(p, ms) {
        const node = need(p.name);
        if (p.verdict === 'keep') {
          setTag(node, t('verdict.keep', 'keep'), 'keep');
          setFrame(node, 'keep');
          return;
        }
        setBadge(node.time, p.timeAfter, `← ${p.timeBefore}`);
        setBadge(node.fp, p.outAfter, p.outSame ? t('label.same', 'same') : `← ${p.outBefore}`);
        if (p.verdict === 'hold') {
          setTag(node, t('verdict.hold', 'same result'), 'hold');
          setFrame(node, 'hold');
        } else {
          setTag(node, t('verdict.rebuild', 'rebuild'), 'rebuild');
          setFrame(node, 'rebuild');
        }
        if (p.input === null) throw new Error(`incremental-build-stage: 다시 세운 '${p.name}' 의 까닭 입력이 없다`);
        const edge = edges.find((e) => e.from === p.name && e.to === p.input);
        if (!edge) throw new Error(`incremental-build-stage: 화살 ${p.name} → ${p.input} 이 없다`);
        edge.line.setAttribute('stroke', colors.itemActive);
        edge.line.setAttribute('stroke-width', '3');
        edge.head.setAttribute('fill', colors.itemActive);
        climb(edge, ms);
      },
      reach(p, ms) {
        const node = need(p.at);
        const x = node.cx - (NODE_W + 8) / 2;
        const y = node.top - 10;
        place(reachG, x, y, reachShown ? ms : 0);
        reachShown = true;
        reachG.setAttribute('opacity', '1');
        const fill = p.state === 'blocked' ? colors.danger : p.state === 'top' ? colors.primary : colors.itemActive;
        reachBar.setAttribute('fill', fill);
        reachBar.setAttribute('height', p.state === 'rising' ? '5' : '7');
        reachLabel.setAttribute('fill', p.state === 'blocked' ? colors.danger : colors.text);
        reachLabel.textContent =
          p.state === 'blocked'
            ? t('reach.blocked', 'stops here')
            : p.state === 'top'
              ? t('reach.top', 'reached the top')
              : t('reach.rising', 'rising');
      },
      caption(text) {
        captionText.textContent = text;
      },
      destroy() {
        stopDots();
        svg.textContent = '';
      },
    };
    return api;
  },
};
