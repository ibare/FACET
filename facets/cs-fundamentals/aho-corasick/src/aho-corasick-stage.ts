/**
 * aho-corasick-stage — 움직이지 않는 수 하나를 화면 한가운데 둔다.
 *
 * 그리는 것은 넷이다.
 *   1. 패턴 다섯 칸. 이번 판에 든 것만 채워지고 나머지는 비어 있다 —
 *      손잡이가 어디까지 밀렸는지가 그림 안에 있다.
 *   2. 나무와 실패 링크. 링크는 점선이고, 미끄러질 때 그 한 가닥만 도드라진다.
 *   3. 막대 둘. **눈금이 고정이라** "읽은 글자" 막대는 손잡이를 어디로 밀어도
 *      늘 같은 자리에서 멎고, "따로 훑으면" 막대만 길어진다. 그 옆에 선 하나를
 *      그어 두 막대가 어디서 갈리는지 보인다.
 *   4. 글 한 줄. 읽은 자리는 왼쪽으로 돌아가지 않으므로 진행 자는 줄기만 한다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 나무가 손잡이에 따라 커지지만
 * 잎 수로 줄 간격을 역산해 같은 띠 안에 담는다.
 *
 * 애니메이션이 없다 — 걸음의 길이는 알고리즘의 `sleep` 이 정하고 여기서는 즉시
 * 칠한다. **그래서 걸어 둔 타이머도 프레임도 없고, destroy 가 거둘 것은 노드뿐이다.**
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 344;
const PAD = 20;

/** 패턴 칸. 다섯을 늘 그리고 이번 판에 든 것만 채운다. */
const PAT_LABEL_Y = 14;
const CHIP_Y = 20;
const CHIP_H = 26;
const CHIP_W = 92;
const CHIP_GAP = 8;

/** 나무. 깊이가 열이고 잎이 줄이다. */
const TREE_X0 = 48;
const COL_W = 82;
const TREE_TOP = 72;
const TREE_BOTTOM = 182;
const TILE_W = 40;
const TILE_H = 24;
const ROOT_R = 9;

/** 계기판. 눈금이 고정이라 막대가 판마다 같은 자리에서 멎는다. */
const PANEL_X = 424;
const BAR_W = 256;
const BAR_H = 10;
/** 막대의 천장. 다섯 값 전부에서 같은 눈금을 쓰려고 고정한다. */
const BAR_MAX = 140;
const READ_LABEL_Y = 82;
const READ_VALUE_Y = 110;
const READ_BAR_Y = 118;
const SEP_LABEL_Y = 150;
const SEP_VALUE_Y = 178;
const SEP_BAR_Y = 186;

/** 글 한 줄. */
const TEXT_LABEL_Y = 208;
const CELL_Y = 214;
const CELL_H = 34;
const CELL_MAX_W = 34;
const RULE_Y = 254;
const RULE_H = 4;

/** 걸린 것을 눕히는 줄. 겹치면 다음 줄로 내려간다. */
const LANE_TOP = 264;
const LANE_PITCH = 15;
const TAG_H = 13;
const MAX_LANES = 3;

const CAPTION_Y = 326;

/** 실패 링크가 아래로 부푸는 정도. */
const LINK_BOW = 26;

type WireNode = { id: number; parent: number; ch: string; depth: number; ends: string | null };
type WireLink = { from: number; to: number; word: string; suffix: string };
type WireHit = { pattern: string; start: number; end: number };
type ReadStep = { index: number; char: string; from: number; to: number; slides: number[] };

type CellTone = 'idle' | 'read' | 'active';
type Point = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  x: number,
  y: number,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
  family: string = fonts.body,
): SVGTextElement {
  return el('text', {
    x,
    y,
    'font-family': family,
    'font-size': size,
    fill,
    'text-anchor': anchor,
  });
}

