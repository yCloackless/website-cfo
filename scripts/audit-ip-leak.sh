#!/usr/bin/env bash
# =============================================================================
# audit-ip-leak.sh — Auditoria de Vazamento de IP/DNS
# CFO CBMERJ | Uso: bash scripts/audit-ip-leak.sh meudominio.com
# =============================================================================
# Requer: curl, dig
# Opcional: jq (para leitura do crt.sh)
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Uso: $0 <dominio>"
  echo "Ex:  $0 meuapp.onrender.com"
  echo "Ex:  $0 meusite.com"
  exit 1
fi

# Cores (desativa em ambientes sem TTY)
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

PASS="${GREEN}[PASS]${RESET}"
WARN="${YELLOW}[WARN]${RESET}"
FAIL="${RED}[FAIL]${RESET}"
INFO="${BLUE}[INFO]${RESET}"

ISSUES=0

separator() { echo -e "\n${BOLD}─────────────────────────────────────────────${RESET}"; }

# =============================================================================
# 1. Blocos CIDR da Cloudflare (atualizados 2025)
# =============================================================================
CF_CIDRS=(
  "173.245.48.0/20" "103.21.244.0/22" "103.22.200.0/22"
  "103.31.4.0/22"   "141.101.64.0/18" "108.162.192.0/18"
  "190.93.240.0/20" "188.114.96.0/20" "197.234.240.0/22"
  "198.41.128.0/17" "162.158.0.0/15"  "104.16.0.0/13"
  "104.24.0.0/14"   "172.64.0.0/13"   "131.0.72.0/22"
)

is_cloudflare_ip() {
  local ip="$1"
  IFS='.' read -r i1 i2 i3 i4 <<< "$ip" 2>/dev/null || return 1
  local ip_int=$(( (i1<<24) + (i2<<16) + (i3<<8) + i4 ))

  for cidr in "${CF_CIDRS[@]}"; do
    IFS='/' read -r base_ip prefix_len <<< "$cidr"
    IFS='.' read -r b1 b2 b3 b4 <<< "$base_ip"
    local base_int=$(( (b1<<24) + (b2<<16) + (b3<<8) + b4 ))
    local mask=$(( 0xFFFFFFFF << (32 - prefix_len) & 0xFFFFFFFF ))
    if (( (ip_int & mask) == (base_int & mask) )); then
      return 0
    fi
  done
  return 1
}

# =============================================================================
# 2. Resolucao DNS (A records)
# =============================================================================
separator
echo -e "${BOLD}1. Resolucao DNS — $DOMAIN${RESET}"

A_RECORDS=$(dig +short A "$DOMAIN" 2>/dev/null | grep -E '^[0-9]+\.' | head -10 || true)
AAAA_RECORDS=$(dig +short AAAA "$DOMAIN" 2>/dev/null | grep -E ':' | head -5 || true)

if [[ -z "$A_RECORDS" && -z "$AAAA_RECORDS" ]]; then
  echo -e "  $WARN Nenhum A/AAAA record encontrado para $DOMAIN"
  ((ISSUES++))
else
  for ip in $A_RECORDS; do
    if is_cloudflare_ip "$ip"; then
      echo -e "  $PASS $DOMAIN → $ip (IP Cloudflare OK)"
    else
      echo -e "  $FAIL $DOMAIN → $ip (IP NAO E CLOUDFLARE — potencial vazamento!)"
      ((ISSUES++))
    fi
  done
  for ip6 in $AAAA_RECORDS; do
    echo -e "  $INFO $DOMAIN → $ip6 (IPv6 — verificar manualmente se e Cloudflare)"
  done
fi

# =============================================================================
# 3. Subdominios legados comuns
# =============================================================================
separator
echo -e "${BOLD}2. Subdominios Legados Comuns${RESET}"

LEGACY_SUBS=("www" "mail" "ftp" "direct" "origin" "dev" "staging" "api" "smtp" "vpn" "admin" "old" "beta")

for sub in "${LEGACY_SUBS[@]}"; do
  fqdn="${sub}.${DOMAIN}"
  sub_ip=$(dig +short A "$fqdn" 2>/dev/null | grep -E '^[0-9]+\.' | head -1 || true)
  if [[ -n "$sub_ip" ]]; then
    if is_cloudflare_ip "$sub_ip"; then
      echo -e "  $PASS $fqdn → $sub_ip (Cloudflare OK)"
    else
      echo -e "  $FAIL $fqdn → $sub_ip (IP EXPOSTO — nao esta atras da Cloudflare)"
      ((ISSUES++))
    fi
  fi
done
echo -e "  $INFO Subdominios sem resolucao DNS nao foram listados (OK)"

# =============================================================================
# 4. MX Records
# =============================================================================
separator
echo -e "${BOLD}3. MX Records (E-mail)${RESET}"

MX_RECORDS=$(dig +short MX "$DOMAIN" 2>/dev/null | head -5 || true)
if [[ -z "$MX_RECORDS" ]]; then
  echo -e "  $INFO Sem MX record"
else
  echo "$MX_RECORDS" | while read -r priority mx_host; do
    if echo "$mx_host" | grep -qiE 'amazonaws|amazonses|postmark|mailgun|sendgrid|google|protection\.outlook|smtp\.eu|resend'; then
      echo -e "  $PASS MX: $mx_host (provedor externo seguro)"
    else
      echo -e "  $WARN MX: $mx_host — verificar se aponta para IP do proprio servidor"
      ((ISSUES++))
    fi
  done
