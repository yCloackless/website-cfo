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
} from 'lucide-react';
import { AppTheme } from '../types';

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
}

export const MyAccountModal: React.FC<MyAccountModalProps> = ({
  isOpen,
  onClose,
  theme,
  sessionToken,
  onProfileUpdated,
}) => {
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'email' | 'password'>('profile');
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);

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

  // Carrega perfil ao abrir o modal
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
            <Shield className="w-3 h-3" /> Proteção Anti-IDOR Ativa
          </span>
        </div>
      </div>
    </div>
  );
};