export const ahoCorasickStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const init = params.initialData as Record<string, unknown> | undefined;
    const initPatterns = Array.isArray(init?.patterns)
      ? (init.patterns as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const initText = typeof init?.text === 'string' ? init.text : '';
    const initUsed = typeof init?.patternCount === 'number' ? init.patternCount : 1;

    // ── 고정 층 ────────────────────────────────────────────────
    const patLabel = text(PAD, PAT_LABEL_Y, fontSizes.xs, colors.textMuted);
    patLabel.textContent = tr('label.patterns', 'Patterns');
    svg.appendChild(patLabel);

    const textLabel = text(PAD, TEXT_LABEL_Y, fontSizes.xs, colors.textMuted);
    textLabel.textContent = tr('label.text', 'Text');
    svg.appendChild(textLabel);

    const readLabel = text(PANEL_X, READ_LABEL_Y, fontSizes.xs, colors.textMuted);
    readLabel.textContent = tr('label.read', 'Characters read');
    svg.appendChild(readLabel);

    const sepLabel = text(PANEL_X, SEP_LABEL_Y, fontSizes.xs, colors.textMuted);
    sepLabel.textContent = tr('label.separate', 'One at a time');
    svg.appendChild(sepLabel);

    const barBg = (y: number): SVGRectElement =>
      el('rect', {
        x: PANEL_X,
        y,
        width: BAR_W,
        height: BAR_H,
        rx: BAR_H / 2,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
    svg.appendChild(barBg(READ_BAR_Y));
    svg.appendChild(barBg(SEP_BAR_Y));

    const readFill = el('rect', {
      x: PANEL_X,
      y: READ_BAR_Y,
      width: 0,
      height: BAR_H,
      rx: BAR_H / 2,
      fill: colors.itemSorted,
    });
    svg.appendChild(readFill);

    const sepFill = el('rect', {
      x: PANEL_X,
      y: SEP_BAR_Y,
      width: 0,
      height: BAR_H,
      rx: BAR_H / 2,
      fill: colors.itemComparing,
    });
    svg.appendChild(sepFill);

    /**
     * 갈리는 자리를 긋는 선.
     *
     * 아래 막대가 이 선을 지나가는 만큼이 곧 되읽기다. 위 막대는 이 선에서
     * 멎는다 — 손잡이를 어디로 밀어도.
     */
    const markLine = el('line', {
      x1: PANEL_X,
      y1: READ_BAR_Y - 4,
      x2: PANEL_X,
      y2: SEP_BAR_Y + BAR_H + 4,
      stroke: colors.accent,
      'stroke-width': 1.5,
      'stroke-dasharray': '3 3',
      opacity: 0,
    });
    svg.appendChild(markLine);

    const readValue = text(PANEL_X, READ_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(readValue);
    const sepValue = text(PANEL_X, SEP_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(sepValue);

    const caption = text(PAD, CAPTION_Y, fontSizes.sm, colors.text);
    svg.appendChild(caption);

    // ── 다시 지어지는 층 ────────────────────────────────────────
    const chipsG = el('g', {});
    svg.appendChild(chipsG);
    const linksG = el('g', {});
    svg.appendChild(linksG);
    const edgesG = el('g', {});
    svg.appendChild(edgesG);
    const nodesG = el('g', {});
    svg.appendChild(nodesG);
    const cursorG = el('g', {});
    svg.appendChild(cursorG);
    const cellsG = el('g', {});
    svg.appendChild(cellsG);
    const tagsG = el('g', {});
    svg.appendChild(tagsG);

    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];
    let cellW = CELL_MAX_W;
    let cellX0 = PAD;
    let rule: SVGRectElement | null = null;

    let nodePos = new Map<number, Point>();
    let nodeRect = new Map<number, SVGRectElement>();
    let nodeTerminal = new Set<number>();
    let matched = new Set<number>();
    let linkPaths = new Map<string, SVGPathElement>();
    let cursor: SVGRectElement | null = null;
    let lanes: Array<Array<{ start: number; end: number }>> = [];

    function cellFill(tone: CellTone): string {
      if (tone === 'active') return colors.itemActive;
      if (tone === 'read') return colors.itemSorted;
      return colors.itemDefault;
    }

    function cellInk(tone: CellTone): string {
      if (tone === 'active') return colors.stateInk;
      if (tone === 'read') return colors.textInverse;
      return colors.text;
    }

    function paintCell(i: number, tone: CellTone): void {
      const rect = cellRects[i];
      const label = cellTexts[i];
      if (rect === undefined || label === undefined) return;
      rect.setAttribute('fill', cellFill(tone));
      rect.setAttribute('stroke', tone === 'idle' ? colors.border : cellFill(tone));
      label.setAttribute('fill', cellInk(tone));
    }

    /** 글 한 줄과 진행 자를 짓는다. 칸 폭은 캔버스에서 역산한다. */
    function buildText(body: string): void {
      cellsG.textContent = '';
      cellRects = [];
      cellTexts = [];
      const n = Math.max(1, body.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - PAD * 2) / n));
      cellX0 = Math.round((W - cellW * n) / 2);

      for (let i = 0; i < body.length; i += 1) {
        const x = cellX0 + i * cellW;
        const rect = el('rect', {
          x: x + 1,
          y: CELL_Y,
          width: cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: colors.itemDefault,
          stroke: colors.border,
        });
        cellsG.appendChild(rect);
        const label = text(
          x + cellW / 2,
          CELL_Y + 23,
          fontSizes.md,
          colors.text,
          'middle',
          fonts.mono,
        );
        label.textContent = body.charAt(i);
        cellsG.appendChild(label);
        cellRects.push(rect);
        cellTexts.push(label);
      }

      cellsG.appendChild(
        el('rect', {
          x: cellX0,
          y: RULE_Y,
          width: cellW * body.length,
          height: RULE_H,
          rx: RULE_H / 2,
          fill: colors.border,
        }),
      );
      rule = el('rect', {
        x: cellX0,
        y: RULE_Y,
        width: 0,
        height: RULE_H,
        rx: RULE_H / 2,
        fill: colors.itemSorted,
      });
      cellsG.appendChild(rule);
    }

    /** 패턴 칸 다섯. 이번 판에 든 것만 채운다. */
    function buildChips(patterns: string[], used: number): void {
      chipsG.textContent = '';
      patterns.forEach((pattern, i) => {
        const on = i < used;
        const x = PAD + i * (CHIP_W + CHIP_GAP);
        chipsG.appendChild(
          el('rect', {
            x,
            y: CHIP_Y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 5,
            fill: on ? colors.itemSorted : colors.itemDefault,
            stroke: on ? colors.itemSorted : colors.border,
            'stroke-dasharray': on ? 'none' : '3 3',
          }),
        );
        const label = text(
          x + CHIP_W / 2,
          CHIP_Y + 18,
          fontSizes.sm,
          on ? colors.textInverse : colors.textMuted,
          'middle',
          fonts.mono,
        );
        label.textContent = pattern;
        chipsG.appendChild(label);
      });
    }

    /** 잎을 세어 줄 간격을 역산한다 — 나무가 커져도 띠 밖으로 나가지 않는다. */
    function layoutTrie(nodes: WireNode[]): void {
      nodePos = new Map<number, Point>();
      const children = new Map<number, number[]>();
      for (const node of nodes) {
        if (node.parent < 0) continue;
        const kids = children.get(node.parent) ?? [];
        kids.push(node.id);
        children.set(node.parent, kids);
      }
      const leaves = nodes.filter((n) => (children.get(n.id) ?? []).length === 0).length;
      const pitch = leaves > 1 ? (TREE_BOTTOM - TREE_TOP) / (leaves - 1) : 0;
      const depthOf = new Map(nodes.map((n) => [n.id, n.depth]));

      let slot = 0;
      const place = (id: number): number => {
        const kids = children.get(id) ?? [];
        let y: number;
        if (kids.length === 0) {
          y = leaves > 1 ? TREE_TOP + pitch * slot : (TREE_TOP + TREE_BOTTOM) / 2;
          slot += 1;
        } else {
          const ys = kids.map(place);
          y = (Math.min(...ys) + Math.max(...ys)) / 2;
        }
        nodePos.set(id, { x: TREE_X0 + COL_W * (depthOf.get(id) ?? 0), y });
        return y;
      };
      place(0);
    }

    function posOf(id: number): Point {
      return nodePos.get(id) ?? { x: TREE_X0, y: (TREE_TOP + TREE_BOTTOM) / 2 };
    }

    function paintNode(id: number): void {
      const rect = nodeRect.get(id);
      if (rect === undefined) return;
      const hit = matched.has(id);
      const fill = hit ? colors.itemPivot : colors.itemDefault;
      rect.setAttribute('fill', fill);
      rect.setAttribute(
        'stroke',
        nodeTerminal.has(id) ? colors.accent : hit ? colors.itemPivot : colors.border,
      );
      rect.setAttribute('stroke-width', nodeTerminal.has(id) ? '2.5' : '1');
    }

    function drawTrie(nodes: WireNode[]): void {
      edgesG.textContent = '';
      nodesG.textContent = '';
      cursorG.textContent = '';
      linksG.textContent = '';
      nodeRect = new Map<number, SVGRectElement>();
      nodeTerminal = new Set<number>();
      matched = new Set<number>();
      linkPaths = new Map<string, SVGPathElement>();
      layoutTrie(nodes);

      for (const node of nodes) {
        if (node.parent < 0) continue;
        const from = posOf(node.parent);
        const to = posOf(node.id);
        edgesG.appendChild(
          el('line', {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );
      }

      for (const node of nodes) {
        const at = posOf(node.id);
        if (node.parent < 0) {
          nodesG.appendChild(
            el('circle', {
              cx: at.x,
              cy: at.y,
              r: ROOT_R,
              fill: colors.bgSubtle,
              stroke: colors.border,
              'stroke-width': 1.5,
            }),
          );
          continue;
        }
        const rect = el('rect', {
          x: at.x - TILE_W / 2,
          y: at.y - TILE_H / 2,
          width: TILE_W,
          height: TILE_H,
          rx: 5,
          fill: colors.itemDefault,
          stroke: colors.border,
        });
        nodesG.appendChild(rect);
        const label = text(at.x, at.y + 5, fontSizes.sm, colors.text, 'middle', fonts.mono);
        label.textContent = node.ch;
        nodesG.appendChild(label);
        nodeRect.set(node.id, rect);
        if (node.ends !== null) nodeTerminal.add(node.id);
        paintNode(node.id);
      }

      cursor = el('rect', {
        x: -(TILE_W + 10),
        y: -(TILE_H + 10),
        width: TILE_W + 10,
        height: TILE_H + 10,
        rx: 8,
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 2.5,
      });
      cursorG.appendChild(cursor);
      moveCursor(0);
    }

    function moveCursor(id: number): void {
      if (!cursor) return;
      const at = posOf(id);
      cursor.setAttribute('x', String(at.x - (TILE_W + 10) / 2));
      cursor.setAttribute('y', String(at.y - (TILE_H + 10) / 2));
    }

    function drawLinks(links: WireLink[]): void {
      linksG.textContent = '';
      linkPaths = new Map<string, SVGPathElement>();
      for (const link of links) {
        const from = posOf(link.from);
        const to = posOf(link.to);
        const bow = Math.max(from.y, to.y) + LINK_BOW;
        const path = el('path', {
          d: `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${bow} ${to.x} ${to.y}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
          opacity: 0.5,
        });
        linksG.appendChild(path);
        linkPaths.set(`${link.from}>${link.to}`, path);
      }
    }

    /** 이번 걸음에 실제로 탄 링크만 도드라지게 한다. */
    function lightLinks(pairs: string[]): void {
      const on = new Set(pairs);
      for (const [key, path] of linkPaths) {
        const hot = on.has(key);
        path.setAttribute('stroke', hot ? colors.accent : colors.textMuted);
        path.setAttribute('stroke-width', hot ? '2.4' : '1.2');
        path.setAttribute('opacity', hot ? '1' : '0.5');
      }
    }

    function setBars(read: number, separate: number): void {
      const scale = (value: number): number =>
        Math.max(0, Math.min(BAR_W, (BAR_W * value) / BAR_MAX));
      readFill.setAttribute('width', String(scale(read)));
      sepFill.setAttribute('width', String(scale(separate)));
      readValue.textContent = String(read);
      sepValue.textContent = separate > 0 ? String(separate) : '';
    }

    function setMark(at: number): void {
      const x = PANEL_X + Math.min(BAR_W, (BAR_W * at) / BAR_MAX);
      markLine.setAttribute('x1', String(x));
      markLine.setAttribute('x2', String(x));
      markLine.setAttribute('opacity', at > 0 ? '1' : '0');
    }

    function laneFor(start: number, end: number): number {
      for (let lane = 0; lane < MAX_LANES; lane += 1) {
        const taken = lanes[lane] ?? [];
        if (taken.every((span) => end < span.start || start > span.end)) {
          taken.push({ start, end });
          lanes[lane] = taken;
          return lane;
        }
      }
      return MAX_LANES - 1;
    }

    function clearScene(): void {
      tagsG.textContent = '';
      lanes = [];
      matched = new Set<number>();
      setBars(0, 0);
      setMark(0);
      if (rule) rule.setAttribute('width', '0');
    }

    buildChips(initPatterns, initUsed);
    buildText(initText);

    return {
      destroy() {
        // 거둘 타이머도 프레임도 없다 — 이 그림은 애니메이션을 두지 않았다.
        // 남은 것은 캔버스 안의 노드뿐이고 캔버스 자체는 러너의 것이라 둔다.
        svg.textContent = '';
      },

      setup(spec: { patterns: string[]; used: number; text: string; separate: number }) {
        buildChips(spec.patterns, spec.used);
        buildText(spec.text);
        edgesG.textContent = '';
        nodesG.textContent = '';
        cursorG.textContent = '';
        linksG.textContent = '';
        clearScene();
        setBars(0, spec.separate);
      },

      showTrie(nodes: WireNode[]) {
        drawTrie(nodes);
      },

      showFails(links: WireLink[]) {
        drawLinks(links);
      },

      readChar(step: ReadStep) {
        for (let i = 0; i < cellRects.length; i += 1) {
          paintCell(i, i === step.index ? 'active' : i < step.index ? 'read' : 'idle');
        }
        const readSoFar = step.index + 1;
        if (rule) rule.setAttribute('width', String(cellW * readSoFar));
        readValue.textContent = String(readSoFar);
        readFill.setAttribute(
          'width',
          String(Math.max(0, Math.min(BAR_W, (BAR_W * readSoFar) / BAR_MAX))),
        );

        // 미끄러진 자취를 링크 위에 얹는다. 한 글자에서 두 번 미끄러질 수도 있다.
        const pairs: string[] = [];
        let cur = step.from;
        for (const to of step.slides) {
          pairs.push(`${cur}>${to}`);
          cur = to;
        }
        lightLinks(pairs);
        moveCursor(step.to);
      },

      catchMatch(batch: { nodeId: number; hits: WireHit[] }) {
        matched.add(batch.nodeId);
        paintNode(batch.nodeId);
        for (const hit of batch.hits) {
          const lane = laneFor(hit.start, hit.end);
          const x = cellX0 + hit.start * cellW;
          const width = (hit.end - hit.start + 1) * cellW;
          const y = LANE_TOP + LANE_PITCH * lane;
          tagsG.appendChild(
            el('rect', {
              x: x + 1,
              y,
              width: Math.max(2, width - 2),
              height: TAG_H,
              rx: 3,
              fill: colors.itemPivot,
            }),
          );
          const label = text(
            x + width / 2,
            y + 10,
            fontSizes.xs,
            colors.stateInk,
            'middle',
            fonts.mono,
          );
          label.textContent = hit.pattern;
          tagsG.appendChild(label);
        }
      },

      finish(summary: { charsRead: number; separate: number }) {
        for (let i = 0; i < cellRects.length; i += 1) paintCell(i, 'read');
        lightLinks([]);
        setBars(summary.charsRead, summary.separate);
        // 다 읽고 나서야 선을 긋는다 — 두 막대가 갈리는 자리가 곧 이 화면의 말이다.
        setMark(summary.charsRead);
      },

      setCaption(body: string) {
        caption.textContent = body;
      },

      reset() {
        clearScene();
        caption.textContent = '';
      },
    };
  },
};
