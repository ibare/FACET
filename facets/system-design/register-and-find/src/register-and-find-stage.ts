/**
 * register-and-find 의 무대.
 *
 * 위 — 등록부. 줄마다 임대가 틱 축 위의 막대로 놓이고, 지금 틱의 세로줄이 오른쪽으로 걷는다.
 * 가운데 — 부르는 쪽과 인스턴스 셋. 뜨지 않은 인스턴스는 낮게 가라앉아 있다가 등록하며 올라오고,
 *          멈추면 다시 가라앉는다.
 * 아래 — 부르는 쪽이 조회마다 받은 명단. 셋이 끝까지 나란히 남는다.
 *
 * 운동: 등록은 주소 표가 인스턴스에서 등록부의 새 줄로 올라가고, 하트비트는 점 하나가 올라가
 * 임대 막대를 오른쪽으로 민다. 만료는 줄이 등록부 밖으로 밀려나고 아래 줄이 올라온다.
 * 조회는 서비스 이름이 등록부로 올라가고, 그 순간의 줄이 명단으로 내려온다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { RegisterAndFindScene, RegistryRow } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;

const PAD = 10;
const REG_TOP = 10;
const AXIS_Y = 50;
const ROWS_TOP = 60;
const ROWS_AREA = 96;
const ROW_H_MAX = 30;
const BAND_GAP = 36;
const BOX_H = 48;
const SINK = 10;
const CALLER_W = 122;
const ANSWER_GAP = 30;
const CHIPS_AREA = 72;
const CHIP_H_MAX = 22;
const CAPTION_LINE = 17;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
/** 고정폭 글꼴의 글자 하나 폭 (em 에 대한 비) */
const MONO_EM = 0.6;

type Layout = {
  rowH: number;
  regBottom: number;
  trackX0: number;
  trackX1: number;
  bandTop: number;
  boxW: number;
  answerTop: number;
  chipH: number;
  captionTop: number;
};

