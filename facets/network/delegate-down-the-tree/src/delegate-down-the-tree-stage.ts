/**
 * delegate-down-the-tree 의 그림.
 *
 * 왼쪽 기둥에 클라이언트와 리졸버, 오른쪽에 서버가 층마다 한 줄씩 계단으로 내려간다.
 * 리졸버는 넘김을 받을 때마다 기둥을 따라 한 층 **내려가** 그 층의 서버 곁에 선다.
 * 위쪽의 이름은 맡은 서버가 정해진 끝 부분에 밑줄이 붙고, 넘김마다 그 밑줄이 왼쪽으로 자란다.
 * 서버는 받은 질문을 한 칸에 남긴다 — 네 칸의 글자가 같다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DnsServer } from './algorithm.js';
import type { DelegateScene, DelegateStep } from './scene.js';

const H = 430;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const PAD_X = 10;
const PAD_Y = 6;
const LINE = 15;
const COL_GAP = 24;
const MAX_INDENT = 60;
const MAX_ROW_GAP = 26;
const ELBOW = 16;
const CAPTION_ROOM = 40;

const MOVE_MS = 500;
const GROW_MS = 300;
const RISE_MS = 600;
const FRAME_MS = 16;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

type Row = { x: number; y: number; w: number; h: number; lines: number };

type Layout = {
  cw: number;
  bigCw: number;
  colW: number;
  client: { x: number; y: number; w: number; h: number };
  nameX: number;
  nameY: number;
  rows: Map<string, Row>;
  resolverH: number;
  captionY: number;
};

function questionText(scene: DelegateScene): string {
  return `${scene.qname} ${scene.qtype} ?`;
}

function delegationText(d: { zone: string; ns: string }): string {
  return `${d.zone} → ${d.ns}`;
}

function recordText(r: { name: string; type: string; value: string }): string {
  return `${r.name} ${r.type} ${r.value}`;
}

function serverLines(sv: DnsServer): number {
  return 2 + sv.delegations.length + sv.records.length;
}

/** 줄 i (0 부터) 의 글자 바탕선 */
function lineY(top: number, i: number): number {
  return r1(top + PAD_Y + LINE * i + LINE * 0.75);
}

function layoutOf(scene: DelegateScene): Layout {
  const cw = parseFloat(fontSizes.xs) * 0.6;
  const bigCw = parseFloat(fontSizes.lg) * 0.6;
  const q = questionText(scene);
  const colW = Math.min(200, q.length * cw + PAD_X * 2);

  let maxChars = 0;
  for (const sv of scene.servers) {
    maxChars = Math.max(maxChars, sv.name.length + 2 + sv.addr.length, q.length);
    for (const d of sv.delegations) maxChars = Math.max(maxChars, delegationText(d).length);
    for (const r of sv.records) maxChars = Math.max(maxChars, recordText(r).length);
  }
  const boxW = maxChars * cw + PAD_X * 2;
  const firstX = PAD + colW + COL_GAP;

  const order = scene.servers
    .map((sv, i) => ({ sv, level: scene.levels[i] ?? 0, i }))
    .sort((a, b) => a.level - b.level || a.i - b.i);
  const steps = Math.max(1, order.length - 1);
  const indent = Math.max(0, Math.min(MAX_INDENT, (PIECE_CANVAS_W - PAD - firstX - boxW - ELBOW) / steps));

  const client = { x: PAD, y: PAD, w: colW, h: LINE * 2 + PAD_Y * 2 };
  const top = client.y + client.h + 20;
  const heights = order.map((o) => serverLines(o.sv) * LINE + PAD_Y * 2);
  const sumH = heights.reduce((a, b) => a + b, 0);
  const rowGap = Math.max(8, Math.min(MAX_ROW_GAP, (H - CAPTION_ROOM - top - sumH) / steps));

  const rows = new Map<string, Row>();
  let y = top;
  order.forEach((o, k) => {
    const h = heights[k] ?? 0;
    rows.set(o.sv.name, {
      x: r1(firstX + indent * k),
      y: r1(y),
      w: r1(boxW),
      h: r1(h),
      lines: serverLines(o.sv),
    });
    y += h + rowGap;
  });

  return {
    cw,
    bigCw,
    colW: r1(colW),
    client,
    nameX: r1(firstX),
    nameY: r1(client.y + client.h / 2 + parseFloat(fontSizes.lg) * 0.35),
    rows,
    resolverH: LINE * 3 + PAD_Y * 2,
    captionY: H - 14,
  };
}

