import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLek } from '@shared/money';
import type { Venue } from '@shared/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { transitionName } from '../../lib/motion';
import { acknowledgeCall, type BoardOrder } from '../api';
import { clockTime, ConfirmDialog, PageHeader, useElapsed, useNow, useStaffText } from '../components';
import { useBoardQuery, useOrderStatusMutation, useStaffMutation, useVenueQuery } from '../queries';
import { useStaff } from '../session';
import styles from './BoardScreen.module.css';

type Column = 'new' | 'preparing' | 'served';
const COLUMNS: Column[] = ['new', 'preparing', 'served'];

/** Minutes after which an order's timer turns amber, then red. */
const LATE: Record<Column, [number, number]> = { new: [3, 6], preparing: [15, 25], served: [Infinity, Infinity] };

export function BoardScreen() {
  const { service } = useStaff();
  return service.on ? <Board /> : <StartService />;
}

function StartService() {
  const { t } = useTranslation();
  const { service } = useStaff();
  return (
    <div className={styles.start}>
      <KilimBand />
      <div className={styles.startBody}>
        <div className={styles.startIcon}>
          <Icon name="bell" size={44} strokeWidth={1.8} />
        </div>
        <h1 className={styles.startTitle}>{t('staff.start.title')}</h1>
        <p className={styles.startText}>{t('staff.start.body')}</p>
        <Button size="lg" onClick={service.start} className={styles.startButton}>
          <Icon name="utensils" size={22} />
          {t('staff.start.button')}
        </Button>
      </div>
      <KilimBand />
    </div>
  );
}

