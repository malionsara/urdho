import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { formatLek } from '@shared/money';
import { lineTotalLek } from '@shared/pricing';
import { isApiError } from '../../lib/http';
import { Button, ButtonLink } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Notice, TextField } from '../../ui/primitives';
import { BottomDock, ServiceBanner, TableChip, TopBar } from '../components';
import { useGuest } from '../GuestContext';
import { menuQueryKey, usePlaceOrder } from '../queries';
import styles from './CheckoutScreen.module.css';

const NAME_KEY = 'urdho-guest-name';

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function CheckoutScreen() {
  const { t } = useTranslation();
  const { basket, base, slug, qrToken, itemsById, text, menu } = useGuest();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [guestName, setGuestName] = useState(storedName);
  const [soldOut, setSoldOut] = useState<string[]>([]);
  const placeOrder = usePlaceOrder(slug, qrToken);
  const canOrder = menu.orderingOpen && !menu.offline;

  // Nothing to order: back to the basket. Only before submitting, since a placed order empties the basket.
  if (basket.count === 0 && placeOrder.isIdle && soldOut.length === 0) return <Navigate to={`${base}/basket`} replace />;

  function submit() {
    try {
      localStorage.setItem(NAME_KEY, guestName.trim());
    } catch {
      // ignore
    }
    setSoldOut([]);
    placeOrder.mutate(
      {
        clientRef: basket.clientRef,
        guestName: guestName.trim(),
        note: basket.note.trim(),
        lines: basket.lines.map(({ itemId, qty, optionIds }) => ({ itemId, qty, optionIds })),
      },
      {
        onSuccess: ({ orderId }) => {
          basket.clear();
          navigate(`${base}/order/${orderId}`, { replace: true, viewTransition: true });
        },
        onError: (error) => {
          // Something on the menu changed while the guest was choosing: take the sold-out dishes
          // out of the basket, say which, and fetch the menu again.
          if (isApiError(error, 'menu_changed')) {
            const ids = (error.details as { unavailable?: string[] } | undefined)?.unavailable ?? [];
            setSoldOut(ids.map((id) => text(itemsById.get(id)?.name ?? {})).filter(Boolean));
            basket.removeItems(ids);
          }
          if (isApiError(error, 'menu_changed') || isApiError(error, 'invalid_options') || isApiError(error, 'venue_closed')) {
            void queryClient.invalidateQueries({ queryKey: menuQueryKey(slug, qrToken) });
          }
        },
      },
    );
  }

  const errorMessage =
    placeOrder.error && !isApiError(placeOrder.error, 'menu_changed')
      ? t(`errors.api.${(placeOrder.error as Error).message}`, { defaultValue: t('checkout.error') })
      : null;

  return (
    <>
      <TopBar title={t('checkout.title')} backTo={`${base}/basket`} right={<TableChip />} />
      <ServiceBanner />
      <main className={styles.page}>
        {soldOut.length > 0 && <Notice icon="info">{t('checkout.soldOut', { dishes: soldOut.join(', ') })}</Notice>}

        <TextField
          label={t('checkout.nameLabel')}
          optionalLabel={t('checkout.nameOptional')}
          hint={t('checkout.nameHint')}
          value={guestName}
          maxLength={40}
          autoComplete="given-name"
          enterKeyHint="done"
          onChange={(e) => setGuestName(e.target.value)}
        />

        <div className={styles.payCard} role="radiogroup" aria-label={t('checkout.payTitle')}>
          <div role="radio" aria-checked="true" className={styles.payOption}>
            <span className={styles.payCheck} aria-hidden>
              <Icon name="check" size={16} strokeWidth={3} />
            </span>
            <div>
              <p className={styles.payTitle}>{t('checkout.payTitle')}</p>
              <p className={styles.payBody}>{t('checkout.payBody')}</p>
              <div className={styles.payMethods}>
                <span>
                  <Icon name="cash" size={18} />
                  {t('checkout.cash')}
                </span>
                <span>
                  <Icon name="card" size={18} />
                  {t('checkout.card')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {basket.count > 0 && (
          <section className={styles.summary} aria-labelledby="summary-title">
            <h2 id="summary-title" className={styles.summaryTitle}>
              {t('checkout.summary')}
            </h2>
            <ul className={styles.summaryLines}>
              {basket.lines.map((line) => {
                const item = itemsById.get(line.itemId)!;
                const options = item.optionGroups
                  .flatMap((g) => g.options)
                  .filter((o) => line.optionIds.includes(o.id))
                  .map((o) => text(o.name));
                return (
                  <li key={line.id}>
                    <span className={styles.qty}>{line.qty}×</span>
                    <span className={styles.summaryName}>
                      {text(item.name)}
                      {options.length > 0 && <small>{options.join(' · ')}</small>}
                    </span>
                    <span className={styles.summaryPrice}>{formatLek(lineTotalLek(item, line.optionIds, line.qty))}</span>
                  </li>
                );
              })}
            </ul>
            {basket.note.trim() && (
              <p className={styles.note}>
                <strong>{t('checkout.note')}:</strong> {basket.note.trim()}
              </p>
            )}
            <div className={styles.summaryTotal}>
              <span>{t('common.total')}</span>
              <span>{formatLek(basket.totalLek)}</span>
            </div>
          </section>
        )}

        {errorMessage && <Notice icon="wifiOff">{errorMessage}</Notice>}
      </main>

      <BottomDock>
        {basket.count === 0 ? (
          <ButtonLink to={base} variant="primary" size="lg" block>
            {t('basket.browseMenu')}
          </ButtonLink>
        ) : (
          <Button variant="primary" size="lg" block loading={placeOrder.isPending} disabled={!canOrder} onClick={submit} className={styles.submit}>
            {placeOrder.isPending ? (
              t('checkout.sending')
            ) : !canOrder ? (
              t(menu.offline ? 'menu.offlineTitle' : 'menu.closedTitle')
            ) : (
              <>
                <span>{t('checkout.submit')}</span>
                <span>{formatLek(basket.totalLek)}</span>
              </>
            )}
          </Button>
        )}
      </BottomDock>
    </>
  );
}
