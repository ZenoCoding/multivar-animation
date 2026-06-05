const mathNames = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sqrt', 'abs', 'min', 'max', 'pow', 'exp', 'log',
  'floor', 'ceil', 'round', 'PI', 'E'
];

function compileExpression(expression) {
  const source = expression.trim() || '0';
  const names = [...mathNames];
  const values = names.map((name) => Math[name]);
  let fn;

  try {
    fn = new Function(
      'x',
      'y',
      't',
      ...names,
      `"use strict"; return (${source});`,
    );
    fn(0, 0, 0, ...values);
  } catch (err) {
    return () => 0;
  }

  return (x, y, t) => {
    const value = Number(fn(x, y, t, ...values));
    return Number.isFinite(value) ? value : 0;
  };
}

function calculateDivergence(field, point, t) {
  const h = 0.015;
  const pRight = field(point.x + h, point.y, t).x;
  const pLeft = field(point.x - h, point.y, t).x
  const qUp = field(point.x, point.y + h, t).y;
  const qDown = field(point.x, point.y - h, t).y;

  return (pRight - pLeft) / (2 * h) + (qUp - qDown) / (2 * h);
}

function calculateCurl(field, point, t) {
  const h = 0.015;
  const qRight = field(point.x + h, point.y, t).y;
  const qLeft = field(point.x - h, point.y, t).y;
  const pUp = field(point.x, point.y + h, t).x;
  const pDown = field(point.x, point.y - h, t).x;

  return (qRight - qLeft) / (2 * h) - (pUp - pDown) / (2 * h);
}

const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

// Extract labQuestions from src/App.tsx
const startIndex = content.indexOf('const labQuestions: LabQuestion[] = [');
const endIndex = content.indexOf('const mathNames = ['); // it follows labQuestions
const questionsText = content.substring(startIndex, endIndex);

// Let's parse and print questions to see their configured values
// We can eval the questionsText by mock defining LabQuestion
const labQuestions = eval(`
  const pointCharges = []; // mock
  const pointChargeRenderHints = {}; // mock
  const pointChargeFeatures = []; // mock
  ${questionsText}
  labQuestions;
`);

console.log("Found", labQuestions.length, "questions.");

for (let i = 0; i < labQuestions.length; i++) {
  const q = labQuestions[i];
  const fx = compileExpression(q.field.dx);
  const fy = compileExpression(q.field.dy);
  const field = (x, y, t) => ({ x: fx(x, y, t), y: fy(x, y, t) });

  console.log(`\nQuestion ${i+1}: ${q.title} (${q.lessonKind})`);
  console.log(`Field: dx = ${q.field.dx}, dy = ${q.field.dy}`);
  for (const marker of q.markers) {
    const div = calculateDivergence(field, marker, 0);
    const curl = calculateCurl(field, marker, 0);
    console.log(`  Marker ${marker.label} at (${marker.x}, ${marker.y}):`);
    console.log(`    Expected divergence (calculated): ${div.toFixed(2)}, curl: ${curl.toFixed(2)}`);
  }
}
