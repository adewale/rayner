// The token-bucket explainer's model: a token bucket: tokens refilled at a rate up to a capacity, and which requests it accepts or refuses.
// Its limits: one client's bucket, initially full; every request costs one token; times are supplied
// and never run backwards; a request is accepted or refused at once, with no queue, no reservation of
// future tokens and no server work. The balance is brought up to date lazily, when a request arrives.
// Compared with golang.org/x/time/rate v0.15.0 on the explainer's schedule only (oracle/,
// model.test.ts), not with every feature of that package.
export class TokenBucket {
  tokens: number;
  lastRefill = 0;
  readonly rate: number;
  readonly capacity: number;
  constructor(rate: number, capacity = 5) {
    this.rate = rate;
    this.capacity = capacity;
    this.tokens = capacity;
  }
  allow(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.rate);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
/** One call of allow(): when it came, whether it got 200, the balance it found after refill and what it left. */
export interface BucketCall { at: number; ok: boolean; found: number; after: number }
/**
 * A client's requests through one TokenBucket, a call at a time: the bucket's fields, every call
 * so far, and what the readout reports of them (each response, the balance each left, how many
 * were accepted and which were refused, by name). The balance never leaves 0 to capacity:
 * allow() caps refill with min(capacity, …) and spends only a whole token.
 */
export interface BucketState {
  rate: number; capacity: number;
  tokens: number; lastRefill: number;
  calls: BucketCall[];
  responses: (200 | 429)[]; balances: number[]; allowed: number; rejected: string[];
}
export const bucketStart = (rate: number, capacity = 5): BucketState =>
  ({ rate, capacity, tokens: capacity, lastRefill: 0, calls: [], responses: [], balances: [], allowed: 0, rejected: [] });
/** The next request, arriving at `at`: allow(at) on the bucket the state describes. */
export function bucketRequest(st: BucketState, at: number): BucketState {
  const bucket = new TokenBucket(st.rate, st.capacity);
  Object.assign(bucket, { tokens: st.tokens, lastRefill: st.lastRefill });
  const ok = bucket.allow(at),
    call: BucketCall = { at, ok, found: bucket.tokens + (ok ? 1 : 0), after: bucket.tokens };
  return {
    ...st, tokens: bucket.tokens, lastRefill: bucket.lastRefill,
    calls: [...st.calls, call],
    responses: [...st.responses, ok ? 200 : 429],
    balances: [...st.balances, bucket.tokens],
    allowed: st.allowed + (ok ? 1 : 0),
    rejected: ok ? st.rejected : [...st.rejected, `R${st.calls.length + 1}`],
  };
}
