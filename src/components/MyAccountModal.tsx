import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  Camera,
  Shield,
  KeyRound,
  Mail,
  AtSign,
  Phone,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Settings as SettingsIcon,
  Calendar,
  Download,
  FileText,
  Cookie,
  Puzzle,
  Copy,
  Check,
  Monitor,
} from 'lucide-react';
import { apiFetch } from '../services/apiFetch';
import { AppTheme } from '../types';
import {
  loadAutoSpacedRevisionsEnabled,
  saveAutoSpacedRevisionsEnabled,
} from '../services/storageService';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { TermsOfUseModal } from './TermsOfUseModal';
import { CookiePolicyModal } from './CookiePolicyModal';

interface UserProfileData {
  id: string;
  email: string;
  username: string;
  role: string;
  fullName: string;
  phone: string;
  targetExam: string;
  bio: string;
  avatarUrl: string | null;
  createdAt?: string;
}

interface MyAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  sessionToken: string | null;
  onProfileUpdated?: (updatedProfile: UserProfileData) => void;
  autoSpacedRevisions?: boolean;
  onToggleAutoSpacedRevisions?: (enabled: boolean) => void;
  initialTab?: 'profile' | 'settings' | 'email' | 'password' | 'privacy' | 'extension';
}

export const MyAccountModal: React.FC<MyAccountModalProps> = ({
  isOpen,
  onClose,
  theme,
  sessionToken,
  onProfileUpdated,
  autoSpacedRevisions,
  onToggleAutoSpacedRevisions,
  initialTab = 'profile',
}) => {
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'settings' | 'email' | 'password' | 'privacy' | 'extension'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);

  // Estados da Extensão de Navegador (Desktop)
  const [extToken, setExtToken] = useState('');
  const [isLoadingExtToken, setIsLoadingExtToken] = useState(false);
  const [extTokenError, setExtTokenError] = useState<string | null>(null);
  const [copiedExtToken, setCopiedExtToken] = useState(false);
  const [copiedExtUrl, setCopiedExtUrl] = useState(false);
  const PLATFORM_URL = 'https://cfo-oficial-agorasim.onrender.com';
  const [isAutoSpacedRevisions, setIsAutoSpacedRevisions] = useState<boolean>(() => {
    return autoSpacedRevisions !== undefined ? autoSpacedRevisions : loadAutoSpacedRevisionsEnabled();
  });

  // Formulário Perfil
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Formulário E-mail (com verificação por senha)
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  // Formulário Alteração de Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Feedback Messages
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Busca do Token da Extensão quando o usuário acessa a aba da Extensão
  useEffect(() => {
    if (activeSubTab !== 'extension' || extToken) return;
    let isMounted = true;
    setIsLoadingExtToken(true);
    setExtTokenError(null);

    (async () => {
      try {
        const res = await apiFetch('/api/user/extension-token');
        if (res.ok) {
          const data = await res.json();
          if (data?.token && isMounted) {
            setExtToken(data.token);
            return;
          }
        }
      } catch {
        // Fallback local
      }

      if (isMounted) {
        const local = localStorage.getItem('cfo_terminal_session');
        if (local && local !== 'cookie') {
          setExtToken(local);
        } else {
          setExtTokenError('Não foi possível gerar a chave automaticamente. Recarregue a página.');
        }
      }
    })().finally(() => {
      if (isMounted) setIsLoadingExtToken(false);
    });

    return () => {
      isMounted = false;
    };
  }, [activeSubTab, extToken]);

  const handleCopyExtUrl = () => {
    navigator.clipboard.writeText(PLATFORM_URL).then(() => {
      setCopiedExtUrl(true);
      setTimeout(() => setCopiedExtUrl(false), 2500);
    });
  };

  const handleCopyExtToken = () => {
    if (!extToken) return;
    navigator.clipboard.writeText(extToken).then(() => {
      setCopiedExtToken(true);
      setTimeout(() => setCopiedExtToken(false), 2500);
    });
  };

  const [privacyRequests, setPrivacyRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestType, setRequestType] = useState<string>('access');
  const [requestDetails, setRequestDetails] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);

  // Carrega perfil ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setActiveSubTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || !sessionToken) return;

    let isMounted = true;
    setStatusMessage(null);
    setFetchingProfile(true);

    async function loadProfile() {
      try {
        const res = await fetch('/api/user/profile', {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });
        const data = await res.json();
        if (isMounted && res.ok && data.success && data.user) {
          setProfile(data.user);
          setFullName(data.user.fullName || '');
          setUsername(data.user.username || '');
          setPhone(data.user.phone || '');
          setBio(data.user.bio || '');
          setAvatarPreview(data.user.avatarUrl || null);
          setNewEmail(data.user.email || '');
        } else if (isMounted && !res.ok) {
          setStatusMessage({ type: 'error', text: data.message || 'Falha ao carregar perfil do aluno.' });
        }
      } catch (err) {
        if (isMounted) {
          setStatusMessage({ type: 'error', text: 'Erro de conexão ao carregar perfil.' });
        }
      } finally {
        if (isMounted) setFetchingProfile(false);
      }
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionToken]);

  // Carrega histórico de requisições de privacidade ao abrir a aba
  useEffect(() => {
    if (!isOpen || activeSubTab !== 'privacy') return;

    let isMounted = true;
    async function loadPrivacyRequests() {
      setLoadingRequests(true);
      try {
        const headers: Record<string, string> = {};
        if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
        const res = await fetch('/api/privacy/my-requests', { headers });
        const data = await res.json();
        if (isMounted && res.ok && data.success && Array.isArray(data.requests)) {
          setPrivacyRequests(data.requests);
        }
      } catch (err) {
        console.warn('Erro ao carregar solicitações LGPD:', err);
      } finally {
        if (isMounted) setLoadingRequests(false);
      }
    }

    loadPrivacyRequests();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeSubTab, sessionToken]);

  // Exportar dados pessoais do titular em JSON (Portabilidade Art. 18, V)
  const handleExportData = async () => {
    setExportingData(true);
    setStatusMessage(null);
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const res = await fetch('/api/privacy/export', { headers });
      if (!res.ok) {
        setStatusMessage({ type: 'error', text: 'Falha ao exportar seus dados pessoais.' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dados-pessoais-cfo-${username || 'aluno'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage({ type: 'success', text: 'Arquivo de exportação gerado com sucesso!' });
    } catch {
      setStatusMessage({ type: 'error', text: 'Erro de conexão ao gerar arquivo de exportação.' });
    } finally {
      setExportingData(false);
    }
  };

  // Submeter protocolo de solicitação LGPD
  const handleSubmitPrivacyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRequest(true);
    setStatusMessage(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const res = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestType,
          details: requestDetails.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMessage({ type: 'error', text: data.message || 'Falha ao registrar solicitação.' });
        return;
      }
      setStatusMessage({
        type: 'success',
        text: `Solicitação registrada! Protocolo: ${data.request?.requestCode || 'LGPD-REQ'}`,
      });
      setRequestDetails('');
      // Atualiza lista de solicitações
      if (data.request) {
        setPrivacyRequests((prev) => [data.request, ...prev]);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Erro de conexão ao registrar protocolo LGPD.' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (!isOpen) return null;

  // Upload e Validação de Avatar
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validação de tamanho no cliente (3MB)
    if (file.size > 3 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'O arquivo excede o limite máximo de 3MB.' });
      return;
    }

    // 2. Leitura para Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      setLoading(true);
      setStatusMessage(null);

      try {
        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ imageBase64: base64 }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setStatusMessage({ type: 'success', text: 'Foto de perfil atualizada com sucesso!' });
          if (profile) {
            const updated = { ...profile, avatarUrl: data.avatarUrl };
            setProfile(updated);
            if (onProfileUpdated) onProfileUpdated(updated);
          }
        } else {
          setStatusMessage({ type: 'error', text: data.message || 'Falha ao validar imagem.' });
          // Restaura avatar anterior
          setAvatarPreview(profile?.avatarUrl || null);
        }
      } catch (err) {
        setStatusMessage({ type: 'error', text: 'Erro ao enviar foto de perfil.' });
        setAvatarPreview(profile?.avatarUrl || null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Salvar Informações Cadastrais (Nome, @username, Bio, Telefone)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    const cleanUsername = username.toLowerCase().trim().replace(/^@/, '');

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: cleanUsername,
          phone: phone.trim(),
          bio: bio.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setProfile(data.user);
        setUsername(data.user.username);
        setStatusMessage({ type: 'success', text: 'Dados de perfil atualizados com sucesso!' });
        if (onProfileUpdated) onProfileUpdated(data.user);
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Erro ao atualizar dados.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Erro de comunicação com o servidor.' });
    } finally {
      setLoading(false);
    }
  };

  // Atualizar E-mail com Verificação Adequada por Senha
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!newEmail || !newEmail.includes('@') || !newEmail.includes('.')) {
      setStatusMessage({ type: 'error', text: 'Por favor, insira um endereço de e-mail válido.' });
      return;
    }

    if (!emailCurrentPassword) {
      setStatusMessage({ type: 'error', text: 'A senha atual é necessária para autorizar a alteração de e-mail.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/update-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          newEmail: newEmail.trim().toLowerCase(),
          currentPassword: emailCurrentPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: 'E-mail atualizado com sucesso!' });
        setEmailCurrentPassword('');
        if (profile) {
          const updated = { ...profile, email: newEmail.trim().toLowerCase() };
          setProfile(updated);
          if (onProfileUpdated) onProfileUpdated(updated);
        }
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Erro ao atualizar e-mail.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Erro de comunicação ao atualizar e-mail.' });
    } finally {
      setLoading(false);
    }
  };

  // Alterar Senha Autenticada
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (newPassword.length < 8) {
      setStatusMessage({ type: 'error', text: 'A nova senha deve ter no mínimo 8 caracteres.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'A confirmação de senha não coincide com a nova senha.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Erro ao alterar senha.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Erro de comunicação ao alterar senha.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[380px]:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        className={`rounded-2xl max-w-2xl w-full shadow-2xl border overflow-hidden flex flex-col transition-colors my-auto max-h-[90vh] max-h-[90dvh] min-w-0 ${
          isDark ? 'bg-[#0B1528] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800/80 bg-[#070D18]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-[#0056D2] to-[#FF6B00] text-white shadow-md">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Minha Conta</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Gerencie seus dados de acesso, avatar e credenciais táticas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-black'
            }`}
            title="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className={`px-3 sm:px-6 pt-3 flex gap-1 sm:gap-2 border-b text-xs font-semibold overflow-x-auto scrollbar-none ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <button
            onClick={() => {
              setActiveSubTab('profile');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'profile'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Perfil & Avatar
          </button>
          <button
            onClick={() => {
              setActiveSubTab('settings');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'settings'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            Configurações
          </button>
          <button
            onClick={() => {
              setActiveSubTab('email');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'email'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            E-mail
          </button>
          <button
            onClick={() => {
              setActiveSubTab('password');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'password'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Alterar Senha
          </button>
          <button
            onClick={() => {
              setActiveSubTab('privacy');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'privacy'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Privacidade & LGPD
          </button>
          <button
            onClick={() => {
              setActiveSubTab('extension');
              setStatusMessage(null);
            }}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'extension'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Puzzle className="w-4 h-4" />
            Extensão (PC)
          </button>
        </div>

        {/* Modal Body with Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 min-w-0">
          {/* Status Message Alert */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs font-medium animate-in fade-in duration-150 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/40 border-red-800 text-red-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {fetchingProfile ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span>Carregando dados do aluno...</span>
            </div>
          ) : (
            <>
              {/* ABA 1: PERFIL & AVATAR */}
              {activeSubTab === 'profile' && (
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  {/* Seção Avatar */}
                  <div className="flex flex-col min-[390px]:flex-row items-start min-[390px]:items-center gap-4 sm:gap-5 p-4 rounded-xl border border-slate-800/60 bg-slate-900/30 min-w-0">
                    <div className="relative group">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-blue-500/50 bg-slate-800 flex items-center justify-center shadow-lg">
                        {avatarPreview ? (
                          <img
                            src={avatarPreview}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl font-black text-blue-400 tracking-wider">
                            {(fullName || username || 'CFO').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
                        title="Alterar foto de perfil"
                      >
                        <Camera className="w-5 h-5 mb-0.5" />
                        <span className="text-[9px] font-bold">Alterar</span>
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 w-full">
                      <h4 className="text-sm font-bold text-slate-200">Foto de Perfil</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        JPG, PNG ou WEBP reais. Máximo 3MB. A validação é realizada server-side por assinatura binária.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleAvatarFileSelect}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className={`mt-2.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isDark
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                      >
                        Escolher Nova Imagem
                      </button>
                    </div>
                  </div>

                  {/* Campos do Perfil */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-300">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="Ex: Cadete Victor Silva"
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-all ${
                          isDark
                            ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-300 flex items-center gap-1">
                        <AtSign className="w-3.5 h-3.5 text-blue-400" />
                        Nome de Usuário (@username único)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">@</span>
                        <input
                          type="text"
                          value={username.replace(/^@/, '')}
                          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                          required
                          placeholder="cadete_2026"
                          className={`w-full pl-7 pr-3 py-2 rounded-xl text-xs font-mono border outline-none transition-all ${
                            isDark
                              ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Apenas letras minúsculas, números, ponto, hífen ou sublinhado.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-300 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        Telefone de Contato
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(21) 99999-9999"
                        className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-all ${
                          isDark
                            ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-300 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        Concurso Alvo
                      </label>
                      <input
                        type="text"
                        value={profile?.targetExam || 'CFO CBMERJ 2026'}
                        disabled
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-800 bg-slate-900/50 text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Mensagem Tática / Bio
                    </label>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Ex: Foco no CFO CBMERJ. Disciplina diária e consistência nos simulados."
                      className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-all ${
                        isDark
                          ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  <div className="pt-2 flex justify-end sm:justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#0056D2] to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              )}

              {/* ABA CONFIGURAÇÕES (PREFERÊNCIAS TÁTICAS & GOOGLE AGENDA) */}
              {activeSubTab === 'settings' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="p-4 rounded-xl border border-blue-900/40 bg-[#070D18] space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-400" />
                          <h3 className="text-xs font-bold text-slate-100">
                            Revisão Espaçada Automática no Google Agenda
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Quando ativado, o sistema agendará automaticamente os ciclos de revisão espaçada (+24h, +7d, +30d, +60d, +90d) ao concluir um estudo.
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {isAutoSpacedRevisions
                            ? '🟢 Ativado: Eventos extras de revisão serão criados na Google Agenda.'
                            : '⚪ Desativado (Padrão): Agenda apenas a sessão do dia (Azul para Estudado, Verde para Revisando).'}
                        </p>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                        <input
                          type="checkbox"
                          checked={isAutoSpacedRevisions}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setIsAutoSpacedRevisions(val);
                            saveAutoSpacedRevisionsEnabled(val);
                            if (onToggleAutoSpacedRevisions) {
                              onToggleAutoSpacedRevisions(val);
                            }
                            setStatusMessage({
                              type: 'success',
                              text: val
                                ? 'Revisão espaçada automática ativada com sucesso!'
                                : 'Revisão espaçada automática desativada (agendamento individual simples ativado).',
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-[#0056D2]"></div>
                      </label>
                    </div>

                    {/* Resumo visual do padrão de cores */}
                    <div className="pt-3 border-t border-blue-900/30 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-[#0F1D38]/60 border border-blue-900/40 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0"></span>
                        <div>
                          <span className="font-bold text-blue-300 block">Estudado no dia</span>
                          <span className="text-[10px] text-slate-400">Marcado em Azul no Google Agenda</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#062018]/60 border border-emerald-900/40 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></span>
                        <div>
                          <span className="font-bold text-emerald-300 block">Revisando</span>
                          <span className="text-[10px] text-slate-400">Marcado em Verde no Google Agenda</span>
                        </div>
                      </div>
                    </div>

                    {/* Atalho Proeminente para a Extensão de Navegador */}
                    <div className="pt-3 border-t border-blue-900/30">
                      <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shrink-0">
                            <Puzzle size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-100">Extensão CFO CBMERJ para Navegador</h4>
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[9px] uppercase border border-blue-500/30">
                                PC
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Sincronize cronômetro e marcador de questões (certa/errada) em tempo real com seu site.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubTab('extension');
                            setStatusMessage(null);
                          }}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shrink-0 shadow-md shadow-blue-600/20 transition-all"
                        >
                          Ver Chave & Download
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA EXCLUSIVA: EXTENSÃO DE NAVEGADOR PARA COMPUTADOR */}
              {activeSubTab === 'extension' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-blue-500/30 shrink-0">
                        <Puzzle size={20} />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 mb-0.5">
                          <Monitor size={11} /> Vinculação Oficial para Computador
                        </div>
                        <h3 className="text-sm font-black text-white">Extensão CFO CBMERJ de Estudos</h3>
                        <p className="text-[11px] text-slate-400">
                          Utilize no QConcursos, TEC ou qualquer site de questões com cronômetro e registro rápido em tempo real.
                        </p>
                      </div>
                    </div>

                    {/* Bloco 1: Download Direto do ZIP */}
                    <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Pacote da Extensão (.ZIP)
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">
                          19 KB • Pronto para uso
                        </span>
                      </div>
                      <a
                        href="/api/download/extension"
                        download="cfo-cbmerj-extensao.zip"
                        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-black text-xs text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 shadow-md shadow-blue-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all"
                      >
                        <Download size={16} /> Baixar Pacote (.ZIP)
                      </a>
                      <p className="text-[10px] text-center text-slate-400 mt-1.5">
                        Download direto do servidor oficial. Já vem pré-configurada para este site.
                      </p>
                    </div>

                    {/* Bloco 2: URL Oficial da Plataforma */}
                    <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          URL da Plataforma (Já Pré-Configurada no ZIP)
                        </label>
                        {copiedExtUrl && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <Check size={12} /> URL Copiada!
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={PLATFORM_URL}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none select-all ${
                            isDark ? 'bg-black/60 border-white/10 text-cyan-300' : 'bg-slate-50 border-slate-300 text-cyan-800'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={handleCopyExtUrl}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 shrink-0 transition-all"
                        >
                          {copiedExtUrl ? <Check size={14} /> : <Copy size={14} />}
                          {copiedExtUrl ? 'Copiada!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    {/* Bloco 3: Chave Pessoal de Vinculação */}
                    <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Sua Chave de Acesso Pessoal (API Key)
                        </label>
                        {copiedExtToken && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <Check size={12} /> Chave Copiada!
                          </span>
                        )}
                      </div>

                      {isLoadingExtToken ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
                          <Loader2 size={16} className="animate-spin text-blue-400" />
                          <span>Gerando chave de acesso para sua conta...</span>
                        </div>
                      ) : extTokenError ? (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                          <AlertCircle size={15} className="shrink-0 text-amber-400" />
                          <span>{extTokenError}</span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={extToken}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none select-all ${
                              isDark ? 'bg-black/60 border-white/10 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={handleCopyExtToken}
                            disabled={!extToken}
                            className={`flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                              copiedExtToken
                                ? 'bg-emerald-500 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                            }`}
                          >
                            {copiedExtToken ? <Check size={14} /> : <Copy size={14} />}
                            {copiedExtToken ? 'Copiada!' : 'Copiar Chave'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bloco 4: Instruções de Instalação */}
                    <div className="space-y-2 text-xs text-slate-300 pt-1">
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] border border-blue-500/30">
                          1
                        </span>
                        <p>Baixe o arquivo <strong>.zip</strong> acima e extraia a pasta no seu computador.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] border border-blue-500/30">
                          2
                        </span>
                        <p>No navegador, acesse <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px]">chrome://extensions/</code> e ative o <strong>Modo do desenvolvedor</strong>.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] border border-blue-500/30">
                          3
                        </span>
                        <p>Clique em <strong>Carregar sem compactação</strong>, selecione a pasta e cole sua chave na aba <strong>Conexão (⚙️)</strong>.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: ALTERAÇÃO DE E-MAIL */}
              {activeSubTab === 'email' && (
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-blue-900/50 bg-blue-950/20 text-xs text-blue-300 flex items-start gap-2.5">
                    <Shield className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">Verificação de Segurança Server-Side:</strong>
                      A alteração de e-mail requer confirmação de senha do operador para validação de titularidade da conta.
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      E-mail Atual Cadastrado
                    </label>
                    <input
                      type="email"
                      value={profile?.email || ''}
                      disabled
                      className="w-full px-3 py-2 rounded-xl text-xs border border-slate-800 bg-slate-900/50 text-slate-400 font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Novo Endereço de E-mail
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      placeholder="novo.email@cbmerj.com"
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono border outline-none transition-all ${
                        isDark
                          ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Senha Atual (Verificação de Segurança)
                    </label>
                    <div className="relative">
                      <input
                        type={showEmailPassword ? 'text' : 'password'}
                        value={emailCurrentPassword}
                        onChange={(e) => setEmailCurrentPassword(e.target.value)}
                        required
                        placeholder="Digite sua senha atual para autorizar"
                        className={`w-full px-3 py-2 pr-10 rounded-xl text-xs border outline-none transition-all ${
                          isDark
                            ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailPassword(!showEmailPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        title={showEmailPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#0056D2] to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirmar Alteração de E-mail
                    </button>
                  </div>
                </form>
              )}

              {/* ABA 3: ALTERAÇÃO DE SENHA */}
              {activeSubTab === 'password' && (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Senha Atual
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        placeholder="Sua senha atual"
                        className={`w-full px-3 py-2 pr-10 rounded-xl text-xs border outline-none transition-all ${
                          isDark
                            ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Nova Senha (Mínimo de 8 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        placeholder="Nova senha forte"
                        className={`w-full px-3 py-2 pr-10 rounded-xl text-xs border outline-none transition-all ${
                          isDark
                            ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-300">
                      Confirmação da Nova Senha
                    </label>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Repita a nova senha"
                      className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-all ${
                        isDark
                          ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Atualizar Senha
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 5: PRIVACIDADE & LGPD */}
              {activeSubTab === 'privacy' && (
                <div className="space-y-6 text-xs text-slate-300">
                  {/* Resumo de Direitos e Portabilidade */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-sm text-white">Central de Direitos do Titular (LGPD)</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">Lei nº 13.709/2018</span>
                    </div>
                    <p className="leading-relaxed text-slate-400">
                      Você possui total controle sobre seus dados na plataforma. Todos os tratamentos são pautados pela execução de contrato pedagógico e cumprimento legal, sem comercialização ou rastreamento publicitário.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportData}
                        disabled={exportingData}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {exportingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Exportar Meus Dados (JSON)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivacyModalOpen(true)}
                        className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        Política de Privacidade
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCookieModalOpen(true)}
                        className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Cookie className="w-3.5 h-3.5 text-purple-400" />
                        Preferências de Cookies
                      </button>
                    </div>
                  </div>

                  {/* Formulário de Abertura de Solicitação LGPD */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'} space-y-3`}>
                    <span className="font-bold text-sm text-white block">Abrir Requisição Formal à Equipe de Privacidade</span>
                    <p className="text-slate-400">
                      Submeta solicitações formais relativas aos seus direitos (confirmação, retificação, esclarecimentos ou exclusão/anonimização).
                    </p>

                    <form onSubmit={handleSubmitPrivacyRequest} className="space-y-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Tipo de Solicitação
                        </label>
                        <select
                          value={requestType}
                          onChange={(e) => setRequestType(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                            isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="access">Acesso e Confirmação de Tratamento (Art. 18, I e II)</option>
                          <option value="rectification">Retificação ou Atualização Cadastral (Art. 18, III)</option>
                          <option value="deletion">Eliminação / Anonimização de Dados (Art. 18, VI e Art. 16)</option>
                          <option value="information">Informações sobre Uso ou Compartilhamento (Art. 18, VII)</option>
                          <option value="revocation">Revogação de Consentimento Opcional (Art. 18, IX)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Detalhes ou Observações Adicionais (Opcional)
                        </label>
                        <textarea
                          rows={2}
                          value={requestDetails}
                          onChange={(e) => setRequestDetails(e.target.value)}
                          placeholder="Especifique o escopo ou motivo da sua solicitação..."
                          className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                            isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingRequest}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {submittingRequest && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Registrar Protocolo LGPD
                      </button>
                    </form>
                  </div>

                  {/* Histórico de Solicitações */}
                  <div className="space-y-2">
                    <span className="font-bold text-sm text-white block">Meus Protocolos Registrados</span>
                    {loadingRequests ? (
                      <div className="py-4 text-center text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando protocolos...
                      </div>
                    ) : privacyRequests.length === 0 ? (
                      <p className="text-slate-500 italic">Nenhuma solicitação de privacidade registrada no momento.</p>
                    ) : (
                      <div className="space-y-2">
                        {privacyRequests.map((req) => (
                          <div
                            key={req.id}
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
                              isDark ? 'bg-slate-950/30 border-slate-800/80' : 'bg-slate-100/60 border-slate-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-blue-400">{req.requestCode}</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {req.requestType}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Registrado em: {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                                {req.adminNotes && <span className="block text-slate-300 italic mt-0.5">Parecer: {req.adminNotes}</span>}
                              </p>
                            </div>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                req.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : req.status === 'under_review'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : req.status === 'rejected'
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              {req.status === 'completed' ? 'Concluída' : req.status === 'under_review' ? 'Em Análise' : req.status === 'rejected' ? 'Indeferida' : 'Pendente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] ${
            isDark ? 'border-slate-800/80 bg-[#070D18] text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <span>Operador ID: <strong className="font-mono text-slate-400">{profile?.id.slice(0, 8) || '...'}</strong></span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <Shield className="w-3 h-3" /> Proteção Anti-IDOR & LGPD Ativa
          </span>
        </div>

        {/* Modais Legais */}
        <PrivacyPolicyModal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)} />
        <TermsOfUseModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
        <CookiePolicyModal isOpen={isCookieModalOpen} onClose={() => setIsCookieModalOpen(false)} />
      </div>
    </div>
  );
};
