import fs from 'fs';
import { parse } from 'csv-parse/sync';

// ===== CONFIGURAÇÃO =====
const ARQUIVO = 'dados/dump3_completo.csv';
const TURNOS = [
  { id: 0, inicio: 5,  horas: 8 },
  { id: 1, inicio: 13, horas: 8 },
  { id: 2, inicio: 21, horas: 8 },
];
const PASSO = 15;               // uma amostra a cada 15 min de turno
const COBERTURA_MIN = 0.9;      // descarta turnos com menos de 90% das leituras
const TEARES_EXCLUIDOS = [];    // ex.: ['7'] — preencha após rodar diagnostico.js
const JANELA_HIST = 20;         // últimos N turnos do mesmo tear+turno
const MIN_HIST = 5;             // mínimo de turnos anteriores para usar o histórico do tear

// ===== 1. AGRUPA LEITURAS POR TEAR + TURNO =====
const linhas = parse(fs.readFileSync(ARQUIVO), { columns: true, skip_empty_lines: true });
const excluidos = new Set(TEARES_EXCLUIDOS.map(String));
const turnos = new Map();

for (const l of linhas) {
  if (excluidos.has(String(l.tear_id))) continue;
  const ts = new Date(l.timestamp.replace(' ', 'T'));
  if (isNaN(ts)) continue;
  const h = ts.getHours();
  const t = TURNOS.find(t => (h - t.inicio + 24) % 24 < t.horas);
  if (!t) continue;
  const ini = new Date(ts);
  ini.setHours(t.inicio, 0, 0, 0);
  if (ini > ts) ini.setDate(ini.getDate() - 1);
  const chave = `${l.tear_id}|${ini.getTime()}`;
  if (!turnos.has(chave)) {
    turnos.set(chave, { tear: String(l.tear_id), turno: t.id, ini, min: new Array(t.horas * 60).fill(null) });
  }
  turnos.get(chave).min[Math.floor((ts - ini) / 60000)] = Number(l.voltas);
}

// ===== 2. FILTRA TURNOS VÁLIDOS E ORDENA NO TEMPO =====
const validos = [...turnos.values()]
  .filter(t => t.min.filter(v => v !== null).length / t.min.length >= COBERTURA_MIN)
  .sort((a, b) => a.ini - b.ini);

const tearIds = [...new Set(validos.map(t => t.tear))].sort();

// ===== 3. GERA AMOSTRAS COM RITMO HISTÓRICO (SEM VAZAMENTO) =====
const historico = new Map();    // "tear|turno" -> [ritmos dos turnos anteriores]
let somaGeral = 0, nGeral = 0;  // média geral de todos os turnos anteriores
const amostras = [];
let semHistorico = 0;

// processa em grupos com o mesmo horário de início, para que turnos simultâneos
// de outros teares não entrem no histórico uns dos outros
for (let i = 0; i < validos.length; ) {
  const grupo = [];
  const iniGrupo = validos[i].ini.getTime();
  while (i < validos.length && validos[i].ini.getTime() === iniGrupo) grupo.push(validos[i++]);

  const concluidos = [];
  for (const t of grupo) {
    const dur = t.min.length;
    const v = t.min.map(x => x ?? 0);
    const total = v.reduce((a, b) => a + b, 0);
    concluidos.push({ t, ritmo: total / dur });

    const chaveHist = `${t.tear}|${t.turno}`;
    const anteriores = historico.get(chaveHist) || [];
    let ritmoHist;
    if (anteriores.length >= MIN_HIST) {
      const ult = anteriores.slice(-JANELA_HIST);
      ritmoHist = ult.reduce((a, b) => a + b, 0) / ult.length;
    } else if (nGeral > 0) {
      ritmoHist = somaGeral / nGeral;
    } else {
      semHistorico++;
      continue; // primeiro turno de todos: sem histórico nenhum
    }

    let feito = 0, parado = 0;
    for (let m = 0; m < dur; m++) {
      feito += v[m];
      if (v[m] === 0) parado++;
      const dec = m + 1;
      if (dec % PASSO !== 0 || dec === dur) continue;
      const restante = dur - dec;
      const uh = v.slice(Math.max(0, dec - 60), dec);
      amostras.push({
        data: t.ini.getTime(),
        decorridoMin: dec,
        total,
        x: [
          dec / dur,                                  // % do turno decorrido
          feito,                                      // voltas até agora
          parado / dec,                               // % do tempo parado
          uh.reduce((a, b) => a + b, 0) / uh.length,  // ritmo da última hora
          t.ini.getDay() / 6,                         // dia da semana
          ritmoHist,                                  // NOVO: ritmo histórico do tear neste turno
          ritmoHist * restante,                       // NOVO: projeção histórica do restante
          ...TURNOS.map(tt => (tt.id === t.turno ? 1 : 0)),
          ...tearIds.map(id => (id === t.tear ? 1 : 0)),
        ],
        restante,                                     // minutos restantes no turno
        yRitmo: (total - feito) / restante,           // ALVO DO MODELO: ritmo do restante (voltas/min)
        y: total - feito,                             // voltas restantes (usado na avaliação)
        ingenua: (feito / dec) * restante,            // baseline 1: ritmo atual
        hist: ritmoHist * restante,                   // baseline 2: ritmo histórico
      });
    }
  }

  // só depois de processar o grupo inteiro os turnos entram no histórico
  for (const { t, ritmo } of concluidos) {
    const chaveHist = `${t.tear}|${t.turno}`;
    if (!historico.has(chaveHist)) historico.set(chaveHist, []);
    historico.get(chaveHist).push(ritmo);
    somaGeral += ritmo;
    nGeral++;
  }
}

fs.writeFileSync('dados/dataset.json', JSON.stringify({ tearIds, turnos: TURNOS, amostras }));
console.log(`Teares: ${tearIds.join(', ')}`);
console.log(`${turnos.size} turnos encontrados, ${validos.length} válidos (cobertura >= ${COBERTURA_MIN * 100}%)`);
console.log(`${amostras.length} amostras (${semHistorico} turno(s) sem histórico ignorado(s))`);
