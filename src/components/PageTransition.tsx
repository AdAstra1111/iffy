import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

// PageTransition is intentionally a passthrough — framer-motion page-level animations
// conflict with React 18 Suspense concurrent rendering causing removeChild crashes.
export function PageTransition({ children }: Props) {
  return <>{children}</>;
}
