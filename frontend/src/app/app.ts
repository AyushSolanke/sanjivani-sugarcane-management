import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FarmerService } from './services/farmer.service';
import { Farmer, DashboardStats, HealthStatus } from './models/farmer.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly farmerService = inject(FarmerService);

  // System & Connection State
  readonly health = signal<HealthStatus | null>(null);
  readonly dbConnected = signal<boolean>(false);
  readonly dbError = signal<string | null>(null);
  readonly checkingHealth = signal<boolean>(false);

  // Dashboard Metrics
  readonly dashboard = signal<DashboardStats | null>(null);
  readonly loadingDashboard = signal<boolean>(false);

  // Farmers Data
  readonly farmers = signal<Farmer[]>([]);
  readonly villages = signal<string[]>([]);
  readonly totalFarmers = signal<number>(0);
  readonly loadingFarmers = signal<boolean>(false);

  // Filters & Search
  searchTerm = '';
  selectedVillage = 'ALL';
  currentPage = 1;
  readonly pageSize = 20;

  // Modal State (Create / Edit)
  readonly showModal = signal<boolean>(false);
  readonly isEditMode = signal<boolean>(false);
  readonly savingFarmer = signal<boolean>(false);
  editingId: string | null = null;
  formName = '';
  formVillage = '';
  formTons: number | null = null;
  formPaid: number | null = null;
  formPending: number | null = null;
  formError = '';

  // Delete Confirmation Modal
  readonly showDeleteModal = signal<boolean>(false);
  readonly farmerToDelete = signal<Farmer | null>(null);
  readonly deletingFarmer = signal<boolean>(false);

  // AI Assistant
  aiQuestion = '';
  readonly aiAnswer = signal<string | null>(null);
  readonly aiLoading = signal<boolean>(false);
  readonly aiError = signal<string | null>(null);

  // Preset prompt chips
  readonly aiSuggestions = [
    'Which village supplied the most sugarcane?',
    'Who has the highest pending payment?',
    'Summary of farmers in Shirdi village',
    'Total sugarcane tons and payment overview'
  ];

  // Toast Notification
  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error' | 'info'>('success');
  private toastTimer: any = null;

  ngOnInit(): void {
    this.refreshAll();
  }

  refreshAll(): void {
    this.checkHealth();
    this.loadDashboard();
    this.loadVillages();
    this.loadFarmers();
  }

  checkHealth(): void {
    this.checkingHealth.set(true);
    this.farmerService.getHealth().subscribe({
      next: (res) => {
        this.health.set(res);
        this.dbConnected.set(res.ok && res.status === 'connected');
        this.dbError.set(null);
        this.checkingHealth.set(false);
      },
      error: (err) => {
        this.dbConnected.set(false);
        this.dbError.set(err.message || 'Cannot reach database server');
        this.checkingHealth.set(false);
      }
    });
  }

  loadDashboard(): void {
    this.loadingDashboard.set(true);
    this.farmerService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loadingDashboard.set(false);
      },
      error: (err) => {
        console.error('Failed to load dashboard:', err);
        this.loadingDashboard.set(false);
      }
    });
  }

  loadVillages(): void {
    this.farmerService.getVillages().subscribe({
      next: (list) => {
        this.villages.set(list);
      },
      error: (err) => console.error('Failed to load villages:', err)
    });
  }

  loadFarmers(): void {
    this.loadingFarmers.set(true);
    this.farmerService.getFarmers({
      search: this.searchTerm.trim() || undefined,
      village: this.selectedVillage,
      page: this.currentPage,
      limit: this.pageSize
    }).subscribe({
      next: (res) => {
        this.farmers.set(res.items);
        this.totalFarmers.set(res.total);
        this.loadingFarmers.set(false);
      },
      error: (err) => {
        console.error('Failed to load farmers:', err);
        this.loadingFarmers.set(false);
        this.showToast('Failed to load farmers list from database', 'error');
      }
    });
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.loadFarmers();
  }

  onVillageFilterChange(village: string): void {
    this.selectedVillage = village;
    this.currentPage = 1;
    this.loadFarmers();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedVillage = 'ALL';
    this.currentPage = 1;
    this.loadFarmers();
  }

  // Farmer CRUD Operations
  openAddModal(): void {
    this.isEditMode.set(false);
    this.editingId = null;
    this.formName = '';
    this.formVillage = '';
    this.formTons = null;
    this.formPaid = null;
    this.formPending = null;
    this.formError = '';
    this.showModal.set(true);
  }

  openEditModal(farmer: Farmer): void {
    this.isEditMode.set(true);
    this.editingId = farmer._id ?? null;
    this.formName = farmer.name;
    this.formVillage = farmer.village;
    this.formTons = farmer.sugarcaneTons;
    this.formPaid = farmer.amountPaid;
    this.formPending = farmer.paymentPending;
    this.formError = '';
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  saveFarmer(): void {
    if (!this.formName.trim()) {
      this.formError = 'Farmer name is required.';
      return;
    }
    if (!this.formVillage.trim()) {
      this.formError = 'Village name is required.';
      return;
    }
    if (this.formTons === null || this.formTons < 0) {
      this.formError = 'Sugarcane tons must be a valid positive number.';
      return;
    }

    const payload = {
      name: this.formName.trim(),
      village: this.formVillage.trim(),
      sugarcaneTons: Number(this.formTons || 0),
      amountPaid: Number(this.formPaid || 0),
      paymentPending: Number(this.formPending || 0)
    };

    this.savingFarmer.set(true);
    this.formError = '';

    if (this.isEditMode() && this.editingId) {
      this.farmerService.updateFarmer(this.editingId, payload).subscribe({
        next: () => {
          this.savingFarmer.set(false);
          this.closeModal();
          this.showToast(`Updated farmer "${payload.name}" successfully!`, 'success');
          this.refreshAll();
        },
        error: (err) => {
          this.savingFarmer.set(false);
          this.formError = err.error?.error || 'Failed to update farmer.';
        }
      });
    } else {
      this.farmerService.createFarmer(payload).subscribe({
        next: () => {
          this.savingFarmer.set(false);
          this.closeModal();
          this.showToast(`Farmer "${payload.name}" registered successfully!`, 'success');
          this.refreshAll();
        },
        error: (err) => {
          this.savingFarmer.set(false);
          this.formError = err.error?.error || 'Failed to register farmer.';
        }
      });
    }
  }

  promptDeleteFarmer(farmer: Farmer): void {
    this.farmerToDelete.set(farmer);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.farmerToDelete.set(null);
  }

  confirmDelete(): void {
    const f = this.farmerToDelete();
    if (!f || !f._id) return;

    this.deletingFarmer.set(true);
    this.farmerService.deleteFarmer(f._id).subscribe({
      next: () => {
        this.deletingFarmer.set(false);
        this.closeDeleteModal();
        this.showToast(`Farmer "${f.name}" deleted from database.`, 'info');
        this.refreshAll();
      },
      error: (err) => {
        this.deletingFarmer.set(false);
        this.showToast(err.error?.error || 'Failed to delete farmer.', 'error');
      }
    });
  }

  // AI Query
  askAiQuestion(q?: string): void {
    const question = (q || this.aiQuestion).trim();
    if (!question) return;

    this.aiQuestion = question;
    this.aiLoading.set(true);
    this.aiError.set(null);
    this.aiAnswer.set(null);

    this.farmerService.askAi(question).subscribe({
      next: (res) => {
        this.aiAnswer.set(res.answer);
        this.aiLoading.set(false);
      },
      error: (err) => {
        this.aiError.set(err.error?.error || 'AI query encountered an error. Please try again.');
        this.aiLoading.set(false);
      }
    });
  }

  clearAi(): void {
    this.aiQuestion = '';
    this.aiAnswer.set(null);
    this.aiError.set(null);
  }

  // UI Utilities
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatNumber(val: number): string {
    return new Intl.NumberFormat('en-IN').format(val);
  }

  getPaymentStatus(f: Farmer): { label: string; class: string } {
    const total = (f.amountPaid || 0) + (f.paymentPending || 0);
    if (total === 0) return { label: 'Settled', class: 'badge-settled' };
    if (f.paymentPending === 0) return { label: 'Fully Paid', class: 'badge-paid' };
    if (f.amountPaid === 0) return { label: 'Pending', class: 'badge-pending' };
    return { label: 'Partial', class: 'badge-partial' };
  }

  getPaidPercentage(f: Farmer): number {
    const total = (f.amountPaid || 0) + (f.paymentPending || 0);
    if (total <= 0) return 100;
    return Math.min(100, Math.round(((f.amountPaid || 0) / total) * 100));
  }
}
