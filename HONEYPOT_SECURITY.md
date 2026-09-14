# Arquitetura e Especificação Técnica - Camada de Decepção Defensiva (Honeypots & Honeytokens)

## 1. Visão Geral e Princípios Fundamentais

A aplicação **Rumo ao CFO** incorpora uma camada ativa e production-safe de decepção defensiva com o objetivo exclusivo de detectar precocemente:
- Varreduras automatizadas e bots de reconhecimento.
- Ataques de credential stuffing e pulverização de senhas.
- Enumeração de arquivos e rotas administrativas (`dirbuster`, `gobuster`, `ffuf`, etc.).
- Tentativas de descoberta de infraestrutura interna ou recursos sensíveis legados.

### Diretrizes de Segurança Invioláveis
- **Defensiva Estrita**: O sistema opera de forma estritamente passiva/defensiva. Não há retaliação, execução de código remoto, danos a dispositivos ou redirecionamento a conteúdos maliciosos.
- **Isolamento Total**: Nenhum recurso da camada de decepção conecta-se à tabela real de usuários, base de pagamento, dados pessoais ou infraestrutura de produção.
- **Minimização e LGPD**: Nenhuma senha de tentativa é gravada (nem em texto claro, nem em hash). Cabeçalhos `Authorization`, cookies, tokens de sessão legítimos e payloads sensíveis são integralmente filtrados.
- **Sem Banimentos Perpétuos Automáticos**: Bloqueios de origem operam com TTL (tempo de vida) explícito via `cadet_temporary_source_blocks` (1 a 5 horas).

---

## 2. Arquitetura da Camada

```
                                  [ Tráfego HTTP ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      [ Allowlist de Pentest? ]                    [ Header / Query / Path ]
       (X-Security-Scan-Bypass)                    (Inspeção de Honeytokens)
                   │                                           │
         Sim ┌─────┴─────┐ Não                       Sim ┌─────┴─────┐ Não
             │           │                               │           │
          Bypass    Rotas Normais            HONEYTOKEN_TRIGGERED  Rotas Decoy / Canários
        Defensivo     (Legítimas)              (Risco Crítico)     (Rotas Falsas / Arquivos)
                                                         │                   │
                                                         └─────────┬─────────┘
                                                                   ▼
                                                       [ Motor de Risco & DoS ]
                                                    (Deduplicação em Memória 10s)
                                                                   │
                                                                   ▼
                                                     ┌───────────────────────────┐
                                                     │ security_deception_events │
                                                     │ cadet_temporary_blocks    │
                                                     │ security_notifications    │
                                                     │ adminRealtimeHub (SSE)    │
                                                     └───────────────────────────┘
```

---

## 3. Rotas Decoy (Administrative Decoy Routes)

As rotas decoy foram projetadas para simular portais e serviços administrativos verossímeis, mas são completamente desconectadas de qualquer recurso de produção.

| Rota Decoy | Descrição & Resposta | Tipo de Interação |
|---|---|---|
| `/internal-admin` | Portal simulado de administração interna. Exibe tela de login crível para requisições HTML e 401 para requisições de API. | `HONEYPOT_ROUTE_ACCESSED` / `HONEYPOT_LOGIN_ATTEMPT` |
| `/system-console` | Console do operador de sistemas legado. Simula interface de controle restrito. | `HONEYPOT_ROUTE_ACCESSED` / `HONEYPOT_LOGIN_ATTEMPT` |
| `/admin-backup` | Painel decoy de rotinas de backup administrativo. | `HONEYPOT_ROUTE_ACCESSED` / `HONEYPOT_LOGIN_ATTEMPT` |
| `/legacy-admin` | Portal administrativo legado falso. | `HONEYPOT_ROUTE_ACCESSED` / `HONEYPOT_LOGIN_ATTEMPT` |
| `/api/internal` | Endpoint de API privada simulada. Retorna HTTP 403 isolado. | `HONEYPOT_ROUTE_ACCESSED` |
| `/api/debug` | Interface de telemetria e diagnóstico simulada. Retorna HTTP 403 isolado. | `HONEYPOT_ROUTE_ACCESSED` |
| `/api/v1/admin-export` | Endpoint decoy de exportação administrativa. Retorna HTTP 403 isolado. | `HONEYPOT_ROUTE_ACCESSED` |

