/**
 * rule-match-order 무대.
 *
 * 규칙 목록을 표로 세우고, 지금 맞춰 보는 패킷을 같은 칸 폭의 띠로 그 줄 바로 위에
 * 얹는다. 패킷 띠는 한 줄씩 **아래로 내려오고**, 칸마다 규칙 칸과 이어 본 자국을 남긴다
 * (맞은 칸 · 처음 어긋난 칸 하나). 네 칸이 다 맞으면 거기서 멈추고 그 아래 줄은 흐려진다.
 *
 * 오른쪽의 세로 줄 넷은 패킷마다 내려간 깊이다. 끝 화면에 깊이가 서로 다른 넷이 남는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FirewallRule, MatchField, RuleMatchOrderScene } from './scene.js';

const H = 340;
const MARGIN = 14;
const TOP = 8;
const HEAD_H = 24;
const CAPTION_H = 42;
const LANE_GAP = 18;
const LANE_MAX = 72;
const LANE_MIN = 44;
const CELL_PAD = 16;
const CARD_MAX = 24;
const ROW_MAX = 30;
const MOVE_MS = 420;
const SETTLE_MS = 220;
const DIM = 0.3;
const CARD_RX = 6;

const FIELDS: readonly MatchField[] = ['proto', 'src', 'dst', 'port'];
type Column = 'n' | 'action' | MatchField;
const COLUMNS: readonly Column[] = ['n', 'action', ...FIELDS];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌표 · 크기를 글자로 — 끝자리를 자르고 -0 을 0 으로 */
function num(v: number): string {
  return String(Math.round(v * 10) / 10 + 0);
}

/** 글자 폭 어림. 한글 · 한자권 · 데바나가리 같은 넓은 글자는 한 em 으로 센다 */
function textWidth(text: string, px: number, mono: boolean): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x0900 ? px : px * (mono ? 0.62 : 0.57);
  }
  return w;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

/** 한 줄에 들지 않는 캡션을 가운데에 가장 가까운 문장 · 대시 경계에서 둘로 가른다 */
function splitCaption(text: string): string[] {
  const marks = ['. ', '。', '। ', ' — ', ' ← ', ' → '];
  let best = -1;
  let bestLen = 0;
  for (const m of marks) {
    let at = text.indexOf(m);
    while (at >= 0) {
      const cut = m.startsWith(' ') ? at : at + m.trimEnd().length;
      if (best < 0 || Math.abs(cut - text.length / 2) < Math.abs(best - text.length / 2)) {
        best = cut;
        bestLen = m.startsWith(' ') ? 0 : m.length - m.trimEnd().length;
      }
      at = text.indexOf(m, at + 1);
    }
  }
  if (best <= 0) return [text];
  return [text.slice(0, best).trimEnd(), text.slice(best + bestLen).trimStart()];
}

type Labels = {
  head: Record<Column, string>;
  allow: string;
  deny: string;
};

function readLabels(t: Translate): Labels {
  return {
    head: {
      n: '',
      action: t('col.action', 'Action'),
      proto: t('field.proto', 'Protocol'),
      src: t('field.src', 'Source'),
      dst: t('field.dst', 'Destination'),
      port: t('field.port', 'Port'),
    },
    allow: t('label.allow', 'allow'),
    deny: t('label.deny', 'deny'),
  };
}

type Layout = {
  colX: Record<Column, number>;
  colW: Record<Column, number>;
  tableX: number;
  tableW: number;
  laneX: number[];
  pitch: number;
  cardH: number;
  rowH: number;
  gap: number;
  bodyTop: number;
};

function cellText(rule: FirewallRule, col: MatchField): string {
  return rule[col];
}

