/**
 * prune-branch-stage — 가지가 돋다 마는 자리를 그린다.
 *
 * ── 무엇이 화면에 있는가
 *
 * 1. **유령 나무** — 다 뻗었을 때의 결정나무 전체(31 자리)를 옅은 점선으로 미리
 *    깔아 둔다. 안 그린 것이 몇인지는 이것과 견주어야만 보이므로 끝까지 지우지
 *    않는다.
 * 2. **뻗는 가지** — 방문하는 자리마다 부모에서 선이 **실제로 자라 나오고**
 *    (`x2`/`y2` 가 움직인다) 그 끝에서 자리가 부풀어 나타난다. 페이드인이 아니다.
 * 3. **닫히는 자리** — 합이 목표를 넘은 자리는 붉게 굳고 아래에 뚜껑이 가로로
 *    펴진다. 그 아래 유령 영역에는 옅은 색지가 위에서 아래로 **쓸려 내려간다** —
 *    안 볼 자리가 선포되는 순간이다. 그 색지는 끝까지 비어 있는 채로 남는다.
 * 4. **셈판** — 연 자리 / 안 연 자리. 안 연 자리는 뚜껑이 덮일 때마다 그 아래
 *    자리 수만큼 튀어 오른다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 자리 수는 `values.length` 로 정해지고
 * 층 간격은 고정 높이 안에서 역산한다.
 *
 * 색은 전부 design-tokens 경유 — 상태(itemActive) · 심각도(danger) ·
 * 강조(itemPivot) · 영역(subtreeShadeLeft) · 특수(ghostOutline) (S-view 결정 트리).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CANVAS_H = 372;

/** 잎 한 칸의 최대 너비. 상한만 두고 실제 값은 캔버스에서 역산한다 (S-piece). */
const LEAF_PITCH_MAX = 34;
/** 왼쪽 홈통에 층 라벨(그 층에서 정하는 수)이 들어갈 만큼은 남긴다. */
const SIDE_MIN = 30;

const TOP_Y = 68;
const LEVEL_GAP = 54;

const CAPTION_Y = 322;
const CAPTION_LINE_H = 18;
const CAPTION_MAX_LINES = 3;
const CAPTION_SIDE = 22;
/** 줄바꿈 자리를 재는 데 쓰는 캡션 글자 크기. 토큰이 단일출처다 (S-view). */
const CAPTION_FONT_PX = Number.parseInt(fontSizes.md, 10);

const TALLY_X = 16;
const TALLY_Y1 = 22;
const TALLY_Y2 = 42;

// 걸음 하나 = 이 애니메이션 + algorithm 의 stepMs 배수. 열일곱 걸음이라
// 지속시간을 넉넉히 잡으면 총 길이가 금세 스무 초가 된다 (S-piece).
const EDGE_MS = 140;
const POP_MS = 70;
const VERDICT_MS = 110;
const SHADE_MS = 240;
const TRACE_MS = 380;
const TALLY_POP_MS = 220;

export type PruneBranchStageInit = {
  /** 고를 수 목록. 층 수 = 이 길이. */
  values: number[];
  /** 맞춰야 하는 합. */
  target: number;
};

/** 한 자리가 받은 판정. */
export type BranchVerdict = 'open' | 'cut' | 'dead' | 'answer';

export type PruneBranchStageStep = {
  /** `r` + 결정 경로. `'1'` 넣는다(왼쪽) / `'0'` 안 넣는다(오른쪽). */
  id: string;
  /** 뿌리면 빈 문자열. */
  parentId: string;
  level: number;
  sum: number;
  verdict: BranchVerdict;
  /** 닫힐 때 그 아래에 있는 자리 수. 닫히지 않으면 0. */
  below: number;
  opened: number;
  skipped: number;
};

type NodeGeom = { x: number; y: number; level: number; start: number; width: number };
type LiveNode = { circle: SVGCircleElement; label: SVGTextElement; verdict: BranchVerdict };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한글·전각은 거의 1em, 그 밖은 대략 0.53em 로 잡는다. 줄바꿈 자리를 정하는 데만 쓴다. */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x1100 && code <= 0xff60 ? size * 0.98 : size * 0.53;
  }
  return w;
}

