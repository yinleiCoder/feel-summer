import NotFoundContent from '@/components/NotFoundContent';

// Reached when a page inside (site) calls notFound(). The group layout already
// renders SiteNav, so adding it here too would stack two identical bars.
export default function SiteNotFound() {
  return <NotFoundContent />;
}
