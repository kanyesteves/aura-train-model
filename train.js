import fs from 'fs';
import * as tf from '@tensorflow/tfjs';

const PASTA_MODELO = 'modelo_v3';
const DIAS_TESTE = 30;
const SEMENTE = 42;

// ===== 0. SEMENTE FIXA =====
// O TF.js usa Math.random para inicializar os pesos e embaralhar os lotes.
// Fixando o gerador, cada execução dá o mesmo resultado e as versões ficam comparáveis.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEMENTE);

// ===== 1. CARREGA E SEPARA TREINO / TESTE (POR DATA) =====
const { amostras } = JSON.parse(fs.readFileSync('dados/dataset.json'));
amostras.sort((a, b) => a.data - b.data);

const corte = amostras.at(-1).data - DIAS_TESTE * 86400000;
const treino = amostras.filter(a => a.data < corte);
const teste  = amostras.filter(a => a.data >= corte);
console.log(`Treino: ${treino.length} amostras | Teste: ${teste.length} amostras (últimos ${DIAS_TESTE} dias)`);

// ===== 2. NORMALIZAÇÃO =====
const n = treino[0].x.length;
const media = Array(n).fill(0), desvio = Array(n).fill(0);
treino.forEach(a => a.x.forEach((v, i) => (media[i] += v / treino.length)));
treino.forEach(a => a.x.forEach((v, i) => (desvio[i] += (v - media[i]) ** 2 / treino.length)));
desvio.forEach((d, i) => (desvio[i] = Math.sqrt(d) || 1));
const escalaY = Math.max(...treino.map(a => a.yRitmo)); // ritmo máximo (voltas/min)

const X = arr => tf.tensor2d(arr.map(a => a.x.map((v, i) => (v - media[i]) / desvio[i])));
const Y = arr => tf.tensor2d(arr.map(a => [a.yRitmo / escalaY]));

// ===== 3. MODELO E TREINO =====
// Alvo: ritmo do restante do turno (voltas/min). A projeção é ritmo × minutos restantes,
// então ela converge para o valor exato no fim do turno.
const model = tf.sequential({ layers: [
  tf.layers.dense({ inputShape: [n], units: 32, activation: 'relu' }),
  tf.layers.dense({ units: 16, activation: 'relu' }),
  tf.layers.dense({ units: 1 }),
]});
model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });

await model.fit(X(treino), Y(treino), {
  epochs: 100, batchSize: 128, validationSplit: 0.1, shuffle: true, verbose: 0,
  callbacks: [
    tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 8 }),
    new tf.CustomCallback({ onEpochEnd: (ep, logs) => process.stdout.write(`\rÉpoca ${ep + 1} | val_loss ${logs.val_loss.toFixed(5)}   `) }),
  ],
});
console.log('\n');

// ===== 4. AVALIAÇÃO =====
const ritmoPrev = Array.from(await model.predict(X(teste)).data()).map(p => Math.max(0, p * escalaY));
teste.forEach((a, i) => (a.pred = ritmoPrev[i] * a.restante)); // volta para voltas restantes

const mediaTurno = teste.reduce((s, a) => s + a.total, 0) / teste.length;
const mae = (arr, campo) => arr.reduce((s, a) => s + Math.abs(a[campo] - a.y), 0) / arr.length;
const pct = v => `${((v / mediaTurno) * 100).toFixed(1)}%`;
const fmt = v => `${v.toFixed(0)} (${pct(v)})`.padEnd(16);
const percentil = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};

console.log(`Produção média de um turno no teste: ${mediaTurno.toFixed(0)} voltas\n`);
console.log('MAE GERAL');
console.log(`  Modelo   : ${fmt(mae(teste, 'pred'))}`);
console.log(`  Ingênua  : ${fmt(mae(teste, 'ingenua'))}`);
console.log(`  Histórica: ${fmt(mae(teste, 'hist'))}`);
console.log(`  (v1: modelo 1454 | v2: modelo 1619 | ingênua 1671 | histórica 1690)\n`);

// ===== 5. MAE E FAIXA DE CONFIANÇA POR HORA DO TURNO =====
// Faixa 80%: entre o percentil 10 e o 90 do erro (real − previsto) em cada hora.
// No painel: projeção = feito + previsto; faixa = [projeção + p10, projeção + p90].
console.log('MAE POR HORA DECORRIDA DO TURNO (voltas e % da produção do turno)');
console.log('Faixa    | Amostras | Modelo          | Ingênua         | Histórica       | Faixa 80% (voltas)   | Largura');
console.log('---------|----------|-----------------|-----------------|-----------------|----------------------|--------');
const faixas = [];
let horaConfiavel = null;
for (let h = 0; h < 8; h++) {
  const grupo = teste.filter(a => a.decorridoMin > h * 60 && a.decorridoMin <= (h + 1) * 60);
  if (!grupo.length) continue;
  const mModelo = mae(grupo, 'pred');
  if (horaConfiavel === null && mModelo / mediaTurno < 0.10) horaConfiavel = h;
  const erros = grupo.map(a => a.y - a.pred);
  const p10 = percentil(erros, 0.10), p90 = percentil(erros, 0.90);
  const dentro = erros.filter(e => e >= p10 && e <= p90).length / erros.length;
  faixas.push({ horaInicio: h, horaFim: h + 1, p10: Math.round(p10), p90: Math.round(p90), cobertura: +dentro.toFixed(2) });
  console.log(
    `${`${h}–${h + 1}h`.padEnd(8)} | ${String(grupo.length).padEnd(8)} | ` +
    `${fmt(mModelo)}| ${fmt(mae(grupo, 'ingenua'))}| ${fmt(mae(grupo, 'hist'))}| ` +
    `${`${Math.round(p10)} a +${Math.round(p90)}`.padEnd(20)} | ${pct(p90 - p10)}`
  );
}
console.log(horaConfiavel === null
  ? '\nO modelo não chega a errar menos de 10% em nenhuma faixa.'
  : `\nO modelo passa a errar menos de 10% a partir da faixa ${horaConfiavel}–${horaConfiavel + 1}h do turno.`);
console.log('Obs.: a faixa foi calibrada no próprio período de teste; recalcule conforme chegarem dados novos.');

// ===== 6. SALVA O MODELO =====
await model.save(tf.io.withSaveHandler(async (art) => {
  fs.mkdirSync(PASTA_MODELO, { recursive: true });
  const pesos = Array.isArray(art.weightData)
    ? Buffer.concat(art.weightData.map(b => Buffer.from(b)))
    : Buffer.from(art.weightData);
  fs.writeFileSync(`${PASTA_MODELO}/weights.bin`, pesos);
  fs.writeFileSync(`${PASTA_MODELO}/model.json`, JSON.stringify({
    modelTopology: art.modelTopology,
    format: art.format,
    generatedBy: art.generatedBy,
    weightsManifest: [{ paths: ['weights.bin'], weights: art.weightSpecs }],
  }));
  return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
}));
fs.writeFileSync(`${PASTA_MODELO}/normalizacao.json`, JSON.stringify({ media, desvio, escalaY, alvo: 'ritmo_restante_voltas_min' }));
fs.writeFileSync(`${PASTA_MODELO}/faixas.json`, JSON.stringify(faixas, null, 2));
console.log(`\nModelo salvo em ./${PASTA_MODELO} (model.json, weights.bin, normalizacao.json, faixas.json)`);
