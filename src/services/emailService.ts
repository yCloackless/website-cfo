/**
 * CFO CBMERJ — Email Service
 * Provedor: Resend (https://resend.com)
 * Free tier: 3.000 e-mails/mês, 100/dia
 *
 * Variáveis de ambiente necessárias:
 *   RESEND_API_KEY   — Chave da API do Resend (obrigatória em produção)
 *   EMAIL_FROM       — Endereço remetente verificado no Resend (ex: noreply@seudominio.com)
 *                      Em dev, usa "onboarding@resend.dev" sem precisar de domínio próprio.
 */

import { Resend } from 'resend';

// Instância lazy — só cria quando a primeira função for chamada
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('EMAIL_CONFIG_ERROR: RESEND_API_KEY não configurada.');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'onboarding@resend.dev';
}
const APP_NAME = 'CFO CBMERJ';

// ---------------------------------------------------------------------------
// Templates de E-mail
// ---------------------------------------------------------------------------

function buildPasswordResetEmail(code: string, username: string): { subject: string; html: string; text: string } {
  const subject = `${APP_NAME} — Código de Recuperação de Senha`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f19;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f19;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#131a2e;border-radius:12px;overflow:hidden;border:1px solid #1e2d4a;">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f,#0f2744);padding:32px 40px;text-align:center;">
              <div style="font-size:28px;margin-bottom:8px;">🛡️</div>
              <h1 style="margin:0;color:#e2e8f0;font-size:20px;font-weight:700;letter-spacing:0.5px;">
                ${APP_NAME}
              </h1>
              <p style="margin:8px 0 0;color:#64748b;font-size:13px;">Sistema de Acesso Restrito</p>
            </td>
          </tr>
          <!-- Corpo -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;color:#94a3b8;font-size:15px;">
                Olá, <strong style="color:#e2e8f0;">${username}</strong>
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação de recuperação de senha para sua conta.
                Use o código abaixo para redefinir sua senha:
              </p>
              <!-- Código -->
              <div style="background:#0f1929;border:2px solid #1e3a5f;border-radius:10px;padding:28px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:2px;">
                  Código de Recuperação
                </p>
                <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#3b82f6;font-family:'Courier New',monospace;">
                  ${code}
                </div>
                <p style="margin:12px 0 0;color:#64748b;font-size:12px;">
                  ⏱ Válido por <strong style="color:#f59e0b;">15 minutos</strong> · Uso único
                </p>
              </div>
              <!-- Aviso de segurança -->
              <div style="background:#1a0a0a;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px;margin-bottom:28px;">
                <p style="margin:0;color:#fca5a5;font-size:13px;line-height:1.6;">
                  ⚠️ <strong>Se você não solicitou esta recuperação</strong>, ignore este e-mail.
                  Sua senha permanece inalterada e nenhuma ação adicional é necessária.
                </p>
              </div>
              <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                Por segurança, nunca compartilhe este código. Nossa equipe jamais solicitará
                seu código de recuperação por qualquer meio.
              </p>
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="background:#0b0f19;padding:20px 40px;border-top:1px solid #1e2d4a;text-align:center;">
              <p style="margin:0;color:#334155;font-size:12px;">
                ${APP_NAME} · Sistema de Gestão CFO CBMERJ
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = [
    `${APP_NAME} — Recuperação de Senha`,
    '',
    `Olá, ${username}`,
    '',
    'Seu código de recuperação de senha é:',
    '',
    `  ${code}`,
    '',
    'Válido por 15 minutos. Uso único.',
    '',
    'Se você não solicitou esta recuperação, ignore este e-mail.',
    '',
    `${APP_NAME} · Sistema de Gestão CFO CBMERJ`,
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Função pública de envio
// ---------------------------------------------------------------------------

export interface SendPasswordResetResult {
  sent: boolean;
  /** Presente apenas em desenvolvimento (NODE_ENV !== 'production') */
  debugCode?: string;
  error?: string;
}

/**
 * Envia o código de recuperação de senha por e-mail via Resend.
 *
 * - Em produção: envia o e-mail e nunca retorna o código.
 * - Em desenvolvimento: tenta enviar, mas inclui `debugCode` na resposta
 *   para facilitar testes sem domínio verificado.
 * - Se `RESEND_API_KEY` não estiver configurada em dev, apenas loga o código
 *   no console (sem erro).
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  username: string,
  code: string
): Promise<SendPasswordResetResult> {
  const isProd = process.env.NODE_ENV === 'production';
  const { subject, html, text } = buildPasswordResetEmail(code, username);

  // --- Sem API key em desenvolvimento: apenas loga e segue ---
  if (!process.env.RESEND_API_KEY) {
    if (isProd) {
      // Em produção sem API key: falha ruidosa (startup deveria ter abortado)
      return { sent: false, error: 'RESEND_API_KEY não configurada em produção.' };
    }
    console.warn('[Email DEV] Envio não configurado; código disponível somente na resposta de desenvolvimento.');
    return { sent: false, debugCode: code };
  }

  try {
    const client = getResendClient();
    const { error } = await client.emails.send({
      from: getFromAddress(),
      to: [toEmail],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[Email] Falha ao enviar via Resend.');
      // Em dev, ainda retorna debugCode para não travar o fluxo de testes
      return {
        sent: false,
        error: error.message,
        debugCode: isProd ? undefined : code,
      };
    }

    console.log('[Email] Solicitação aceita pelo provedor.');
    return { sent: true };
  } catch (err: any) {
    console.error('[Email] Falha de comunicação com o provedor.');
    return {
      sent: false,
      error: err?.message,
      debugCode: isProd ? undefined : code,
    };
  }
}
