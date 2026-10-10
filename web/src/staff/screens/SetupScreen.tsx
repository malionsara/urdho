import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { SetupMark, SetupStep, VenueSetup } from '@shared/types';
import { CONTACT, contactLinks } from '../../landing/contact';
import { Button, ButtonLink } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { markSetup } from '../api';
import { PageHeader } from '../components';
import { useQrTablesQuery, useSetupQuery, useStaffMutation, useVenueQuery } from '../queries';
import staffStyles from '../staff.module.css';
import styles from './SetupScreen.module.css';

/*
 * The owner's get-started list: what a new venue needs before its first guests. Most steps tick
 * themselves from the venue's data; the hours and the QR codes on the tables are ticked by hand.
 * It leaves the rail once everything is done, or when the owner puts it away.
 */

const STEPS: Record<SetupStep, { icon: IconName; to?: string; manual?: SetupMark }> = {
  look: { icon: 'sparkle', to: '/staff/settings' },
  hours: { icon: 'clock', to: '/staff/settings', manual: 'hours' },
  menu: { icon: 'book', to: '/staff/menu' },
  photos: { icon: 'image', to: '/staff/menu' },
  staff: { icon: 'users', to: '/staff/team' },
  qr: { icon: 'qr', to: '/staff/qr', manual: 'qr' },
  testOrder: { icon: 'receipt' },
};

export function SetupScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setup = useSetupQuery(true);
  const venue = useVenueQuery();
  const qr = useQrTablesQuery();
  const mark = useStaffMutation(markSetup);

  if (!setup.data || !venue.data) return <p className={staffStyles.loading}>{t('common.loading')}</p>;
  const { steps } = setup.data;
  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;

  return (
    <>
      <KilimBand height={10} />
      <div className={staffStyles.content}>
        <PageHeader title={t('staff.setup.title')} meta={<span className={styles.meta}>{t('staff.setup.progress', { done, total: steps.length })}</span>} />
        <div className={styles.wrap}>
          {allDone ? (
            <section className={styles.ready}>
              <Icon name="check" size={28} strokeWidth={3} />
              <div>
                <h2>{t('staff.setup.readyTitle')}</h2>
                <p>{t('staff.setup.readyBody')}</p>
              </div>
              <ButtonLink to="/staff/orders">{t('staff.setup.readyAction')}</ButtonLink>
            </section>
          ) : (
            <p className={styles.lead}>{t('staff.setup.lead')}</p>
          )}
          <div className={styles.bar} role="progressbar" aria-label={t('staff.setup.title')} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
            <span style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>

          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <StepCard
                key={step.key}
                step={step}
                number={index + 1}
                venueName={venue.data.name}
                guestLink={qr.data?.tables[0] ? `/${venue.data.slug}/t/${qr.data.tables[0].qrToken}` : null}
                onMark={(markKey, value) => mark.mutate({ mark: markKey, done: value })}
                busy={mark.isPending}
              />
            ))}
          </ol>

          {!allDone && (
            <button type="button" className={styles.dismiss} onClick={() => mark.mutate({ mark: 'dismissed', done: true }, { onSuccess: () => navigate('/staff/orders') })}>
              {t('staff.setup.dismiss')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function StepCard({
  step,
  number,
  venueName,
  guestLink,
  onMark,
  busy,
}: {
  step: VenueSetup['steps'][number];
  number: number;
  venueName: string;
  guestLink: string | null;
  onMark: (mark: SetupMark, done: boolean) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const config = STEPS[step.key];
  const key = `staff.setup.steps.${step.key}`;
  const whatsapp = contactLinks(t('staff.setup.steps.menu.whatsappMessage', { venue: venueName }), '').whatsapp;

  return (
    <li className={styles.step} data-done={step.done || undefined}>
      <span className={styles.marker} aria-hidden>
        {step.done ? <Icon name="check" size={18} strokeWidth={3} /> : number}
      </span>
      <div className={styles.body}>
        <h2 className={styles.title}>
          <Icon name={config.icon} size={18} />
          {t(`${key}.title`)}
          <span className="visually-hidden">{step.done ? t('staff.setup.done') : t('staff.setup.toDo')}</span>
        </h2>
        <p className={styles.text}>{t(`${key}.body`)}</p>

        {step.key === 'photos' && step.progress && step.progress.total > 0 && (
          <p className={styles.note}>{t('staff.setup.steps.photos.progress', { done: step.progress.done, total: step.progress.total })}</p>
        )}
        {step.key === 'menu' && (step.hiddenCategories ?? 0) > 0 && <p className={styles.warning}>{t('staff.setup.steps.menu.hidden', { count: step.hiddenCategories })}</p>}

        <div className={styles.actions}>
          {config.to && !step.done && (
            <ButtonLink to={config.to} variant="dark">
              {t(`${key}.action`)}
            </ButtonLink>
          )}
          {step.key === 'menu' && !step.done && whatsapp && (
            <a className={styles.link} href={whatsapp} target="_blank" rel="noopener">
              <Icon name="chat" size={16} />
              {t('staff.setup.steps.menu.whatsapp')}
            </a>
          )}
          {step.key === 'qr' && (
            <a className={styles.link} href={`/quick-start.html?venue=${encodeURIComponent(venueName)}${CONTACT.whatsapp ? `&help=${encodeURIComponent(`+${CONTACT.whatsapp}`)}` : ''}`} target="_blank" rel="noopener">
              <Icon name="printer" size={16} />
              {t('staff.setup.steps.qr.sheet')}
            </a>
          )}
          {step.key === 'testOrder' && !step.done && guestLink && (
            <ButtonLink to={guestLink} target="_blank" variant="dark">
              <Icon name="external" size={16} />
              {t(`${key}.action`)}
            </ButtonLink>
          )}
          {config.manual &&
            (step.done ? (
              <button type="button" className={styles.link} disabled={busy} onClick={() => onMark(config.manual!, false)}>
                {t('staff.setup.undo')}
              </button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => onMark(config.manual!, true)}>
                <Icon name="check" size={16} strokeWidth={3} />
                {t(`${key}.mark`)}
              </Button>
            ))}
        </div>
      </div>
    </li>
  );
}
