import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language, type OpeningDay, type Venue } from '@shared/types';
import { brandStyle, parseHex } from '../../lib/brand';
import { resizeImage } from '../../lib/image';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { saveVenue } from '../api';
import { PageHeader, Switch, useStaffToast } from '../components';
import { useStaffMutation, useVenueQuery } from '../queries';
import staffStyles from '../staff.module.css';
import styles from './SettingsScreen.module.css';

const SWATCHES = ['#C8432A', '#1F5E45', '#1E5B8C', '#6B2D5C', '#5E6B1F', '#2B231E', '#D9A21B'];

export function SettingsScreen() {
  const { t } = useTranslation();
  const venue = useVenueQuery();
  if (!venue.data) return <p className={staffStyles.loading}>{t('common.loading')}</p>;
  return <SettingsForm key={JSON.stringify(venue.data)} initial={venue.data} />;
}

function SettingsForm({ initial }: { initial: Venue }) {
  const { t } = useTranslation();
  const toast = useStaffToast();
  const [venue, setVenue] = useState(initial);
  const [hex, setHex] = useState(initial.brandColor);
  const save = useStaffMutation(saveVenue);
  const dirty = JSON.stringify(venue) !== JSON.stringify(initial);
  const patch = (changes: Partial<Venue>) => setVenue((v) => ({ ...v, ...changes }));

  async function upload(e: ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'coverUrl') {
    const file = e.target.files?.[0];
    if (file) patch({ [field]: await resizeImage(file, field === 'coverUrl' ? 1200 : 400) });
    e.target.value = '';
  }

  function setColour(value: string) {
    setHex(value);
    const rgb = parseHex(value);
    if (rgb) patch({ brandColor: value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}` });
  }

  function toggleLanguage(code: Language, on: boolean) {
    const languages = on ? LANGUAGES.filter((l) => l === code || venue.languages.includes(l)) : venue.languages.filter((l) => l !== code);
    if (languages.length === 0) return;
    patch({ languages, defaultLanguage: languages.includes(venue.defaultLanguage) ? venue.defaultLanguage : languages[0]! });
  }

  const setDay = (day: number, changes: Partial<OpeningDay>) =>
    patch({ openingHours: venue.openingHours.map((d) => (d.day === day ? { ...d, ...changes } : d)) });

  return (
    <>
      <KilimBand height={10} />
      <div className={staffStyles.content}>
        <PageHeader title={t('staff.settings.title')} />
        <div className={styles.layout}>
          <div className={styles.sections}>
            <Section title={t('staff.settings.brand')}>
              <label className={styles.label}>
                {t('staff.settings.name')}
                <input className={styles.input} value={venue.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>

              <div className={styles.uploads}>
                <div className={styles.upload}>
                  <span className={styles.labelText}>{t('staff.settings.logo')}</span>
                  <div className={styles.logoPreview}>{venue.logoUrl ? <img src={venue.logoUrl} alt="" /> : <Icon name="image" size={28} strokeWidth={1.6} />}</div>
                  <UploadButtons hasImage={!!venue.logoUrl} onFile={(e) => void upload(e, 'logoUrl')} onRemove={() => patch({ logoUrl: null })} />
                </div>
                <div className={styles.upload}>
                  <span className={styles.labelText}>{t('staff.settings.cover')}</span>
                  <div className={styles.coverPreview}>{venue.coverUrl ? <img src={venue.coverUrl} alt="" /> : <Icon name="image" size={28} strokeWidth={1.6} />}</div>
                  <UploadButtons hasImage={!!venue.coverUrl} onFile={(e) => void upload(e, 'coverUrl')} onRemove={() => patch({ coverUrl: null })} />
                </div>
              </div>

              <div className={styles.colourField}>
                <span className={styles.labelText}>{t('staff.settings.colour')}</span>
                <p className={styles.hint}>{t('staff.settings.colourHint')}</p>
                <div className={styles.swatches}>
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={styles.swatch}
                      style={{ background: swatch }}
                      aria-pressed={venue.brandColor.toUpperCase() === swatch}
                      aria-label={swatch}
                      onClick={() => setColour(swatch)}
                    >
                      {venue.brandColor.toUpperCase() === swatch && <Icon name="check" size={18} strokeWidth={3} />}
                    </button>
                  ))}
                  <label className={styles.hexField}>
                    <span className={styles.hexDot} style={{ background: venue.brandColor }} aria-hidden />
                    <input
                      className={styles.input}
                      value={hex}
                      maxLength={7}
                      spellCheck={false}
                      aria-label={t('staff.settings.colourHex')}
                      aria-invalid={!parseHex(hex) || undefined}
                      onChange={(e) => setColour(e.target.value.trim())}
                    />
                  </label>
                </div>
              </div>
            </Section>

            <Section title={t('staff.settings.languages')}>
              <div className={styles.languages}>
                {LANGUAGES.map((code) => (
                  <div key={code} className={styles.languageRow}>
                    <Switch checked={venue.languages.includes(code)} label={t(`language.${code}`)} onChange={(on) => toggleLanguage(code, on)} />
                    <span>{t(`language.${code}`)}</span>
                    {venue.languages.includes(code) && (
                      <button
                        type="button"
                        className={styles.defaultButton}
                        aria-pressed={venue.defaultLanguage === code}
                        onClick={() => patch({ defaultLanguage: code })}
                      >
                        {venue.defaultLanguage === code ? t('staff.settings.isDefault') : t('staff.settings.makeDefault')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className={styles.hint}>{t('staff.settings.languagesHint')}</p>
            </Section>

            <Section title={t('staff.settings.hours')}>
              <ul className={styles.hours}>
                {venue.openingHours.map((day) => (
                  <li key={day.day} className={styles.hourRow} data-closed={!day.open || undefined}>
                    <span className={styles.dayName}>{t(`staff.settings.days.${day.day}`)}</span>
                    <Switch checked={day.open} label={t(`staff.settings.days.${day.day}`)} onChange={(open) => setDay(day.day, { open })} />
                    {day.open ? (
                      <span className={styles.times}>
                        <input
                          className={styles.input}
                          type="time"
                          value={day.from}
                          aria-label={t('staff.settings.opens')}
                          onChange={(e) => setDay(day.day, { from: e.target.value })}
                        />
                        <span aria-hidden>–</span>
                        <input
                          className={styles.input}
                          type="time"
                          value={day.to}
                          aria-label={t('staff.settings.closes')}
                          onChange={(e) => setDay(day.day, { to: e.target.value })}
                        />
                      </span>
                    ) : (
                      <span className={styles.closed}>{t('staff.settings.closed')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <aside className={styles.previewPane} aria-label={t('staff.settings.preview')}>
            <p className={styles.previewLabel}>{t('staff.settings.preview')}</p>
            <GuestPreview venue={venue} />
          </aside>
        </div>
      </div>

      <div className={styles.saveBar} data-visible={dirty || undefined}>
        <span>{t('staff.menu.unsaved')}</span>
        <Button variant="outline" onClick={() => setVenue(initial)}>
          {t('staff.settings.discard')}
        </Button>
        <Button onClick={() => save.mutate(venue, { onSuccess: () => toast(t('staff.settings.saved')) })} loading={save.isPending}>
          {t('staff.settings.save')}
        </Button>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function UploadButtons({ hasImage, onFile, onRemove }: { hasImage: boolean; onFile: (e: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.uploadButtons}>
      <label className={styles.fileButton}>
        {hasImage ? t('staff.settings.change') : t('staff.settings.upload')}
        <input type="file" accept="image/*" className="visually-hidden" onChange={onFile} />
      </label>
      {hasImage && (
        <button type="button" className={styles.textButton} onClick={onRemove}>
          {t('staff.settings.remove')}
        </button>
      )}
    </div>
  );
}

/** A small guest menu drawn with the draft settings, so owners see their brand before saving. */
function GuestPreview({ venue }: { venue: Venue }) {
  const { t } = useTranslation();
  const initials = venue.name
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('sq');
  return (
    <div data-brand className={styles.phone} style={brandStyle(venue.brandColor)}>
      <div className={styles.phoneHero}>
        {venue.coverUrl && <img src={venue.coverUrl} alt="" />}
        <span className={styles.phoneLogo}>{venue.logoUrl ? <img src={venue.logoUrl} alt="" /> : initials}</span>
        <span className={styles.phoneName}>{venue.name || '…'}</span>
        <span className={styles.phoneChip}>{t('common.table', { number: 4, lng: venue.defaultLanguage })}</span>
      </div>
      <KilimBand height={12} />
      <div className={styles.phoneTabs}>
        <span className={styles.phoneTabActive} />
        <span />
        <span />
      </div>
      <div className={styles.phoneBody}>
        <span className={styles.phoneLine} style={{ width: '45%' }} />
        <div className={styles.phoneRow}>
          <div>
            <span className={styles.phoneLine} style={{ width: '80%' }} />
            <span className={styles.phoneLineThin} style={{ width: '95%' }} />
            <span className={styles.phoneLineThin} style={{ width: '70%' }} />
          </div>
          <span className={styles.phoneThumb} />
        </div>
        <span className={styles.phoneButton}>{t('menu.viewBasket', { lng: venue.defaultLanguage })}</span>
      </div>
    </div>
  );
}
