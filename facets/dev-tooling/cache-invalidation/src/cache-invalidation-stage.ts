/**
 * cache-invalidation 무대 — 한 줄로 선 층 여섯과 "다시" 띠, 다시 드는 초 막대.
 *
 * 움직이는 것:
 *   - 층 차례를 돌리면 층 줄이 자리를 바꿔 끼운다(소스 넣기가 의존 두 층을 건너 오르내린다).
 *   - 걸음 2 에 "다시" 띠가 앞 판의 자리(점선)에서 첫 바뀐 층까지 늘거나 줄고, 새 열쇠가 위에서 아래로 번진다.
 *   - 걸음 3 에 다시 드는 초 막대의 테두리가 앞 판의 길이에서 이번 길이로 늘거나 준다.
 *   - 바뀐 층 표지(왼쪽 삼각)가 바뀐 파일을 가져오는 층으로 옮겨 간다.
 * 층 줄의 초 막대 폭은 걸리는 초에 비례한다 — 의존 설치 60 초가 띠 안에 드는지가 한눈에 보인다.
 *
 * 무대는 셈하지 않는다 — 열쇠 · 지문 · 판정 · 초의 합은 모두 payload 로 받는다. 열쇠 · 지문은 앞 여섯 자만 보인다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageLayerStart = { id: string; file: string | null; seconds: number; prevKey: string };
export type StageFileStart = { name: string; print: string; content: string };
export type StageRoundStart = { orderId: string; allSeconds: number; layers: StageLayerStart[]; files: StageFileStart[] };
export type StageFileChanged = { name: string; before: string; after: string; content: string; layer: string; position: number };
export type StageVerdict = 'cached' | 'own-file' | 'prev-layer';
export type StageCascade = { firstChanged: number; layers: { id: string; newKey: string; verdict: StageVerdict }[] };
export type StageSum = { total: number; parts: { id: string; seconds: number }[] };

/** projector 가 부르는 무대의 표면. ms 는 이번 운동의 길이(재생 속도를 이미 반영한 값) */
export type CacheInvalidationStage = {
  startRound(p: StageRoundStart, ms: number): void;
  changeFile(p: StageFileChanged, ms: number): void;
  cascade(p: StageCascade, ms: number): void;
  sum(p: StageSum, ms: number): void;
  reset(): void;
};

const W = 760;
const H = 450;
const CAPTION_Y = 24;
const FILES_TOP = 38;
const CHIP_W = 260;
const CHIP_H = 40;
const CHIP_X0 = 150;
const HEAD_Y = 104;
const ROW0 = 114;
const ROW_H = 40;
const PITCH = 46;
const ROW_X = 44;
const ROW_W = W - ROW_X - 8;
const BAND_PAD = 4;
const COL_NAME = 54;
const COL_FILE = 220;
const TAG_W = 80;
const COL_SEC = 312;
const SEC_PX = 1.6;
const COL_PREV = 460;
const COL_ARROW = 514;
const COL_NEW = 530;
const COL_VERDICT = 612;
const SUM_TOP = 406;
const SUM_H = 24;
const SUM_X = 170;
const SUM_W = 500;

const SVG_NS = 'http://www.w3.org/2000/svg';
const short = (s: string): string => s.slice(0, 6);
const slotY = (index: number): number => ROW0 + index * PITCH;
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

type Row = {
  g: SVGGElement;
  y: number;
  tag: SVGRectElement | null;
  prev: SVGTextElement;
  arrow: SVGTextElement;
  next: SVGTextElement;
  verdict: SVGTextElement;
};

type Chip = { rect: SVGRectElement; print: SVGTextElement; content: SVGTextElement };

