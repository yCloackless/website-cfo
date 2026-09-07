# Plano de Recuperação de Desastres (DISASTER_RECOVERY.md)
## CFO CBMERJ — Procedimento de Contingência Operacional (Runbook)

---

### 1. Cenário: "O Servidor de Produção Foi Completamente Perdido"

Se o container do Render, a VPS ou a máquina de hospedagem for destruída ou corrompida, siga este procedimento passo a passo para restabelecer a operação em menos de 15 minutos.

```
       [ Incidente: Falha Total do Servidor ]
                         ↓
  [ Passo 1: Clonar Repositório em Nova Instância ]
                         ↓
  [ Passo 2: Configurar Variáveis de Ambiente (.env) ]
                         ↓
  [ Passo 3: Baixar o Último Backup Válido (.json.gz + .sha256) ]
                         ↓
  [ Passo 4: Executar Script de Restauração de Emergência ]
                         ↓
  [ Passo 5: Iniciar Aplicação e Validar Smoke Tests ]
                         ↓
  [ Passo 6: Apontar Domínio e Liberar Tráfego ]
```

---

### 2. Passo a Passo de Reconstrução

#### 2.1. Clonar a Aplicação
```bash
git clone https://github.com/yCloackless/CFO-OFICIAL-AGORASIM.git /opt/cfo-cbmerj
cd /opt/cfo-cbmerj
npm install
npm run build
```

#### 2.2. Configurar os Segredos
Crie o arquivo `.env` baseado no `.env.example`:
```bash
cp .env.example .env
# Configure ADMIN_PASSWORD, CADET_PASSWORD, TOTP_SECRET, SESSION_SECRET, TURNSTILE_*
```

#### 2.3. Obter o Arquivo de Backup
Baixe o backup mais recente do Cloudflare R2 ou do seu armazenamento de contingência para a pasta `data/backups/`:
```bash
mkdir -p data/backups
# Exemplo via AWS CLI / R2 CLI:
# aws s3 cp s3://cfo-cbmerj-backups/backup_LATEST.json.gz data/backups/
# aws s3 cp s3://cfo-cbmerj-backups/backup_LATEST.json.gz.sha256 data/backups/
```

#### 2.4. Restaurar os Dados
No Node.js ou via endpoint interno do backend:
```bash
node -e '
  const { restoreBackup } = require("./dist/src/services/backupService.js");
  const result = restoreBackup("backup_LATEST.json.gz");
  console.log("Resultado da Restauração:", result);
'
```
*Alternativamente, se o servidor já estiver rodando, chame `POST /api/admin/backup/restore`.*

#### 2.5. Validar Integridade (Smoke Tests)
1. Verifique se o endpoint `/api/health` retorna `{"status":"ok"}`.
2. Acesse a tela de login (`/`) e teste:
   - Login com a conta de **Cadete** (`cadete` / `cadetecfo2026!`) para verificar acesso dos alunos aos estudos;
   - Login com a conta de **Comando Admin** (`admin` / `cfocbmerj2026!`) com o token do Google Authenticator.
3. Consulte `/api/admin/backup/status` com o token de Admin para confirmar que o status está operacional.

---

### 3. Cenário: "Vazamento de Segredo ou Credencial Comprometida"

Se qualquer senha ou secret (`SESSION_SECRET`, `ADMIN_PASSWORD`, etc.) for exposto:

1. **Rotacionar Imediatamente no Servidor**:
   - Gere novo `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Gere nova senha mestra `ADMIN_PASSWORD`.
   - Atualize no painel de Environment Variables do provedor de nuvem (Render, Heroku, VPS).
2. **Invalidação Automática de Todas as Sessões**:
   - A alteração do `SESSION_SECRET` invalida instantaneamente todos os tokens de sessão ativos de qualquer invasor ou dispositivo anterior, forçando reautenticação com 2FA.
3. **Auditar Acessos Recentes**:
   - Inspecione `data/audit.log` para verificar se houve logins suspeitos ou tentativas de restauração.