function rowOf(lay: Layout, name: string): Row {
  const row = lay.rows.get(name);
  if (!row) throw new Error(`delegate-down-the-tree-stage: 자리가 없는 서버 ${name}`);
  return row;
}

function serverOf(scene: DelegateScene, name: string): DnsServer {
  const sv = scene.servers.find((x) => x.name === name);
  if (!sv) throw new Error(`delegate-down-the-tree-stage: 표에 없는 서버 ${name}`);
  return sv;
}

type Handles = {
  resolver: SVGGElement | null;
  resolverQ: SVGTextElement | null;
  resolverNote: SVGTextElement | null;
  clientStatus: SVGTextElement | null;
  slots: Map<string, SVGTextElement>;
  arrows: Map<string, SVGPathElement>;
  heads: Map<string, SVGPathElement>;
  underline: SVGLineElement | null;
  overlay: SVGGElement | null;
};

export const delegateDownTheTreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let h: Handles = emptyHandles();

    function emptyHandles(): Handles {
      return {
        resolver: null,
        resolverQ: null,
        resolverNote: null,
        clientStatus: null,
        slots: new Map(),
        arrows: new Map(),
        heads: new Map(),
        underline: null,
        overlay: null,
      };
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { mono?: boolean; size?: string; fill?: string; weight?: string; anchor?: string } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: r1(x),
        y: r1(y),
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function caption(step: DelegateStep, scene: DelegateScene): string {
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'The resolver knows one server: {server}', {
            server: scene.resolverAt,
          });
        case 'clientAsk':
          return t('caption.clientAsk', 'The client asks once, then waits: {q}', {
            q: questionText(scene),
          });
        case 'query':
          return t('caption.query', 'Query {n} to {server}, the whole name again: {q}', {
            n: step.n,
            server: step.server,
            q: questionText(scene),
          });
        case 'referral':
          return t('caption.referral', 'No answer, a pointer one level down: {zone} → {ns} ({addr})', {
            zone: step.zone,
            ns: step.ns,
            addr: step.addr,
          });
        case 'answer':
          return t('caption.answer', 'Answer from {server}: {value}', {
            server: step.server,
            value: step.value,
          });
        case 'reply':
          return t('caption.reply', 'To the client: {value}. Queries sent by the resolver: {q}, pointers followed: {r}', {
            value: step.value,
            q: step.queries,
            r: step.referrals,
          });
      }
    }

    function drawStatic(scene: DelegateScene): void {
      svg.textContent = '';
      h = emptyHandles();
      const lay = layoutOf(scene);
      const cw = lay.cw;

      // 이름 — 맡은 서버가 정해진 끝 부분이 굵고, 밑줄이 붙는다
      const name = scene.qname;
      const cut = name.length - scene.zone.length;
      const done = scene.answer !== null;
      const nameText = el(svg, 'text', {
        x: lay.nameX,
        y: lay.nameY,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
      });
      const head = el(nameText, 'tspan', { fill: c.textMuted });
      head.textContent = name.slice(0, cut);
      const tail = el(nameText, 'tspan', { fill: done ? c.success : c.primary, 'font-weight': '700' });
      tail.textContent = name.slice(cut);
      label(svg, lay.nameX + name.length * lay.bigCw + lay.bigCw * 0.6, lay.nameY, `${scene.qtype} ?`, {
        mono: true,
        size: fontSizes.lg,
        fill: c.textMuted,
      });
      const ulY = r1(lay.nameY + 6);
      h.underline = el(svg, 'line', {
        x1: r1(lay.nameX + cut * lay.bigCw),
        x2: r1(lay.nameX + name.length * lay.bigCw),
        y1: ulY,
        y2: ulY,
        stroke: done ? c.success : c.primary,
        'stroke-width': 3,
      });

      // 클라이언트
      const cl = lay.client;
      el(svg, 'rect', {
        x: cl.x,
        y: cl.y,
        width: cl.w,
        height: cl.h,
        rx: 6,
        fill: c.bgSubtle,
        stroke: scene.delivered !== null ? c.success : c.border,
      });
      label(svg, cl.x + PAD_X, lineY(cl.y, 0), t('label.client', 'Client'), {
        size: fontSizes.sm,
        weight: '600',
      });
      if (scene.delivered !== null) {
        h.clientStatus = label(svg, cl.x + PAD_X, lineY(cl.y, 1), scene.delivered, {
          mono: true,
          fill: c.success,
          weight: '700',
        });
      } else if (scene.clientAsked) {
        h.clientStatus = label(svg, cl.x + PAD_X, lineY(cl.y, 1), t('label.waiting', 'Waiting'), {
          fill: c.textMuted,
        });
      }

      // 리졸버가 내려온 길 — 기둥을 따라 점선, 물은 층마다 서버로 가는 짧은 가지
      const colMid = r1(PAD + lay.colW / 2);
      const firstRow = [...lay.rows.values()][0];
      const here = rowOf(lay, scene.resolverAt);
      if (firstRow && here.y > firstRow.y) {
        el(svg, 'line', {
          x1: colMid,
          x2: colMid,
          y1: firstRow.y,
          y2: here.y,
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        });
      }
      for (const asked of scene.asked) {
        const row = rowOf(lay, asked);
        const y = lineY(row.y, 0) - 4;
        el(svg, 'line', {
          x1: colMid,
          x2: row.x,
          y1: r1(y),
          y2: r1(y),
          stroke: asked === scene.resolverAt ? c.primary : c.textMuted,
          'stroke-width': 1.5,
        });
      }

      // 서버 — 층마다 한 줄, 계단으로
      const followedBy = new Map(scene.followed.map((f) => [f.server, f]));
      for (const sv of scene.servers) {
        const row = rowOf(lay, sv.name);
        const current = sv.name === scene.resolverAt && scene.clientAsked;
        el(svg, 'rect', {
          x: row.x,
          y: row.y,
          width: row.w,
          height: row.h,
          rx: 6,
          fill: c.bg,
          stroke: current ? c.primary : c.border,
          'stroke-width': current ? 2 : 1,
        });
        const x = row.x + PAD_X;
        label(svg, x, lineY(row.y, 0), sv.name, { mono: true, weight: '700' });
        label(svg, x + (sv.name.length + 2) * cw, lineY(row.y, 0), sv.addr, {
          mono: true,
          fill: c.textMuted,
        });
        // 받은 질문 칸
        if (scene.asked.includes(sv.name)) {
          h.slots.set(
            sv.name,
            label(svg, x, lineY(row.y, 1), questionText(scene), { mono: true, fill: c.text }),
          );
        } else {
          const y = r1(lineY(row.y, 1) - 3);
          el(svg, 'line', {
            x1: r1(x),
            x2: r1(x + questionText(scene).length * cw),
            y1: y,
            y2: y,
            stroke: c.border,
            'stroke-dasharray': '2 3',
          });
        }
        let li = 2;
        const followed = followedBy.get(sv.name);
        for (const d of sv.delegations) {
          const used = followed !== undefined && followed.zone === d.zone && followed.ns === d.ns;
          const y = lineY(row.y, li);
          if (used) {
            el(svg, 'rect', {
              x: r1(row.x + 3),
              y: r1(y - LINE * 0.75),
              width: r1(row.w - 6),
              height: LINE,
              rx: 3,
              fill: c.bgSubtle,
            });
          }
          label(svg, x, y, delegationText(d), {
            mono: true,
            fill: used ? c.primary : c.textMuted,
            weight: used ? '700' : '400',
          });
          if (used) {
            const next = rowOf(lay, d.ns);
            const ex = r1(row.x + row.w + ELBOW);
            const sy = r1(y - 4);
            const path = el(svg, 'path', {
              d: `M ${r1(row.x + row.w)} ${sy} H ${ex} V ${r1(next.y - 1)}`,
              fill: 'none',
              stroke: c.primary,
              'stroke-width': 2,
            });
            const arrowHead = el(svg, 'path', {
              d: `M ${r1(ex - 4)} ${r1(next.y - 7)} L ${ex} ${r1(next.y - 1)} L ${r1(ex + 4)} ${r1(next.y - 7)}`,
              fill: 'none',
              stroke: c.primary,
              'stroke-width': 2,
            });
            h.arrows.set(sv.name, path);
            h.heads.set(sv.name, arrowHead);
          }
          li += 1;
        }
        for (const rec of sv.records) {
          const hit =
            scene.answer !== null && scene.answer.server === sv.name && rec.name === scene.qname;
          const y = lineY(row.y, li);
          if (hit) {
            el(svg, 'rect', {
              x: r1(row.x + 3),
              y: r1(y - LINE * 0.75),
              width: r1(row.w - 6),
              height: LINE,
              rx: 3,
              fill: c.bgSubtle,
            });
          }
          label(svg, x, y, recordText(rec), {
            mono: true,
            fill: hit ? c.success : c.textMuted,
            weight: hit ? '700' : '400',
          });
          li += 1;
        }
      }

      // 리졸버 — 지금 선 층의 서버 곁
      const rg = el(svg, 'g', {});
      const ry = here.y;
      el(rg, 'rect', {
        x: PAD,
        y: ry,
        width: lay.colW,
        height: lay.resolverH,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.primary,
        'stroke-width': 2,
      });
      label(rg, PAD + PAD_X, lineY(ry, 0), t('label.resolver', 'Resolver'), {
        size: fontSizes.sm,
        weight: '600',
      });
      if (scene.clientAsked) {
        h.resolverQ = label(rg, PAD + PAD_X, lineY(ry, 1), questionText(scene), { mono: true });
      }
      if (scene.answer !== null) {
        h.resolverNote = label(rg, PAD + PAD_X, lineY(ry, 2), t('label.answer', 'Answer: {value}', {
          value: scene.answer.value,
        }), { fill: c.success, weight: '700' });
      } else {
        const target = serverOf(scene, scene.resolverAt);
        h.resolverNote = label(rg, PAD + PAD_X, lineY(ry, 2), t('label.next', 'Next: {addr}', {
          addr: target.addr,
        }), { fill: c.primary });
      }
      h.resolver = rg;

      // 캡션 — 지금 일어나는 일
      label(svg, PAD, lay.captionY, caption(scene.step, scene), { size: fontSizes.sm });

      h.overlay = el(svg, 'g', {});
    }

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let k = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (!alive(mine)) {
            wake();
            return;
          }
          const p = k / total;
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          frame(eased);
          if (k >= total) {
            wake();
            return;
          }
          k += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 글자 한 조각이 (fx,fy) 에서 (tx,ty) 로 옮겨 간다 */
    async function fly(
      mine: number,
      text: string,
      from: { x: number; y: number },
      to: { x: number; y: number },
      color: string,
      ms: number,
    ): Promise<void> {
      if (!h.overlay) return;
      const cw = parseFloat(fontSizes.xs) * 0.6;
      const g = el(h.overlay, 'g', {});
      el(g, 'rect', {
        x: -4,
        y: -LINE * 0.75 - 1,
        width: r1(text.length * cw + 8),
        height: LINE + 2,
        rx: 4,
        fill: c.bg,
        stroke: color,
        'stroke-width': 1.5,
      });
      label(g, 0, 0, text, { mono: true, fill: color, weight: '700' });
      await tween(mine, ms, (p) => {
        g.setAttribute(
          'transform',
          `translate(${r1(from.x + (to.x - from.x) * p)} ${r1(from.y + (to.y - from.y) * p)})`,
        );
      });
    }

    async function hideWhile(node: SVGElement | null | undefined, run: () => Promise<void>): Promise<void> {
      node?.setAttribute('opacity', '0');
      await run();
    }

    async function animate(mine: number, scene: DelegateScene): Promise<void> {
      const lay = layoutOf(scene);
      const step = scene.step;
      const colX = PAD + PAD_X;
      switch (step.kind) {
        case 'start':
          return;
        case 'clientAsk': {
          // 이름 줄에서 리졸버의 질문 칸으로 떨어진다
          const ry = rowOf(lay, scene.resolverAt).y;
          await hideWhile(h.resolverQ, () =>
            fly(mine, questionText(scene), { x: lay.nameX, y: lay.nameY }, { x: colX, y: lineY(ry, 1) }, c.primary, MOVE_MS),
          );
          return;
        }
        case 'query': {
          // 같은 질문의 사본이 리졸버에서 서버의 칸으로
          const row = rowOf(lay, step.server);
          await hideWhile(h.slots.get(step.server), () =>
            fly(
              mine,
              questionText(scene),
              { x: colX, y: lineY(row.y, 1) },
              { x: row.x + PAD_X, y: lineY(row.y, 1) },
              c.primary,
              MOVE_MS,
            ),
          );
          return;
        }
        case 'referral': {
          // 서버가 아래를 가리키고, 리졸버가 그 층으로 내려간다. 밑줄은 왼쪽으로 자란다
          const fromY = rowOf(lay, step.server).y;
          const toY = rowOf(lay, step.ns).y;
          const x0 = lay.nameX + (scene.qname.length - step.wasZone.length) * lay.bigCw;
          const x1 = lay.nameX + (scene.qname.length - step.zone.length) * lay.bigCw;
          const rg = h.resolver;
          const ul = h.underline;
          const head = h.heads.get(step.server);
          // 정적 그리기는 이미 끝 자리 — 운동 첫머리에 아직 못 온 자리로 되돌려 둔다
          rg?.setAttribute('transform', `translate(0 ${r1(fromY - toY)})`);
          ul?.setAttribute('x1', String(r1(x0)));
          head?.setAttribute('opacity', '0');
          const arrow = h.arrows.get(step.server);
          if (arrow) {
            const len = 400;
            arrow.setAttribute('stroke-dasharray', `${len} ${len}`);
            arrow.setAttribute('stroke-dashoffset', String(len));
            await tween(mine, GROW_MS, (p) => {
              arrow.setAttribute('stroke-dashoffset', String(r1(len * (1 - p))));
            });
            if (!alive(mine)) return;
          }
          head?.removeAttribute('opacity');
          await tween(mine, MOVE_MS, (p) => {
            rg?.setAttribute('transform', `translate(0 ${r1((fromY - toY) * (1 - p))})`);
            ul?.setAttribute('x1', String(r1(x0 + (x1 - x0) * p)));
          });
          return;
        }
        case 'answer': {
          // 맨 아래 서버의 값이 리졸버로
          const row = rowOf(lay, step.server);
          const sv = serverOf(scene, step.server);
          const idx = sv.records.findIndex((r) => r.name === scene.qname);
          if (idx < 0) throw new Error(`delegate-down-the-tree-stage: ${step.server} 에 답 레코드가 없다`);
          const rec = sv.records[idx];
          if (!rec) throw new Error('delegate-down-the-tree-stage: 레코드가 없다');
          const li = 2 + sv.delegations.length + idx;
          const vx = row.x + PAD_X + (rec.name.length + rec.type.length + 2) * lay.cw;
          await hideWhile(h.resolverNote, () =>
            fly(mine, step.value, { x: vx, y: lineY(row.y, li) }, { x: colX, y: lineY(row.y, 2) }, c.success, MOVE_MS),
          );
          return;
        }
        case 'reply': {
          // 답이 기둥을 따라 클라이언트까지 올라간다
          const ry = rowOf(lay, scene.resolverAt).y;
          await hideWhile(h.clientStatus, () =>
            fly(
              mine,
              step.value,
              { x: colX, y: lineY(ry, 2) },
              { x: colX, y: lineY(lay.client.y, 1) },
              c.success,
              RISE_MS,
            ),
          );
          return;
        }
      }
    }

    return {
      async render(next: DelegateScene, _prev: DelegateScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await animate(mine, next);
        if (alive(mine)) drawStatic(next);
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
    };
  },
};
