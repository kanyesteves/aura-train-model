import fs from 'fs';
import { parse } from 'csv-parse/sync';

// Use os MESMOS turnos do prepare.js
const ARQUIVO = 'dados/dump3_completo.csv';
const TURNOS = [
  { id: 0, inicio: 5,  horas: 8 },
  { id: 1, inicio: 13, horas: 8 },
  { id: 2, inicio: 21, horas: 8 },
];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtData = d => d.toISOString().slice(0, 10);

const linhas = parse(fs.readFileSync(ARQUIVO), { columns: true, skip_empty_lines: true });

// ===== 1. LEITURAS POR TEAR =====
const porTear = new Map();
const turnos = new Map();

for (const l of linhas) {
  const ts = new Date(l.timestamp.replace(' ', 'T'));
  if (isNaN(ts)) continue;
  const tear = String(l.tear_id);
  if (!porTear.has(tear)) porTear.set(tear, { n: 0, zeros: 0, primeira: ts, ultima: ts });
  const pt = porTear.get(tear);
  pt.n++;
  if (Number(l.voltas) === 0) pt.zeros++;
  if (ts < pt.primeira) pt.primeira = ts;
  if (ts > pt.ultima) pt.ultima = ts;

  const h = ts.getHours();
  const t = TURNOS.find(t => (h - t.inicio + 24) % 24 < t.horas);
  if (!t) continue;
  const ini = new Date(ts);
  ini.setHours(t.inicio, 0, 0, 0);
  if (ini > ts) ini.setDate(ini.getDate() - 1);
  const chave = `${tear}|${ini.getTime()}`;
  if (!turnos.has(chave)) turnos.set(chave, { tear, turno: t.id, ini, dur: t.horas * 60, presentes: new Set() });
  turnos.get(chave).presentes.add(Math.floor((ts - ini) / 60000));
}

const teares = [...porTear.keys()].sort();
console.log('\n=== 1. LEITURAS POR TEAR ===');
console.log('Tear | Leituras  | % do total | % zeros | Primeira   | Última     | Dias');
const totalLeituras = [...porTear.values()].reduce((s, p) => s + p.n, 0);
for (const tear of teares) {
  const p = porTear.get(tear);
  const dias = Math.round((p.ultima - p.primeira) / 86400000) + 1;
  console.log(
    `${tear.padEnd(4)} | ${String(p.n).padEnd(9)} | ${((p.n / totalLeituras) * 100).toFixed(1).padStart(9)}% | ` +
    `${((p.zeros / p.n) * 100).toFixed(1).padStart(6)}% | ${fmtData(p.primeira)} | ${fmtData(p.ultima)} | ${dias}`
  );
}

// ===== 2. COBERTURA DOS TURNOS POR TEAR + TURNO =====
const faixa = c => (c >= 0.9 ? 'ok' : c >= 0.5 ? 'parcial' : 'ruim');
const stats = new Map();
const descartadosDia = Array(7).fill(0), totaisDia = Array(7).fill(0);
const descartadosTurno = Array(TURNOS.length).fill(0), totaisTurno = Array(TURNOS.length).fill(0);

for (const t of turnos.values()) {
  const c = t.presentes.size / t.dur;
  const k = `${t.tear}|${t.turno}`;
  if (!stats.has(k)) stats.set(k, { ok: 0, parcial: 0, ruim: 0 });
  stats.get(k)[faixa(c)]++;
  const dia = t.ini.getDay();
  totaisDia[dia]++; totaisTurno[t.turno]++;
  if (c < 0.9) { descartadosDia[dia]++; descartadosTurno[t.turno]++; }
}

console.log('\n=== 2. COBERTURA DOS TURNOS (tear + turno) ===');
console.log('"esperados" = dias entre a 1ª e a última leitura do tear; "sem leitura" = turnos sem NENHUM dado');
console.log('Tear | Turno | Esperados | >=90% | 50–90% | <50% | Sem leitura');
for (const tear of teares) {
  const p = porTear.get(tear);
  const esperados = Math.round((p.ultima - p.primeira) / 86400000) + 1;
  for (const tt of TURNOS) {
    const s = stats.get(`${tear}|${tt.id}`) || { ok: 0, parcial: 0, ruim: 0 };
    const semLeitura = Math.max(0, esperados - s.ok - s.parcial - s.ruim);
    console.log(
      `${tear.padEnd(4)} | ${`${String(tt.inicio).padStart(2, '0')}h`.padEnd(5)} | ${String(esperados).padEnd(9)} | ` +
      `${String(s.ok).padEnd(5)} | ${String(s.parcial).padEnd(6)} | ${String(s.ruim).padEnd(4)} | ${semLeitura}`
    );
  }
}

// ===== 3. ONDE SE CONCENTRAM OS DESCARTES =====
console.log('\n=== 3. TURNOS COM COBERTURA < 90% (entre os que têm alguma leitura) ===');
console.log('Por dia da semana:');
DIAS.forEach((d, i) => {
  if (totaisDia[i]) console.log(`  ${d}: ${descartadosDia[i]}/${totaisDia[i]} (${((descartadosDia[i] / totaisDia[i]) * 100).toFixed(0)}%)`);
});
console.log('Por turno:');
TURNOS.forEach((tt, i) => {
  if (totaisTurno[i]) console.log(`  ${String(tt.inicio).padStart(2, '0')}h: ${descartadosTurno[i]}/${totaisTurno[i]} (${((descartadosTurno[i] / totaisTurno[i]) * 100).toFixed(0)}%)`);
});
console.log();
