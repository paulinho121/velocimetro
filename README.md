# VELOX — Velocímetro GPS

Velocímetro digital por GPS com alerta de lombadas e radares. Roda inteiramente
no navegador: sem servidor, sem banco, sem chave de API.

- Velocidade, distância, altitude, bússola e histórico de viagens
- Modo velocímetro em tela cheia, pensado para suporte de carro
- Alerta de lombadas e radares à frente, com o limite do radar
- Mapa com ruas, trajeto em tempo real, lombadas, radares e radar de chuva
- Navegação até um destino: busca de endereço ou toque no mapa, rota desenhada,
  instruções curva a curva por voz, recálculo ao sair da rota e aviso de chegada
- Nome da rua atual e viagens nomeadas no histórico ("Aldeota → Centro")
- Clima e aviso de chuva para a próxima hora
- Instalável como PWA

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em <http://localhost:3000>.

### Testando o GPS no celular

Navegadores só liberam a Geolocation API em contexto seguro. Abrir pelo IP da
rede local em `http://` **não funciona** — o GPS fica indisponível. Para testar
no celular, suba com HTTPS:

```bash
npm run dev:https
```

Depois acesse `https://<ip-da-maquina>:3000` no celular e aceite o aviso de
certificado autoassinado.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento na porta 3000 |
| `npm run dev:https` | Idem, com HTTPS autoassinado (necessário para GPS no celular) |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run lint` | Checagem de tipos (`tsc --noEmit`) |

## Deploy na Vercel

O projeto já vem com `vercel.json` configurado (framework Vite, `npm ci`,
saída em `dist/`, cache dos assets com hash e `Permissions-Policy` liberando
geolocalização para a própria origem).

**Nenhuma variável de ambiente é necessária.**

Pelo painel: importe o repositório em <https://vercel.com/new>. A Vercel lê o
`vercel.json` e não é preciso mexer em nada.

Pela CLI:

```bash
npx vercel --prod
```

> **Importante:** o `bun.lock` foi removido do repositório. A Vercel dá
> prioridade a ele sobre o `package-lock.json`, e o arquivo estava
> desatualizado — o build falhava por dependência ausente. O projeto usa npm.

## Origem dos dados

Lombadas, radares e limites vêm do [OpenStreetMap](https://www.openstreetmap.org/)
via [Overpass API](https://overpass-api.de/), sob licença
[ODbL](https://opendatacommons.org/licenses/odbl/).

As consultas são cacheadas no dispositivo por célula de ~5,5 km, com validade de
uma semana, porque as instâncias públicas do Overpass são limitadas por IP e não
toleram polling.

Rua, clima e radar de chuva vêm de APIs públicas e gratuitas, sem chave (todas
podem ser desligadas nas Configurações):

| Recurso | Serviço | O que sai do celular |
| --- | --- | --- |
| Nome da rua e das viagens | [Nominatim](https://nominatim.org/) (OpenStreetMap) | A posição, no máximo a cada 15 s e 150 m; respostas ficam em cache |
| Clima e aviso de chuva | [Open-Meteo](https://open-meteo.com/) (uso não comercial) | Só uma área aproximada (~11 km), a cada 15 min |
| Busca de destino | [Nominatim](https://nominatim.org/) (OpenStreetMap) | O texto buscado e uma área de ~30 km em volta, só quando você busca |
| Rota até o destino | [OSRM da FOSSGIS](https://routing.openstreetmap.de/) (OpenStreetMap) | A posição e o destino, ao iniciar e ao sair da rota |
| Radar de chuva no mapa | [RainViewer](https://www.rainviewer.com/api.html) | Nada além dos quadrados do mapa visíveis |

O mapa de fundo vem do [OpenFreeMap](https://openfreemap.org/) (também dados do
OpenStreetMap), gratuito e sem chave. Sem internet, a aba Mapa mostra só o
rastro do GPS.

Os dados são colaborativos e podem estar incompletos ou desatualizados. O app é
informativo e **não substitui a sinalização da via**.
