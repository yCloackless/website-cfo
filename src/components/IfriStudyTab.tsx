import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Heart,
  Home,
  ListTodo,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  University,
  Upload,
  X
} from 'lucide-react';
import { apiFetch } from '../services/apiFetch';

type Tab = 'dashboard' | 'grades' | 'subjects' | 'exams' | 'calendar' | 'goals' | 'universities' | 'assistant' | 'settings';
type Props = { userProfile?: { fullName?: string; username?: string } | null; onExit: () => void; onSignOut: () => void };

const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'grades', label: 'Meu Boletim', icon: ListTodo },
  { id: 'subjects', label: 'Matérias', icon: BookOpen },
  { id: 'exams', label: 'Próximas provas', icon: CalendarDays },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'goals', label: 'Meu objetivo', icon: Heart },
  { id: 'universities', label: 'Faculdades / MEC', icon: University },
  { id: 'assistant', label: 'Assistente IA', icon: Sparkles },
];

const IFRJ_CAMPUSES = [
  'Maracanã',
  'Nilópolis',
  'Duque de Caxias',
  'Paracambi',
  'Volta Redonda',
  'São Gonçalo',
  'Realengo',
  'Belford Roxo',
  'Niterói',
  'Arraial do Cabo',
  'Mesquita',
  'Pinheiral',
  'Resende',
  'Eng. Paulo de Frontin',
];

const POPULAR_COURSES = [
  'Química',
  'Informática',
  'Biotecnologia',
  'Meio Ambiente',
  'Mecânica',
  'Eletrotécnica',
  'Alimentos',
  'Farmácia',
  'Administração',
  'Segurança do Trabalho',
];

const TARGET_UNIVERSITIES = [
  'UERJ',
  'UFRJ',
  'UFF',
  'UNIRIO',
  'IFRJ',
  'CEFET-RJ',
  'CFO CBMERJ',
  'USP',
  'UNICAMP',
  'UFMG',
];

const emptyGrade = { subjectId: '', periodId: '', assessmentName: '', score: '', weight: '1' };
const emptyExam = { subjectId: '', name: '', examDate: '', examTime: '', weight: '1', targetGrade: '', topics: '', notes: '', room: '' };

