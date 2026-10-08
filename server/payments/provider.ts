import { and, eq, sql } from 'drizzle-orm';
import type { PaymentMethod } from '../../shared/types';
import type { Db } from '../db/client';
import { payment } from '../db/schema';

/*
 * Every payment goes through a provider, so adding a bank gateway in Phase 2 changes no ordering
 * code: it becomes a second implementation of this interface.
 */

type Executor = Pick<Db, 'insert' | 'update'>;

export interface PaymentProvider {
  readonly name: string;
  /** Records a payment for a table session. A gateway would start a checkout here. */
  createPayment(db: Executor, input: { venueId: string; sessionId: string; amountLek: number; method: PaymentMethod }): Promise<{ paymentId: string }>;
  /** Marks the payment as received. A gateway would verify it with the bank first. */
  confirmPayment(db: Executor, venueId: string, paymentId: string): Promise<void>;
  refund(db: Executor, venueId: string, paymentId: string): Promise<void>;
}

/**
 * The MVP's only provider: money taken by staff outside the app, in cash or on the venue's own
 * card terminal. The app records it; nothing is charged.
 */
export const cashProvider: PaymentProvider = {
  name: 'cash',

  async createPayment(db, { venueId, sessionId, amountLek, method }) {
    const [row] = await db.insert(payment).values({ venueId, sessionId, provider: 'cash', method, amountLek, status: 'pending' }).returning({ id: payment.id });
    return { paymentId: row!.id };
  },

  async confirmPayment(db, venueId, paymentId) {
    await db
      .update(payment)
      .set({ status: 'confirmed', confirmedAt: sql`now()` })
      .where(and(eq(payment.venueId, venueId), eq(payment.id, paymentId)));
  },

  async refund(db, venueId, paymentId) {
    await db
      .update(payment)
      .set({ status: 'refunded' })
      .where(and(eq(payment.venueId, venueId), eq(payment.id, paymentId)));
  },
};
