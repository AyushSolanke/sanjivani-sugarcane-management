import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Farmer, DashboardStats, HealthStatus, FarmersResponse } from '../models/farmer.model';

@Injectable({
  providedIn: 'root'
})
export class FarmerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api';

  getHealth(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.baseUrl}/health`);
  }

  getDashboard(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.baseUrl}/dashboard`);
  }

  getVillages(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/villages`);
  }

  getFarmers(params?: {
    search?: string;
    village?: string;
    page?: number;
    limit?: number;
  }): Observable<FarmersResponse> {
    let httpParams = new HttpParams();
    if (params?.search) {
      httpParams = httpParams.set('search', params.search);
    }
    if (params?.village && params.village !== 'ALL') {
      httpParams = httpParams.set('village', params.village);
    }
    if (params?.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    return this.http.get<FarmersResponse>(`${this.baseUrl}/farmers`, { params: httpParams });
  }

  getFarmer(id: string): Observable<Farmer> {
    return this.http.get<Farmer>(`${this.baseUrl}/farmers/${id}`);
  }

  createFarmer(farmer: Omit<Farmer, '_id' | 'createdAt' | 'updatedAt'>): Observable<Farmer> {
    return this.http.post<Farmer>(`${this.baseUrl}/farmers`, farmer);
  }

  updateFarmer(id: string, farmer: Partial<Farmer>): Observable<Farmer> {
    return this.http.put<Farmer>(`${this.baseUrl}/farmers/${id}`, farmer);
  }

  deleteFarmer(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/farmers/${id}`);
  }

  askAi(question: string): Observable<{ answer: string }> {
    return this.http.post<{ answer: string }>(`${this.baseUrl}/ai/ask`, { question });
  }
}
