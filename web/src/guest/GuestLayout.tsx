import { useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { GuestShell, GuestLoadError, MenuSkeleton, Toast } from './components';
import { brandOverride } from './devFlags';
import { GuestProvider } from './GuestContext';
import { useMenuQuery } from './queries';

/** Everything under /:slug/t/:qrToken: loads the table's menu once and shares it with every screen. */
export function GuestLayout() {
  const { slug = '', qrToken = '' } = useParams();
  const [override] = useState(brandOverride);
  const menu = useMenuQuery(slug, qrToken);

  if (menu.isPending) {
    return (
      <GuestShell brand={override}>
        <MenuSkeleton />
      </GuestShell>
    );
  }

  if (menu.isError) {
    return (
      <GuestShell brand={override}>
        <GuestLoadError code={(menu.error as Error).message} onRetry={() => void menu.refetch()} />
      </GuestShell>
    );
  }

  return (
    <GuestProvider key={`${slug}/${qrToken}`} menu={menu.data} slug={slug} qrToken={qrToken}>
      <GuestShell brand={override ?? menu.data.venue.brandColor}>
        <Outlet />
        <Toast />
      </GuestShell>
    </GuestProvider>
  );
}
