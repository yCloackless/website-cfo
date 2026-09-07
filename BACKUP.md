# Sistema Profissional de Backup e Recuperação (BACKUP.md)
## CFO CBMERJ — Terminal de Comando e Banco de Dados de Estudos

---

### 1. Visão Geral da Arquitetura de Backup

O sistema de backup do projeto foi projetado para garantir **recuperabilidade total** em cenários de falha catastrófica de hardware, corrupção de arquivos ou perda de instâncias em nuvem (ex: Render, VPS ou Cloud Run).

```
                      [ Diretório /data do Servidor ]
                                     ↓
                    [ Captura Consistente em Memória ]
                                     ↓
                 [ Compactação Gzip (.json.gz) de Alta Taxa ]
                                     ↓
             [ Assinatura Criptográfica SHA-256 (.sha256) ]
                                     ↓
       ┌─────────────────────────────┴─────────────────────────────┐
       ↓                                                           ↓
[ Armazenamento Local Seguro ]                          [ Object Storage Externo S3 / R2 ]
  (data/backups/)                                         (Cloudflare R2 / AWS S3)
  Retenção: 30 dias diários                               Regra 3-2-1 de Contingência
```

---

### 2. Estratégia de Backup e Nomenclatura

- **Padrão de Nome de Arquivo**:
  `backup_YYYY-MM-DD_HH-mm-ss.json.gz`
  Exemplo: `backup_2026-09-07_03-00-00.json.gz`
- **Arquivo de Hash Integridade**:
  `backup_2026-09-07_03-00-00.json.gz.sha256`
- **Conteúdo Incluído no Backup**:
  - `data/banned-ips.json` (Lista de ameaças e IPs bloqueados)
  - `data/security-config.json` (Parametrização do 2FA)
  - `data/user-backups/` (Histórico e progresso de cada aluno/cadete)
  - `data/notion-seed.json` (Cache e semente dos tópicos do edital CBMERJ)
  - `data/study-progress.json` e `data/timer-state.json`
- **Arquivos Excluídos do Snapshot**:
  - Diretório de backups anteriores (`data/backups/`) para evitar recursão infinita;
  - Arquivos de sessão voláteis ou temporários (`calendar-session.json`).

---

### 3. Frequência e Política de Retenção

1. **Backup Automático Diário**:
   - Agendado internamente via `initBackupScheduler()` para rodar todos os dias às **03:00 (Horário Local)**.
   - Realiza autoverificação do hash SHA-256 logo após a compactação.
   - Aplica política de expurgo automático: backups locais com mais de **30 dias** são limpos para prevenir exaustão de disco.
2. **Backup Manual Sob Demanda**:
   - Operadores autenticados com papel `admin` podem disparar a geração a qualquer instante via interface ou endpoint `POST /api/admin/backup/create`.

---

### 4. Endpoints da API de Backup

| Rota | Método | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `/api/user/sync-backup` | `POST` | Usuário (Token) | Salva progresso de estudos do usuário autenticado no servidor. |
| `/api/user/restore-backup`| `GET` | Usuário (Token) | Retorna o snapshot do progresso salvo para restaurar a máquina do aluno. |
| `/api/admin/backup/status`| `GET` | Admin | Retorna estatísticas de backup, total de arquivos, tamanho e último backup. |
| `/api/admin/backup/list`  | `GET` | Admin | Lista todos os backups armazenados com status de integridade SHA-256. |
| `/api/admin/backup/create`| `POST`| Admin | Dispara criação imediata de backup manual. |
| `/api/admin/backup/restore`| `POST`| Admin | Restaura um backup específico após validar confirmação explícita. |

---

### 5. Procedimento de Restauração (Restore)

Para restaurar um backup através da API:
```bash
curl -X POST https://seu-site.com/api/admin/backup/restore \
  -H "Authorization: Bearer <SEU_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "backup_2026-09-07_03-00-00.json.gz",
    "confirm": "RESTORE_CONFIRMED"
  }'
```

#### Passos Internos Executados pelo Restore:
1. **Checagem de Existência**: Confere se o arquivo `.json.gz` e o `.sha256` estão presentes.
2. **Validação Estrita de Hash**: Recalcula o SHA-256 do arquivo comprimido. Se divergir em 1 bit sequer, aborta com erro `INTEGRITY_MISMATCH`.
3. **Descompressão**: Descompacta o payload JSON em memória.
4. **Aplicação Segura**: Reescreve os arquivos restaurados no diretório `/data`.
5. **Auditoria**: Registra o evento de sucesso ou falha no `data/audit.log`.

---

### 6. Integração com Nuvem (Cloudflare R2 / AWS S3)

Para ativar a cópia externa off-site (estratégia 3-2-1), defina as variáveis no `.env` ou painel do provedor:
```env
BACKUP_S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
BACKUP_S3_BUCKET="cfo-cbmerj-backups"
BACKUP_S3_ACCESS_KEY="seu_access_key"
BACKUP_S3_SECRET_KEY="seu_secret_key"
BACKUP_S3_REGION="auto"
```
O serviço lê automaticamente essas variáveis e despacha as cópias geradas para o bucket configurado.
