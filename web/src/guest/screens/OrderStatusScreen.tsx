import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { formatLek } from '@shared/money';
import type { OrderStatus, PlacedOrder } from '@shared/types';
import { Button, ButtonLink } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { LanguageSwitcher, MenuSkeleton, StateMessage, TableChip } from '../components';
import { useGuest } from '../GuestContext';
import { useCallWaiter, useOrderQuery } from '../queries';
import styles from './OrderStatusScreen.module.css';

const STEPS: { status: Exclude<OrderStatus, 'cancelled'>; icon: IconName }[] = [
  { status: 'new', icon: 'receipt' },
  { status: 'preparing', icon: 'pot' },
  { status: 'served', icon: 'cloche' },
];

/** After calling the waiter, the button rests this long so guests don't send repeat calls. */
const CALL_COOLDOWN_MS = 60_000;

export function OrderStatusScreen() {
  const { orderId = '' } = useParams();
  const { t } = useTranslation();
  const { slug, qrToken, base } = useGuest();
  const order = useOrderQuery(slug, qrToken, orderId);

  if (order.isPending) return <MenuSkeleton />;
  if (order.isError) {
    return (
      <StateMessage
        icon="receipt"
        title={t('status.notFound')}
        action={<ButtonLink to={base} variant="outline">{t('basket.browseMenu')}</ButtonLink>}
      />
    );
  }
  return <OrderStatusView order={order.data} />;
}

function OrderStatusView({ order }: { order: PlacedOrder }) {
  const { t, i18n } = useTranslation();
  const { text, base, slug, qrToken } = useGuest();
  const callWaiter = useCallWaiter(slug, qrToken);
  const [calledAt, setCalledAt] = useState<number | null>(null);

  useEffect(() => {
    if (calledAt === null) return;
    const timer = setTimeout(() => setCalledAt(null), CALL_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [calledAt]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const cancelled = order.status === 'cancelled';
  const current = STEPS.findIndex((s) => s.status === order.status);

  return (
    <>
      <header className={styles.header}>
        <TableChip />
        <LanguageSwitcher tone="dark" />
      </header>
      <KilimBand height={16} />

      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={`${styles.heroIcon} ${cancelled ? styles.heroIconCancelled : ''}`}>
            <Icon name={cancelled ? 'close' : order.status === 'served' ? 'cloche' : 'check'} size={36} strokeWidth={2.2} />
          </div>
          <h1 className={styles.heroTitle}>{cancelled ? t('status.cancelled') : t('status.title')}</h1>
          <p className={styles.heroBody} aria-live="polite">
            {t(`status.${order.status}Hint`)}
          </p>
        </div>

        {!cancelled && (
          <ol className={styles.timeline} aria-label={t('status.yourOrder')}>
            {STEPS.map((step, index) => {
              const state = index < current ? 'done' : index === current ? 'current' : 'todo';
              const stamp = index === 0 ? order.createdAt : index === current ? order.statusChangedAt : null;
              return (
                <li key={step.status} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className={styles.stepDot}>
                    <Icon name={state === 'done' ? 'check' : step.icon} size={18} strokeWidth={state === 'done' ? 3 : 2} />
                  </span>
                  <span className={styles.stepLabel}>{t(`status.${step.status}`)}</span>
                  {stamp && state !== 'todo' && <span className={styles.stepTime}>{time(stamp)}</span>}
                </li>
              );
            })}
          </ol>
        )}

        <section className={styles.card} aria-labelledby="order-lines">
          <div className={styles.cardHeader}>
            <h2 id="order-lines" className={styles.cardTitle}>
              {t('status.yourOrder')}
            </h2>
            <span className={styles.cardMeta}>{t('status.orderedAt', { time: time(order.createdAt) })}</span>
          </div>
          <ul className={styles.lines}>
            {order.lines.map((line, i) => (
              <li key={i}>
                <span className={styles.qty}>{line.qty}×</span>
                <span className={styles.lineName}>
                  {text(line.itemName)}
                  {line.optionNames.length > 0 && <small>{line.optionNames.map(text).join(' · ')}</small>}
                </span>
                <span className={styles.linePrice}>{formatLek(line.lineTotalLek)}</span>
              </li>
            ))}
          </ul>
          {order.note && <p className={styles.note}>{order.note}</p>}
        </section>

        <section className={styles.bill}>
          <div>
            <p className={styles.billLabel}>{t('status.tableBill')}</p>
            <p className={styles.billNote}>{t('status.payNote')}</p>
          </div>
          <p className={styles.billTotal}>{formatLek(order.sessionTotalLek)}</p>
        </section>

        <div className={styles.actions}>
          <ButtonLink to={base} variant="primary" size="lg" block>
            <Icon name="plus" size={20} strokeWidth={2.4} />
            {t('status.addMore')}
          </ButtonLink>
          <Button
            variant="outline"
            size="lg"
            block
            loading={callWaiter.isPending}
            disabled={calledAt !== null}
            onClick={() => callWaiter.mutate(undefined, { onSuccess: () => setCalledAt(Date.now()) })}
          >
            <Icon name={calledAt !== null ? 'check' : 'bell'} size={20} />
            {calledAt !== null ? t('status.waiterCalled') : t('status.callWaiter')}
          </Button>
        </div>
      </main>
    </>
  );
}
