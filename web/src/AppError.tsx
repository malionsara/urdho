import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { GuestShell, StateMessage } from './guest/components';
import { reloadForNewVersion, isMissingFileError } from './lib/updates';
import { Button } from './ui/Button';

/**
 * What any screen shows when it fails. A file missing after a deploy means a newer version is out:
 * the app moves to it by itself. Anything else gets a plain message and a reload button.
 */
export function AppError() {
  const { t } = useTranslation();
  const error = useRouteError();
  // reloadForNewVersion is idempotent within a page, so calling it from the initializer is safe.
  const [updating] = useState(() => isMissingFileError(error) && reloadForNewVersion());

  return (
    <GuestShell brand={null}>
      {updating ? (
        <StateMessage icon="refresh" title={t('errors.updating')} />
      ) : (
        <StateMessage
          icon="info"
          title={t('errors.crashTitle')}
          body={t('errors.crashBody')}
          action={
            <Button variant="outline" onClick={() => location.reload()}>
              {t('errors.reload')}
            </Button>
          }
        />
      )}
    </GuestShell>
  );
}
