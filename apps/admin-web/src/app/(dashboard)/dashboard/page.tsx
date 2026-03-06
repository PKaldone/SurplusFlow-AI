import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of surplus recovery operations"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Active Cases</p>
          <p className="text-3xl font-bold mt-1">--</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Pending Outreach</p>
          <p className="text-3xl font-bold mt-1">--</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Recovered This Month</p>
          <p className="text-3xl font-bold mt-1">--</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Revenue This Month</p>
          <p className="text-3xl font-bold mt-1">--</p>
        </div>
      </div>
    </div>
  );
}
