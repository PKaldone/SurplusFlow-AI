'use client';

import Link from 'next/link';
import {
  FolderOpen,
  Activity,
  Send,
  FileCheck,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { useDashboard, DashboardStats } from '@/lib/hooks/use-dashboard';

interface StatCardConfig {
  key: keyof DashboardStats;
  label: string;
  icon: React.ElementType;
  bgColor: string;
  iconColor: string;
  isCurrency: boolean;
}

const STAT_CARDS: readonly StatCardConfig[] = [
  {
    key: 'total_cases',
    label: 'Total Cases',
    icon: FolderOpen,
    bgColor: 'bg-blue-100',
    iconColor: 'text-blue-600',
    isCurrency: false,
  },
  {
    key: 'active_cases',
    label: 'Active Cases',
    icon: Activity,
    bgColor: 'bg-green-100',
    iconColor: 'text-green-600',
    isCurrency: false,
  },
  {
    key: 'pending_outreach',
    label: 'Pending Outreach',
    icon: Send,
    bgColor: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    isCurrency: false,
  },
  {
    key: 'filed_claims',
    label: 'Filed Claims',
    icon: FileCheck,
    bgColor: 'bg-purple-100',
    iconColor: 'text-purple-600',
    isCurrency: false,
  },
  {
    key: 'total_recovered',
    label: 'Total Recovered',
    icon: DollarSign,
    bgColor: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    isCurrency: true,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    icon: TrendingUp,
    bgColor: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    isCurrency: true,
  },
] as const;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US');

function formatValue(value: number | undefined, isCurrency: boolean): string {
  const v = value ?? 0;
  return isCurrency ? currencyFormatter.format(v) : numberFormatter.format(v);
}

export default function DashboardPage() {
  const { stats, error, isLoading } = useDashboard();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Surplus recovery overview"
      />

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive mb-6">
          Failed to load dashboard data. Please try again later.
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {STAT_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="rounded-lg border bg-card p-6 flex items-start gap-4"
                >
                  <div className={`rounded-full p-3 ${card.bgColor}`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatValue(stats?.[card.key], card.isCurrency)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
            <div className="flex items-center gap-3">
              <Button asChild>
                <Link href="/cases">View Cases</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/opportunities">Browse Opportunities</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/compliance">Compliance</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
