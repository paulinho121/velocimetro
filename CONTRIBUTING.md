# Como contribuir com o VELOX

Obrigado pelo interesse! Toda contribuição é bem-vinda: correção de bug, nova
funcionalidade, melhoria de texto, testes ou documentação.

## Antes de começar

- **Bugs e ideias:** abra uma [issue](https://github.com/paulinho121/velocimetro/issues/new/choose)
  antes de escrever código grande. Assim a gente combina a abordagem e ninguém
  perde tempo.
- **Tarefas para iniciantes:** procure issues com a etiqueta
  `good first issue`.
- Seja respeitoso — veja o [Código de Conduta](CODE_OF_CONDUCT.md).

## Preparando o ambiente

Requisitos: **Node.js 22** e **npm** (o projeto não usa yarn, pnpm nem bun).

```bash
# 1. Faça um fork no GitHub e clone o seu fork
git clone https://github.com/<seu-usuario>/velocimetro.git
cd velocimetro

# 2. Aponte para o repositório original, para puxar atualizações
git remote add upstream https://github.com/paulinho121/velocimetro.git

# 3. Instale e rode
npm install
npm run dev
```

Para testar o GPS no celular use `npm run dev:https` (detalhes no
[README](README.md#testando-o-gps-no-celular)).

## Fluxo de trabalho

1. Atualize sua `main`: `git fetch upstream && git rebase upstream/main`
2. Crie uma branch com nome descritivo:
   - `feat/alerta-sonoro-radar`
   - `fix/velocidade-negativa`
   - `docs/instalacao-pwa`
3. Faça commits pequenos e com mensagem clara, no imperativo e em português
   (ex.: `Corrige contagem de distância com GPS impreciso`).
4. Antes de enviar, rode localmente:

   ```bash
   npm run lint   # checagem de tipos
   npm test       # testes
   npm run build  # build de produção
   ```

5. Faça push para o seu fork e abra um Pull Request para a `main` daqui,
   preenchendo o template.

O CI roda esses mesmos três comandos em todo PR. PR com CI vermelho não é
mesclado.

## Organização do código

| Pasta | Conteúdo |
| --- | --- |
| `src/pages/` | Telas (velocímetro, viagem, mapa, histórico, ajustes) |
| `src/components/` | Componentes reutilizáveis |
| `src/contexts/` | Estado global: GPS, viagem, alertas, configurações |
| `src/hooks/` | Hooks React (velocidade animada, relógio, wake lock) |
| `src/services/` | Acesso a dados externos (Overpass) e armazenamento local |
| `src/utils/` | Lógica pura: geometria, cálculo de viagem, alertas |
| `src/types/` | Tipos compartilhados |

## Padrões

- **TypeScript** em tudo; evite `any`.
- **Lógica pura vai para `src/utils/`** e ganha teste ao lado
  (`arquivo.test.ts`). Testes que precisam de DOM usam o sufixo `.dom.test.ts`.
- **Mudou comportamento? Adicione ou ajuste o teste.** Correção de bug idealmente
  vem com um teste que falhava antes.
- Estilo com **Tailwind**; siga o visual das telas existentes.
- Textos da interface em **português do Brasil**.
- **Sem servidor e sem chave de API:** o app roda 100% no navegador. Propostas
  que mudem isso precisam ser discutidas numa issue antes.
- **Respeite a Overpass API:** nada de polling; use o cache existente em
  `src/services/roadData.ts`.

## Pull Requests

- Um PR = um assunto. PRs menores são revisados mais rápido.
- Descreva o que mudou e **como testar**. Para mudanças visuais, anexe print ou
  vídeo.
- Se o PR fecha uma issue, escreva `Closes #123` na descrição.
- Pelo menos uma aprovação de mantenedor é necessária para mesclar.

## Licença

Ao contribuir, você concorda que seu código será distribuído sob a
[licença MIT](LICENSE) do projeto.
