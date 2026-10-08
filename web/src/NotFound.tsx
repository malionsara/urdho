import { useTranslation } from 'react-i18next';
import { GuestShell, StateMessage } from './guest/components';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <GuestShell brand={null}>
      <StateMessage icon="qr" title={t('errors.tableTitle')} body={t('errors.tableBody')} />
    </GuestShell>
  );
}
