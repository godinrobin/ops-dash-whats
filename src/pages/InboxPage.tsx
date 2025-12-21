import { Header } from '@/components/Header';
import { InboxLayout } from '@/components/inbox/InboxLayout';

const InboxPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <InboxLayout />
    </div>
  );
};

export default InboxPage;
