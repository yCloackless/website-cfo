import { ExamJobRepository } from '../db/repositories';
import { ExamService } from './examService';

type ExtractionPayload = {
  userId: string;
  fileId?: string;
  title: string;
  institution: string;
  examYear: number;
  rawTextContent?: string;
};

/**
 * Worker persistente baseado no SQLite. O payload fica no job, portanto uma
 * reinicializacao nao perde os parametros necessarios para retomar a prova.
 */
export class ExamJobWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private jobs: ExamJobRepository,
    private exams: ExamService,
    private intervalMs = 1000,
  ) {}

  public start(): void {
    if (this.timer) return;
    this.jobs.requeueStaleProcessing(5 * 60 * 1000);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let activeJob: ReturnType<ExamJobRepository['findById']> = null;
    try {
      const job = this.jobs.claimNextQueued();
      if (!job) return;
      activeJob = job;
      if (job.jobType !== 'EXTRACTION' || !job.payloadJson) {
        this.jobs.updateStatus(job.id, 'failed', 0, undefined, 'UNSUPPORTED_JOB_PAYLOAD');
        return;
      }

      const payload = JSON.parse(job.payloadJson) as ExtractionPayload;
      const result = await this.exams.extractAndRegisterExam(payload);
      this.jobs.updateStatus(job.id, 'completed', 1, {
        paperId: result.paper.id,
        questionsCount: result.questions.length,
      });
    } catch (error: any) {
      if (activeJob) {
        this.jobs.updateStatus(activeJob.id, 'failed', 0, undefined, error?.message || 'JOB_FAILED');
      }
    } finally {
      this.running = false;
    }
  }
}