fi

# =============================================================================
# 5. Headers HTTP de resposta
# =============================================================================
separator
echo -e "${BOLD}4. Headers HTTP — https://$DOMAIN${RESET}"

HEADERS=$(curl -sI --max-time 10 "https://$DOMAIN" 2>/dev/null || curl -sI --max-time 10 "http://$DOMAIN" 2>/dev/null || true)

if [[ -z "$HEADERS" ]]; then
  echo -e "  $WARN Nao foi possivel conectar (timeout ou SSL invalido)"
else
  if echo "$HEADERS" | grep -qi "cf-ray:"; then
    echo -e "  $PASS CF-Ray presente — resposta vem pela Cloudflare"
  else
    echo -e "  $WARN CF-Ray ausente — dominio pode nao estar passando pela Cloudflare"
    ((ISSUES++))
  fi

  SERVER_HDR=$(echo "$HEADERS" | grep -i "^server:" | head -1 || true)
  if [[ -n "$SERVER_HDR" ]]; then
    if echo "$SERVER_HDR" | grep -qi "cloudflare"; then
      echo -e "  $PASS Server header: Cloudflare (origem oculta)"
    else
      echo -e "  $WARN $SERVER_HDR (tecnologia pode estar exposta)"
    fi
  else
    echo -e "  $PASS Sem Server header (boa pratica)"
  fi

  if echo "$HEADERS" | grep -qi "x-powered-by:"; then
    echo -e "  $FAIL X-Powered-By presente — remover com app.disable('x-powered-by')"
    ((ISSUES++))
  else
    echo -e "  $PASS Sem X-Powered-By"
  fi

  if echo "$HEADERS" | grep -qi "strict-transport-security:"; then
    echo -e "  $PASS HSTS presente"
  else
    echo -e "  $WARN HSTS ausente"
  fi

  if echo "$HEADERS" | grep -qi "x-content-type-options: nosniff"; then
    echo -e "  $PASS X-Content-Type-Options: nosniff"
  else
    echo -e "  $WARN X-Content-Type-Options ausente"
  fi
fi

# =============================================================================
# 6. Certificados TLS historicos via crt.sh
# =============================================================================
separator
echo -e "${BOLD}5. Certificados TLS Historicos (crt.sh)${RESET}"

CRT_RESULT=$(curl -s --max-time 15 "https://crt.sh/?q=%.${DOMAIN}&output=json" 2>/dev/null || true)

if [[ -z "$CRT_RESULT" || "$CRT_RESULT" == "null" ]]; then
  echo -e "  $WARN crt.sh indisponivel — verificar manualmente: https://crt.sh/?q=%.${DOMAIN}"
elif command -v jq &>/dev/null; then
  UNIQUE_NAMES=$(echo "$CRT_RESULT" | jq -r '.[].name_value' 2>/dev/null | sort -u | grep -v "^\*\." | head -20 || true)
  if [[ -n "$UNIQUE_NAMES" ]]; then
    echo -e "  $WARN Subdominios encontrados em certificados historicos:"
    echo "$UNIQUE_NAMES" | while read -r name; do
      echo -e "    • $name"
    done
    echo -e "  $INFO Verifique se algum ainda resolve para IP direto"
  else
    echo -e "  $PASS Nenhum subdominio extra nos certificados"
  fi
else
  echo -e "  $INFO jq nao instalado. Verificar em: https://crt.sh/?q=%.${DOMAIN}"
fi

# =============================================================================
# 7. SPF record
# =============================================================================
separator
echo -e "${BOLD}6. SPF Record${RESET}"

SPF=$(dig +short TXT "$DOMAIN" 2>/dev/null | grep -i "v=spf1" | head -1 || true)
if [[ -z "$SPF" ]]; then
  echo -e "  $INFO Sem registro SPF"
else
  echo -e "  $INFO SPF: $SPF"
  if echo "$SPF" | grep -qE 'ip4:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'; then
    DIRECT_IPS=$(echo "$SPF" | grep -oE 'ip4:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?' | head -5)
    echo -e "  $WARN IPs diretos no SPF: $DIRECT_IPS — verificar se sao IPs do servidor de app"
    ((ISSUES++))
  else
    echo -e "  $PASS SPF nao contem IPs diretos"
  fi
fi

# =============================================================================
# Resumo Final
# =============================================================================
separator
echo -e "\n${BOLD}============= RESUMO DA AUDITORIA =============${RESET}"
echo -e "  Dominio: ${BOLD}$DOMAIN${RESET}"

if [[ $ISSUES -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}NENHUM PROBLEMA ENCONTRADO${RESET}"
else
  echo -e "  ${RED}${BOLD}$ISSUES PROBLEMA(S) ENCONTRADO(S) — revisar itens [FAIL]${RESET}"
fi

echo ""
echo -e "  ${BOLD}Acoes manuais obrigatorias:${RESET}"
echo -e "  1. Ativar proxy Cloudflare (nuvem laranja) no DNS"
echo -e "  2. Configurar TRUST_CLOUDFLARE_HEADERS=true no Render"
echo -e "  3. Historico DNS: https://securitytrails.com/domain/$DOMAIN/history/a"
echo -e "  4. Subdominios: https://crt.sh/?q=%.${DOMAIN}"
echo -e "  5. Reputacao IP: https://www.abuseipdb.com"
echo ""

exit $([[ $ISSUES -eq 0 ]] && echo 0 || echo 1)
