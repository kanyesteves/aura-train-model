# Aura Têxtil — Modelo de projeção de turno (TensorFlow.js)

Nov 25, 2026 · @Kanydian

Resumo da sessão, organizado para virar roteiro de vídeo.

## 1. O problema

Um cliente pediu uma **tela de metas por dia e turno**. O gestor quer saber, ainda durante o turno, se a produção vai bater a meta.

## 2. Os caminhos que testamos e descartamos

**IA embarcada no Chrome (Gemini Nano).** Roda no navegador, sem custo e sem mandar dados para fora. Descartamos por três motivos:

- não tem suporte oficial a português;
- exige um PC parrudo: GPU com mais de 4 GB ou 16 GB de RAM;
- não funciona no celular.

**Detecção de falha de sensor com ML.** Também descartada: o foco passou a ser uma ferramenta que o gestor usa no dia a dia.

**Escolha final:** um modelo de **TensorFlow.js** que projeta a produção do turno.

## 3. Como treinamos o modelo

- **Dados:** um dump de março a outubro de 2026, com 7 teares, cerca de 780 mil leituras (uma por minuto), 1.500 turnos válidos e 46 mil amostras de treino.
- **Ambiente:** MacBook M1 com `@tensorflow/tfjs` puro. O `tfjs-node` não instala no M1, e esse foi o primeiro obstáculo.
- **A ideia:** a cada 15 minutos do turno, o modelo olha o que já foi produzido e prevê o ritmo do restante do turno.
- **Teste honesto:** treinamos com o passado e testamos nos últimos 30 dias, comparando o modelo com duas contas simples:
  - **ingênua:** ritmo atual × tempo restante;
  - **histórica:** ritmo médio do tear naquele turno.

## 4. Os resultados, versão por versão

| Versão | O que mudou | Resultado |
| --- | --- | --- |
| v1 | primeiro modelo | 13% melhor que a ingênua, mas errava muito no fim do turno |
| v2 | + ritmo histórico do tear | não melhorou |
| **v3** | alvo passou a ser o ritmo do restante + semente fixa + faixa de confiança | **vence as duas contas simples em 7 de 8 horas** |

**Os números da v3:**

- Erro no fim do turno: **1,9%**, contra 3,0% da conta simples.
- A partir da 5ª hora do turno, o erro fica **abaixo de 10%**.
- Faixa de confiança de 80%: começa em ±100% na 1ª hora e fecha em ±6% na última.

## 5. Descobertas que valem o vídeo

- **34% do tempo dos teares é parado**, em média. É um dado forte para mostrar o valor da Aura.
- **O começo do turno é imprevisível** para qualquer método, porque paradas são aleatórias. Por isso a tela vai mostrar uma **faixa**, e não um número só.
- **O modelo é otimista:** a produção real tende a ficar abaixo da prevista, porque as paradas são mais frequentes do que ele espera.
- Os turnos descartados se concentram no **fim de semana**, quando a malharia não roda. Não era falha de captação.
- Os dados contam a história da Aura: um tear piloto em fevereiro, novas instalações em junho, e 4 teares ativos hoje.

## 6. Próximos passos para a tela de metas

1. **Corrigir a anomalia da hora 3–4**, a única em que o modelo perde para as contas simples. Poucas amostras com erro enorme puxam a média.
2. **Integrar ao PWA:** carregar o modelo no navegador e recalcular a projeção a cada leitura do WebSocket.
3. **Desenhar a tela:** meta × projeção × faixa de confiança, por tear e por turno.
4. **Retreinar com dados novos** (o dump atual vai até 10/out) e recalibrar a faixa.

## Sugestão de arco para o vídeo

1. O cliente pediu uma tela de metas.
2. Tentei a IA do Chrome e não deu.
3. Treinei um modelo no meu Mac.
4. Errei, ajustei, e na 3ª versão funcionou.
5. Mostro a faixa de confiança fechando ao longo do turno.
6. Termino com o próximo passo: a tela no painel.
