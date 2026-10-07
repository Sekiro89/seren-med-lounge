/** GET /reports/overview?from=&to= (report:read). */
export interface ReportOverview {
  range: { from: string; to: string };
  appointments: {
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    /** 0 to 1. */
    noShowRate: number;
  };
  patients: { new: number };
  money: {
    invoicedMinor: number;
    invoices: number;
    collectedMinor: number;
    refundedMinor: number;
    outstandingMinor: number;
    outstandingInvoices: number;
  };
  queue: {
    averageWaitMinutes: Record<string, number>;
    tokensCalled: number;
  };
  topDiagnoses: { description: string; icdCode: string | null; count: number }[];
  leads: { new: number; converted: number };
  care: { followUpsOverdue: number };
  pharmacy: { batchesExpiringIn30Days: number };
  perDay: { date: string; visits: number; collectedMinor: number }[];
}

export interface DayPoint {
  date: string;
  visits: number;
  collectedMinor: number;
}