export const cacheInvalidationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const p: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const SM = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; mono?: boolean; anchor?: string; weight?: number },
      parent: Element,
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? p.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = body;
      return node;
    };

    // ── 운동: rAF 로 수를 옮긴다. 같은 열쇠의 운동은 앞 것을 끊고 지금 값에서 이어 간다
    const running = new Map<string, number>();
    const animate = (key: string, ms: number, delay: number, frame: (k: number) => void): void => {
      const before = running.get(key);
      if (before !== undefined) cancelAnimationFrame(before);
      running.delete(key);
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        frame(1);
        return;
      }
      const start = performance.now() + delay;
      const tick = (now: number): void => {
        const k = Math.min(1, Math.max(0, (now - start) / ms));
        frame(ease(k));
        if (k < 1) running.set(key, requestAnimationFrame(tick));
        else running.delete(key);
      };
      running.set(key, requestAnimationFrame(tick));
    };

    const layerName = (id: string): string => {
      switch (id) {
        case 'base':
          return t('label.layer.base', 'Base');
        case 'copy-deps':
          return t('label.layer.copy-deps', 'Add dependency list');
        case 'install':
          return t('label.layer.install', 'Install dependencies');
        case 'copy-src':
          return t('label.layer.copy-src', 'Add source');
        case 'build':
          return t('label.layer.build', 'Build');
        case 'test':
          return t('label.layer.test', 'Test');
        default:
          throw new Error(`cache-invalidation-stage: 모르는 층 '${id}' — label.layer.* 가 없다`);
      }
    };
    const orderName = (id: string): string => {
      switch (id) {
        case 'deps-first':
          return t('label.order.deps-first', 'Dependencies first');
        case 'src-first':
          return t('label.order.src-first', 'Source first');
        default:
          throw new Error(`cache-invalidation-stage: 모르는 층 차례 '${id}' — label.order.* 가 없다`);
      }
    };
    const verdictName = (v: StageVerdict): string => {
      switch (v) {
        case 'cached':
          return t('label.verdict.cached', 'Cached');
        case 'own-file':
          return t('label.verdict.own', 'Redo · own file');
        case 'prev-layer':
          return t('label.verdict.prev', 'Redo · layer above');
      }
    };

    // ── 고정된 틀: 캡션 · 파일 지문 · 머리글 · 자리 번호 · 다시 드는 초
    const caption = text(16, CAPTION_Y, '', { size: fontSizes.md, weight: 600 }, svg);
    text(16, FILES_TOP + 24, t('label.files', 'File fingerprints'), { fill: p.textMuted }, svg);
    text(COL_NAME, HEAD_Y, t('label.col.layer', 'Layer'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    text(COL_FILE, HEAD_Y, t('label.col.file', 'File'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    text(COL_SEC, HEAD_Y, t('label.col.seconds', 'Seconds'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    text(COL_PREV, HEAD_Y, t('label.col.prevKey', 'Last key'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    text(COL_NEW, HEAD_Y, t('label.col.newKey', 'New key'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    text(COL_VERDICT, HEAD_Y, t('label.col.verdict', 'Verdict'), { size: fontSizes.xs, fill: p.textMuted }, svg);
    for (let i = 0; i < 6; i += 1) {
      text(30, slotY(i) + ROW_H / 2 + SM / 3, String(i + 1), { fill: p.textMuted, anchor: 'middle', mono: true }, svg);
    }

    // "다시" 띠 — 층 줄 뒤에 깐다
    const band = el('rect', { x: ROW_X - BAND_PAD, y: ROW0, width: ROW_W + BAND_PAD * 2, height: 0, rx: 6, fill: 'none', stroke: 'none' }, svg);
    let bandTop = ROW0;
    let bandH = 0;
    const setBand = (top: number, h: number): void => {
      bandTop = top;
      bandH = h;
      band.setAttribute('y', String(top));
      band.setAttribute('height', String(Math.max(0, h)));
    };
    const rowsLayer = el('g', {}, svg);
    const marker = el('path', { d: `M 8 -7 L 18 0 L 8 7 Z`, fill: p.danger, opacity: 0, transform: `translate(0, ${slotY(0) + ROW_H / 2})` }, svg);
    let markerY = slotY(0) + ROW_H / 2;

    text(16, SUM_TOP + SUM_H / 2 + SM / 3, t('label.redoSeconds', 'Redo seconds'), { fill: p.textMuted }, svg);
    const sumTrack = el('rect', { x: SUM_X, y: SUM_TOP, width: 0, height: SUM_H, rx: 3, fill: p.bgSubtle, stroke: 'none' }, svg);
    const sumSegs = el('g', {}, svg);
    const sumOutline = el('rect', { x: SUM_X, y: SUM_TOP, width: 0, height: SUM_H, rx: 3, fill: 'none', stroke: 'none', 'stroke-width': 1.5 }, svg);
    let sumW = 0;
    const setSumW = (w: number): void => {
      sumW = w;
      sumOutline.setAttribute('width', String(Math.max(0, w)));
    };
    const sumLabel = text(SUM_X, SUM_TOP + SUM_H / 2 + SM / 3, '', { weight: 600 }, svg);
    let secScale = 0;

    const filesLayer = el('g', {}, svg);
    const chips = new Map<string, Chip>();
    const rows = new Map<string, Row>();
    let order: string[] = [];

    const makeRow = (layer: StageLayerStart): Row => {
      const g = el('g', { transform: `translate(0, ${ROW0})` }, rowsLayer);
      el('rect', { x: ROW_X, y: 0, width: ROW_W, height: ROW_H, rx: 4, fill: p.bgSubtle, stroke: p.border }, g);
      text(COL_NAME, 17, layerName(layer.id), { weight: 600 }, g);
      text(COL_NAME, 32, layer.id, { size: fontSizes.xs, fill: p.textMuted, mono: true }, g);
      let tag: SVGRectElement | null = null;
      if (layer.file !== null) {
        tag = el('rect', { x: COL_FILE, y: 9, width: TAG_W, height: 22, rx: 3, fill: p.bg, stroke: p.border }, g);
        text(COL_FILE + TAG_W / 2, 20 + SM / 3, layer.file, { mono: true, anchor: 'middle', size: fontSizes.xs }, g);
      }
      const barW = layer.seconds * SEC_PX;
      el('rect', { x: COL_SEC, y: 15, width: barW, height: 10, rx: 2, fill: p.itemSorted }, g);
      text(COL_SEC + barW + 6, 20 + SM / 3, t('label.seconds', '{n} s', { n: layer.seconds }), { size: fontSizes.xs, fill: p.textMuted }, g);
      const prev = text(COL_PREV, 20 + SM / 3, short(layer.prevKey), { mono: true, fill: p.textMuted }, g);
      const arrow = text(COL_ARROW, 20 + SM / 3, '→', { fill: p.textMuted, anchor: 'middle' }, g);
      arrow.setAttribute('opacity', '0');
      const next = text(COL_NEW, 20 + SM / 3, '', { mono: true, weight: 600 }, g);
      const verdict = text(COL_VERDICT, 20 + SM / 3, '', {}, g);
      return { g, y: ROW0, tag, prev, arrow, next, verdict };
    };

    const clearRoundMarks = (): void => {
      // 앞 판의 운동을 끊는다 — 끝나며 앞 판의 결론(합 글자 · 드러냄)을 다시 쓰지 않게
      for (const id of running.values()) cancelAnimationFrame(id);
      running.clear();
      for (const row of rows.values()) {
        row.next.textContent = '';
        row.verdict.textContent = '';
        row.arrow.setAttribute('opacity', '0');
        row.tag?.setAttribute('stroke', p.border);
      }
      marker.setAttribute('opacity', '0');
      // 띠와 초 막대는 자리만 점선으로 남긴다 — 결론(채움 · 글자)은 걷는다
      if (bandH > 0) {
        band.setAttribute('fill', 'none');
        band.setAttribute('stroke', p.border);
        band.setAttribute('stroke-dasharray', '5 4');
      }
      for (const seg of Array.from(sumSegs.children)) seg.remove();
      sumLabel.textContent = '';
      if (sumW > 0) {
        sumOutline.setAttribute('stroke', p.border);
        sumOutline.setAttribute('stroke-dasharray', '5 4');
      }
    };

    const rowOf = (id: string): Row => {
      const row = rows.get(id);
      if (row === undefined) throw new Error(`cache-invalidation-stage: 층 '${id}' 의 줄이 없다 — startRound 가 먼저다`);
      return row;
    };

    const stage: CacheInvalidationStage = {
      startRound(r, ms) {
        clearRoundMarks();
        caption.textContent = t('caption.start', 'Layer order: {order} · every last key is in the cache', { order: orderName(r.orderId) });

        // 파일 지문 — 지난번 내용
        r.files.forEach((f, i) => {
          let chip = chips.get(f.name);
          if (chip === undefined) {
            const x = CHIP_X0 + i * (CHIP_W + 12);
            const rect = el('rect', { x, y: FILES_TOP, width: CHIP_W, height: CHIP_H, rx: 4, fill: p.bg, stroke: p.border }, filesLayer);
            text(x + 10, FILES_TOP + 16, f.name, { mono: true, weight: 600 }, filesLayer);
            const print = text(x + CHIP_W - 10, FILES_TOP + 16, '', { mono: true, anchor: 'end' }, filesLayer);
            const content = text(x + 10, FILES_TOP + 32, '', { mono: true, size: fontSizes.xs, fill: p.textMuted }, filesLayer);
            chip = { rect, print, content };
            chips.set(f.name, chip);
          }
          chip.rect.setAttribute('stroke', p.border);
          chip.print.textContent = short(f.print);
          chip.print.setAttribute('fill', p.text);
          chip.content.textContent = f.content;
        });

        // 층 줄 — 새 차례의 자리로 옮겨 간다
        order = r.layers.map((l) => l.id);
        r.layers.forEach((layer, i) => {
          let row = rows.get(layer.id);
          if (row === undefined) {
            row = makeRow(layer);
            row.y = slotY(i);
            row.g.setAttribute('transform', `translate(0, ${row.y})`);
            rows.set(layer.id, row);
          }
          row.prev.textContent = short(layer.prevKey);
          const target = slotY(i);
          const from = row.y;
          const moving = row;
          // 두 칸 넘게 건너는 줄은 옆으로 비켜 지나간다 — 제자리에서 겹쳐 보이지 않게
          const hop = Math.abs(target - from) > PITCH ? 14 : 0;
          animate(`row:${layer.id}`, ms, 0, (k) => {
            moving.y = from + (target - from) * k;
            const dx = hop * Math.sin(Math.PI * k);
            moving.g.setAttribute('transform', `translate(${dx}, ${moving.y})`);
          });
        });
        for (const [id, row] of rows) {
          if (!order.includes(id)) throw new Error(`cache-invalidation-stage: 층 '${id}' 이 이번 차례에 없다`);
          row.g.setAttribute('opacity', '1');
        }

        // 초 막대의 바탕 — 모든 층의 초가 이 폭
        if (r.allSeconds <= 0) throw new Error(`cache-invalidation-stage: 모든 층의 초 합이 ${r.allSeconds}`);
        secScale = SUM_W / r.allSeconds;
        sumTrack.setAttribute('width', String(SUM_W));
      },

      changeFile(c, ms) {
        const chip = chips.get(c.name);
        if (chip === undefined) throw new Error(`cache-invalidation-stage: 파일 '${c.name}' 의 딱지가 없다`);
        chip.rect.setAttribute('stroke', p.danger);
        chip.print.textContent = `${short(c.before)} → ${short(c.after)}`;
        chip.print.setAttribute('fill', p.danger);
        chip.content.textContent = c.content;
        caption.textContent = t('caption.changed', 'Changed: {name} · fingerprint {before} → {after}', {
          name: c.name,
          before: short(c.before),
          after: short(c.after),
        });
        const row = rowOf(c.layer);
        if (order[c.position - 1] !== c.layer) throw new Error(`cache-invalidation-stage: 자리 ${c.position} 에 '${c.layer}' 이 없다`);
        row.tag?.setAttribute('stroke', p.danger);
        const from = markerY;
        const target = slotY(c.position - 1) + ROW_H / 2;
        marker.setAttribute('opacity', '1');
        animate('marker', ms, 0, (k) => {
          markerY = from + (target - from) * k;
          marker.setAttribute('transform', `translate(0, ${markerY})`);
        });
      },

      cascade(c, ms) {
        if (c.layers.length !== order.length) throw new Error(`cache-invalidation-stage: 층 ${c.layers.length} 개 — 줄은 ${order.length} 개`);
        const first = c.layers[c.firstChanged - 1];
        if (first === undefined) throw new Error(`cache-invalidation-stage: 첫 바뀐 층 자리 ${c.firstChanged} 이 없다`);
        caption.textContent = t('caption.cascade', 'First new key at layer {pos}: {name}', {
          pos: c.firstChanged,
          name: layerName(first.id),
        });

        // 띠 — 앞 판의 자리(또는 첫 바뀐 층의 머리)에서 이번 자리로 늘거나 준다
        const top = slotY(c.firstChanged - 1) - BAND_PAD;
        const bottom = slotY(order.length - 1) + ROW_H + BAND_PAD;
        const fromTop = bandH > 0 ? bandTop : top;
        const fromH = bandH > 0 ? bandH : 0;
        band.setAttribute('fill', p.itemComparing);
        band.setAttribute('fill-opacity', '0.16');
        band.setAttribute('stroke', p.itemComparing);
        band.removeAttribute('stroke-dasharray');
        const spread = ms * 0.6;
        animate('band', spread, 0, (k) => setBand(fromTop + (top - fromTop) * k, fromH + (bottom - top - fromH) * k));

        // 새 열쇠 — 위에서 아래로 번진다
        const each = (ms * 0.8) / Math.max(1, c.layers.length);
        c.layers.forEach((l, i) => {
          if (order[i] !== l.id) throw new Error(`cache-invalidation-stage: 자리 ${i + 1} 의 층이 '${order[i]}' — 받은 것은 '${l.id}'`);
          const row = rowOf(l.id);
          const changed = l.verdict !== 'cached';
          row.next.textContent = short(l.newKey);
          row.next.setAttribute('fill', changed ? p.danger : p.textMuted);
          row.verdict.textContent = verdictName(l.verdict);
          row.verdict.setAttribute('fill', l.verdict === 'cached' ? p.textMuted : l.verdict === 'own-file' ? p.danger : p.text);
          row.verdict.setAttribute('font-weight', changed ? '600' : '400');
          for (const node of [row.arrow, row.next, row.verdict]) node.setAttribute('opacity', '0');
          animate(`reveal:${l.id}`, each, i * each, (k) => {
            for (const node of [row.arrow, row.next, row.verdict]) node.setAttribute('opacity', String(k));
          });
        });
      },

      sum(s, ms) {
        if (secScale <= 0) throw new Error('cache-invalidation-stage: 초 막대의 눈금이 없다 — startRound 가 먼저다');
        caption.textContent = t('caption.sum', 'Seconds of redone layers: {parts}', {
          parts: s.parts.map((part) => String(part.seconds)).join(' + '),
        });
        for (const seg of Array.from(sumSegs.children)) seg.remove();
        const target = s.total * secScale;
        const from = sumW;
        sumOutline.setAttribute('stroke', p.itemComparing);
        sumOutline.removeAttribute('stroke-dasharray');
        sumLabel.textContent = '';
        // 층마다 조각 — 이번 길이로 늘거나 주는 테두리를 따라 왼쪽부터 찬다
        const pieces: { rect: SVGRectElement; x: number; w: number }[] = [];
        let x = SUM_X;
        for (const part of s.parts) {
          const w = part.seconds * secScale;
          const rect = el('rect', { x, y: SUM_TOP, width: 0, height: SUM_H, fill: p.itemComparing, stroke: p.bg, 'stroke-width': 1 }, sumSegs);
          pieces.push({ rect, x, w });
          x += w;
        }
        animate('sum', ms, 0, (k) => {
          setSumW(from + (target - from) * k);
          const reach = SUM_X + target * k;
          for (const piece of pieces) piece.rect.setAttribute('width', String(Math.max(0, Math.min(piece.w, reach - piece.x))));
          if (k >= 1) {
            sumLabel.textContent = t('label.seconds', '{n} s', { n: s.total });
            sumLabel.setAttribute('x', String(SUM_X + target + 8));
          }
        });
      },

      reset() {
        clearRoundMarks();
        caption.textContent = '';
      },
    };

    return {
      ...stage,
      destroy() {
        for (const id of running.values()) cancelAnimationFrame(id);
        running.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
