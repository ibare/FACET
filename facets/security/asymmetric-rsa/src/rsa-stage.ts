/**
 * rsa-stage View — RSA 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 다음을 모두 담는다:
 *   - 상단 캡션 (개념 한 줄 + 사건 메시지)
 *   - 키 생성 시퀀스 영역 (좌→우: 두 소수 → 합성수 n → 자물쇠+열쇠 출생)
 *   - 외부 관찰자 영역 (어두운 띠 — 공개된 n 카드 + 막힌 인수분해 점선 화살표)
 *   - Alice 영역 (평문 m + 자물쇠 사본)
 *   - 채널 (잠긴 봉투 c + 잠금/풀림 사건 스냅샷)
 *   - Bob 영역 — 공개 마당 (위) + 비밀 방 (아래) 색·배경 분리
 *   - 사건별 캡션 + 참고 레퍼런스 칩
 *
 * 시각적 정체성 (기획 §5):
 *   1. 출생 시퀀스 — 키 짝의 인과 사슬을 운동의 차례로 보여준다.
 *   2. 공개 마당 vs 비밀 방 — 권한 영역의 색·배경 분리.
 *   3. 두 키 형태 비대칭 — 자물쇠는 사각 + ㄷ 자 빗장, 열쇠는 가는 막대 + 톱니.
 *   4. 잠금/풀림 한 프레임 사건성 — 채널 양 끝의 두 키 스냅샷.
 *   5. 인수분해 막힘 — 굵은 점선 화살표가 빨간 격벽에 부딪혀 끊어짐.
 *   6. 거꾸로 시도 거부 — 빨간 좌우 흔들림 + 빨간 X.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 자물쇠 청록 — categorical(8, 'vivid')[3]
 *   - 열쇠 자주 — categorical(8, 'vivid')[6]
 *   - 평문 m 노랑 — palette.accent
 *   - 거부/막힘 빨강 — palette.danger
 *   - 봉투 옅은 회백 — palette.bgSubtle
 *   - 공개 마당 베이지 — categorical(8, 'pastel')[0]
 *   - 비밀 방 짙은 남색 — categorical(8, 'deep')[4]
 *   - 외부 관찰자 어두운 회색 — palette.textMuted (배경 fill 알파)
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ──────────────────────────────────────────────────────────────
const W = 720;
const H = 580;

// ── 영역 좌표 ───────────────────────────────────────────────────────────
const TITLE_Y = 22;
const CONCEPT_Y0 = 42;
const CONCEPT_LINE_H = 16;

// 키 생성 시퀀스 영역.
const KEYGEN_Y = 124;
const KEYGEN_H = 70;

// 외부 관찰자 영역.
const OBS_Y = KEYGEN_Y + KEYGEN_H + 12;
const OBS_H = 44;

// 본체.
const BODY_Y = OBS_Y + OBS_H + 12;
const BODY_H = 220;

// Alice / 채널 / Bob 컬럼.
const ALICE_X = 8;
const ALICE_W = 168;
const CHANNEL_X = ALICE_X + ALICE_W + 8;
const CHANNEL_W = 296;
const BOB_X = CHANNEL_X + CHANNEL_W + 8;
const BOB_W = W - BOB_X - 8;

// Bob 두 층.
const BOB_PUBLIC_Y = BODY_Y;
const BOB_PUBLIC_H = 110;
const BOB_SECRET_Y = BOB_PUBLIC_Y + BOB_PUBLIC_H;
const BOB_SECRET_H = BODY_H - BOB_PUBLIC_H;

// 채널 봉투 좌·우 끝.
const ENVELOPE_TRACK_Y = BODY_Y + BODY_H / 2 + 4;
const ENVELOPE_X0 = CHANNEL_X + 28;
const ENVELOPE_X1 = CHANNEL_X + CHANNEL_W - 36;

// 잠금/풀림 스냅샷 (채널 양 끝 위쪽).
const SNAPSHOT_Y = BODY_Y + 30;

// 사건 캡션.
const EVENT_CAPTION_Y = BODY_Y + BODY_H + 18;

// 참고 칩.
const CHIP_Y0 = H - 50;
const CHIP_Y1 = H - 14;

// ── 운동 시간 ───────────────────────────────────────────────────────────
const CAPTION_DUR = 1800;

type Refs = { name: string; url: string };

const REFERENCES: Refs[] = [
  { name: 'Wikibooks — Public Key Overview', url: 'https://en.wikibooks.org/wiki/Cryptography/Public_Key_Overview' },
  { name: 'Khan Academy — RSA encryption', url: 'https://www.khanacademy.org/computing/computer-science/cryptography/modern-crypt/v/intro-to-rsa-encryption' },
  { name: 'CrypTool — RSA visual', url: 'https://legacy.cryptool.org/en/cto/rsa-visual' },
  { name: 'Computerphile — Public Key', url: 'https://www.youtube.com/watch?v=GSIDS_lvRv4' },
];

const CONCEPT_TEXT = [
  'RSA 는 두 큰 소수에서 태어난 한 짝의 키로',
  '메시지를 잠그고 푼다. 누구나 가진 공개 자물',
  '쇠로는 잠그기만 할 수 있고, 주인만 가진',
  '비밀 열쇠로만 풀 수 있다.',
];

// ── SVG 헬퍼 ────────────────────────────────────────────────────────────

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function makeText(parent: SVGElement, attrs: Record<string, string | number>, text = ''): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  setAttrs(el, attrs);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function makeRect(parent: SVGElement, attrs: Record<string, string | number>): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makePath(parent: SVGElement, attrs: Record<string, string | number>): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeCircle(parent: SVGElement, attrs: Record<string, string | number>): SVGCircleElement {
  const el = document.createElementNS(SVG_NS, 'circle');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeLine(parent: SVGElement, attrs: Record<string, string | number>): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeGroup(parent: SVGElement, attrs: Record<string, string | number> = {}): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

/** 자물쇠 path — 위로 솟은 ㄷ 자 빗장. (cx, cy) 가 몸체 중심. */
function lockShackleD(cx: number, cy: number, scale = 1, openHeight = 0): string {
  const h = 18 * scale;
  const sx = cx;
  const sy = cy - h / 2 - 2 - openHeight;
  const r = 7 * scale;
  // ㄷ 자: 좌하 → 좌상 호 → 우상 호 → 우하.
  return (
    `M${sx - r},${sy} ` +
    `L${sx - r},${sy - r} ` +
    `A${r},${r} 0 0 1 ${sx + r},${sy - r} ` +
    `L${sx + r},${sy} `
  );
}

