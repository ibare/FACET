/**
 * average-the-buckets-stage — 갇히고 모이는 그림.
 *
 * 동사가 둘이라 띠도 셋이다.
 *
 *   스트림  키가 한 줄로 선다. 칸에 적힌 수가 그 키의 ρ 다.
 *   통      바닥과 벽. 처음엔 벽이 양끝 둘뿐이라 통이 하나고, 가운데 벽이
 *           내려오면 넷이 된다. 키의 **세로 자리는 제 ρ, 가로 자리는 제 통**이라
 *           벽이 내려온 뒤 키들이 옆으로 미끄러져 제 통에 갇힌다. 가장 높이 뜬
 *           칸은 그때 한 통 안에 갇히고, 물금도 그 통 너비로 오그라든다.
 *   자      log2 눈금. 통에서 잰 답이 금에서 떨어져 여기 앉고, 마지막에 넷이
 *           눈금을 따라 서로에게 미끄러져 한 자리에 모인다.
 *
 * ρ 는 통 안에 남고 자로 내려가는 것은 추정값뿐이다 — 추정값은 서로, 그리고
 * 참값과 견줘져야 하므로 같은 자 위에 있어야 한다 (S-piece).
 *
 * 세로는 여기서 정하고 가로는 러너가 PIECE_CANVAS_W 로 준다. 마운트한 뒤
 * viewBox 를 다시 재지 않는다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 스트림 · 통 · 자 세 띠와 캡션이 정한 값이다. */
const H = 324;

const SIDE = 30;
const LANE_X = SIDE;
const LANE_W = PIECE_CANVAS_W - SIDE * 2;

const STREAM_Y = 12;
const DROP_FROM = 34;

const TOK_H = 17;
const TOK_MAX_W = 30;
const TOK_GAP = 3;

const BIN_TOP = 58;
const BIN_BASE = 208;
const ROW_MAX_H = 20;

const BUCKET_LABEL_Y = 222;
const TRUTH_LABEL_Y = 232;
const TRUTH_TOP = 236;
const TRUTH_BOT = 300;
const ROW_A_Y = 252;
const ROW_B_Y = 286;
const CHIP_H = 18;
const CAPTION_Y = 316;

/** 자의 양끝 — log2 눈금. 2 와 128 이 끝에 붙지 않고 안쪽에 앉는다. */
const GAUGE_LO = 0.6;
const GAUGE_HI = 7.4;

const FRAME_MS = 16;

