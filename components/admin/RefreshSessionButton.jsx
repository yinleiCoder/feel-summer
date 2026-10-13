'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

// A role lives in the JWT, so a change does not take effect until the token
// rotates — up to the project's JWT expiry. This forces that rotation now.
const RefreshSessionButton = () => {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRefresh() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.refreshSession();
    router.refresh();
    setPending(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={pending}>
      {pending ? '刷新中…' : '刷新我的会话'}
    </Button>
  );
};

export default RefreshSessionButton;
