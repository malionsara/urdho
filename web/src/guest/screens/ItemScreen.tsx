import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { formatLek, formatLekDelta } from '@shared/money';
import { checkSelection, defaultOptionIds, lineTotalLek } from '@shared/pricing';
import type { MenuItem, MenuOptionGroup } from '@shared/types';
import { navMotion } from '../../lib/motion';
import { Button, ButtonLink } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Badge, DishImage, Stepper } from '../../ui/primitives';
import { BottomDock, StateMessage, TagBadge } from '../components';
import { useGuest } from '../GuestContext';
import styles from './ItemScreen.module.css';

export function ItemScreen() {
  const { itemId = '' } = useParams();
  const { t } = useTranslation();
  const { itemsById, base } = useGuest();
  const item = itemsById.get(itemId);

  if (!item || !item.available) {
    return (
      <StateMessage
        icon="cloche"
        title={t('item.notFound')}
        action={<ButtonLink to={base} variant="outline">{t('basket.browseMenu')}</ButtonLink>}
      />
    );
  }
  return <ItemDetails key={item.id} item={item} />;
}

function ItemDetails({ item }: { item: MenuItem }) {
  const { t } = useTranslation();
  const { text, basket, base, toast } = useGuest();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editing = basket.lines.find((l) => l.id === params.get('line'));

  const [selected, setSelected] = useState<string[]>(() => editing?.optionIds ?? defaultOptionIds(item));
  const [qty, setQty] = useState(editing?.qty ?? 1);

  const name = text(item.name);
  const missingRequired = checkSelection(item.optionGroups, selected).some((p) => p.kind === 'too-few');
  const total = lineTotalLek(item, selected, qty);

  function leave(fallback: string) {
    // Going back keeps the menu's scroll position (and replays the opening transition in reverse);
    // a fresh tab has nothing to go back to.
    if (location.key !== 'default') navigate(-1);
    else navigate(fallback, { replace: true, viewTransition: true, state: navMotion('back') });
  }

  function toggle(group: MenuOptionGroup, optionId: string) {
    setSelected((current) => {
      const inGroup = new Set(group.options.map((o) => o.id));
      const isOn = current.includes(optionId);
      if (group.maxSelect === 1) {
        const others = current.filter((id) => !inGroup.has(id));
        if (isOn) return group.minSelect === 1 ? current : others;
        return [...others, optionId];
      }
      if (isOn) return current.filter((id) => id !== optionId);
      const count = current.filter((id) => inGroup.has(id)).length;
      return count >= group.maxSelect ? current : [...current, optionId];
    });
  }

  function submit() {
    if (editing) {
      basket.replace(editing.id, selected, qty);
      leave(`${base}/basket`);
    } else {
      basket.add(item.id, selected, qty);
      toast.show(t('item.added'));
      leave(base);
    }
  }

  return (
    <>
      <div className={styles.hero}>
        <DishImage photoUrl={item.photoUrl} name={name} variant="hero" transitionName="dish-photo" />
        <button type="button" className={styles.heroBack} onClick={() => leave(base)} aria-label={t('common.back')}>
          <Icon name="back" size={22} strokeWidth={2.2} />
        </button>
      </div>

      <main className={styles.panel}>
        <h1 className={styles.name}>{name}</h1>
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatLek(item.priceLek)}</span>
          {item.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
        <p className={styles.description}>{text(item.description)}</p>

        <details className={styles.allergens}>
          <summary>
            <Icon name="info" size={18} />
            <span className={styles.allergensLabel}>
              {t('item.allergens')}
              {item.allergens.length > 0 && <span className={styles.allergensCount}>{item.allergens.length}</span>}
            </span>
            <Icon name="chevronDown" size={18} className={styles.chevron} />
          </summary>
          <div className={styles.allergensBody}>
            {item.allergens.length > 0 ? (
              <ul className={styles.allergenList}>
                {item.allergens.map((a) => (
                  <li key={a}>{t(`allergens.${a}`)}</li>
                ))}
              </ul>
            ) : (
              <p>{t('item.noAllergens')}</p>
            )}
            <p className={styles.allergenNote}>{t('item.allergyConfirm')}</p>
          </div>
        </details>

        {item.optionGroups.map((group) => (
          <OptionGroup key={group.id} group={group} selected={selected} onToggle={(id) => toggle(group, id)} />
        ))}

        <div className={styles.quantityRow}>
          <span className={styles.quantityLabel}>{t('item.quantity')}</span>
          <Stepper value={qty} onChange={setQty} min={1} decreaseLabel={t('item.decrease')} increaseLabel={t('item.increase')} />
        </div>
      </main>

      <BottomDock>
        <Button variant="primary" size="lg" block onClick={submit} disabled={missingRequired} className={styles.addButton}>
          {missingRequired ? (
            t('item.chooseRequired')
          ) : (
            <>
              <span>{editing ? t('item.save') : t('item.add')}</span>
              <span className={styles.addPrice}>{formatLek(total)}</span>
            </>
          )}
        </Button>
      </BottomDock>
    </>
  );
}

function OptionGroup({ group, selected, onToggle }: { group: MenuOptionGroup; selected: string[]; onToggle: (optionId: string) => void }) {
  const { t } = useTranslation();
  const { text } = useGuest();
  const single = group.maxSelect === 1;
  const required = group.minSelect > 0;
  const chosenInGroup = group.options.filter((o) => selected.includes(o.id)).length;
  const full = !single && chosenInGroup >= group.maxSelect;

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupHeader}>
        <span className={styles.groupName}>{text(group.name)}</span>
        <Badge tone={required ? 'saffron' : 'neutral'}>{required ? t('item.required') : t('item.optional')}</Badge>
      </legend>
      <p className={styles.groupHint}>{single ? t('item.chooseOne') : t('item.chooseUpTo', { count: group.maxSelect })}</p>
      <div className={styles.options}>
        {group.options.map((option) => {
          const checked = selected.includes(option.id);
          const disabled = !option.available || (full && !checked);
          return (
            <label key={option.id} className={styles.option} data-checked={checked || undefined} data-disabled={disabled || undefined}>
              <input
                type={single ? 'radio' : 'checkbox'}
                name={group.id}
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(option.id)}
                className="visually-hidden"
              />
              <span className={single ? styles.radio : styles.checkbox} aria-hidden>
                {checked && !single && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
              <span className={styles.optionName}>{text(option.name)}</span>
              <span className={styles.optionPrice}>
                {option.available ? formatLekDelta(option.priceDeltaLek) : t('menu.soldOut')}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
