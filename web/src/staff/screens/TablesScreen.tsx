import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLek } from '@shared/money';
import type { PaymentMethod } from '@shared/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { markSessionPaid, type TableSummary } from '../api';
import { ConfirmDialog, PageHeader, Sheet, useElapsed, useNow, useStaffText, useStaffToast } from '../components';
import { useStaffMutation, useTablesQuery, useVenueQuery } from '../queries';
import staffStyles from '../staff.module.css';
import styles from './TablesScreen.module.css';

export function TablesScreen() {
  const { t } = useTranslation();
  const tables = useTablesQuery();
  const nowMs = useNow();
  const elapsed = useElapsed();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = tables.data ?? [];
  const selected = list.find((s) => s.table.id === openId) ?? null;
  const openCount = list.filter((s) => s.session).length;
  const openBills = list.reduce((sum, s) => sum + s.billLek, 0);

  return (
    <>
      <KilimBand height={10} />
      <div className={staffStyles.content}>
        <PageHeader
          title={t('staff.tables.title')}
          meta={
            <span className={styles.summary}>
              {t('staff.tables.summary', { open: openCount, total: list.length })} · {formatLek(openBills)}
            </span>
          }
        />
        {tables.isPending ? (
          <p className={staffStyles.loading}>{t('common.loading')}</p>
        ) : (
          <ul className={styles.grid}>
            {list.map((summary) => {
              const { table, session, orders, billLek, openCall } = summary;
              const active = orders.filter((o) => o.status === 'new' || o.status === 'preparing').length;
              return (
                <li key={table.id}>
                  <button
                    type="button"
                    className={styles.tile}
                    data-state={session ? 'open' : 'free'}
                    data-call={openCall || undefined}
                    disabled={!session}
                    onClick={() => setOpenId(table.id)}
                  >
                    <span className={styles.tileTop}>
                      <span className={styles.number}>{table.number}</span>
                      {openCall ? (
                        <span className={styles.callBadge}>
                          <Icon name="bell" size={14} strokeWidth={2.4} />
                          {t('staff.tables.calling')}
                        </span>
                      ) : (
                        <span className={styles.stateBadge}>{session ? t('staff.tables.open') : t('staff.tables.free')}</span>
                      )}
                    </span>
                    {session ? (
                      <span className={styles.tileBody}>
                        <span className={styles.bill}>{formatLek(billLek)}</span>
                        <span className={styles.tileMeta}>
                          {t('staff.tables.orders', { count: orders.length })}
                          {active > 0 && <> · {t('staff.tables.active', { count: active })}</>}
                        </span>
                        <span className={styles.tileMeta}>{t('staff.tables.openFor', { time: elapsed(session.openedAt, nowMs) })}</span>
                      </span>
                    ) : (
                      <span className={styles.tileBody}>
                        <span className={styles.freeText}>{t('staff.tables.freeHint')}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TableSheet summary={selected} onClose={() => setOpenId(null)} />
    </>
  );
}

function TableSheet({ summary, onClose }: { summary: TableSummary | null; onClose: () => void }) {
  const { t } = useTranslation();
  const venue = useVenueQuery();
  const text = useStaffText(venue.data);
  const toast = useStaffToast();
  const elapsed = useElapsed();
  const nowMs = useNow();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const pay = useStaffMutation(({ sessionId, m }: { sessionId: string; m: PaymentMethod }) => markSessionPaid(sessionId, m));

  const number = summary?.table.number ?? 0;
  const orders = summary?.orders ?? [];

  function confirm() {
    if (!summary?.session || !method) return;
    pay.mutate(
      { sessionId: summary.session.id, m: method },
      {
        onSuccess: () => {
          toast(t('staff.tables.closed', { number }));
          setMethod(null);
          onClose();
        },
      },
    );
  }

  return (
    <Sheet
      open={summary?.session != null}
      title={t('common.table', { number })}
      onClose={onClose}
      footer={
        summary?.session &&
        summary.billLek > 0 && (
          <div className={styles.payFooter}>
            <div className={styles.payTotal}>
              <span>{t('staff.tables.bill')}</span>
              <strong>{formatLek(summary.billLek)}</strong>
            </div>
            <div className={styles.payButtons}>
              <Button variant="dark" size="lg" onClick={() => setMethod('cash')}>
                <Icon name="cash" size={20} />
                {t('staff.tables.paidCash')}
              </Button>
              <Button variant="dark" size="lg" onClick={() => setMethod('card')}>
                <Icon name="card" size={20} />
                {t('staff.tables.paidCard')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {summary?.session && (
        <p className={styles.sheetMeta}>{t('staff.tables.openFor', { time: elapsed(summary.session.openedAt, nowMs) })}</p>
      )}
      {orders.length === 0 ? (
        <p className={styles.noOrders}>{t('staff.tables.noOrders')}</p>
      ) : (
        <ol className={styles.orders}>
          {orders.map((order) => (
            <li key={order.id} className={styles.order} data-status={order.status}>
              <div className={styles.orderHead}>
                <span className={styles.orderStatus} data-status={order.status}>
                  {t(`status.${order.status}`)}
                </span>
                <span className={styles.orderTime}>{elapsed(order.createdAt, nowMs)}</span>
                <span className={styles.orderTotal}>{formatLek(order.totalLek)}</span>
              </div>
              <ul className={styles.orderLines}>
                {order.lines.map((line, i) => (
                  <li key={i}>
                    <span className={styles.qty}>{line.qty}×</span>
                    <span>
                      {text(line.itemName)}
                      {line.optionNames.length > 0 && <small> · {line.optionNames.map(text).join(', ')}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={method !== null}
        title={t('staff.tables.closeTitle', { number })}
        body={t('staff.tables.closeBody', {
          total: formatLek(summary?.billLek ?? 0),
          method: method === 'card' ? t('staff.tables.methodCard') : t('staff.tables.methodCash'),
        })}
        confirmLabel={t('staff.tables.closeConfirm')}
        cancelLabel={t('staff.common.back')}
        busy={pay.isPending}
        onConfirm={confirm}
        onClose={() => setMethod(null)}
      />
    </Sheet>
  );
}