// ── 타입 ────────────────────────────────────────────────────────────────

type LockRec = {
  group: SVGGElement;
  bodyEl: SVGRectElement;
  shackleEl: SVGPathElement;
  /** 구멍 (자주 열쇠가 들어갈 자리). */
  keyholeEl: SVGCircleElement;
  /** 빗장이 들렸을 때 보이는 빈 자리 표시. */
  openHintEl: SVGPathElement;
};

type KeyRec = {
  group: SVGGElement;
  bodyEl: SVGPathElement;
  toothEl: SVGPathElement;
};

// ── View ────────────────────────────────────────────────────────────────

export const rsaStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const cat = categorical(8, 'vivid');
    const catDeep = categorical(8, 'deep');
    const catPastel = categorical(8, 'pastel');
    const LOCK_TONE = cat[3]!;       // 청록
    const KEY_TONE = cat[6]!;        // 자주
    const PLAIN_TONE = palette.accent; // 노랑 (평문 m)
    const SECRET_BG = catDeep[4]!;    // 짙은 남색
    const PUBLIC_BG = catPastel[0]!;  // 옅은 베이지
    const OBS_BG = palette.textMuted; // 어두운 회색 (alpha 로)
    const DANGER = palette.danger;

    container.innerHTML = '';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.maxWidth = '720px';
    svg.style.height = 'auto';
    svg.style.fontFamily = fonts.body;
    svg.style.userSelect = 'none';
    container.appendChild(svg);

    // ── defs (점선 격벽 화살표 마커 + 빗장 패턴) ──────────────────────
    const defs = document.createElementNS(SVG_NS, 'defs');

    const arrow = document.createElementNS(SVG_NS, 'marker');
    setAttrs(arrow, {
      id: 'rsa-arrow',
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 8,
      markerHeight: 8,
      orient: 'auto-start-reverse',
    });
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(arrowPath, { d: 'M0,1 L9,5 L0,9 Z', fill: palette.text });
    arrow.appendChild(arrowPath);
    defs.appendChild(arrow);

    const lightArrow = document.createElementNS(SVG_NS, 'marker');
    setAttrs(lightArrow, {
      id: 'rsa-arrow-light',
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto-start-reverse',
    });
    const lightArrowPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(lightArrowPath, { d: 'M0,1 L9,5 L0,9 Z', fill: palette.textMuted });
    lightArrow.appendChild(lightArrowPath);
    defs.appendChild(lightArrow);

    svg.appendChild(defs);

    // ── 레이어 ────────────────────────────────────────────────────────
    const bgLayer = makeGroup(svg);
    const obsLayer = makeGroup(svg);
    const keygenLayer = makeGroup(svg);
    const channelLayer = makeGroup(svg);
    const aliceLayer = makeGroup(svg);
    const bobLayer = makeGroup(svg);
    const overlayLayer = makeGroup(svg);
    const captionLayer = makeGroup(svg);
    const chipLayer = makeGroup(svg);

    // ── 상단 제목 + 개념 캡션 ────────────────────────────────────────
    makeText(
      captionLayer,
      {
        x: 12,
        y: TITLE_Y,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: palette.text,
      },
      'RSA — 한 짝의 비대칭 키',
    );

    CONCEPT_TEXT.forEach((line, i) => {
      makeText(
        captionLayer,
        {
          x: 12,
          y: CONCEPT_Y0 + i * CONCEPT_LINE_H,
          'font-size': fontSizes.sm,
          fill: palette.textMuted,
        },
        line,
      );
    });

    // 우상단 — 현재 파라미터 요약 (p, q, n, e, d).
    const paramSummaryEl = makeText(
      captionLayer,
      {
        x: W - 12,
        y: TITLE_Y,
        'font-size': fontSizes.sm,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        fill: palette.text,
      },
      '',
    );

    // ── 키 생성 시퀀스 영역 ─────────────────────────────────────────
    makeRect(bgLayer, {
      x: 0,
      y: KEYGEN_Y - 8,
      width: W,
      height: KEYGEN_H + 8,
      fill: palette.bgSubtle,
      opacity: 0.5,
    });
    makeText(
      keygenLayer,
      {
        x: 12,
        y: KEYGEN_Y + 4,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        'letter-spacing': '0.04em',
        fill: palette.textMuted,
      },
      '키 생성 시퀀스',
    );

    // 좌측: p, q 두 카드.
    const PRIME_W = 60;
    const PRIME_H = 38;
    const KEYGEN_ROW_Y = KEYGEN_Y + 32;
    const PRIME_P_X = 32;
    const PRIME_Q_X = 100;
    const PRODUCT_X = 240;
    const PRODUCT_W = 80;
    const PRODUCT_H = 44;
    const KEYBORN_X = 420;
    const LOCK_BORN_X = KEYBORN_X;
    const KEY_BORN_X = KEYBORN_X + 80;

    function buildPrimeCard(cx: number, label: string): {
      group: SVGGElement;
      valueEl: SVGTextElement;
    } {
      const g = makeGroup(keygenLayer, { opacity: 0 });
      makeRect(g, {
        x: cx - PRIME_W / 2,
        y: KEYGEN_ROW_Y - PRIME_H / 2,
        width: PRIME_W,
        height: PRIME_H,
        rx: 6,
        ry: 6,
        fill: palette.bg,
        stroke: palette.text,
        'stroke-width': 1.6,
      });
      makeText(
        g,
        {
          x: cx,
          y: KEYGEN_ROW_Y - 6,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: palette.textMuted,
        },
        label,
      );
      const valueEl = makeText(
        g,
        {
          x: cx,
          y: KEYGEN_ROW_Y + 10,
          'font-size': fontSizes.md,
          'font-weight': 700,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          fill: palette.text,
        },
        '',
      );
      return { group: g, valueEl };
    }

    const primePCard = buildPrimeCard(PRIME_P_X, 'p (소수)');
    const primeQCard = buildPrimeCard(PRIME_Q_X, 'q (소수)');

    // p·q → n 가벼운 화살표.
    const multArrow = makePath(keygenLayer, {
      d: `M${PRIME_Q_X + PRIME_W / 2 + 4},${KEYGEN_ROW_Y} L${PRODUCT_X - PRODUCT_W / 2 - 6},${KEYGEN_ROW_Y}`,
      stroke: palette.textMuted,
      'stroke-width': 1.4,
      fill: 'none',
      'marker-end': 'url(#rsa-arrow-light)',
      opacity: 0,
    });
    const multLabel = makeText(
      keygenLayer,
      {
        x: (PRIME_Q_X + PRIME_W / 2 + PRODUCT_X - PRODUCT_W / 2) / 2,
        y: KEYGEN_ROW_Y - 6,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '× (가벼움)',
    );
    multLabel.setAttribute('opacity', '0');

    // n 카드.
    const productGroup = makeGroup(keygenLayer, { opacity: 0 });
    makeRect(productGroup, {
      x: PRODUCT_X - PRODUCT_W / 2,
      y: KEYGEN_ROW_Y - PRODUCT_H / 2,
      width: PRODUCT_W,
      height: PRODUCT_H,
      rx: 6,
      ry: 6,
      fill: palette.bg,
      stroke: palette.text,
      'stroke-width': 2,
    });
    makeText(
      productGroup,
      {
        x: PRODUCT_X,
        y: KEYGEN_ROW_Y - 6,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      'n = p·q',
    );
    const productValueEl = makeText(
      productGroup,
      {
        x: PRODUCT_X,
        y: KEYGEN_ROW_Y + 12,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.text,
      },
      '',
    );

    // n → 자물쇠/열쇠 출생 화살표.
    const birthArrow = makePath(keygenLayer, {
      d: `M${PRODUCT_X + PRODUCT_W / 2 + 4},${KEYGEN_ROW_Y} L${LOCK_BORN_X - 28},${KEYGEN_ROW_Y}`,
      stroke: palette.textMuted,
      'stroke-width': 1.4,
      fill: 'none',
      'marker-end': 'url(#rsa-arrow-light)',
      opacity: 0,
    });
    void birthArrow;

    // 자물쇠와 열쇠 출생 자리 (key 생성 시퀀스 영역).
    const lockBornG = makeGroup(keygenLayer, { opacity: 0 });
    const keyBornG = makeGroup(keygenLayer, { opacity: 0 });

    function drawLock(parent: SVGGElement, cx: number, cy: number, scale = 1, opts?: {
      open?: boolean;
      shake?: boolean;
    }): LockRec {
      const w = 30 * scale;
      const h = 24 * scale;
      const bodyEl = makeRect(parent, {
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
        rx: 4,
        ry: 4,
        fill: LOCK_TONE,
        stroke: palette.text,
        'stroke-width': 1.4,
        opacity: 0.9,
      });
      const shackleEl = makePath(parent, {
        d: lockShackleD(cx, cy, scale, opts?.open ? 6 : 0),
        stroke: LOCK_TONE,
        'stroke-width': 3 * scale,
        fill: 'none',
        'stroke-linecap': 'round',
      });
      const keyholeEl = makeCircle(parent, {
        cx,
        cy: cy + 2,
        r: 2.4 * scale,
        fill: palette.text,
        opacity: 0.7,
      });
      const openHintEl = makePath(parent, {
        d: '',
        stroke: palette.text,
        'stroke-width': 1,
        fill: 'none',
        opacity: 0,
      });
      return { group: parent, bodyEl, shackleEl, keyholeEl, openHintEl };
    }

    function drawKey(parent: SVGGElement, cx: number, cy: number, scale = 1, rotateDeg = 0): KeyRec {
      const handleR = 6 * scale;
      const stem = 26 * scale;
      const bodyEl = makePath(parent, {
        d:
          `M${cx + handleR},${cy} ` +
          `A${handleR},${handleR} 0 1 0 ${cx - handleR},${cy} ` +
          `A${handleR},${handleR} 0 1 0 ${cx + handleR},${cy} ` +
          `M${cx + handleR},${cy} L${cx + handleR + stem},${cy}`,
        stroke: KEY_TONE,
        'stroke-width': 2 * scale,
        fill: 'none',
        'stroke-linecap': 'round',
      });
      // 톱니 — 한 쪽으로만 깊게.
      const toothX = cx + handleR + stem - 6 * scale;
      const toothEl = makePath(parent, {
        d:
          `M${toothX},${cy} L${toothX},${cy + 5 * scale} ` +
          `L${toothX - 4 * scale},${cy + 5 * scale} ` +
          `M${toothX - 6 * scale},${cy} L${toothX - 6 * scale},${cy + 4 * scale}`,
        stroke: KEY_TONE,
        'stroke-width': 2 * scale,
        fill: 'none',
        'stroke-linecap': 'round',
      });
      parent.setAttribute('transform', `rotate(${rotateDeg} ${cx} ${cy})`);
      return { group: parent, bodyEl, toothEl };
    }

    const lockBornRec = drawLock(lockBornG, LOCK_BORN_X, KEYGEN_ROW_Y, 1);
    const keyBornRec = drawKey(keyBornG, KEY_BORN_X, KEYGEN_ROW_Y, 1, 0);
    void lockBornRec;
    void keyBornRec;

    makeText(
      keygenLayer,
      {
        x: LOCK_BORN_X,
        y: KEYGEN_ROW_Y + 24,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '자물쇠 (공개)',
    );
    makeText(
      keygenLayer,
      {
        x: KEY_BORN_X + 4,
        y: KEYGEN_ROW_Y + 24,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '열쇠 (비밀)',
    );

    // ── 외부 관찰자 영역 ────────────────────────────────────────────
    makeRect(obsLayer, {
      x: 0,
      y: OBS_Y,
      width: W,
      height: OBS_H,
      fill: OBS_BG,
      'fill-opacity': 0.18,
    });
    makeText(
      obsLayer,
      {
        x: 12,
        y: OBS_Y + 14,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        'letter-spacing': '0.04em',
        fill: palette.textMuted,
      },
      '외부 관찰자 영역 — 공개된 n 만 보임',
    );

    // 공개된 n 카드 (옅게).
    const obsNX = 220;
    const obsNCard = makeGroup(obsLayer, { opacity: 0 });
    makeRect(obsNCard, {
      x: obsNX - 30,
      y: OBS_Y + 12,
      width: 60,
      height: 22,
      rx: 4,
      ry: 4,
      fill: palette.bg,
      stroke: palette.textMuted,
      'stroke-width': 1.2,
      opacity: 0.7,
    });
    const obsNValueEl = makeText(
      obsNCard,
      {
        x: obsNX,
        y: OBS_Y + 28,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.textMuted,
      },
      'n = ?',
    );

    // 막힌 점선 화살표 — n 에서 (p, q) 를 향해.
    const factorArrowX0 = obsNX + 32;
    const factorArrowX1 = obsNX + 180;
    const factorArrow = makePath(obsLayer, {
      d: `M${factorArrowX0},${OBS_Y + 24} L${factorArrowX1 - 16},${OBS_Y + 24}`,
      stroke: palette.textMuted,
      'stroke-width': 3,
      fill: 'none',
      'stroke-dasharray': '6 4',
      opacity: 0,
    });
    // 빨간 격벽 (수직선 X 모양).
    const factorBarrier = makeGroup(obsLayer, { opacity: 0 });
    makeLine(factorBarrier, {
      x1: factorArrowX1 - 14,
      y1: OBS_Y + 12,
      x2: factorArrowX1 - 14,
      y2: OBS_Y + 36,
      stroke: DANGER,
      'stroke-width': 3,
    });
    makeLine(factorBarrier, {
      x1: factorArrowX1 - 20,
      y1: OBS_Y + 14,
      x2: factorArrowX1 - 8,
      y2: OBS_Y + 34,
      stroke: DANGER,
      'stroke-width': 2,
    });
    makeLine(factorBarrier, {
      x1: factorArrowX1 - 8,
      y1: OBS_Y + 14,
      x2: factorArrowX1 - 20,
      y2: OBS_Y + 34,
      stroke: DANGER,
      'stroke-width': 2,
    });
    makeText(
      obsLayer,
      {
        x: factorArrowX1 + 8,
        y: OBS_Y + 28,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      },
      'p, q 로의 길은 사실상 막혀 있다',
    );

    // ── Alice 영역 ──────────────────────────────────────────────────
    makeRect(bgLayer, {
      x: ALICE_X,
      y: BODY_Y,
      width: ALICE_W,
      height: BODY_H,
      rx: 8,
      ry: 8,
      fill: palette.bg,
      stroke: palette.border,
      'stroke-width': 1,
    });
    makeText(
      aliceLayer,
      {
        x: ALICE_X + 10,
        y: BODY_Y + 18,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.text,
      },
      'Alice (보내는 사람)',
    );

    // Alice 평문 m 카드.
    const aliceMX = ALICE_X + ALICE_W / 2;
    const aliceMY = BODY_Y + 64;
    const aliceMCard = makeGroup(aliceLayer);
    makeRect(aliceMCard, {
      x: aliceMX - 40,
      y: aliceMY - 22,
      width: 80,
      height: 44,
      rx: 6,
      ry: 6,
      fill: PLAIN_TONE,
      'fill-opacity': 0.25,
      stroke: PLAIN_TONE,
      'stroke-width': 2,
    });
    makeText(
      aliceMCard,
      {
        x: aliceMX,
        y: aliceMY - 4,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '평문 m',
    );
    const aliceMValueEl = makeText(
      aliceMCard,
      {
        x: aliceMX,
        y: aliceMY + 14,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.text,
      },
      '',
    );

    // Alice 자물쇠 사본.
    const aliceLockX = ALICE_X + ALICE_W / 2;
    const aliceLockY = BODY_Y + 140;
    const aliceLockG = makeGroup(aliceLayer, { opacity: 0 });
    drawLock(aliceLockG, aliceLockX, aliceLockY, 0.9);
    makeText(
      aliceLayer,
      {
        x: aliceLockX,
        y: aliceLockY + 32,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '공개 자물쇠 (사본)',
    );

    // ── 채널 영역 ──────────────────────────────────────────────────
    makeRect(bgLayer, {
      x: CHANNEL_X,
      y: BODY_Y,
      width: CHANNEL_W,
      height: BODY_H,
      rx: 8,
      ry: 8,
      fill: palette.bgSubtle,
      stroke: palette.border,
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
    });
    makeText(
      channelLayer,
      {
        x: CHANNEL_X + 10,
        y: BODY_Y + 18,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.textMuted,
      },
      '채널 (공개 통로)',
    );

    // 채널 가이드 라인.
    makeLine(channelLayer, {
      x1: ENVELOPE_X0,
      y1: ENVELOPE_TRACK_Y,
      x2: ENVELOPE_X1,
      y2: ENVELOPE_TRACK_Y,
      stroke: palette.border,
      'stroke-width': 1,
      'stroke-dasharray': '2 4',
    });

    // 채널 양 끝 — 잠금/풀림 스냅샷 자리.
    const lockSnapshotG = makeGroup(channelLayer, { opacity: 0 });
    drawLock(lockSnapshotG, ENVELOPE_X0 + 8, SNAPSHOT_Y, 0.7);
    makeText(
      lockSnapshotG,
      {
        x: ENVELOPE_X0 + 8,
        y: SNAPSHOT_Y + 22,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: LOCK_TONE,
      },
      '잠금',
    );

    const unlockSnapshotG = makeGroup(channelLayer, { opacity: 0 });
    drawLock(unlockSnapshotG, ENVELOPE_X1 - 8, SNAPSHOT_Y, 0.7, { open: true });
    drawKey(makeGroup(unlockSnapshotG), ENVELOPE_X1 - 32, SNAPSHOT_Y + 4, 0.55, 25);
    makeText(
      unlockSnapshotG,
      {
        x: ENVELOPE_X1 - 8,
        y: SNAPSHOT_Y + 22,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: KEY_TONE,
      },
      '풀림',
    );

    // 봉투 (잠긴 봉투 c) — 처음엔 숨김.
    const ENVELOPE_W = 64;
    const ENVELOPE_H = 40;
    const envelopeG = makeGroup(channelLayer, { opacity: 0 });
    const envelopeRect = makeRect(envelopeG, {
      x: -ENVELOPE_W / 2,
      y: -ENVELOPE_H / 2,
      width: ENVELOPE_W,
      height: ENVELOPE_H,
      rx: 3,
      ry: 3,
      fill: palette.bg,
      stroke: palette.text,
      'stroke-width': 1.4,
    });
    void envelopeRect;
    // 봉투 봉인 삼각형 (위쪽 라인).
    makePath(envelopeG, {
      d: `M${-ENVELOPE_W / 2},${-ENVELOPE_H / 2} L0,${-ENVELOPE_H / 2 + 14} L${ENVELOPE_W / 2},${-ENVELOPE_H / 2}`,
      stroke: palette.text,
      'stroke-width': 1,
      fill: 'none',
    });
    // 봉투 위에 얹힌 자물쇠.
    const envelopeLockSubG = makeGroup(envelopeG);
    const envelopeLockRec = drawLock(envelopeLockSubG, 0, -2, 0.7);
    // 봉투 안 평문 라벨 (잠금 전엔 보임, 잠그면 숨김).
    const envelopeMLabel = makeText(
      envelopeG,
      {
        x: 0,
        y: 6,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.textMuted,
      },
      '',
    );
    // 봉투 표면 c 라벨 (잠그면 보임).
    const envelopeCLabel = makeText(
      envelopeG,
      {
        x: 0,
        y: ENVELOPE_H / 2 + 14,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.text,
      },
      '',
    );

    // 봉투 위 빨간 X (거꾸로 시도 거부 시).
    const rejectX = makeGroup(envelopeG, { opacity: 0 });
    makeLine(rejectX, {
      x1: -10,
      y1: -ENVELOPE_H / 2 - 14,
      x2: 10,
      y2: -ENVELOPE_H / 2 + 6,
      stroke: DANGER,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    });
    makeLine(rejectX, {
      x1: 10,
      y1: -ENVELOPE_H / 2 - 14,
      x2: -10,
      y2: -ENVELOPE_H / 2 + 6,
      stroke: DANGER,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    });

    // ── Bob 영역 ───────────────────────────────────────────────────
    // 공개 마당.
    makeRect(bgLayer, {
      x: BOB_X,
      y: BOB_PUBLIC_Y,
      width: BOB_W,
      height: BOB_PUBLIC_H,
      rx: 8,
      ry: 8,
      fill: PUBLIC_BG,
      'fill-opacity': 0.6,
      stroke: palette.border,
      'stroke-width': 1,
    });
    // 비밀 방.
    makeRect(bgLayer, {
      x: BOB_X,
      y: BOB_SECRET_Y,
      width: BOB_W,
      height: BOB_SECRET_H,
      rx: 8,
      ry: 8,
      fill: SECRET_BG,
      'fill-opacity': 0.85,
      stroke: palette.border,
      'stroke-width': 1,
    });

    makeText(
      bobLayer,
      {
        x: BOB_X + 10,
        y: BOB_PUBLIC_Y + 16,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.text,
      },
      'Bob — 공개 마당',
    );
    makeText(
      bobLayer,
      {
        x: BOB_X + 10,
        y: BOB_SECRET_Y + 16,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.bg,
      },
      'Bob — 비밀 방',
    );

    // 공개 마당 자물쇠.
    const bobLockX = BOB_X + BOB_W / 2;
    const bobLockY = BOB_PUBLIC_Y + 60;
    const bobLockG = makeGroup(bobLayer, { opacity: 0 });
    drawLock(bobLockG, bobLockX, bobLockY, 0.9);

    makeText(
      bobLayer,
      {
        x: bobLockX,
        y: bobLockY + 30,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '공개 자물쇠 + n',
    );

    // 비밀 방 — 비밀 열쇠 + p, q.
    const bobKeyX = BOB_X + 50;
    const bobKeyY = BOB_SECRET_Y + 56;
    const bobKeyG = makeGroup(bobLayer, { opacity: 0 });
    drawKey(bobKeyG, bobKeyX, bobKeyY, 0.9, 0);
    makeText(
      bobLayer,
      {
        x: bobKeyX + 10,
        y: bobKeyY + 26,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.bg,
        opacity: 0.8,
      },
      '비밀 열쇠',
    );

    // 비밀 방 안 두 소수 (작은 칩으로).
    const bobPQX = BOB_X + 130;
    const bobPQG = makeGroup(bobLayer, { opacity: 0 });
    const bobPLabel = makeText(
      bobPQG,
      {
        x: bobPQX,
        y: bobKeyY - 4,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.bg,
      },
      'p = ?',
    );
    const bobQLabel = makeText(
      bobPQG,
      {
        x: bobPQX,
        y: bobKeyY + 12,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.bg,
      },
      'q = ?',
    );

    // Bob 출력 자리 — 복원된 평문 m.
    const bobOutX = BOB_X + BOB_W - 50;
    const bobOutY = BOB_PUBLIC_Y + 60;
    const bobOutG = makeGroup(bobLayer, { opacity: 0 });
    makeRect(bobOutG, {
      x: bobOutX - 28,
      y: bobOutY - 18,
      width: 56,
      height: 36,
      rx: 6,
      ry: 6,
      fill: PLAIN_TONE,
      'fill-opacity': 0.3,
      stroke: PLAIN_TONE,
      'stroke-width': 2,
    });
    makeText(
      bobOutG,
      {
        x: bobOutX,
        y: bobOutY - 4,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '복원된 m',
    );
    const bobOutValueEl = makeText(
      bobOutG,
      {
        x: bobOutX,
        y: bobOutY + 12,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: palette.text,
      },
      '',
    );

    // 거꾸로 시도 토글 상태 표시.
    const reverseStatusEl = makeText(
      overlayLayer,
      {
        x: W - 12,
        y: BODY_Y + 18,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
        fill: palette.textMuted,
      },
      '',
    );

    // ── 사건 캡션 ───────────────────────────────────────────────────
    const eventCaptionEl = makeText(
      captionLayer,
      {
        x: W / 2,
        y: EVENT_CAPTION_Y,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'font-weight': 700,
        fill: palette.text,
      },
      '',
    );

    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    function setCaption(text: string, opts?: { duration?: number }): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      eventCaptionEl.textContent = text;
      const dur = opts?.duration ?? CAPTION_DUR;
      captionTimer = setTimeout(() => {
        eventCaptionEl.textContent = '';
        captionTimer = null;
      }, dur);
    }
    function setBaseCaption(_text: string): void {
      // 본 view 는 상단에 4 줄 고정 캡션을 이미 그려 두었으므로
      // projector 의 setBaseCaption 호출은 수신만 하고 화면은 변경하지 않는다.
    }

    // ── 참고 칩 ─────────────────────────────────────────────────────
    const chipW = (W - 24 - (REFERENCES.length - 1) * 8) / REFERENCES.length;
    REFERENCES.forEach((ref, i) => {
      const x = 12 + i * (chipW + 8);
      const link = document.createElementNS(SVG_NS, 'a');
      link.setAttribute('href', ref.url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noreferrer');
      chipLayer.appendChild(link);
      makeRect(link, {
        x,
        y: CHIP_Y0,
        width: chipW,
        height: CHIP_Y1 - CHIP_Y0,
        rx: 6,
        ry: 6,
        fill: palette.bgSubtle,
        stroke: palette.border,
        'stroke-width': 1,
      });
      makeText(
        link,
        {
          x: x + 10,
          y: CHIP_Y0 + 22,
          'font-size': fontSizes.xs,
          fill: palette.text,
        },
        ref.name,
      );
      makeText(
        link,
        {
          x: x + chipW - 10,
          y: CHIP_Y0 + 22,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: palette.textMuted,
        },
        '↗',
      );
    });

    // ── 상태 ────────────────────────────────────────────────────────
    let p = 0;
    let q = 0;
    let n = 0;
    let e = 0;
    let d = 0;
    let mVal = 0;
    let cVal = 0;
    let reverseAttempt = false;

    function updateParamSummary(): void {
      paramSummaryEl.textContent = `p=${p}  q=${q}  n=${n}  e=${e}  d=${d}`;
      bobPLabel.textContent = `p = ${p}`;
      bobQLabel.textContent = `q = ${q}`;
      obsNValueEl.textContent = `n = ${n}`;
      productValueEl.textContent = String(n);
      primePCard.valueEl.textContent = String(p);
      primeQCard.valueEl.textContent = String(q);
    }
    function updatePlaintext(): void {
      aliceMValueEl.textContent = String(mVal);
      bobOutValueEl.textContent = String(mVal);
      envelopeMLabel.textContent = `m=${mVal}`;
      envelopeCLabel.textContent = `c = ${cVal}`;
    }
    function updateReverseStatus(): void {
      reverseStatusEl.textContent = reverseAttempt
        ? '거꾸로 시도: ON'
        : '거꾸로 시도: OFF';
    }

    // ── 정적 상태 표시 헬퍼 (init / 변경 직후) ────────────────────
    function showStaticAfterBirth(): void {
      // 키 생성 시퀀스 영역의 카드 모두 표시.
      primePCard.group.setAttribute('opacity', '1');
      primeQCard.group.setAttribute('opacity', '1');
      multArrow.setAttribute('opacity', '1');
      multLabel.setAttribute('opacity', '1');
      productGroup.setAttribute('opacity', '1');
      birthArrow.setAttribute('opacity', '1');
      lockBornG.setAttribute('opacity', '1');
      keyBornG.setAttribute('opacity', '1');
      // 외부 관찰자 영역 — 공개된 n 카드 표시.
      obsNCard.setAttribute('opacity', '1');
      // Alice 자물쇠 사본 표시.
      aliceLockG.setAttribute('opacity', '1');
      // Bob 공개 자물쇠 / 비밀 열쇠 / p, q 표시.
      bobLockG.setAttribute('opacity', '1');
      bobKeyG.setAttribute('opacity', '1');
      bobPQG.setAttribute('opacity', '1');
      // 봉투, 출력, 스냅샷은 시퀀스 직전 상태.
      envelopeG.setAttribute('opacity', '0');
      bobOutG.setAttribute('opacity', '0');
      lockSnapshotG.setAttribute('opacity', '0');
      unlockSnapshotG.setAttribute('opacity', '0');
      factorArrow.setAttribute('opacity', '0');
      factorBarrier.setAttribute('opacity', '0');
      rejectX.setAttribute('opacity', '0');
    }

    function resetAll(): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      eventCaptionEl.textContent = '';
      // 시퀀스 시작 전 상태 — 키 생성 영역의 단계별 요소 모두 숨김.
      primePCard.group.setAttribute('opacity', '0');
      primeQCard.group.setAttribute('opacity', '0');
      multArrow.setAttribute('opacity', '0');
      multLabel.setAttribute('opacity', '0');
      productGroup.setAttribute('opacity', '0');
      birthArrow.setAttribute('opacity', '0');
      lockBornG.setAttribute('opacity', '0');
      keyBornG.setAttribute('opacity', '0');
      obsNCard.setAttribute('opacity', '0');
      factorArrow.setAttribute('opacity', '0');
      factorBarrier.setAttribute('opacity', '0');
      aliceLockG.setAttribute('opacity', '0');
      bobLockG.setAttribute('opacity', '0');
      bobKeyG.setAttribute('opacity', '0');
      bobPQG.setAttribute('opacity', '0');
      envelopeG.setAttribute('opacity', '0');
      bobOutG.setAttribute('opacity', '0');
      lockSnapshotG.setAttribute('opacity', '0');
      unlockSnapshotG.setAttribute('opacity', '0');
      rejectX.setAttribute('opacity', '0');
    }

    function init(payload: {
      p: number;
      q: number;
      n: number;
      e: number;
      d: number;
      m: number;
      c: number;
      primes: number[];
      reverseAttempt: boolean;
    }): void {
      p = payload.p;
      q = payload.q;
      n = payload.n;
      e = payload.e;
      d = payload.d;
      mVal = payload.m;
      cVal = payload.c;
      reverseAttempt = payload.reverseAttempt;
      updateParamSummary();
      updatePlaintext();
      updateReverseStatus();
      // 기획 §9 — 초기 상태는 키 짝이 이미 출생을 마쳐 자물쇠 사본이 양쪽에
      // 놓여 있는 정적 장면.
      showStaticAfterBirth();
    }

    // ── 시퀀스 사건 헬퍼 ────────────────────────────────────────────

    async function fadeIn(group: SVGGElement, ms = 220): Promise<void> {
      group.setAttribute('opacity', '0');
      const start = Date.now();
      return new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / ms);
          group.setAttribute('opacity', String(easeInOut(t)));
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });
    }

    async function pulseFlash(el: SVGGraphicsElement, ms = 220): Promise<void> {
      const orig = el.getAttribute('opacity') ?? '1';
      el.setAttribute('opacity', '1');
      const start = Date.now();
      return new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / ms);
          // 0 → 1 → 0.6 (잔상).
          const op = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 0.8;
          el.setAttribute('opacity', String(op));
          if (t < 1) raf(tick);
          else {
            el.setAttribute('opacity', orig);
            res();
          }
        };
        raf(tick);
      });
    }
    void pulseFlash;

    async function signalPrimeSeat(_id: 'p' | 'q', _value: number): Promise<void> {
      const g = _id === 'p' ? primePCard.group : primeQCard.group;
      await fadeIn(g, 280);
      setCaption('두 소수 p, q 가 자리에 앉았다.', { duration: 1100 });
    }

    async function signalProductForm(_p: number, _q: number, _n: number): Promise<void> {
      multArrow.setAttribute('opacity', '1');
      multLabel.setAttribute('opacity', '1');
      await fadeIn(productGroup, 320);
      setCaption('두 소수가 곱해져 합성수 n 을 낳았다.', { duration: 1200 });
    }

    async function signalKeypairBirth(_n: number, _e: number, _d: number): Promise<void> {
      birthArrow.setAttribute('opacity', '1');
      // 자물쇠와 열쇠 동시 출생.
      await Promise.all([fadeIn(lockBornG, 360), fadeIn(keyBornG, 360)]);
      setCaption('n 위에 자물쇠와 열쇠 한 짝이 태어났다.', { duration: 1300 });
    }

    async function signalKeypairDistribute(): Promise<void> {
      // 자물쇠 사본 → Alice + Bob 공개 마당. 비밀 열쇠 → Bob 비밀 방. p, q → 비밀 방.
      // 외부 관찰자 영역에 공개된 n 카드도 떠오름.
      await Promise.all([
        fadeIn(aliceLockG, 380),
        fadeIn(bobLockG, 380),
        fadeIn(bobKeyG, 380),
        fadeIn(bobPQG, 380),
        fadeIn(obsNCard, 380),
      ]);
      setCaption('자물쇠 한 벌이 채널을 건너 모두에게 사본되었다.', { duration: 1300 });
    }

    async function signalFactoringBlock(): Promise<void> {
      // 점선 화살표가 짧게 그어졌다 빨간 격벽에 부딪혀 멈춤.
      factorArrow.setAttribute('opacity', '0');
      factorBarrier.setAttribute('opacity', '0');
      // 화살표 길이를 0 → full 로 늘리는 운동.
      const len = factorArrowX1 - 16 - factorArrowX0;
      const start = Date.now();
      const dur = 320;
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / dur);
          const cx1 = factorArrowX0 + len * t;
          factorArrow.setAttribute('d', `M${factorArrowX0},${OBS_Y + 24} L${cx1},${OBS_Y + 24}`);
          factorArrow.setAttribute('opacity', '1');
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });
      // 격벽이 부딪힘 — 빨간 격벽 출현 + 짧은 흔들림.
      factorBarrier.setAttribute('opacity', '1');
      const shakeStart = Date.now();
      const shakeDur = 260;
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - shakeStart) / shakeDur);
          const dx = Math.sin(t * Math.PI * 4) * 2 * (1 - t);
          factorBarrier.setAttribute('transform', `translate(${dx},0)`);
          if (t < 1) raf(tick);
          else {
            factorBarrier.setAttribute('transform', 'translate(0,0)');
            res();
          }
        };
        raf(tick);
      });
      setCaption('공개된 n 만으로는 두 소수에 닿지 못한다.', { duration: 1300 });
    }

    async function signalEnvelopeFill(_m: number): Promise<void> {
      // 봉투를 Alice 영역 평문 자리에서 시작해 채널 좌측 끝으로.
      envelopeG.setAttribute(
        'transform',
        `translate(${aliceMX},${aliceMY})`,
      );
      envelopeG.setAttribute('opacity', '0');
      envelopeMLabel.textContent = `m=${mVal}`;
      envelopeCLabel.textContent = '';
      // 봉투 위 자물쇠도 잠시 숨김 (잠금 사건에서 얹힘).
      envelopeLockSubG.setAttribute('opacity', '0');
      await fadeIn(envelopeG, 280);
      setCaption('Alice 가 평문 m 을 봉투에 넣었다.', { duration: 1100 });
    }

    async function signalLockEngage(): Promise<void> {
      // 봉투 위에 자물쇠가 얹히고 빗장이 닫히는 잠금 사건.
      envelopeLockSubG.setAttribute('opacity', '1');
      // 평문 라벨 사라지고 c 라벨 등장.
      envelopeMLabel.textContent = '';
      envelopeCLabel.textContent = `c = ${cVal}`;
      // 잠금 스냅샷 활성.
      lockSnapshotG.setAttribute('opacity', '1');
      await sleep(120);
      setCaption('Alice 가 평문을 봉투에 넣고 공개 자물쇠로 잠갔다.', { duration: 1300 });
    }

    async function signalChannelCross(_c: number): Promise<void> {
      // 봉투를 Alice 자리 → 채널 좌→우 → Bob 공개 마당으로 이동.
      const startX = aliceMX;
      const startY = aliceMY;
      const midY = ENVELOPE_TRACK_Y;
      const endX = bobLockX;
      const endY = bobLockY;

      const dur = 700;
      const t0 = Date.now();
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - t0) / dur);
          const e1 = easeInOut(t);
          let x: number;
          let y: number;
          if (e1 < 0.4) {
            // Alice → 채널 좌측 끝.
            const u = e1 / 0.4;
            x = startX + (ENVELOPE_X0 - startX) * u;
            y = startY + (ENVELOPE_TRACK_Y - startY) * u;
          } else if (e1 < 0.85) {
            // 채널 가로 이동.
            const u = (e1 - 0.4) / 0.45;
            x = ENVELOPE_X0 + (ENVELOPE_X1 - ENVELOPE_X0) * u;
            y = ENVELOPE_TRACK_Y;
          } else {
            // 채널 우측 끝 → Bob 공개 자물쇠.
            const u = (e1 - 0.85) / 0.15;
            x = ENVELOPE_X1 + (endX - ENVELOPE_X1) * u;
            y = midY + (endY - midY) * u;
          }
          envelopeG.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });
      setCaption('잠긴 봉투가 채널을 건넌다 — 안의 평문은 보이지 않는다.', { duration: 1500 });
    }

    async function signalReverseAttempt(): Promise<void> {
      // 같은 공개 자물쇠로 풀려는 시도 — 빨간 흔들림 + 빨간 X 잠시 표시.
      rejectX.setAttribute('opacity', '1');
      const dur = 400;
      const t0 = Date.now();
      const baseTransform = envelopeG.getAttribute('transform') ?? '';
      const baseTranslateMatch = baseTransform.match(/translate\(([-\d.]+),([-\d.]+)\)/);
      const bx = baseTranslateMatch ? Number(baseTranslateMatch[1]) : 0;
      const by = baseTranslateMatch ? Number(baseTranslateMatch[2]) : 0;
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - t0) / dur);
          const dx = Math.sin(t * Math.PI * 6) * 6 * (1 - t);
          envelopeG.setAttribute('transform', `translate(${bx + dx},${by})`);
          if (t < 1) raf(tick);
          else {
            envelopeG.setAttribute('transform', `translate(${bx},${by})`);
            res();
          }
        };
        raf(tick);
      });
      rejectX.setAttribute('opacity', '0');
      setCaption('같은 자물쇠로는 풀리지 않는다 — 비대칭의 벽.', { duration: 1500 });
    }

    async function signalUnlock(): Promise<void> {
      // 비밀 열쇠가 비밀 방에서 자물쇠 옆으로 미끄러지는 운동 + 회전.
      // 봉투 위 자물쇠의 빗장이 들리는 운동.
      unlockSnapshotG.setAttribute('opacity', '1');
      const dur = 500;
      const t0 = Date.now();
      // shackle 을 ε 만큼 위로 올려 빗장이 열리는 효과.
      // (실제 path 다시 그리기.)
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - t0) / dur);
          const open = 6 * easeInOut(t);
          envelopeLockRec.shackleEl.setAttribute(
            'd',
            lockShackleD(0, -2, 0.7, open),
          );
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });
      setCaption('Bob 의 비밀 열쇠가 봉투를 열고 평문이 돌아왔다.', { duration: 1500 });
    }

    async function signalDecrypted(_m: number): Promise<void> {
      // 봉투에서 평문 m 이 꺼져 Bob 출력 자리에 안착.
      await fadeIn(bobOutG, 320);
      // 봉투는 잔상으로 옅게.
      envelopeG.setAttribute('opacity', '0.35');
      setCaption('평문 m 이 Bob 의 책상에 도착했다.', { duration: 1500 });
    }

    function signalDone(): void {
      setCaption('한 호흡 완료 — 같은 화면에 잠금 / 채널 / 풀림 잔상이 함께 남는다.', {
        duration: 2200,
      });
    }

    function applyPrimeSet(payload: {
      which: 'p' | 'q';
      p: number;
      q: number;
      n: number;
      e: number;
      d: number;
      m: number;
      c: number;
    }): void {
      p = payload.p;
      q = payload.q;
      n = payload.n;
      e = payload.e;
      d = payload.d;
      mVal = payload.m;
      cVal = payload.c;
      updateParamSummary();
      updatePlaintext();
      // 키 짝 재출생 — 시퀀스 직전 상태로 리셋.
      resetAll();
      setCaption(`소수 ${payload.which} 변경 — 키 짝이 다시 태어난다.`, {
        duration: 1200,
      });
    }

    function applyPlaintextSet(payload: { m: number; c: number }): void {
      mVal = payload.m;
      cVal = payload.c;
      updatePlaintext();
      resetAll();
      setCaption(`평문 m = ${mVal} 으로 갱신 — 시퀀스를 다시 굴린다.`, {
        duration: 1200,
      });
    }

    function applyReverseToggled(on: boolean): void {
      reverseAttempt = on;
      updateReverseStatus();
      setCaption(on ? '거꾸로 시도 ON — 거부 시연이 끼어든다.' : '거꾸로 시도 OFF — 정상 흐름.', {
        duration: 1400,
      });
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`입력 무시 — ${op}: ${raw}`, { duration: 1500 });
    }

    return {
      destroy() {
        if (captionTimer !== null) {
          clearTimeout(captionTimer);
          captionTimer = null;
        }
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
      reset: resetAll,
      init,
      setBaseCaption,
      setCaption,
      signalPrimeSeat,
      signalProductForm,
      signalKeypairBirth,
      signalKeypairDistribute,
      signalFactoringBlock,
      signalEnvelopeFill,
      signalLockEngage,
      signalChannelCross,
      signalReverseAttempt,
      signalUnlock,
      signalDecrypted,
      signalDone,
      applyPrimeSet,
      applyPlaintextSet,
      applyReverseToggled,
      signalInvalid,
    } as ViewInstance;
  },
};
