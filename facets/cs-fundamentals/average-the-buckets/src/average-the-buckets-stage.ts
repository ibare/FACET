/**
 * average-the-buckets stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **갇히고 모인다**)
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
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 되짚기가 어긋나던 자리가 넷이었다.
 *
 * - `let oneRho` · `let oneLevelY` — 통 하나의 ρ 와 그 물금의 **세로 좌표**.
 *   `pourIntoOne` 이 적어 두고 `readSingle` 과 `splitIntoBuckets` 가 되읽었다.
 *   되감으면 앞 주행의 값이 남아 물금이 엉뚱한 높이에서 오그라들었다.
 * - `let lastEstimates` — 통별 추정값. `gatherReadings` 가 출발 자리를 여기서
 *   꺼냈다. 명령형으로 적어 둔 "`prev` 에서 출발값 꺼내기" 다.
 * - `Level.label` 의 `textContent` — `ρ N` 이라는 **수가 문자열에만** 있었다.
 *   같은 수가 `oneRho` 에도 있어 두 자리에서 말하는 꼴이었다.
 * - `toks[i].g` 의 `transform` — 그 칸이 스트림·통 하나·제 통 셋 중 **어디에
 *   서 있나**를 아는 곳이 화면뿐이었다. 걸음 함수가 `streamPos`→`poolPos`→`binPos`
 *   를 순서대로 밟는다는 전제를 깔고 있어 임의의 걸음으로 갈 수가 없었다.
 *
 * 이제 장면의 `phase` 하나가 그 넷을 말한다. 정적 그리기가 그 phase 의 화면을
 * 통째로 세우므로 되짚어 어느 걸음에 가도 같은 그림이 선다.
 *
 * ── 화면에 나란히 뜨는 수는 전부 `scene.ts` 의 함수를 지난다
 *
 * 통마다의 ρ, 통 하나의 답, 통별 답 넷, 모은 값, 참값 — 다섯이 한 화면에 함께
 * 뜨는 조각이라 출처가 갈리면 그림이 제 안에서 거짓이 된다. `maximaOf` ·
 * `spikeOf` · `estimateOf` · `estimatesOf` · `gatheredOf` · `truthOf` 가 그 한
 * 출처이고, 금의 높이와 칩의 문자와 캡션의 인자가 모두 거기서 나온다. 옮기기 전에는
 * algorithm 이 셈해 payload 로 실어 보냈고 소수 서식도 projector 와 stage 에 두 벌
 * 있었다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 걸음은 **아직 못 온 만큼을
 * 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 phase 가 정하므로 `prev` 를 들추지
 * 않는다 (S-scene). 한 뜻으로 묶인 운동은 **한 시계**로 돌린다 — 담기고 금이
 * 뻗는 것, 벽이 내려오고 키가 미끄러지는 것은 각각 한 걸음의 한 말이다. 운동이
 * 끝나면 장면을 통째로 다시 세워 보간이 남긴 끝자리와 `opacity` 를 노드째 지운다.
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
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  estimateOf,
  estimatesOf,
  gatheredOf,
  maximaOf,
  reached,
  spikeOf,
  truthOf,
  type AverageTheBucketsPhase,
  type AverageTheBucketsScene,
  type Spike,
} from './scene.js';

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

// ── 걸음마다의 운동 길이. 한 걸음 안의 마디들은 한 시계를 나눠 쓴다.
const STREAM_MS = 560;
const POUR_MS = 760;
const LEVEL_MS = 420;
const TRUTH_MS = 240;
const CHIP_MS = 680;
const SIDE_LABEL_MS = 200;
const WALL_MS = 420;
const SLIDE_MS = 720;
const RISE_MS = 520;
const SETTLE_MS = 760;
const GATHER_MS = 880;

/** 도형에 새겨진 표식 — 문안이 아니다 (C10). */
const RHO_MARK = 'ρ';

type Pos = { x: number; y: number };
type Tok = { g: SVGGElement; rect: SVGRectElement };
type Chip = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };
type Level = { g: SVGGElement; line: SVGLineElement; label: SVGTextElement };

/**
 * 정적 그리기가 셈한 자리와 수. 장면에는 좌표가 없으므로 매번 여기서 낸다
 * (S-piece). 걸음이 고치는 것이 하나도 없어 phase 와 무관하다.
 */
