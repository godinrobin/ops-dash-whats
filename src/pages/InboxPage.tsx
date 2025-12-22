import { Header } from '@/components/Header';
import { InboxLayout } from '@/components/inbox/InboxLayout';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const InboxPage = () => {
  useActivityTracker('page_view', 'Automati-Zap Inbox');
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="h-14 md:h-16" /> {/* Spacer for fixed header */}
      <InboxLayout />
    </div>
  );
};

export default InboxPage;
