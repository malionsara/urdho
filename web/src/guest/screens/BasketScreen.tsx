import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatLek } from '@shared/money';
import { defaultOptionIds, lineTotalLek } from '@shared/pricing';
import type { MenuItem } from '@shared/types';
import { ButtonLink } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { DishImage, Notice, Stepper, TextArea } from '../../ui/primitives';
import { BottomDock, StateMessage, TableChip, TopBar } from '../components';
import { useGuest, type BasketLine } from '../GuestContext';
import styles from './BasketScreen.module.css';

const MAX_ADDONS = 8;

export function BasketScreen() {
  const { t } = useTranslation();
  const { basket, base, menu } = useGuest();

  if (basket.count === 0) {
    return (
      <>
        <TopBar title={t('basket.title')} backTo={base} right={<TableChip />} />
        <StateMessage
          icon="bag"
          title={t('basket.emptyTitle')}
          body={t('basket.emptyBody')}
          action={<ButtonLink to={base}>{t('basket.browseMenu')}</ButtonLink>}
        />
      </>
    );
  }

  const addons = menu.categories
    .flatMap((c) => c.items)
    .filter((i) => i.suggestInBasket && i.available && basket.quantityOf(i.id) === 0)
    .slice(0, MAX_ADDONS);

  return (
    <>
      <TopBar title={t('basket.title')} backTo={base} right={<TableChip />} />
      <main className={styles.page}>
        <ul className={styles.lines}>
          {basket.lines.map((line) => (
            <li key={line.id}>
              <LineRow line={line} />
            </li>
          ))}
        </ul>

        {addons.length > 0 && (
          <section className={styles.addons} aria-labelledby="addons-title">
            <KilimBand height={16} />
            <h2 id="addons-title" className={styles.addonsTitle}>
              {t('basket.addons')}
            </h2>
            <div className={styles.addonStrip}>
              {addons.map((item) => (
                <AddonCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        <section className={styles.noteSection}>
          <TextArea
            label={t('basket.noteLabel')}
            placeholder={t('basket.notePlaceholder')}
            value={basket.note}
            maxLength={280}
            onChange={(e) => basket.setNote(e.target.value)}
          />
          <Notice>{t('basket.allergyNotice')}</Notice>
        </section>

        <div className={styles.totalRow}>
          <span>{t('common.total')}</span>
          <span className={styles.totalValue}>{formatLek(basket.totalLek)}</span>
        </div>
      </main>

      <BottomDock>
        <ButtonLink to={`${base}/checkout`} variant="primary" size="lg" block className={styles.continue}>
          <span>{t('basket.continue')}</span>
          <span>{formatLek(basket.totalLek)}</span>
        </ButtonLink>
      </BottomDock>
    </>
  );
}

function LineRow({ line }: { line: BasketLine }) {
  const { t } = useTranslation();
  const { itemsById, text, basket, base } = useGuest();
  const item = itemsById.get(line.itemId)!;
  const name = text(item.name);
  const options = item.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => line.optionIds.includes(o.id))
    .map((o) => text(o.name));

  return (
    <div className={styles.line}>
      <DishImage photoUrl={item.photoUrl} name={name} variant="small" />
      <div className={styles.lineBody}>
        <div className={styles.lineTop}>
          <h3 className={styles.lineName}>{name}</h3>
          <span className={styles.linePrice}>{formatLek(lineTotalLek(item, line.optionIds, line.qty))}</span>
        </div>
        {options.length > 0 && <p className={styles.lineOptions}>{options.join(' · ')}</p>}
        <div className={styles.lineActions}>
          <Stepper
            size="sm"
            value={line.qty}
            onChange={(qty) => basket.setQty(line.id, qty)}
            removeIcon
            decreaseLabel={line.qty <= 1 ? t('basket.remove') : t('item.decrease')}
            increaseLabel={t('item.increase')}
          />
          {item.optionGroups.length > 0 && (
            <Link to={`${base}/item/${item.id}?line=${line.id}`} className={styles.editLink}>
              <Icon name="pencil" size={16} />
              {t('basket.edit')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AddonCard({ item }: { item: MenuItem }) {
  const { t } = useTranslation();
  const { text, basket, base, toast } = useGuest();
  const name = text(item.name);
  const options = defaultOptionIds(item);

  return (
    <div className={styles.addon}>
      <Link to={`${base}/item/${item.id}`} className={styles.addonLink}>
        <DishImage photoUrl={item.photoUrl} name={name} variant="card" />
        <span className={styles.addonName}>{name}</span>
        <span className={styles.addonPrice}>{formatLek(lineTotalLek(item, options, 1))}</span>
      </Link>
      <button
        type="button"
        className={styles.addonAdd}
        aria-label={t('basket.addAddon', { name })}
        onClick={() => {
          basket.add(item.id, options, 1);
          toast.show(t('item.added'));
        }}
      >
        <Icon name="plus" size={20} strokeWidth={2.4} />
      </button>
    </div>
  );
}
