/**
 * 페이지 폴트 stage.
 *
 * 동사는 "멈췄다 다시 돈다". 접근 하나가 왼쪽 프로그램 칸에서 떠나 표의 그 줄을 지나 프레임으로
 * 간다. 표가 "없음" 이면 줄 앞에서 막혀 서고(프로그램 칸이 멈춤으로 바뀐다), 페이지가 아래 디스크에서
 * 빈 프레임으로 올라오고, 프레임 번호가 표의 줄로 건너가 고쳐진 뒤, 막혔던 같은 접근이 프로그램 칸까지
 * 되돌아가 처음부터 다시 달려 이번엔 프레임에 닿는다.
 *
 * 자리는 모두 캔버스 폭에서 셈한다. 장면이 정본이고 render 는 늘 화면 전체를 다시 세운다.
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
} from '@ffacet/core/runtime';
import type { PageFaultScene, PageFaultStep } from './scene';

const H = 368;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const TOKEN_W = 28;
const TOKEN_H = 24;
const CHIP_W = 72;
const CHIP_H = 24;

/** 운동 길이 (ms) */
const MS_ACCESS = 500;
const MS_FAULT = 450;
const MS_LOAD = 550;
const MS_MAP = 350;
const MS_RETRY = 750;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

// ── 자리 ────────────────────────────────────────────────────────────
const STRIP_Y = 18;
const STRIP_CHIP = 28;
const STRIP_GAP = 8;
const STRIP_X = PAD + Math.round(W * 0.14);

const BODY_TOP = 104;
const BODY_BOTTOM = 236;

const CPU_X = PAD;
const CPU_W = Math.round(W * 0.16);
const CPU_H = 76;
const CPU_Y = Math.round((BODY_TOP + BODY_BOTTOM) / 2 - CPU_H / 2);
const HOME: Pt = { x: CPU_X + CPU_W / 2, y: CPU_Y + CPU_H / 2 };

const TABLE_X = Math.round(W * 0.3);
const TABLE_W = Math.round(W * 0.24);
const TABLE_PAGE_W = Math.round(TABLE_W * 0.42);

const MEM_X = Math.round(W * 0.63);
const MEM_W = W - PAD - MEM_X;

const DISK_Y = 266;
const DISK_H = 62;
const CAPTION_Y = H - 12;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** 꺾은선 위 비율 k 의 자리 (길이에 비례) */
function along(pts: Pt[], k: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(d);
    total += d;
  }
  const last = pts[pts.length - 1]!;
  if (total === 0) return last;
  let rest = k * total;
  for (let i = 1; i < pts.length; i += 1) {
    const d = lens[i - 1]!;
    if (rest <= d) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const f = d === 0 ? 1 : rest / d;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    rest -= d;
  }
  return last;
}

type Layout = {
  rowY: (page: number) => number;
  rowH: number;
  slotY: (frame: number) => number;
  slotH: number;
  diskX: (page: number) => number;
};

function layoutOf(scene: PageFaultScene): Layout {
  const rows = Math.max(1, scene.table.length);
  const rowH = Math.min(32, (BODY_BOTTOM - BODY_TOP) / rows);
  const slots = Math.max(1, scene.slots.length);
  const pitch = Math.min(44, (BODY_BOTTOM - BODY_TOP + 10) / slots);
  const slotH = pitch - 10;
  const diskN = Math.max(1, scene.diskPages.length);
  // 디스크 칩은 메모리 칸 아래에서 조금 왼쪽까지 펴 둔다 — 올라오는 길이 위로 향하게
  const diskLeft = MEM_X - Math.round(W * 0.08);
  const diskPitch = (W - PAD - diskLeft) / diskN;
  return {
    rowH,
    rowY(page) {
      const i = scene.table.findIndex((r) => r.page === page);
      if (i < 0) throw new Error(`page-fault stage: 페이지 ${page} 가 표에 없다`);
      return BODY_TOP + rowH * (i + 0.5);
    },
    slotH,
    slotY(frame) {
      const i = scene.slots.findIndex((s) => s.frame === frame);
      if (i < 0) throw new Error(`page-fault stage: 프레임 ${frame} 이 그림에 없다`);
      return BODY_TOP + pitch * i + slotH / 2;
    },
    diskX(page) {
      const i = scene.diskPages.indexOf(page);
      if (i < 0) throw new Error(`page-fault stage: 페이지 ${page} 가 디스크에 없다`);
      return diskLeft + diskPitch * (i + 0.5);
    },
  };
}

