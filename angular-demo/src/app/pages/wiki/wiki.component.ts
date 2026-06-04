import { Component, OnInit, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { WikiService, Category, DocContent, WorkflowDetail, WorkflowSummary } from '../../services/wiki.service';
import { ShowMeService } from '../../services/show-me.service';
import { JourneyConfig } from '@show-me/core';

type ViewMode = 'doc' | 'workflow';

@Component({
  selector: 'app-wiki',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './wiki.component.html',
  styleUrls: ['./wiki.component.scss'],
})
export class WikiComponent implements OnInit {
  // Sidebar data
  categories: Record<string, Category> = {};
  categoryKeys: string[] = [];
  workflows: WorkflowSummary[] = [];
  sidebarTab: 'docs' | 'workflows' = 'docs';

  // Main content
  viewMode: ViewMode = 'doc';
  loading = false;
  searchQuery = '';

  // Doc view
  currentDoc: DocContent | null = null;
  renderedHtml: SafeHtml = '';

  // Workflow view
  currentWorkflow: WorkflowDetail | null = null;

  // Journey state
  journeyRunning = false;
  journeyStep = 0;
  journeyTotal = 0;
  journeyStatus = '';

  constructor(
    private wiki: WikiService,
    private showMe: ShowMeService,
    private sanitizer: DomSanitizer,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadSidebar();
  }

  loadSidebar() {
    this.wiki.getDocs().subscribe(res => {
      this.categories = res.categories;
      this.categoryKeys = Object.keys(res.categories);
    });
    this.wiki.getWorkflows().subscribe(res => {
      this.workflows = res.workflows;
    });
  }

  // ── Doc navigation ──────────────────────────────────────────────────────────

  selectDoc(path: string) {
    this.loading = true;
    this.viewMode = 'doc';
    this.currentWorkflow = null;
    this.sidebarTab = 'docs';

    this.wiki.getDocContent(path).subscribe({
      next: doc => {
        this.currentDoc = doc;
        const html = marked.parse(doc.content) as string;
        this.renderedHtml = this.sanitizer.bypassSecurityTrustHtml(html);
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  // ── Workflow navigation ──────────────────────────────────────────────────────

  selectWorkflow(id: string) {
    this.loading = true;
    this.viewMode = 'workflow';
    this.currentDoc = null;
    this.sidebarTab = 'workflows';

    this.wiki.getWorkflow(id).subscribe({
      next: wf => {
        this.currentWorkflow = wf;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  // ── Journey ──────────────────────────────────────────────────────────────────

  async startGuidedTour(workflow: WorkflowDetail) {
    const journey: JourneyConfig = {
      id: workflow.id,
      title: workflow.title,
      description: workflow.description,
      steps: workflow.steps.map(s => ({
        step: s.step,
        title: s.title,
        description: s.description,
        query: s.query,
        hint: s.hint,
      })),
    };

    this.journeyRunning = true;
    this.journeyStep = 0;
    this.journeyStatus = '启动中…';

    // Navigate to the workflow's target page first (HUD + cursor live on
    // document.body so they survive the Angular route change).
    if (workflow.page && this.router.url.split('?')[0] !== workflow.page) {
      await this.router.navigateByUrl(workflow.page);
      // Give Angular time to render the new page before scanning
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      await this.showMe.startJourney(journey, state => {
        this.journeyStep = state.currentStep;
        this.journeyTotal = state.totalSteps;
        if (state.status === 'completed') {
          this.journeyRunning = false;
          this.journeyStatus = '✅ 教程完成！';
        } else if (state.status === 'cancelled') {
          this.journeyRunning = false;
          this.journeyStatus = '';
        }
      });
    } catch (e) {
      this.journeyRunning = false;
    }
  }

  cancelJourney() {
    this.showMe.cancelJourney();
    this.journeyRunning = false;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  get filteredDocs(): Array<{ path: string; title: string; category: string; icon: string }> {
    const q = this.searchQuery.toLowerCase();
    const results: any[] = [];
    for (const [key, cat] of Object.entries(this.categories)) {
      for (const doc of cat.docs) {
        if (!q || doc.title.toLowerCase().includes(q) || doc.description.toLowerCase().includes(q)) {
          results.push({ ...doc, category: cat.label, icon: cat.icon });
        }
      }
    }
    return results;
  }

  get filteredWorkflows(): WorkflowSummary[] {
    const q = this.searchQuery.toLowerCase();
    if (!q) return this.workflows;
    return this.workflows.filter(w =>
      w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  selectFirstDoc(key: string) {
    const path = this.categories[key]?.docs[0]?.path;
    if (path) this.selectDoc(path);
  }

  renderMd(content: string): SafeHtml {
    const html = marked.parse(content) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  trackByKey(index: number, item: any) { return item.key || index; }
  trackByStep(index: number, step: any) { return step.step; }
}