function wrapText(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cand = cur === '' ? word : `${cur} ${word}`;
    if (cur !== '' && textWidth(cand, size) > maxW) {
      lines.push(cur);
      if (lines.length === maxLines - 1) {
        // 마지막 줄에는 남은 것을 다 담는다 — 잘라 버리면 문장이 거짓이 된다.
        lines.push(words.slice(i).join(' '));
        return lines;
      }
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

/** 깊이 `n` 의 완전 이진나무의 모든 결정 경로. 짧은 것부터. */
function allPaths(n: number): string[] {
  const out: string[] = [''];
  let frontier: string[] = [''];
  for (let d = 0; d < n; d++) {
    const next: string[] = [];
    for (const p of frontier) next.push(`${p}1`, `${p}0`);
    out.push(...next);
    frontier = next;
  }
  return out;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export const pruneBranchStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const frames = new Set<number>();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const cancelRaf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;

    /** 진행 중인 프레임 루프는 destroy 에서 전부 거둔다 (S-view). */
    function animate(durMs: number, onFrame: (t: number) => void): Promise<void> {
      if (destroyed || raf === null) {
        onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const started = typeof performance === 'object' ? performance.now() : Date.now();
        const tick = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const now = typeof performance === 'object' ? performance.now() : Date.now();
          const t = Math.min(1, (now - started) / durMs);
          onFrame(easeOut(t));
          if (t < 1) frames.add(raf(tick));
          else resolve();
        };
        frames.add(raf(tick));
      });
    }

    const root = el('g', {});
    svg.appendChild(root);

    const shadeLayer = el('g', {});
    const ghostEdgeLayer = el('g', {});
    const ghostNodeLayer = el('g', {});
    const liveEdgeLayer = el('g', {});
    const traceLayer = el('g', {});
    const liveNodeLayer = el('g', {});
    const capLayer = el('g', {});
    const chromeLayer = el('g', {});
    for (const layer of [
      shadeLayer, ghostEdgeLayer, ghostNodeLayer, liveEdgeLayer,
      traceLayer, liveNodeLayer, capLayer, chromeLayer,
    ]) {
      root.appendChild(layer);
    }

    // ── 마운트 시점에 한 번 정해지는 기하 ────────────────────────────────
    let depth = 0;
    let pitch = LEAF_PITCH_MAX;
    let originX = 0;
    let nodeR = 12;
    const geom = new Map<string, NodeGeom>();
    const ghostNodes = new Map<string, SVGCircleElement>();
    const liveNodes = new Map<string, LiveNode>();
    const rowLabels: SVGTextElement[] = [];
    let activeId: string | null = null;
    let lastSkipped = 0;

    const openedText = el('text', {
      x: TALLY_X, y: TALLY_Y1, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const skippedText = el('text', {
      x: TALLY_X, y: TALLY_Y2, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const targetText = el('text', {
      x: W - TALLY_X, y: TALLY_Y1, fill: c.text, 'text-anchor': 'end',
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const legendText = el('text', {
      x: W / 2, y: TALLY_Y2, fill: c.textMuted, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.xs,
    });
    legendText.textContent = tr(
      'label.branchKey',
      'left branch = put it in · right branch = leave it out',
    );
    const captionLines: SVGTextElement[] = [];
    for (let i = 0; i < CAPTION_MAX_LINES; i++) {
      captionLines.push(el('text', {
        x: W / 2, y: CAPTION_Y + i * CAPTION_LINE_H, fill: c.text, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md,
      }));
    }
    for (const t of [openedText, skippedText, targetText, legendText, ...captionLines]) {
      chromeLayer.appendChild(t);
    }

    function levelY(level: number): number {
      return TOP_Y + level * LEVEL_GAP;
    }

    function setTally(opened: number, skipped: number): void {
      openedText.textContent = tr('label.opened', 'opened {n}', { n: opened });
      skippedText.textContent = tr('label.skipped', 'never opened {n}', { n: skipped });
    }

    function popTally(): Promise<void> {
      return animate(TALLY_POP_MS, (t) => {
        const s = 1 + 0.42 * Math.sin(Math.PI * t);
        skippedText.setAttribute(
          'transform',
          `translate(${TALLY_X * (1 - s)} ${TALLY_Y2 * (1 - s)}) scale(${s})`,
        );
      });
    }

    function setActiveRow(row: number): void {
      rowLabels.forEach((label, i) => {
        label.setAttribute('fill', i === row ? c.text : c.textMuted);
        label.setAttribute('opacity', i === row ? '1' : '0.45');
      });
    }

    function styleOf(verdict: BranchVerdict, active: boolean): {
      fill: string; stroke: string; ink: string; width: number;
    } {
      if (active) return { fill: c.itemActive, stroke: c.text, ink: c.stateInk, width: 2 };
      switch (verdict) {
        case 'cut': return { fill: c.danger, stroke: c.danger, ink: c.stateInk, width: 2 };
        case 'answer': return { fill: c.itemPivot, stroke: c.text, ink: c.stateInk, width: 2 };
        case 'dead': return { fill: c.itemDefault, stroke: c.border, ink: c.textMuted, width: 1.5 };
        default: return { fill: c.itemDefault, stroke: c.text, ink: c.text, width: 1.5 };
      }
    }

    function applyStyle(node: LiveNode, active: boolean): void {
      const s = styleOf(node.verdict, active);
      node.circle.setAttribute('fill', s.fill);
      node.circle.setAttribute('stroke', s.stroke);
      node.circle.setAttribute('stroke-width', String(s.width));
      node.label.setAttribute('fill', s.ink);
    }

    function settleActive(): void {
      if (activeId === null) return;
      const node = liveNodes.get(activeId);
      if (node) applyStyle(node, false);
      activeId = null;
    }

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    /** 유령만 남은 처음 상태로 되돌린다. */
    function resetToGhost(): void {
      clearLayer(liveEdgeLayer);
      clearLayer(liveNodeLayer);
      clearLayer(capLayer);
      clearLayer(traceLayer);
      clearLayer(shadeLayer);
      liveNodes.clear();
      activeId = null;
      lastSkipped = 0;
      for (const ghost of ghostNodes.values()) {
        ghost.setAttribute('opacity', '0.5');
        ghost.setAttribute('r', String(nodeR));
      }
      setTally(0, 0);
      setActiveRow(-1);
      setCaption('');
      skippedText.removeAttribute('transform');
    }

    function setCaption(text: string): void {
      const lines = text === ''
        ? []
        : wrapText(text, CAPTION_FONT_PX, W - CAPTION_SIDE * 2, CAPTION_MAX_LINES);
      captionLines.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    function init(cfg: PruneBranchStageInit): void {
      clearLayer(ghostEdgeLayer);
      clearLayer(ghostNodeLayer);
      geom.clear();
      ghostNodes.clear();
      for (const label of rowLabels) label.remove();
      rowLabels.length = 0;

      depth = cfg.values.length;
      const leafCount = 2 ** depth;
      pitch = Math.min(LEAF_PITCH_MAX, Math.floor((W - SIDE_MIN * 2) / leafCount));
      const treeW = leafCount * pitch;
      originX = Math.round((W - treeW) / 2);
      nodeR = Math.max(8, Math.min(12, Math.floor(pitch * 0.38)));

      for (const path of allPaths(depth)) {
        let start = 0;
        let width = leafCount;
        for (const ch of path) {
          width /= 2;
          if (ch === '0') start += width;
        }
        geom.set(`r${path}`, {
          x: originX + (start + width / 2) * pitch,
          y: levelY(path.length),
          level: path.length,
          start,
          width,
        });
      }

      // 유령 — 다 뻗었을 때의 나무. 견줄 대상이므로 지우지 않는다.
      for (const [id, g] of geom) {
        if (g.level > 0) {
          const parent = geom.get(`r${id.slice(1, -1)}`);
          if (parent) {
            ghostEdgeLayer.appendChild(el('line', {
              x1: parent.x, y1: parent.y + nodeR, x2: g.x, y2: g.y - nodeR,
              stroke: c.ghostOutline, 'stroke-width': 1,
              'stroke-dasharray': '3 3', opacity: 0.5,
            }));
          }
        }
        const circle = el('circle', {
          cx: g.x, cy: g.y, r: nodeR, fill: 'none',
          stroke: c.ghostOutline, 'stroke-width': 1,
          'stroke-dasharray': '3 3', opacity: 0.5,
        });
        ghostNodeLayer.appendChild(circle);
        ghostNodes.set(id, circle);
      }

      // 홈통의 층 라벨 — 그 층의 가지들이 정하는 수. 숫자 표식이라 키를 두지 않는다.
      for (let k = 0; k < depth; k++) {
        const label = el('text', {
          x: Math.round(originX / 2), y: levelY(k) + LEVEL_GAP / 2 + 4,
          fill: c.textMuted, 'text-anchor': 'middle', opacity: 0.45,
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        });
        label.textContent = String(cfg.values[k]);
        chromeLayer.appendChild(label);
        rowLabels.push(label);
      }

      targetText.textContent = tr('label.target', 'target = {n}', { n: cfg.target });
      resetToGhost();
    }

    async function growEdge(parentId: string, childId: string): Promise<void> {
      const parent = geom.get(parentId);
      const child = geom.get(childId);
      if (!parent || !child) return;
      const x1 = parent.x;
      const y1 = parent.y + nodeR;
      const x2 = child.x;
      const y2 = child.y - nodeR;
      const line = el('line', {
        x1, y1, x2: x1, y2: y1, stroke: c.text, 'stroke-width': 1.6, 'stroke-linecap': 'round',
      });
      liveEdgeLayer.appendChild(line);
      await animate(EDGE_MS, (t) => {
        line.setAttribute('x2', String(x1 + (x2 - x1) * t));
        line.setAttribute('y2', String(y1 + (y2 - y1) * t));
      });
    }

    async function popNode(id: string, sum: number, verdict: BranchVerdict): Promise<void> {
      const g = geom.get(id);
      if (!g) return;
      ghostNodes.get(id)?.setAttribute('opacity', '0');
      const active = styleOf(verdict, true);
      const circle = el('circle', {
        cx: g.x, cy: g.y, r: 0,
        fill: active.fill, stroke: active.stroke, 'stroke-width': active.width,
      });
      const label = el('text', {
        x: g.x, y: g.y + 4, fill: active.ink, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.sm, opacity: 0,
      });
      label.textContent = String(sum);
      liveNodeLayer.appendChild(circle);
      liveNodeLayer.appendChild(label);
      liveNodes.set(id, { circle, label, verdict });
      await animate(POP_MS, (t) => {
        circle.setAttribute('r', String(nodeR * t));
        label.setAttribute('opacity', String(t));
      });
      circle.setAttribute('r', String(nodeR));
      label.setAttribute('opacity', '1');
    }

    /**
     * 판정이 자리를 채운다 — 판정색 원반이 가운데에서 자라 자리를 덮는다.
     * 색만 갈아 끼우면 70ms 짜리 깜빡임으로 읽혀 "재고 나서 정했다" 가 사라진다.
     */
    async function floodVerdict(id: string): Promise<void> {
      const g = geom.get(id);
      const node = liveNodes.get(id);
      if (!g || !node) return;
      const resting = styleOf(node.verdict, false);
      const disc = el('circle', { cx: g.x, cy: g.y, r: 0, fill: resting.fill });
      liveNodeLayer.insertBefore(disc, node.label);
      await animate(VERDICT_MS, (t) => {
        disc.setAttribute('r', String(nodeR * t));
      });
      applyStyle(node, false);
      disc.remove();
    }

    /** 닫힌 자리의 뚜껑 — 가로로 펴진다. */
    async function drawCap(id: string): Promise<void> {
      const g = geom.get(id);
      if (!g) return;
      const capW = nodeR * 1.9;
      const capY = g.y + nodeR + 4;
      const bar = el('rect', {
        x: g.x, y: capY, width: 0, height: 4, rx: 2, fill: c.danger,
      });
      capLayer.appendChild(bar);
      await animate(VERDICT_MS, (t) => {
        bar.setAttribute('width', String(capW * t));
        bar.setAttribute('x', String(g.x - (capW * t) / 2));
      });
    }

    /** 안 볼 자리 — 색지가 위에서 아래로 쓸려 내려간다. */
    async function sweepShade(id: string): Promise<void> {
      const g = geom.get(id);
      if (!g || g.level >= depth) return;
      const x = originX + g.start * pitch;
      const width = g.width * pitch;
      const yTop = g.y + LEVEL_GAP / 2;
      const yBot = levelY(depth) + nodeR + 6;
      const rect = el('rect', {
        x, y: yTop, width, height: 0, rx: 6, fill: c.subtreeShadeLeft,
      });
      shadeLayer.appendChild(rect);
      await animate(SHADE_MS, (t) => {
        rect.setAttribute('height', String((yBot - yTop) * t));
      });
    }

    /** 답까지의 길 — 뿌리에서 아래로 한 번에 그어진다. */
    async function traceAnswer(id: string): Promise<void> {
      const points: Array<[number, number]> = [];
      for (let len = 1; len <= id.length; len++) {
        const g = geom.get(id.slice(0, len));
        if (g) points.push([g.x, g.y]);
      }
      if (points.length < 2) return;
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      }
      const line = el('polyline', {
        points: points.map(([x, y]) => `${x},${y}`).join(' '),
        fill: 'none', stroke: c.accent, 'stroke-width': 3, 'stroke-linecap': 'round',
        'stroke-dasharray': total, 'stroke-dashoffset': total,
      });
      traceLayer.appendChild(line);
      await animate(TRACE_MS, (t) => {
        line.setAttribute('stroke-dashoffset', String(total * (1 - t)));
      });
    }

    const instance: ViewInstance = {
      init(cfg: PruneBranchStageInit): void {
        init(cfg);
      },

      setCaption(text: string): void {
        setCaption(text);
      },

      /** 과제를 세운다 — 맞춰야 하는 합에 눈이 한 번 가게. */
      async markTask(): Promise<void> {
        settleActive();
        await animate(TALLY_POP_MS, (t) => {
          const s = 1 + 0.3 * Math.sin(Math.PI * t);
          targetText.setAttribute(
            'transform',
            `translate(${(W - TALLY_X) * (1 - s)} ${TALLY_Y1 * (1 - s)}) scale(${s})`,
          );
        });
        targetText.removeAttribute('transform');
      },

      /** 한 자리로 가지가 뻗고, 그 자리가 판정을 받는다. */
      async growTo(step: PruneBranchStageStep): Promise<void> {
        settleActive();
        setActiveRow(step.level - 1);
        if (step.parentId !== '') await growEdge(step.parentId, step.id);
        await popNode(step.id, step.sum, step.verdict);
        setTally(step.opened, step.skipped);

        if (step.verdict === 'cut') {
          await floodVerdict(step.id);
          await drawCap(step.id);
          const jumped = step.skipped !== lastSkipped;
          lastSkipped = step.skipped;
          await Promise.all([
            step.below > 0 ? sweepShade(step.id) : Promise.resolve(),
            jumped ? popTally() : Promise.resolve(),
          ]);
          skippedText.removeAttribute('transform');
          return;
        }
        if (step.verdict === 'answer') {
          await floodVerdict(step.id);
          await traceAnswer(step.id);
          return;
        }
        activeId = step.id;
      },

      /**
       * 다 돌았다. 아직 보이는 유령은 전부 **끝내 안 연 자리**다 — 연 자리의
       * 유령은 그때그때 가려졌으므로. 그것들만 한 번에 부풀렸다 가라앉힌다.
       */
      async finish(): Promise<void> {
        settleActive();
        setActiveRow(-1);
        const left: SVGCircleElement[] = [];
        for (const ghost of ghostNodes.values()) {
          if (ghost.getAttribute('opacity') !== '0') left.push(ghost);
        }
        await animate(SHADE_MS, (t) => {
          const pulse = Math.sin(Math.PI * t);
          for (const ghost of left) {
            ghost.setAttribute('r', String(nodeR * (1 + 0.24 * pulse)));
            ghost.setAttribute('opacity', String(0.5 + 0.3 * t));
          }
        });
        for (const ghost of left) ghost.setAttribute('r', String(nodeR));
      },

      rewind(): void {
        resetToGhost();
      },

      destroy(): void {
        destroyed = true;
        if (cancelRaf !== null) for (const id of frames) cancelRaf(id);
        frames.clear();
        root.remove();
      },
    };

    return instance;
  },
};
