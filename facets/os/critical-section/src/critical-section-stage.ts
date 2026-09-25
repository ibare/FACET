/**
 * 임계 구역 stage — 프로그램 여섯 줄 위에 표가 붙고, 첫 표부터 끝 표까지 울타리가 둘러쳐진다.
 * 스레드 둘은 프로그램 양옆 길을 따라 줄을 밟아 내려간다. 울타리 안에는 한 번에 하나만 선다 —
 * 막힌 스레드는 울타리 윗변에 부딪혀 입구 바깥에서 잠들고, 앞 스레드가 아랫변으로 나가면 입구 안으로 든다.
 *
 * 세로 자리는 구간 경계(scene.bounds)를 보고 입구 · 출구 자리를 줄 사이에 비워 둔다.
 */
import {
  categorical,
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
import type { CriticalSectionScene, Spot } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

const MARK_MS = 450;
const ENCLOSE_MS = 500;
const MOVE_MS = 320;
const FRAME_MS = 16;

/** 줄 사이 간격과 입구 · 출구 자리를 위해 더 비우는 간격 */
const ROW_GAP = 34;
const GATE_GAP = 46;
const ROW1_Y = 100;
const START_Y = ROW1_Y - 36;
const HEAD_Y = 26;
const CAPTION_Y = H - 22;

const TOKEN_R = 11;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
  text?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

function easeInOut(e: number): number {
  return e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
}

/** 줄 번호(1 부터)의 세로 자리 — 구간 앞뒤로 입구 · 출구 자리를 비운다 */
function rowY(scene: CriticalSectionScene, line: number): number {
  let y = ROW1_Y + (line - 1) * ROW_GAP;
  const b = scene.bounds;
  if (b !== null) {
    if (line >= b.from) y += GATE_GAP;
    if (line > b.to) y += GATE_GAP;
  }
  return y;
}

function fenceBox(scene: CriticalSectionScene): { x: number; y: number; w: number; h: number } | null {
  const b = scene.bounds;
  if (b === null) return null;
  const top = rowY(scene, b.from) - 40;
  const bottom = rowY(scene, b.to) + 34;
  const x = W * 0.025;
  return { x, y: top, w: W - 2 * x, h: bottom - top };
}

/** 스레드 길의 가로 자리 — 짝수 차례는 왼쪽, 홀수 차례는 오른쪽 */
function laneX(i: number): number {
  const k = Math.floor(i / 2);
  return i % 2 === 0 ? W * (0.06 + 0.05 * k) : W * (0.94 - 0.05 * k);
}

function spotY(scene: CriticalSectionScene, spot: Spot): number {
  const b = scene.bounds;
  switch (spot.at) {
    case 'start':
      return START_Y;
    case 'line':
      return rowY(scene, spot.line);
    case 'gate-out':
      return b === null ? START_Y : rowY(scene, b.from) - 60;
    case 'gate-in':
      return b === null ? START_Y : rowY(scene, b.from) - 20;
    case 'exit':
      return b === null ? START_Y : rowY(scene, b.to) + 56;
  }
}

function readTheme(v: unknown): 'dark' | 'light' | undefined {
  return v === 'dark' || v === 'light' ? v : undefined;
}

export const criticalSectionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(readTheme(params.theme));
    const codePx = parseFloat(fontSizes.md);
    const charW = codePx * 0.6;
    const numRight = W * 0.2;
    const codeX = W * 0.23;
    const flagX = W * 0.66;
    const flagW = W * 0.12;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 운동 손잡이 — drawStatic 이 매번 새로 짓는다 */
    let tokenEls: SVGGElement[] = [];
    let flagEls = new Map<number, SVGGElement>();
    let fenceEl: SVGRectElement | null = null;
    let pillEls: Array<SVGGElement | null> = [];

    function threadColor(scene: CriticalSectionScene, i: number): string {
      const pal = categorical(Math.max(scene.threads.length, 2));
      return pal[i % pal.length] ?? colors.primary;
    }

    function caption(scene: CriticalSectionScene): string {
      const s = scene.step;
      if (s === null) {
        return t('caption.program', 'Threads running the same program: {list}', { list: scene.threads.join(' · ') });
      }
      if (s.kind === 'mark') {
        return t('caption.mark', 'Lines that touch the shared value {name}: {lines}', {
          name: scene.sharedName,
          lines: s.lines.join(', '),
        });
      }
      if (s.kind === 'enclose') {
        const inner: number[] = [];
        for (let l = s.from; l <= s.to; l += 1) if (!scene.marked.includes(l)) inner.push(l);
        if (inner.length === 0) {
          return t('caption.enclose.plain', 'Section: lines {from} to {to}.', { from: s.from, to: s.to });
        }
        return t('caption.enclose', 'Section: lines {from} to {to}. Fenced in without a mark: {inner}', {
          from: s.from,
          to: s.to,
          inner: inner.join(', '),
        });
      }
      if (s.kind === 'wait') {
        return t('caption.wait', 'Tick {n}: {who} waits at the entrance. Inside: {holder}', {
          n: s.tick,
          who: s.thread,
          holder: s.holder,
        });
      }
      if (s.enters) {
        return t('caption.enter', 'Tick {n}: {who} enters and runs line {line}.', { n: s.tick, who: s.thread, line: s.line });
      }
      if (s.exits && s.admitted !== null) {
        return t('caption.exitAdmit', 'Tick {n}: {who} runs line {line} and leaves ({name} = {value}). {next} is let in.', {
          n: s.tick,
          who: s.thread,
          line: s.line,
          name: scene.sharedName,
          value: scene.value,
          next: s.admitted,
        });
      }
      if (s.exits) {
        return t('caption.exit', 'Tick {n}: {who} runs line {line} and leaves ({name} = {value}).', {
          n: s.tick,
          who: s.thread,
          line: s.line,
          name: scene.sharedName,
          value: scene.value,
        });
      }
      if (s.shown !== null) {
        return t('caption.show', 'Tick {n}: {who} runs line {line}. Shown: {value}', {
          n: s.tick,
          who: s.thread,
          line: s.line,
          value: s.shown,
        });
      }
      if (scene.inside === s.thread) {
        return t('caption.runInside', 'Tick {n}: {who} runs line {line}, inside the section.', {
          n: s.tick,
          who: s.thread,
          line: s.line,
        });
      }
      return t('caption.runOutside', 'Tick {n}: {who} runs line {line}, outside the section.', {
        n: s.tick,
        who: s.thread,
        line: s.line,
      });
    }

    function drawStatic(scene: CriticalSectionScene): void {
      svg.textContent = '';
      tokenEls = [];
      flagEls = new Map();
      fenceEl = null;
      pillEls = [];

      const step = scene.step;

      // 머리 — 틱과 공유 값
      if (step !== null && (step.kind === 'run' || step.kind === 'wait')) {
        node('text', {
          x: W * 0.03,
          y: HEAD_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
          'dominant-baseline': 'middle',
        }, svg, t('label.tick', 'Tick {n}', { n: step.tick }));
      }
      if (scene.sharedName !== '') {
        node('text', {
          x: W * 0.8,
          y: HEAD_Y,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
          'dominant-baseline': 'middle',
        }, svg, t('label.sharedValue', 'Shared value'));
        node('rect', {
          x: W * 0.82,
          y: HEAD_Y - 13,
          width: W * 0.15,
          height: 26,
          rx: 5,
          fill: colors.bgSubtle,
          stroke: colors.border,
        }, svg);
        const v = node('text', {
          x: W * 0.835,
          y: HEAD_Y,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
          'dominant-baseline': 'middle',
        }, svg);
        node('tspan', { fill: colors.textMuted }, v, scene.sharedName);
        node('tspan', { dx: charW, 'font-weight': 600 }, v, String(scene.value));
      }

      // 울타리 — 구간이 섰을 때만
      const box = fenceBox(scene);
      if (box !== null && scene.section !== null) {
        const holder = scene.inside === null ? -1 : scene.threads.indexOf(scene.inside);
        const stroke = holder >= 0 ? threadColor(scene, holder) : colors.textMuted;
        fenceEl = node('rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 12,
          fill: holder >= 0 ? stroke : 'none',
          'fill-opacity': holder >= 0 ? 0.07 : 0,
          stroke,
          'stroke-width': 2,
        }, svg);
        node('text', {
          x: W / 2,
          y: box.y + 13,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: stroke,
          'dominant-baseline': 'middle',
        }, svg, t('label.section', 'Critical section'));
        node('text', {
          x: W / 2,
          y: box.y + box.h - 11,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: holder >= 0 ? stroke : colors.textMuted,
          'dominant-baseline': 'middle',
        }, svg, scene.inside === null
          ? t('label.empty', 'Inside: nobody')
          : t('label.inside', 'Inside: {who}', { who: scene.inside }));
      }

      // 이번 걸음에 실행한 줄 — 그 스레드 색 띠
      if (step !== null && step.kind === 'run') {
        const ti = scene.threads.indexOf(step.thread);
        node('rect', {
          x: W * 0.17,
          y: rowY(scene, step.line) - 13,
          width: W * 0.69,
          height: 26,
          rx: 4,
          fill: threadColor(scene, ti),
          'fill-opacity': 0.18,
        }, svg);
      }

      // 프로그램 줄
      scene.program.forEach((text, idx) => {
        const line = idx + 1;
        const y = rowY(scene, line);
        node('text', {
          x: numRight,
          y,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
          'dominant-baseline': 'middle',
        }, svg, String(line));
        node('text', {
          x: codeX,
          y,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
          'dominant-baseline': 'middle',
          'xml:space': 'preserve',
        }, svg, text);
      });

      // 표 — 공유 값 낱말 밑줄과 줄 끝 깃발
      for (const line of scene.marked) {
        const text = scene.program[line - 1];
        if (text === undefined) continue;
        const y = rowY(scene, line);
        const g = node('g', {}, svg);
        const re = /[A-Za-z_][A-Za-z0-9_]*/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          if (m[0] !== scene.sharedName) continue;
          node('line', {
            x1: codeX + m.index * charW,
            x2: codeX + (m.index + m[0].length) * charW,
            y1: y + 10,
            y2: y + 10,
            stroke: colors.accent,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }, g);
        }
        const flag = node('g', {}, g);
        node('rect', {
          x: flagX,
          y: y - 11,
          width: flagW,
          height: 22,
          rx: 11,
          fill: colors.bg,
          stroke: colors.accent,
          'stroke-width': 2,
        }, flag);
        node('text', {
          x: flagX + flagW / 2,
          y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: colors.text,
          'dominant-baseline': 'middle',
        }, flag, t('label.shared', 'shared'));
        flagEls.set(line, flag);
      }

      // 보인 값 — 그 스레드 곁의 알약
      scene.threads.forEach((_th, i) => {
        const shown = scene.shown[i];
        const spot = scene.spots[i];
        if (shown === null || shown === undefined || spot === undefined) {
          pillEls.push(null);
          return;
        }
        const x = laneX(i);
        const y = spotY(scene, spot);
        const pw = W * 0.075;
        const px = i % 2 === 0 ? x + TOKEN_R + 5 : x - TOKEN_R - 5 - pw;
        const g = node('g', {}, svg);
        node('rect', {
          x: px,
          y: y - 10,
          width: pw,
          height: 20,
          rx: 10,
          fill: colors.bg,
          stroke: threadColor(scene, i),
          'stroke-width': 1.5,
        }, g);
        node('text', {
          x: px + pw / 2,
          y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
          'dominant-baseline': 'middle',
        }, g, String(shown));
        pillEls.push(g);
      });

      // 스레드 — 길 위의 동그라미
      scene.threads.forEach((th, i) => {
        const spot = scene.spots[i] ?? { at: 'start' as const };
        const color = threadColor(scene, i);
        const asleep = scene.asleep[i] === true;
        const g = node('g', { transform: `translate(${round(laneX(i))},${round(spotY(scene, spot))})` }, svg);
        node('circle', {
          cx: 0,
          cy: 0,
          r: TOKEN_R,
          fill: asleep ? colors.bg : color,
          stroke: color,
          'stroke-width': 2,
          ...(asleep ? { 'stroke-dasharray': '3 3' } : {}),
        }, g);
        node('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: asleep ? color : colors.textInverse,
          'dominant-baseline': 'central',
        }, g, th);
        tokenEls.push(g);
      });

      // 캡션
      node('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
        'dominant-baseline': 'middle',
      }, svg, caption(scene));
    }

    /** 프레임을 센 운동 — 벽시계를 읽지 않는다. destroy · 새 render 가 오면 곧바로 풀린다 */
    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let k = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        frame(0);
        const next = (): void => {
          const h = setTimeout(() => {
            timers.delete(h);
            if (destroyed || mine !== gen) {
              finish();
              return;
            }
            k += 1;
            frame(easeInOut(k / total));
            if (k >= total) finish();
            else next();
          }, FRAME_MS);
          timers.add(h);
        };
        next();
      });
    }

    function place(el: SVGGElement | undefined, x: number, y: number): void {
      if (el === undefined) return;
      el.setAttribute('transform', `translate(${round(x)},${round(y)})`);
    }

    async function animate(next: CriticalSectionScene, mine: number): Promise<void> {
      const s = next.step;
      if (s === null) return;
      if (s.kind === 'mark') {
        const flags = s.lines.map((l) => flagEls.get(l)).filter((g): g is SVGGElement => g !== undefined);
        await tween(MARK_MS, mine, (e) => {
          for (const g of flags) {
            g.setAttribute('transform', `translate(${round((1 - e) * W * 0.1)},0)`);
            g.setAttribute('opacity', String(round(e)));
          }
        });
        return;
      }
      if (s.kind === 'enclose') {
        const end = fenceBox(next);
        const fence = fenceEl;
        if (end === null || fence === null) return;
        // 첫 표 깃발에서 출발해 끝 표까지 내려가며 폭을 편다
        const y0 = rowY(next, s.from) - 13;
        const start = { x: flagX - 4, y: y0, w: flagW + 8, h: 26 };
        await tween(ENCLOSE_MS, mine, (e) => {
          const hE = Math.min(1, e * 1.6);
          const wE = Math.max(0, e * 1.6 - 0.6);
          const yEnd = end.y + end.h;
          const yStartEnd = start.y + start.h;
          const top = start.y + (end.y - start.y) * wE;
          const bottom = yStartEnd + (yEnd - yStartEnd) * hE;
          const x = start.x + (end.x - start.x) * wE;
          const w = start.w + (end.w - start.w) * wE;
          fence.setAttribute('x', String(round(x)));
          fence.setAttribute('y', String(round(top)));
          fence.setAttribute('width', String(round(w)));
          fence.setAttribute('height', String(round(bottom - top)));
        });
        return;
      }
      const ti = next.threads.indexOf(s.thread);
      const tok = tokenEls[ti];
      const x = laneX(ti);
      const toSpot = next.spots[ti];
      if (toSpot === undefined) return;
      const y0 = spotY(next, s.from);
      const y1 = spotY(next, toSpot);
      if (s.kind === 'wait') {
        // 울타리 윗변에 닿았다가 입구 바깥으로 물러난다
        const box = fenceBox(next);
        const hit = box === null ? y1 : box.y - TOKEN_R - 1;
        await tween(MOVE_MS, mine, (e) => {
          const y = e < 0.55 ? y0 + (hit - y0) * (e / 0.55) : hit + (y1 - hit) * ((e - 0.55) / 0.45);
          place(tok, x, y);
        });
        return;
      }
      const ai = s.admitted === null ? -1 : next.threads.indexOf(s.admitted);
      const aTok = ai >= 0 ? tokenEls[ai] : undefined;
      const aSpot = ai >= 0 ? next.spots[ai] : undefined;
      const ax = ai >= 0 ? laneX(ai) : 0;
      const ay0 = s.admittedFrom === null ? 0 : spotY(next, s.admittedFrom);
      const ay1 = aSpot === undefined ? 0 : spotY(next, aSpot);
      const pill = pillEls[ti] ?? null;
      const pillDir = ti % 2 === 0 ? -1 : 1;
      await tween(MOVE_MS, mine, (e) => {
        place(tok, x, y0 + (y1 - y0) * e);
        if (aTok !== undefined && ai >= 0) place(aTok, ax, ay0 + (ay1 - ay0) * e);
        if (pill !== null && s.shown !== null) {
          pill.setAttribute('transform', `translate(${round(pillDir * (1 - e) * W * 0.06)},${round((y0 - y1) * (1 - e))})`);
          pill.setAttribute('opacity', String(round(e)));
        }
      });
    }

    return {
      async render(next: CriticalSectionScene, _prev: CriticalSectionScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await animate(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
