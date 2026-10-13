import NotFoundContent from '@/components/NotFoundContent';
import SiteNav from '@/components/SiteNav';

export const metadata = { title: '404' };

// Handles unmatched URLs for the whole app. Those never enter the (site) group, so
// the nav is rendered here rather than arriving from that group's layout.
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <NotFoundContent />
    </>
  );
}
