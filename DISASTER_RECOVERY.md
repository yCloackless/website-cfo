# Recuperação de desastre

1. Reinstale o Docker e copie o projeto para a nova máquina.
2. Recrie o `.env` a partir de `.env.example`, preenchendo os segredos fora do Git.
3. Construa e inicie a aplicação:

```powershell
docker compose build
docker compose up -d
```

4. Recupere o backup `.json.gz` e `.sha256` para o volume `cfo_data`.
5. Pare o serviço, restaure com o procedimento em [BACKUP.md](BACKUP.md) e
   inicie-o novamente.
6. Valide `http://localhost:3000` e os endpoints de saúde/administração.

Se o backup externo estiver configurado, os arquivos ficam no bucket indicado
por `BACKUP_S3_BUCKET`; a autenticação usa somente as variáveis `BACKUP_S3_*`.