> [!IMPORTANT]
> Essas rotas **nunca** constam em menus de navegação, bundles de produção do Vite ou no `sitemap.xml`. Elas só recebem tráfego via enumeração deliberada ou varredura de atacantes.

---

## 4. Recursos Canário (Canary Resources)

Arquivos estáticos comumente buscados por ferramentas de varredura (como Nuclei, ZAP e scanners web):

| Recurso Decoy | Formato de Retorno | Conteúdo Sintético & Honeytoken Embutido |
|---|---|---|
| `/.env.backup` | `text/plain` | Configuração fictícia de homologação contendo `cfo_canary_key_...` e usuário de banco simulado `cfo_canary_operator_sec`. |
| `/config.old` | `application/x-yaml` | YAML sintético com service account falsa `svc-decoy-backup@cbmerj-internal.iam.gserviceaccount.com`. |
| `/database.sql` | `application/sql` | Comentários SQL e estrutura DDL mínima fictícia com token canário. Sem qualquer dado de produção. |
| `/admin-export.json` | `application/json` | JSON formatado sintético com contador zerado e token canário `cfo_canary_tok_...`. |
| `/backup.zip` | `application/zip` | Arquivo ZIP binário válido gerado sinteticamente em memória (sem bibliotecas externas), contendo apenas `README.txt` canário inofensivo. |

---

## 5. Estratégia de Honeytokens

Os honeytokens são credenciais e identificadores sintéticos, gerados criptograficamente, desenhados para parecer chaves autênticas de alta relevância:

1. **Prefixos Padronizados**: Utilizam o prefixo canônico `cfo_canary_` para fácil auditoria interna sem colisão com secrets reais.
2. **Inspeção Perimetral Global**: O middleware `honeytokenDetectionMiddleware` avalia o cabeçalho `Authorization`, `X-API-Key`, `X-Token` e query parameters em **todas as requisições** recebidas pela aplicação.
3. **Disparo Imediato**: A presença de qualquer honeytoken registrado aciona o evento `HONEYTOKEN_TRIGGERED` com risco crítico (85-90 pontos), indicando que o requisitante obteve a chave a partir de um recurso canário decoy.

---

## 6. Tipos de Eventos Estruturados

| Evento | Pontuação Base | Significado Forense |
|---|---|---|
| `HONEYPOT_ROUTE_ACCESSED` | 25 | Acesso a uma rota administrativa decoy não mapeada publicamente. |
| `DECOY_RESOURCE_ACCESSED` | 30 | Download ou inspeção de um recurso canário (`.env.backup`, `backup.zip`, etc.). |
| `HONEYPOT_LOGIN_ATTEMPT` | 70 | Tentativa de submissão de credenciais em formulário administrativo falso. |
| `HONEYTOKEN_TRIGGERED` | 85 | Tentativa de uso de uma credencial/chave canário em qualquer requisição. |
| `AUTOMATED_ENUMERATION_SUSPECTED` | 90 | Múltiplas requisições decoy consecutivas da mesma origem em curto intervalo. |

---

## 7. Motor de Risco e Resposta Progressiva

O sistema não adota punições imediatas e permanentes por acessos únicos isolados:

1. **Risco Baixo (< 40 pts)**:
   - Registro em log auditável no banco (`security_deception_events`).
   - Requisição atende normalmente com resposta decoy inofensiva.
2. **Risco Médio (40 a 79 pts)**:
   - Acionamento de *throttling* defensivo.
   - Aplicação de rate limiting rigoroso sobre o endpoint honeypot.
3. **Risco Crítico (&ge; 80 pts)**:
   - Bloqueio temporário da origem por **1 hora** em `cadet_temporary_source_blocks`.
   - Invalidação imediata de sessão se o requisitante for um usuário logado no sistema.
   - Emissão de notificação interna `SYSTEM_ALERT` para administradores.
   - Publicação de evento em tempo real via Server-Sent Events (`adminRealtimeHub`).

---

## 8. Efeito Visual de Aviso Controlado (Scare Screen)

