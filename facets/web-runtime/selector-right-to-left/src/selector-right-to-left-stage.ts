/**
 * selector-right-to-left stage — 두 자리가 함께 거슬러 오른다.
 *
 * 위에는 선택자, 아래에는 문서 트리. 선택자 안의 읽는 자리(토큰 테두리)는 오른쪽에서 왼쪽으로,
 * 문서 안의 보는 자리(요소를 두른 고리)는 아래에서 위로 움직인다. 둘을 잇는 끈이 "지금 견주는 짝" 이다.
 * 견줌마다 견준 요소 옆에 그 단순 선택자가 맞음/아님 표로 남는다. 뿌리 너머로 벗어나면 고리가
 * 트리 위 빈자리로 올라간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Cursor, SelectorScene, SceneNode } from './scene.js';

const H = 448;
const NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 20;
const CAPTION_LINE = 18;
const SEL_Y = 74;
const TOKEN_H = 32;
const TOKEN_GAP = 18;
const VOID_Y = 124;
const TREE_TOP = 166;
const TREE_BOTTOM = 372;
const ROW_MAX = 46;
const NODE_H = 24;
const RING_PAD = 4;
const CHIP_H = 18;
const SIDE_MARGIN = 110;
const MOVE_MS = 400;
const FRAME_MS = 16;

type Box = { x: number; y: number; w: number; h: number };

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function nodeName(n: SceneNode): string {
  return n.tag + (n.id !== null ? `#${n.id}` : '') + n.cls.map((c) => `.${c}`).join('');
}

/** 글자 폭 어림 — 한글 · 한자권 · 데바나가리 등 넓은 글자는 1em, 나머지는 0.56em. */
function textWidth(text: string, px: number): number {
  let em = 0;
  for (const ch of text) em += (ch.codePointAt(0) ?? 0) >= 0x0900 ? 1 : 0.56;
  return em * px;
}

