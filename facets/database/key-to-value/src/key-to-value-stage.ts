/**
 * key-to-value stage — 동사는 "꺼내져 열린다".
 *
 * 왼쪽 저장소 안에서 값은 끝까지 닫힌 캡슐이다. 걸음마다 바깥이 그 열쇠 줄에 GET 을 보내면
 * 캡슐의 복제본이 같은 줄을 따라 저장소 벽을 넘어 오른쪽 바깥으로 나오고, 바깥에 닿아서야
 * 뚜껑이 옆으로 벌어지듯 넓어지며 속의 글자가 드러난다. 저장소의 캡슐은 그대로 닫혀 남는다.
 * 아래 셈 줄은 두 물음이 꺼낸 값을 캡슐 표식으로 쌓아 1 대 6 을 그림으로 둔다.
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
import type { KeyToValueScene, OutCard } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 14;
/** 저장소 캡슐의 닫힌 폭 · 높이 */
const SEAL_W = 56;
const SEAL_H = 18;
/** 바깥에서 열린 값 상자의 높이와 안쪽 여백 */
const CARD_H = 22;
const CARD_PAD = 8;
/** 줄 간격 상한 */
const ROW_MAX = 36;
/** 가림표(값 속에서 읽은 것)에 미리 잡아 두는 글자 수 */
const CHIP_CHARS = 6;
/** 꺼내는 운동 · 여는 운동 (ms) */
const MOVE_MS = 300;
const OPEN_MS = 300;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? fmt(v) : v);
  }
  parent.appendChild(node);
  return node;
}

/** 본문 글꼴의 대략 폭. 한글 · 한자권 글자는 넓게 친다 */
function bodyWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x1100 && code !== 0x2014 && code !== 0x00b7 ? px * 0.95 : px * 0.56;
  }
  return w;
}