type SceneKey = { id: string; bucket: number; rho: number };
type Scene = { keys: SceneKey[]; bucketCount: number };
type Pos = { x: number; y: number };
type Chip = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };
type Level = { g: SVGGElement; line: SVGLineElement; label: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const r1 = (v: number): number => Math.round(v * 10) / 10;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** i 번째가 조금씩 늦게 출발한다. spread 는 전체 중 출발이 어긋나는 몫. */
function stagger(p: number, i: number, n: number, spread: number): number {
  if (n <= 1) return clamp(p, 0, 1);
  const start = (i / (n - 1)) * spread;
  return clamp((p - start) / (1 - spread), 0, 1);
}

/** 화면에 적는 수 — 정수는 그대로, 아니면 소수 한 자리. */
const numText = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** initialData 를 좁히는 자리는 mount 다 (S-piece). */
function readScene(data: unknown): Scene {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const bucketCount =
    typeof d.bucketCount === 'number' && d.bucketCount > 0 ? Math.floor(d.bucketCount) : 1;
  const raw = Array.isArray(d.keys) ? d.keys : [];
  const keys: SceneKey[] = [];
  for (const item of raw) {
    const k = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof k.id === 'string' ? k.id : '';
    const bucket = typeof k.bucket === 'number' ? Math.floor(k.bucket) : -1;
    const rho = typeof k.rho === 'number' ? Math.floor(k.rho) : 0;
    if (id === '' || bucket < 0 || bucket >= bucketCount || rho < 1) continue;
    keys.push({ id, bucket, rho });
  }
  return { keys, bucketCount };
}

export const averageTheBucketsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const { keys, bucketCount } = readScene(params.initialData);
    const n = keys.length;

    const hues = categorical(Math.max(1, bucketCount), 'vivid');
    const hueOf = (b: number): string => hues[b % hues.length];

    // ── 자리 셈. 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const binW = LANE_W / bucketCount;
    const binX = (b: number): number => LANE_X + b * binW;

    let maxRho = 1;
    let spikeRho = 0;
    let spikeBucket = 0;
    let spikeIndex = -1;
    keys.forEach((k, i) => {
      if (k.rho > maxRho) maxRho = k.rho;
      if (k.rho > spikeRho) {
        spikeRho = k.rho;
        spikeBucket = k.bucket;
        spikeIndex = i;
      }
    });

    // 한 줄에 몇이 함께 서는가 — 가장 붐비는 줄이 칸 너비를 정한다.
    const crowd = new Map<string, number>();
    let widest = 1;
    for (const k of keys) {
      const cnt = (crowd.get(`${k.bucket}:${k.rho}`) ?? 0) + 1;
      crowd.set(`${k.bucket}:${k.rho}`, cnt);
      if (cnt > widest) widest = cnt;
    }
    const tokW = Math.max(
      12,
      Math.min(TOK_MAX_W, Math.floor((binW - TOK_GAP * (widest - 1)) / widest)),
    );
    // ρ 가 커도 통 밖으로 나가지 않게 층 간격을 줄여 담는다 (S-view).
    const rowH = Math.min(
      ROW_MAX_H,
      Math.floor((BIN_BASE - BIN_TOP - TOK_H - 6) / Math.max(1, maxRho - 1)),
    );
    const rowY = (rho: number): number => BIN_BASE - 3 - TOK_H - (rho - 1) * rowH;
    const levelY = (rho: number): number => rowY(rho) - 4;

    const gaugeX = (v: number): number => {
      const lg = Math.log2(Math.max(1e-6, v));
      return LANE_X + clamp((lg - GAUGE_LO) / (GAUGE_HI - GAUGE_LO), 0, 1) * LANE_W;
    };

    const streamPos: Pos[] = keys.map((_, i) => ({
      x: n <= 1 ? LANE_X + (LANE_W - tokW) / 2 : LANE_X + (i * (LANE_W - tokW)) / (n - 1),
      y: STREAM_Y,
    }));
    const poolPos: Pos[] = keys.map(() => ({ x: 0, y: 0 }));
    const binPos: Pos[] = keys.map(() => ({ x: 0, y: 0 }));

    const rowsBy = (idOf: (k: SceneKey) => string): Map<string, number[]> => {
      const m = new Map<string, number[]>();
      keys.forEach((k, i) => {
        const arr = m.get(idOf(k)) ?? [];
        arr.push(i);
        m.set(idOf(k), arr);
      });
      return m;
    };
    const spreadRow = (
      members: number[],
      spanX: number,
      spanW: number,
      y: number,
      out: Pos[],
    ): void => {
      const gw = members.length * tokW + (members.length - 1) * TOK_GAP;
      const x0 = spanX + (spanW - gw) / 2;
      members.forEach((i, j) => {
        out[i] = { x: x0 + j * (tokW + TOK_GAP), y };
      });
    };
    // 통 하나일 때는 ρ 별로 한 줄, 레인 가운데 정렬.
    for (const [rho, members] of rowsBy((k) => String(k.rho))) {
      spreadRow(members, LANE_X, LANE_W, rowY(Number(rho)), poolPos);
    }
    // 통 넷일 때는 통·ρ 별로 한 줄, 제 통 가운데 정렬.
    for (const [key, members] of rowsBy((k) => `${k.bucket}:${k.rho}`)) {
      const parts = key.split(':');
      spreadRow(members, binX(Number(parts[0])), binW, rowY(Number(parts[1])), binPos);
    }

    // ── 그리기
    const layerBins = el('g', {});
    const layerTokens = el('g', {});
    const layerGauge = el('g', {});
    svg.appendChild(layerBins);
    svg.appendChild(layerTokens);
    svg.appendChild(layerGauge);

    const wallAttrs = { stroke: c.border, 'stroke-width': 2, 'stroke-linecap': 'round' };
    layerBins.appendChild(
      el('line', { x1: LANE_X, y1: BIN_BASE, x2: LANE_X + LANE_W, y2: BIN_BASE, ...wallAttrs }),
    );
    layerBins.appendChild(
      el('line', { x1: LANE_X, y1: BIN_TOP, x2: LANE_X, y2: BIN_BASE, ...wallAttrs }),
    );
    layerBins.appendChild(
      el('line', {
        x1: LANE_X + LANE_W,
        y1: BIN_TOP,
        x2: LANE_X + LANE_W,
        y2: BIN_BASE,
        ...wallAttrs,
      }),
    );

    const walls: SVGLineElement[] = [];
    for (let b = 1; b < bucketCount; b += 1) {
      const wall = el('line', { x1: binX(b), y1: BIN_TOP, x2: binX(b), y2: BIN_TOP, ...wallAttrs });
      walls.push(wall);
      layerBins.appendChild(wall);
    }

    const bucketLabels: SVGTextElement[] = [];
    for (let b = 0; b < bucketCount; b += 1) {
      const label = el('text', {
        x: binX(b) + binW / 2,
        y: BUCKET_LABEL_Y,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        opacity: 0,
      });
      label.textContent = String(b);
      bucketLabels.push(label);
      layerBins.appendChild(label);
    }

    const levels: Level[] = [];
    for (let b = 0; b < bucketCount; b += 1) {
      const g = el('g', { opacity: 0 });
      const line = el('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        stroke: c.risingMarker,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'end',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      g.appendChild(line);
      g.appendChild(label);
      layerBins.appendChild(g);
      levels.push({ g, line, label });
    }
    const setLevel = (lv: Level, x1: number, x2: number, y: number, text: string): void => {
      lv.line.setAttribute('x1', String(r1(x1)));
      lv.line.setAttribute('x2', String(r1(x2)));
      lv.line.setAttribute('y1', String(r1(y)));
      lv.line.setAttribute('y2', String(r1(y)));
      lv.label.setAttribute('x', String(r1(x2 - 4)));
      lv.label.setAttribute('y', String(r1(y - 5)));
      lv.label.textContent = text;
    };

    const toks = keys.map((k, i) => {
      const g = el('g', {
        opacity: 0,
        transform: `translate(${r1(streamPos[i].x)},${STREAM_Y})`,
      });
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: tokW,
        height: TOK_H,
        rx: 4,
        fill: hueOf(k.bucket),
        stroke: c.bg,
        'stroke-width': 1,
      });
      const label = el('text', {
        x: tokW / 2,
        y: TOK_H / 2 + 4,
        'text-anchor': 'middle',
        // 고정 타일 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens).
        fill: c.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      label.textContent = String(k.rho);
      g.appendChild(rect);
      g.appendChild(label);
      layerTokens.appendChild(g);
      return { g, rect };
    });

    const truthLine = el('line', {
      x1: 0,
      y1: TRUTH_TOP,
      x2: 0,
      y2: TRUTH_BOT,
      stroke: c.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 4',
      opacity: 0,
    });
    const truthLabel = el('text', {
      x: 0,
      y: TRUTH_LABEL_Y,
      'text-anchor': 'middle',
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      opacity: 0,
    });
    layerGauge.appendChild(truthLine);
    layerGauge.appendChild(truthLabel);

    const chipW = (text: string): number => Math.max(30, 14 + text.length * 8);
    const makeChip = (fill: string, ink: string): Chip => {
      const g = el('g', { opacity: 0 });
      const rect = el('rect', {
        x: -15,
        y: -CHIP_H / 2,
        width: 30,
        height: CHIP_H,
        rx: 5,
        fill,
      });
      const text = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: ink,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      g.appendChild(rect);
      g.appendChild(text);
      layerGauge.appendChild(g);
      return { g, rect, text };
    };
    const moveChip = (chip: Chip, cx: number, cy: number): void => {
      chip.g.setAttribute('transform', `translate(${r1(cx)},${r1(cy)})`);
    };
    const setChip = (chip: Chip, text: string, cx: number, cy: number): void => {
      const w = chipW(text);
      chip.rect.setAttribute('x', String(-w / 2));
      chip.rect.setAttribute('width', String(w));
      chip.text.textContent = text;
      moveChip(chip, cx, cy);
    };

    // 통 하나의 답 — 참값에서 한참 벗어난 값이라 오류 신호로 읽힌다 (severity).
    const chipOne = makeChip(c.danger, c.stateInk);
    const bucketChips: Chip[] = [];
    for (let b = 0; b < bucketCount; b += 1) bucketChips.push(makeChip(hueOf(b), c.stateInk));
    // 모아서 얻은 값 — 이 화면의 단일 강조.
    const chipGathered = makeChip(c.accent, c.stateInk);

    const sideLabel = (): SVGTextElement => {
      const node = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'end',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        opacity: 0,
      });
      layerGauge.appendChild(node);
      return node;
    };
    const labelOne = sideLabel();
    const labelFour = sideLabel();

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    svg.appendChild(caption);
    const setCaption = (text: string): void => {
      caption.textContent = text;
    };

    // ── 시간. destroy 가 기다리던 promise 를 푼다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 장면 상태
    let oneRho = 1;
    let oneLevelY = BIN_TOP;
    let lastEstimates: number[] = [];

    const resetScene = (): void => {
      toks.forEach((tk, i) => {
        tk.g.setAttribute('transform', `translate(${r1(streamPos[i].x)},${STREAM_Y})`);
        tk.g.setAttribute('opacity', '0');
        tk.rect.setAttribute('stroke', c.bg);
        tk.rect.setAttribute('stroke-width', '1');
      });
      for (const wall of walls) wall.setAttribute('y2', String(BIN_TOP));
      for (const lv of levels) lv.g.setAttribute('opacity', '0');
      for (const bl of bucketLabels) bl.setAttribute('opacity', '0');
      truthLine.setAttribute('opacity', '0');
      truthLabel.setAttribute('opacity', '0');
      chipOne.g.setAttribute('opacity', '0');
      chipGathered.g.setAttribute('opacity', '0');
      for (const chip of bucketChips) chip.g.setAttribute('opacity', '0');
      labelOne.setAttribute('opacity', '0');
      labelFour.setAttribute('opacity', '0');
      lastEstimates = [];
      setCaption('');
    };
    resetScene();

    return {
      /** 키가 위에서 내려와 한 줄로 선다. */
      async showStream(captionText: string): Promise<void> {
        resetScene();
        setCaption(captionText);
        await tween(560, (p) => {
          toks.forEach((tk, i) => {
            const e = ease(stagger(p, i, toks.length, 0.55));
            const y = STREAM_Y - DROP_FROM * (1 - e);
            tk.g.setAttribute('transform', `translate(${r1(streamPos[i].x)},${r1(y)})`);
            tk.g.setAttribute('opacity', String(e));
          });
        });
      },

      /** 통 하나에 전부 담기고, 가장 큰 ρ 에 물금이 뻗는다. */
      async pourIntoOne(rho: number, captionText: string): Promise<void> {
        setCaption(captionText);
        oneRho = Math.max(1, rho);
        oneLevelY = levelY(oneRho);
        if (spikeIndex >= 0) {
          // 전체를 끌고 가는 그 한 칸.
          toks[spikeIndex].rect.setAttribute('stroke', c.danger);
          toks[spikeIndex].rect.setAttribute('stroke-width', '2');
        }
        await tween(760, (p) => {
          toks.forEach((tk, i) => {
            const e = ease(stagger(p, i, toks.length, 0.5));
            const from = streamPos[i];
            const to = poolPos[i];
            const x = from.x + (to.x - from.x) * e;
            const y = from.y + (to.y - from.y) * e;
            tk.g.setAttribute('transform', `translate(${r1(x)},${r1(y)})`);
          });
        });
        const lv = levels[spikeBucket];
        lv.g.setAttribute('opacity', '1');
        await tween(420, (p) => {
          setLevel(lv, LANE_X, LANE_X + LANE_W * ease(p), oneLevelY, `ρ ${oneRho}`);
        });
      },

      /** 통 하나의 답이 물금에서 떨어져 자 위에 앉는다. */
      async readSingle(estimate: number, truth: number, captionText: string): Promise<void> {
        setCaption(captionText);
        const truthX = gaugeX(truth);
        truthLine.setAttribute('x1', String(r1(truthX)));
        truthLine.setAttribute('x2', String(r1(truthX)));
        truthLabel.setAttribute('x', String(r1(truthX)));
        truthLabel.textContent = t('label.truth', 'True count: {n}', { n: numText(truth) });
        // 자는 배경이다 — 움직이는 것은 아래 칩이다.
        await tween(240, (p) => {
          truthLine.setAttribute('opacity', String(p));
          truthLabel.setAttribute('opacity', String(p));
        });

        const text = numText(estimate);
        const fromX = LANE_X + LANE_W - chipW(text) / 2;
        const toX = gaugeX(estimate);
        setChip(chipOne, text, fromX, oneLevelY);
        chipOne.g.setAttribute('opacity', '1');
        await tween(680, (p) => {
          const e = ease(p);
          moveChip(chipOne, fromX + (toX - fromX) * e, oneLevelY + (ROW_A_Y - oneLevelY) * e);
        });
        labelOne.setAttribute('x', String(r1(toX - chipW(text) / 2 - 8)));
        labelOne.setAttribute('y', String(ROW_A_Y + 4));
        labelOne.textContent = t('label.oneBucket', 'one bucket');
        await tween(200, (p) => labelOne.setAttribute('opacity', String(p)));
      },

      /** 벽이 내려오고, 키가 옆으로 미끄러져 제 통에 갇힌다. */
      async splitIntoBuckets(captionText: string): Promise<void> {
        setCaption(captionText);
        await tween(420, (p) => {
          const y = BIN_TOP + (BIN_BASE - BIN_TOP) * ease(p);
          for (const wall of walls) wall.setAttribute('y2', String(r1(y)));
          for (const bl of bucketLabels) bl.setAttribute('opacity', String(p));
        });

        const lv = levels[spikeBucket];
        const sx = binX(spikeBucket);
        await tween(720, (p) => {
          const e = ease(p);
          toks.forEach((tk, i) => {
            const from = poolPos[i];
            const to = binPos[i];
            const x = from.x + (to.x - from.x) * e;
            const y = from.y + (to.y - from.y) * e;
            tk.g.setAttribute('transform', `translate(${r1(x)},${r1(y)})`);
          });
          // 물금도 그 통 너비로 오그라든다 — 튐이 한 통에 갇히는 순간.
          const x1 = LANE_X + (sx - LANE_X) * e;
          const right = LANE_X + LANE_W;
          const x2 = right + (sx + binW - right) * e;
          setLevel(lv, x1, x2, oneLevelY, `ρ ${oneRho}`);
        });
      },

      /** 통마다 제 높이로 금이 서고, 제 답이 자 위로 떨어진다. */
      async settleBuckets(
        maxima: number[],
        estimates: number[],
        captionText: string,
      ): Promise<void> {
        setCaption(captionText);
        const rhoOf = (b: number): number => Math.max(1, maxima[b] ?? 1);

        await tween(520, (p) => {
          const e = ease(p);
          for (let b = 0; b < bucketCount; b += 1) {
            if (b === spikeBucket) continue;
            const y = levelY(rhoOf(b));
            levels[b].g.setAttribute('opacity', String(e));
            // 바닥에서 제 높이까지 솟는다.
            setLevel(levels[b], binX(b), binX(b) + binW, BIN_BASE - (BIN_BASE - y) * e, `ρ ${rhoOf(b)}`);
          }
        });

        const from: Pos[] = [];
        for (let b = 0; b < bucketCount; b += 1) {
          const value = estimates[b] ?? 0;
          const start = { x: binX(b) + binW / 2, y: levelY(rhoOf(b)) };
          from.push(start);
          setChip(bucketChips[b], numText(value), start.x, start.y);
          bucketChips[b].g.setAttribute('opacity', '1');
        }
        await tween(760, (p) => {
          for (let b = 0; b < bucketCount; b += 1) {
            const e = ease(stagger(p, b, bucketCount, 0.45));
            const toX = gaugeX(estimates[b] ?? 0);
            const start = from[b];
            moveChip(
              bucketChips[b],
              start.x + (toX - start.x) * e,
              start.y + (ROW_B_Y - start.y) * e,
            );
          }
        });
        lastEstimates = estimates.slice();
      },

      /** 넷이 눈금을 따라 서로에게 미끄러져 한 자리에 모인다. */
      async gatherReadings(estimate: number, captionText: string): Promise<void> {
        setCaption(captionText);
        const text = numText(estimate);
        const target = gaugeX(estimate);
        setChip(chipGathered, text, target, ROW_B_Y);
        chipGathered.g.setAttribute('opacity', '0');
        labelFour.setAttribute('x', String(r1(target - chipW(text) / 2 - 8)));
        labelFour.setAttribute('y', String(ROW_B_Y + 4));
        labelFour.textContent = t('label.fourBuckets', 'four buckets');

        await tween(880, (p) => {
          const e = ease(p);
          for (let b = 0; b < bucketCount; b += 1) {
            const start = gaugeX(lastEstimates[b] ?? estimate);
            moveChip(bucketChips[b], start + (target - start) * e, ROW_B_Y);
            bucketChips[b].g.setAttribute(
              'opacity',
              String(p < 0.7 ? 1 : clamp((1 - p) / 0.3, 0, 1)),
            );
          }
          const arrive = p < 0.55 ? 0 : clamp((p - 0.55) / 0.45, 0, 1);
          chipGathered.g.setAttribute('opacity', String(arrive));
          labelFour.setAttribute('opacity', String(p < 0.8 ? 0 : clamp((p - 0.8) / 0.2, 0, 1)));
        });
      },

      rewind(): void {
        resetScene();
      },

      reset(): void {
        resetScene();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
