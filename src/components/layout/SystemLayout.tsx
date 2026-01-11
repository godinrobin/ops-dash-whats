import { useState } from "react";
import { Header } from "@/components/Header";
import { SystemsSidebar } from "@/components/layout/SystemsSidebar";

interface SystemLayoutProps {
  children: React.ReactNode;
}

export const SystemLayout = ({ children }: SystemLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
      <SystemsSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="h-14 md:h-16" />
      {children}
    </>
  );
};
