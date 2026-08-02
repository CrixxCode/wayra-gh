import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ReportDetailData } from '../report-model';

@Component({
  selector: 'app-detail-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-report.html',
  styleUrls: ['./detail-report.css'],
})
export class DetailReport {
  @Input() detailData: ReportDetailData | null = null;
  @Output() closed = new EventEmitter<void>();

  closeDrawer(): void {
    this.closed.emit();
  }
}