function monoWidth(text: string, px: number): number {
  return [...text].length * px * 0.6;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r(v) : v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 선택자 토큰 자리 — 가운데 모아 둔다. */
function tokenBoxes(parts: string[], W: number): Box[] {
  const px = parseFloat(fontSizes.lg);
  const widths = parts.map((p) => monoWidth(p, px) + 24);
  const total = widths.reduce((a, b) => a + b, 0) + TOKEN_GAP * Math.max(0, parts.length - 1);
  let x = W / 2 - total / 2;
  return widths.map((w) => {
    const box = { x, y: SEL_Y - TOKEN_H / 2, w, h: TOKEN_H };
    x += w + TOKEN_GAP;
    return box;
  });
}

/** 문서 트리 자리 — 잎 수만큼 가로를 나누고 깊이마다 한 줄. */
function treeBoxes(nodes: SceneNode[], W: number): Box[] {
  const n = nodes.length;
  if (n === 0) return [];
  const kids: number[][] = nodes.map(() => []);
  const depth: number[] = nodes.map(() => 0);
  nodes.forEach((node, i) => {
    if (node.parent !== null && node.parent >= 0 && node.parent < i) {
      (kids[node.parent] as number[]).push(i);
      depth[i] = (depth[node.parent] as number) + 1;
    }
  });
  const leaves: number[] = nodes.map(() => 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const ks = kids[i] as number[];
    leaves[i] = ks.length === 0 ? 1 : ks.reduce((a, k) => a + (leaves[k] as number), 0);
  }
  const maxDepth = Math.max(...depth);
  const row = maxDepth === 0 ? 0 : Math.min(ROW_MAX, (TREE_BOTTOM - TREE_TOP) / maxDepth);
  const span = W - SIDE_MARGIN * 2;
  const xs: number[] = nodes.map(() => W / 2);
  const place = (i: number, left: number, width: number): void => {
    xs[i] = left + width / 2;
    let at = left;
    for (const k of kids[i] as number[]) {
      const w = (width * (leaves[k] as number)) / (leaves[i] as number);
      place(k, at, w);
      at += w;
    }
  };
  nodes.forEach((node, i) => {
    if (node.parent === null) place(i, SIDE_MARGIN, span);
  });
  const px = parseFloat(fontSizes.sm);
  return nodes.map((node, i) => {
    const w = Math.max(52, monoWidth(nodeName(node), px) + 18);
    const cx = xs[i] as number;
    const cy = TREE_TOP + (depth[i] as number) * row;
    return { x: cx - w / 2, y: cy - NODE_H / 2, w, h: NODE_H };
  });
}

function ringOf(b: Box): Box {
  return { x: b.x - RING_PAD, y: b.y - RING_PAD, w: b.w + RING_PAD * 2, h: b.h + RING_PAD * 2 };
}

export const selectorRightToLeftStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const C: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const XS = parseFloat(fontSizes.xs);
    const MD = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const stopAll = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };

    /** 이 장면의 문서 자리. node -1 은 뿌리 위 빈자리다. */
    const voidBox = (tree: Box[], nodes: SceneNode[]): Box => {
      const root = nodes.findIndex((n) => n.parent === null);
      const rb = tree[root < 0 ? 0 : root];
      const cx = rb ? rb.x + rb.w / 2 : W / 2;
      const w = Math.max(72, textWidth(t('label.noParent', 'No parent'), XS) + 20);
      return { x: cx - w / 2, y: VOID_Y - NODE_H / 2, w, h: NODE_H };
    };

    const docBox = (tree: Box[], nodes: SceneNode[], node: number): Box | null => {
      if (node === -1) return voidBox(tree, nodes);
      return tree[node] ?? null;
    };

    const wrap = (text: string, px: number, max: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        const next = line === '' ? w : `${line} ${w}`;
        if (line !== '' && textWidth(next, px) > max) {
          lines.push(line);
          line = w;
        } else {
          line = next;
        }
      }
      if (line !== '') lines.push(line);
      return lines;
    };

    const captionOf = (s: SelectorScene): string => {
      const cur = s.cursor;
      const step = s.step;
      if (cur === null || step === null) {
        if (s.candidates.length === 0) return '';
        return t('caption.start', 'The rule is filed under its rightmost part. Candidates: {n}', {
          n: s.candidates.length,
        });
      }
      const part = s.parts[cur.part] ?? '';
      const candNode = s.nodes[cur.cand];
      const cand = candNode ? nodeName(candNode) : '';
      if (step.kind === 'pastRoot') {
        return t('caption.pastRoot', 'Past the root with {part} still unfound. {cand}: no match.', { part, cand });
      }
      const seen = s.nodes[cur.node];
      const node = seen ? nodeName(seen) : '';
      if (step.verdict === 'match') {
        return t('caption.matched', '{part} ↔ {node}: match. The leftmost part is found. {cand}: match.', {
          part, node, cand,
        });
      }
      if (step.verdict === 'none') {
        return t('caption.missSelf', '{part} ↔ {node}: no match. {cand}: no match.', { part, node, cand });
      }
      if (step.hit) {
        return t('caption.hit', '{part} ↔ {node}: match. The selector moves one part left, the document one level up.', {
          part, node,
        });
      }
      return t('caption.miss', '{part} ↔ {node}: no match. Only the document moves one level up.', { part, node });
    };

    type Live = { ring: SVGRectElement | null; cursor: SVGRectElement | null; link: SVGLineElement | null };

    const drawStatic = (s: SelectorScene): Live => {
      svg.textContent = '';
      const live: Live = { ring: null, cursor: null, link: null };
      const tree = treeBoxes(s.nodes, W);
      const tokens = tokenBoxes(s.parts, W);
      const cur = s.cursor;
      const step = s.step;
      const verdictNow = step === null ? null : step.kind === 'pastRoot' ? 'none' : step.verdict;
      const markColor = verdictNow === 'match' ? C.success : verdictNow === 'none' ? C.danger : C.itemComparing;

      // 캡션 — 지금 일어나는 일
      const caption = captionOf(s);
      wrap(caption, MD, W - 32).slice(0, 2).forEach((line, i) => {
        el(svg, 'text', {
          x: W / 2, y: CAPTION_Y + i * CAPTION_LINE, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.md, fill: C.text,
        }, line);
      });

      if (s.nodes.length === 0) return live;

      el(svg, 'text', {
        x: 16, y: SEL_Y, 'dominant-baseline': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.textMuted,
      }, t('label.selector', 'Selector'));
      el(svg, 'text', {
        x: 16, y: TREE_TOP, 'dominant-baseline': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.textMuted,
      }, t('label.document', 'Document'));

      // 트리의 가지
      const edges = el(svg, 'g', {});
      s.nodes.forEach((n, i) => {
        if (n.parent === null) return;
        const a = tree[n.parent];
        const b = tree[i];
        if (!a || !b) return;
        el(edges, 'line', {
          x1: a.x + a.w / 2, y1: a.y + a.h, x2: b.x + b.w / 2, y2: b.y,
          stroke: C.border, 'stroke-width': 1.5,
        });
      });

      // 끈 — 지금 견주는 두 자리
      const target = cur ? docBox(tree, s.nodes, cur.node) : null;
      const tok = cur ? tokens[cur.part] : undefined;
      if (cur && target && tok) {
        const ring = ringOf(target);
        live.link = el(svg, 'line', {
          x1: tok.x + tok.w / 2, y1: tok.y + tok.h, x2: ring.x + ring.w / 2, y2: ring.y,
          stroke: markColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
        });
      }

      // 뿌리 너머 빈자리
      if (cur && cur.node === -1) {
        const v = voidBox(tree, s.nodes);
        el(svg, 'rect', {
          x: v.x, y: v.y, width: v.w, height: v.h, rx: 5,
          fill: 'none', stroke: C.danger, 'stroke-width': 1, 'stroke-dasharray': '3 3',
        });
        el(svg, 'text', {
          x: v.x + v.w / 2, y: v.y + v.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.danger,
        }, t('label.noParent', 'No parent'));
      }

      // 요소
      const isCand = new Set(s.candidates);
      s.nodes.forEach((n, i) => {
        const b = tree[i];
        if (!b) return;
        el(svg, 'rect', {
          x: b.x, y: b.y, width: b.w, height: b.h, rx: 4,
          fill: C.bg, stroke: isCand.has(i) ? C.primary : C.border, 'stroke-width': isCand.has(i) ? 2 : 1,
        });
        el(svg, 'text', {
          x: b.x + b.w / 2, y: b.y + b.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: C.text,
        }, nodeName(n));
      });

      // 견준 자국 — 요소 옆에 단순 선택자와 맞음/아님
      const used: number[] = s.nodes.map(() => 0);
      for (const c of s.trail) {
        const b = tree[c.node];
        if (!b) continue;
        const text = `${s.parts[c.part] ?? ''} ${c.hit ? '✓' : '×'}`;
        const w = monoWidth(text, XS) + 12;
        const left = b.x + b.w / 2 < W / 2 - 1;
        const off = used[c.node] as number;
        used[c.node] = off + w + 6;
        const x = left ? b.x - 8 - off - w : b.x + b.w + 8 + off;
        const y = b.y + b.h / 2 - CHIP_H / 2;
        el(svg, 'rect', {
          x, y, width: w, height: CHIP_H, rx: CHIP_H / 2,
          fill: c.hit ? C.success : 'none',
          stroke: c.hit ? C.success : C.textMuted, 'stroke-width': 1,
          ...(c.hit ? {} : { 'stroke-dasharray': '3 2' }),
        });
        el(svg, 'text', {
          x: x + w / 2, y: y + CHIP_H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.hit ? C.textInverse : C.textMuted,
        }, text);
      }

      // 후보 아래 — 판정과 견줌 수
      for (const cand of s.candidates) {
        const b = tree[cand];
        if (!b) continue;
        const cx = b.x + b.w / 2;
        const y1 = b.y + b.h + 16;
        const verdict = s.verdicts.find((v) => v.cand === cand);
        if (verdict) {
          const label = verdict.verdict === 'match' ? t('label.match', 'Match') : t('label.noMatch', 'No match');
          const w = textWidth(label, XS) + 16;
          el(svg, 'rect', {
            x: cx - w / 2, y: y1 - 9, width: w, height: 18, rx: 9,
            fill: verdict.verdict === 'match' ? C.success : C.danger,
          });
          el(svg, 'text', {
            x: cx, y: y1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.textInverse,
          }, label);
        } else {
          el(svg, 'text', {
            x: cx, y: y1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.primary,
          }, t('label.candidate', 'Candidate'));
        }
        const count = s.trail.filter((c) => c.cand === cand).length;
        el(svg, 'text', {
          x: cx, y: y1 + 18, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.xs, fill: C.textMuted,
        }, t('label.compares', 'Comparisons: {n}', { n: count }));
      }
      if (s.candidates.length > 0) {
        el(svg, 'text', {
          x: W - 16, y: H - 14, 'text-anchor': 'end', 'dominant-baseline': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.sm, fill: C.text,
        }, t('label.total', 'Total comparisons: {n}', { n: s.trail.length }));
      }

      // 문서 안의 보는 자리
      if (target) {
        const ring = ringOf(target);
        live.ring = el(svg, 'rect', {
          x: ring.x, y: ring.y, width: ring.w, height: ring.h, rx: 7,
          fill: 'none', stroke: markColor, 'stroke-width': 2.5,
        });
      }

      // 선택자 토큰 — 이 후보에서 이미 맞춘 것은 초록, 아직인 것은 옅게
      s.parts.forEach((p, i) => {
        const b = tokens[i];
        if (!b) return;
        const done = cur !== null && (i > cur.part || (i === cur.part && verdictNow === 'match'));
        el(svg, 'rect', {
          x: b.x, y: b.y, width: b.w, height: b.h, rx: 5,
          fill: C.bgSubtle, stroke: done ? C.success : C.border, 'stroke-width': done ? 1.5 : 1,
        });
        el(svg, 'text', {
          x: b.x + b.w / 2, y: b.y + b.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: done ? C.success : C.text,
        }, p);
      });

      // 선택자 안의 읽는 자리
      if (tok) {
        live.cursor = el(svg, 'rect', {
          x: tok.x - 3, y: tok.y - 3, width: tok.w + 6, height: tok.h + 6, rx: 7,
          fill: 'none', stroke: markColor, 'stroke-width': 2.5,
        });
      }
      return live;
    };

    /** 한 시계로 흘린다 — 타이머는 모두 집합에 담는다. */
    const tween = (mine: number, apply: (k: number) => void): Promise<void> => {
      const frames = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          apply(ease(Math.min(1, i / frames)));
          if (i >= frames) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    };

    const renderScene = async (next: SelectorScene, _prev: SelectorScene | null, opts: { animate: boolean }): Promise<void> => {
      if (destroyed) return;
      stopAll();
      const mine = (gen += 1);
      const live = drawStatic(next);
      if (!opts.animate) return;
      const step = next.step;
      const cur = next.cursor;
      const from: Cursor | null = step ? step.from : null;
      if (!step || !cur || !from) return;

      const tree = treeBoxes(next.nodes, W);
      const tokens = tokenBoxes(next.parts, W);
      const a = docBox(tree, next.nodes, from.node);
      const b = docBox(tree, next.nodes, cur.node);
      const ta = tokens[from.part];
      const tb = tokens[cur.part];
      if (!a || !b || !ta || !tb) return;
      const ra = ringOf(a);
      const rb = ringOf(b);
      const same = ra.x === rb.x && ra.y === rb.y && ta.x === tb.x;
      if (same) return;

      const apply = (k: number): void => {
        const rx = lerp(ra.x, rb.x, k);
        const ry = lerp(ra.y, rb.y, k);
        const rw = lerp(ra.w, rb.w, k);
        const tx = lerp(ta.x, tb.x, k);
        const tw = lerp(ta.w, tb.w, k);
        if (live.ring) {
          live.ring.setAttribute('x', String(r(rx)));
          live.ring.setAttribute('y', String(r(ry)));
          live.ring.setAttribute('width', String(r(rw)));
        }
        if (live.cursor) {
          live.cursor.setAttribute('x', String(r(tx - 3)));
          live.cursor.setAttribute('width', String(r(tw + 6)));
        }
        if (live.link) {
          live.link.setAttribute('x1', String(r(tx + tw / 2)));
          live.link.setAttribute('x2', String(r(rx + rw / 2)));
          live.link.setAttribute('y2', String(r(ry)));
        }
      };
      // 첫 프레임에 끝 자리가 번쩍이지 않게 — 출발 자리에 먼저 세운다
      apply(0);
      await tween(mine, apply);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    };

    return {
      render: renderScene,
      destroy(): void {
        destroyed = true;
        gen += 1;
        stopAll();
        svg.textContent = '';
      },
    };
  },
};
