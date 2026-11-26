# Aura Têxtil · Projeção de produção por turno com TensorFlow.js

> **O gestor da malharia não precisa esperar o turno acabar para saber se vai bater a meta.**
> Um modelo de machine learning treinado com dados reais de teares circulares projeta a produção do turno, minuto a minuto, com uma faixa de confiança que fecha conforme o turno avança.

![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.22-FF6F00?logo=tensorflow&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?logo=node.js&logoColor=white)
![Status](https://img.shields.io/badge/status-validado%20offline-blue)

---

## O problema

Em uma malharia, cada tear circular parado é produção perdida. Nos dados reais deste projeto, **os teares ficam parados 34% do tempo em média**.

A [Aura Têxtil](#sobre-a-aura-têxtil) já monitora os teares em tempo real com sensores IoT. Mas um cliente pediu algo além do monitoramento:

> *"Quero uma tela de metas por dia e por turno. Preciso saber, **durante** o turno, se vamos bater a meta."*

Saber no fim do turno que a meta não foi batida não ajuda ninguém. O valor está em saber **cedo o suficiente para agir**: remanejar um operador, priorizar a manutenção de um tear ou avisar o cliente final sobre o prazo.

## A solução

Um modelo de rede neural em **TensorFlow.js** que, a qualquer momento do turno, olha o que já aconteceu e prevê **o ritmo de produção do restante do turno**.

```
Projeção do turno = voltas já feitas + (ritmo previsto × minutos restantes)
```

Em vez de um número único (e falsamente preciso), a projeção vem com uma **faixa de confiança de 80%**, calibrada hora a hora:

```
Hora 2 do turno:  projeção 6.400 voltas  [faixa: 4.000 → 7.900]   meta: 6.500   ⚠️ incerto
Hora 5 do turno:  projeção 6.100 voltas  [faixa: 5.300 → 6.800]   meta: 6.500   🔴 provável que não bata
Hora 7 do turno:  projeção 6.050 voltas  [faixa: 5.820 → 6.215]   meta: 6.500   🔴 não bate
```

O modelo final tem só **1.057 parâmetros** (~4 KB) e roda **direto no navegador**, inclusive no celular, sem servidor de inferência e sem custo por requisição.

---

## Validação

Um modelo de ML só se justifica se for melhor que uma conta simples. Por isso, toda versão foi comparada com duas **baselines sem inteligência artificial**:

| Baseline | Como calcula | O que supõe |
|---|---|---|
| **Ingênua** | ritmo do turno até agora × tempo restante | que o turno vai seguir no mesmo ritmo |
| **Histórica** | ritmo médio do tear naquele turno (últimos 20 turnos) × tempo restante | que o resto do turno será "normal" |

### Os dados

| | |
|---|---|
| Período | março a outubro de 2026 |
| Teares monitorados | 7 teares circulares em produção real |
| Leituras | ~784 mil (1 por minuto, via sensor IoT) |
| Turnos válidos | 1.500 (turnos com menos de 90% de cobertura foram descartados) |
| Amostras | 46.469 (uma "foto" a cada 15 min de turno) |
| Validação | **temporal**: treino no passado, teste nos **últimos 30 dias** (7.843 amostras) |

A separação temporal é intencional. Um split aleatório deixaria o modelo "ver o futuro" durante o treino e inflaria os resultados. Aqui o teste simula o uso real: prever dias que o modelo nunca viu.

### Resultado: o modelo vence as duas baselines em 7 de 8 horas do turno

MAE = erro médio absoluto, em voltas e em % da produção média de um turno (6.364 voltas).

| Hora do turno | Modelo v3 | Ingênua | Histórica | Faixa de confiança 80% |
|---|---|---|---|---|
| 0–1h | **2.779** (43,7%) | 3.343 (52,5%) | 3.073 (48,3%) | −3.990 a +2.453 |
| 1–2h | **2.399** (37,7%) | 2.635 (41,4%) | 2.880 (45,2%) | −3.599 a +1.569 |
| 2–3h | **2.040** (32,1%) | 2.158 (33,9%) | 2.629 (41,3%) | −2.372 a +1.539 |
| 3–4h | 2.920 (45,9%) | 1.957 (30,7%) | **1.692** (26,6%) | −1.656 a +1.277 |
| 4–5h | **1.115** (17,5%) | 1.356 (21,3%) | 1.234 (19,4%) | −1.274 a +901 |
| 5–6h | **587** (9,2%) | 872 (13,7%) | 882 (13,9%) | −761 a +669 |
| 6–7h | **283** (4,4%) | 490 (7,7%) | 542 (8,5%) | −448 a +362 |
| 7–8h | **122** (1,9%) | 190 (3,0%) | 218 (3,4%) | −226 a +165 |

**Destaques**

- A partir da **5ª hora**, o erro fica **abaixo de 10%** da produção do turno.
- Na segunda metade do turno, o modelo erra **33% a 42% menos** que a conta ingênua.
- A faixa de confiança fecha de **±100%** na primeira hora para **±6%** na última. O gestor sabe exatamente o quanto pode confiar na projeção em cada momento.
- Os resultados são **reproduzíveis**: semente fixa, mesmo resultado em toda execução.

### A evolução até aqui

| Versão | O que mudou | Resultado |
|---|---|---|
| v1 | primeiro modelo; alvo = voltas restantes | 13% melhor que a ingênua, mas errava **3× mais** que ela no fim do turno |
| v2 | + ritmo histórico do tear como entrada | não melhorou |
| **v3** | alvo = **ritmo do restante** (voltas/min); semente fixa; faixa de confiança | **vence as duas baselines em 7 de 8 horas** |

A virada da v3 foi uma decisão de modelagem, não de arquitetura: em vez de prever *quantas voltas faltam*, o modelo prevê *em que ritmo o tear vai rodar*. Multiplicado pelos minutos restantes, a projeção converge naturalmente para o valor exato no fim do turno.

### O que os dados ensinaram

- **O começo do turno é imprevisível por natureza.** Paradas são eventos aleatórios, e nenhum método erra menos de ~44% da produção do turno na primeira hora. Por isso a tela mostra uma faixa, não um número.
- **O modelo é otimista.** Em todas as horas, a faixa é maior para baixo que para cima: a produção real tende a ficar abaixo da prevista. A faixa assimétrica corrige isso.
- **Fim de semana não é falha de captação.** Os turnos sem dados se concentram no sábado (33%) e no domingo (60%), quando a malharia não roda. Nos dias úteis, só 10–13%.

---

## Como funciona

```
 Sensor IoT (ESP32)          Dump MySQL            diagnostico.js
 1 leitura/min/tear   ──▶    monitoring.csv   ──▶  qualidade dos dados
                                    │
                                    ▼
                              prepare.js
                   agrupa por tear + turno, descarta turnos
                   incompletos, gera uma amostra a cada 15 min
                                    │
                                    ▼
                               train.js
                  treina, compara com as baselines, calcula
                  a faixa de confiança e salva o modelo
                                    │
                                    ▼
                  modelo_v3/  ──▶  PWA (navegador / celular)
```

### Entradas do modelo (17 features)

| Feature | Por que importa |
|---|---|
| % do turno decorrido | onde estamos no turno |
| voltas feitas até agora | produção acumulada |
| % do tempo parado até agora | o turno está sendo bom ou ruim? |
| ritmo da última hora | tendência recente |
| dia da semana | padrões semanais |
| ritmo histórico do tear neste turno | o "normal" desse tear |
| projeção histórica do restante | ritmo histórico × tempo restante |
| turno (one-hot, 3) | manhã, tarde e noite se comportam diferente |
| tear (one-hot, 7) | cada tear tem seu perfil |

O ritmo histórico é calculado **apenas com turnos anteriores**, sem vazamento de dados futuros.

### Arquitetura

```
Entrada (17) → Dense 32 (ReLU) → Dense 16 (ReLU) → Dense 1
Adam (lr 0,001) · perda MSE · early stopping · ~1 mil parâmetros
```

Simples de propósito: com dados ruidosos de chão de fábrica, uma rede pequena generaliza melhor e cabe em qualquer navegador.

---

## Como rodar

**Requisitos:** Node.js 20+ (testado em MacBook M1).

```bash
git clone <url-deste-repositorio>
cd aura-machine-learning
npm install
```

Coloque o arquivo de leituras em `dados/monitoring.csv`:

```csv
tear_id,timestamp,voltas
17,2026-03-20 05:01:00,24
17,2026-03-20 05:02:00,25
```

> `voltas` = voltas daquele minuto (não acumulado). `voltas = 0` significa tear parado.

Ajuste os horários dos turnos no topo de `prepare.js` e `diagnostico.js`, e rode:

```bash
node diagnostico.js   # raio-x da qualidade dos dados
node prepare.js       # gera dados/dataset.json
node train.js         # treina, avalia e salva em modelo_v3/
```

> Os dados de leitura e os modelos treinados não fazem parte do repositório (veja o `.gitignore`). Os resultados de validação deste README vêm de dados reais de produção, que são mantidos privados.

### Usando o modelo no navegador

O modelo treinado **não é distribuído** neste repositório, porque foi treinado com dados de produção de um cliente. Rode `node train.js` com os seus próprios dados para gerar a pasta `modelo_v3/` e sirva os arquivos dela junto com a sua aplicação:

```javascript
import * as tf from '@tensorflow/tfjs';

const modelo = await tf.loadLayersModel('/modelo_v3/model.json');
const { media, desvio, escalaY } = await (await fetch('/modelo_v3/normalizacao.json')).json();
const faixas = await (await fetch('/modelo_v3/faixas.json')).json();

const xNorm = features.map((v, i) => (v - media[i]) / desvio[i]);
const ritmo = (await modelo.predict(tf.tensor2d([xNorm])).data())[0] * escalaY;

const projecao = feito + ritmo * minutosRestantes;
const f = faixas[Math.floor(minutosDecorridos / 60)];
console.log(`Projeção: ${projecao} [${projecao + f.p10} → ${projecao + f.p90}]`);
```

### Por que `@tensorflow/tfjs` e não `tfjs-node`?

O `tfjs-node` não tem binário pronto para Apple Silicon e falha ao compilar. Para um dataset deste tamanho, o TF.js puro treina em poucos minutos, roda igual em qualquer máquina e gera um modelo idêntico ao que o navegador carrega.

---

## Decisões de projeto

**Por que não usar a IA embarcada do Chrome (Gemini Nano)?**
Ela foi avaliada primeiro: roda no navegador, sem custo e sem mandar dados para fora. Mas não tem suporte oficial a português, exige GPU com mais de 4 GB ou 16 GB de RAM, e não funciona no celular, que é onde o gestor de chão de fábrica está.

**Por que um modelo próprio em vez de um LLM?**
A pergunta do gestor ("vou bater a meta?") é numérica. Um modelo de regressão pequeno, treinado nos dados do próprio cliente, responde isso com precisão medida, roda offline e custa zero por consulta.

---

## Limitações conhecidas

Transparência sobre o que ainda não está resolvido:

- **Anomalia na hora 3–4.** É a única faixa em que o modelo perde para as baselines. Poucas amostras com erro muito alto puxam a média para cima e estão sendo investigadas.
- **A faixa de confiança foi calibrada no próprio período de teste.** Deve ser recalibrada conforme chegarem dados novos.
- **O modelo não conhece paradas programadas** (refeição, troca de ordem de produção). É a próxima feature candidata.
- **Base de 7 teares de uma mesma operação.** A generalização para outras malharias ainda precisa ser validada.

## Próximos passos

- [ ] Investigar e corrigir a anomalia da hora 3–4
- [ ] Integrar ao PWA da Aura: projeção recalculada a cada leitura via WebSocket
- [ ] Tela de metas: meta × projeção × faixa de confiança, por tear e por turno
- [ ] Retreinar com dados mais recentes e recalibrar a faixa
- [ ] Adicionar paradas programadas como entrada do modelo

---

## Estrutura

```
.
├── diagnostico.js     # análise de qualidade e cobertura dos dados
├── prepare.js         # CSV bruto → amostras de treino (dataset.json)
├── train.js           # treino, avaliação contra baselines, faixa de confiança
├── dados/             # (não versionado) leituras brutas e dataset gerado
└── modelo_v3/         # (não versionado) gerado localmente por node train.js
    ├── model.json         # topologia da rede
    ├── weights.bin        # pesos (~4 KB)
    ├── normalizacao.json  # média, desvio e escala usados no treino
    └── faixas.json        # faixa de confiança de 80% por hora do turno
```

## Sobre a Aura Têxtil

A **Aura Têxtil** é uma startup de dados para indústria têxtil em Jaraguá do Sul (SC). Sensores instalados em cada tear enviam a produção minuto a minuto para um painel web, e o gestor passa a enxergar tempo parado, ritmo e produção sem depender de anotação manual.

Este repositório é um experimento aberto de como transformar esses dados em **previsão**, e não só em visualização.

---

<sub>Feito por Kanydian Esteves · CEO da Aura Têxtil</sub>
