# LIVE SURVIVORS

Jogo de sobrevivência 2D em visão de cima, feito para transmissões automáticas no **TikTok LIVE Studio**. O personagem joga sozinho (piloto automático) enquanto a audiência interage: curtidas curam, comentários pontuam e **presentes ativam poderes**, mais fortes quanto mais caro o presente. O jogo reinicia sozinho após cada derrota e guarda o **recorde de ondas**.

> **Estado atual:** o jogo lê eventos reais de uma live pelo **TikFinity** (WebSocket local) ou usa **simulação local**. A conexão foi escrita, mas **ainda não foi testada com uma live real**; veja [Verificação pendente](#verificação-pendente).

---

## Requisitos (Windows)

- **Node.js 22 ou superior** (versão LTS). Baixe em https://nodejs.org. Confira com `node -v`.
- **TikTok LIVE Studio** para a transmissão.
- Um navegador **Google Chrome** ou **Microsoft Edge** (para exibir o jogo em janela própria).

## Instalação

Dentro da pasta do projeto:

```powershell
npm install
```

## Comandos principais

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala as dependências (uma vez, ou após mudar o `package.json`). |
| `npm start` | Gera o build e inicia o servidor em `http://127.0.0.1:3000`. Use este para transmitir. |
| `npm test` | Roda os testes automatizados (Vitest). |
| `npm run typecheck` | Verifica os tipos TypeScript sem gerar arquivos. |
| `npm run build` | Gera o build do cliente (`dist/client`) e do servidor (`dist-server`). |
| `npm run dev` | Servidor de desenvolvimento do Vite (recarrega sozinho), em `http://127.0.0.1:5173`. |
| `npm run dev:server` | Compila e inicia o servidor local (porta 3000). Use junto com `npm run dev`. |

### Rodar para transmitir

```powershell
npm start
```

- **Jogo:** http://127.0.0.1:3000
- **Painel de simulação:** http://127.0.0.1:3000/admin (use em outra janela, fora da transmissão)

### Rodar em modo de desenvolvimento

Abra **dois** terminais na pasta do projeto:

```powershell
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev
```

- **Jogo:** http://127.0.0.1:5173
- **Painel:** http://127.0.0.1:5173/admin.html

## Configuração no TikTok LIVE Studio

O jogo é uma página web. Para aparecer na transmissão:

1. Deixe o servidor rodando com `npm start`.
2. Abra o jogo em uma janela própria do navegador, sem barra de endereço, com um destes comandos (ajuste o caminho se o navegador estiver em outra pasta):

   ```powershell
   # Google Chrome
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:3000

   # Microsoft Edge
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3000
   ```

3. No **TikTok LIVE Studio**, adicione uma fonte de **captura de janela** (ou de jogo) e escolha essa janela. Confirme que a proporção fica vertical (720×1280) e que a tela aparece por completo.
4. Abra o painel `/admin` em outra janela, para simular ou acompanhar eventos (ele não deve aparecer na transmissão).

> **Atenção:** não confirmei se o TikTok LIVE Studio oferece fonte de "navegador" por URL. Por isso o passo 3 usa captura de janela. Teste a captura antes de transmitir ao público.

## Ligação com o TikFinity

O TikFinity recebe os eventos da live e os publica num WebSocket local. O jogo se conecta a esse WebSocket e lê:

- **chat** → comentários (pontuam);
- **like** → curtidas (curam);
- **gift** → presentes (valem diamantes e ativam poderes).

Eventos como `follow`, `share`, `roomUser` e `subscribe` são recebidos, mas não afetam o jogo.

Passos:

1. Abra o **TikFinity** e conecte-o à sua live (ou ao modo de teste dele).
2. Confirme a porta do WebSocket local do TikFinity. O padrão é `21213`, o mesmo do exemplo fornecido.
3. Inicie o jogo com o provedor do TikFinity.

```powershell
# PowerShell
$env:LIVE_PROVIDER = "tikfinity"; npm start
```

```bat
:: Prompt de Comando (cmd)
set LIVE_PROVIDER=tikfinity && npm start
```

4. Abra o painel `/admin`: o estado do provedor deve mostrar **conectado**. Se o TikFinity fechar ou ainda não estiver aberto, o jogo mostra a queda e tenta reconectar sozinho a cada poucos segundos.

**Presentes em sequência** (combo) são somados e aparecem **uma única vez**, com o total de diamantes, quando a sequência termina. Se o fim não chegar, a sequência é concluída após 4 segundos sem novas mensagens.

Com `LIVE_PROVIDER=tikfinity`, o painel de simulação fica desativado.

## Como a partida funciona

- **Automática:** o personagem se move sozinho (foge de inimigos muito próximos, circula os que estão no alcance de ataque e se afasta das bordas). Não há controles.
- **Reinício automático:** ao perder, a tela mostra o resumo e a próxima partida começa em 6 segundos.
- **Ondas:** cada onda tem mais inimigos, mais vida e velocidade. As ondas altas são limitadas para continuar jogáveis.
- **Recorde:** a maior onda alcançada é guardada pelo servidor em `data/records.json` e aparece no topo da tela. Ao superar o recorde, aparece "NOVO RECORDE!".

### Presentes e poderes

O poder depende do **valor em diamantes**, não do nome do presente. Presentes mais caros ativam poderes mais fortes; cada presente ativa o seu poder de maior nível alcançado:

| Diamantes | Poder | Efeito |
| --- | --- | --- |
| 1 a 19 | **TURBO** | Ataque 60% mais rápido e dano maior por 6 s. |
| 20 a 99 | **ESCUDO** | Invulnerável a dano por 5 s. |
| 100 a 499 | **NOVA** | Explosão em volta do personagem: 4 de dano em todos os inimigos num raio de 260 px. |
| 500 ou mais | **TEMPESTADE** | 6 de dano em **todos** os inimigos da tela, +25 de vida e turbo por 8 s. |

Outras interações:

- **Curtidas** são agregadas a cada 250 ms. A cada 20 curtidas o personagem recupera 10 de vida.
- **Comentários** somam 5 pontos e aparecem no feed.
- Os **presentes** aparecem no feed da tela (com cor pelo nível do poder) e somam pontos pelo valor em diamantes.
- O **TOP 3 PRESENTES** (canto superior direito) mostra quem mais enviou diamantes desde que o servidor foi iniciado (ou desde que o ranking foi zerado no painel).
- Se a conexão com o servidor cair, a partida **continua**; só deixam de chegar eventos da live.

## Painel de simulação (`/admin`)

- **Eventos:** curtida, 10 curtidas, comentário.
- **Presentes por valor:** botões de 1, 20, 100 e 500 diamantes, um para cada poder.
- **Modo automático:** gera eventos aleatórios no intervalo escolhido (300 ms a 10 s). Presentes baratos são mais comuns.
- **Zerar top 3 de presentes:** limpa o ranking (útil ao começar uma nova live).

Os eventos simulados passam pelas mesmas validações e limites de um conector real.

## Recorde de ondas

- O recorde fica em `data/records.json`, fora do código e ignorado pelo git.
- Para **zerar o recorde**, pare o servidor (`Ctrl+C`), apague esse arquivo e inicie de novo.
- O recorde é informado pela própria página do jogo, então vale a honra: o servidor só valida que a onda é um número entre 1 e 999.

## Configuração por variáveis de ambiente

Todas são opcionais.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor (1 a 65535). |
| `HOST` | `127.0.0.1` | Endereço de escuta. Veja o aviso de segurança abaixo. |
| `LIVE_PROVIDER` | `simulation` | `simulation` (eventos fictícios) ou `tikfinity` (eventos da live pelo TikFinity). |
| `TIKFINITY_URL` | `ws://localhost:21213/` | WebSocket local do TikFinity. Só aceita `ws://` para `localhost`, `127.0.0.1` ou `[::1]`. |

Exemplos no Windows:

```powershell
# PowerShell
$env:PORT = "3001"; npm start
```

```bat
:: Prompt de Comando (cmd)
set PORT=3001 && npm start
```

## Segurança

- O servidor escuta apenas em `127.0.0.1` por padrão: só o próprio computador acessa.
- **O painel não tem autenticação.** Qualquer cliente que consiga abrir o WebSocket pode enviar comandos de simulação e zerar o ranking. Por isso **não altere `HOST` para `0.0.0.0`** sem antes adicionar controle de acesso.
- Nenhum segredo, token ou credencial é usado ou enviado ao navegador.
- As mensagens são validadas no servidor (tipo, tamanho, intervalo e caracteres de controle). Eventos repetidos são descartados pelo identificador, e a frequência de comandos e de eventos é limitada por usuário e globalmente.

## Estrutura do projeto

```
src/
  shared/          Tipos de eventos e protocolo WebSocket (usados por servidor e cliente)
  server/          Servidor Node.js
    live/          LiveProvider (interface), simulação e conector TikFinity (WebSocket local)
      tikfinity/   Tradução das mensagens do TikFinity e soma de presentes em sequência
    pipeline/      Validação, deduplicação, rate limit, agregação de curtidas e ranking de presentes
    records/       Recorde de ondas salvo em arquivo
    net/           Conexões WebSocket (papéis, comandos, heartbeat)
    http/          Arquivos estáticos (com proteção contra path traversal)
  game/            Jogo Phaser
    core/          Regras puras, testáveis sem Phaser: ondas, sessão, poderes, piloto automático
    entities/      Personagem, inimigos, projéteis
    scenes/        Arena e fim de jogo (com reinício automático)
    ui/            HUD (vida, recorde, efeitos, top 3, feed de presentes)
    net/           Ligação do jogo ao servidor
  client/net/      WebSocket com reconexão automática (usado pelo jogo e pelo painel)
  admin/           Painel de simulação
tests/             Testes automatizados (Vitest) das regras principais
data/              Recorde de ondas (gerado em tempo de execução)
index.html         Página do jogo
admin.html         Página do painel
```

A fonte de eventos é uma interface (`LiveProvider`). Hoje existem duas implementações:

1. **`SimulatedLiveProvider`** (`LIVE_PROVIDER=simulation`): eventos fictícios para testar o jogo sem uma live real.
2. **`TikFinityLiveProvider`** (`LIVE_PROVIDER=tikfinity`): lê o WebSocket local do TikFinity e entrega os eventos brutos ao mesmo pipeline de validação.

## Solução de problemas

- **"Arquivo não encontrado. Execute 'npm run build'..."**: rode `npm run build` ou use `npm start`, que faz o build antes.
- **"Live: sem conexão (o jogo continua)"**: o servidor não está rodando. Inicie com `npm start`.
- **TikFinity "desconectado" no painel**: o TikFinity não está aberto, a live não está conectada nele, ou a porta de `TIKFINITY_URL` está errada.
- **Porta em uso** (`EADDRINUSE`): outro programa usa a porta. Troque com `PORT`.
- **`npm` não é reconhecido**: reinstale o Node.js e abra um novo terminal.
- **Tela preta na transmissão**: confirme que `npm start` está rodando e que a janela do navegador abriu em `http://127.0.0.1:3000`. Reabra a janela e atualize a fonte de captura no LIVE Studio.

## Verificação pendente

Antes de usar em transmissão pública, confirme estes pontos. Nenhum deles foi testado com uma live real:

1. **Nomes dos campos do TikFinity**: a leitura usa `uniqueId`, `nickname`, `comment`, `likeCount`, `giftName`, `diamondCount`, `repeatCount`, `repeatEnd`, `giftType` e `msgId`, seguindo o TikTok-Live-Connector. Os testes usam exemplos montados à mão, não mensagens gravadas do TikFinity. Abra o exemplo do TikFinity (`index.html` + `script.js`) durante uma live e compare o formato real.
2. **Presentes em sequência**: o jogo assume que `giftType === 1` marca presentes em sequência e que `repeatCount` é o total acumulado. Se o TikFinity enviar outro formato, a soma pode ficar errada.
3. **Captura no LIVE Studio**: não confirmei se o TikTok LIVE Studio aceita fonte de navegador por URL. Por isso a instrução usa captura de janela.
4. **Termos do TikFinity**: o TikFinity é uma ferramenta de terceiros. Confira os termos de uso e a licença dela antes de transmitir ao público.
5. **Teste real**: comece com uma live privada ou de teste.
