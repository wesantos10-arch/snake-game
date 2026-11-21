# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Jogo da cobrinha (Snake) clássico em HTML, CSS e JavaScript puro, sem dependências e sem build. Os requisitos estão em `.llm/prd.md`. Textos da interface e respostas em português.

## Como rodar

Abra `index.html` direto no navegador (ou sirva a pasta, por exemplo com `npx serve .`). Não há lint nem suíte de testes no repositório. Para checar a sintaxe: `node --check game.js`.

## Arquitetura

- `index.html`: HUD (pontos, recorde, nível, estado das paredes), o `<canvas id="game">` 400×400 dentro de `#board`, o `#toast` de aviso de nível, o `#overlay` usado nas telas de início, pausa e fim, e o `#pause-btn` (único jeito de pausar pelo toque).
- `style.css`: tema escuro definido por variáveis em `:root`. `game.js` lê as cores do canvas dessas variáveis em `readColors()`, então mudar a paleta no CSS muda também o desenho.
- `game.js`: um único objeto `state` guarda tudo. `state.phase` é `start | playing | paused | over`.
  - Loop: `scheduleTick()` encadeia `setTimeout(step, speedFor(level))`, e `step()` chama `tick()` (regras) e depois `render()` (desenho). A velocidade muda sozinha porque cada passo agenda o próximo com o intervalo do nível atual.
  - Entrada: as viradas entram em `state.dirQueue` (máximo 2), e `tick()` consome uma por passo. Inversões de 180° são descartadas em `queueDirection()`.
  - Desenho: `resizeCanvas()` ajusta o canvas ao tamanho exibido × `devicePixelRatio` e refaz `gridLayer` (fundo e grade num canvas fora da tela). `render()` copia essa camada e desenha comida e cobra em coordenadas lógicas 400×400 via `setTransform`.
  - `updateHud()` só escreve no DOM quando o texto muda (o HUD é `aria-live`).
  - Teclado: atalhos com Ctrl/Alt/Meta são ignorados, e repetições de tecla segurada não disparam Espaço/Enter/P/Esc.
  - Na colisão com o corpo, a cauda é ignorada quando a cobra não está comendo, porque ela sai do lugar no mesmo passo.

## Regras do jogo (constantes no topo de `game.js`)

- 10 pontos por comida. O nível sobe a cada 5 comidas (`levelFor`), até o nível 10.
- Velocidade: `speedFor(level) = max(60, 150 - (level-1)*10)` ms por passo.
- Paredes: até o nível 5 (`WRAP_MAX_LEVEL`) a cobra atravessa para o lado oposto. A partir do nível 6, bater na parede encerra o jogo, e a borda de `#board` ganha a classe `danger`.
- Recorde: salvo em `localStorage`, chave `snake.highScore`, atualizado assim que é superado. O acesso é protegido por `try/catch`; sem armazenamento, o recorde vale só na sessão (em `state.high`).