function layoutFor(scene: RegisterAndFindScene): Layout {
  const n = scene.instances.length;
  const rowH = Math.min(ROW_H_MAX, ROWS_AREA / n);
  const regBottom = ROWS_TOP + ROWS_AREA + 8;
  const longest = Math.max(...scene.instances.map((x) => x.id.length + 1 + x.addr.length));
  const trackX0 = Math.min(W * 0.4, PAD + 16 + longest * XS * MONO_EM + 24);
  const bandTop = regBottom + BAND_GAP;
  const boxW = (W - PAD * 2 - CALLER_W - 20 - (n - 1) * 10) / n;
  const answerTop = bandTop + BOX_H + ANSWER_GAP;
  const chipH = Math.min(CHIP_H_MAX, CHIPS_AREA / n);
  const captionTop = answerTop + 20 + CHIPS_AREA + 22;
  return { rowH, regBottom, trackX0, trackX1: W - PAD - 14, bandTop, boxW, answerTop, chipH, captionTop };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

type Handles = {
  cursor: SVGGElement | null;
  boxes: Map<string, SVGGElement>;
  rows: Map<string, SVGGElement>;
  leases: Map<string, SVGGElement>;
  chips: SVGGElement[];
  serviceAt: { x: number; y: number };
  motion: SVGGElement;
};

export const registerAndFindStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: number; mono?: boolean; fill?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? SM,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function axisX(lay: Layout, axisEnd: number, tick: number): number {
      return lay.trackX0 + ((lay.trackX1 - lay.trackX0) * tick) / axisEnd;
    }

    function rowY(lay: Layout, slot: number): number {
      return ROWS_TOP + slot * lay.rowH;
    }

    function boxX(lay: Layout, k: number): number {
      return PAD + CALLER_W + 20 + k * (lay.boxW + 10);
    }

    function drawRow(
      parent: Element,
      lay: Layout,
      scene: RegisterAndFindScene,
      row: RegistryRow,
      slot: number,
      lit: boolean,
      leases: Map<string, SVGGElement> | null,
    ): SVGGElement {
      if (scene.axisEnd === null) throw new Error('register-and-find-stage: 임대 축이 없는데 줄이 있다');
      const g = el('g', {}, parent);
      const y = rowY(lay, slot);
      const mid = y + lay.rowH / 2;
      el('line', { x1: PAD + 6, y1: y + lay.rowH, x2: W - PAD - 6, y2: y + lay.rowH, stroke: colors.border, 'stroke-width': 1 }, g);
      label(g, PAD + 12, mid + XS / 3, row.id, { mono: true, size: XS, weight: 'bold' });
      label(g, PAD + 12 + (row.id.length + 1) * XS * MONO_EM, mid + XS / 3, row.addr, { mono: true, size: XS });
      const lease = el('g', {}, g);
      const x0 = axisX(lay, scene.axisEnd, row.last);
      const x1 = axisX(lay, scene.axisEnd, row.end);
      const barH = Math.min(12, lay.rowH - 10);
      el(
        'rect',
        {
          x: x0,
          y: mid - barH / 2,
          width: x1 - x0,
          height: barH,
          rx: 3,
          fill: lit ? colors.accent : colors.bg,
          stroke: colors.primary,
          'stroke-width': 1,
        },
        lease,
      );
      el('circle', { cx: x0, cy: mid, r: 4, fill: colors.primary }, lease);
      if (leases) leases.set(row.id, lease);
      return g;
    }

    function drawStatic(scene: RegisterAndFindScene): Handles {
      svg.textContent = '';
      const lay = layoutFor(scene);
      const step = scene.step;
      const touched = new Set<string>();
      if (step) {
        for (const h of step.happenings) if (h.kind === 'register' || h.kind === 'heartbeat') touched.add(h.id);
      }

      // ── 등록부
      el('rect', { x: PAD, y: REG_TOP, width: W - PAD * 2, height: lay.regBottom - REG_TOP, rx: 6, fill: colors.bgSubtle, stroke: colors.border }, svg);
      label(svg, PAD + 12, REG_TOP + 20, t('label.registry', 'Registry'), { weight: 'bold' });
      const serviceX = PAD + 12 + 110;
      label(svg, serviceX, REG_TOP + 20, scene.service, { mono: true });
      const serviceAt = { x: serviceX + (scene.service.length * SM * MONO_EM) / 2, y: REG_TOP + 20 };

      let cursor: SVGGElement | null = null;
      if (scene.axisEnd !== null) {
        const axisEnd = scene.axisEnd;
        label(svg, lay.trackX0 - 16, AXIS_Y, t('label.tick', 'Tick'), { size: XS, fill: colors.textMuted, anchor: 'end' });
        for (let k = 0; k <= axisEnd; k += 1) {
          const x = axisX(lay, axisEnd, k);
          label(svg, x, AXIS_Y, String(k), { size: XS, fill: colors.textMuted, anchor: 'middle', mono: true });
          el('line', { x1: x, y1: ROWS_TOP, x2: x, y2: lay.regBottom - 8, stroke: colors.border, 'stroke-width': 0.5 }, svg);
        }
        if (scene.now !== null) {
          const x = axisX(lay, axisEnd, scene.now);
          cursor = el('g', {}, svg);
          el('rect', { x: x - 11, y: AXIS_Y - XS - 2, width: 22, height: XS + 6, rx: 3, fill: colors.itemActive }, cursor);
          label(cursor, x, AXIS_Y, String(scene.now), { size: XS, fill: colors.stateInk, anchor: 'middle', mono: true, weight: 'bold' });
          el('line', { x1: x, y1: ROWS_TOP - 4, x2: x, y2: lay.regBottom - 4, stroke: colors.itemActive, 'stroke-width': 2 }, cursor);
        }
      } else if (scene.rows.length > 0) {
        throw new Error('register-and-find-stage: 임대 축이 없는데 줄이 있다');
      }

      const rows = new Map<string, SVGGElement>();
      const leases = new Map<string, SVGGElement>();
      scene.rows.forEach((row, slot) => {
        rows.set(row.id, drawRow(svg, lay, scene, row, slot, touched.has(row.id), leases));
      });

      // ── 부르는 쪽과 인스턴스
      const callerG = el('g', {}, svg);
      el('rect', { x: PAD, y: lay.bandTop, width: CALLER_W, height: BOX_H, rx: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, callerG);
      label(callerG, PAD + CALLER_W / 2, lay.bandTop + BOX_H / 2 + SM / 3, t('label.caller', 'Payment service'), { anchor: 'middle', weight: 'bold' });

      const boxes = new Map<string, SVGGElement>();
      scene.instances.forEach((inst, k) => {
        const state = scene.states[k];
        if (state === undefined) throw new Error(`register-and-find-stage: 인스턴스 ${inst.id} 의 처지가 없다`);
        const x = boxX(lay, k);
        const y = lay.bandTop + (state === 'up' ? 0 : SINK);
        const g = el('g', {}, svg);
        const stroke = state === 'up' ? colors.primary : state === 'stopped' ? colors.danger : colors.textMuted;
        el(
          'rect',
          {
            x,
            y,
            width: lay.boxW,
            height: BOX_H,
            rx: 6,
            fill: colors.bg,
            stroke,
            'stroke-width': state === 'up' ? 1.5 : 1.2,
            'stroke-dasharray': state === 'up' ? 'none' : '4 3',
          },
          g,
        );
        const ink = state === 'up' ? colors.text : colors.textMuted;
        label(g, x + 10, y + 18, t('label.instance', 'Instance {id}', { id: inst.id }), { fill: ink, weight: 'bold' });
        label(g, x + 10, y + 36, inst.addr, { mono: true, size: XS, fill: ink });
        if (state === 'down') {
          label(g, x + lay.boxW - 8, y + 18, t('label.notUp', 'Not up'), { size: XS, fill: colors.textMuted, anchor: 'end' });
        } else if (state === 'stopped') {
          label(g, x + lay.boxW - 8, y + 18, t('label.stopped', 'Stopped'), { size: XS, fill: colors.danger, anchor: 'end', weight: 'bold' });
        }
        boxes.set(inst.id, g);
      });

      // ── 받은 명단
      const cols = scene.lookupTicks.length;
      const colW = (W - PAD * 2 - (cols - 1) * 12) / cols;
      label(svg, PAD, lay.answerTop - 10, t('label.answers', 'Lists received'), { size: XS, fill: colors.textMuted });
      const chips: SVGGElement[] = [];
      scene.lookupTicks.forEach((tick, j) => {
        const x = PAD + j * (colW + 12);
        const answer = scene.answers[j];
        if (answer !== undefined && answer.now !== tick) {
          throw new Error(`register-and-find-stage: 명단 ${j} 의 틱이 ${tick} 가 아니다`);
        }
        const received = answer !== undefined;
        el(
          'rect',
          {
            x,
            y: lay.answerTop,
            width: colW,
            height: 20 + CHIPS_AREA + 4,
            rx: 6,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': received ? 'none' : '4 3',
          },
          svg,
        );
        label(svg, x + 8, lay.answerTop + 14, t('label.lookupAt', 'Lookup · tick {n}', { n: tick }), {
          size: XS,
          fill: received ? colors.text : colors.textMuted,
          weight: received ? 'bold' : 'normal',
        });
        if (!answer) return;
        label(svg, x + colW - 8, lay.answerTop + 14, t('label.count', 'Addresses: {n}', { n: answer.entries.length }), {
          size: XS,
          anchor: 'end',
          fill: colors.text,
        });
        const latest = j === scene.answers.length - 1 && scene.step !== null && scene.step.happenings.some((h) => h.kind === 'lookup');
        answer.entries.forEach((entry, i) => {
          const g = el('g', {}, svg);
          const cy = lay.answerTop + 20 + i * lay.chipH;
          el(
            'rect',
            {
              x: x + 6,
              y: cy + 1,
              width: colW - 12,
              height: lay.chipH - 3,
              rx: 4,
              fill: latest ? colors.accent : colors.bg,
              stroke: entry.stopped ? colors.danger : colors.primary,
              'stroke-width': entry.stopped ? 1.5 : 1,
              'stroke-dasharray': entry.stopped ? '3 2' : 'none',
            },
            g,
          );
          const ink = latest ? colors.stateInk : colors.text;
          const ty = cy + lay.chipH / 2 + XS / 3;
          label(g, x + 12, ty, entry.id, { mono: true, size: XS, weight: 'bold', fill: ink });
          label(g, x + 12 + (entry.id.length + 1) * XS * MONO_EM, ty, entry.addr, { mono: true, size: XS, fill: ink });
          if (entry.stopped) {
            label(g, x + colW - 12, ty, t('label.stopped', 'Stopped'), { size: XS, anchor: 'end', fill: colors.danger, weight: 'bold' });
          }
          if (latest) chips.push(g);
        });
      });

      // ── 캡션 — 이 틱에 일어난 것, 한 줄에 하나
      const lines: string[] = [];
      if (!step) {
        const up = scene.states.filter((s) => s === 'up').length;
        lines.push(t('caption.start', 'Registry rows: {rows} · Instances up: {up}', { rows: scene.rows.length, up }));
      } else {
        for (const h of step.happenings) {
          switch (h.kind) {
            case 'stop':
              lines.push(t('caption.stop', 'Stopped: {id} · Last heard: tick {last}', { id: h.id, last: h.last }));
              break;
            case 'register': {
              const inst = scene.instances.find((x) => x.id === h.id);
              if (!inst) throw new Error(`register-and-find-stage: 바탕에 없는 인스턴스 ${h.id}`);
              lines.push(t('caption.register', 'Registered: {id} {addr} · Lease end: tick {end}', { id: h.id, addr: inst.addr, end: h.end }));
              break;
            }
            case 'heartbeat':
              lines.push(t('caption.heartbeat', 'Heartbeat: {id} · Lease end: tick {end}', { id: h.id, end: h.end }));
              break;
            case 'expire':
              lines.push(t('caption.expire', 'Expired: {id} · Quiet ticks: {quiet}', { id: h.id, quiet: h.quiet }));
              break;
            case 'lookup':
              lines.push(t('caption.lookup', 'Lookup {service} · Addresses: {n}', { service: h.service, n: h.entries.length }));
              break;
          }
        }
      }
      lines.forEach((line, i) => {
        label(svg, PAD, lay.captionTop + i * CAPTION_LINE, line, { fill: colors.text });
      });

      const motion = el('g', {}, svg);
      return { cursor, boxes, rows, leases, chips, serviceAt, motion };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    function handle<T>(map: Map<string, T>, id: string, what: string): T {
      const h = map.get(id);
      if (h === undefined) throw new Error(`register-and-find-stage: ${what} ${id} 의 손잡이가 없다`);
      return h;
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    }

    /** 0..1 의 구간 [a, b] 안에서의 진행 */
    function span(p: number, a: number, b: number): number {
      return ease(Math.min(1, Math.max(0, (p - a) / (b - a))));
    }

    function move(node: Element, dx: number, dy: number): void {
      node.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
    }

    async function animateStep(next: RegisterAndFindScene, mine: number): Promise<void> {
      const step = next.step;
      if (!step) return;
      if (next.axisEnd === null) throw new Error('register-and-find-stage: 임대 축이 없는데 틱이 흘렀다');
      const axisEnd = next.axisEnd;
      const lay = layoutFor(next);
      const hs = drawStatic(next);
      const frames: ((p: number) => void)[] = [];

      if (hs.cursor && step.now > 0) {
        const cursor = hs.cursor;
        const dx = axisX(lay, axisEnd, step.now - 1) - axisX(lay, axisEnd, step.now);
        frames.push((p) => move(cursor, dx * (1 - span(p, 0, 0.5)), 0));
      }

      const shiftFrom = new Map<string, number>();
      for (const gone of step.gone) {
        // 만료된 줄 — 등록부 밖으로 밀려난다
        const ghost = el('g', {}, hs.motion);
        drawRow(ghost, lay, next, gone.row, gone.slot, false, null);
        frames.push((p) => {
          const q = span(p, 0.2, 1);
          move(ghost, q * 60, 0);
          ghost.setAttribute('opacity', String(round(1 - q)));
        });
        next.rows.forEach((row, slot) => {
          if (slot < gone.slot) return;
          const before = shiftFrom.get(row.id);
          shiftFrom.set(row.id, (before === undefined ? 0 : before) + lay.rowH);
        });
      }
      for (const [id, dy] of shiftFrom) {
        const g = handle(hs.rows, id, '줄');
        frames.push((p) => move(g, 0, dy * (1 - span(p, 0.4, 1))));
      }

      for (const h of step.happenings) {
        if (h.kind === 'register' || h.kind === 'heartbeat' || h.kind === 'stop') {
          const k = next.instances.findIndex((x) => x.id === h.id);
          if (k < 0) throw new Error(`register-and-find-stage: 바탕에 없는 인스턴스 ${h.id}`);
          const box = handle(hs.boxes, h.id, '인스턴스');
          const fromX = boxX(lay, k) + lay.boxW / 2;
          const fromY = lay.bandTop;
          if (h.kind === 'stop') {
            frames.push((p) => move(box, 0, -SINK * (1 - span(p, 0, 0.6))));
            continue;
          }
          const slot = next.rows.findIndex((r) => r.id === h.id);
          if (slot < 0) throw new Error(`register-and-find-stage: 등록부에 ${h.id} 줄이 없다`);
          const toY = rowY(lay, slot) + lay.rowH / 2;
          if (h.kind === 'register') {
            // 주소 표가 인스턴스에서 새 줄로 올라간다
            const row = handle(hs.rows, h.id, '줄');
            const inst = next.instances[k]!;
            const chip = el('g', {}, hs.motion);
            const chipW = (inst.addr.length + 2) * XS * MONO_EM + 12;
            el('rect', { x: -chipW / 2, y: -9, width: chipW, height: 18, rx: 4, fill: colors.accent, stroke: colors.primary }, chip);
            label(chip, 0, XS / 3, inst.addr, { mono: true, size: XS, anchor: 'middle', fill: colors.stateInk });
            const toX = PAD + 12 + (inst.id.length + 1) * XS * MONO_EM + chipW / 2;
            frames.push((p) => {
              const q = span(p, 0, 0.8);
              move(chip, fromX + (toX - fromX) * q, fromY + (toY - fromY) * q);
              chip.setAttribute('opacity', p >= 0.8 ? '0' : '1');
              row.setAttribute('opacity', String(round(span(p, 0.6, 1))));
              move(box, 0, SINK * (1 - span(p, 0, 0.5)));
            });
          } else {
            // 하트비트 — 점 하나가 올라가 임대 막대를 오른쪽으로 민다
            const lease = handle(hs.leases, h.id, '임대');
            const toX = axisX(lay, axisEnd, h.last);
            const back = axisX(lay, axisEnd, h.from) - toX;
            const dot = el('circle', { cx: 0, cy: 0, r: 5, fill: colors.itemActive }, hs.motion);
            frames.push((p) => {
              const q = span(p, 0, 0.6);
              dot.setAttribute('cx', String(round(fromX + (toX - fromX) * q)));
              dot.setAttribute('cy', String(round(fromY + (toY - fromY) * q)));
              dot.setAttribute('opacity', p >= 0.6 ? '0' : '1');
              move(lease, back * (1 - span(p, 0.55, 1)), 0);
            });
          }
        } else if (h.kind === 'lookup') {
          // 물음이 올라가고, 그 순간의 줄이 명단으로 내려온다
          const query = el('g', {}, hs.motion);
          const qw = (h.service.length + 2) * SM * MONO_EM;
          el('rect', { x: -qw / 2, y: -10, width: qw, height: 20, rx: 10, fill: colors.bg, stroke: colors.text }, query);
          label(query, 0, SM / 3, h.service, { mono: true, anchor: 'middle' });
          const qx0 = PAD + CALLER_W / 2;
          const qy0 = lay.bandTop;
          frames.push((p) => {
            const q = span(p, 0, 0.4);
            move(query, qx0 + (hs.serviceAt.x - qx0) * q, qy0 + (hs.serviceAt.y - 4 - qy0) * q);
            query.setAttribute('opacity', p >= 0.4 ? '0' : '1');
          });
          const j = next.answers.length - 1;
          const cols = next.lookupTicks.length;
          const colW = (W - PAD * 2 - (cols - 1) * 12) / cols;
          const chipX = PAD + j * (colW + 12) + 6;
          h.entries.forEach((entry, i) => {
            const chip = hs.chips[i];
            if (!chip) throw new Error(`register-and-find-stage: 명단의 ${entry.id} 표가 없다`);
            const dx = PAD + 6 - chipX;
            const dy = rowY(lay, i) - (lay.answerTop + 20 + i * lay.chipH);
            frames.push((p) => {
              const q = span(p, 0.4, 1);
              move(chip, dx * (1 - q), dy * (1 - q));
              chip.setAttribute('opacity', p < 0.4 ? '0' : '1');
            });
          });
        }
      }

      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        for (const f of frames) f(p);
        if (p >= 1) break;
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render(next: RegisterAndFindScene, prev: RegisterAndFindScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        if (!opts.animate || prev === null || next.step === null) {
          drawStatic(next);
          return Promise.resolve();
        }
        return animateStep(next, mine);
      },
      destroy(): void {
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
