/**
 * forced-sync-layout 무대 — 왼쪽은 코드 줄과 실행 자리, 오른쪽은 문서의 상자 넷.
 *
 * 상자는 두 너비를 겹쳐 보인다. 채운 막대는 마지막 레이아웃이 잰 너비(offsetWidth 가 돌려주는
 * 값), 점선 테두리는 스타일에 적혔지만 아직 재지 않은 너비. 쓰기는 점선만 늘리고, 레이아웃은
 * 문서를 위에서 아래로 훑으며 막대를 점선까지 따라잡게 한다. 레이아웃이 더러운 채 읽기에
 * 닿으면 실행 자리가 그 줄에서 멈춰 선다. 아래 줄에 돈 레이아웃이 하나씩 쌓인다.
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
import type { ForcedSyncLayoutScene } from './scene.js';

const H = 290;
const NS = 'http://www.w3.org/2000/svg';
/** 걸음 운동의 길이 — 사양이 400 안쪽으로 묶었다 */
const MOTION_MS = 400;
/** 실행 자리가 줄을 옮기는 몫 (나머지는 값 · 훑기) */
const CURSOR_SHARE = 0.3;

const PAD = 16;
const CODE_TOP = 44;
const LINE_H = 26;
const ROW_TOP = 44;
const ROW_H = 34;
const BAR_H = 22;
const CHIP_H = 24;

type Anim = { p: number };

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  const x = clamp01(v);
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
}

function lerp(a: number, b: number, q: number): number {
  return a + (b - a) * q;
}

