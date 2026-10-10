import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ALLERGENS } from '@shared/allergens';
import { formatLek } from '@shared/money';
import type { MenuItemInput } from '@shared/schemas';
import type { ItemTag, Language, LocalizedText, MenuItem, MenuOption, MenuOptionGroup } from '@shared/types';
import { resizeImageToBlob } from '../../lib/image';
import { Button, ButtonLink } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { DishImage, Notice } from '../../ui/primitives';
import { addCategory, archiveItem, createItem, setCategoryShown, setItemAvailable, updateItem, uploadPhoto } from '../api';
import { ConfirmDialog, PageHeader, Switch, useStaffText, useStaffToast } from '../components';
import { useMenuAdminQuery, useQrTablesQuery, useStaffMutation, useVenueQuery } from '../queries';
import staffStyles from '../staff.module.css';
import styles from './MenuManagerScreen.module.css';

const TAGS: ItemTag[] = ['vegetarian', 'spicy', 'new'];

export function MenuManagerScreen() {
  const { t } = useTranslation();
  const menu = useMenuAdminQuery();
  const venueQuery = useVenueQuery();
  const qr = useQrTablesQuery();
  const text = useStaffText(venueQuery.data);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuItem | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const toggle = useStaffMutation(({ id, on }: { id: string; on: boolean }) => setItemAvailable(id, on));
  const createCategory = useStaffMutation(addCategory);
  const showCategory = useStaffMutation(({ id, on }: { id: string; on: boolean }) => setCategoryShown(id, on));

  if (!menu.data || !venueQuery.data) return <p className={staffStyles.loading}>{t('common.loading')}</p>;
  const { categories, items } = menu.data;
  const venue = venueQuery.data;
  const activeCategory = categoryId ?? categories[0]?.id ?? null;
  const current = categories.find((c) => c.id === activeCategory);
  const list = items.filter((i) => i.categoryId === activeCategory);
  const guestLink = qr.data?.tables[0] ? `/${venue.slug}/t/${qr.data.tables[0].qrToken}` : null;

  function startNewItem() {
    if (!activeCategory) return;
    // The id only tracks the draft in the editor; the server gives the dish its real one.
    setDraft({
      id: crypto.randomUUID(),
      categoryId: activeCategory,
      name: {},
      description: {},
      priceLek: 0,
      photoUrl: null,
      available: true,
      suggestInBasket: false,
      tags: [],
      allergens: [],
      optionGroups: [],
    });
  }

  function saveCategory() {
    const name = newCategory?.trim();
    if (!name) return;
    createCategory.mutate({ [venue.defaultLanguage]: name }, { onSuccess: (c) => { setCategoryId(c.id); setNewCategory(null); } });
  }

  return (
    <>
      <KilimBand height={10} />
      <div className={staffStyles.content}>
        <PageHeader
          title={t('staff.menu.title')}
          actions={
            guestLink && (
              <ButtonLink to={guestLink} target="_blank" variant="outline">
                <Icon name="external" size={18} />
                {t('staff.menu.viewAsGuest')}
              </ButtonLink>
            )
          }
        />
        <div className={styles.layout} data-editing={draft ? true : undefined}>
          {/* Categories */}
          <nav className={styles.categories} aria-label={t('staff.menu.categories')}>
            <h2 className={styles.paneTitle}>{t('staff.menu.categories')}</h2>
            <ul>
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.category}
                    aria-current={c.id === activeCategory ? 'true' : undefined}
                    onClick={() => {
                      setCategoryId(c.id);
                      setDraft(null);
                    }}
                  >
                    <span className={styles.categoryName}>
                      {text(c.name)}
                      {!c.active && <span className={styles.hiddenTag}>{t('staff.menu.hidden')}</span>}
                    </span>
                    <span className={styles.count}>{items.filter((i) => i.categoryId === c.id).length}</span>
                  </button>
                </li>
              ))}
            </ul>
            {newCategory === null ? (
              <button type="button" className={styles.addLink} onClick={() => setNewCategory('')}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                {t('staff.menu.addCategory')}
              </button>
            ) : (
              <form
                className={styles.newCategory}
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCategory();
                }}
              >
                <input
                  autoFocus
                  className={styles.input}
                  placeholder={t('staff.menu.categoryName')}
                  aria-label={t('staff.menu.categoryName')}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button type="submit" loading={createCategory.isPending}>
                  {t('staff.menu.add')}
                </Button>
              </form>
            )}
          </nav>

          {/* Items */}
          <section className={styles.items} aria-labelledby="items-title">
            <div className={styles.paneHead}>
              <h2 id="items-title" className={styles.paneTitle}>
                {t('staff.menu.items')}
              </h2>
              <Button variant="dark" onClick={startNewItem}>
                <Icon name="plus" size={18} strokeWidth={2.6} />
                {t('staff.menu.addItem')}
              </Button>
            </div>
            {current && (
              <div className={styles.shown}>
                <Switch checked={current.active} label={t('staff.menu.shownToGuests')} onChange={(on) => showCategory.mutate({ id: current.id, on })} />
                {t('staff.menu.shownToGuests')}
              </div>
            )}
            {current && !current.active && <Notice tone="info">{t('staff.menu.hiddenHint')}</Notice>}
            <ul className={styles.itemList}>
              {list.map((item) => (
                <li key={item.id}>
                  <div className={styles.itemRow} aria-current={draft?.id === item.id ? 'true' : undefined}>
                    <button type="button" className={styles.itemButton} onClick={() => setDraft(structuredClone(item))}>
                      <DishImage photoUrl={item.photoUrl} name={text(item.name)} variant="small" muted={!item.available} />
                      <span className={styles.itemText}>
                        <strong>{text(item.name)}</strong>
                        <span>{formatLek(item.priceLek)}</span>
                        {!item.available && <span className={styles.soldOut}>{t('menu.soldOut')}</span>}
                      </span>
                    </button>
                    <Switch checked={item.available} label={t('staff.menu.available')} onChange={(on) => toggle.mutate({ id: item.id, on })} />
                  </div>
                </li>
              ))}
            </ul>
            {list.length === 0 && <p className={styles.empty}>{t('staff.menu.noItems')}</p>}
          </section>

          {/* Editor */}
          <section className={styles.editorPane} aria-label={t('staff.menu.editor')}>
            {draft ? (
              <ItemEditor
                key={draft.id}
                initial={draft}
                languages={venue.languages}
                defaultLanguage={venue.defaultLanguage}
                isNew={!items.some((i) => i.id === draft.id)}
                onDone={() => setDraft(null)}
              />
            ) : (
              <div className={styles.editorEmpty}>
                <Icon name="pencil" size={32} strokeWidth={1.6} />
                <p>{t('staff.menu.selectItem')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * The request body for saving a dish. Groups and options that existed when the editor opened keep
 * their ids (the server updates them); ones added in the editor go without (the server creates them).
 */
function toInput(item: MenuItem, original: MenuItem | null): MenuItemInput {
  const knownGroups = new Set(original?.optionGroups.map((g) => g.id));
  const knownOptions = new Set(original?.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
  return {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    priceLek: item.priceLek,
    photoUrl: item.photoUrl,
    available: item.available,
    suggestInBasket: item.suggestInBasket,
    tags: item.tags,
    allergens: item.allergens,
    optionGroups: item.optionGroups.map((group) => ({
      ...(knownGroups.has(group.id) ? { id: group.id } : {}),
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({
        ...(knownOptions.has(option.id) ? { id: option.id } : {}),
        name: option.name,
        priceDeltaLek: option.priceDeltaLek,
        available: option.available,
      })),
    })),
  };
}

interface EditorProps {
  initial: MenuItem;
  languages: Language[];
  defaultLanguage: Language;
  isNew: boolean;
  onDone: () => void;
}

function ItemEditor({ initial, languages, defaultLanguage, isNew, onDone }: EditorProps) {
  const { t } = useTranslation();
  const toast = useStaffToast();
  const [item, setItem] = useState(initial);
  const [lang, setLang] = useState<Language>(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const save = useStaffMutation((draft: MenuItem) => (isNew ? createItem(toInput(draft, null)) : updateItem(draft.id, toInput(draft, initial))));
  const archive = useStaffMutation(archiveItem);
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(item) !== JSON.stringify(initial);

  const patch = (changes: Partial<MenuItem>) => setItem((current) => ({ ...current, ...changes }));
  const setText = (field: 'name' | 'description', value: string) => patch({ [field]: { ...item[field], [lang]: value } });

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Shrunk in the browser first: phone photos are often bigger than the upload limit.
      patch({ photoUrl: await uploadPhoto('dish', await resizeImageToBlob(file, 1600)) });
    } catch (err) {
      setError(t(`errors.api.${(err as Error).message}`, { defaultValue: t('errors.generic') }));
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!item.name[defaultLanguage]?.trim()) {
      setLang(defaultLanguage);
      setError(t('staff.menu.missingName', { language: t(`language.${defaultLanguage}`) }));
      return;
    }
    setError(null);
    save.mutate(item, {
      onSuccess: () => {
        toast(t('staff.menu.saved'));
        onDone();
      },
      onError: (err) => setError(t(`errors.api.${err.message}`, { defaultValue: t('errors.generic') })),
    });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <h2 className={styles.editorTitle}>{item.name[lang] || item.name[defaultLanguage] || t('staff.menu.newItem')}</h2>
        <button type="button" className={staffStyles.iconButton} onClick={onDone} aria-label={t('common.close')}>
          <Icon name="close" size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className={styles.editorScroll}>
        {/* Photo */}
        <div className={styles.photo}>
          {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <Icon name="image" size={36} strokeWidth={1.5} />}
          <div className={styles.photoActions}>
            <label className={styles.fileButton}>
              <Icon name="image" size={18} />
              {uploading ? t('common.loading') : item.photoUrl ? t('staff.menu.changePhoto') : t('staff.menu.addPhoto')}
              <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void onPhoto(e)} />
            </label>
            {item.photoUrl && (
              <button type="button" className={styles.textButton} onClick={() => patch({ photoUrl: null })}>
                {t('staff.menu.removePhoto')}
              </button>
            )}
          </div>
        </div>

        {/* Texts per language */}
        <div className={styles.field}>
          <div className={styles.langTabs} role="tablist" aria-label={t('staff.menu.textLanguage')}>
            {languages.map((code) => (
              <button key={code} type="button" role="tab" aria-selected={code === lang} className={styles.langTab} onClick={() => setLang(code)}>
                {code.toUpperCase()}
                {!item.name[code]?.trim() && <span className={styles.missingDot} aria-label={t('staff.menu.missingText')} />}
              </button>
            ))}
          </div>
          <label className={styles.label}>
            {t('staff.menu.name')}
            <input className={styles.input} lang={lang} value={item.name[lang] ?? ''} onChange={(e) => setText('name', e.target.value)} />
          </label>
          <label className={styles.label}>
            {t('staff.menu.description')}
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              lang={lang}
              value={item.description[lang] ?? ''}
              onChange={(e) => setText('description', e.target.value)}
            />
          </label>
        </div>

        {/* Price */}
        <label className={styles.label}>
          {t('staff.menu.price')}
          <span className={styles.priceInput}>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={0}
              step={10}
              value={item.priceLek}
              onChange={(e) => patch({ priceLek: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            <span>L</span>
          </span>
        </label>

        {/* Switches */}
        <div className={styles.switchRows}>
          <div className={styles.switchRow}>
            <span>
              <strong>{t('staff.menu.available')}</strong>
              <small>{t('staff.menu.availableHint')}</small>
            </span>
            <Switch checked={item.available} label={t('staff.menu.available')} onChange={(on) => patch({ available: on })} />
          </div>
          <div className={styles.switchRow}>
            <span>
              <strong>{t('staff.menu.suggest')}</strong>
              <small>{t('staff.menu.suggestHint')}</small>
            </span>
            <Switch checked={item.suggestInBasket} label={t('staff.menu.suggest')} onChange={(on) => patch({ suggestInBasket: on })} />
          </div>
        </div>

        {/* Tags and allergens */}
        <fieldset className={styles.chipsField}>
          <legend className={styles.legend}>{t('staff.menu.tags')}</legend>
          <div className={styles.chips}>
            {TAGS.map((tag) => (
              <ChipToggle key={tag} on={item.tags.includes(tag)} label={t(`tags.${tag}`)} onChange={(on) => patch({ tags: on ? [...item.tags, tag] : item.tags.filter((x) => x !== tag) })} />
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.chipsField}>
          <legend className={styles.legend}>{t('staff.menu.allergens')}</legend>
          <div className={styles.chips}>
            {ALLERGENS.map((a) => (
              <ChipToggle
                key={a}
                tone="warning"
                on={item.allergens.includes(a)}
                label={t(`allergens.${a}`)}
                onChange={(on) => patch({ allergens: on ? [...item.allergens, a] : item.allergens.filter((x) => x !== a) })}
              />
            ))}
          </div>
        </fieldset>

        {/* Option groups */}
        <OptionGroupsEditor groups={item.optionGroups} lang={lang} onChange={(optionGroups) => patch({ optionGroups })} />

        {error && <Notice icon="info">{error}</Notice>}
      </div>

      <footer className={styles.editorFoot}>
        {!isNew && (
          <button type="button" className={styles.archiveButton} onClick={() => setConfirmArchive(true)}>
            {t('staff.menu.archive')}
          </button>
        )}
        {dirty && <span className={styles.unsaved}>{t('staff.menu.unsaved')}</span>}
        <Button onClick={submit} loading={save.isPending} disabled={!dirty && !isNew}>
          {t('staff.menu.save')}
        </Button>
      </footer>

      <ConfirmDialog
        open={confirmArchive}
        title={t('staff.menu.archiveTitle', { name: item.name[defaultLanguage] ?? '' })}
        body={t('staff.menu.archiveBody')}
        confirmLabel={t('staff.menu.archiveConfirm')}
        cancelLabel={t('staff.common.keep')}
        tone="danger"
        busy={archive.isPending}
        onConfirm={() => archive.mutate(item.id, { onSuccess: () => { setConfirmArchive(false); onDone(); } })}
        onClose={() => setConfirmArchive(false)}
      />
    </div>
  );
}

function ChipToggle({ on, label, onChange, tone = 'brand' }: { on: boolean; label: string; onChange: (on: boolean) => void; tone?: 'brand' | 'warning' }) {
  return (
    <button type="button" aria-pressed={on} className={styles.chip} data-tone={tone} onClick={() => onChange(!on)}>
      {on && <Icon name="check" size={14} strokeWidth={3} />}
      {label}
    </button>
  );
}

function OptionGroupsEditor({ groups, lang, onChange }: { groups: MenuOptionGroup[]; lang: Language; onChange: (groups: MenuOptionGroup[]) => void }) {
  const { t } = useTranslation();
  const setGroup = (index: number, changes: Partial<MenuOptionGroup>) => onChange(groups.map((g, i) => (i === index ? { ...g, ...changes } : g)));
  const setOption = (gi: number, oi: number, changes: Partial<MenuOption>) =>
    setGroup(gi, { options: groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...changes } : o)) });
  const withText = (text: LocalizedText, value: string) => ({ ...text, [lang]: value });

  return (
    <fieldset className={styles.chipsField}>
      <legend className={styles.legend}>{t('staff.menu.optionGroups')}</legend>
      <div className={styles.groups}>
        {groups.map((group, gi) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHead}>
              <input
                className={styles.input}
                lang={lang}
                placeholder={t('staff.menu.groupName')}
                aria-label={t('staff.menu.groupName')}
                value={group.name[lang] ?? ''}
                onChange={(e) => setGroup(gi, { name: withText(group.name, e.target.value) })}
              />
              <button type="button" className={staffStyles.iconButton} onClick={() => onChange(groups.filter((_, i) => i !== gi))} aria-label={t('staff.menu.removeGroup')}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <div className={styles.groupRules}>
              <label className={styles.inlineSwitch}>
                <Switch checked={group.minSelect > 0} label={t('item.required')} onChange={(on) => setGroup(gi, { minSelect: on ? 1 : 0 })} />
                {t('item.required')}
              </label>
              <label className={styles.inlineNumber}>
                {t('staff.menu.maxChoices')}
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={Math.max(1, group.options.length)}
                  value={group.maxSelect}
                  onChange={(e) => setGroup(gi, { maxSelect: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                />
              </label>
            </div>
            <ul className={styles.options}>
              {group.options.map((option, oi) => (
                <li key={option.id} className={styles.option}>
                  <input
                    className={styles.input}
                    lang={lang}
                    placeholder={t('staff.menu.optionName')}
                    aria-label={t('staff.menu.optionName')}
                    value={option.name[lang] ?? ''}
                    onChange={(e) => setOption(gi, oi, { name: withText(option.name, e.target.value) })}
                  />
                  <span className={styles.deltaInput}>
                    <span aria-hidden>+</span>
                    <input
                      className={styles.input}
                      type="number"
                      step={10}
                      aria-label={t('staff.menu.priceDelta')}
                      value={option.priceDeltaLek}
                      onChange={(e) => setOption(gi, oi, { priceDeltaLek: Math.round(Number(e.target.value) || 0) })}
                    />
                  </span>
                  <Switch checked={option.available} label={t('staff.menu.available')} onChange={(on) => setOption(gi, oi, { available: on })} />
                  <button
                    type="button"
                    className={styles.removeOption}
                    onClick={() => setGroup(gi, { options: group.options.filter((_, i) => i !== oi) })}
                    aria-label={t('staff.menu.removeOption')}
                  >
                    <Icon name="close" size={16} strokeWidth={2.4} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.addLink}
              onClick={() => setGroup(gi, { options: [...group.options, { id: crypto.randomUUID(), name: {}, priceDeltaLek: 0, available: true }] })}
            >
              <Icon name="plus" size={16} strokeWidth={2.6} />
              {t('staff.menu.addOption')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.addGroup}
          onClick={() => onChange([...groups, { id: crypto.randomUUID(), name: {}, minSelect: 0, maxSelect: 1, options: [] }])}
        >
          <Icon name="plus" size={18} strokeWidth={2.6} />
          {t('staff.menu.addGroup')}
        </button>
      </div>
    </fieldset>
  );
}
