export interface Farmer {
  _id?: string;
  name: string;
  village: string;
  sugarcaneTons: number;
  amountPaid: number;
  paymentPending: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface VillageStats {
  village: string;
  tons: number;
  farmers: number;
  paid: number;
  pending: number;
}

export interface DashboardStats {
  totalFarmers: number;
  totalSugarcaneTons: number;
  totalAmountPaid: number;
  totalPaymentPending: number;
  villageBreakdown?: VillageStats[];
}

export interface HealthStatus {
  ok: boolean;
  database: string;
  status: string;
  farmersCount?: number;
  timestamp?: string;
  error?: string;
}

export interface FarmersResponse {
  page: number;
  limit: number;
  total: number;
  items: Farmer[];
}