function layout(scene: RuleMatchOrderScene, labels: Labels): Layout {
  const sm = parseFloat(fontSizes.sm);
  const xs = parseFloat(fontSizes.xs);
  const nR = scene.rules.length;
  const nP = scene.packets.length;

  const need: Record<Column, number> = { n: 0, action: 0, proto: 0, src: 0, dst: 0, port: 0 };
  for (const col of COLUMNS) need[col] = textWidth(labels.head[col], xs, false);
  need.n = Math.max(need.n, textWidth(String(nR), sm, false));
  need.action = Math.max(need.action, textWidth(labels.allow, sm, false), textWidth(labels.deny, sm, false));
  for (const f of FIELDS) {
    for (const r of scene.rules) need[f] = Math.max(need[f], textWidth(cellText(r, f), sm, true));
    for (const p of scene.packets) need[f] = Math.max(need[f], textWidth(String(p[f]), sm, true));
  }
  // 패킷 이름표는 번호 · 동작 칸 너비에 앉는다
  const idW = Math.max(...scene.packets.map((p) => textWidth(p.id, sm, true))) + CELL_PAD;
  const colW = { ...need };
  for (const col of COLUMNS) colW[col] = need[col] + CELL_PAD;
  if (colW.n + colW.action < idW + 8) colW.action = idW + 8 - colW.n;

  const base = COLUMNS.reduce((s, c) => s + colW[c], 0);
  const free = PIECE_CANVAS_W - 2 * MARGIN - LANE_GAP;
  const laneW = Math.max(LANE_MIN, Math.min(LANE_MAX, (free - base) / nP));
  const tableW = free - laneW * nP;
  // 남는 폭은 칸에 고루 나눠 캔버스 폭을 채운다
  const scale = tableW / base;
  const colX = { ...need };
  let x = MARGIN;
  for (const col of COLUMNS) {
    colW[col] *= scale;
    colX[col] = x;
    x += colW[col];
  }
  const laneStart = MARGIN + tableW + LANE_GAP;
  const laneX = scene.packets.map((_, j) => laneStart + laneW * (j + 0.5));

  const bodyTop = TOP + HEAD_H;
  const pitch = (H - bodyTop - CAPTION_H) / nR;
  const cardH = Math.min(CARD_MAX, pitch * 0.36);
  const rowH = Math.min(ROW_MAX, pitch * 0.44);
  const gap = Math.max(6, Math.min(12, (pitch - cardH - rowH) * 0.6));
  return { colX, colW, tableX: MARGIN, tableW, laneX, pitch, cardH, rowH, gap, bodyTop };
}

function bandY(L: Layout, i: number): number {
  return L.bodyTop + i * L.pitch + 2;
}

function rowY(L: Layout, i: number): number {
  return bandY(L, i) + L.cardH + L.gap;
}

function colCenter(L: Layout, col: Column): number {
  return L.colX[col] + L.colW[col] / 2;
}

/** 움직임이 손댈 요소 — drawStatic 이 매번 새로 만든다 */
type Handles = {
  card: SVGGElement | null;
  /** 띠가 닿은 뒤에야 서는 것 — 맞춰 본 자국 */
  reveal: SVGElement[];
  newDot: SVGGElement | null;
  laneLine: SVGLineElement | null;
  laneFrom: number;
  laneTo: number;
  below: SVGGElement[];
  cardFrom: number;
  cardTo: number;
};

