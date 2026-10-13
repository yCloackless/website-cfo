# 🚒 Extensão de Navegador — CFO CBMERJ (Cronômetro & Nivelamento)

Extensão oficial e tática desenvolvida em **Manifest V3** para os navegadores Google Chrome, Microsoft Edge, Brave e Opera.

Permite estudar em qualquer site ou PDF na web mantendo seu **Cronômetro de Estudos** e sua **Bateria de Nivelamento (meta de 80%)** sincronizados em tempo real com a plataforma CFO CBMERJ.

---

## ⚡ Como Instalar no Navegador (Menos de 1 Minuto)

1. Abra seu navegador (Chrome, Edge ou Brave).
2. Acesse a tela de extensões:
   - No Chrome: digite `chrome://extensions/` na barra de endereços.
   - No Edge: digite `edge://extensions/`.
3. No canto superior direito, ative a chave **"Modo do desenvolvedor"** (*Developer mode*).
4. Clique no botão **"Carregar sem compactação"** (*Load unpacked*).
5. Selecione a pasta `extension/` deste projeto:
   `c:\Users\renas\Downloads\cronograma-de-estudos-cfo-cbmerj\extension`
6. Pronto! O ícone 🚒 do CFO CBMERJ aparecerá na barra de ferramentas do seu navegador. Fixe-o para facilitar o acesso.

---

## 🔗 Como Vincular com a sua Conta na Plataforma

1. No site da plataforma **CFO CBMERJ**, observe o cabeçalho superior (Topbar).
2. Clique no ícone de peça de quebra-cabeça (**🧩**): seu token de sessão pessoal será copiado automaticamente.
3. Abra a extensão no navegador e clique na aba **"Conexão" (⚙️)**.
4. A URL da plataforma já vem pré-configurada como `https://cfo-oficial-agorasim.onrender.com`.
5. Cole a sua chave no campo **Token de Acesso** e clique em **"🔗 Salvar e Conectar"**.
6. O badge no topo mudará para `● Conectado` (verde).

---

## 🎯 Funcionalidades Ativas

### 1. ⏱️ Cronômetro Tático de Estudos (Cloud Timer)
- **Execução em Segundo Plano**: Continua contando mesmo que você feche a janelinha da extensão ou mude de aba.
- **Badge Dinâmico**: Mostra `ON` em verde no ícone da extensão enquanto o cronômetro estiver rodando.
- **Salvar no Site**: Um clique no botão `💾 Salvar no Site` registra as horas líquidas no seu histórico oficial de estudos da plataforma.

### 2. 🎯 Nivelamento & Marcador de Questões (80%)
- **Nivelamento contínuo**: a questão é numerada sem reiniciar; os cinco quadrados mostram a janela móvel das respostas recentes (verde para acerto, vermelho com X para erro). A conquista aparece quando uma janela atinge 4/5 (80%) ou 5/5 (100%).
- **Sem tela de reprovação**: quando a janela ainda não alcança 80%, o aluno segue respondendo; os quadrados avançam sem reset visual para 0/5.
- **Conquista única**: troféu animado com confetes discretos; movimento reduzido do sistema é respeitado. A exibição fica registrada e não se repete ao reabrir.
- **Retomada durável**: cada resposta é salva em `chrome.storage.local` antes de avançar. A bateria, posição e respostas são restauradas ao reabrir; o histórico fica preservado após a aprovação.
- **Sincronização isolada**: o estado da extensão é sincronizado em separado do nivelamento web, com revisões para rejeitar gravações antigas.

> A extensão atualmente registra o resultado informado nos botões “Certa” e “Errada”; ela não carrega enunciados nem alternativas de um banco de questões.
