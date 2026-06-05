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
    console.error("Compile error for", expression, err);
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

const dx = 'x';
const dy = 'y';

const fx = compileExpression(dx);
const fy = compileExpression(dy);

const field = (x, y, t) => {
  return { x: fx(x, y, t), y: fy(x, y, t) };
};

const point = { x: 0.8, y: 0.5 };
const div = calculateDivergence(field, point, 0);

console.log("Calculated divergence at (0.8, 0.5):", div);