/** 접근이 달리는 꺾은선 — 프로그램 칸 · 표 줄 앞 · 표 줄 뒤 · 프레임 앞 */
function route(lay: Layout, page: number, frame: number): Pt[] {
  const ry = lay.rowY(page);
  return [
    HOME,
    { x: TABLE_X - TOKEN_W / 2 - 4, y: ry },
    { x: TABLE_X + TABLE_W + TOKEN_W / 2 + 4, y: ry },
    { x: MEM_X - TOKEN_W / 2 - 4, y: lay.slotY(frame) },
  ];
}

function haltPt(lay: Layout, page: number): Pt {
  return { x: TABLE_X - TOKEN_W / 2 - 4, y: lay.rowY(page) };
}

function slotChipCenter(lay: Layout, frame: number): Pt {
  return { x: W - PAD - 6 - CHIP_W / 2, y: lay.slotY(frame) };
}

function diskChipCenter(lay: Layout, page: number): Pt {
  return { x: lay.diskX(page), y: DISK_Y + DISK_H / 2 + 6 };
}

function frameCellCenter(lay: Layout, page: number): Pt {
  return { x: TABLE_X + TABLE_PAGE_W + (TABLE_W - TABLE_PAGE_W) / 2, y: lay.rowY(page) };
}

function halted(step: PageFaultStep): step is Extract<PageFaultStep, { kind: 'fault' | 'load' | 'map' }> {
  return step.kind === 'fault' || step.kind === 'load' || step.kind === 'map';
}

type Handles = {
  token: SVGGElement | null;
  stopBar: SVGLineElement | null;
  status: SVGTextElement | null;
  moved: SVGGElement | null;
  mapText: SVGTextElement | null;
};