Quando um usuário submete dados ao formulário de login falso (`/internal-admin` ou `/legacy-admin`) através de um navegador web (cabeçalho `Accept: text/html`), o sistema exibe uma resposta com interface defensiva e mensagem neutra:

> **MONITORED SECURITY ENDPOINT**  
> *"Recurso de Segurança Monitorado"*  
> *"Security monitoring triggered. This endpoint is a monitored defensive decoy."*  
> *"Aviso Defensivo: Este endpoint não possui vínculos operacionais com o sistema de produção. A interação foi catalogada de forma isolada para telemetria de segurança defensiva."*

- **Sem ameaças legais**.
- **Sem execução de áudio ou scripts agressivos**.
- **Sem travamento de navegador** (o botão "Retornar à Página Principal" redireciona para `/`).

---

## 9. Proteção contra DoS e Exaustão de Recursos

Para impedir que atacantes utilizem os endpoints de honeypot para inflar a base de dados SQLite/PostgreSQL com milhões de registros:
- **Deduplicação em Memória**: Janela de 10 segundos por par `(hash_ip + rota)`. Hits consecutivos dentro desse intervalo são marcados como `THROTTLED` sem inserção duplicada no banco.
- **Rate Limit por IP**: O `honeypotRateLimiter` limita o tráfego nos decoys a 15 requisições por minuto por IP.
- **Payload Sanitizado**: Nenhuma senha ou payload bruto é persistido em disco ou banco de dados.

---

## 10. Procedimento para Pentest Autorizado (Bypass de Scanners)

Varreduras autorizadas (OWASP ZAP, Burp Suite, Strix, Nuclei) podem executar auditorias completas na aplicação sem serem bloqueadas pela camada de decepção:

### Opção A: Cabeçalho HTTP de Bypass
Configure a ferramenta de teste para enviar o cabeçalho configurado na variável de ambiente do servidor:
```http
X-Security-Scan-Bypass: <VALOR_DE_SECURITY_TEST_ALLOWLIST_KEY>
```

### Opção B: Lista de IPs Autorizados
Adicione os endereços de origem da equipe de segurança à variável de ambiente:
```bash
SECURITY_SCANNER_ALLOWLIST_IPS=192.168.1.100,200.x.x.x
```

Quando uma requisição com bypass autorizado atinge um decoy:
- A ação é classificada como `PENTEST_BYPASS`.
- **Nenhum IP é bloqueado**.
- **Nenhuma sessão legítima é revogada**.

---

## 11. Como os Administradores Revisam Incidentes

No **Painel Administrativo** (`/admin`), aba **Honeypots & Decepção**:
1. **Painel de Métricas**:
   - Total de eventos, interações nas últimas 24h, alertas de alto risco e bloqueios temporários ativos.
   - Ranking dos decoys mais atacados.
2. **Tabela de Telemetria Forense**:
   - Filtros por tipo de evento, nível de risco, busca textual e paginação.
   - Visualização do hash do IP, user agent, método HTTP e rota decoy atingida.
3. **Desbloqueio Manual de Origem**:
   - Campo dedicado para desbloquear um IP imediatamente caso seja constatado um falso positivo operacional.

---

## 12. Política de Retenção e LGPD (Art. 7, IX)

- **Finalidade Legal**: Coleta estritamente justificada pelo Legítimo Interesse (LGPD Art. 7, IX) para proteção cibernética de dados pessoais de estudantes e integridade do banco de questões.
- **Retenção Padrão**: 30 dias.
- **Limpeza Automática**: O método `HoneypotRepository.cleanupExpiredEvents(30)` purga registros com data anterior a 30 dias.

---

## 13. Como Desativar a Camada com Segurança

Caso seja necessário desativar a camada de decepção temporariamente para manutenção:
1. Configure na variável de ambiente:
   ```bash
   HONEYPOT_ENABLED=false
   ```
2. Ou configure `SECURITY_TEST_ALLOWLIST_KEY` correspondente nas ferramentas de varredura.
3. Para limpar todos os bloqueios temporários ativos no banco:
   ```sql
   DELETE FROM cadet_temporary_source_blocks WHERE reason LIKE '%honeypot%';
   ```
