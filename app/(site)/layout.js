import SiteNav from '@/components/SiteNav';

export default function SiteLayout({ children }) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