type Geom = {
  bucketCount: number;
  binW: number;
  binX: (b: number) => number;
  tokW: number;
  /** 그 ρ 에 물금이 그어지는 세로. ρ 0(빈 통)은 첫 줄 높이로 눌러 담는다. */
  markY: (rho: number) => number;
  gaugeX: (v: number) => number;
  hueOf: (b: number) => string;
  streamPos: Pos[];
  poolPos: Pos[];
  binPos: Pos[];
  spike: Spike;
  maxima: number[];
  estimates: number[];
  /** 통 하나가 내놓는 답. 튄 값 하나가 정한다. */
  single: number;
  /** 넷을 모은 값. 이 조각의 결론. */
  gathered: number;
  truth: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  toks: Tok[];
  /** 가운데 벽. 갈린 뒤에만 있다. */
  walls: SVGLineElement[];
  bucketLabels: SVGTextElement[];
  /** 통마다의 물금. 아직 서지 않은 통은 null. */
  levels: Array<Level | null>;
  truthLine: SVGLineElement | null;
  truthLabel: SVGTextElement | null;
  chipOne: Chip | null;
  labelOne: SVGTextElement | null;
  bucketChips: Array<Chip | null>;
  chipGathered: Chip | null;
  labelFour: SVGTextElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (p: number): number => clamp(p, 0, 1);
const r1 = (v: number): number => Math.round(v * 10) / 10;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** i 번째가 조금씩 늦게 출발한다. spread 는 전체 중 출발이 어긋나는 몫. */
function stagger(p: number, i: number, n: number, spread: number): number {
  if (n <= 1) return clamp01(p);
  const start = (i / (n - 1)) * spread;
  return clamp01((p - start) / (1 - spread));
}

/**
 * 화면에 적는 수 — 정수는 그대로, 아니면 소수 한 자리.
 *
 * 옮기기 전에는 이것과 같은 함수가 projector 에도 있었다. 조화평균만 소수라
 * 어느 한쪽만 고쳐도 눈에 안 띄는 자리였다 (S-scene 의 "한 함수를 지나야").
 */
const numText = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const averageTheBucketsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AverageTheBucketsScene> {
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gBins = el('g', {});
    const gTokens = el('g', {});
    const gGauge = el('g', {});
    const gCaption = el('g', {});
    svg.append(gBins, gTokens, gGauge, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 타이머를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 tick 이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function tween(ms: number, mine: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 tick 이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : clamp01((now() - started) / ms);
          apply(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    /**
     * 그 장면의 자리와 수를 한 번에 셈한다.
     *
     * **그리기 전에 전부 낸다.** 그리면서 이웃의 지금 좌표를 되읽으면 순회 순서가
     * 곧 숨은 상태가 된다 (S-scene).
     */
    function geomOf(scene: AverageTheBucketsScene): Geom {
      const keys = scene.keys;
      const bucketCount = Math.max(1, scene.bucketCount);
      const n = keys.length;

      const spike = spikeOf(keys);
      const maxima = maximaOf(keys, bucketCount);
      const estimates = estimatesOf(maxima);

      // 색판의 씨앗은 **바탕이 정한 통 수**다. 걸음마다 자라는 셈을 쓰면 통이 하나
      // 더 드러날 때 이미 칠한 통의 색이 바뀐다 (S-scene).
      const hues = categorical(bucketCount, 'vivid');
      const hueOf = (b: number): string => hues[b % hues.length];

      // 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
      const binW = LANE_W / bucketCount;
      const binX = (b: number): number => LANE_X + b * binW;

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
      const topRho = Math.max(1, spike.rho);
      const rowH = Math.min(
        ROW_MAX_H,
        Math.floor((BIN_BASE - BIN_TOP - TOK_H - 6) / Math.max(1, topRho - 1)),
      );
      const rowY = (rho: number): number => BIN_BASE - 3 - TOK_H - (rho - 1) * rowH;
      // 금은 그 줄의 칸 윗변보다 조금 위. ρ 0 은 그릴 줄이 없어 첫 줄로 누른다.
      const markY = (rho: number): number => rowY(Math.max(1, rho)) - 4;

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

      const rowsBy = (idOf: (i: number) => string): Map<string, number[]> => {
        const m = new Map<string, number[]>();
        keys.forEach((_, i) => {
          const id = idOf(i);
          const arr = m.get(id) ?? [];
          arr.push(i);
          m.set(id, arr);
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
      for (const [rho, members] of rowsBy((i) => String(keys[i].rho))) {
        spreadRow(members, LANE_X, LANE_W, rowY(Number(rho)), poolPos);
      }
      // 통 넷일 때는 통·ρ 별로 한 줄, 제 통 가운데 정렬.
      for (const [id, members] of rowsBy((i) => `${keys[i].bucket}:${keys[i].rho}`)) {
        const parts = id.split(':');
        spreadRow(members, binX(Number(parts[0])), binW, rowY(Number(parts[1])), binPos);
      }

      return {
        bucketCount,
        binW,
        binX,
        tokW,
        markY,
        gaugeX,
        hueOf,
        streamPos,
        poolPos,
        binPos,
        spike,
        maxima,
        estimates,
        single: estimateOf(spike.rho),
        gathered: gatheredOf(maxima),
        truth: truthOf(keys),
      };
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 무엇을 말할지는 phase 가 정하고 수는 `geom` 이 낸다 — 캡션이 제 수를 따로
     * 들고 있으면 화면의 금·칩과 갈릴 자리가 생긴다.
     */
    function captionFor(phase: AverageTheBucketsPhase, geom: Geom): string {
      switch (phase) {
        case 'empty':
          return '';
        case 'streamed':
          return t('caption.stream', 'Every key brings one run length. Keys: {n}.', {
            n: geom.truth,
          });
        case 'poured':
          return t('caption.pour', 'One counter keeps only the largest: {n}.', {
            n: geom.spike.rho,
          });
        case 'read':
          return t('caption.readSingle', 'One counter answers {est}, but the truth is {truth}.', {
            est: numText(geom.single),
            truth: numText(geom.truth),
          });
        case 'split':
          return t('caption.split', 'Split into four. Each key is trapped in its own bucket.');
        case 'settled':
          // 통 넷을 전제한 문형이다 — 이 조각의 주장 자체가 넷으로 나누는 일이다.
          return t('caption.settle', 'Alone, each bucket answers {a} · {b} · {c} · {d}.', {
            a: numText(geom.estimates[0] ?? 0),
            b: numText(geom.estimates[1] ?? 0),
            c: numText(geom.estimates[2] ?? 0),
            d: numText(geom.estimates[3] ?? 0),
          });
        case 'gathered':
          return t('caption.gather', 'The four gather into {est}. Truth: {truth}.', {
            est: numText(geom.gathered),
            truth: numText(geom.truth),
          });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gBins, gTokens, gGauge, gCaption]) g.textContent = '';
    }

    const chipW = (text: string): number => Math.max(30, 14 + text.length * 8);

    function makeChip(fill: string, ink: string): Chip {
      const g = el('g', {});
      const rect = el('rect', { x: -15, y: -CHIP_H / 2, width: 30, height: CHIP_H, rx: 5, fill });
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
      gGauge.appendChild(g);
      return { g, rect, text };
    }

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

    function makeLevel(): Level {
      const g = el('g', {});
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
      gBins.appendChild(g);
      return { g, line, label };
    }

    function setLevel(lv: Level, x1: number, x2: number, y: number, text: string): void {
      lv.line.setAttribute('x1', String(r1(x1)));
      lv.line.setAttribute('x2', String(r1(x2)));
      lv.line.setAttribute('y1', String(r1(y)));
      lv.line.setAttribute('y2', String(r1(y)));
      lv.label.setAttribute('x', String(r1(x2 - 4)));
      lv.label.setAttribute('y', String(r1(y - 5)));
      lv.label.textContent = text;
    }

    function sideLabel(text: string, rightOf: number, y: number): SVGTextElement {
      const node = el('text', {
        x: r1(rightOf),
        y: r1(y),
        'text-anchor': 'end',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      node.textContent = text;
      gGauge.appendChild(node);
      return node;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: AverageTheBucketsScene, geom: Geom): Drawn {
      rewind();

      const phase = scene.phase;
      const { bucketCount, binW, binX, tokW, spike, maxima, estimates, markY, gaugeX } = geom;

      // ── 통. 바닥과 양끝 벽은 처음부터 끝까지 서 있다.
      const wallAttrs = { stroke: c.border, 'stroke-width': 2, 'stroke-linecap': 'round' };
      gBins.appendChild(
        el('line', { x1: LANE_X, y1: BIN_BASE, x2: LANE_X + LANE_W, y2: BIN_BASE, ...wallAttrs }),
      );
      gBins.appendChild(
        el('line', { x1: LANE_X, y1: BIN_TOP, x2: LANE_X, y2: BIN_BASE, ...wallAttrs }),
      );
      gBins.appendChild(
        el('line', {
          x1: LANE_X + LANE_W,
          y1: BIN_TOP,
          x2: LANE_X + LANE_W,
          y2: BIN_BASE,
          ...wallAttrs,
        }),
      );

      // 가운데 벽과 통 번호는 갈린 뒤에만 **아예 지어진다** — 숨기기만 하면 앞
      // 걸음의 `y2` 가 남아 되짚기 판정에서 어긋난다 (S-scene).
      const walls: SVGLineElement[] = [];
      const bucketLabels: SVGTextElement[] = [];
      if (reached(phase, 'split')) {
        for (let b = 1; b < bucketCount; b += 1) {
          const wall = el('line', {
            x1: r1(binX(b)),
            y1: BIN_TOP,
            x2: r1(binX(b)),
            y2: BIN_BASE,
            ...wallAttrs,
          });
          walls.push(wall);
          gBins.appendChild(wall);
        }
        for (let b = 0; b < bucketCount; b += 1) {
          const label = el('text', {
            x: r1(binX(b) + binW / 2),
            y: BUCKET_LABEL_Y,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
          label.textContent = String(b);
          bucketLabels.push(label);
          gBins.appendChild(label);
        }
      }

      // ── 물금. 담긴 뒤에는 튄 통 하나에만 서고, 갈려 가라앉은 뒤에는 통마다 선다.
      const levels: Array<Level | null> = [];
      for (let b = 0; b < bucketCount; b += 1) levels.push(null);
      const levelText = (rho: number): string => `${RHO_MARK} ${rho}`;
      if (reached(phase, 'settled')) {
        for (let b = 0; b < bucketCount; b += 1) {
          const lv = makeLevel();
          setLevel(lv, binX(b), binX(b) + binW, markY(maxima[b]), levelText(maxima[b]));
          levels[b] = lv;
        }
      } else if (reached(phase, 'poured') && spike.index >= 0) {
        const lv = makeLevel();
        const narrow = reached(phase, 'split');
        const x1 = narrow ? binX(spike.bucket) : LANE_X;
        const x2 = narrow ? binX(spike.bucket) + binW : LANE_X + LANE_W;
        setLevel(lv, x1, x2, markY(spike.rho), levelText(spike.rho));
        levels[spike.bucket] = lv;
      }

      // ── 키 칸. 어느 배치에 서 있나를 phase 가 말한다.
      const toks: Tok[] = [];
      if (reached(phase, 'streamed')) {
        const seat = reached(phase, 'split')
          ? geom.binPos
          : reached(phase, 'poured')
            ? geom.poolPos
            : geom.streamPos;
        // 튄 칸의 테두리는 **견줌의 표식**이라 담긴 뒤로 끝까지 남는다. 채움은
        // 그 칸이 어느 통의 것인가를 말한다 — 둘을 갈라 두면 부딪히지 않는다.
        const marked = reached(phase, 'poured');
        scene.keys.forEach((k, i) => {
          const at = seat[i];
          const g = el('g', { transform: `translate(${r1(at.x)},${r1(at.y)})` });
          const rect = el('rect', {
            x: 0,
            y: 0,
            width: tokW,
            height: TOK_H,
            rx: 4,
            fill: geom.hueOf(k.bucket),
            stroke: marked && i === spike.index ? c.danger : c.bg,
            'stroke-width': marked && i === spike.index ? 2 : 1,
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
          gTokens.appendChild(g);
          toks.push({ g, rect });
        });
      }

      // ── 자. 참값 금은 통 하나의 답을 읽은 순간부터 선다.
      let truthLine: SVGLineElement | null = null;
      let truthLabel: SVGTextElement | null = null;
      let chipOne: Chip | null = null;
      let labelOne: SVGTextElement | null = null;
      if (reached(phase, 'read')) {
        const truthX = gaugeX(geom.truth);
        truthLine = el('line', {
          x1: r1(truthX),
          y1: TRUTH_TOP,
          x2: r1(truthX),
          y2: TRUTH_BOT,
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        });
        truthLabel = el('text', {
          x: r1(truthX),
          y: TRUTH_LABEL_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        truthLabel.textContent = t('label.truth', 'True count: {n}', {
          n: numText(geom.truth),
        });
        gGauge.appendChild(truthLine);
        gGauge.appendChild(truthLabel);

        // 통 하나의 답 — 참값에서 한참 벗어난 값이라 오류 신호로 읽힌다 (severity).
        const oneText = numText(geom.single);
        const oneX = gaugeX(geom.single);
        chipOne = makeChip(c.danger, c.stateInk);
        setChip(chipOne, oneText, oneX, ROW_A_Y);
        labelOne = sideLabel(
          t('label.oneBucket', 'one bucket'),
          oneX - chipW(oneText) / 2 - 8,
          ROW_A_Y + 4,
        );
      }

      // 통별 답 넷. 모이는 걸음에서는 한 자리로 합쳐지므로 더는 서 있지 않는다.
      const bucketChips: Array<Chip | null> = [];
      for (let b = 0; b < bucketCount; b += 1) bucketChips.push(null);
      if (phase === 'settled') {
        for (let b = 0; b < bucketCount; b += 1) {
          const chip = makeChip(geom.hueOf(b), c.stateInk);
          const value = estimates[b] ?? 0;
          setChip(chip, numText(value), gaugeX(value), ROW_B_Y);
          bucketChips[b] = chip;
        }
      }

      // 모아서 얻은 값 — 이 화면의 단일 강조.
      let chipGathered: Chip | null = null;
      let labelFour: SVGTextElement | null = null;
      if (phase === 'gathered') {
        const text = numText(geom.gathered);
        const x = gaugeX(geom.gathered);
        chipGathered = makeChip(c.accent, c.stateInk);
        setChip(chipGathered, text, x, ROW_B_Y);
        labelFour = sideLabel(
          t('label.fourBuckets', 'four buckets'),
          x - chipW(text) / 2 - 8,
          ROW_B_Y + 4,
        );
      }

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      caption.textContent = captionFor(phase, geom);
      gCaption.appendChild(caption);

      return {
        toks,
        walls,
        bucketLabels,
        levels,
        truthLine,
        truthLabel,
        chipOne,
        labelOne,
        bucketChips,
        chipGathered,
        labelFour,
      };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 phase 가 정한다.

    const place = (tok: Tok, x: number, y: number): void => {
      tok.g.setAttribute('transform', `translate(${r1(x)},${r1(y)})`);
    };

    /** 키가 위에서 내려와 한 줄로 선다. */
    function flowStream(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const n = drawn.toks.length;
      if (n === 0) return Promise.resolve();
      return tween(STREAM_MS, mine, (p) => {
        drawn.toks.forEach((tk, i) => {
          const e = ease(stagger(p, i, n, 0.55));
          place(tk, geom.streamPos[i].x, STREAM_Y - DROP_FROM * (1 - e));
          tk.g.setAttribute('opacity', String(e));
        });
      });
    }

    /**
     * 통 하나에 전부 담기고, 가장 큰 ρ 에 물금이 뻗는다.
     *
     * 담기는 것과 금이 뻗는 것은 한 걸음의 한 말이라 **한 시계**를 나눠 쓴다
     * (S-scene). 마디마다 `await` 를 두면 그 틈으로 되짚기가 끼어들 자리가 늘고
     * 뒷마디가 깨어나 새로 선 화면을 덮는다.
     */
    function flowPour(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const n = drawn.toks.length;
      const lv = drawn.levels[geom.spike.bucket];
      const y = geom.markY(geom.spike.rho);
      const text = `${RHO_MARK} ${geom.spike.rho}`;
      const total = POUR_MS + LEVEL_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const pour = clamp01(ms / POUR_MS);
        drawn.toks.forEach((tk, i) => {
          const e = ease(stagger(pour, i, n, 0.5));
          const from = geom.streamPos[i];
          const to = geom.poolPos[i];
          place(tk, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        });
        if (lv === null) return;
        const grow = clamp01((ms - POUR_MS) / LEVEL_MS);
        lv.g.setAttribute('opacity', grow > 0 ? '1' : '0');
        setLevel(lv, LANE_X, LANE_X + LANE_W * ease(grow), y, text);
      });
    }

    /**
     * 자가 뜨고, 통 하나의 답이 물금에서 떨어져 자 위에 앉는다.
     *
     * 자는 배경이다 — 움직이는 것은 칩이다.
     */
    function flowRead(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const chip = drawn.chipOne;
      if (chip === null) return Promise.resolve();
      const text = numText(geom.single);
      const fromX = LANE_X + LANE_W - chipW(text) / 2;
      const fromY = geom.markY(geom.spike.rho);
      const toX = geom.gaugeX(geom.single);
      const total = TRUTH_MS + CHIP_MS + SIDE_LABEL_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const rise = clamp01(ms / TRUTH_MS);
        drawn.truthLine?.setAttribute('opacity', String(rise));
        drawn.truthLabel?.setAttribute('opacity', String(rise));

        const slide = clamp01((ms - TRUTH_MS) / CHIP_MS);
        chip.g.setAttribute('opacity', rise >= 1 ? '1' : '0');
        const e = ease(slide);
        moveChip(chip, fromX + (toX - fromX) * e, fromY + (ROW_A_Y - fromY) * e);

        const tail = clamp01((ms - TRUTH_MS - CHIP_MS) / SIDE_LABEL_MS);
        drawn.labelOne?.setAttribute('opacity', String(tail));
      });
    }

    /**
     * 벽이 내려오고, 키가 옆으로 미끄러져 제 통에 갇힌다.
     *
     * 물금도 그 통 너비로 오그라든다 — 튐이 한 통에 갇히는 순간이라 벽·칸·금이
     * 한 뜻이고, 그래서 한 시계로 돌린다 (S-scene).
     */
    function flowSplit(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const lv = drawn.levels[geom.spike.bucket];
      const y = geom.markY(geom.spike.rho);
      const text = `${RHO_MARK} ${geom.spike.rho}`;
      const sx = geom.binX(geom.spike.bucket);
      const right = LANE_X + LANE_W;
      const total = WALL_MS + SLIDE_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const drop = clamp01(ms / WALL_MS);
        const wallY = BIN_TOP + (BIN_BASE - BIN_TOP) * ease(drop);
        for (const wall of drawn.walls) wall.setAttribute('y2', String(r1(wallY)));
        for (const bl of drawn.bucketLabels) bl.setAttribute('opacity', String(drop));

        const slide = clamp01((ms - WALL_MS) / SLIDE_MS);
        const e = ease(slide);
        drawn.toks.forEach((tk, i) => {
          const from = geom.poolPos[i];
          const to = geom.binPos[i];
          place(tk, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        });
        if (lv === null) return;
        setLevel(lv, LANE_X + (sx - LANE_X) * e, right + (sx + geom.binW - right) * e, y, text);
      });
    }

    /**
     * 통마다 제 높이로 금이 서고, 제 답이 자 위로 떨어진다.
     *
     * 금이 솟는 것과 칩이 내려앉는 것이 한 말이다 — **여러 통에 값이 나뉘어 담긴
     * 결과**를 한 화면에서 보여야 하므로 시계를 나누지 않고 옮길 것을 한 목록에
     * 모은다 (S-scene).
     */
    function flowSettle(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const { bucketCount, binX, binW, maxima, estimates, markY, gaugeX, spike } = geom;
      const total = RISE_MS + SETTLE_MS;
      // 옮길 것을 먼저 한 목록에 모은다. 출발 자리는 제 통 안의 금 위다.
      const moves: Array<{ chip: Chip; fromX: number; fromY: number; toX: number; slot: number }> =
        [];
      for (let b = 0; b < bucketCount; b += 1) {
        const chip = drawn.bucketChips[b];
        if (chip === null) continue;
        moves.push({
          chip,
          fromX: binX(b) + binW / 2,
          fromY: markY(maxima[b]),
          toX: gaugeX(estimates[b] ?? 0),
          slot: b,
        });
      }
      return tween(total, mine, (p) => {
        const ms = p * total;
        const rise = ease(clamp01(ms / RISE_MS));
        for (let b = 0; b < bucketCount; b += 1) {
          const lv = drawn.levels[b];
          if (lv === null) continue;
          // 튄 통의 금은 앞 걸음에서 이미 서 있었다 — 다시 솟게 하면 걸음의 말이
          // 흐려진다. 나머지 셋만 바닥에서 제 높이까지 솟는다.
          if (b === spike.bucket) continue;
          const y = markY(maxima[b]);
          lv.g.setAttribute('opacity', String(rise));
          setLevel(lv, binX(b), binX(b) + binW, BIN_BASE - (BIN_BASE - y) * rise, `${RHO_MARK} ${maxima[b]}`);
        }

        const fall = clamp01((ms - RISE_MS) / SETTLE_MS);
        for (const m of moves) {
          const e = ease(stagger(fall, m.slot, bucketCount, 0.45));
          m.chip.g.setAttribute('opacity', rise >= 1 ? '1' : '0');
          moveChip(m.chip, m.fromX + (m.toX - m.fromX) * e, m.fromY + (ROW_B_Y - m.fromY) * e);
        }
      });
    }

    /**
     * 넷이 눈금을 따라 서로에게 미끄러져 한 자리에 모인다.
     *
     * 모이는 통 칩은 **지나가는 것**이라 정적 그리기가 세우지 않는다. 여기서 임시로
     * 짓고, 운동이 끝난 뒤의 재건에서 노드째 사라진다. 되짚어 이 걸음에 오면
     * 모인 칩 하나만 선다 — 그것이 이 걸음이 말하는 것이다.
     */
    function flowGather(geom: Geom, drawn: Drawn, mine: number): Promise<void> {
      const target = geom.gaugeX(geom.gathered);
      const moving: Array<{ chip: Chip; from: number }> = [];
      for (let b = 0; b < geom.bucketCount; b += 1) {
        const value = geom.estimates[b] ?? 0;
        const chip = makeChip(geom.hueOf(b), c.stateInk);
        const from = geom.gaugeX(value);
        setChip(chip, numText(value), from, ROW_B_Y);
        moving.push({ chip, from });
      }
      return tween(GATHER_MS, mine, (p) => {
        const e = ease(p);
        for (const m of moving) {
          moveChip(m.chip, m.from + (target - m.from) * e, ROW_B_Y);
          m.chip.g.setAttribute('opacity', String(p < 0.7 ? 1 : clamp01((1 - p) / 0.3)));
        }
        const arrive = p < 0.55 ? 0 : clamp01((p - 0.55) / 0.45);
        drawn.chipGathered?.g.setAttribute('opacity', String(arrive));
        drawn.labelFour?.setAttribute(
          'opacity',
          String(p < 0.8 ? 0 : clamp01((p - 0.8) / 0.2)),
        );
      });
    }

    /**
     * 그 걸음에 흐를 것.
     *
     * phase 가 곧 걸음이다 — 되돌아가는 걸음도 갈래도 없어 "방금 들어선 phase" 하나로
     * 무엇을 흐르게 할지 정해진다 (`scene.ts`).
     */
    function flowFor(
      phase: AverageTheBucketsPhase,
      geom: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (phase) {
        case 'empty':
          // 되감은 자리. 빈 통만 서 있고 흐를 것이 없다.
          return Promise.resolve();
        case 'streamed':
          return flowStream(geom, drawn, mine);
        case 'poured':
          return flowPour(geom, drawn, mine);
        case 'read':
          return flowRead(geom, drawn, mine);
        case 'split':
          return flowSplit(geom, drawn, mine);
        case 'settled':
          return flowSettle(geom, drawn, mine);
        case 'gathered':
          return flowGather(geom, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: AverageTheBucketsScene,
      _prev: AverageTheBucketsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const geom = geomOf(next);
      const drawn = drawStatic(next, geom);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next.phase, geom, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라지고, 모이던 임시 칩도
      // 함께 사라진다. 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next, geom);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