function Board() {
  const { t, i18n } = useTranslation();
  const board = useBoardQuery();
  const venue = useVenueQuery();
  const nowMs = useNow(10_000);
  const [mobileColumn, setMobileColumn] = useState<Column>('new');
  const ack = useStaffMutation(acknowledgeCall);
  const elapsed = useElapsed();

  // The board stops updating when the connection drops; say so, or staff wait for orders that can't arrive.
  const connectionLost = board.isError || board.fetchStatus === 'paused';
  const orders = board.data?.orders ?? [];
  const calls = board.data?.calls ?? [];
  const byColumn = (column: Column) =>
    orders.filter((o) => o.status === column).sort((a, b) => (column === 'served' ? b.statusChangedAt.localeCompare(a.statusChangedAt) : 0));

  return (
    <div className={styles.page}>
      <KilimBand height={10} />
      <div className={styles.inner}>
        <PageHeader
          title={t('staff.board.title')}
          meta={
            <>
              <span className={styles.live} data-lost={connectionLost || undefined} role="status">
                <span className={styles.liveDot} />
                {connectionLost ? t('staff.board.connectionLost') : t('staff.board.live')}
              </span>
              <span className={styles.clock}>{clockTime(nowMs, i18n.language)}</span>
            </>
          }
        />

        {calls.length > 0 && (
          <section className={styles.calls} aria-label={t('staff.board.calls')}>
            {calls.map((call) => (
              <div key={call.id} className={styles.call}>
                <span className={styles.callIcon}>
                  <Icon name="bell" size={22} strokeWidth={2.2} />
                </span>
                <div className={styles.callText}>
                  <strong>{t('staff.board.callTitle', { number: call.tableNumber })}</strong>
                  <span>{elapsed(call.createdAt, nowMs)}</span>
                </div>
                <Button variant="dark" onClick={() => ack.mutate(call.id)}>
                  {t('staff.board.callAck')}
                </Button>
              </div>
            ))}
          </section>
        )}

        <div className={styles.columnTabs} role="tablist" aria-label={t('staff.board.title')}>
          {COLUMNS.map((column) => (
            <button
              key={column}
              type="button"
              role="tab"
              aria-selected={mobileColumn === column}
              className={styles.columnTab}
              data-column={column}
              onClick={() => setMobileColumn(column)}
            >
              {t(`staff.board.${column}`)}
              <span className={styles.columnCount}>{byColumn(column).length}</span>
            </button>
          ))}
        </div>

        <div className={styles.columns}>
          {COLUMNS.map((column) => {
            const list = byColumn(column);
            return (
              <section key={column} className={styles.column} data-column={column} data-mobile-active={mobileColumn === column || undefined} aria-labelledby={`col-${column}`}>
                <header className={styles.columnHeader}>
                  <h2 id={`col-${column}`}>{t(`staff.board.${column}`)}</h2>
                  <span className={styles.columnCount}>{list.length}</span>
                </header>
                <div className={styles.cards}>
                  {list.length === 0 ? (
                    <p className={styles.emptyColumn}>{t(`staff.board.empty.${column}`)}</p>
                  ) : (
                    list.map((order) => <OrderCard key={order.id} order={order} nowMs={nowMs} venue={venue.data} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, nowMs, venue }: { order: BoardOrder; nowMs: number; venue: Venue | undefined }) {
  const { t } = useTranslation();
  const text = useStaffText(venue);
  const elapsed = useElapsed();
  const update = useOrderStatusMutation();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const column = order.status as Column;
  const waitedMin = (nowMs - Date.parse(column === 'new' ? order.createdAt : order.statusChangedAt)) / 60_000;
  const [amber, red] = LATE[column];
  const urgency = waitedMin >= red ? 'late' : waitedMin >= amber ? 'warn' : undefined;
  const fresh = column === 'new' && nowMs - Date.parse(order.createdAt) < 30_000;
  // "Served just now", not "served just now ago".
  const servedLabel =
    nowMs - Date.parse(order.statusChangedAt) < 60_000
      ? t('staff.board.servedJustNow')
      : t('staff.board.servedAt', { time: elapsed(order.statusChangedAt, nowMs) });

  return (
    <article
      className={styles.card}
      data-column={column}
      data-fresh={fresh || undefined}
      aria-label={t('staff.board.cardLabel', { number: order.tableNumber })}
      // Named, so a tapped card glides to its next column instead of jumping.
      style={transitionName(`order-${order.id}`, 'order-card')}
    >
      <header className={styles.cardHeader}>
        <span className={styles.tableNo}>
          <small>{t('staff.board.tableShort')}</small>
          {order.tableNumber}
        </span>
        <div className={styles.cardMeta}>
          <span className={styles.timer} data-urgency={urgency}>
            <Icon name="clock" size={14} strokeWidth={2.4} />
            {column === 'served' ? servedLabel : elapsed(order.createdAt, nowMs)}
          </span>
          {order.guestName && <span className={styles.guest}>{order.guestName}</span>}
        </div>
        {column !== 'served' && (
          <button type="button" className={styles.cancel} onClick={() => setConfirmCancel(true)}>
            {t('staff.board.cancel')}
          </button>
        )}
      </header>

      {order.firstInSession && column === 'new' && (
        <p className={styles.newTable}>
          <Icon name="eye" size={16} strokeWidth={2.2} />
          <span>
            <strong>{t('staff.board.newTable')}</strong> {t('staff.board.newTableHint')}
          </span>
        </p>
      )}

      <ul className={styles.lines}>
        {order.lines.map((line, i) => (
          <li key={i}>
            <span className={styles.qty}>{line.qty}×</span>
            <span className={styles.lineName}>
              {text(line.itemName)}
              {line.optionNames.length > 0 && <small>{line.optionNames.map(text).join(' · ')}</small>}
            </span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className={styles.note}>
          <Icon name="info" size={16} strokeWidth={2.2} />
          {order.note}
        </p>
      )}

      {column !== 'served' && (
        <footer className={styles.cardFooter}>
          <span className={styles.total}>{formatLek(order.totalLek)}</span>
          {column === 'new' ? (
            <Button block onClick={() => update.mutate({ id: order.id, status: 'preparing' })} loading={update.isPending}>
              {t('staff.board.start')}
            </Button>
          ) : (
            <Button variant="dark" block onClick={() => update.mutate({ id: order.id, status: 'served' })} loading={update.isPending}>
              <Icon name="cloche" size={20} />
              {t('staff.board.serve')}
            </Button>
          )}
        </footer>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={t('staff.board.cancelTitle', { number: order.tableNumber })}
        body={t('staff.board.cancelBody')}
        confirmLabel={t('staff.board.cancelConfirm')}
        cancelLabel={t('staff.common.keep')}
        tone="danger"
        busy={update.isPending}
        onConfirm={() => update.mutate({ id: order.id, status: 'cancelled' }, { onSuccess: () => setConfirmCancel(false) })}
        onClose={() => setConfirmCancel(false)}
      />
    </article>
  );
}
