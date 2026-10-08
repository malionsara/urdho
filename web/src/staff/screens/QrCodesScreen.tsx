import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Venue } from '@shared/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { addTable, resetQrToken, type QrTable } from '../api';
import { ConfirmDialog, PageHeader, useStaffToast } from '../components';
import { useQrTablesQuery, useStaffMutation } from '../queries';
import staffStyles from '../staff.module.css';
import styles from './QrCodesScreen.module.css';

const tableUrl = (venue: Venue, table: QrTable) => `${window.location.origin}/${venue.slug}/t/${table.qrToken}`;

export function QrCodesScreen() {
  const { t } = useTranslation();
  const data = useQrTablesQuery();
  const add = useStaffMutation(addTable);

  // QR codes are drawn locally as SVG, so printing needs no network.
  const svgs = useQuery({
    queryKey: ['staff', 'qr-svg', data.data?.tables.map((x) => x.qrToken).join()],
    enabled: !!data.data,
    queryFn: async () => {
      const { tables, venue } = data.data!;
      const entries = await Promise.all(
        tables.map(async (table) => [table.id, await QRCode.toString(tableUrl(venue, table), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#17120f', light: '#ffffff' } })] as const),
      );
      return Object.fromEntries(entries);
    },
  });

  if (!data.data) return <p className={staffStyles.loading}>{t('common.loading')}</p>;
  const { tables, venue } = data.data;

  return (
    <>
      <KilimBand height={10} className={styles.screenOnly} />
      <div className={staffStyles.content}>
        <div className={styles.screenOnly}>
          <PageHeader
            title={t('staff.qr.title')}
            actions={
              <>
                <Button variant="outline" onClick={() => add.mutate(undefined)} loading={add.isPending}>
                  <Icon name="plus" size={18} strokeWidth={2.6} />
                  {t('staff.qr.addTable')}
                </Button>
                <Button onClick={() => window.print()}>
                  <Icon name="printer" size={18} />
                  {t('staff.qr.print')}
                </Button>
              </>
            }
          />
          <p className={styles.lead}>{t('staff.qr.lead')}</p>
        </div>

        <ul className={styles.grid}>
          {tables.map((table) => (
            <li key={table.id} className={styles.cell}>
              <TableCard venue={venue} table={table} svg={svgs.data?.[table.id]} />
              <CardActions venue={venue} table={table} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function TableCard({ venue, table, svg }: { venue: Venue; table: QrTable; svg: string | undefined }) {
  const { t } = useTranslation();
  const [primary, secondary] = [venue.defaultLanguage, venue.languages.find((l) => l !== venue.defaultLanguage)];
  return (
    <article className={styles.card} aria-label={t('common.table', { number: table.number })}>
      <KilimBand height={14} />
      <div className={styles.cardBody}>
        <p className={styles.venue}>{venue.name}</p>
        <p className={styles.scan}>{t('staff.qr.scan', { lng: primary })}</p>
        {secondary && <p className={styles.scanSecondary}>{t('staff.qr.scan', { lng: secondary })}</p>}
        <div className={styles.qr}>
          {/* Generated locally by the qrcode library from our own URL. */}
          {svg ? <div className={styles.qrSvg} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className={styles.qrPlaceholder} />}
        </div>
        <p className={styles.tableLabel}>
          <span>{t('staff.qr.table', { lng: primary })}</span>
          <strong>{table.number}</strong>
        </p>
        <p className={styles.pay}>
          {t('menu.payAtEnd', { lng: primary })}
          {secondary && <> · {t('menu.payAtEnd', { lng: secondary })}</>}
        </p>
      </div>
      <KilimBand height={14} />
    </article>
  );
}

function CardActions({ venue, table }: { venue: Venue; table: QrTable }) {
  const { t } = useTranslation();
  const toast = useStaffToast();
  const [confirm, setConfirm] = useState(false);
  const reset = useStaffMutation(resetQrToken);
  return (
    <div className={`${styles.actions} ${styles.screenOnly}`}>
      <a href={tableUrl(venue, table)} target="_blank" rel="noreferrer" className={styles.action}>
        <Icon name="external" size={16} />
        {t('staff.qr.open')}
      </a>
      <button type="button" className={styles.action} onClick={() => setConfirm(true)}>
        <Icon name="refresh" size={16} />
        {t('staff.qr.reset')}
      </button>
      <ConfirmDialog
        open={confirm}
        title={t('staff.qr.resetTitle', { number: table.number })}
        body={t('staff.qr.resetBody')}
        confirmLabel={t('staff.qr.resetConfirm')}
        cancelLabel={t('staff.common.keep')}
        tone="danger"
        busy={reset.isPending}
        onConfirm={() =>
          reset.mutate(table.id, {
            onSuccess: () => {
              setConfirm(false);
              toast(t('staff.qr.resetDone', { number: table.number }));
            },
          })
        }
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
