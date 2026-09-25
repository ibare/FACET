/**
 * 베어러 토큰의 장면.
 *
 * - 바탕: 발급 기록 · 보낸 쪽 주소 · 요청 줄 · 인증 머리 앞부분 (initialData 에서 베낀다)
 * - 자취: 지금 시각 · 토큰을 든 쪽(든 차례대로) · 문이 본 것의 기록
 * - 이번 걸음: step
 *
 * 셈(판정 · 남은 시간 · 든 쪽의 수)은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { HolderId, LedgerEntry } from './algorithm.js';

export type Reason = 'valid' | 'expired' | 'unknown';

export type Holding = { holder: HolderId; token: string };

export type DoorRecord = {
  from: HolderId;
  token: string;
  status: number;
  reason: Reason;
  left: number;
};

export type TokenBearerStep =
  | { kind: 'issue'; to: HolderId; token: string; expiresAt: number }
  | { kind: 'leak'; from: HolderId; to: HolderId; token: string; holders: number }
  | ({ kind: 'request' } & DoorRecord);

export type TokenBearerScene = {
  ledger: LedgerEntry[];
  addresses: Record<HolderId, string>;
  requestLine: string;
  authPrefix: string;
  now: number | null;
  holding: Holding[];
  log: DoorRecord[];
  step: TokenBearerStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asHolder(v: unknown, what: string): HolderId {
  if (v === 'app' || v === 'attacker') return v;
  throw new Error(`token-bearer: ${what} 가 app · attacker 가 아니다 (${String(v)})`);
}

function asNum(v: unknown, what: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new Error(`token-bearer: ${what} 가 수가 아니다`);
}

function asStr(v: unknown, what: string): string {
  if (typeof v === 'string') return v;
  throw new Error(`token-bearer: ${what} 가 글자가 아니다`);
}

function asReason(v: unknown): Reason {
  if (v === 'valid' || v === 'expired' || v === 'unknown') return v;
  throw new Error(`token-bearer: 모르는 판정 까닭 (${String(v)})`);
}

export const tokenBearerScene: ScenePlan<TokenBearerScene> = {
  initial(initialData: unknown): TokenBearerScene {
    if (!isRecord(initialData)) throw new Error('token-bearer: initialData 가 없다');
    const { ledger, addresses, requestLine, authPrefix } = initialData;
    if (!Array.isArray(ledger)) throw new Error('token-bearer: ledger 가 목록이 아니다');
    if (!isRecord(addresses)) throw new Error('token-bearer: addresses 가 없다');
    return {
      ledger: ledger.map((e: unknown, i) => {
        if (!isRecord(e)) throw new Error(`token-bearer: ledger[${i}] 가 없다`);
        return {
          token: asStr(e.token, `ledger[${i}].token`),
          subject: asStr(e.subject, `ledger[${i}].subject`),
          issuedAt: asNum(e.issuedAt, `ledger[${i}].issuedAt`),
          expiresAt: asNum(e.expiresAt, `ledger[${i}].expiresAt`),
        };
      }),
      addresses: {
        app: asStr(addresses.app, 'addresses.app'),
        attacker: asStr(addresses.attacker, 'addresses.attacker'),
      },
      requestLine: asStr(requestLine, 'requestLine'),
      authPrefix: asStr(authPrefix, 'authPrefix'),
      now: null,
      holding: [],
      log: [],
      step: null,
    };
  },

  reduce(scene: TokenBearerScene, event: FacetRuntimeEvent): TokenBearerScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;

    if (event.type === 'issue') {
      const to = asHolder(p.to, 'issue.to');
      const token = asStr(p.token, 'issue.token');
      return {
        ...scene,
        now: asNum(p.at, 'issue.at'),
        holding: [...scene.holding.filter((h) => h.holder !== to), { holder: to, token }],
        step: { kind: 'issue', to, token, expiresAt: asNum(p.expiresAt, 'issue.expiresAt') },
      };
    }

    if (event.type === 'leak') {
      const from = asHolder(p.from, 'leak.from');
      const to = asHolder(p.to, 'leak.to');
      const token = asStr(p.token, 'leak.token');
      return {
        ...scene,
        now: asNum(p.at, 'leak.at'),
        holding: [...scene.holding.filter((h) => h.holder !== to), { holder: to, token }],
        step: { kind: 'leak', from, to, token, holders: asNum(p.holders, 'leak.holders') },
      };
    }

    if (event.type === 'request') {
      const rec: DoorRecord = {
        from: asHolder(p.from, 'request.from'),
        token: asStr(p.token, 'request.token'),
        status: asNum(p.status, 'request.status'),
        reason: asReason(p.reason),
        left: asNum(p.left, 'request.left'),
      };
      return {
        ...scene,
        now: asNum(p.at, 'request.at'),
        log: [...scene.log, rec],
        step: { kind: 'request', ...rec },
      };
    }

    return scene;
  },
};