export const forcedSyncLayoutStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);
    // 고정폭 글꼴의 글자 폭 — 토큰 크기에서 셈한다
    const charW = smPx * 0.6;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size: number; fill: string; mono?: boolean; weight?: string; anchor?: string },
    ): void {
      const e = node(
        'text',
        {
          x,
          y,
          fill: o.fill,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          'dominant-baseline': 'central',
          'text-anchor': o.anchor ?? 'start',
          'xml:space': 'preserve',
          style: 'white-space: pre',
        },
        parent,
      );
      if (o.weight) e.setAttribute('font-weight', o.weight);
      e.textContent = s;
    }

    /** 캡션을 폭에 맞춰 두 줄 안쪽으로 가른다 — 낱말 사이에서만 끊는다 */
    function wrap(s: string, maxW: number, px: number): string[] {
      const per = Math.max(8, Math.floor(maxW / (px * 0.56)));
      const words = s.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > per && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    }

    function caption(s: ForcedSyncLayoutScene): string {
      const step = s.step;
      if (step.kind === 'start') return t('caption.start', 'The script is about to run. Layout is clean.');
      if (step.kind === 'read') {
        const box = s.boxes[step.box]?.id ?? '';
        return t('caption.read', 'Read {box}.offsetWidth: {value}. Layout is clean, so nothing is measured.', {
          box,
          value: step.value,
        });
      }
      if (step.kind === 'write') {
        const box = s.boxes[step.box]?.id ?? '';
        return t('caption.write', 'Write {box}.style.width: {width}px. Layout is now dirty. The script keeps going.', {
          box,
          width: step.width,
        });
      }
      if (step.reason === 'forced') {
        const box = step.box === null ? '' : s.boxes[step.box]?.id ?? '';
        return t(
          'caption.forced',
          'Layout is dirty, so reading {box}.offsetWidth stops the script. The whole page is measured again. Layouts: {n}',
          { box, n: s.layouts.length },
        );
      }
      const forced = s.layouts.filter((r) => r === 'forced').length;
      return t(
        'caption.frame',
        'The script is done. Layout is dirty, so it runs once before the frame. Layouts: {n} (forced: {forced}, frame: {frame})',
        { n: s.layouts.length, forced, frame: s.layouts.length - forced },
      );
    }

    function draw(s: ForcedSyncLayoutScene, anim: Anim | null): void {
      svg.textContent = '';
      const p = anim ? anim.p : 1;
      const moving = anim !== null && p < 1;
      const step = s.step;
      const qCursor = ease(p / CURSOR_SHARE);
      const qMain = ease((p - CURSOR_SHARE) / (1 - CURSOR_SHARE));

      // ── 코드 ─────────────────────────────────────────────
      const codeX = PAD + 24;
      const longest = Math.max(...s.code.map((l) => l.length));
      const codeEnd = codeX + longest * charW;
      const readLine = s.readLine;
      // 곁말 칸은 가장 긴 줄 오른쪽에 둔다 — 줄을 알기 전후로 자리가 흔들리지 않게
      const annX = codeEnd + 12;
      const annW = 7 * charW + 8;
      const boxX = annX + annW + 24;
      const lineY = (i: number): number => CODE_TOP + i * LINE_H + LINE_H / 2;

      const panel = node('g', {}, svg);
      node(
        'rect',
        {
          x: PAD,
          y: CODE_TOP - 8,
          width: boxX - 16 - PAD,
          height: s.code.length * LINE_H + 16,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        panel,
      );

      // 실행 자리 — 이번 걸음이 줄을 옮겼으면 아직 못 온 만큼 위에 둔다
      if (s.cursor !== null) {
        const toY = lineY(s.cursor);
        const fromLine = step.kind === 'start' ? null : step.fromLine;
        const cy = moving && fromLine !== null ? lerp(lineY(fromLine), toY, qCursor) : toY;
        const ended = s.cursor >= s.code.length;
        const stopped = s.stopped;
        if (!ended) {
          node(
            'rect',
            {
              x: codeX - 6,
              y: cy - LINE_H / 2 + 2,
              width: boxX - 16 - codeX,
              height: LINE_H - 4,
              rx: 4,
              fill: stopped ? c.bg : c.border,
              stroke: stopped ? c.danger : 'none',
              'stroke-width': 1.5,
            },
            panel,
          );
        }
        const gx = PAD + 8;
        if (stopped && !moving) {
          node('rect', { x: gx - 1, y: cy - 6, width: 12, height: 12, rx: 2, fill: c.danger }, panel);
        } else {
          node(
            'path',
            {
              d: `M ${r2(gx)} ${r2(cy - 7)} L ${r2(gx + 11)} ${r2(cy)} L ${r2(gx)} ${r2(cy + 7)} Z`,
              fill: ended ? c.textMuted : c.primary,
            },
            panel,
          );
        }
        if (ended) {
          label(panel, codeX, toY, t('label.end', 'script done'), { size: xsPx, fill: c.textMuted });
        }
      }

      s.code.forEach((line, i) => {
        label(panel, codeX, lineY(i), line, { size: smPx, fill: c.text, mono: true });
      });

      // 읽기 줄 곁 — 받아 간 값, 또는 멈춰 선 표시
      const readY = readLine === null ? 0 : lineY(readLine);
      const readArrived = !(moving && step.kind === 'read');
      if (readLine === null) {
        // 코드를 아직 읽지 않았다 — 곁에 둘 것이 없다
      } else if (s.stopped && !moving) {
        label(panel, annX, readY, t('label.stopped', 'stopped'), { size: xsPx, fill: c.danger, weight: '600' });
      } else if (s.lastRead !== null && readArrived) {
        label(panel, annX, readY, `w = ${s.lastRead}`, { size: smPx, fill: c.text, mono: true, weight: '600' });
      }

      // ── 상자 ─────────────────────────────────────────────
      const idLen = Math.max(...s.boxes.map((b) => b.id.length));
      const barX = boxX + idLen * charW + 10;
      const pxLabelW = 5 * charW + 6;
      const maxStyled = Math.max(...s.boxes.map((b) => Math.max(b.styled, b.laid)));
      const scale = Math.min(1, (W - PAD - pxLabelW - barX) / maxStyled);
      const rowY = (i: number): number => ROW_TOP + i * ROW_H + BAR_H / 2;
      const rowsTop = ROW_TOP - 6;
      const rowsBottom = ROW_TOP + (s.boxes.length - 1) * ROW_H + BAR_H + 6;

      // 레이아웃 상태 — 쓰기 값이 닿기 전 · 훑기가 끝나기 전에는 앞 상태를 보인다
      let dirtyShown = s.dirty;
      if (moving && step.kind === 'write' && qMain < 1) dirtyShown = false;
      if (moving && step.kind === 'layout') dirtyShown = true;
      label(svg, boxX, 22, dirtyShown ? t('label.dirty', 'Layout: dirty') : t('label.clean', 'Layout: clean'), {
        size: smPx,
        fill: dirtyShown ? c.itemComparing : c.textMuted,
        weight: '600',
      });

      // 훑기의 자리 — 레이아웃 걸음에서만
      const scanning = moving && step.kind === 'layout' && p > CURSOR_SHARE;
      const scanY = lerp(rowsTop, rowsBottom, qMain);

      const rows = node('g', {}, svg);
      s.boxes.forEach((b, i) => {
        const y = rowY(i);
        const isCurrent = s.current === i;
        label(rows, boxX, y, b.id, {
          size: smPx,
          fill: isCurrent ? c.text : c.textMuted,
          mono: true,
          weight: isCurrent ? '700' : '400',
        });

        let laid = b.laid;
        if (moving && step.kind === 'layout') {
          const before = step.before[i] ?? b.laid;
          laid = scanning && scanY >= y ? b.laid : before;
        }
        let styled = b.styled;
        if (moving && step.kind === 'write' && step.box === i) styled = lerp(step.was, step.width, qMain);

        const laidW = laid * scale;
        const styledW = styled * scale;
        node('rect', { x: barX, y: y - BAR_H / 2, width: laidW, height: BAR_H, rx: 3, fill: c.primary }, rows);
        label(rows, barX + laidW - 6, y, String(Math.round(laid)), {
          size: xsPx,
          fill: c.textInverse,
          mono: true,
          anchor: 'end',
        });
        if (Math.abs(styledW - laidW) > 0.5) {
          node(
            'rect',
            {
              x: barX,
              y: y - BAR_H / 2 - 3,
              width: styledW,
              height: BAR_H + 6,
              rx: 4,
              fill: 'none',
              stroke: c.itemComparing,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            },
            rows,
          );
          label(rows, barX + styledW + 6, y, `${Math.round(styled)}px`, {
            size: xsPx,
            fill: c.itemComparing,
            mono: true,
            weight: '600',
          });
        }
      });

      if (scanning) {
        node('rect', { x: boxX - 6, y: rowsTop, width: W - PAD - boxX + 6, height: scanY - rowsTop, fill: c.accent, opacity: 0.18 }, svg);
        node('line', { x1: boxX - 6, y1: scanY, x2: W - PAD, y2: scanY, stroke: c.accent, 'stroke-width': 2.5 }, svg);
      }

      // 값이 오가는 조각 — 읽기는 상자에서 코드 곁으로, 쓰기는 코드 줄 끝에서 상자의 점선 끝으로
      const token = ((): { x0: number; y0: number; x1: number; y1: number; s: string } | null => {
        if (!moving || p <= CURSOR_SHARE || s.cursor === null) return null;
        if (step.kind === 'read') {
          const b = s.boxes[step.box];
          if (!b) return null;
          return { x0: barX + b.laid * scale, y0: rowY(step.box), x1: annX + 24, y1: readY, s: String(step.value) };
        }
        if (step.kind === 'write') {
          const line = s.code[s.cursor] ?? '';
          return {
            x0: codeX + line.length * charW,
            y0: lineY(s.cursor),
            x1: barX + step.width * scale,
            y1: rowY(step.box),
            s: `${step.width}px`,
          };
        }
        return null;
      })();
      if (token) {
        const tx = lerp(token.x0, token.x1, qMain);
        const ty = lerp(token.y0, token.y1, qMain);
        const tw = token.s.length * charW + 10;
        node('rect', { x: tx - tw / 2, y: ty - 10, width: tw, height: 20, rx: 10, fill: c.accent }, svg);
        label(svg, tx, ty, token.s, { size: smPx, fill: c.stateInk, mono: true, weight: '700', anchor: 'middle' });
      }

      // ── 돈 레이아웃 ──────────────────────────────────────
      const chipsY = 200;
      label(svg, PAD, chipsY + CHIP_H / 2, t('label.layouts', 'Layouts'), { size: smPx, fill: c.text, weight: '600' });
      const shown = moving && step.kind === 'layout' ? s.layouts.length - 1 : s.layouts.length;
      const chipX0 = PAD + 96;
      const slots = Math.max(s.boxes.length + 1, s.layouts.length);
      const chipW = Math.min(96, (W - PAD - chipX0) / slots - 8);
      for (let i = 0; i < shown; i += 1) {
        const reason = s.layouts[i];
        const x = chipX0 + i * (chipW + 8);
        const forced = reason === 'forced';
        node(
          'rect',
          {
            x,
            y: chipsY,
            width: chipW,
            height: CHIP_H,
            rx: 5,
            fill: c.bg,
            stroke: forced ? c.danger : c.textMuted,
            'stroke-width': 1.5,
          },
          svg,
        );
        label(svg, x + 8, chipsY + CHIP_H / 2, String(i + 1), { size: smPx, fill: c.text, weight: '700', mono: true });
        label(
          svg,
          x + 22,
          chipsY + CHIP_H / 2,
          forced ? t('chip.forced', 'forced') : t('chip.frame', 'frame'),
          { size: xsPx, fill: forced ? c.danger : c.textMuted },
        );
      }

      // ── 캡션 ─────────────────────────────────────────────
      const lines = wrap(caption(s), W - 2 * PAD, mdPx);
      lines.slice(0, 2).forEach((ln, i) => {
        label(svg, PAD, 248 + i * 20, ln, { size: mdPx, fill: c.text });
      });
    }

    function tick(ms: number): Promise<void> {
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

    async function flow(next: ForcedSyncLayoutScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        if (p >= 1) break;
        draw(next, { p });
        await tick(16);
      }
      if (mine !== gen || destroyed) return;
      draw(next, null);
    }

    return {
      render(next: ForcedSyncLayoutScene, prev: ForcedSyncLayoutScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          draw(next, null);
          return;
        }
        return flow(next, mine);
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
