/**
 * inlining-tradeoff 무대 — 한계 선이 몸 길이 막대와 견주어지고, 한계 안인 함수의 부르는 줄들이
 * 한꺼번에 열리며 몸의 명령이 제 정의 자리에서 부른 자리로 흘러 들어온다.
 *
 * 왼쪽 위: 피호출마다 몸 길이 막대와 한계 선 (손잡이를 돌리면 선이 오르내린다)
 * 왼쪽 아래: 크기 · 실행 두 저울눈 (반대로 기운다) · 가운데: 피호출 정의 · 오른쪽: main
 *
 * 무대는 셈하지 않는다 — main 의 줄 목록 · 크기 · 실행 · 붙였는지는 모두 payload 로 받는다.
 * 줄 자리와 막대 높이만 여기서 정한다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DefLine, MainLine } from './algorithm.js';

export type RoundStartView = {
  limit: number;
  ladder: number[];
  gaugeMax: number;
  scaleMax: number;
  defs: DefLine[];
  mainHeader: string;
  main: MainLine[];
  bodies: { name: string; ops: number }[];
  size: number;
  exec: number;
};

export type JudgeView = {
  fn: string;
  index: number;
  ops: number;
  limit: number;
  pasted: boolean;
  sites: number;
  siteKeys: string[];
  main: MainLine[];
  size: number;
  exec: number;
  dSize: number;
  dExec: number;
};

export type TotalView = { size: number; exec: number; pasted: number; mainLen: number };

export type InliningTradeoffStage = {
  startRound(p: RoundStartView, motionMs: number): void;
  judge(p: JudgeView, motionMs: number): void;
  total(p: TotalView): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 620;

// 코드 칸
const Y0 = 84;
const LH = 15;
const DEF_X = 396;
const MAIN_X = 640;
const INDENT = 24;
const CODE_PX = parseFloat(fontSizes.sm);
const CHAR_W = CODE_PX * 0.6;

// 몸 길이 막대와 한계 선
const G_LEFT = 36;
const G_RIGHT = 300;
const G_BASE = 290;
const G_SPAN = 186;
const BAR_W = 46;

// 크기 · 실행 저울눈
const S_BASE = 580;
const S_SPAN = 196;
const S_X = [70, 190];
const S_W = 64;

type LineEl = { g: SVGGElement; bg: SVGRectElement; box: SVGRectElement; line: MainLine };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function signed(x: number): string {
  if (x > 0) return `+${x}`;
  if (x < 0) return `−${-x}`;
  return '+0';
}

export const inliningTradeoffStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    // 걸어 둔 프레임 · 타이머 — 되짚기 · 해체 때 끝 상태로 당겨 끝낸다
    const deferred = new Map<number, { kind: 'frame' | 'timer'; run: () => void }>();
    let seq = 0;
    const later = (kind: 'frame' | 'timer', run: () => void, ms = 0): void => {
      const key = ++seq;
      const fire = (): void => {
        deferred.delete(key);
        run();
      };
      const id = kind === 'frame' ? requestAnimationFrame(fire) : window.setTimeout(fire, ms);
      deferred.set(key, { kind, run: () => (kind === 'frame' ? cancelAnimationFrame(id) : clearTimeout(id)) });
      const entry = deferred.get(key)!;
      const cancel = entry.run;
      entry.run = () => {
        cancel();
        run();
      };
    };
    const flush = (): void => {
      const all = [...deferred.values()];
      deferred.clear();
      for (const d of all) d.run();
    };
    params.onScrubStart?.(flush);

    const root = el('g');
    svg.appendChild(root);

    const text = (x: number, y: number, size: string, family: string, fill: string, anchor = 'start'): SVGTextElement =>
      el('text', { x, y, 'font-size': size, 'font-family': family, fill, 'text-anchor': anchor, 'dominant-baseline': 'central' });

    // 캡션
    const caption = text(24, 22, fontSizes.lg, fonts.body, colors.text);
    const sub = text(24, 46, fontSizes.md, fonts.body, colors.textMuted);
    root.append(caption, sub);

    // 칸 제목
    const gaugeTitle = text(G_LEFT - 12, 72, fontSizes.sm, fonts.body, colors.textMuted);
    const costTitle = text(G_LEFT - 12, 342, fontSizes.sm, fonts.body, colors.textMuted);
    const defsTitle = text(DEF_X - 8, 66, fontSizes.sm, fonts.body, colors.textMuted);
    const mainTitle = text(MAIN_X - 8, 66, fontSizes.sm, fonts.body, colors.textMuted);
    root.append(gaugeTitle, costTitle, defsTitle, mainTitle);

    // 몸 길이 막대 · 한계 선
    const gauge = el('g');
    const ticks = el('g');
    const barsG = el('g');
    root.append(gauge);
    gauge.append(ticks, barsG, el('line', { x1: G_LEFT, x2: G_RIGHT, y1: G_BASE, y2: G_BASE, stroke: colors.border }));
    const limitG = el('g');
    const limitLine = el('line', { x1: G_LEFT, x2: G_RIGHT, y1: 0, y2: 0, stroke: colors.itemComparing, 'stroke-width': 2 });
    const limitLabel = text(G_RIGHT + 6, 0, fontSizes.sm, fonts.body, colors.itemComparing);
    limitG.append(limitLine, limitLabel);
    gauge.append(limitG);
    // 첫 판이 오기 전에는 막대 · 한계 선 · 저울눈을 숨긴다 (자리가 아직 정해지지 않았다)
    const shown = (on: boolean): void => {
      gauge.style.display = on ? '' : 'none';
      cost.style.display = on ? '' : 'none';
    };
    type Bar = { rect: SVGRectElement; num: SVGTextElement; name: SVGTextElement; tag: SVGTextElement };
    let bars: Bar[] = [];
    let unit = 0;

    // 크기 · 실행 저울눈
    const cost = el('g');
    root.append(cost);
    cost.append(el('line', { x1: G_LEFT, x2: G_RIGHT - 30, y1: S_BASE, y2: S_BASE, stroke: colors.border }));
    const scaleBars = S_X.map((x, i) => {
      const rect = el('rect', { x, y: S_BASE, width: S_W, height: 0, fill: i === 0 ? colors.textMuted : colors.accent });
      const ghost = el('line', { x1: x - 6, x2: x + S_W + 6, y1: S_BASE, y2: S_BASE, stroke: colors.ghostOutline, 'stroke-dasharray': '4 3' });
      const num = text(x + S_W / 2, S_BASE - 10, fontSizes.md, fonts.mono, colors.text, 'middle');
      const name = text(x + S_W / 2, S_BASE + 14, fontSizes.sm, fonts.body, colors.text, 'middle');
      cost.append(rect, ghost, num, name);
      return { rect, ghost, num, name };
    });
    let sUnit = 0;
    shown(false);

    // 정의 칸
    const defsG = el('g');
    const defsHi = el('g');
    root.append(defsHi, defsG);
    let defKey = '';
    let defs: DefLine[] = [];

    // main 칸
    const mainHeader = el('text', {
      x: MAIN_X,
      y: Y0,
      'font-size': fontSizes.sm,
      'font-family': fonts.mono,
      fill: colors.text,
      'dominant-baseline': 'central',
    });
    const mainG = el('g');
    root.append(mainHeader, mainG);
    const lines = new Map<string, LineEl>();

    let hue: readonly string[] = [];
    const hueOf = (i: number): string => {
      const c = hue[i];
      if (c === undefined) throw new Error(`inlining-tradeoff-stage: 피호출 번호 ${i} 의 색이 없다`);
      return c;
    };

    const motion = (node: SVGElement, ms: number): void => {
      node.style.transition = ms > 0 && !isInstant() ? `transform ${ms}ms ease, opacity ${ms}ms ease` : 'none';
    };
    const place = (node: SVGElement, x: number, y: number): void => {
      node.style.transform = `translate(${x}px, ${y}px)`;
    };
    const mainPos = (i: number): [number, number] => [MAIN_X + INDENT, Y0 + (i + 1) * LH];
    const defPos = (j: number): [number, number] => {
      const d = defs[j];
      if (d === undefined) throw new Error(`inlining-tradeoff-stage: 정의 줄 ${j} 이 없다`);
      return [DEF_X + (d.header ? 0 : INDENT), Y0 + j * LH];
    };

    const makeLine = (line: MainLine): LineEl => {
      const g = el('g', { 'data-row': line.key });
      const w = line.text.length * CHAR_W + 8;
      const bg = el('rect', { x: -4, y: -LH / 2 + 1, width: w, height: LH - 2, rx: 2, fill: 'none' });
      const box = el('rect', { x: -4, y: -LH / 2 + 1, width: w, height: LH - 2, rx: 2, fill: 'none', stroke: 'none' });
      const stripe = el('rect', { x: -10, y: -LH / 2 + 2, width: 3, height: LH - 4, fill: line.origin >= 0 ? hueOf(line.origin) : 'none' });
      const tx = el('text', { x: 0, y: 0, 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: colors.text, 'dominant-baseline': 'central' });
      tx.textContent = line.text;
      if (line.kind === 'pasted') {
        bg.setAttribute('fill', hueOf(line.origin));
        bg.setAttribute('fill-opacity', '0.18');
      }
      g.append(bg, box, stripe, tx);
      mainG.appendChild(g);
      return { g, bg, box, line };
    };

    const dropLine = (le: LineEl, ms: number): void => {
      if (ms <= 0 || isInstant()) {
        le.g.remove();
        return;
      }
      later('timer', () => le.g.remove(), ms);
    };

    /** main 줄을 새 목록으로 — 있던 줄은 새 자리로, 새 붙인 줄은 정의 자리에서 흘러 들어오고, 사라지는 줄은 접힌다 */
    const layoutMain = (next: MainLine[], ms: number): void => {
      const index = new Map(next.map((l, i) => [l.key, i] as const));
      // 사라지는 줄
      for (const [key, le] of [...lines]) {
        if (index.has(key)) continue;
        lines.delete(key);
        le.g.setAttribute('data-leaving', '1');
        motion(le.g, ms);
        const home = le.line.site === '' ? undefined : index.get(le.line.site);
        if (home !== undefined) {
          // 붙었던 몸이 부르는 줄 하나로 접혀 들어간다
          const [x, y] = mainPos(home);
          place(le.g, x, y);
        }
        le.g.style.opacity = '0';
        dropLine(le, ms);
      }
      next.forEach((line, i) => {
        const [x, y] = mainPos(i);
        const have = lines.get(line.key);
        if (have !== undefined) {
          motion(have.g, ms);
          place(have.g, x, y);
          have.line = line;
          return;
        }
        const le = makeLine(line);
        lines.set(line.key, le);
        motion(le.g, 0);
        if (line.src >= 0) {
          // 정의 자리에서 출발
          const [sx, sy] = defPos(line.src);
          place(le.g, sx, sy);
        } else {
          // 접힌 몸 자리에서 부르는 줄이 다시 선다
          place(le.g, x, y);
          le.g.style.opacity = '0';
        }
        if (ms <= 0 || isInstant()) {
          place(le.g, x, y);
          le.g.style.opacity = '1';
          return;
        }
        later('frame', () => {
          motion(le.g, ms);
          place(le.g, x, y);
          le.g.style.opacity = '1';
        });
      });
    };

    const clearMarks = (): void => {
      for (const le of lines.values()) {
        le.box.setAttribute('stroke', 'none');
        le.box.removeAttribute('stroke-dasharray');
      }
      defsHi.replaceChildren();
    };

    const drawDefs = (list: DefLine[]): void => {
      const key = list.map((d) => `${d.origin}|${d.text}`).join('\n');
      defs = list;
      if (key === defKey) return;
      defKey = key;
      defsG.replaceChildren();
      list.forEach((d, j) => {
        const [x, y] = defPos(j);
        const tx = el('text', {
          x,
          y,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          fill: d.header ? colors.text : colors.textMuted,
          'font-weight': d.header ? 600 : 400,
          'dominant-baseline': 'central',
        });
        tx.textContent = d.text;
        const stripe = el('rect', { x: DEF_X - 10, y: y - LH / 2 + 2, width: 3, height: LH - 4, fill: hueOf(d.origin) });
        defsG.append(stripe, tx);
      });
    };

    const barTop = (ops: number): number => G_BASE - ops * unit;

    const drawGauge = (p: RoundStartView): void => {
      unit = G_SPAN / p.gaugeMax;
      ticks.replaceChildren();
      for (const v of p.ladder) {
        const y = barTop(v);
        ticks.append(
          el('line', { x1: G_LEFT - 4, x2: G_RIGHT, y1: y, y2: y, stroke: colors.border, 'stroke-dasharray': '2 4' }),
        );
        const lab = text(G_LEFT - 8, y, fontSizes.xs, fonts.mono, colors.textMuted, 'end');
        lab.textContent = String(v);
        ticks.append(lab);
      }
      if (bars.length !== p.bodies.length) {
        barsG.replaceChildren();
        const gap = (G_RIGHT - G_LEFT - BAR_W * p.bodies.length) / (p.bodies.length + 1);
        bars = p.bodies.map((_, i) => {
          const x = G_LEFT + gap + i * (BAR_W + gap);
          const rect = el('rect', { x, y: G_BASE, width: BAR_W, height: 0 });
          const num = text(x + BAR_W / 2, G_BASE, fontSizes.sm, fonts.mono, colors.text, 'middle');
          const name = text(x + BAR_W / 2, G_BASE + 14, fontSizes.sm, fonts.mono, colors.text, 'middle');
          const tag = text(x + BAR_W / 2, G_BASE + 30, fontSizes.sm, fonts.body, colors.text, 'middle');
          barsG.append(rect, num, name, tag);
          return { rect, num, name, tag };
        });
      }
      p.bodies.forEach((b, i) => {
        const bar = bars[i]!;
        const top = barTop(b.ops);
        bar.rect.setAttribute('y', String(top));
        bar.rect.setAttribute('height', String(G_BASE - top));
        bar.rect.setAttribute('fill', colors.bgSubtle);
        bar.rect.setAttribute('stroke', hueOf(i));
        bar.rect.setAttribute('stroke-width', '2');
        bar.rect.removeAttribute('stroke-dasharray');
        bar.num.setAttribute('y', String(top - 9));
        bar.num.textContent = String(b.ops);
        bar.name.textContent = b.name;
        bar.tag.textContent = '';
      });
    };

    const moveLimit = (limit: number, ms: number): void => {
      motion(limitG, ms);
      place(limitG, 0, barTop(limit));
      limitLabel.textContent = t('label.limit', 'limit {n}', { n: limit });
    };

    const setScale = (size: number, exec: number, ms: number): void => {
      [size, exec].forEach((val, i) => {
        const s = scaleBars[i]!;
        const h = val * sUnit;
        motion(s.rect, ms);
        // 높이는 transform 으로 늘인다 — 바닥에 붙인 채
        s.rect.setAttribute('y', String(S_BASE - S_SPAN));
        s.rect.setAttribute('height', String(S_SPAN));
        s.rect.style.transformOrigin = `0px ${S_BASE}px`;
        s.rect.style.transform = `scaleY(${h / S_SPAN})`;
        motion(s.num, ms);
        s.num.style.transform = `translateY(${-h}px)`;
        s.num.textContent = String(val);
      });
    };

    const clear = (): void => {
      flush();
      for (const le of lines.values()) le.g.remove();
      lines.clear();
      clearMarks();
      caption.textContent = '';
      sub.textContent = '';
      mainHeader.textContent = '';
      shown(false);
      for (const b of bars) {
        b.tag.textContent = '';
        b.num.textContent = '';
      }
      for (const s of scaleBars) {
        s.num.textContent = '';
        s.rect.style.transform = 'scaleY(0)';
      }
    };

    const api: InliningTradeoffStage & ViewInstance = {
      startRound(p, ms0) {
        // 숨겨 있던 무대가 처음 서는 판은 운동 없이 제자리에
        const ms = gauge.style.display === 'none' ? 0 : ms0;
        shown(true);
        hue = categorical(p.bodies.length, 'vivid');
        gaugeTitle.textContent = t('label.body', 'Body length vs limit');
        costTitle.textContent = t('label.cost', 'Size and executed');
        defsTitle.textContent = t('label.defs', 'Callees');
        mainTitle.textContent = t('label.main', 'Caller');
        scaleBars[0]!.name.textContent = t('label.size', 'Size');
        scaleBars[1]!.name.textContent = t('label.exec', 'Executed');
        sUnit = S_SPAN / p.scaleMax;
        clearMarks();
        drawDefs(p.defs);
        drawGauge(p);
        moveLimit(p.limit, ms);
        mainHeader.textContent = p.mainHeader;
        layoutMain(p.main, ms);
        scaleBars.forEach((s, i) => {
          const y = S_BASE - (i === 0 ? p.size : p.exec) * sUnit;
          s.ghost.setAttribute('y1', String(y));
          s.ghost.setAttribute('y2', String(y));
        });
        setScale(p.size, p.exec, ms);
        caption.textContent = t('caption.start', 'Start — the original program');
        sub.textContent = t('caption.startSub', 'Callees are weighed against the limit in definition order');
      },
      judge(p, ms) {
        clearMarks();
        const bar = bars[p.index];
        if (bar === undefined) throw new Error(`inlining-tradeoff-stage: 막대 ${p.index} 이 없다`);
        if (p.pasted) {
          bar.rect.setAttribute('fill', hueOf(p.index));
          bar.tag.textContent = t('label.opened', 'inlined');
          // 몸의 정의 줄을 짚는다
          // 흘러 들어온 줄이 떠난 정의 줄을 짚는다 (return 줄은 옮겨 오지 않는다)
          const srcs = new Set(p.main.filter((l) => l.kind === 'pasted' && l.origin === p.index).map((l) => l.src));
          defs.forEach((d, j) => {
            if (!srcs.has(j)) return;
            const [x, y] = defPos(j);
            defsHi.append(
              el('rect', { x: x - 4, y: y - LH / 2 + 1, width: d.text.length * CHAR_W + 8, height: LH - 2, rx: 2, fill: hueOf(p.index), 'fill-opacity': 0.25 }),
            );
          });
        } else {
          bar.rect.setAttribute('fill', colors.bg);
          bar.rect.setAttribute('stroke-dasharray', '4 3');
          bar.tag.textContent = t('label.kept', 'called');
        }
        layoutMain(p.main, ms);
        if (!p.pasted) {
          for (const key of p.siteKeys) {
            const le = lines.get(key);
            if (le === undefined) throw new Error(`inlining-tradeoff-stage: 부르는 줄 ${key} 이 없다`);
            le.box.setAttribute('stroke', hueOf(p.index));
            le.box.setAttribute('stroke-dasharray', '4 3');
          }
        }
        setScale(p.size, p.exec, ms);
        caption.textContent = p.pasted
          ? t('caption.paste', '{fn} — body {ops} ≤ limit {limit} · sites opened: {sites}', {
              fn: p.fn,
              ops: p.ops,
              limit: p.limit,
              sites: p.sites,
            })
          : t('caption.kept', '{fn} — body {ops} > limit {limit} · calls kept: {sites}', {
              fn: p.fn,
              ops: p.ops,
              limit: p.limit,
              sites: p.sites,
            });
        sub.textContent = t('caption.delta', 'Size {ds} · executed {de}', { ds: signed(p.dSize), de: signed(p.dExec) });
      },
      total(p) {
        clearMarks();
        caption.textContent = t('caption.total', 'Total — size {size} · executed {exec} · pasted sites {pasted}', {
          size: p.size,
          exec: p.exec,
          pasted: p.pasted,
        });
        sub.textContent = t('caption.totalSub', 'Instructions in main: {n}', { n: p.mainLen });
      },
      reset() {
        clear();
      },
      destroy() {
        flush();
        root.remove();
      },
    };
    return api;
  },
};
