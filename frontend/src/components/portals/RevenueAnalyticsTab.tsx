// ===== Revenue Analytics Tab =====
// Revenue reporting, MRR/ARR metrics, membership breakdown, and financial summary

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RevenueReport {
  mrr: number;
  arr: number;
  churnRate: number;
  arpm: number;
  mrrGrowth: number;
  churnTrend: number;
  revenueByMonth: MonthlyRevenue[];
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface MembershipReport {
  totalMembers: number;
  membersByPlan: PlanBreakdown[];
}

interface PlanBreakdown {
  planName: string;
  count: number;
  revenue: number;
}

interface FinancialReport {
  totalCollected: number;
  outstanding: number;
  ltv: number;
  avgCollectionDays: number;
  writeOffs: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_REVENUE: RevenueReport = {
  mrr: 14700,
  arr: 176400,
  churnRate: 3.2,
  arpm: 172.94,
  mrrGrowth: 8.5,
  churnTrend: -0.4,
  revenueByMonth: [
    { month: "Oct", revenue: 11200 },
    { month: "Nov", revenue: 12100 },
    { month: "Dec", revenue: 12800 },
    { month: "Jan", revenue: 13500 },
    { month: "Feb", revenue: 14100 },
    { month: "Mar", revenue: 14700 },
  ],
};

const MOCK_MEMBERSHIP: MembershipReport = {
  totalMembers: 85,
  membersByPlan: [
    { planName: "Essential", count: 45, revenue: 4455 },
    { planName: "Complete", count: 28, revenue: 5572 },
    { planName: "Premium", count: 12, revenue: 3588 },
  ],
};

const MOCK_FINANCIAL: FinancialReport = {
  totalCollected: 156200,
  outstanding: 4350,
  ltv: 2847,
  avgCollectionDays: 3.2,
  writeOffs: 890,
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  iconBg?: string;
  iconColor?: string;
}) {
  const isPositive = (trend ?? 0) >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  return (
    <div className="glass rounded-xl p-5 hover-lift">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: iconBg || "#e6f7f2" }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor || "#147d64" }} />
        </div>
        {trend !== undefined && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: isPositive ? "#27ab83" : "#e12d39" }}
          >
            <TrendIcon className="w-3 h-3" />
            {Math.abs(trend).toFixed(1)}%{trendLabel ? ` ${trendLabel}` : ""}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function RevenueBarChart({ data }: { data: MonthlyRevenue[] }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Revenue by Month</h3>
      </div>
      <div className="flex items-end gap-3" style={{ height: "200px" }}>
        {data.map((item) => {
          const heightPercent = (item.revenue / maxRevenue) * 100;
          return (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {formatCurrency(item.revenue)}
              </span>
              <div
                className="w-full rounded-t-lg transition-all duration-500"
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: "#27ab83",
                  minHeight: "8px",
                }}
              />
              <span className="text-xs text-slate-500">{item.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanBreakdownChart({ data, totalMembers }: { data: PlanBreakdown[]; totalMembers: number }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const planColors: Record<string, string> = {
    Essential: "#486581",
    Complete: "#27ab83",
    Premium: "#d97706",
  };

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <PieChart className="w-5 h-5 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Members by Plan</h3>
        <span className="text-xs text-slate-400 ml-auto">{totalMembers} total</span>
      </div>
      <div className="space-y-4">
        {data.map((plan) => {
          const widthPercent = (plan.count / maxCount) * 100;
          const color = planColors[plan.planName] || "#6b7280";
          return (
            <div key={plan.planName}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-700">{plan.planName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{plan.count} members</span>
                  <span className="text-xs font-medium text-slate-700">
                    {formatCurrency(plan.revenue)}/mo
                  </span>
                </div>
              </div>
              <div className="w-full rounded-full" style={{ height: "8px", backgroundColor: "#f1f5f9" }}>
                <div
                  className="rounded-full transition-all duration-500"
                  style={{
                    width: `${widthPercent}%`,
                    height: "8px",
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RevenueAnalyticsTab() {
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [membership, setMembership] = useState<MembershipReport | null>(null);
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [revRes, memRes, finRes] = await Promise.all([
      apiFetch<RevenueReport>("/reports/revenue"),
      apiFetch<MembershipReport>("/reports/membership"),
      apiFetch<FinancialReport>("/reports/financial"),
    ]);

    if (revRes.error && memRes.error && finRes.error) {
      // All failed — use mock data
      setRevenue(MOCK_REVENUE);
      setMembership(MOCK_MEMBERSHIP);
      setFinancial(MOCK_FINANCIAL);
    } else {
      setRevenue(revRes.data || MOCK_REVENUE);
      setMembership(memRes.data || MOCK_MEMBERSHIP);
      setFinancial(finRes.data || MOCK_FINANCIAL);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    window.open("/api/reports/export?type=revenue", "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        <span className="ml-3 text-sm text-slate-500">Loading revenue data...</span>
      </div>
    );
  }

  if (error && !revenue) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "#fef2f2" }}
        >
          <DollarSign className="w-6 h-6" style={{ color: "#dc2626" }} />
        </div>
        <h3 className="text-sm font-medium text-slate-900 mb-1">Failed to load revenue data</h3>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "#27ab83" }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Revenue Analytics</h2>
          <p className="text-sm text-slate-500 mt-0.5">Financial performance and membership metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#27ab83" }}
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      {revenue && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Monthly Recurring Revenue"
            value={formatCurrency(revenue.mrr)}
            trend={revenue.mrrGrowth}
            trendLabel="vs last month"
          />
          <StatCard
            icon={TrendingUp}
            label="Annual Recurring Revenue"
            value={formatCurrency(revenue.arr)}
            iconBg="#ede9fe"
            iconColor="#7c3aed"
          />
          <StatCard
            icon={Users}
            label="Churn Rate"
            value={formatPercent(revenue.churnRate)}
            trend={revenue.churnTrend}
            trendLabel="vs last month"
            iconBg="#fef2f2"
            iconColor="#dc2626"
          />
          <StatCard
            icon={DollarSign}
            label="Avg Revenue Per Member"
            value={formatCurrency(revenue.arpm)}
            iconBg="#fffbeb"
            iconColor="#d97706"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {revenue && <RevenueBarChart data={revenue.revenueByMonth} />}
        {membership && (
          <PlanBreakdownChart
            data={membership.membersByPlan}
            totalMembers={membership.totalMembers}
          />
        )}
      </div>

      {/* Financial Summary */}
      {financial && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Financial Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center p-4 rounded-lg" style={{ backgroundColor: "#ecfdf5" }}>
              <p className="text-2xl font-bold" style={{ color: "#147d64" }}>
                {formatCurrency(financial.totalCollected)}
              </p>
              <p className="text-sm text-slate-600 mt-1">Total Collected</p>
            </div>
            <div className="text-center p-4 rounded-lg" style={{ backgroundColor: "#fffbeb" }}>
              <p className="text-2xl font-bold" style={{ color: "#d97706" }}>
                {formatCurrency(financial.outstanding)}
              </p>
              <p className="text-sm text-slate-600 mt-1">Outstanding</p>
            </div>
            <div className="text-center p-4 rounded-lg" style={{ backgroundColor: "#ede9fe" }}>
              <p className="text-2xl font-bold" style={{ color: "#7c3aed" }}>
                {formatCurrency(financial.ltv)}
              </p>
              <p className="text-sm text-slate-600 mt-1">Lifetime Value (LTV)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
