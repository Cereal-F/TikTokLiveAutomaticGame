# LIVE SURVIVORS

Jogo de sobrevivência 2D em visão de cima, feito para transmissões do **TikTok LIVE** e exibido pelo **OBS Studio**. Um personagem enfrenta ondas de monstros enquanto a audiência pode ajudar (curtidas curam, presentes ativam turbo) ou atrapalhar.

> **Estado atual:** protótipo jogável com **simulação local** de eventos. A integração com o TikTok LIVE real **ainda não foi implementada** (veja [Próximos passos](#próximos-passos-para-o-tiktok-live-real)).

---

## Requisitos (Windows)

- **Node.js 22 ou superior** (versão LTS). Baixe em https://nodejs.org. Confira no terminal com `node -v`.
- **OBS Studio** (opcional, para a transmissão).
- Um terminal: **PowerShell** ou **Prompt de Comando (cmd)**.

## Instalação

Dentro da pasta do projeto:

```powershell
npm install
```

## Comandos principais

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala as dependências (uma vez, ou após mudar o `package.json`). |
| `npm start` | Gera o build do jogo e do servidor e inicia tudo em `http://127.0.0.1:3000`. Use este para transmitir. |
| `npm test` | Roda os testes automatizados (Vitest). |
| `npm run typecheck` | Verifica os tipos TypeScript sem gerar arquivos. |
| `npm run build` | Gera o build do cliente (`dist/client`) e do servidor (`dist-server`). |
| `npm run dev` | Servidor de desenvolvimento do Vite, com recarregamento automático, em `http://127.0.0.1:5173`. |
| `npm run dev:server` | Compila e inicia o servidor local (porta 3000). Necessário junto com `npm run dev`. |

### Rodar para jogar ou transmitir

```powershell
npm start
```

Depois abra no navegador:

- **Jogo:** http://127.0.0.1:3000
- **Painel de simulação:** http://127.0.0.1:3000/admin

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

### Executar os testes

```powershell
npm test
```

## Configuração no OBS Studio

1. Adicione uma fonte **Navegador** (Browser Source).
2. URL: `http://127.0.0.1:3000`
3. Largura: `720`, Altura: `1280` (composição vertical, 9:16).
4. Mantenha o servidor rodando com `npm start` enquanto transmite.
5. Para controlar a simulação durante a live, abra o painel `http://127.0.0.1:3000/admin` em uma janela separada do navegador (não dentro do OBS).

## Controles do jogo

- **Mover:** `W A S D` ou as setas.
- **Ataque:** automático, no inimigo mais próximo.
- **Menu:** clique em **COMEÇAR** ou pressione `Enter`.

## Regras da partida

- Cada onda tem mais inimigos, mais vida e velocidade. A partida continua jogável nas ondas altas (há limites máximos).
- **Curtidas:** são agregadas a cada 250 ms. A cada 20 curtidas, o personagem recupera 10 de vida. Cada curtida também soma pontos.
- **Comentários:** somam 5 pontos e aparecem na tela.
- **Presentes:** somam pontos (igual ao valor em diamantes) e ativam o **turbo** de ataque por 6 segundos.
- Se a conexão com o servidor cair, a partida **continua**; o jogo só deixa de receber eventos da live.

## Painel de simulação

No painel `/admin` você pode:

- Enviar **curtidas**, **10 curtidas**, **comentários** e **presentes** fictícios.
- Ligar o **modo automático**, que gera eventos aleatórios no intervalo escolhido (300 ms a 10 s).

Os eventos simulados passam pelas mesmas validações e limites de um conector real.

## Configuração por variáveis de ambiente

Todas são opcionais.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor (1 a 65535). |
| `HOST` | `127.0.0.1` | Endereço de escuta. Veja o aviso de segurança abaixo. |
| `LIVE_PROVIDER` | `simulation` | `simulation` (eventos fictícios) ou `tiktok` (ainda não implementado). |
| `TIKTOK_USERNAME` | (vazio) | Nome de usuário da live, usado quando o conector real existir. |

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

- O servidor escuta apenas em `127.0.0.1` por padrão, ou seja, só o próprio computador acessa.
- **O painel não tem autenticação.** Qualquer cliente que consiga abrir o WebSocket pode enviar comandos de simulação. Por isso **não altere `HOST` para `0.0.0.0`** sem antes adicionar controle de acesso.
- Nenhum segredo, token ou credencial é usado ou enviado ao navegador. O jogo recebe apenas eventos já normalizados pelo servidor.
- As mensagens são validadas no servidor (tipo, tamanho, intervalo e caracteres de controle). Eventos repetidos são descartados pelo identificador, e a frequência de comandos e de eventos é limitada por usuário e globalmente.

## Estrutura do projeto

```
src/
  shared/          Tipos de eventos e protocolo WebSocket (usados por servidor e cliente)
  server/          Servidor Node.js
    live/          LiveProvider (interface), simulação e stub do conector TikTok
    pipeline/      Validação, deduplicação, rate limit e agregação de curtidas
    net/           Conexões WebSocket (papéis, comandos, heartbeat)
    http/          Arquivos estáticos (com proteção contra path traversal)
  game/            Jogo Phaser
    core/          Regras puras (ondas, pontuação, dano, alvos): testáveis sem Phaser
    entities/      Jogador, inimigos, projéteis
    scenes/        Menu, arena, fim de jogo
    ui/            HUD e botões
    net/           Ligação do jogo ao servidor
  client/net/     WebSocket com reconexão automática (usado pelo jogo e pelo painel)
  admin/           Painel de simulação
tests/             Testes automatizados (Vitest) das regras principais
index.html         Página do jogo
admin.html         Página do painel
```

A fonte de eventos é uma interface (`LiveProvider`). Hoje existem duas implementações:

1. **`SimulatedLiveProvider`**: eventos fictícios para testar o jogo sem uma live real.
2. **`TikTokLiveProvider`**: ponto de encaixe para o conector real. Ainda não emite eventos.

## Solução de problemas

- **"Arquivo não encontrado. Execute 'npm run build'..."**: rode `npm run build` ou use `npm start`, que faz o build antes.
- **"Live: sem conexão (o jogo continua)"**: o servidor não está rodando. Inicie com `npm start` ou `npm run dev:server`.
- **Porta em uso** (`EADDRINUSE`): outro programa usa a porta. Troque com `PORT`, como no exemplo acima.
- **`npm` não é reconhecido**: reinstale o Node.js e abra um novo terminal.
- **Tela preta no OBS**: confirme que `npm start` está rodando e que a URL é `http://127.0.0.1:3000`. Em seguida, clique com o botão direito na fonte e escolha **Atualizar**.

## Próximos passos para o TikTok LIVE real

Antes de implementar, é preciso verificar com cuidado:

1. **Documentação oficial do TikTok**: confirme se há uma API ou um evento oficial para receber curtidas, comentários e presentes de uma live por um aplicativo externo, e quais requisitos ela exige. Não presuma que esse acesso existe.
2. **Bibliotecas não oficiais** (por exemplo, conectores que leem o chat da live): antes de usar, verifique a **licença**, os **termos de uso do TikTok**, a estabilidade (esse tipo de conector pode quebrar a qualquer mudança do TikTok) e se é compatível com Node.js 22.
3. **Implementação**: criar uma classe que implementa `LiveProvider` em `src/server/live/TikTokLiveProvider.ts`, convertendo cada evento para o formato `LiveEvent` com um `id` estável (para a deduplicação funcionar). Os dados recebidos devem seguir pelo mesmo `EventPipeline`, sem atalhos.
4. **Testes**: cobrir a conversão de eventos com exemplos gravados (fixtures), sem depender de uma live ao vivo.
5. **Teste real**: começar com uma live de teste ou privada antes de transmitir ao público.

Enquanto isso, use `LIVE_PROVIDER=simulation` (padrão).