/** 폭에 맞춰 낱말 단위로 접는다. 띄어쓰기가 없는 글은 글자 단위로 */
function wrapLines(text: string, maxW: number, px: number): string[] {
  const words = text.includes(' ') ? text.split(' ') : Array.from(text);
  const joiner = text.includes(' ') ? ' ' : '';
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const tryLine = line === '' ? w : line + joiner + w;
    if (line !== '' && bodyWidth(tryLine, px) > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

type Layout = {
  monoPx: number;
  charW: number;
  keyX: number;
  sealX: number;
  storeR: number;
  outX: number;
  cardW: number;
  chipX: number;
  chipW: number;
  top: number;
  rowH: number;
};

function layoutOf(scene: KeyToValueScene): Layout {
  const monoPx = parseFloat(fontSizes.sm);
  const charW = monoPx * 0.6;
  const W = PIECE_CANVAS_W;
  const maxKey = Math.max(1, ...scene.pairs.map((p) => p.key.length));
  const maxVal = Math.max(1, ...scene.pairs.map((p) => p.value.length));
  // 가림표에 들어갈 값은 열어 보기 전엔 모른다. 걸음마다 자리가 흔들리지 않게 폭을 미리 잡는다
  const maxFound = Math.max(scene.want.length, CHIP_CHARS);
  const keyX = MARGIN + 12;
  const sealX = keyX + maxKey * charW + 12;
  const storeR = sealX + SEAL_W + 12;
  const cardW = maxVal * charW + CARD_PAD * 2;
  const chipW = maxFound * charW + 18;
  // 바깥 상자와 가림표는 오른쪽 끝에 붙이고, 남는 폭은 저장소와 바깥 사이 틈이 된다
  const outX = Math.max(storeR + 70, W - MARGIN - chipW - 8 - cardW);
  const chipX = outX + cardW + 8;
  const top = 64;
  const rowsBottom = 262;
  const n = Math.max(1, scene.pairs.length);
  const rowH = Math.min(ROW_MAX, (rowsBottom - top) / n);
  return { monoPx, charW, keyX, sealX, storeR, outX, cardW, chipX, chipW, top, rowH };
}

type Moving = {
  g: SVGGElement;
  box: SVGRectElement;
  view: SVGSVGElement;
  chip: SVGGElement | null;
  fromX: number;
  toX: number;
  cy: number;
  cardW: number;
};

export const keyToValueStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function rowY(lay: Layout, i: number): number {
      return lay.top + (i + 0.5) * lay.rowH;
    }

    function drawCard(
      root: Element,
      lay: Layout,
      card: OutCard,
      cy: number,
      current: boolean,
      settled: boolean,
    ): { g: SVGGElement; box: SVGRectElement; view: SVGSVGElement; chip: SVGGElement | null } {
      const g = el('g', { transform: `translate(${fmt(lay.outX)},${fmt(cy)})` }, root);
      let stroke = colors.border;
      if (current) stroke = colors.accent;
      else if (settled && card.check !== null && card.check.match) stroke = colors.success;
      const box = el(
        'rect',
        {
          x: 0,
          y: -CARD_H / 2,
          width: lay.cardW,
          height: CARD_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke,
          'stroke-width': current ? 2 : 1,
        },
        g,
      );
      // 속 글자는 상자 폭만큼만 보인다 — 여는 운동이 이 창을 넓힌다
      const view = el(
        'svg',
        { x: 0, y: -CARD_H / 2, width: lay.cardW, height: CARD_H, overflow: 'hidden' },
        g,
      );
      const muted = card.check !== null && !card.check.match;
      const text = el(
        'text',
        {
          x: CARD_PAD,
          y: CARD_H / 2 + lay.monoPx * 0.35,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: muted ? colors.textMuted : colors.text,
        },
        view,
      );
      text.textContent = card.value;

      let chip: SVGGElement | null = null;
      if (card.check !== null) {
        chip = el('g', { transform: `translate(${fmt(lay.chipX - lay.outX)},0)` }, g);
        const hit = card.check.match;
        el(
          'rect',
          {
            x: 0,
            y: -10,
            width: lay.chipW,
            height: 20,
            rx: 10,
            fill: hit ? colors.success : 'none',
            stroke: hit ? colors.success : colors.textMuted,
            'stroke-width': 1,
          },
          chip,
        );
        const ct = el(
          'text',
          {
            x: lay.chipW / 2,
            y: lay.monoPx * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: hit ? colors.textInverse : colors.textMuted,
          },
          chip,
        );
        ct.textContent = card.check.found;
        if (!hit) {
          // 맞지 않은 값은 가로줄로 긋는다
          const half = (card.check.found.length * lay.charW) / 2;
          el(
            'line',
            {
              x1: lay.chipW / 2 - half,
              x2: lay.chipW / 2 + half,
              y1: 0,
              y2: 0,
              stroke: colors.textMuted,
              'stroke-width': 1,
            },
            chip,
          );
        }
      }
      return { g, box, view, chip };
    }

    /** 장면의 화면 전체를 세운다. 이번 걸음에 나온 값이 있으면 그 손잡이를 돌려준다 */
    function drawStatic(scene: KeyToValueScene): Moving | null {
      svg.textContent = '';
      const lay = layoutOf(scene);
      const W = PIECE_CANVAS_W;
      const labelPx = parseFloat(fontSizes.sm);
      const step = scene.step;
      const currentKey = step.kind === 'get' || step.kind === 'scan' ? step.key : null;

      // 머리 — 두 자리의 이름과 지금의 물음
      const storeLabel = el(
        'text',
        {
          x: MARGIN,
          y: 22,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.textMuted,
        },
        svg,
      );
      storeLabel.textContent = t('label.store', 'Store');
      const appLabel = el(
        'text',
        {
          x: lay.outX,
          y: 22,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.textMuted,
        },
        svg,
      );
      appLabel.textContent = t('label.app', 'Outside (the app)');
      if (step.kind !== 'store') {
        const ask = el(
          'text',
          { x: lay.outX, y: 42, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          svg,
        );
        ask.textContent =
          step.kind === 'get'
            ? t('ask.key', 'Question: the value of {key}', { key: scene.getKey })
            : t('ask.field', 'Question: values whose {field} is {want}', {
                field: scene.field,
                want: scene.want,
              });
      }

      // 저장소 — 열쇠와 닫힌 캡슐. 여기서 값은 끝까지 열리지 않는다
      const n = scene.pairs.length;
      el(
        'rect',
        {
          x: MARGIN,
          y: lay.top - 8,
          width: lay.storeR - MARGIN,
          height: n * lay.rowH + 16,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        },
        svg,
      );
      const outKeys = new Set(scene.out.map((c) => c.key));
      scene.pairs.forEach((pair, i) => {
        const cy = rowY(lay, i);
        const isCurrent = pair.key === currentKey;
        if (isCurrent) {
          el(
            'rect',
            {
              x: lay.keyX - 5,
              y: cy - 11,
              width: pair.key.length * lay.charW + 10,
              height: 22,
              rx: 4,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
            },
            svg,
          );
        }
        const kt = el(
          'text',
          {
            x: lay.keyX,
            y: cy + lay.monoPx * 0.35,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: outKeys.has(pair.key) || isCurrent ? colors.text : colors.textMuted,
          },
          svg,
        );
        kt.textContent = pair.key;
        el(
          'rect',
          {
            x: lay.sealX,
            y: cy - SEAL_H / 2,
            width: SEAL_W,
            height: SEAL_H,
            rx: SEAL_H / 2,
            fill: colors.border,
            stroke: colors.textMuted,
            'stroke-width': 1,
          },
          svg,
        );
        el('circle', { cx: lay.sealX + SEAL_W / 2, cy, r: 3, fill: colors.textMuted }, svg);
      });

      // 지금 걸음의 요청 — 바깥에서 저장소로 GET 이 들어간다
      if (currentKey !== null) {
        const i = scene.pairs.findIndex((p) => p.key === currentKey);
        if (i < 0) throw new Error(`key-to-value stage: 저장소에 없는 열쇠 ${currentKey}`);
        const cy = rowY(lay, i);
        const x1 = lay.outX - 10;
        const x2 = lay.storeR + 6;
        const ay = cy - lay.rowH * 0.28;
        el('line', { x1, x2, y1: ay, y2: ay, stroke: colors.textMuted, 'stroke-width': 1.25 }, svg);
        el(
          'path',
          { d: `M${fmt(x2)},${fmt(ay)} l7,-4 l0,8 z`, fill: colors.textMuted },
          svg,
        );
        const op = el(
          'text',
          {
            x: (x1 + x2) / 2,
            y: ay - 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          svg,
        );
        op.textContent = 'GET';
      }

      // 바깥 — 꺼내져 열린 값들
      let moving: Moving | null = null;
      for (const card of scene.out) {
        const i = scene.pairs.findIndex((p) => p.key === card.key);
        if (i < 0) throw new Error(`key-to-value stage: 저장소에 없는 열쇠 ${card.key}`);
        const cy = rowY(lay, i);
        const isCurrent = card.key === currentKey;
        const drawn = drawCard(svg, lay, card, cy, isCurrent, step.kind === 'done' || !isCurrent);
        if (isCurrent) {
          moving = { ...drawn, fromX: lay.sealX, toX: lay.outX, cy, cardW: lay.cardW };
        }
      }

      // 셈 줄 — 두 물음이 꺼낸 값을 캡슐 표식으로 쌓는다
      const tallies: Array<{ label: string; count: number }> = [
        { label: t('label.byKey', 'Taken out by key'), count: scene.byKey },
        { label: t('label.byField', 'Taken out to look inside'), count: scene.byField },
      ];
      const labelW = Math.max(...tallies.map((row) => bodyWidth(row.label, labelPx)));
      const numX = MARGIN + labelW + 12;
      const markX = numX + 24;
      const markStep = Math.min(26, (W - MARGIN - markX) / Math.max(1, n));
      tallies.forEach((row, r) => {
        const y = 290 + r * 24;
        const lt = el(
          'text',
          { x: MARGIN, y: y + 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
          svg,
        );
        lt.textContent = row.label;
        const nt = el(
          'text',
          {
            x: numX,
            y: y + 4,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            fill: colors.text,
          },
          svg,
        );
        nt.textContent = String(row.count);
        for (let k = 0; k < row.count; k += 1) {
          el(
            'rect',
            {
              x: markX + k * markStep,
              y: y - 5,
              width: markStep - 6,
              height: 10,
              rx: 5,
              fill: colors.border,
              stroke: colors.textMuted,
              'stroke-width': 1,
            },
            svg,
          );
        }
      });

      // 캡션 — 지금 일어난 일
      const caption = captionOf(scene);
      const capPx = parseFloat(fontSizes.md);
      const lines = wrapLines(caption, W - MARGIN * 2, capPx);
      lines.forEach((line, k) => {
        const ct = el(
          'text',
          {
            x: MARGIN,
            y: 342 + k * 18,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: colors.text,
          },
          svg,
        );
        ct.textContent = line;
      });

      return moving;
    }

    function captionOf(scene: KeyToValueScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'store':
          return t('caption.store', 'Pairs in the store: {n}. Every value is sealed.', {
            n: scene.pairs.length,
          });
        case 'get':
          return t('caption.get', 'GET {key}: one value comes out whole. Taken out: {n}.', {
            key: step.key,
            n: scene.byKey,
          });
        case 'scan':
          return step.match
            ? t('caption.scanHit', 'GET {key}, then opened outside. {field}: {found} matches. Taken out: {n} · Matched: {m}.', {
                key: step.key,
                field: scene.field,
                found: step.found,
                n: scene.byField,
                m: scene.matched,
              })
            : t('caption.scanMiss', 'GET {key}, then opened outside. {field}: {found} does not match. Taken out: {n} · Matched: {m}.', {
                key: step.key,
                field: scene.field,
                found: step.found,
                n: scene.byField,
                m: scene.matched,
              });
        case 'done':
          return t('caption.done', 'Taken out by key: {a}. Taken out to look inside: {b} · Matched: {m}.', {
            a: scene.byKey,
            b: scene.byField,
            m: scene.matched,
          });
      }
    }

    /** 프레임 수로 흐르는 짧은 운동. 끝까지 가면 true, 밀려나거나 거두면 false */
    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        const finish = (ok: boolean): void => {
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
          const k = i / total;
          frame(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
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
        const id0 = setTimeout(() => {
          timers.delete(id0);
          tick();
        }, FRAME_MS);
        timers.add(id0);
      });
    }

    /** 꺼내는 중 — 닫힌 캡슐 모양으로 줄을 따라 바깥으로 */
    function sealedAt(m: Moving, k: number): void {
      const x = m.fromX + (m.toX - m.fromX) * k;
      m.g.setAttribute('transform', `translate(${fmt(x)},${fmt(m.cy)})`);
      m.box.setAttribute('width', fmt(SEAL_W));
      m.box.setAttribute('height', fmt(SEAL_H));
      m.box.setAttribute('y', fmt(-SEAL_H / 2));
      m.box.setAttribute('rx', fmt(SEAL_H / 2));
      m.box.setAttribute('fill', colors.border);
      m.box.setAttribute('stroke', colors.textMuted);
      m.view.setAttribute('width', '0');
      if (m.chip !== null) m.chip.setAttribute('visibility', 'hidden');
    }

    /** 여는 중 — 바깥에서 뚜껑이 옆으로 벌어지며 속 글자가 드러난다 */
    function openingAt(m: Moving, k: number): void {
      m.g.setAttribute('transform', `translate(${fmt(m.toX)},${fmt(m.cy)})`);
      const h = SEAL_H + (CARD_H - SEAL_H) * k;
      m.box.setAttribute('width', fmt(SEAL_W + (m.cardW - SEAL_W) * k));
      m.box.setAttribute('height', fmt(h));
      m.box.setAttribute('y', fmt(-h / 2));
      m.box.setAttribute('rx', fmt(SEAL_H / 2 + (6 - SEAL_H / 2) * k));
      m.box.setAttribute('fill', colors.bgSubtle);
      m.box.setAttribute('stroke', colors.accent);
      m.view.setAttribute('width', fmt(m.cardW * k));
    }

    return {
      render(next: KeyToValueScene, _prev: KeyToValueScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = drawStatic(next);
        if (!opts.animate || moving === null) return;
        // 정적 그리기는 끝 자리다 — 첫 프레임 전에 아직 못 온 만큼으로 되돌린다
        sealedAt(moving, 0);
        return (async () => {
          if (!(await tween(MOVE_MS, mine, (k) => sealedAt(moving, k)))) return;
          if (!(await tween(OPEN_MS, mine, (k) => openingAt(moving, k)))) return;
          if (mine === gen && !destroyed) drawStatic(next);
        })();
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
