import { Navigate } from 'react-router-dom';
import { useSafeAuth } from '@/hooks/useAuth';
import iffyLogo from '@/assets/iffy-logo-v3.png';
import Landing from './Landing';

const Index = () => {
  const { user, loading } = useSafeAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <img src={iffyLogo} alt="IFFY" className="h-10 w-10 animate-pulse" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return <Landing />;
};

export default Index;
