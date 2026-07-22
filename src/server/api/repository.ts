import type { IdempotencyRecord, MailboxPolicy, Postage, Receipt, SenderRule } from "./domain";

/**
 * Outcome of an atomic read-receipt publication.
 *
 * - "not-found": no receipt record exists for the given messageId.
 * - "forbidden": the requesting actor is not a participant in the receipt
 *   (neither sender nor recipient). The read state is never modified.
 * - "already-read": the receipt was already marked as read on a prior call.
 *   `readAt` reflects the original timestamp recorded on the first valid
 *   transition, enabling callers to surface deterministic 409 responses
 *   without a separate read round-trip.
 * - "marked": the read timestamp was set atomically for the first time.
 *   `receipt` reflects the updated record.
 *
 * ## Duplicate-call policy
 *
 * The first caller that observes `readAt === null` wins; every subsequent
 * call receives `{ outcome: "already-read", readAt }`. This is a
 * first-write-wins, idempotent-read policy: the stored timestamp is
 * authoritative and is never overwritten.
 */
export type MarkReceiptReadResult =
  | { outcome: "not-found" }
  | { outcome: "forbidden" }
  | { outcome: "already-read"; readAt: string }
  | { outcome: "marked"; receipt: Receipt };

export interface ApiRepository {
  getPolicy(owner: string): Promise<MailboxPolicy | null>;
  setPolicy(owner: string, policy: MailboxPolicy): Promise<MailboxPolicy>;
  getSenderRule(owner: string, sender: string): Promise<SenderRule>;
  setSenderRule(owner: string, sender: string, rule: SenderRule): Promise<SenderRule>;
  getPostage(messageId: string): Promise<Postage | null>;
  setPostage(postage: Postage): Promise<Postage>;
  getReceipt(messageId: string): Promise<Receipt | null>;
  setReceipt(receipt: Receipt): Promise<Receipt>;
  /**
   * Atomically marks a receipt as read by `actor`, subject to authorization
   * and a first-write-wins duplicate policy.
   *
   * Implementations MUST guarantee that concurrent callers racing on the
   * same messageId observe a single winner: exactly one call receives
   * `{ outcome: "marked" }` and every other concurrent or subsequent call
   * receives `{ outcome: "already-read", readAt }` with the canonical
   * timestamp. This MUST NOT be implemented as a plain get-then-set because
   * that is vulnerable to duplicate-write under concurrent requests.
   *
   * Authorization check: if `actor` is neither the `sender` nor the
   * `recipient` of the stored receipt, the method MUST return
   * `{ outcome: "forbidden" }` without modifying any state.
   */
  markReceiptRead(messageId: string, actor: string, now?: Date): Promise<MarkReceiptReadResult>;
  getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null>;
  setIdempotencyRecord(key: string, record: IdempotencyRecord): Promise<void>;

  getRelayQueueDepth(relayId: string): Promise<number>;
  getRelayRetryCount(relayId: string): Promise<number>;
  getRelayLastSuccessfulDelivery(relayId: string): Promise<string | null>;
  getRelayLastFailedDelivery(relayId: string): Promise<string | null>;
  getRelayDeadLetterCount(relayId: string): Promise<number>;
  getCounter(key: string): Promise<number>;
  incrementCounter(key: string, windowSeconds: number): Promise<number>;
}

export const defaultMailboxPolicy: MailboxPolicy = {
  allowUnknown: false,
  minimumPostage: "0",
  requireVerified: true,
};