export const pageFaultStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      parent: Element,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(e);
      return e;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const e = node('text', parent, {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'central',
      });
      if (opts.weight) e.setAttribute('font-weight', opts.weight);
      e.textContent = str;
      return e;
    }

    function pageChip(parent: Element, center: Pt, page: number, stroke: string, fill: string): SVGGElement {
      const g = node('g', parent, {});
      node('rect', g, {
        x: center.x - CHIP_W / 2,
        y: center.y - CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 5,
        fill,
        stroke,
        'stroke-width': 1.5,
      });
      write(g, center.x, center.y, t('label.pageN', 'Page {n}', { n: page }), { anchor: 'middle' });
      return g;
    }

    function drawStatic(scene: PageFaultScene): Handles {
      svg.textContent = '';
      const h: Handles = { token: null, stopBar: null, status: null, moved: null, mapText: null };
      if (scene.table.length === 0) return h;
      const lay = layoutOf(scene);
      const step = scene.step;
      const current = step.kind === 'start' ? -1 : step.index;

      // 접근 차례 띠
      write(svg, PAD, STRIP_Y + STRIP_CHIP / 2, t('label.accesses', 'Accesses'), { fill: c.textMuted });
      scene.accesses.forEach((page, i) => {
        const x = STRIP_X + i * (STRIP_CHIP + STRIP_GAP);
        const past = i < scene.done;
        node('rect', svg, {
          x,
          y: STRIP_Y,
          width: STRIP_CHIP,
          height: STRIP_CHIP,
          rx: 5,
          fill: past ? c.bgSubtle : c.bg,
          stroke: i === current ? c.accent : c.border,
          'stroke-width': i === current ? 2.5 : 1,
        });
        write(svg, x + STRIP_CHIP / 2, STRIP_Y + STRIP_CHIP / 2, String(page), {
          anchor: 'middle',
          mono: true,
          fill: past ? c.textMuted : c.text,
        });
        if (scene.faulted.includes(i)) {
          node('line', svg, {
            x1: x + 4,
            x2: x + STRIP_CHIP - 4,
            y1: STRIP_Y + STRIP_CHIP + 5,
            y2: STRIP_Y + STRIP_CHIP + 5,
            stroke: c.danger,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          });
        }
      });
      write(svg, W - PAD, STRIP_Y + 6, t('stat.done', 'Accesses done: {n} / {total}', {
        n: scene.done,
        total: scene.accesses.length,
      }), { anchor: 'end', fill: c.textMuted });
      write(svg, W - PAD, STRIP_Y + 26, t('stat.faults', 'Page faults: {n}', { n: scene.faulted.length }), {
        anchor: 'end',
        fill: scene.faulted.length > 0 ? c.danger : c.textMuted,
        weight: '600',
      });

      // 이번 걸음의 길 (표 아래에 깐다 — 줄을 지나가는 것처럼 보이게)
      const routeLayer = node('g', svg, {});
      if (step.kind === 'access' || step.kind === 'retry') {
        const pts = route(lay, step.page, step.frame);
        node('polyline', routeLayer, {
          points: pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
          fill: 'none',
          stroke: c.success,
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
        });
      } else if (halted(step)) {
        const a = haltPt(lay, step.page);
        node('polyline', routeLayer, {
          points: `${round(HOME.x)},${round(HOME.y)} ${round(a.x)},${round(a.y)}`,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
        });
      }

      // 프로그램 칸
      const stopped = halted(step);
      node('rect', svg, {
        x: CPU_X,
        y: CPU_Y,
        width: CPU_W,
        height: CPU_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: stopped ? c.danger : c.border,
        'stroke-width': stopped ? 2 : 1,
      });
      write(svg, HOME.x, CPU_Y + 12, t('label.program', 'Program'), {
        anchor: 'middle',
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      h.status = write(
        svg,
        HOME.x,
        CPU_Y + CPU_H - 11,
        stopped ? t('status.stop', 'stopped') : t('status.run', 'running'),
        { anchor: 'middle', fill: stopped ? c.danger : c.textMuted, size: fontSizes.xs, weight: '600' },
      );

      // 페이지 표
      write(svg, TABLE_X, BODY_TOP - 34, t('label.table', 'Page table'), { fill: c.textMuted });
      write(svg, TABLE_X + TABLE_PAGE_W / 2, BODY_TOP - 12, t('label.page', 'Page'), {
        anchor: 'middle',
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      write(svg, TABLE_X + TABLE_PAGE_W + (TABLE_W - TABLE_PAGE_W) / 2, BODY_TOP - 12, t('label.frame', 'Frame'), {
        anchor: 'middle',
        fill: c.textMuted,
        size: fontSizes.xs,
      });
      for (const row of scene.table) {
        const cy = lay.rowY(row.page);
        const top = cy - lay.rowH / 2;
        const onRow = step.kind !== 'start' && step.page === row.page;
        node('rect', svg, {
          x: TABLE_X,
          y: top,
          width: TABLE_PAGE_W,
          height: lay.rowH,
          fill: c.bg,
          stroke: c.border,
        });
        node('rect', svg, {
          x: TABLE_X + TABLE_PAGE_W,
          y: top,
          width: TABLE_W - TABLE_PAGE_W,
          height: lay.rowH,
          fill: c.bg,
          stroke: c.border,
        });
        if (onRow) {
          node('rect', svg, {
            x: TABLE_X,
            y: top,
            width: TABLE_W,
            height: lay.rowH,
            fill: 'none',
            stroke: halted(step) ? c.danger : c.success,
            'stroke-width': 2.5,
          });
        }
        if (onRow && step.kind === 'map') {
          node('rect', svg, {
            x: TABLE_X + TABLE_PAGE_W + 3,
            y: top + 3,
            width: TABLE_W - TABLE_PAGE_W - 6,
            height: lay.rowH - 6,
            rx: 4,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2.5,
          });
        }
        write(svg, TABLE_X + TABLE_PAGE_W / 2, cy, String(row.page), { anchor: 'middle', mono: true });
        const cell = frameCellCenter(lay, row.page);
        const cellText =
          row.frame === null
            ? write(svg, cell.x, cell.y, t('label.none', 'none'), {
                anchor: 'middle',
                fill: onRow && step.kind === 'fault' ? c.danger : c.textMuted,
              })
            : write(svg, cell.x, cell.y, String(row.frame), {
                anchor: 'middle',
                mono: true,
                fill: c.text,
                weight: onRow && step.kind === 'map' ? '700' : '400',
              });
        if (onRow && step.kind === 'map') h.mapText = cellText;
      }

      // 메모리 — 프레임 칸
      write(svg, MEM_X, BODY_TOP - 34, t('label.memory', 'Memory'), { fill: c.textMuted });
      for (const slot of scene.slots) {
        const cy = lay.slotY(slot.frame);
        const target =
          (step.kind === 'access' || step.kind === 'retry' || step.kind === 'load') && step.frame === slot.frame;
        node('rect', svg, {
          x: MEM_X,
          y: cy - lay.slotH / 2,
          width: MEM_W,
          height: lay.slotH,
          rx: 6,
          fill: c.bgSubtle,
          stroke: target ? (step.kind === 'load' ? c.accent : c.success) : c.border,
          'stroke-width': target ? 2.5 : 1,
        });
        write(svg, MEM_X + 10, cy, t('label.frameN', 'Frame {n}', { n: slot.frame }), { fill: c.textMuted });
        const chip = slotChipCenter(lay, slot.frame);
        if (slot.page === null) {
          write(svg, chip.x, chip.y, t('label.free', 'free'), {
            anchor: 'middle',
            fill: c.textMuted,
            size: fontSizes.xs,
          });
        } else {
          const g = pageChip(svg, chip, slot.page, target && step.kind === 'load' ? c.accent : c.border, c.bg);
          if (step.kind === 'load' && step.frame === slot.frame) h.moved = g;
        }
      }

      // 디스크
      node('rect', svg, {
        x: PAD,
        y: DISK_Y,
        width: W - PAD * 2,
        height: DISK_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      write(svg, PAD + 12, DISK_Y + 14, t('label.disk', 'Disk'), { fill: c.textMuted });
      const inMemory = new Set(scene.slots.map((s) => s.page));
      for (const page of scene.diskPages) {
        const center = diskChipCenter(lay, page);
        const lifting = step.kind === 'load' && step.page === page;
        const g = pageChip(svg, center, page, lifting ? c.accent : c.border, c.bg);
        if (inMemory.has(page) && !lifting) g.setAttribute('opacity', '0.55');
      }

      // 접근 (표 위에 그린다)
      if (step.kind !== 'start') {
        const at =
          step.kind === 'access' || step.kind === 'retry'
            ? route(lay, step.page, step.frame)[3]!
            : haltPt(lay, step.page);
        const pass = !halted(step);
        const g = node('g', svg, {});
        node('rect', g, {
          x: at.x - TOKEN_W / 2,
          y: at.y - TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: 6,
          fill: c.bg,
          stroke: pass ? c.success : c.danger,
          'stroke-width': 2.5,
        });
        write(g, at.x, at.y, String(step.page), { anchor: 'middle', mono: true, weight: '700' });
        h.token = g;
        if (!pass) {
          const x = TABLE_X - 3;
          h.stopBar = node('line', svg, {
            x1: x,
            x2: x,
            y1: at.y - lay.rowH / 2 + 3,
            y2: at.y + lay.rowH / 2 - 3,
            stroke: c.danger,
            'stroke-width': 4,
            'stroke-linecap': 'round',
          });
        }
      }

      // 캡션 — 지금 일어나는 일
      write(svg, PAD, CAPTION_Y, captionOf(scene), { size: fontSizes.md });
      return h;
    }

    function captionOf(scene: PageFaultScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Accesses to run: {n}. Free frames: {free}.', {
            n: scene.accesses.length,
            free: scene.slots
              .filter((x) => x.page === null)
              .map((x) => String(x.frame))
              .join(', '),
          });
        case 'access':
          return t('caption.access', 'Page {page} is in frame {frame} — the access goes straight through.', {
            page: s.page,
            frame: s.frame,
          });
        case 'fault':
          return t('caption.fault', 'Page {page}: the table says none. Execution stops — page fault.', {
            page: s.page,
          });
        case 'load':
          return t('caption.load', 'Page {page} comes up from disk into free frame {frame}.', {
            page: s.page,
            frame: s.frame,
          });
        case 'map':
          return t('caption.map', 'The table row for page {page} is fixed: frame {frame}.', {
            page: s.page,
            frame: s.frame,
          });
        case 'retry':
          return t('caption.retry', 'The same access restarts and this time reaches frame {frame}.', {
            frame: s.frame,
          });
      }
    }

    function shift(e: Element, from: Pt, to: Pt, e01: number): void {
      const dx = round((from.x - to.x) * (1 - e01));
      const dy = round((from.y - to.y) * (1 - e01));
      e.setAttribute('transform', `translate(${dx} ${dy})`);
    }

    /** 한 시계 — 프레임 수로 나아간다. 세대가 바뀌거나 거두면 false 로 풀린다 */
    function tween(mine: number, ms: number, onFrame: (k: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let i = 0;
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          i += 1;
          onFrame(ease(Math.min(1, i / total)));
          if (i >= total) {
            finish(true);
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
    }

    async function animate(mine: number, scene: PageFaultScene, h: Handles): Promise<boolean> {
      const s = scene.step;
      const lay = layoutOf(scene);
      switch (s.kind) {
        case 'start':
          return true;
        case 'access': {
          const token = h.token;
          if (token === null) return true;
          const pts = route(lay, s.page, s.frame);
          const end = pts[3]!;
          shift(token, pts[0]!, end, 0);
          return tween(mine, MS_ACCESS, (k) => shift(token, along(pts, k), end, 0));
        }
        case 'fault': {
          const { token, stopBar, status } = h;
          if (token === null) return true;
          const end = haltPt(lay, s.page);
          const pts = [HOME, end];
          shift(token, HOME, end, 0);
          stopBar?.setAttribute('visibility', 'hidden');
          status?.setAttribute('visibility', 'hidden');
          return tween(mine, MS_FAULT, (k) => shift(token, along(pts, k), end, 0));
        }
        case 'load': {
          const moved = h.moved;
          if (moved === null) return true;
          const from = diskChipCenter(lay, s.page);
          const to = slotChipCenter(lay, s.frame);
          shift(moved, from, to, 0);
          return tween(mine, MS_LOAD, (k) => shift(moved, from, to, k));
        }
        case 'map': {
          const text = h.mapText;
          if (text === null) return true;
          const from = slotChipCenter(lay, s.frame);
          const to = frameCellCenter(lay, s.page);
          shift(text, from, to, 0);
          return tween(mine, MS_MAP, (k) => shift(text, from, to, k));
        }
        case 'retry': {
          const token = h.token;
          if (token === null) return true;
          const run = route(lay, s.page, s.frame);
          const end = run[3]!;
          // 막혔던 자리에서 프로그램 칸으로 되돌아간 뒤 처음부터 다시 달린다
          const pts = [haltPt(lay, s.page), ...run];
          shift(token, pts[0]!, end, 0);
          return tween(mine, MS_RETRY, (k) => shift(token, along(pts, k), end, 0));
        }
      }
    }

    return {
      async render(next: PageFaultScene, prev: PageFaultScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const ok = await animate(mine, next, h);
        if (!ok || destroyed || mine !== gen) return;
        drawStatic(next);
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
