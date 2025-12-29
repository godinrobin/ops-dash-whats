import { createContext, useContext, ReactNode } from 'react';
import { NodeAnalytics } from '@/hooks/useFlowAnalytics';

interface FlowAnalyticsContextValue {
  nodeStats: Map<string, NodeAnalytics>;
  totalSessions: number;
  isLoading: boolean;
}

const FlowAnalyticsContext = createContext<FlowAnalyticsContextValue>({
  nodeStats: new Map(),
  totalSessions: 0,
  isLoading: true,
});

export const FlowAnalyticsProvider = ({
  children,
  nodeStats,
  totalSessions,
  isLoading,
}: {
  children: ReactNode;
  nodeStats: Map<string, NodeAnalytics>;
  totalSessions: number;
  isLoading: boolean;
}) => {
  return (
    <FlowAnalyticsContext.Provider value={{ nodeStats, totalSessions, isLoading }}>
      {children}
    </FlowAnalyticsContext.Provider>
  );
};

export const useFlowAnalyticsContext = () => useContext(FlowAnalyticsContext);