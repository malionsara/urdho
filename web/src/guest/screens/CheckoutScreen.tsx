import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { formatLek } from '@shared/money';
import { lineTotalLek } from '@shared/pricing';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Notice, TextField } from '../../ui/primitives';
import { BottomDock, TableChip, TopBar } from '../components';
import { useGuest } from '../GuestContext';
import { usePlaceOrder } from '../queries';
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
  const { basket, base, slug, qrToken, itemsById, text } = useGuest();
  const navigate = useNavigate();
  const [guestName, setGuestName] = useState(storedName);
  const placeOrder = usePlaceOrder(slug, qrToken);

  // Nothing to order: back to the basket. Only before submitting, since a placed order empties the basket.
  if (basket.count === 0 && placeOrder.isIdle) return <Navigate to={`${base}/basket`} replace />;

  function submit() {
    try {
      localStorage.setItem(NAME_KEY, guestName.trim());
    } catch {
      // ignore
    }
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
          navigate(`${base}/order/${orderId}`, { replace: true });
        },
      },
    );
  }

  return (
    <>
      <TopBar title={t('checkout.title')} backTo={`${base}/basket`} right={<TableChip />} />
      <main className={styles.page}>
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

        {placeOrder.isError && (
          <Notice icon="wifiOff">{t('checkout.error')}</Notice>
        )}
      </main>

      <BottomDock>
        <Button variant="primary" size="lg" block loading={placeOrder.isPending} onClick={submit} className={styles.submit}>
          {placeOrder.isPending ? (
            t('checkout.sending')
          ) : (
            <>
              <span>{t('checkout.submit')}</span>
              <span>{formatLek(basket.totalLek)}</span>
            </>
          )}
        </Button>
      </BottomDock>
    </>
  );
}
