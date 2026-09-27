/**
 * modular-clock 무대.
 *
 * 수직선을 법의 길이마다 한 바퀴씩 감은 나선 위를 수가 걸어간다. 각도가 자리(나머지),
 * 반지름이 바퀴(몫)다 — 수가 커진 만큼은 바깥으로 감긴 바퀴가 가져가고, 각도는
 * 0..(법 − 1) 의 바큇살을 벗어나지 않는다. 0 의 바큇살을 지날 때마다 바퀴 표가 하나 붙는다.
 *
 * 걸음마다 머리가 나선을 따라 앞으로 (더하는 수) 칸 돈다. 도는 동안 오른쪽 계기는 지나는
 * 수마다 자리와 바퀴를 센다.
 */
import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { ModularClockScene } from './scene';

const H = 380;
const PAD = 14;
const MOVE_MS = 700;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function mountStage(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
  void container;
  const svg = params.canvas;
  const t = params.t ?? makeTranslator(params.locale);
  const colors = getColors(params.theme);
  const lapInk = colors.itemComparing;

  const smPx = parseFloat(fontSizes.sm);
  const xsPx = parseFloat(fontSizes.xs);
  const mdPx = parseFloat(fontSizes.md);
  const bigPx = parseFloat(fontSizes.xl) * 1.8;

  // 왼쪽 시계 · 오른쪽 계기 — 폭에서 역산한다
  const clockSize = Math.min(H - PAD * 3, PIECE_CANVAS_W * 0.56);
  const cx = PAD + clockSize / 2;
  const cy = PAD + clockSize / 2;
  const labelR = clockSize / 2 - smPx;
  const coilMax = labelR - smPx * 1.4;
  const coilMin = coilMax * 0.2;
  const panelX = PAD * 2 + clockSize + PAD;
  const panelW = PIECE_CANVAS_W - PAD - panelX;

  let destroyed = false;
  let gen = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();

  function el<K extends keyof SVGElementTagNameMap>(
    parent: Element,
    tag: K,
    attrs: Record<string, string | number>,
  ): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
    parent.appendChild(node);
    return node;
  }

  function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): void {
    const node = el(parent, 'text', { x, y, 'font-family': fonts.body, 'dominant-baseline': 'central', ...attrs });
    node.textContent = text;
  }

  function draw(scene: ModularClockScene, head: number | null): void {
    svg.textContent = '';
    if (scene.laps === null) return;
    const last = scene.trail[scene.trail.length - 1];
    if (last === undefined) {
      throw new Error('modular-clock stage: init 뒤인데 자취가 비었다');
    }
    const m = scene.modulus;
    const gap = (coilMax - coilMin) / (scene.laps + 1);
    const headX = head ?? last.n;
    const arriving = head !== null && head < last.n;

    const at = (x: number): { x: number; y: number } => {
      const angle = -Math.PI / 2 + (2 * Math.PI * x) / m;
      const radius = coilMin + (gap * x) / m;
      return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    };
    const coilPath = (from: number, to: number): string => {
      const parts: string[] = [];
      const pieces = Math.max(1, Math.ceil((to - from) * 8));
      for (let i = 0; i <= pieces; i += 1) {
        const p = at(from + ((to - from) * i) / pieces);
        parts.push(`${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`);
      }
      return parts.join(' ');
    };

    // 머리가 선 수의 몫과 나머지 — 멈춘 화면은 자취의 끝, 운동 중은 지나온 passes 의 끝
    let headSplit: { n: number; q: number; r: number } = last;
    if (arriving) {
      const before = scene.trail[scene.trail.length - 2];
      if (scene.step.kind !== 'add' || before === undefined) {
        throw new Error('modular-clock stage: 도는 중인데 더한 걸음이 아니다');
      }
      headSplit = before;
      for (const pass of scene.step.passes) {
        if (pass.n <= headX) headSplit = pass;
      }
    }

    // 바큇살과 자리 이름 0..m−1
    const spokes = el(svg, 'g', {});
    for (let k = 0; k < m; k += 1) {
      const angle = -Math.PI / 2 + (2 * Math.PI * k) / m;
      const inner = coilMin * 0.55;
      const outer = coilMax + smPx * 0.3;
      const isZero = k === 0;
      el(spokes, 'line', {
        x1: cx + inner * Math.cos(angle),
        y1: cy + inner * Math.sin(angle),
        x2: cx + outer * Math.cos(angle),
        y2: cy + outer * Math.sin(angle),
        stroke: isZero ? lapInk : colors.border,
        'stroke-width': isZero ? 2 : 1,
      });
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);
      const here = k === headSplit.r;
      if (here) el(spokes, 'circle', { cx: lx, cy: ly, r: smPx * 0.95, fill: colors.accent });
      label(spokes, lx, ly, String(k), {
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-weight': here ? 700 : 400,
        fill: here ? colors.stateInk : colors.textMuted,
      });
    }

    // 이번 걸음이 돈 구간
    const coil = el(svg, 'g', {});
    if (scene.step.kind === 'add') {
      el(coil, 'path', {
        d: coilPath(scene.step.from, headX),
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 7,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
    }
    // 0 에서 지금 수까지 감긴 수직선
    el(coil, 'path', {
      d: coilPath(0, headX),
      fill: 'none',
      stroke: colors.primary,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    });
    for (let i = 0; i <= Math.floor(headX); i += 1) {
      const p = at(i);
      el(coil, 'circle', { cx: p.x, cy: p.y, r: 2.2, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1 });
    }

    // 0 의 바큇살을 지난 자리마다 바퀴 표
    const badges = el(svg, 'g', {});
    for (let q = 1; q <= headSplit.q; q += 1) {
      const p = at(q * m);
      el(badges, 'circle', { cx: p.x, cy: p.y, r: xsPx * 0.75, fill: lapInk });
      label(badges, p.x, p.y, String(q), {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: colors.stateInk,
      });
    }

    // 지나온 수 — 머리가 아직 닿지 않은 마지막 수는 빼고
    const marks = el(svg, 'g', {});
    const shown = arriving ? scene.trail.slice(0, -1) : scene.trail;
    for (const mark of shown) {
      const p = at(mark.n);
      const angle = -Math.PI / 2 + (2 * Math.PI * mark.n) / m;
      el(marks, 'circle', { cx: p.x, cy: p.y, r: 3.2, fill: colors.text });
      // 안쪽으로 반 칸 — 바깥쪽은 머리가 다음 바퀴로 지나가는 길이다
      const off = -gap * 0.5;
      label(marks, p.x + off * Math.cos(angle), p.y + off * Math.sin(angle), String(mark.n), {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        'font-weight': 600,
        fill: colors.text,
      });
    }

    // 머리
    const hp = at(headX);
    el(svg, 'circle', { cx: hp.x, cy: hp.y, r: 6.5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 });

    // 오른쪽 계기 — 머리가 지나는 수의 값
    const panel = el(svg, 'g', {});
    const nowN = headSplit.n;
    let y = PAD + smPx;
    label(panel, panelX, y, t('label.number', 'Number'), { 'font-size': fontSizes.sm, fill: colors.textMuted });
    y += bigPx * 0.85;
    label(panel, panelX, y, String(nowN), {
      'font-size': `${bigPx}px`,
      'font-weight': 700,
      'font-family': fonts.mono,
      fill: colors.text,
    });
    y += bigPx * 0.85;
    label(panel, panelX, y, t('expr.division', '{n} = {m} × {q} + {r}', { n: nowN, m, q: headSplit.q, r: headSplit.r }), {
      'font-size': fontSizes.md,
      'font-family': fonts.mono,
      fill: colors.text,
    });
    y += mdPx * 1.7;
    label(panel, panelX, y, t('expr.mod', '{n} mod {m} = {r}', { n: nowN, m, r: headSplit.r }), {
      'font-size': fontSizes.md,
      'font-family': fonts.mono,
      fill: colors.textMuted,
    });

    // 자리 · 바퀴 두 칸
    y += mdPx * 2.4;
    const chipW = (panelW - PAD) / 2;
    const chipH = smPx * 3.6;
    const chips: Array<{ name: string; value: number; fill: string }> = [
      { name: t('label.position', 'Position'), value: headSplit.r, fill: colors.accent },
      { name: t('label.laps', 'Laps'), value: headSplit.q, fill: lapInk },
    ];
    chips.forEach((chip, i) => {
      const x = panelX + i * (chipW + PAD);
      el(panel, 'rect', { x, y, width: chipW, height: chipH, rx: 6, fill: chip.fill });
      label(panel, x + PAD * 0.7, y + chipH / 2, chip.name, {
        'font-size': fontSizes.sm,
        fill: colors.stateInk,
      });
      label(panel, x + chipW - PAD * 0.7, y + chipH / 2, String(chip.value), {
        'text-anchor': 'end',
        'font-size': fontSizes.xl,
        'font-weight': 700,
        'font-family': fonts.mono,
        fill: colors.stateInk,
      });
    });

    // 지나온 수와 자리를 두 줄로 — 위 줄은 커지기만 하고 아래 줄은 0..m−1 안에 머문다
    y += chipH + PAD * 1.6;
    const rowLabelW = panelW * 0.3;
    const cellW = (panelW - rowLabelW) / (scene.times + 1);
    const rowH = smPx * 2;
    label(panel, panelX, y + rowH / 2, t('label.number', 'Number'), { 'font-size': fontSizes.xs, fill: colors.textMuted });
    label(panel, panelX, y + rowH * 1.5, t('label.position', 'Position'), {
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    el(panel, 'line', {
      x1: panelX,
      y1: y + rowH,
      x2: panelX + panelW,
      y2: y + rowH,
      stroke: colors.border,
      'stroke-width': 1,
    });
    shown.forEach((mark, i) => {
      const x = panelX + rowLabelW + cellW * (i + 0.5);
      label(panel, x, y + rowH / 2, String(mark.n), {
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        fill: colors.text,
      });
      label(panel, x, y + rowH * 1.5, String(mark.r), {
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'font-weight': 700,
        fill: colors.text,
      });
      if (mark.crossed) {
        // 0 을 지나 온 수 — 바큇살 0 과 같은 색의 눈금
        el(panel, 'rect', {
          x: x - cellW * 0.3,
          y: y + rowH * 2.15,
          width: cellW * 0.6,
          height: 3,
          rx: 1.5,
          fill: lapInk,
        });
      }
    });

    // 캡션 — 이번 걸음에 일어난 일
    let caption: string;
    if (scene.step.kind === 'start') {
      caption = t('caption.start', 'Start: {n}', { n: last.n });
    } else if (scene.step.kind === 'add') {
      const vars = { a: scene.step.from, d: scene.add, n: last.n, from: scene.step.fromR, to: last.r, q: last.q };
      caption = last.crossed
        ? t('caption.cross', '{a} + {d} = {n} · position {from} → {to} · passes 0 · laps: {q}', vars)
        : t('caption.add', '{a} + {d} = {n} · position {from} → {to}', vars);
    } else {
      throw new Error('modular-clock stage: init 뒤인데 이번 걸음이 비었다');
    }
    label(svg, PAD, H - PAD, caption, { 'font-size': fontSizes.md, fill: colors.text });
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        waiters.delete(wake);
        resolve();
      };
      const id = setTimeout(() => {
        timers.delete(id);
        wake();
      }, ms);
      timers.add(id);
      waiters.add(wake);
    });
  }

  async function render(next: ModularClockScene, _prev: ModularClockScene | null, opts: { animate: boolean }): Promise<void> {
    const mine = (gen += 1);
    if (destroyed) return;
    if (!opts.animate || next.step.kind !== 'add') {
      draw(next, null);
      return;
    }
    const from = next.step.from;
    const last = next.trail[next.trail.length - 1];
    if (last === undefined) {
      throw new Error('modular-clock stage: 더한 걸음인데 자취가 비었다');
    }
    const to = last.n;
    draw(next, from);
    const started = Date.now();
    for (;;) {
      await wait(FRAME_MS);
      if (mine !== gen || destroyed) return;
      const u = Math.min(1, (Date.now() - started) / MOVE_MS);
      if (u >= 1) break;
      draw(next, from + (to - from) * easeInOut(u));
    }
    draw(next, null);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    svg.textContent = '';
  }

  return { render, destroy };
}

export const modularClockStageView: CanvasView = {
  canvas: { height: H },
  mount: mountStage,
};