export const ruleMatchOrderStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const labels = readLabels(t);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      text: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = text;
      return node;
    }

    function actionColor(action: string): string {
      return action === 'allow' ? colors.success : colors.danger;
    }

    function actionLabel(action: string): string {
      return action === 'allow' ? labels.allow : labels.deny;
    }

    /** 처음 어긋난 칸 — 글자 밑에 까는 강조. 글자보다 먼저 그려야 글자를 덮지 않는다 */
    function failMark(parent: Element, L: Layout, field: MatchField, y: number, h: number): SVGRectElement {
      const w = L.colW[field] - 6;
      return el(
        'rect',
        { x: colCenter(L, field) - w / 2, y: y + 3, width: w, height: h - 6, rx: 3, fill: colors.accent },
        parent,
      );
    }

    function caption(scene: RuleMatchOrderScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.start', 'Rules: {r} · Packets: {p}', {
          r: scene.rules.length,
          p: scene.packets.length,
        });
      }
      const pkt = scene.packets[step.packet]!.id;
      const n = step.rule + 1;
      if (step.fail !== null) {
        return t('caption.miss', 'Rule {n} × {pkt}: {field} differs — down one row.', {
          n,
          pkt,
          field: labels.head[step.fail],
        });
      }
      const action = actionLabel(scene.rules[step.rule]!.action);
      if (step.rule < scene.rules.length - 1) {
        return t('caption.match', 'Rule {n} × {pkt}: all fields match → {action}. Rows below are not reached.', {
          n,
          pkt,
          action,
        });
      }
      return t('caption.matchLast', 'Rule {n} × {pkt}: all fields match → {action}.', { n, pkt, action });
    }

    function drawStatic(scene: RuleMatchOrderScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        card: null,
        reveal: [],
        newDot: null,
        laneLine: null,
        laneFrom: 0,
        laneTo: 0,
        below: [],
        cardFrom: 0,
        cardTo: 0,
      };
      const L = layout(scene, labels);
      const step = scene.step;
      const root = el('g', {}, svg);

      // 머리 줄 — 칸 이름과 패킷 이름
      const headY = TOP + HEAD_H / 2;
      for (const col of COLUMNS) {
        if (labels.head[col] === '') continue;
        label(root, labels.head[col], colCenter(L, col), headY, { size: fontSizes.xs, fill: colors.textMuted });
      }
      const donePackets = new Set(scene.checks.filter((c) => c.fail === null).map((c) => c.packet));
      scene.packets.forEach((p, j) => {
        const current = step !== null && step.packet === j;
        label(root, p.id, L.laneX[j]!, headY, {
          size: fontSizes.sm,
          fill: current || donePackets.has(j) ? colors.text : colors.textMuted,
          mono: true,
          weight: current ? 700 : 400,
        });
      });

      // 규칙 줄
      const stopped = step !== null && step.fail === null;
      scene.rules.forEach((rule, i) => {
        const g = el('g', {}, root);
        if (stopped && step !== null && i > step.rule) {
          g.setAttribute('opacity', String(DIM));
          handles.below.push(g);
        }
        const y = rowY(L, i);
        const here = step !== null && step.rule === i;
        el(
          'rect',
          {
            x: L.tableX,
            y,
            width: L.tableW,
            height: L.rowH,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: here ? (stopped ? actionColor(rule.action) : colors.itemActive) : colors.border,
            'stroke-width': here ? 2 : 1,
          },
          g,
        );
        if (here && step !== null && step.fail !== null) {
          handles.reveal.push(failMark(g, L, step.fail, y, L.rowH));
        }
        const cy = y + L.rowH / 2;
        label(g, String(i + 1), colCenter(L, 'n'), cy, { size: fontSizes.sm, fill: colors.textMuted });
        label(g, actionLabel(rule.action), colCenter(L, 'action'), cy, {
          size: fontSizes.sm,
          fill: actionColor(rule.action),
          weight: 700,
        });
        for (const f of FIELDS) {
          const ink = here && step !== null && step.fail === f ? colors.stateInk : colors.text;
          label(g, cellText(rule, f), colCenter(L, f), cy, { size: fontSizes.sm, fill: ink, mono: true });
        }
      });

      // 깊이 줄 — 패킷마다 맞춰 본 줄에 점, 멈춘 줄에 동작
      scene.packets.forEach((_, j) => {
        const mine = scene.checks.filter((c) => c.packet === j);
        if (mine.length === 0) return;
        const x = L.laneX[j]!;
        const dotY = (i: number): number => rowY(L, i) + L.rowH / 2;
        const lastRule = mine[mine.length - 1]!.rule;
        const line = el(
          'line',
          {
            x1: x,
            y1: L.bodyTop,
            x2: x,
            y2: dotY(lastRule),
            stroke: colors.border,
            'stroke-width': 2,
          },
          root,
        );
        const isStep = step !== null && step.packet === j;
        if (isStep && step !== null) {
          handles.laneLine = line;
          handles.laneFrom = step.from < 0 ? L.bodyTop : dotY(step.from);
          handles.laneTo = dotY(step.rule);
        }
        for (const c of mine) {
          const dot = el('g', {}, root);
          const y = dotY(c.rule);
          if (c.fail === null) {
            const action = scene.rules[c.rule]!.action;
            el('circle', { cx: x, cy: y, r: 6, fill: actionColor(action) }, dot);
            label(dot, actionLabel(action), x, y + 16, { size: fontSizes.xs, fill: actionColor(action), weight: 700 });
          } else {
            el('circle', { cx: x, cy: y, r: 4, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 }, dot);
          }
          if (isStep && step !== null && c.rule === step.rule) handles.newDot = dot;
        }
      });

      // 지금 맞춰 보는 패킷 — 그 줄 바로 위의 띠
      if (step !== null) {
        const packet = scene.packets[step.packet]!;
        const rule = scene.rules[step.rule]!;
        const by = bandY(L, step.rule);
        const card = el('g', {}, root);
        const cardX = L.colX.proto;
        const cardW = L.colX.port + L.colW.port - cardX;
        el(
          'rect',
          {
            x: cardX,
            y: by,
            width: cardW,
            height: L.cardH,
            rx: CARD_RX,
            fill: colors.bg,
            stroke: colors.text,
            'stroke-width': 1.5,
          },
          card,
        );
        if (step.fail !== null) handles.reveal.push(failMark(card, L, step.fail, by, L.cardH));
        const tagRight = cardX - 6;
        const tagW = L.colW.n + L.colW.action - 10;
        el(
          'rect',
          {
            x: tagRight - tagW,
            y: by,
            width: tagW,
            height: L.cardH,
            rx: L.cardH / 2,
            fill: colors.text,
          },
          card,
        );
        label(card, packet.id, tagRight - tagW / 2, by + L.cardH / 2, {
          size: fontSizes.sm,
          fill: colors.textInverse,
          mono: true,
          weight: 700,
        });
        for (const f of FIELDS) {
          label(card, String(packet[f]), colCenter(L, f), by + L.cardH / 2, {
            size: fontSizes.sm,
            fill: step.fail === f ? colors.stateInk : colors.text,
            mono: true,
          });
        }

        // 맞춰 본 자국 — 차례대로 맞은 칸, 그리고 처음 어긋난 칸 하나
        const marks = el('g', {}, root);
        const y1 = by + L.cardH;
        const y2 = rowY(L, step.rule);
        for (const f of FIELDS) {
          const cx = colCenter(L, f);
          if (f === step.fail) {
            el('line', { x1: cx, y1, x2: cx, y2, stroke: colors.accent, 'stroke-width': 3 }, marks);
            break;
          }
          el('line', { x1: cx, y1, x2: cx, y2, stroke: colors.success, 'stroke-width': 2 }, marks);
        }
        if (step.fail === null) {
          el(
            'rect',
            {
              x: cardX,
              y: by,
              width: cardW,
              height: L.cardH,
              rx: CARD_RX,
              fill: 'none',
              stroke: actionColor(rule.action),
              'stroke-width': 2,
            },
            marks,
          );
        }
        handles.card = card;
        handles.reveal.push(marks);
        handles.cardTo = by;
        handles.cardFrom = step.from < 0 ? L.bodyTop - L.pitch : bandY(L, step.from);
      }

      // 캡션 — 지금 일어난 일
      const text = caption(scene);
      const room = PIECE_CANVAS_W - 2 * MARGIN;
      const lines = textWidth(text, parseFloat(fontSizes.md), false) <= room ? [text] : splitCaption(text);
      const size = lines.length === 1 ? fontSizes.md : fontSizes.sm;
      const lead = parseFloat(fontSizes.sm) + 4;
      lines.forEach((line, i) => {
        const y = H - CAPTION_H / 2 + (i - (lines.length - 1) / 2) * lead;
        label(root, line, MARGIN, y, { size, fill: colors.text, anchor: 'start' });
      });
      return handles;
    }

    function tween(mine: number, ms: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: RuleMatchOrderScene, _prev: RuleMatchOrderScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null || h.card === null) return;

        // 내려오기 — 띠가 앞에 서 있던 줄에서 이번 줄로. 자국과 새 점은 닿은 뒤에 선다
        const dy = h.cardFrom - h.cardTo;
        const card = h.card;
        for (const node of h.reveal) node.setAttribute('opacity', '0');
        h.newDot?.setAttribute('opacity', '0');
        for (const g of h.below) g.setAttribute('opacity', '1');
        card.setAttribute('transform', `translate(0 ${num(dy)})`);
        h.laneLine?.setAttribute('y2', num(h.laneFrom));
        await tween(mine, MOVE_MS, (k) => {
          card.setAttribute('transform', `translate(0 ${num(dy * (1 - k))})`);
          h.laneLine?.setAttribute('y2', num(h.laneFrom + (h.laneTo - h.laneFrom) * k));
        });
        if (mine !== gen || destroyed) return;
        card.removeAttribute('transform');
        for (const node of h.reveal) node.removeAttribute('opacity');
        h.newDot?.removeAttribute('opacity');

        // 멈춤 — 그 아래 줄이 이 패킷에게서 물러난다
        if (step.fail === null && h.below.length > 0) {
          await tween(mine, SETTLE_MS, (k) => {
            for (const g of h.below) g.setAttribute('opacity', num(1 - (1 - DIM) * k));
          });
          if (mine !== gen || destroyed) return;
        }
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    } as ViewInstance;
  },
};