async function request(path: string, options?: RequestInit) {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    let message = 'Falha na requisição';
    try {
      const err = await response.json();
      message = err?.message || err?.error || message;
    } catch {}
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function formatDate(value?: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function priorityLabel(value?: string) {
  return ({ critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' } as Record<string, string>)[value || ''] || 'Baixa';
}

export function IfriStudyTab({ userProfile, onExit, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('rumo_estudos_theme') === 'dark');

  const [profileForm, setProfileForm] = useState<any>({
    displayName: userProfile?.fullName || '',
    institution: 'IFRJ',
    campus: '',
    course: '',
  });

  const [gradeForm, setGradeForm] = useState(emptyGrade);
  const [editingGrade, setEditingGrade] = useState<string | null>(null);
  const [examForm, setExamForm] = useState(emptyExam);
  const [eventForm, setEventForm] = useState({ eventType: 'custom', title: '', eventDate: '', startTime: '', notes: '' });
  const [subjectName, setSubjectName] = useState('');
  const [topicSubjectId, setTopicSubjectId] = useState('');
  const [topicName, setTopicName] = useState('');
  const [goalForm, setGoalForm] = useState({ degree: '', selectionSystem: 'ENEM', institutions: '' });

  // MEC e Faculdades
  const [universityMode, setUniversityMode] = useState<'institutions' | 'courses'>('institutions');
  const [universityQuery, setUniversityQuery] = useState('');
  const [universityItems, setUniversityItems] = useState<any[]>([]);
  const [searchingMec, setSearchingMec] = useState(false);

  // Assistente e Boletim
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await request('/api/rumo-estudos/dashboard');
      setDashboard(data.dashboard);
      if (data.dashboard?.profile) {
        setProfileForm((prev: any) => ({ ...prev, ...data.dashboard.profile }));
      }
    } catch (err: any) {
      setMessage(err?.message || 'Não conseguimos conectar ao espaço de estudos.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('rumo_estudos_theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (message) {
      const timer = window.setTimeout(() => setMessage(''), 3500);
      return () => window.clearTimeout(timer);
    }
  }, [message]);

  const subjects = dashboard?.subjects || [];
  const periods = dashboard?.periods || [];
  const profile = dashboard?.profile;
  const grades = dashboard?.grades || [];
  const exams = dashboard?.exams || [];
  const performance = dashboard?.performance || [];
  const nextExam = exams.find((item: any) => item.status === 'planned' && item.daysRemaining >= 0);
  const name =
    profile?.displayName?.trim() ||
    userProfile?.fullName?.trim() ||
    (userProfile?.username && userProfile.username.toLowerCase() !== 'admin' ? userProfile.username : '') ||
    'Estudante';

  const overallAverage = useMemo(() => {
    const values = grades.map((item: any) => Number(item.score)).filter(Number.isFinite);
    return values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null;
  }, [grades]);

  const save = async (path: string, method: string, body: any, successMsg = 'Salvo com sucesso.') => {
    setSaving(true);
    try {
      const data = await request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (data?.profile) {
        setProfileForm((prev: any) => ({ ...prev, ...data.profile }));
        setDashboard((prev: any) => prev ? { ...prev, profile: data.profile } : prev);
      }
      await load(false);
      setMessage(successMsg);
      return true;
    } catch (err: any) {
      setMessage(err?.message && err.message !== 'Falha na requisição' ? err.message : 'Não foi possível salvar agora.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (path: string) => {
    try {
      await request(path, { method: 'DELETE' });
      await load(false);
      setMessage('Removido com sucesso.');
    } catch (err: any) {
      setMessage(err?.message || 'Não foi possível remover agora.');
    }
  };

  const submitGrade = async () => {
    const ok = await save(
      editingGrade ? `/api/rumo-estudos/grades/${editingGrade}` : '/api/rumo-estudos/grades',
      editingGrade ? 'PATCH' : 'POST',
      { ...gradeForm, score: Number(gradeForm.score), weight: Number(gradeForm.weight), periodId: gradeForm.periodId || null }
    );
    if (ok) {
      setGradeForm(emptyGrade);
      setEditingGrade(null);
    }
  };

  const submitExam = async () => {
    const ok = await save('/api/rumo-estudos/exams', 'POST', {
      ...examForm,
      weight: Number(examForm.weight),
      targetGrade: examForm.targetGrade ? Number(examForm.targetGrade) : null,
      topics: examForm.topics.split(',').map((item) => item.trim()).filter(Boolean),
    });
    if (ok) setExamForm(emptyExam);
  };

  const analyze = async () => {
    setAnalysisLoading(true);
    try {
      const data = await request('/api/rumo-estudos/ai/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setAnswer(data.analysis?.summary || '');
      await load(false);
      setTab('assistant');
    } catch {
      setMessage('Não foi possível realizar a análise agora. Suas informações continuam salvas.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setAnalysisLoading(true);
    try {
      const data = await request('/api/rumo-estudos/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      setAnswer(data.answer || '');
      setQuestion('');
    } catch {
      setMessage('A assistente está indisponível no momento.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const searchMec = async (queryParam?: string, modeParam?: 'institutions' | 'courses') => {
    const q = (queryParam !== undefined ? queryParam : universityQuery).trim();
    const mode = modeParam || universityMode;
    setSearchingMec(true);
    try {
      const endpoint = mode === 'courses' ? '/api/rumo-estudos/universities/courses' : '/api/rumo-estudos/universities/institutions';
      const data = await request(`${endpoint}?q=${encodeURIComponent(q)}&limit=30`);
      setUniversityItems(data.items || []);
      if (!data.items || data.items.length === 0) {
        setMessage('Nenhum resultado encontrado no catálogo do MEC para esta busca.');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Busca no MEC indisponível no momento.');
    } finally {
      setSearchingMec(false);
    }
  };

  // Ações a partir do catálogo MEC
  const addInstitutionToGoal = (instName: string) => {
    setGoalForm((prev) => {
      const currentList = prev.institutions.split(',').map((s) => s.trim()).filter(Boolean);
      if (!currentList.includes(instName)) {
        currentList.push(instName);
      }
      return { ...prev, institutions: currentList.join(', ') };
    });
    setTab('goals');
    setMessage(`"${instName}" adicionada aos seus objetivos de vestibular!`);
  };

  const setCampusFromMec = async (campusName: string) => {
    const cleanName = campusName.replace(/^IFRJ\s*-\s*/i, '').replace(/Campus\s*/i, '').trim();
    const ok = await save(
      '/api/rumo-estudos/profile',
      'PATCH',
      { ...profileForm, campus: cleanName },
      `Campus "${cleanName}" definido no seu perfil!`
    );
    if (ok) {
      setProfileForm((prev: any) => ({ ...prev, campus: cleanName }));
    }
  };

  const setCourseFromMec = async (courseName: string) => {
    const ok = await save(
      '/api/rumo-estudos/profile',
      'PATCH',
      { ...profileForm, course: courseName },
      `Curso "${courseName}" definido no seu perfil!`
    );
    if (ok) {
      setProfileForm((prev: any) => ({ ...prev, course: courseName }));
    }
  };

  const uploadReport = async (file: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage('Envie PDF, PNG, JPG ou WEBP de até 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await request('/api/uploads/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, originalName: file.name, declaredMime: file.type, contentBase64: base64 }),
      });
      await request('/api/rumo-estudos/report-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: uploaded.file.id }),
      });
      const analyzed = await request('/api/rumo-estudos/report-cards/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: uploaded.file.id }),
      });
      setAnswer(`Boletim analisado. ${analyzed.extracted?.subjects?.length || 0} item(ns) identificado(s). Revise os campos marcados como incertos antes de lançar as notas.`);
      setTab('assistant');
      await load(false);
    } catch {
      setMessage('Não foi possível enviar ou analisar este arquivo.');
    } finally {
      setUploading(false);
    }
  };

  if (loading || !dashboard) {
    return (
      <div className={`rumo-app ${dark ? 'rumo-dark' : ''} min-h-screen grid place-items-center`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-rose-500" />
          <span className="text-sm font-semibold text-rose-400">Carregando seu espaço de estudos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rumo-app ${dark ? 'rumo-dark' : ''}`}>
      <header className="rumo-topbar">
        <div className="rumo-brand">
          <span className="rumo-brand-mark">
            <Heart className="h-4 w-4 fill-current" />
          </span>
          <div>
            <strong>Rumo Estudos</strong>
            <small>seu espaço acadêmico</small>
          </div>
        </div>
        <div className="rumo-top-actions">
          <button className="rumo-top-exit" onClick={onExit} title="Voltar ao Cronograma CFO">
            <ArrowLeft className="w-3.5 h-3.5" /> <span>CFO</span>
          </button>
          <button className="rumo-icon-button" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}>
            {dark ? <Sun /> : <Moon />}
          </button>
          <button className="rumo-account" onClick={() => setTab('settings')}>
            <span>{name.slice(0, 1).toUpperCase()}</span>
            <b>{name}</b>
          </button>
        </div>
      </header>

      <div className="rumo-layout">
        <aside className="rumo-sidebar">
          <button className="rumo-back" onClick={onExit}>
            <ArrowLeft /> Rumo ao CFO
          </button>
          <nav aria-label="Navegação Rumo Estudos">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}>
                <Icon /> <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="rumo-sidebar-footer">
            <button onClick={() => setTab('settings')}>
              <Settings2 /> Configurações
            </button>
            <button onClick={onSignOut}>
              <X /> Sair
            </button>
          </div>
        </aside>

        <main className="rumo-main">
          {message && (
            <div className="rumo-toast" role="status">
              {message}
            </div>
          )}

          {!profile?.onboardingCompleted && (
            <Onboarding form={profileForm} setForm={setProfileForm} save={save} saving={saving} />
          )}

          {tab === 'dashboard' && (
            <DashboardView
              name={name}
              profile={profile}
              overallAverage={overallAverage}
              nextExam={nextExam}
              performance={performance}
              analyses={dashboard.analyses}
              analyze={analyze}
              analysisLoading={analysisLoading}
              setTab={setTab}
            />
          )}

          {tab === 'grades' && (
            <GradesView
              grades={grades}
              subjects={subjects}
              periods={periods}
              form={gradeForm}
              setForm={setGradeForm}
              onSubmit={submitGrade}
              onEdit={(grade: any) => {
                setEditingGrade(grade.id);
                setGradeForm({
                  subjectId: grade.subjectId,
                  periodId: grade.periodId || '',
                  assessmentName: grade.assessmentName,
                  score: String(grade.score),
                  weight: String(grade.weight),
                });
              }}
              onDelete={(id: string) => remove(`/api/rumo-estudos/grades/${id}`)}
              editing={Boolean(editingGrade)}
              onCancel={() => {
                setEditingGrade(null);
                setGradeForm(emptyGrade);
              }}
              onUpload={uploadReport}
              uploading={uploading}
            />
          )}

          {tab === 'subjects' && (
            <SubjectsView
              subjects={subjects}
              subjectName={subjectName}
              setSubjectName={setSubjectName}
              onAdd={async () => {
                if (await save('/api/rumo-estudos/subjects', 'POST', { name: subjectName })) setSubjectName('');
              }}
              topicSubjectId={topicSubjectId}
              setTopicSubjectId={setTopicSubjectId}
              topicName={topicName}
              setTopicName={setTopicName}
              onTopic={async () => {
                if (await save(`/api/rumo-estudos/subjects/${topicSubjectId}/topics`, 'POST', { name: topicName })) setTopicName('');
              }}
              onDelete={(id: string) => remove(`/api/rumo-estudos/subjects/${id}`)}
              saving={saving}
            />
          )}

          {tab === 'exams' && (
            <ExamsView
              exams={exams}
              subjects={subjects}
              form={examForm}
              setForm={setExamForm}
              onSubmit={submitExam}
              onDelete={(id: string) => remove(`/api/rumo-estudos/exams/${id}`)}
              saving={saving}
            />
          )}

          {tab === 'calendar' && (
            <CalendarView
              events={dashboard.events}
              form={eventForm}
              setForm={setEventForm}
              onSubmit={async () => {
                if (await save('/api/rumo-estudos/calendar', 'POST', eventForm)) {
                  setEventForm({ eventType: 'custom', title: '', eventDate: '', startTime: '', notes: '' });
                }
              }}
              onDelete={(id: string) => remove(`/api/rumo-estudos/calendar/${id}`)}
              saving={saving}
            />
          )}

          {tab === 'goals' && (
            <GoalsView
              goals={dashboard.goals}
              form={goalForm}
              setForm={setGoalForm}
              onSubmit={async () => {
                if (
                  await save('/api/rumo-estudos/goals', 'POST', {
                    ...goalForm,
                    institutions: goalForm.institutions
                      .split(',')
                      .map((n) => ({ name: n.trim() }))
                      .filter((item) => item.name),
                  })
                ) {
                  setGoalForm({ degree: '', selectionSystem: 'ENEM', institutions: '' });
                }
              }}
              saving={saving}
              onOpenMecCatalog={() => {
                setTab('universities');
                if (universityItems.length === 0) {
                  void searchMec('IFRJ', 'institutions');
                }
              }}
            />
          )}

          {tab === 'universities' && (
            <UniversitiesView
              query={universityQuery}
              setQuery={setUniversityQuery}
              items={universityItems}
              mode={universityMode}
              setMode={(newMode: 'institutions' | 'courses') => {
                setUniversityMode(newMode);
                void searchMec(universityQuery, newMode);
              }}
              onSearch={() => searchMec(universityQuery, universityMode)}
              searching={searchingMec}
              onAddToGoal={addInstitutionToGoal}
              onSetCampus={setCampusFromMec}
              onSetCourse={setCourseFromMec}
            />
          )}

          {tab === 'assistant' && (
            <AssistantView
              answer={answer}
              question={question}
              setQuestion={setQuestion}
              onAsk={ask}
              loading={analysisLoading}
              history={dashboard.analyses}
            />
          )}

          {tab === 'settings' && (
            <SettingsView
              form={profileForm}
              setForm={setProfileForm}
              save={save}
              saving={saving}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="rumo-page-title">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rumo-card ${className}`}>{children}</section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rumo-empty">
      <Sparkles />
      <p>{children}</p>
    </div>
  );
}

function Onboarding({ form, setForm, save, saving }: any) {
  const handleStart = () => {
    const name = form.displayName?.trim() || 'Estudante';
    save(
      '/api/rumo-estudos/profile',
      'PATCH',
      {
        displayName: name,
        campus: form.campus?.trim() || 'Nilópolis',
        course: form.course?.trim() || '',
        institution: 'IFRJ',
        onboardingCompleted: true,
      },
      `Perfil configurado com sucesso! Bem-vindo(a), ${name}!`
    );
  };

  return (
    <Card className="rumo-onboarding">
      <div>
        <span className="rumo-kicker">Primeiro passo</span>
        <h2>Vamos preparar seu espaço</h2>
        <p>Informe seu nome, selecione seu campus do IFRJ e seu curso. Você poderá alterar tudo depois em Configurações.</p>
      </div>

      <div className="rumo-form-grid">
        <label>
          Como podemos chamar você?
          <input
            value={form.displayName || ''}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Seu nome completo ou apelido"
          />
        </label>

        <div>
          <label>
            Campus IFRJ
            <input
              value={form.campus || ''}
              onChange={(e) => setForm({ ...form, campus: e.target.value })}
              placeholder="Ex.: Maracanã, Nilópolis, Caxias..."
            />
          </label>
          <div className="rumo-chips">
            {IFRJ_CAMPUSES.slice(0, 6).map((c) => (
              <button
                type="button"
                key={c}
                className={`rumo-chip ${form.campus?.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                onClick={() => setForm({ ...form, campus: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label>
            Seu Curso
            <input
              value={form.course || ''}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
              placeholder="Ex.: Química, Informática, Biotecnologia..."
            />
          </label>
          <div className="rumo-chips">
            {POPULAR_COURSES.slice(0, 5).map((courseName) => (
              <button
                type="button"
                key={courseName}
                className={`rumo-chip ${form.course?.toLowerCase() === courseName.toLowerCase() ? 'active' : ''}`}
                onClick={() => setForm({ ...form, course: courseName })}
              >
                {courseName}
              </button>
            ))}
          </div>
        </div>

        <button className="rumo-primary" onClick={handleStart} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{saving ? 'Salvando dados...' : 'Começar agora'}</span>
        </button>
      </div>
    </Card>
  );
}

function DashboardView({ name, profile, overallAverage, nextExam, performance, analyses, analyze, analysisLoading, setTab }: any) {
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  const subline = useMemo(() => {
    const parts = [];
    if (profile?.institution) parts.push(profile.institution);
    if (profile?.campus) parts.push(`Campus ${profile.campus}`);
    if (profile?.course) parts.push(profile.course);
    return parts.length ? parts.join(' · ') : 'Seu panorama acadêmico e vestibulares.';
  }, [profile]);

  const activities = [
    {
      id: 'grades' as Tab,
      title: 'Meu Boletim',
      desc: overallAverage != null ? `Média geral calculada: ${overallAverage.toFixed(1)}` : 'Lançar notas ou enviar boletim (PDF / Foto)',
      icon: ListTodo,
      badge: overallAverage != null ? `${overallAverage.toFixed(1)} pts` : 'Lançar',
      badgeClass: overallAverage != null && overallAverage >= 7 ? 'rumo-pill-success' : 'rumo-pill-accent',
    },
    {
      id: 'exams' as Tab,
      title: 'Próximas Provas',
      desc: nextExam ? `${nextExam.name} (${nextExam.subjectName || 'Geral'}) · ${nextExam.daysRemaining === 0 ? 'Hoje!' : `em ${nextExam.daysRemaining} dias`}` : 'Agende simulados, testes e bimestrais',
      icon: CalendarDays,
      badge: nextExam ? (nextExam.daysRemaining === 0 ? 'Hoje' : `${nextExam.daysRemaining}d`) : 'Agendar',
      badgeClass: nextExam && nextExam.daysRemaining <= 3 ? 'rumo-pill-warning' : 'rumo-pill-accent',
    },
    {
      id: 'assistant' as Tab,
      title: 'Assistente IA',
      desc: 'Recomendações táticas, prioridades e planejamento do dia',
      icon: Sparkles,
      badge: 'IA',
      badgeClass: 'rumo-pill-ai',
    },
    {
      id: 'calendar' as Tab,
      title: 'Calendário Geral',
      desc: 'Cronograma bimestral, datas de exames e vestibulares',
      icon: CalendarDays,
      badge: 'Agenda',
      badgeClass: 'rumo-pill-neutral',
    },
    {
      id: 'goals' as Tab,
      title: 'Meu Objetivo',
      desc: 'Metas para UERJ, UFRJ, IFRJ, vestibulares e SISU',
      icon: Heart,
      badge: 'Foco',
      badgeClass: 'rumo-pill-neutral',
    },
    {
      id: 'universities' as Tab,
      title: 'Faculdades & MEC',
      desc: 'Consulte instituições e cursos reconhecidos pelo MEC',
      icon: University,
      badge: 'e-MEC',
      badgeClass: 'rumo-pill-neutral',
    },
  ];

  return (
    <>
      <div className="rumo-welcome-hero">
        <div className="rumo-welcome-header">
          <div className="rumo-welcome-greeting">
            <span className="rumo-welcome-eyebrow">
              {timeGreeting} · {date}
            </span>
            <h1 className="rumo-welcome-title">
              Bem-vindo(a), <span className="rumo-name-highlight">{name}</span>!
            </h1>
            <p className="rumo-welcome-question">
              Qual será a atividade de hoje?
            </p>
            <span className="rumo-welcome-subline">{subline}</span>
          </div>
          <button className="rumo-secondary rumo-hero-profile-btn" onClick={() => setTab('settings')}>
            <Settings2 className="w-4 h-4" /> Ajustar perfil
          </button>
        </div>

        {/* Grade Interativa de Atividades */}
        <div className="rumo-activities-container">
          <div className="rumo-activities-header">
            <span className="rumo-kicker">⚡ Escolha sua atividade de hoje</span>
            <small>Clique em qualquer opção para ir direto à ação</small>
          </div>
          <div className="rumo-activities-grid">
            {activities.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  type="button"
                  className="rumo-activity-card"
                  onClick={() => setTab(act.id)}
                >
                  <div className="rumo-activity-icon">
                    <Icon />
                  </div>
                  <div className="rumo-activity-content">
                    <div className="rumo-activity-top">
                      <strong>{act.title}</strong>
                      <span className={`rumo-activity-pill ${act.badgeClass}`}>{act.badge}</span>
                    </div>
                    <p>{act.desc}</p>
                  </div>
                  <ChevronRight className="rumo-activity-arrow" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rumo-metric-grid">
        <Metric label="Média geral" value={overallAverage == null ? '—' : overallAverage.toFixed(1)} note="notas cadastradas" />
        <Metric label="Matérias" value={String(performance.length)} note="acompanhadas" />
        <Metric label="Provas próximas" value={String(performance.filter((item: any) => item.nextExam).length)} note="com prioridade calculada" />
      </div>

      <div className="rumo-dashboard-grid">
        <Card className="rumo-next-exam">
          <span className="rumo-kicker">Próxima prova</span>
          {nextExam ? (
            <>
              <h2>{nextExam.name}</h2>
              <p>{nextExam.subjectName || 'Vestibular'} · {formatDate(nextExam.examDate)}</p>
              <strong>{nextExam.daysRemaining === 0 ? 'É hoje' : `${nextExam.daysRemaining} dias restantes`}</strong>
              <div className="rumo-priority-row">
                <span className={`rumo-priority ${nextExam.priority}`}>{priorityLabel(nextExam.priority)}</span>
                <span>Peso {nextExam.weight}</span>
              </div>
            </>
          ) : (
            <Empty>Você ainda não possui provas cadastradas.</Empty>
          )}
        </Card>

        <Card>
          <div className="rumo-card-heading">
            <div>
              <span className="rumo-kicker">Foco da semana</span>
              <h2>Onde sua atenção rende mais</h2>
            </div>
            <button className="rumo-link" onClick={() => setTab('subjects')}>
              Ver matérias <ChevronRight />
            </button>
          </div>
          {performance.length ? (
            <div className="rumo-performance-list">
              {performance.slice(0, 5).map((item: any) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <div className="rumo-progress">
                    <i style={{ width: `${Math.min(100, Math.max(5, item.average == null ? 25 : item.average * 10))}%` }} />
                  </div>
                  <b>{item.average == null ? '—' : item.average.toFixed(1)}</b>
                  <em className={`rumo-priority ${item.priority}`}>{priorityLabel(item.priority)}</em>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Adicione suas primeiras notas para começarmos a acompanhar sua evolução.</Empty>
          )}
        </Card>
      </div>

      <Card className="rumo-ai-callout">
        <div className="rumo-ai-orb">
          <Sparkles />
        </div>
        <div>
          <span className="rumo-kicker">Assistente acadêmica</span>
          <h2>{analyses?.[0]?.summary || 'Seu foco de hoje pode ser mais claro.'}</h2>
          <p>Use seus dados reais para criar um plano breve, sem substituir seu julgamento.</p>
        </div>
        <button className="rumo-primary" onClick={analyze} disabled={analysisLoading}>
          {analysisLoading ? <Loader2 className="animate-spin" /> : <Sparkles />} Analisar agora
        </button>
      </Card>
    </>
  );
}

function Metric({ label, value, note }: any) {
  return (
    <Card className="rumo-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}

function FormTitle({ title }: { title: string }) {
  return (
    <div className="rumo-card-heading">
      <h2>{title}</h2>
    </div>
  );
}

function GradesView({ grades, subjects, periods, form, setForm, onSubmit, onEdit, onDelete, editing, onCancel, onUpload, uploading }: any) {
  return (
    <>
      <PageTitle
        eyebrow="Escola / IFRJ"
        title="Meu boletim"
        text="Registre avaliações por período e acompanhe médias objetivas."
        action={
          <label className="rumo-secondary rumo-upload">
            <Upload /> {uploading ? 'Enviando...' : 'Enviar boletim'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
        }
      />
      <div className="rumo-content-grid">
        <Card>
          <FormTitle title={editing ? 'Editar nota' : 'Adicionar avaliação'} />
          <div className="rumo-form-grid">
            <label>
              Matéria
              <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Selecione</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Período
              <select value={form.periodId} onChange={(e) => setForm({ ...form, periodId: e.target.value })}>
                <option value="">Sem período</option>
                {periods.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Avaliação
              <input value={form.assessmentName} onChange={(e) => setForm({ ...form, assessmentName: e.target.value })} placeholder="AV1, trabalho..." />
            </label>
            <label>
              Nota
              <input type="number" min="0" max="10" step="0.1" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            </label>
            <label>
              Peso
              <input type="number" min="0.1" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </label>
          </div>
          <div className="rumo-actions">
            <button className="rumo-primary" onClick={onSubmit}>
              <Check /> {editing ? 'Atualizar' : 'Adicionar'}
            </button>
            {editing && (
              <button className="rumo-secondary" onClick={onCancel}>
                Cancelar
              </button>
            )}
          </div>
        </Card>
        <Card>
          <FormTitle title="Notas lançadas" />
          {grades.length ? (
            <div className="rumo-table">
              {grades.map((grade: any) => (
                <div className="rumo-table-row" key={grade.id}>
                  <div>
                    <b>{grade.subjectName}</b>
                    <small>
                      {grade.periodName || 'Sem período'} · {grade.assessmentName}
                    </small>
                  </div>
                  <strong>{grade.score.toFixed(1)}</strong>
                  <button onClick={() => onEdit(grade)} aria-label="Editar nota">
                    <Pencil />
                  </button>
                  <button onClick={() => onDelete(grade.id)} aria-label="Excluir nota">
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Adicione suas primeiras notas para começarmos a acompanhar sua evolução.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function SubjectsView({ subjects, subjectName, setSubjectName, onAdd, topicSubjectId, setTopicSubjectId, topicName, setTopicName, onTopic, onDelete, saving }: any) {
  return (
    <>
      <PageTitle eyebrow="Organização" title="Minhas matérias" text="Inclua disciplinas do IFRJ e crie tópicos para estudar com mais clareza." />
      <div className="rumo-content-grid">
        <Card>
          <FormTitle title="Adicionar matéria" />
          <div className="rumo-inline-form">
            <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Ex.: Projeto Integrador" />
            <button className="rumo-primary" onClick={onAdd} disabled={saving}>
              <Plus />
            </button>
          </div>
          <div className="rumo-subject-list">
            {subjects.map((subject: any) => (
              <div key={subject.id}>
                <div>
                  <b>{subject.name}</b>
                  <small>{subject.source === 'default' ? 'Base escolar' : 'Personalizada'}</small>
                </div>
                <button onClick={() => onDelete(subject.id)} aria-label={`Remover ${subject.name}`}>
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <FormTitle title="Adicionar tópico" />
          <label>
            Matéria
            <select value={topicSubjectId} onChange={(e) => setTopicSubjectId(e.target.value)}>
              <option value="">Selecione</option>
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rumo-block-label">
            Tópico
            <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Ex.: Funções orgânicas" />
          </label>
          <button className="rumo-primary rumo-top-gap" onClick={onTopic} disabled={!topicSubjectId || saving}>
            <Plus /> Salvar tópico
          </button>
        </Card>
      </div>
    </>
  );
}

function ExamsView({ exams, subjects, form, setForm, onSubmit, onDelete, saving }: any) {
  return (
    <>
      <PageTitle eyebrow="Planejamento" title="Próximas provas" text="Datas, pesos e conteúdos em um só lugar." />
      <div className="rumo-content-grid">
        <Card>
          <FormTitle title="Cadastrar prova" />
          <div className="rumo-form-grid">
            <label>
              Matéria
              <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Vestibular / geral</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="AV2, Simulado, UERJ..." />
            </label>
            <label>
              Data
              <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
            </label>
            <label>
              Peso
              <input type="number" min="0.1" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </label>
            <label>
              Nota desejada
              <input type="number" min="0" max="10" step="0.1" value={form.targetGrade} onChange={(e) => setForm({ ...form, targetGrade: e.target.value })} />
            </label>
            <label>
              Conteúdos
              <input value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="Separe por vírgula" />
            </label>
          </div>
          <label className="rumo-block-label">
            Observações
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button className="rumo-primary rumo-top-gap" onClick={onSubmit} disabled={saving}>
            <Plus /> Cadastrar prova
          </button>
        </Card>
        <Card>
          <FormTitle title="Agenda de provas" />
          {exams.length ? (
            <div className="rumo-exam-list">
              {exams.map((exam: any) => (
                <div key={exam.id}>
                  <div className="rumo-exam-date">
                    <b>{exam.daysRemaining < 0 ? 'Passou' : exam.daysRemaining === 0 ? 'Hoje' : `${exam.daysRemaining}d`}</b>
                    <small>{formatDate(exam.examDate)}</small>
                  </div>
                  <div className="rumo-exam-body">
                    <b>{exam.name}</b>
                    <span>
                      {exam.subjectName || 'Vestibular'} · Peso {exam.weight}
                    </span>
                    {exam.topics?.length > 0 && <small>{exam.topics.join(' · ')}</small>}
                  </div>
                  <button onClick={() => onDelete(exam.id)} aria-label={`Remover ${exam.name}`}>
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Você ainda não possui provas cadastradas.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function CalendarView({ events, form, setForm, onSubmit, onDelete, saving }: any) {
  return (
    <>
      <PageTitle eyebrow="Agenda" title="Calendário" text="Provas, tarefas, vestibulares e eventos acadêmicos." />
      <div className="rumo-content-grid">
        <Card>
          <FormTitle title="Novo evento" />
          <div className="rumo-form-grid">
            <label>
              Tipo
              <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
                <option value="custom">Evento pessoal</option>
                <option value="assignment">Trabalho</option>
                <option value="vestibular">Vestibular</option>
                <option value="academic">Acadêmico</option>
              </select>
            </label>
            <label>
              Título
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Data
              <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            </label>
            <label>
              Horário
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </label>
          </div>
          <label className="rumo-block-label">
            Notas
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button className="rumo-primary rumo-top-gap" onClick={onSubmit} disabled={saving}>
            <Plus /> Adicionar evento
          </button>
        </Card>
        <Card>
          <FormTitle title="Sua agenda" />
          {events?.length ? (
            <div className="rumo-event-list">
              {events.map((event: any) => (
                <div key={event.id}>
                  <CalendarDays />
                  <div>
                    <b>{event.title}</b>
                    <small>
                      {formatDate(event.eventDate)} {event.startTime ? `· ${event.startTime}` : ''}
                    </small>
                  </div>
                  <button onClick={() => onDelete(event.id)} aria-label={`Remover ${event.title}`}>
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Você ainda não possui eventos cadastrados.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function GoalsView({ goals, form, setForm, onSubmit, saving, onOpenMecCatalog }: any) {
  const toggleInstitution = (name: string) => {
    const list = form.institutions ? form.institutions.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    if (list.includes(name)) {
      setForm({ ...form, institutions: list.filter((item: string) => item !== name).join(', ') });
    } else {
      setForm({ ...form, institutions: [...list, name].join(', ') });
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="Vestibulares & Metas"
        title="Meu objetivo"
        text="Defina seu curso dos sonhos, sistema seletivo e instituições prioritárias."
        action={
          <button className="rumo-secondary" onClick={onOpenMecCatalog}>
            <University className="w-4 h-4" /> Buscar faculdade no MEC
          </button>
        }
      />
      <div className="rumo-content-grid">
        <Card>
          <FormTitle title="Definir objetivo" />
          <label>
            Curso desejado
            <input value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} placeholder="Ex.: Medicina, Engenharia, Psicologia, Direito..." />
          </label>

          <label className="rumo-block-label">
            Sistema seletivo
            <select value={form.selectionSystem} onChange={(e) => setForm({ ...form, selectionSystem: e.target.value })}>
              <option>ENEM / SISU</option>
              <option>UERJ</option>
              <option>CFO CBMERJ</option>
              <option>FUVEST (USP)</option>
              <option>UNICAMP</option>
              <option>Outro vestibular</option>
            </select>
          </label>

          <label className="rumo-block-label">
            Instituições desejadas
            <input
              value={form.institutions}
              onChange={(e) => setForm({ ...form, institutions: e.target.value })}
              placeholder="Ex.: UERJ, UFRJ, UFF, IFRJ, USP..."
            />
          </label>

          <div style={{ marginTop: 8 }}>
            <small style={{ color: 'var(--rumo-muted)', fontSize: 11 }}>Faculdades de referência (clique para incluir com 1 toque):</small>
            <div className="rumo-chips">
              {TARGET_UNIVERSITIES.map((inst) => {
                const currentList = form.institutions ? form.institutions.split(',').map((s: string) => s.trim()) : [];
                const isSelected = currentList.includes(inst);
                return (
                  <button
                    type="button"
                    key={inst}
                    className={`rumo-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleInstitution(inst)}
                  >
                    {isSelected ? `✓ ${inst}` : `+ ${inst}`}
                  </button>
                );
              })}
            </div>
          </div>

          <button className="rumo-primary rumo-top-gap" onClick={onSubmit} disabled={saving || !form.degree.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Salvar objetivo
          </button>
        </Card>

        <Card>
          <FormTitle title="Objetivos ativos" />
          {goals?.length ? (
            goals.map((goal: any) => (
              <div className="rumo-goal" key={goal.id}>
                <GraduationCap />
                <div>
                  <b>{goal.degree}</b>
                  <span>{goal.selectionSystem}</span>
                  <small>{goal.institutions?.map((item: any) => item.name).join(' · ') || 'Nenhuma instituição adicionada'}</small>
                </div>
              </div>
            ))
          ) : (
            <Empty>Escolha um curso ou faculdade para personalizar sua preparação.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function UniversitiesView({
  query,
  setQuery,
  items,
  mode,
  setMode,
  onSearch,
  searching,
  onAddToGoal,
  onSetCampus,
  onSetCourse,
}: any) {
  return (
    <>
      <PageTitle
        eyebrow="Ministério da Educação"
        title="Catálogo & Pesquisa MEC"
        text="Consulte instituições credenciadas e cursos oficiais do e-MEC com informações de qualidade e reconhecimento."
      />

      <div className="rumo-mec-banner">
        <div className="rumo-mec-banner-info">
          <University />
          <div>
            <b style={{ display: 'block', fontSize: 13 }}>Portal e-MEC Oficial</b>
            <span style={{ fontSize: 11, color: 'var(--rumo-muted)' }}>
              Consulte credenciamento oficial, IGC, CI e notas CPC diretamente na base governamental.
            </span>
          </div>
        </div>
        <a
          href="https://emec.mec.gov.br/emec/nova/index/consulta-avancada"
          target="_blank"
          rel="noopener noreferrer"
          className="rumo-action-btn rumo-action-btn-primary"
          style={{ textDecoration: 'none' }}
        >
          <span>Abrir Portal e-MEC</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <Card>
        <div className="rumo-subtabs">
          <button
            type="button"
            className={`rumo-subtab-btn ${mode === 'institutions' ? 'active' : ''}`}
            onClick={() => setMode('institutions')}
          >
            <University className="w-4 h-4" />
            <span>Pesquisar Faculdades & Campi</span>
          </button>
          <button
            type="button"
            className={`rumo-subtab-btn ${mode === 'courses' ? 'active' : ''}`}
            onClick={() => setMode('courses')}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Pesquisar Cursos</span>
          </button>
        </div>

        <div className="rumo-search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder={
              mode === 'institutions'
                ? 'Busque por sigla, nome ou cidade (ex.: IFRJ, Maracanã, UERJ, UFRJ...)'
                : 'Busque por curso (ex.: Química, Biotecnologia, Medicina, Informática...)'
            }
          />
          <button className="rumo-primary" onClick={onSearch} disabled={searching}>
            {searching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
            <span>{searching ? 'Buscando...' : 'Pesquisar'}</span>
          </button>
        </div>

        {/* Sugestões rápidas de pesquisa */}
        <div style={{ marginTop: 10 }}>
          <small style={{ color: 'var(--rumo-muted)', fontSize: 11 }}>Sugestões rápidas:</small>
          <div className="rumo-chips">
            {mode === 'institutions' ? (
              ['IFRJ', 'Maracanã', 'Nilópolis', 'UERJ', 'UFRJ', 'UFF', 'UNIRIO', 'CEFET-RJ', 'USP', 'UNICAMP'].map((s) => (
                <button
                  type="button"
                  key={s}
                  className="rumo-chip"
                  onClick={() => {
                    setQuery(s);
                    setTimeout(() => onSearch(), 10);
                  }}
                >
                  {s}
                </button>
              ))
            ) : (
              ['Química', 'Informática', 'Biotecnologia', 'Meio Ambiente', 'Mecânica', 'Farmácia', 'Medicina', 'Direito', 'Psicologia'].map((s) => (
                <button
                  type="button"
                  key={s}
                  className="rumo-chip"
                  onClick={() => {
                    setQuery(s);
                    setTimeout(() => onSearch(), 10);
                  }}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>

        {items.length ? (
          <div className="rumo-university-list">
            {items.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {mode === 'institutions' ? <University /> : <GraduationCap />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b>
                      {item.name} {item.acronym && `(${item.acronym})`}
                      {item.mecCode && <span className="rumo-badge">MEC: {item.mecCode}</span>}
                    </b>
                    <span>
                      {item.institutionName ? `${item.institutionName} · ` : ''}
                      {item.city || 'Brasil'}
                      {item.state ? ` - ${item.state}` : ''}
                      {item.degreeType ? ` · Grau: ${item.degreeType}` : ''}
                      {item.modality ? ` · ${item.modality}` : ''}
                      {item.administrativeCategory ? ` · ${item.administrativeCategory}` : ''}
                    </span>
                  </div>
                </div>

                <div className="rumo-card-actions">
                  {mode === 'institutions' ? (
                    <>
                      <button
                        type="button"
                        className="rumo-action-btn"
                        onClick={() => onAddToGoal(item.acronym || item.name)}
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar aos meus Objetivos
                      </button>
                      {item.name.toLowerCase().includes('ifrj') && (
                        <button
                          type="button"
                          className="rumo-action-btn"
                          onClick={() => onSetCampus(item.name)}
                        >
                          <Check className="w-3.5 h-3.5" /> Definir como meu Campus IFRJ
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rumo-action-btn"
                        onClick={() => onSetCourse(item.name)}
                      >
                        <Check className="w-3.5 h-3.5" /> Definir como meu Curso
                      </button>
                    </>
                  )}
                  {item.mecCode && (
                    <a
                      href={`https://emec.mec.gov.br/emec/nova/index/consulta-avancada`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rumo-action-btn"
                      style={{ textDecoration: 'none' }}
                      title="Verificar no Portal oficial do e-MEC"
                    >
                      <ExternalLink className="w-3 h-3" /> Ver no e-MEC
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            {searching ? 'Consultando o catálogo...' : 'Pesquise uma faculdade ou curso acima para consultar no MEC.'}
          </Empty>
        )}
      </Card>
    </>
  );
}

function AssistantView({ answer, question, setQuestion, onAsk, loading, history }: any) {
  return (
    <>
      <PageTitle eyebrow="Orientação" title="Assistente IA" text="Tire dúvidas sobre sua rotina acadêmica, organização de matérias, boletim e ferramentas da plataforma." />
      <Card className="rumo-assistant">
        <div className="rumo-assistant-header">
          <div className="rumo-ai-orb">
            <Sparkles />
          </div>
          <div>
            <h2>Como posso ajudar hoje?</h2>
            <p>Posso sugerir como planejar seu horário, interpretar prioridades do boletim e organizar suas matérias. <span style={{ opacity: 0.8, display: 'block', marginTop: 3, fontSize: 11 }}>Aviso: A assistente é orientada exclusivamente à gestão acadêmica e não resolve questões de provas diretamente.</span></p>
          </div>
        </div>
        <div className="rumo-question">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAsk()}
            placeholder="Dúvidas sobre sua rotina, planejamento ou matérias..."
          />
          <button className="rumo-primary" onClick={onAsk} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </button>
        </div>
        {answer && (
          <div className="rumo-answer">
            <span className="rumo-kicker">Resposta</span>
            <p>{answer}</p>
          </div>
        )}
      </Card>
      <Card>
        <FormTitle title="Histórico recente" />
        {history?.length ? (
          history.map((item: any) => (
            <div className="rumo-history" key={item.id}>
              <Sparkles />
              <div>
                <b>{item.summary}</b>
                <small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small>
              </div>
            </div>
          ))
        ) : (
          <Empty>Envie uma pergunta para receber sua primeira orientação.</Empty>
        )}
      </Card>
    </>
  );
}

function SettingsView({ form, setForm, save, saving }: any) {
  const handleSave = () => {
    save(
      '/api/rumo-estudos/profile',
      'PATCH',
      {
        ...form,
        displayName: form.displayName?.trim() || '',
        campus: form.campus?.trim() || '',
        course: form.course?.trim() || '',
        institution: form.institution?.trim() || 'IFRJ',
        onboardingCompleted: true,
      },
      'Perfil atualizado com sucesso!'
    );
  };

  return (
    <>
      <PageTitle eyebrow="Preferências" title="Configurações" text="Mantenha seu perfil acadêmico atualizado." />
      <Card>
        <div className="rumo-form-grid">
          <label>
            Nome
            <input
              value={form.displayName || ''}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Seu nome"
            />
          </label>

          <label>
            Instituição
            <input
              value={form.institution || 'IFRJ'}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
            />
          </label>

          <div>
            <label>
              Campus
              <input
                value={form.campus || ''}
                onChange={(e) => setForm({ ...form, campus: e.target.value })}
                placeholder="Ex.: Maracanã"
              />
            </label>
            <div className="rumo-chips">
              {IFRJ_CAMPUSES.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`rumo-chip ${form.campus?.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, campus: c })}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label>
              Curso
              <input
                value={form.course || ''}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
                placeholder="Ex.: Química, Biotecnologia, Informática..."
              />
            </label>
            <div className="rumo-chips">
              {POPULAR_COURSES.map((courseName) => (
                <button
                  type="button"
                  key={courseName}
                  className={`rumo-chip ${form.course?.toLowerCase() === courseName.toLowerCase() ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, course: courseName })}
                >
                  {courseName}
                </button>
              ))}
            </div>
          </div>

          <label>
            Ano / período
            <input
              value={form.schoolYear || ''}
              onChange={(e) => setForm({ ...form, schoolYear: e.target.value })}
              placeholder="Ex.: 3º Ano, 5º Período"
            />
          </label>

          <label>
            Turma
            <input
              value={form.className || ''}
              onChange={(e) => setForm({ ...form, className: e.target.value })}
              placeholder="Ex.: QUI-301, INFO-202"
            />
          </label>

          <label>
            Turno
            <select value={form.shift || 'integral'} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              <option value="integral">Integral</option>
              <option value="matutino">Manhã (Matutino)</option>
              <option value="vespertino">Tarde (Vespertino)</option>
              <option value="noturno">Noite (Noturno)</option>
            </select>
          </label>

          <label>
            Tempo disponível por dia
            <input
              value={form.availableTimeJson || ''}
              onChange={(e) => setForm({ ...form, availableTimeJson: e.target.value })}
              placeholder="Ex.: 2h à noite, 4h no final de semana"
            />
          </label>
        </div>

        <button className="rumo-primary rumo-top-gap" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          <span>{saving ? 'Salvando perfil...' : 'Salvar perfil'}</span>
        </button>
      </Card>
    </>
  );
}
