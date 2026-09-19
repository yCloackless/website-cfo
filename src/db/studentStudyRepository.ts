import crypto from 'node:crypto';
import { calculatePriorityScore, classifyPriority, weightedAverage, StudyPriority } from '../services/studentStudyPriority';

type Db = any;
type ProfileInput = Partial<{ displayName: string; institution: string; campus: string; course: string; schoolYear: string; className: string; shift: string; availableTimeJson: string; onboardingCompleted: boolean }>;
type SubjectInput = { name: string; category?: string; source?: string };
type GradeInput = { subjectId: string; periodId?: string | null; assessmentName: string; score: number; weight?: number; source?: string; isUncertain?: boolean };
type ExamInput = { subjectId?: string | null; name: string; examDate: string; examTime?: string | null; weight?: number; targetGrade?: number | null; topics?: string[]; notes?: string; room?: string; status?: string };
type EventInput = { eventType: string; title: string; eventDate: string; startTime?: string; endTime?: string; examId?: string | null; notes?: string };

const DEFAULT_SUBJECTS = ['Matemática', 'Física', 'Química', 'Biologia', 'Português', 'Literatura', 'Redação', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês', 'Espanhol', 'Artes', 'Educação Física', 'Informática'];

const isoNow = () => new Date().toISOString();
const parseJson = <T>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };
const rowProfile = (r: any) => r && ({ id: r.id, userId: r.user_id, displayName: r.display_name, institution: r.institution, campus: r.campus, course: r.course, schoolYear: r.school_year, className: r.class_name, shift: r.shift, availableTimeJson: r.available_time_json, onboardingCompleted: Boolean(r.onboarding_completed), createdAt: r.created_at, updatedAt: r.updated_at });
const rowSubject = (r: any) => r && ({ id: r.id, userId: r.user_id, name: r.name, category: r.category, source: r.source, active: Boolean(r.active), createdAt: r.created_at, updatedAt: r.updated_at });
const rowGrade = (r: any) => r && ({ id: r.id, userId: r.user_id, subjectId: r.subject_id, subjectName: r.subject_name, periodId: r.period_id, periodName: r.period_name, assessmentName: r.assessment_name, score: Number(r.score), weight: Number(r.weight), source: r.source, isUncertain: Boolean(r.is_uncertain), createdAt: r.created_at, updatedAt: r.updated_at });
const rowExam = (r: any) => r && ({ id: r.id, userId: r.user_id, subjectId: r.subject_id, subjectName: r.subject_name, name: r.name, examDate: r.exam_date, examTime: r.exam_time, weight: Number(r.weight), targetGrade: r.target_grade == null ? null : Number(r.target_grade), topics: parseJson<string[]>(r.topics_json, []), notes: r.notes, room: r.room, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const rowEvent = (r: any) => ({ id: r.id, userId: r.user_id, eventType: r.event_type, title: r.title, eventDate: r.event_date, startTime: r.start_time, endTime: r.end_time, examId: r.exam_id, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at });

export class StudentStudyRepository {
  constructor(private db: Db) {}

  ensureDefaults(userId: string): void {
    this.ensureUniversitySeed();
    const existing = Number((this.db.prepare('SELECT COUNT(*) AS count FROM student_subjects WHERE user_id = ?').get(userId) as any)?.count || 0);
    if (!existing) {
      const now = isoNow();
      for (const name of DEFAULT_SUBJECTS) this.db.prepare('INSERT INTO student_subjects (id, user_id, name, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), userId, name, 'escola', 'default', now, now);
    }
    const periods = Number((this.db.prepare('SELECT COUNT(*) AS count FROM student_academic_periods WHERE user_id = ?').get(userId) as any)?.count || 0);
    if (!periods) {
      const now = isoNow();
      ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'].forEach((name, index) => this.db.prepare('INSERT INTO student_academic_periods (id, user_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), userId, name, index, now));
    }
  }

  ensureUniversitySeed(): void {
    try {
      const existing = Number((this.db.prepare('SELECT COUNT(*) AS count FROM university_institutions').get() as any)?.count || 0);
      if (existing > 0) return;

      const institutions = [
        { id: 'ifrj-maracana', name: 'Instituto Federal do Rio de Janeiro - Campus Maracanã', acronym: 'IFRJ', mecCode: '14511', state: 'RJ', city: 'Rio de Janeiro', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-nilopolis', name: 'Instituto Federal do Rio de Janeiro - Campus Nilópolis', acronym: 'IFRJ', mecCode: '14512', state: 'RJ', city: 'Nilópolis', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-duquecaxias', name: 'Instituto Federal do Rio de Janeiro - Campus Duque de Caxias', acronym: 'IFRJ', mecCode: '14513', state: 'RJ', city: 'Duque de Caxias', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-paracambi', name: 'Instituto Federal do Rio de Janeiro - Campus Paracambi', acronym: 'IFRJ', mecCode: '14514', state: 'RJ', city: 'Paracambi', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-voltaredonda', name: 'Instituto Federal do Rio de Janeiro - Campus Volta Redonda', acronym: 'IFRJ', mecCode: '14515', state: 'RJ', city: 'Volta Redonda', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-saogoncalo', name: 'Instituto Federal do Rio de Janeiro - Campus São Gonçalo', acronym: 'IFRJ', mecCode: '14516', state: 'RJ', city: 'São Gonçalo', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-arraialcabo', name: 'Instituto Federal do Rio de Janeiro - Campus Arraial do Cabo', acronym: 'IFRJ', mecCode: '14517', state: 'RJ', city: 'Arraial do Cabo', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-mesquita', name: 'Instituto Federal do Rio de Janeiro - Campus Mesquita', acronym: 'IFRJ', mecCode: '14518', state: 'RJ', city: 'Mesquita', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-pinheiral', name: 'Instituto Federal do Rio de Janeiro - Campus Pinheiral', acronym: 'IFRJ', mecCode: '14519', state: 'RJ', city: 'Pinheiral', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-realengo', name: 'Instituto Federal do Rio de Janeiro - Campus Realengo', acronym: 'IFRJ', mecCode: '14520', state: 'RJ', city: 'Rio de Janeiro', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-belfordroxo', name: 'Instituto Federal do Rio de Janeiro - Campus Belford Roxo', acronym: 'IFRJ', mecCode: '14521', state: 'RJ', city: 'Belford Roxo', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-resende', name: 'Instituto Federal do Rio de Janeiro - Campus Resende', acronym: 'IFRJ', mecCode: '14522', state: 'RJ', city: 'Resende', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-niterói', name: 'Instituto Federal do Rio de Janeiro - Campus Niterói', acronym: 'IFRJ', mecCode: '14523', state: 'RJ', city: 'Niterói', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-paulofrontin', name: 'Instituto Federal do Rio de Janeiro - Campus Eng. Paulo de Frontin', acronym: 'IFRJ', mecCode: '14524', state: 'RJ', city: 'Engenheiro Paulo de Frontin', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'ifrj-reitoria', name: 'Instituto Federal do Rio de Janeiro - Reitoria', acronym: 'IFRJ', mecCode: '14510', state: 'RJ', city: 'Rio de Janeiro', type: 'Instituto Federal', cat: 'Pública Federal' },
        { id: 'uerj', name: 'Universidade do Estado do Rio de Janeiro', acronym: 'UERJ', mecCode: '569', state: 'RJ', city: 'Rio de Janeiro', type: 'Universidade', cat: 'Pública Estadual' },
        { id: 'ufrj', name: 'Universidade Federal do Rio de Janeiro', acronym: 'UFRJ', mecCode: '586', state: 'RJ', city: 'Rio de Janeiro', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'uff', name: 'Universidade Federal Fluminense', acronym: 'UFF', mecCode: '584', state: 'RJ', city: 'Niterói', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'unirio', name: 'Universidade Federal do Estado do Rio de Janeiro', acronym: 'UNIRIO', mecCode: '585', state: 'RJ', city: 'Rio de Janeiro', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufrrj', name: 'Universidade Federal Rural do Rio de Janeiro', acronym: 'UFRRJ', mecCode: '587', state: 'RJ', city: 'Seropédica', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'cefet-rj', name: 'Centro Federal de Educação Tecnológica Celso Suckow da Fonseca', acronym: 'CEFET-RJ', mecCode: '564', state: 'RJ', city: 'Rio de Janeiro', type: 'Centro Federal', cat: 'Pública Federal' },
        { id: 'uenf', name: 'Universidade Estadual do Norte Fluminense Darcy Ribeiro', acronym: 'UENF', mecCode: '2470', state: 'RJ', city: 'Campos dos Goytacazes', type: 'Universidade', cat: 'Pública Estadual' },
        { id: 'cbmerj-abmdpii', name: 'Academia de Bombeiro Militar D. Pedro II - CFO CBMERJ', acronym: 'ABMDP II', mecCode: 'CFO-CBMERJ', state: 'RJ', city: 'Rio de Janeiro', type: 'Academia Militar', cat: 'Militar Estadual' },
        { id: 'usp', name: 'Universidade de São Paulo', acronym: 'USP', mecCode: '549', state: 'SP', city: 'São Paulo', type: 'Universidade', cat: 'Pública Estadual' },
        { id: 'unicamp', name: 'Universidade Estadual de Campinas', acronym: 'UNICAMP', mecCode: '550', state: 'SP', city: 'Campinas', type: 'Universidade', cat: 'Pública Estadual' },
        { id: 'unesp', name: 'Universidade Estadual Paulista Júlio de Mesquita Filho', acronym: 'UNESP', mecCode: '551', state: 'SP', city: 'São Paulo', type: 'Universidade', cat: 'Pública Estadual' },
        { id: 'ufmg', name: 'Universidade Federal de Minas Gerais', acronym: 'UFMG', mecCode: '588', state: 'MG', city: 'Belo Horizonte', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'unb', name: 'Universidade de Brasília', acronym: 'UnB', mecCode: '2', state: 'DF', city: 'Brasília', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufpr', name: 'Universidade Federal do Paraná', acronym: 'UFPR', mecCode: '574', state: 'PR', city: 'Curitiba', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufsc', name: 'Universidade Federal de Santa Catarina', acronym: 'UFSC', mecCode: '576', state: 'SC', city: 'Florianópolis', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufrgs', name: 'Universidade Federal do Rio Grande do Sul', acronym: 'UFRGS', mecCode: '578', state: 'RS', city: 'Porto Alegre', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufpe', name: 'Universidade Federal de Pernambuco', acronym: 'UFPE', mecCode: '580', state: 'PE', city: 'Recife', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'ufba', name: 'Universidade Federal da Bahia', acronym: 'UFBA', mecCode: '582', state: 'BA', city: 'Salvador', type: 'Universidade', cat: 'Pública Federal' },
        { id: 'puc-rio', name: 'Pontifícia Universidade Católica do Rio de Janeiro', acronym: 'PUC-Rio', mecCode: '546', state: 'RJ', city: 'Rio de Janeiro', type: 'Universidade', cat: 'Privada Comunitária' },
        { id: 'fgv-rio', name: 'Fundação Getulio Vargas', acronym: 'FGV-Rio', mecCode: '341', state: 'RJ', city: 'Rio de Janeiro', type: 'Faculdade', cat: 'Privada' },
      ];

      const insertInst = this.db.prepare(
        'INSERT INTO university_institutions (id, name, acronym, mec_code, state, city, institution_type, administrative_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const inst of institutions) {
        insertInst.run(inst.id, inst.name, inst.acronym, inst.mecCode, inst.state, inst.city, inst.type, inst.cat, 'active');
      }

      const courses = [
        { instId: 'ifrj-maracana', name: 'Técnico em Química', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-TQ-01' },
        { instId: 'ifrj-maracana', name: 'Técnico em Biotecnologia', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-TB-02' },
        { instId: 'ifrj-maracana', name: 'Técnico em Meio Ambiente', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-TMA-03' },
        { instId: 'ifrj-maracana', name: 'Técnico em Alimentos', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-TAL-04' },
        { instId: 'ifrj-maracana', name: 'Bacharelado em Química Industrial', degree: 'Bacharelado', modality: 'Presencial', mecCode: '112034' },
        { instId: 'ifrj-maracana', name: 'Licenciatura em Química', degree: 'Licenciatura', modality: 'Presencial', mecCode: '112035' },
        { instId: 'ifrj-nilopolis', name: 'Técnico em Química', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-NIL-01' },
        { instId: 'ifrj-nilopolis', name: 'Licenciatura em Física', degree: 'Licenciatura', modality: 'Presencial', mecCode: '112040' },
        { instId: 'ifrj-nilopolis', name: 'Licenciatura em Química', degree: 'Licenciatura', modality: 'Presencial', mecCode: '112041' },
        { instId: 'ifrj-duquecaxias', name: 'Técnico em Química', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-DC-01' },
        { instId: 'ifrj-duquecaxias', name: 'Técnico em Petróleo e Gás', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-DC-02' },
        { instId: 'ifrj-paracambi', name: 'Técnico em Eletrotécnica', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-PAR-01' },
        { instId: 'ifrj-paracambi', name: 'Técnico em Mecânica', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-PAR-02' },
        { instId: 'ifrj-voltaredonda', name: 'Técnico em Automação Industrial', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-VR-01' },
        { instId: 'ifrj-voltaredonda', name: 'Técnico em Informática', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-VR-02' },
        { instId: 'ifrj-saogoncalo', name: 'Técnico em Administração', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-SG-01' },
        { instId: 'ifrj-arraialcabo', name: 'Técnico em Informática', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-AC-01' },
        { instId: 'ifrj-realengo', name: 'Técnico em Farmácia', degree: 'Técnico', modality: 'Presencial', mecCode: 'IFRJ-REA-01' },
        { instId: 'ifrj-realengo', name: 'Tecnologia em Gestão Ambiental', degree: 'Tecnólogo', modality: 'Presencial', mecCode: '112050' },
        { instId: 'ifrj-paulofrontin', name: 'Tecnologia em Jogos Digitais', degree: 'Tecnólogo', modality: 'Presencial', mecCode: '112060' },
        { instId: 'uerj', name: 'Medicina', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-MED-01' },
        { instId: 'uerj', name: 'Direito', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-DIR-02' },
        { instId: 'uerj', name: 'Engenharia Química', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-EQ-03' },
        { instId: 'uerj', name: 'Engenharia Mecânica', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-EM-04' },
        { instId: 'uerj', name: 'Engenharia Civil', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-EC-05' },
        { instId: 'uerj', name: 'Ciência da Computação', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-CC-06' },
        { instId: 'uerj', name: 'Psicologia', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-PSI-07' },
        { instId: 'uerj', name: 'Enfermagem', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-ENF-08' },
        { instId: 'uerj', name: 'Odontologia', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UERJ-ODO-09' },
        { instId: 'uerj', name: 'Ciências Biológicas', degree: 'Bacharelado/Licenciatura', modality: 'Presencial', mecCode: 'UERJ-BIO-10' },
        { instId: 'ufrj', name: 'Medicina', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-MED-01' },
        { instId: 'ufrj', name: 'Direito', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-DIR-02' },
        { instId: 'ufrj', name: 'Engenharia Química', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-EQ-03' },
        { instId: 'ufrj', name: 'Ciência da Computação', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-CC-04' },
        { instId: 'ufrj', name: 'Química Industrial', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-QI-05' },
        { instId: 'ufrj', name: 'Arquitetura e Urbanismo', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFRJ-ARQ-06' },
        { instId: 'uff', name: 'Medicina', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFF-MED-01' },
        { instId: 'uff', name: 'Direito', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFF-DIR-02' },
        { instId: 'uff', name: 'Psicologia', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFF-PSI-03' },
        { instId: 'uff', name: 'Engenharia de Produção', degree: 'Bacharelado', modality: 'Presencial', mecCode: 'UFF-EP-04' },
        { instId: 'cbmerj-abmdpii', name: 'Curso de Formação de Oficiais - CFO CBMERJ', degree: 'Bacharelado Militar', modality: 'Presencial', mecCode: 'CFO-CBMERJ-01' },
      ];

      const insertCourse = this.db.prepare(
        'INSERT INTO university_courses (id, institution_id, name, degree_type, modality, status, mec_code) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const c of courses) {
        insertCourse.run(crypto.randomUUID(), c.instId, c.name, c.degree, c.modality, 'active', c.mecCode);
      }
    } catch (err) {
      console.warn('[e-MEC Seed] Aviso ao verificar semente de universidades:', err);
    }
  }

  getProfile(userId: string): any {
    return rowProfile(this.db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId));
  }

  upsertProfile(userId: string, input: ProfileInput): any {
    const now = isoNow();
    const current = this.getProfile(userId);
    const values = {
      displayName: input.displayName !== undefined ? String(input.displayName).trim().slice(0, 120) : (current?.displayName ?? ''),
      institution: input.institution !== undefined ? (String(input.institution).trim().slice(0, 120) || 'IFRJ') : (current?.institution ?? 'IFRJ'),
      campus: input.campus !== undefined ? (input.campus == null ? null : String(input.campus).trim().slice(0, 120)) : (current?.campus ?? null),
      course: input.course !== undefined ? (input.course == null ? null : String(input.course).trim().slice(0, 160)) : (current?.course ?? null),
      schoolYear: input.schoolYear !== undefined ? (input.schoolYear == null ? null : String(input.schoolYear).trim().slice(0, 80)) : (current?.schoolYear ?? null),
      className: input.className !== undefined ? (input.className == null ? null : String(input.className).trim().slice(0, 80)) : (current?.className ?? null),
      shift: input.shift !== undefined ? (input.shift == null ? null : String(input.shift).trim().slice(0, 40)) : (current?.shift ?? null),
      availableTimeJson: input.availableTimeJson !== undefined ? (input.availableTimeJson == null ? null : String(input.availableTimeJson).trim().slice(0, 8000)) : (current?.availableTimeJson ?? null),
      onboardingCompleted: input.onboardingCompleted !== undefined ? Boolean(input.onboardingCompleted) : Boolean(current?.onboardingCompleted),
    };
    if (current) {
      this.db.prepare(
        'UPDATE student_profiles SET display_name=?, institution=?, campus=?, course=?, school_year=?, class_name=?, shift=?, available_time_json=?, onboarding_completed=?, updated_at=? WHERE user_id=?'
      ).run(
        values.displayName, values.institution, values.campus, values.course, values.schoolYear, values.className, values.shift, values.availableTimeJson, values.onboardingCompleted ? 1 : 0, now, userId
      );
    } else {
      this.db.prepare(
        'INSERT INTO student_profiles (id,user_id,display_name,institution,campus,course,school_year,class_name,shift,available_time_json,onboarding_completed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        crypto.randomUUID(), userId, values.displayName, values.institution, values.campus, values.course, values.schoolYear, values.className, values.shift, values.availableTimeJson, values.onboardingCompleted ? 1 : 0, now, now
      );
    }
    return this.getProfile(userId);
  }

  listSubjects(userId: string): any[] { return (this.db.prepare('SELECT * FROM student_subjects WHERE user_id = ? AND active = 1 ORDER BY name').all(userId) as any[]).map(rowSubject); }
  getSubject(userId: string, id: string): any { return rowSubject(this.db.prepare('SELECT * FROM student_subjects WHERE user_id = ? AND id = ? AND active = 1').get(userId, id)) || null; }
  createSubject(userId: string, input: SubjectInput): any { const now = isoNow(); const id = crypto.randomUUID(); this.db.prepare('INSERT INTO student_subjects (id,user_id,name,category,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, userId, input.name.trim().slice(0, 120), input.category || 'custom', input.source || 'custom', now, now); return this.getSubject(userId, id); }
  updateSubject(userId: string, id: string, input: Partial<SubjectInput>): any { const current = this.getSubject(userId, id); if (!current) return null; this.db.prepare('UPDATE student_subjects SET name=?, category=?, updated_at=? WHERE user_id=? AND id=?').run(String(input.name ?? current.name).trim().slice(0, 120), String(input.category ?? current.category).slice(0, 40), isoNow(), userId, id); return this.getSubject(userId, id); }
  deleteSubject(userId: string, id: string): boolean { const result = this.db.prepare('UPDATE student_subjects SET active=0, updated_at=? WHERE user_id=? AND id=?').run(isoNow(), userId, id); return Number(result.changes) > 0; }
  listTopics(userId: string, subjectId: string): any[] { return this.db.prepare('SELECT id, user_id AS userId, subject_id AS subjectId, name, created_at AS createdAt FROM student_subject_topics WHERE user_id=? AND subject_id=? ORDER BY name').all(userId, subjectId) as any[]; }
  createTopic(userId: string, subjectId: string, name: string): any { const id=crypto.randomUUID(); this.db.prepare('INSERT INTO student_subject_topics (id,user_id,subject_id,name,created_at) VALUES (?,?,?,?,?)').run(id,userId,subjectId,name.trim().slice(0,120),isoNow()); return this.db.prepare('SELECT id,user_id AS userId,subject_id AS subjectId,name,created_at AS createdAt FROM student_subject_topics WHERE user_id=? AND id=?').get(userId,id); }
  deleteTopic(userId: string, id: string): boolean { const result=this.db.prepare('DELETE FROM student_subject_topics WHERE user_id=? AND id=?').run(userId,id); return Number(result.changes)>0; }

  listPeriods(userId: string): any[] { return this.db.prepare('SELECT id, user_id AS userId, name, sort_order AS sortOrder, starts_at AS startsAt, ends_at AS endsAt, active FROM student_academic_periods WHERE user_id=? AND active=1 ORDER BY sort_order, name').all(userId) as any[]; }
  private hasPeriod(userId: string, periodId?: string | null): boolean { return !periodId || Boolean(this.db.prepare('SELECT 1 FROM student_academic_periods WHERE user_id=? AND id=? AND active=1').get(userId, periodId)); }

  listGrades(userId: string): any[] { return (this.db.prepare('SELECT g.*, s.name AS subject_name, p.name AS period_name FROM student_grades g JOIN student_subjects s ON s.id=g.subject_id AND s.user_id=g.user_id LEFT JOIN student_academic_periods p ON p.id=g.period_id AND p.user_id=g.user_id WHERE g.user_id=? ORDER BY s.name, g.created_at DESC').all(userId) as any[]).map(rowGrade); }
  getGrade(userId: string, id: string): any { const r = this.db.prepare('SELECT g.*, s.name AS subject_name, p.name AS period_name FROM student_grades g JOIN student_subjects s ON s.id=g.subject_id AND s.user_id=g.user_id LEFT JOIN student_academic_periods p ON p.id=g.period_id AND p.user_id=g.user_id WHERE g.user_id=? AND g.id=?').get(userId, id); return rowGrade(r) || null; }
  createGrade(userId: string, input: GradeInput): any { const subject = this.getSubject(userId, input.subjectId); if (!subject || !this.hasPeriod(userId, input.periodId)) return null; const id = crypto.randomUUID(); const now = isoNow(); this.db.prepare('INSERT INTO student_grades (id,user_id,subject_id,period_id,assessment_name,score,weight,source,is_uncertain,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,userId,input.subjectId,input.periodId || null,input.assessmentName.trim().slice(0,120),input.score,input.weight ?? 1,input.source || 'manual',input.isUncertain ? 1 : 0,now,now); return this.getGrade(userId,id); }
  updateGrade(userId: string, id: string, input: Partial<GradeInput>): any { const current = this.getGrade(userId,id); if (!current) return null; const subjectId = input.subjectId || current.subjectId; const periodId = input.periodId === undefined ? current.periodId : input.periodId; if (!this.getSubject(userId,subjectId) || !this.hasPeriod(userId, periodId)) return null; this.db.prepare('UPDATE student_grades SET subject_id=?, period_id=?, assessment_name=?, score=?, weight=?, source=?, is_uncertain=?, updated_at=? WHERE user_id=? AND id=?').run(subjectId,periodId,input.assessmentName === undefined ? current.assessmentName : String(input.assessmentName).trim().slice(0,120),input.score === undefined ? current.score : input.score,input.weight === undefined ? current.weight : input.weight,input.source || current.source,input.isUncertain === undefined ? (current.isUncertain ? 1 : 0) : (input.isUncertain ? 1 : 0),isoNow(),userId,id); return this.getGrade(userId,id); }
  deleteGrade(userId: string, id: string): boolean { const result = this.db.prepare('DELETE FROM student_grades WHERE user_id=? AND id=?').run(userId,id); return Number(result.changes) > 0; }

  listExams(userId: string): any[] { return (this.db.prepare('SELECT e.*, s.name AS subject_name FROM student_exams e LEFT JOIN student_subjects s ON s.id=e.subject_id AND s.user_id=e.user_id WHERE e.user_id=? ORDER BY e.exam_date, e.exam_time').all(userId) as any[]).map(rowExam); }
  getExam(userId: string, id: string): any { const r = this.db.prepare('SELECT e.*, s.name AS subject_name FROM student_exams e LEFT JOIN student_subjects s ON s.id=e.subject_id AND s.user_id=e.user_id WHERE e.user_id=? AND e.id=?').get(userId,id); return rowExam(r) || null; }
  createExam(userId: string, input: ExamInput): any { if (input.subjectId && !this.getSubject(userId,input.subjectId)) return null; const id=crypto.randomUUID(), now=isoNow(); this.db.prepare('INSERT INTO student_exams (id,user_id,subject_id,name,exam_date,exam_time,weight,target_grade,topics_json,notes,room,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,userId,input.subjectId || null,input.name.trim().slice(0,160),input.examDate,input.examTime || null,input.weight ?? 1,input.targetGrade ?? null,JSON.stringify((input.topics || []).slice(0,40).map((x) => String(x).slice(0,120))),input.notes ? String(input.notes).slice(0,2000) : null,input.room ? String(input.room).slice(0,120) : null,input.status || 'planned',now,now); return this.getExam(userId,id); }
  updateExam(userId: string,id:string,input:Partial<ExamInput>):any { const current=this.getExam(userId,id); if(!current)return null; const subjectId=input.subjectId===undefined?current.subjectId:input.subjectId; if(subjectId&&!this.getSubject(userId,subjectId))return null; this.db.prepare('UPDATE student_exams SET subject_id=?,name=?,exam_date=?,exam_time=?,weight=?,target_grade=?,topics_json=?,notes=?,room=?,status=?,updated_at=? WHERE user_id=? AND id=?').run(subjectId,input.name===undefined?current.name:String(input.name).trim().slice(0,160),input.examDate||current.examDate,input.examTime===undefined?current.examTime:input.examTime,input.weight===undefined?current.weight:input.weight,input.targetGrade===undefined?current.targetGrade:input.targetGrade,JSON.stringify(input.topics===undefined?current.topics:input.topics),input.notes===undefined?current.notes:input.notes,input.room===undefined?current.room:input.room,input.status||current.status,isoNow(),userId,id); return this.getExam(userId,id); }
  deleteExam(userId:string,id:string):boolean { const result=this.db.prepare('DELETE FROM student_exams WHERE user_id=? AND id=?').run(userId,id); return Number(result.changes)>0; }

  listEvents(userId: string): any[] { return (this.db.prepare('SELECT * FROM student_calendar_events WHERE user_id=? ORDER BY event_date,start_time,title').all(userId) as any[]).map(rowEvent); }
  createEvent(userId:string,input:EventInput):any { if(input.examId&&!this.getExam(userId,input.examId))return null; const id=crypto.randomUUID(),now=isoNow(); this.db.prepare('INSERT INTO student_calendar_events (id,user_id,event_type,title,event_date,start_time,end_time,exam_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,userId,input.eventType,input.title.trim().slice(0,160),input.eventDate,input.startTime||null,input.endTime||null,input.examId||null,input.notes?String(input.notes).slice(0,2000):null,now,now); return rowEvent(this.db.prepare('SELECT * FROM student_calendar_events WHERE user_id=? AND id=?').get(userId,id)); }
  deleteEvent(userId:string,id:string):boolean { const result=this.db.prepare('DELETE FROM student_calendar_events WHERE user_id=? AND id=?').run(userId,id); return Number(result.changes)>0; }

  listGoals(userId:string):any[] { const goals:any[]=this.db.prepare('SELECT * FROM student_goals WHERE user_id=? AND status=\'active\' ORDER BY created_at DESC').all(userId); return goals.map((g)=>({...g,id:g.id,userId:g.user_id,degree:g.degree,selectionSystem:g.selection_system,institutions:this.db.prepare('SELECT institution_name AS name,institution_code AS code,state,city FROM student_goal_institutions WHERE user_id=? AND goal_id=?').all(userId,g.id)})); }
  createGoal(userId:string,input:{degree:string;selectionSystem:string;institutions?:Array<{name:string;code?:string;state?:string;city?:string}>}):any { const id=crypto.randomUUID(),now=isoNow(); this.db.prepare('INSERT INTO student_goals (id,user_id,degree,selection_system,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id,userId,input.degree.trim().slice(0,160),input.selectionSystem.slice(0,60),now,now); for(const item of (input.institutions||[]).slice(0,20))this.db.prepare('INSERT INTO student_goal_institutions (id,user_id,goal_id,institution_name,institution_code,state,city) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),userId,id,String(item.name).slice(0,160),item.code||null,item.state||null,item.city||null); return this.listGoals(userId).find((g)=>g.id===id); }

  createReportCard(userId:string,fileId:string,periodId?:string|null):any { if (!this.hasPeriod(userId, periodId)) return null; const id=crypto.randomUUID(),now=isoNow(); this.db.prepare('INSERT INTO student_report_cards (id,user_id,file_id,period_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id,userId,fileId,periodId||null,now,now); return {id,userId,fileId,periodId:periodId||null,status:'uploaded',createdAt:now}; }
  saveAnalysis(userId:string,type:string,summary:string,structured:any):any { const id=crypto.randomUUID(),now=isoNow(); this.db.prepare('INSERT INTO student_ai_analyses (id,user_id,analysis_type,summary,structured_json,created_at) VALUES (?,?,?,?,?,?)').run(id,userId,type,summary.slice(0,4000),structured?JSON.stringify(structured):null,now); return {id,userId,type,summary,structured,createdAt:now}; }
  listAnalyses(userId:string):any[] { return (this.db.prepare('SELECT id,user_id,analysis_type,summary,structured_json,created_at FROM student_ai_analyses WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(userId) as any[]).map((r)=>({id:r.id,userId:r.user_id,type:r.analysis_type,summary:r.summary,structured:parseJson(r.structured_json,null),createdAt:r.created_at})); }

  reserveAiRequest(userId:string,limits:{requests:number;reports?:number},isReport=false):boolean { const day=new Date().toISOString().slice(0,10); this.db.prepare('INSERT INTO student_ai_usage (user_id,usage_date) VALUES (?,?) ON CONFLICT(user_id,usage_date) DO NOTHING').run(userId,day); const column=isReport?'report_count':'request_count'; const max=isReport?(limits.reports??limits.requests):limits.requests; const result=this.db.prepare(`UPDATE student_ai_usage SET ${column}=${column}+1 WHERE user_id=? AND usage_date=? AND ${column} < ?`).run(userId,day,max); return Number(result.changes)>0; }
  usage(userId:string):any { const day=new Date().toISOString().slice(0,10); return this.db.prepare('SELECT request_count AS requests,report_count AS reports,input_tokens AS inputTokens,output_tokens AS outputTokens FROM student_ai_usage WHERE user_id=? AND usage_date=?').get(userId,day) || {requests:0,reports:0,inputTokens:0,outputTokens:0}; }

  searchInstitutions(userId:string,query:string,limit=25,offset=0):any[] {
    void userId;
    this.ensureUniversitySeed();
    const q = `%${(query || '').trim().slice(0, 80)}%`;
    return this.db.prepare(
      "SELECT id,name,acronym,mec_code AS mecCode,state,city,institution_type AS institutionType,administrative_category AS administrativeCategory,status FROM university_institutions WHERE status='active' AND (name LIKE ? OR acronym LIKE ? OR state LIKE ? OR city LIKE ?) ORDER BY (CASE WHEN acronym LIKE ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END), name LIMIT ? OFFSET ?"
    ).all(q, q, q, q, q, q, Math.min(100, Math.max(1, limit)), Math.max(0, offset)) as any[];
  }

  searchCourses(userId:string,query:string,limit=25,offset=0):any[] {
    void userId;
    this.ensureUniversitySeed();
    const q = `%${(query || '').trim().slice(0, 80)}%`;
    return this.db.prepare(
      "SELECT c.id,c.name,c.degree_type AS degreeType,c.modality,c.status,c.mec_code AS mecCode,i.id AS institutionId,i.name AS institutionName,i.acronym,i.state,i.city FROM university_courses c JOIN university_institutions i ON i.id=c.institution_id WHERE c.status='active' AND (c.name LIKE ? OR i.name LIKE ? OR i.acronym LIKE ?) ORDER BY (CASE WHEN c.name LIKE ? THEN 0 ELSE 1 END), c.name LIMIT ? OFFSET ?"
    ).all(q, q, q, q, Math.min(100, Math.max(1, limit)), Math.max(0, offset)) as any[];
  }

  dashboard(userId:string):any {
    this.ensureDefaults(userId);
    const subjects=this.listSubjects(userId), grades=this.listGrades(userId), exams=this.listExams(userId), events=this.listEvents(userId), goals=this.listGoals(userId), profile=this.getProfile(userId);
    const today=Date.now();
    const performance=subjects.map((subject)=>{ const subjectGrades=grades.filter((g)=>g.subjectId===subject.id); const average=weightedAverage(subjectGrades); const next=exams.find((e)=>e.subjectId===subject.id&&e.status==='planned'&&new Date(`${e.examDate}T23:59:59`).getTime()>=today); const days=next?Math.ceil((new Date(`${next.examDate}T23:59:59`).getTime()-today)/86400000):null; const score=calculatePriorityScore({currentAverage:average??0,targetGrade:next?.targetGrade,daysUntilExam:days,examWeight:next?.weight,difficulty:average==null?5:Math.max(0,10-(average)),vestibularWeight:goals.length?5:0}); return {...subject,average,gradesCount:subjectGrades.length,nextExam:next?{id:next.id,name:next.name,date:next.examDate,daysRemaining:days}:null,priorityScore:score,priority:classifyPriority(score)}; }).sort((a,b)=>b.priorityScore-a.priorityScore);
    const enrichedExams = exams.map((exam) => {
      const daysRemaining = Math.ceil((new Date(`${exam.examDate}T23:59:59`).getTime() - today) / 86400000);
      const currentAverage = performance.find((item) => item.id === exam.subjectId)?.average ?? 0;
      const score = calculatePriorityScore({ currentAverage, targetGrade: exam.targetGrade, daysUntilExam: daysRemaining, examWeight: exam.weight });
      return { ...exam, daysRemaining, priority: classifyPriority(score), priorityScore: score };
    });
    return { profile, subjects, periods: this.listPeriods(userId), grades, exams: enrichedExams, events, goals, performance, analyses: this.listAnalyses(userId), usage: this.usage(userId) };
  }
}
