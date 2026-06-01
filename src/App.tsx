import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent,
  ReactNode,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Dices,
  ListChecks,
  Minus,
  Navigation2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Waves,
} from 'lucide-react'
import './App.css'

type Vector = { x: number; y: number }
type Field = (x: number, y: number, t: number) => Vector
type ColorMode = 'flow' | 'speed' | 'angle'
type SeedingMode = 'uniform' | 'divergence' | 'particle'
type Tracer = {
  id: number
  seedIndex: number
  age: number
  maxAge: number
  points: Vector[]
}
type Particle = {
  id: number
  x: number
  y: number
}
type ProbeState = {
  x: number
  y: number
  curl: number
  divergence: number
  visible: boolean
}

type LabPhase = 'predict' | 'investigate' | 'explain'
type LabPanelMode = 'intro' | 'question' | 'concept' | 'menu'
type LessonKind = 'curl' | 'divergence' | 'compare'
type ProbeMetric = 'curl' | 'divergence' | 'both'

type Marker = {
  label: string
  x: number
  y: number
}

type MarkerPosition = Marker & {
  curl: number
  divergence: number
  left: number
  top: number
}

type LabQuestion = {
  lessonKind: LessonKind
  metric: ProbeMetric
  title: string
  field: {
    dx: string
    dy: string
  }
  markers: Marker[]
  prompt: string
  options: string[]
  answer: string
  explanation: string
  revealedInsight: string
}

type AnswerRecord = {
  selectedOption: string
  submitted: boolean
  correct: boolean
}

type Preset = {
  name: string
  dx: string
  dy: string
  colorMode?: ColorMode
}

type IntegratedMenuOption = {
  value: string
  label: string
  menuLabel?: string
}

const presets: Preset[] = [
  { name: 'Curl', dx: '-y', dy: 'x' },
  { name: 'Source', dx: 'x', dy: 'y' },
  { name: 'Sink', dx: '-x', dy: '-y' },
  { name: 'Shear', dx: 'y', dy: '0.35 * sin(x)' },
  { name: 'Saddle', dx: 'x', dy: '-y' },
]

const colorModeOptions: IntegratedMenuOption[] = [
  { value: 'flow', label: 'Color: flow', menuLabel: 'Flow' },
  { value: 'speed', label: 'Color: speed', menuLabel: 'Speed' },
  { value: 'angle', label: 'Color: angle', menuLabel: 'Angle' },
]

const randomPresets: Preset[] = [
  {
    name: 'Orbit wells',
    dx: '-y / (0.18 + sqrt(x * x + y * y)) + 0.28 * sin(3 * y + t)',
    dy: 'x / (0.18 + sqrt(x * x + y * y)) + 0.28 * cos(3 * x - t)',
    colorMode: 'angle',
  },
  {
    name: 'Dipole',
    dx: '2 * x * y',
    dy: 'y * y - x * x',
    colorMode: 'speed',
  },
  {
    name: 'Reflecting pool',
    dx: 'sin(4.6 * y + x + t * 0.45)',
    dy: 'cos(4.2 * x - y - t * 0.35)',
    colorMode: 'flow',
  },
  {
    name: 'Breathing sink',
    dx: '-0.18 * x - y / (0.35 + x * x + y * y) + 0.35 * sin(t + y)',
    dy: '-0.18 * y + x / (0.35 + x * x + y * y) + 0.35 * cos(t - x)',
    colorMode: 'angle',
  },
  {
    name: 'Shear bands',
    dx: 'sin(y * 2.7 + t) + 0.18 * x',
    dy: 'cos(x * 1.9 - t * 0.7) - 0.28 * y',
    colorMode: 'speed',
  },
]

type LessonSection = {
  kind: 'intro' | LessonKind
  title: string
  shortTitle: string
}

const labTitle = 'Local Vector Labs'

const lessonSections: LessonSection[] = [
  { kind: 'intro', title: 'Local Measurements', shortTitle: 'Intro' },
  { kind: 'curl', title: 'Curl Probe Lab', shortTitle: 'Curl' },
  { kind: 'divergence', title: 'Divergence Probe Lab', shortTitle: 'Divergence' },
  {
    kind: 'compare',
    title: 'Compare Curl and Divergence',
    shortTitle: 'Compare',
  },
]

const labQuestions: LabQuestion[] = [
  {
    lessonKind: 'curl',
    metric: 'curl',
    title: 'Point A',
    field: { dx: '-y', dy: 'x' },
    markers: [{ label: 'A', x: 0, y: 0 }],
    prompt: 'What is the curl at point A?',
    options: ['-2', '0', '2', 'It changes by location'],
    answer: '2',
    explanation:
      'A tiny paddle wheel placed at A would spin counterclockwise at a steady rate. The local turning is strong and positive, even though the particle at the center barely moves.',
    revealedInsight: 'This field turns every small paddle wheel counterclockwise.',
  },
  {
    lessonKind: 'curl',
    metric: 'curl',
    title: 'Compare A-D',
    field: { dx: '-y', dy: 'x' },
    markers: [
      { label: 'A', x: -2.2, y: 1.8 },
      { label: 'B', x: 2.2, y: 1.8 },
      { label: 'C', x: -2.2, y: -1.8 },
      { label: 'D', x: 2.2, y: -1.8 },
    ],
    prompt: 'Rank the curl at A, B, C, and D.',
    options: [
      'A = B = C = D',
      'A and C are largest',
      'B and D are largest',
      'Center is largest',
    ],
    answer: 'A = B = C = D',
    explanation:
      'The arrows form larger circles farther out, but a tiny paddle wheel feels the same local twist at each marked point. Curl measures that local twist, not how large the orbit looks.',
    revealedInsight: 'The visible circles get larger, but the local spin stays even.',
  },
  {
    lessonKind: 'curl',
    metric: 'curl',
    title: 'Sliding rows',
    field: { dx: 'y', dy: '0' },
    markers: [
      { label: 'A', x: -1.5, y: 1.7 },
      { label: 'B', x: 1.5, y: -1.7 },
    ],
    prompt: 'What sign is the curl?',
    options: ['Positive', 'Negative', 'Zero', 'Cannot tell'],
    answer: 'Negative',
    explanation:
      'The upper part of a tiny paddle wheel gets pushed right while the lower part gets pushed left. That twist makes the wheel turn clockwise, so the curl is negative.',
    revealedInsight: 'A sliding field can spin a tiny paddle wheel without forming circles.',
  },
  {
    lessonKind: 'curl',
    metric: 'curl',
    title: 'Stretch and squeeze',
    field: { dx: 'x', dy: '-y' },
    markers: [
      { label: 'A', x: 0, y: 0 },
      { label: 'B', x: -2.1, y: 1.4 },
      { label: 'C', x: 2.1, y: -1.4 },
    ],
    prompt: 'What is the curl at these points?',
    options: ['Positive', 'Negative', 'Zero', 'Changes sign'],
    answer: 'Zero',
    explanation:
      'A small shape would stretch horizontally and squeeze vertically, but opposite sides do not make it turn. Deformation alone is not curl; curl needs local spinning.',
    revealedInsight: 'Stretching can be dramatic while local spin remains zero.',
  },
  {
    lessonKind: 'divergence',
    metric: 'divergence',
    title: 'Source',
    field: { dx: 'x', dy: 'y' },
    markers: [{ label: 'A', x: 0.8, y: 0.5 }],
    prompt: 'What happens to a tiny blob placed at A?',
    options: [
      'It expands',
      'It contracts',
      'Its area stays about the same',
      'Cannot tell',
    ],
    answer: 'It expands',
    explanation:
      'The nearby arrows carry every edge of the blob outward. The blob would grow in area, so the divergence is positive.',
    revealedInsight: 'The probe blob expands when local flow spreads outward.',
  },
  {
    lessonKind: 'divergence',
    metric: 'divergence',
    title: 'Sink',
    field: { dx: '-x', dy: '-y' },
    markers: [{ label: 'A', x: -0.8, y: 0.55 }],
    prompt: 'What happens to a tiny blob placed at A?',
    options: [
      'It expands',
      'It contracts',
      'Its area stays about the same',
      'Cannot tell',
    ],
    answer: 'It contracts',
    explanation:
      'The nearby arrows carry the blob edges inward from all sides. The blob would shrink in area, so the divergence is negative.',
    revealedInsight: 'The probe blob contracts when local flow piles inward.',
  },
  {
    lessonKind: 'divergence',
    metric: 'divergence',
    title: 'Stretch and squeeze',
    field: { dx: 'x', dy: '-y' },
    markers: [
      { label: 'A', x: 0, y: 0 },
      { label: 'B', x: -1.8, y: 1.2 },
      { label: 'C', x: 1.8, y: -1.2 },
    ],
    prompt: 'What is the divergence at these points?',
    options: ['Positive', 'Negative', 'Zero', 'Changes sign'],
    answer: 'Zero',
    explanation:
      'A tiny blob stretches horizontally and squeezes vertically. The shape changes, but the area gain and area loss balance out.',
    revealedInsight: 'Divergence checks area change, not whether the shape deforms.',
  },
  {
    lessonKind: 'divergence',
    metric: 'divergence',
    title: 'Spin without spreading',
    field: { dx: '-y', dy: 'x' },
    markers: [
      { label: 'A', x: -2.1, y: 1.4 },
      { label: 'B', x: 2.1, y: 1.4 },
      { label: 'C', x: 0, y: -1.8 },
    ],
    prompt: 'What is the divergence in this rotating field?',
    options: [
      'Positive everywhere',
      'Negative everywhere',
      'Zero everywhere',
      'Largest at the center',
    ],
    answer: 'Zero everywhere',
    explanation:
      'A tiny blob would turn around, but it would not locally grow or shrink. Spin is not the same thing as spreading out.',
    revealedInsight: 'The wheel spins here, but the blob keeps the same area.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Rotation field',
    field: { dx: '-y', dy: 'x' },
    markers: [{ label: 'A', x: 1.6, y: 1.4 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Neither'],
    answer: 'Spin',
    explanation:
      'The tiny wheel turns, but the tiny blob keeps its area. This field has curl without divergence.',
    revealedInsight: 'Compare the wheel and blob: spin can happen without spreading.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Source field',
    field: { dx: 'x', dy: 'y' },
    markers: [{ label: 'A', x: -1.25, y: 1.15 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Neither'],
    answer: 'Expansion',
    explanation:
      'The tiny blob expands while the tiny wheel does not get twisted. This field has divergence without curl.',
    revealedInsight: 'The blob grows here, but there is no local wheel spin.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Sink field',
    field: { dx: '-x', dy: '-y' },
    markers: [{ label: 'A', x: 1.35, y: -1.05 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Neither'],
    answer: 'Compression',
    explanation:
      'The tiny blob contracts while the tiny wheel does not turn. Negative divergence means local compression.',
    revealedInsight: 'The blob shrinks here, but the wheel does not spin.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Saddle field',
    field: { dx: 'x', dy: '-y' },
    markers: [{ label: 'A', x: 1.4, y: 1.2 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Neither'],
    answer: 'Neither',
    explanation:
      'The tiny shape stretches and squeezes, but it does not spin and its area does not change overall.',
    revealedInsight: 'Deformation can look dramatic while curl and divergence are both zero.',
  },
]

const mathNames = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sqrt',
  'abs',
  'min',
  'max',
  'pow',
  'exp',
  'log',
  'floor',
  'ceil',
  'round',
  'PI',
  'E',
] as const

const generatedColorModes: ColorMode[] = ['flow', 'speed', 'angle']
const visibleHalfRange = 4.1
const simulationPadding = 0.9
const simulationHalfRange = visibleHalfRange + simulationPadding
const uniformLineSeedHalfRange = visibleHalfRange * 0.98
const densityMin = 40
const densityMax = 160
const densityStep = 10
const uniformLineDropProbability = 0.006
const particleDropProbability = 0.009
const particleIntegrationStep = 0.012
const particleFadeAlpha = 0.075

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function coefficient(min = -2.4, max = 2.4) {
  const value = min + Math.random() * (max - min)
  const rounded = Math.round(value * 10) / 10
  return rounded === 0 ? '0.7' : String(rounded)
}

function terminalExpression() {
  return pick([
    'x',
    'y',
    't',
    'x + y',
    'x - y',
    'y - x',
    'x * x - y * y',
    '2 * x * y',
    'sqrt(x * x + y * y)',
    'atan2(y, x)',
    coefficient(-3.2, 3.2),
  ])
}

function generatedExpression(depth = 0): string {
  if (depth > 2 || Math.random() < 0.3) return terminalExpression()

  const left = () => generatedExpression(depth + 1)
  const right = () => generatedExpression(depth + 1)

  return pick([
    () => `sin(${left()})`,
    () => `cos(${left()})`,
    () => `abs(${left()})`,
    () => `exp(-abs(${left()}))`,
    () => `(${left()} + ${right()})`,
    () => `(${left()} - ${right()})`,
    () => `${coefficient()} * (${left()})`,
    () => `(${left()}) * (${right()})`,
    () => `(${left()}) / (0.45 + abs(${right()}))`,
    () => `min(${left()}, ${right()})`,
    () => `max(${left()}, ${right()})`,
  ])()
}

function makeGeneratedField(): Preset {
  if (Math.random() < 0.38) {
    const spin = coefficient(-1.5, 1.5)
    const pull = coefficient(-0.55, 0.55)
    const waveX = generatedExpression(1)
    const waveY = generatedExpression(1)

    return {
      name: 'Generated swirl',
      dx: `${pull} * x - ${spin} * y + 0.32 * (${waveX})`,
      dy: `${spin} * x + ${pull} * y + 0.32 * (${waveY})`,
      colorMode: pick(generatedColorModes),
    }
  }

  return {
    name: 'Generated field',
    dx: generatedExpression(),
    dy: generatedExpression(),
    colorMode: pick(generatedColorModes),
  }
}

function fieldHasMotion(preset: Preset) {
  const fx = compileExpression(preset.dx)
  const fy = compileExpression(preset.dy)
  let total = 0
  let valid = 0
  const samples = [-3, -1.5, 0, 1.5, 3]
  const t = Math.random() * Math.PI * 2

  for (const x of samples) {
    for (const y of samples) {
      const speed = Math.hypot(fx(x, y, t), fy(x, y, t))
      if (Number.isFinite(speed)) {
        total += Math.min(speed, 20)
        valid += 1
      }
    }
  }

  const average = valid > 0 ? total / valid : 0
  return average > 0.06 && average < 18
}

function randomField() {
  if (Math.random() < 0.42) return pick(randomPresets)

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const preset = makeGeneratedField()
    if (fieldHasMotion(preset)) return preset
  }

  return pick(randomPresets)
}

function clampDensity(value: number) {
  const snapped = Math.round(value / densityStep) * densityStep
  return Math.min(densityMax, Math.max(densityMin, snapped))
}

function lineCountForWidth(
  width: number,
  density: number,
  seedingMode: SeedingMode,
) {
  const baseCount =
    seedingMode === 'uniform'
      ? width < 720
        ? 380
        : 760
      : width < 720
        ? 240
        : 460
  return Math.round(baseCount * (density / 100))
}

function particleCountForWidth(width: number, density: number) {
  const baseCount = width < 720 ? 3200 : 8200
  return Math.round(baseCount * (density / 100))
}

function compileExpression(expression: string) {
  const source = expression.trim() || '0'
  const names = [...mathNames]
  const values = names.map((name) => Math[name as keyof Math])
  let fn: (...args: unknown[]) => unknown

  try {
    fn = new Function(
      'x',
      'y',
      't',
      ...names,
      `"use strict"; return (${source});`,
    ) as (...args: unknown[]) => unknown
  } catch {
    return () => 0
  }

  return (x: number, y: number, t: number) => {
    try {
      const value = Number(fn(x, y, t, ...values))
      return Number.isFinite(value) ? value : 0
    } catch {
      return 0
    }
  }
}

function clampMagnitude(vector: Vector) {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) return { x: 0, y: 0 }
  const scale = Math.min(1.4, magnitude) / magnitude
  return { x: vector.x * scale, y: vector.y * scale }
}

function clampParticleVelocity(vector: Vector) {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) return { x: 0, y: 0 }
  const scale = Math.min(20, magnitude) / magnitude
  return { x: vector.x * scale, y: vector.y * scale }
}

function halton(index: number, base: number) {
  let result = 0
  let fraction = 1 / base
  let value = index

  while (value > 0) {
    result += fraction * (value % base)
    value = Math.floor(value / base)
    fraction /= base
  }

  return result
}

function makeSeed(index: number, aspect: number) {
  const u = (halton(index + 1, 2) + 0.17) % 1
  const v = (halton(index + 1, 3) + 0.31) % 1
  const edgeBias = index % 9 === 0 ? 1.04 : 1

  return {
    x: (u - 0.5) * simulationHalfRange * 2 * aspect * edgeBias,
    y: (v - 0.5) * simulationHalfRange * 2 * edgeBias,
  }
}

function makeUniformSeed(seedIndex: number, aspect: number) {
  if (seedIndex < 64) {
    const u = (halton(seedIndex + 1, 2) + 0.17) % 1
    const v = (halton(seedIndex + 1, 3) + 0.31) % 1

    return {
      x: (u - 0.5) * uniformLineSeedHalfRange * 2 * aspect,
      y: (v - 0.5) * uniformLineSeedHalfRange * 2,
    }
  }

  return makeRandomPoint(aspect, uniformLineSeedHalfRange)
}

function makeRandomPoint(aspect: number, halfRange = simulationHalfRange) {
  return {
    x: (Math.random() - 0.5) * halfRange * 2 * aspect,
    y: (Math.random() - 0.5) * halfRange * 2,
  }
}

function makeParticle(id: number, aspect: number): Particle {
  const point = makeRandomPoint(aspect)
  return {
    id,
    x: point.x,
    y: point.y,
  }
}

function resetParticles(count: number, aspect: number) {
  return Array.from({ length: count }, (_, index) => makeParticle(index, aspect))
}

function calculateDivergence(field: Field, point: Vector, t: number) {
  const h = 0.015
  const pRight = field(point.x + h, point.y, t).x
  const pLeft = field(point.x - h, point.y, t).x
  const qUp = field(point.x, point.y + h, t).y
  const qDown = field(point.x, point.y - h, t).y

  return (pRight - pLeft) / (2 * h) + (qUp - qDown) / (2 * h)
}

function makeDivergenceSeed(
  seedIndex: number,
  aspect: number,
  field: Field,
  t: number,
) {
  if (seedIndex % 7 === 0) return makeSeed(seedIndex, aspect)

  let best = makeSeed(seedIndex, aspect)
  let bestScore = Number.NEGATIVE_INFINITY

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const candidate = makeSeed(seedIndex + attempt * 997, aspect)
    const divergence = calculateDivergence(field, candidate, t)

    if (Number.isFinite(divergence) && divergence > bestScore) {
      best = candidate
      bestScore = divergence
    }
  }

  return bestScore > 0.08 ? best : makeSeed(seedIndex, aspect)
}

function makeTracer(
  id: number,
  seedIndex: number,
  aspect: number,
  field: Field,
  t: number,
  seedingMode: SeedingMode,
  warmupSteps = 0,
  maxInitialPoints = Number.POSITIVE_INFINITY,
  initialAge = warmupSteps * 0.045,
): Tracer {
  const isInside =
    seedingMode === 'uniform' ? isInUniformLineDomain : isInDomain
  let head =
    seedingMode === 'divergence'
      ? makeDivergenceSeed(seedIndex, aspect, field, t)
      : makeUniformSeed(seedIndex, aspect)

  for (let i = 0; i < warmupSteps; i += 1) {
    const vector = clampMagnitude(field(head.x, head.y, t))
    const next = {
      x: head.x + vector.x * 0.052,
      y: head.y + vector.y * 0.052,
    }

    if (!isInside(next, aspect) || Math.hypot(vector.x, vector.y) < 0.0001) {
      break
    }

    head = next
  }

  const seedVector = field(head.x, head.y, t)
  const speed = Math.hypot(seedVector.x, seedVector.y)
  const targetLength =
    seedingMode === 'uniform'
      ? Math.round(12 + Math.min(28, speed * 10))
      : Math.round(8 + Math.min(20, speed * 8))
  const initialLength = Math.max(2, Math.min(targetLength, maxInitialPoints))
  const points = [head]
  let tail = head

  for (let i = 1; i < initialLength; i += 1) {
    const vector = clampMagnitude(field(tail.x, tail.y, t))
    const nextTail = {
      x: tail.x - vector.x * 0.055,
      y: tail.y - vector.y * 0.055,
    }

    if (!isInside(nextTail, aspect)) break
    points.unshift(nextTail)
    tail = nextTail
  }

  return {
    id,
    seedIndex,
    age: initialAge,
    maxAge: 4.6 + ((Math.sin(id * 12.9898 + seedIndex * 0.017) + 1) * 2.4),
    points,
  }
}

function resetTracers(count: number, aspect: number, field: Field, t: number) {
  return Array.from({ length: count }, (_, index) => {
    const initialAge = ((Math.sin(index * 78.233) + 1) / 2) * 4.2
    return makeTracer(
      index,
      index,
      aspect,
      field,
      t,
      'uniform',
      0,
      22,
      initialAge,
    )
  })
}

function resetDivergenceTracers(
  count: number,
  aspect: number,
  field: Field,
  t: number,
) {
  return Array.from({ length: count }, (_, index) => {
    const warmupSteps = (index * 13) % 42
    return makeTracer(
      index,
      index,
      aspect,
      field,
      t,
      'divergence',
      warmupSteps,
      10,
    )
  })
}

function isInDomain(point: Vector, aspect: number) {
  return (
    point.x > -simulationHalfRange * aspect &&
    point.x < simulationHalfRange * aspect &&
    point.y > -simulationHalfRange &&
    point.y < simulationHalfRange
  )
}

function isInUniformLineDomain(point: Vector, aspect: number) {
  return isInDomain(point, aspect)
}

function getCanvasTransform(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const width = rect.width
  const height = rect.height
  const scale = Math.min(width, height) / 8.2

  return {
    rect,
    originX: width / 2,
    originY: height / 2,
    scale,
  }
}

function screenToField(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const { rect, originX, originY, scale } = getCanvasTransform(canvas)

  return {
    x: (clientX - rect.left - originX) / scale,
    y: (originY - (clientY - rect.top)) / scale,
  }
}

function calculateCurl(field: Field, point: Vector, t: number) {
  const h = 0.015
  const qRight = field(point.x + h, point.y, t).y
  const qLeft = field(point.x - h, point.y, t).y
  const pUp = field(point.x, point.y + h, t).x
  const pDown = field(point.x, point.y - h, t).x

  return (qRight - qLeft) / (2 * h) - (pUp - pDown) / (2 * h)
}

function rungeKuttaStep(field: Field, point: Vector, t: number, h: number) {
  const k1 = clampParticleVelocity(field(point.x, point.y, t))
  const k2 = clampParticleVelocity(
    field(point.x + k1.x * h * 0.5, point.y + k1.y * h * 0.5, t),
  )
  const k3 = clampParticleVelocity(
    field(point.x + k2.x * h * 0.5, point.y + k2.y * h * 0.5, t),
  )
  const k4 = clampParticleVelocity(
    field(point.x + k3.x * h, point.y + k3.y * h, t),
  )

  return {
    x: point.x + (k1.x + k2.x * 2 + k3.x * 2 + k4.x) * (h / 6),
    y: point.y + (k1.y + k2.y * 2 + k3.y * 2 + k4.y) * (h / 6),
  }
}

function CurlProbeIcon({
  framed = true,
  mirrored = false,
}: {
  framed?: boolean
  mirrored?: boolean
}) {
  const glyph = (
    <>
      <path d="M15.8 8.2a5.1 5.1 0 1 0 1.3 5.3" />
      <path d="M16.2 5.7v3.1h-3.1" />
    </>
  )

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="curl-tool-icon">
      {framed ? <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /> : null}
      {mirrored ? (
        <g transform="translate(24 0) scale(-1 1)">{glyph}</g>
      ) : (
        glyph
      )}
    </svg>
  )
}

function DivergenceProbeIcon({ framed = true }: { framed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="divergence-tool-icon">
      {framed ? <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /> : null}
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="6.2" strokeDasharray="2.4 2.4" />
    </svg>
  )
}

function CompareProbeIcon() {
  return (
    <span className="compare-tool-icon" aria-hidden="true">
      <CurlProbeIcon framed={false} />
      <DivergenceProbeIcon framed={false} />
    </span>
  )
}

function getLineColor(
  mode: ColorMode,
  vector: Vector,
  speed: number,
  point: Vector,
  timeSeconds: number,
  lessonIndex: number,
) {
  if (mode === 'speed') {
    const hue = 205 - Math.min(170, speed * 48)
    const lightness = 46 + Math.min(12, speed * 3)
    return `hsla(${hue}, 82%, ${lightness}%, 0.66)`
  }

  if (mode === 'angle') {
    const hue = ((Math.atan2(vector.y, vector.x) * 180) / Math.PI + 360) % 360
    return `hsla(${hue}, 76%, 48%, 0.64)`
  }

  const hue = getFlowHue(point, timeSeconds, lessonIndex)
  return `hsla(${hue}, 78%, 45%, 0.64)`
}

function getParticleColor(
  mode: ColorMode,
  vector: Vector,
  speed: number,
  point: Vector,
  timeSeconds: number,
  lessonIndex: number,
) {
  if (mode === 'speed') {
    const hue = 188 - Math.min(150, speed * 32)
    return `hsla(${hue}, 88%, 53%, 0.9)`
  }

  if (mode === 'angle') {
    const hue = ((Math.atan2(vector.y, vector.x) * 180) / Math.PI + 360) % 360
    return `hsla(${hue}, 92%, 56%, 0.92)`
  }

  const hue = getFlowHue(point, timeSeconds, lessonIndex)
  return `hsla(${hue}, 68%, 55%, 0.88)`
}

function getFlowHue(point: Vector, timeSeconds: number, lessonIndex: number) {
  const phase = point.x * 0.68 - point.y * 0.46 + timeSeconds * 0.7
  const hue =
    188 +
    Math.sin(phase) * 58 +
    Math.sin(phase * 0.47 + 1.2) * 22 +
    lessonIndex * 14

  return ((hue % 360) + 360) % 360
}

function drawPath(
  context: CanvasRenderingContext2D,
  points: Vector[],
  toScreen: (point: Vector) => Vector,
) {
  let previousScreen: Vector | null = null

  points.forEach((point, pointIndex) => {
    const screen = toScreen(point)
    if (
      pointIndex === 0 ||
      !previousScreen ||
      Math.hypot(screen.x - previousScreen.x, screen.y - previousScreen.y) > 42
    ) {
      context.moveTo(screen.x, screen.y)
    } else {
      context.lineTo(screen.x, screen.y)
    }
    previousScreen = screen
  })
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  scale: number,
  alpha = 1,
) {
  context.lineWidth = 1
  context.strokeStyle = `rgba(232, 238, 242, ${alpha})`
  for (let x = originX % scale; x < width; x += scale) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
  for (let y = originY % scale; y < height; y += scale) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  context.strokeStyle = `rgba(207, 219, 226, ${alpha})`
  context.beginPath()
  context.moveTo(0, originY)
  context.lineTo(width, originY)
  context.moveTo(originX, 0)
  context.lineTo(originX, height)
  context.stroke()
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return null

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
  const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
  const resized = canvas.width !== nextWidth || canvas.height !== nextHeight

  if (resized) {
    canvas.width = nextWidth
    canvas.height = nextHeight
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  const width = rect.width
  const height = rect.height
  const scale = Math.min(width, height) / 8.2
  const originX = width / 2
  const originY = height / 2

  const toScreen = (point: Vector) => ({
    x: originX + point.x * scale,
    y: originY - point.y * scale,
  })

  return { context, width, height, scale, originX, originY, toScreen, resized }
}

function drawParticleField(
  canvas: HTMLCanvasElement,
  field: Field,
  colorMode: ColorMode,
  lineDensity: number,
  time: number,
  lessonIndex: number,
  particles: Particle[],
  deltaSeconds: number,
  showFieldArrows: boolean,
) {
  const prepared = prepareCanvas(canvas)
  if (!prepared) return

  const { context, width, height, scale, originX, originY, toScreen, resized } =
    prepared
  const aspect = width / height
  const particleCount = particleCountForWidth(width, lineDensity)
  const t = time / 1000
  const shouldReset = resized || particles.length !== particleCount

  if (shouldReset) {
    particles.splice(0, particles.length, ...resetParticles(particleCount, aspect))
  }

  if (shouldReset) {
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#ffffff'
  } else {
    context.fillStyle = `rgba(255, 255, 255, ${particleFadeAlpha})`
  }
  context.fillRect(0, 0, width, height)
  drawGrid(context, width, height, originX, originY, scale, 0.32)

  const frameScale = Math.min(3, Math.max(0, deltaSeconds * 60))
  const h = particleIntegrationStep * Math.max(0.25, frameScale || 1)
  const dropChance = Math.min(0.22, particleDropProbability * Math.max(1, frameScale))
  const particleSize = width < 720 ? 1.2 : 1.05

  context.globalCompositeOperation = 'source-over'
  for (const particle of particles) {
    const point = { x: particle.x, y: particle.y }

    if (isInDomain(point, aspect)) {
      const vector = field(point.x, point.y, t)
      const speed = Math.hypot(vector.x, vector.y)
      const screen = toScreen(point)

      if (
        screen.x >= -2 &&
        screen.x <= width + 2 &&
        screen.y >= -2 &&
        screen.y <= height + 2
      ) {
        context.fillStyle = getParticleColor(
          colorMode,
          vector,
          speed,
          point,
          t,
          lessonIndex,
        )
        context.fillRect(screen.x, screen.y, particleSize, particleSize)
      }
    }

    if (deltaSeconds <= 0) continue

    if (!isInDomain(point, aspect) || Math.random() < dropChance) {
      const fresh = makeParticle(particle.id, aspect)
      particle.x = fresh.x
      particle.y = fresh.y
      continue
    }

    const next = rungeKuttaStep(field, point, t, h)
    if (isInDomain(next, aspect)) {
      particle.x = next.x
      particle.y = next.y
    } else {
      const fresh = makeParticle(particle.id, aspect)
      particle.x = fresh.x
      particle.y = fresh.y
    }
  }

  if (showFieldArrows) {
    drawFieldArrows(context, width, height, originX, originY, scale, field, t)
  }
}

function drawFieldArrows(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  scale: number,
  field: Field,
  t: number,
) {
  const arrowStep = width < 720 ? 92 : 104
  context.lineWidth = 1.6
  context.strokeStyle = '#23313a'
  context.fillStyle = '#23313a'
  for (let sx = arrowStep / 2; sx < width; sx += arrowStep) {
    for (let sy = arrowStep / 2; sy < height; sy += arrowStep) {
      const x = (sx - originX) / scale
      const y = (originY - sy) / scale
      const vector = field(x, y, t)
      const magnitude = Math.hypot(vector.x, vector.y)
      if (magnitude < 0.001) continue

      const length = Math.min(25, 12 + magnitude * 8)
      const angle = Math.atan2(-vector.y, vector.x)
      const ex = sx + Math.cos(angle) * length
      const ey = sy + Math.sin(angle) * length

      context.beginPath()
      context.moveTo(sx, sy)
      context.lineTo(ex, ey)
      context.stroke()

      context.beginPath()
      context.moveTo(ex, ey)
      context.lineTo(
        ex - Math.cos(angle - 0.56) * 7,
        ey - Math.sin(angle - 0.56) * 7,
      )
      context.lineTo(
        ex - Math.cos(angle + 0.56) * 7,
        ey - Math.sin(angle + 0.56) * 7,
      )
      context.closePath()
      context.fill()
    }
  }
}

function drawVectorField(
  canvas: HTMLCanvasElement,
  field: Field,
  colorMode: ColorMode,
  seedingMode: SeedingMode,
  lineDensity: number,
  time: number,
  lessonIndex: number,
  tracers: Tracer[],
  particles: Particle[],
  deltaSeconds: number,
  showFieldArrows: boolean,
) {
  if (seedingMode === 'particle') {
    drawParticleField(
      canvas,
      field,
      colorMode,
      lineDensity,
      time,
      lessonIndex,
      particles,
      deltaSeconds,
      showFieldArrows,
    )
    return
  }

  const context = canvas.getContext('2d')
  if (!context) return

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
  const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  const width = rect.width
  const height = rect.height
  const aspect = width / height
  const scale = Math.min(width, height) / 8.2
  const originX = width / 2
  const originY = height / 2

  const toScreen = (point: Vector) => ({
    x: originX + point.x * scale,
    y: originY - point.y * scale,
  })

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  drawGrid(context, width, height, originX, originY, scale)

  const lineCount = lineCountForWidth(width, lineDensity, seedingMode)
  const t = time / 1000
  if (tracers.length !== lineCount) {
    tracers.splice(
      0,
      tracers.length,
      ...(seedingMode === 'divergence'
        ? resetDivergenceTracers(lineCount, aspect, field, t)
        : resetTracers(lineCount, aspect, field, t)),
    )
  }

  const stepSeconds = Math.min(0.045, Math.max(0, deltaSeconds))
  for (const tracer of tracers) {
    const head = tracer.points[tracer.points.length - 1]
    const rawVector = field(head.x, head.y, t)
    const vector = clampMagnitude(rawVector)
    const speed = Math.hypot(rawVector.x, rawVector.y)
    const divergence =
      seedingMode === 'divergence'
        ? calculateDivergence(field, head, t)
        : 0

    if (stepSeconds > 0) {
      tracer.age +=
        stepSeconds *
        (seedingMode === 'divergence'
          ? 1 + Math.max(0, -divergence) * 1.35
          : 1)

      const next = {
        x: head.x + vector.x * stepSeconds * 1.85,
        y: head.y + vector.y * stepSeconds * 1.85,
      }

      const frameScale = stepSeconds / (1 / 60)
      const randomDrop =
        seedingMode === 'uniform' &&
        Math.random() <
          Math.min(0.035, uniformLineDropProbability * frameScale)
      const nextInDomain =
        seedingMode === 'uniform'
          ? isInUniformLineDomain(next, aspect)
          : isInDomain(next, aspect)

      if (
        !randomDrop &&
        nextInDomain &&
        Math.hypot(vector.x, vector.y) > 0.0001 &&
        tracer.age < tracer.maxAge
      ) {
        tracer.points.push(next)
      } else {
        const fresh = makeTracer(
          tracer.id,
          tracer.seedIndex + lineCount,
          aspect,
          field,
          t,
          seedingMode,
          seedingMode === 'uniform'
            ? 0
            : (tracer.id * 11 + Math.floor(time * 0.02)) % 38,
          seedingMode === 'uniform' ? 22 : 3,
          0,
        )
        tracer.seedIndex = fresh.seedIndex
        tracer.age = fresh.age
        tracer.maxAge = fresh.maxAge
        tracer.points = fresh.points
      }
    }

    const targetLength =
      seedingMode === 'uniform'
        ? Math.round(12 + Math.min(28, speed * 10))
        : Math.round(7 + Math.min(20, speed * 8))
    while (tracer.points.length > targetLength) tracer.points.shift()

    if (tracer.points.length < 2) continue

    context.strokeStyle = getLineColor(
      colorMode,
      rawVector,
      speed,
      head,
      t,
      lessonIndex,
    )
    context.lineWidth = 1.55
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    drawPath(context, tracer.points, toScreen)
    context.stroke()
  }

  if (showFieldArrows) {
    drawFieldArrows(context, width, height, originX, originY, scale, field, t)
  }
}

type LineDensitySliderProps = {
  value: number
  onChange: (value: number) => void
}

function LineDensitySlider({ value, onChange }: LineDensitySliderProps) {
  const lastHapticValueRef = useRef(value)
  const tickValues = useMemo(
    () =>
      Array.from(
        { length: (densityMax - densityMin) / densityStep + 1 },
        (_, index) => densityMin + index * densityStep,
      ),
    [],
  )
  const progress = (value - densityMin) / (densityMax - densityMin)

  const pulse = useCallback((nextValue: number) => {
    if (nextValue === lastHapticValueRef.current) return
    lastHapticValueRef.current = nextValue
    if ('vibrate' in navigator) navigator.vibrate(7)
  }, [])

  const commitValue = useCallback(
    (nextValue: number) => {
      const clamped = clampDensity(nextValue)
      pulse(clamped)
      onChange(clamped)
    },
    [onChange, pulse],
  )

  const updateFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const nextProgress = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
      )
      commitValue(densityMin + nextProgress * (densityMax - densityMin))
    },
    [commitValue],
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromPointer(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return
    updateFromPointer(event)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      commitValue(value + densityStep)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      commitValue(value - densityStep)
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      commitValue(value + densityStep * 2)
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      commitValue(value - densityStep * 2)
    } else if (event.key === 'Home') {
      event.preventDefault()
      commitValue(densityMin)
    } else if (event.key === 'End') {
      event.preventDefault()
      commitValue(densityMax)
    }
  }

  return (
    <div className="density-control">
      <div
        className="density-slider"
        role="slider"
        tabIndex={0}
        aria-label="Line density"
        aria-valuemin={densityMin}
        aria-valuemax={densityMax}
        aria-valuenow={value}
        aria-valuetext={`${value}% line density`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
        style={
          {
            '--density-progress': progress,
            '--density-x': `${progress * 100}%`,
          } as CSSProperties
        }
      >
        <div className="density-ticks" aria-hidden="true">
          {tickValues.map((tick) => {
            return (
              <span
                key={tick}
                className={
                  tick === densityMin || tick === 100 || tick === densityMax
                    ? tick <= value
                      ? 'density-tick density-tick-major density-tick-on'
                      : 'density-tick density-tick-major'
                    : tick <= value
                      ? 'density-tick density-tick-on'
                      : 'density-tick'
                }
              />
            )
          })}
        </div>
        <span className="density-thumb" aria-hidden="true" />
      </div>
      <div className="density-readout">
        <span>Lines</span>
        <strong>{value}%</strong>
      </div>
    </div>
  )
}

type IntegratedMenuProps = {
  label: string
  value: string
  options: IntegratedMenuOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

function IntegratedMenu({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: IntegratedMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!isOpen || disabled) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [disabled, isOpen])

  return (
    <div className="integrated-menu" ref={menuRef}>
      <button
        type="button"
        className="menu-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen && !disabled}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen && !disabled ? (
        <div className="menu-popover" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value

            return (
              <button
                key={option.value}
                type="button"
                className="menu-option"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {selected ? <Check /> : null}
                </span>
                <span>{option.menuLabel ?? option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function formatMetricValue(value: number) {
  return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2)
}

function getLessonQuestions(kind: LessonKind) {
  return labQuestions
    .map((question, index) => ({ question, index }))
    .filter((item) => item.question.lessonKind === kind)
}

function getLessonSection(kind: LessonKind | 'intro') {
  return (
    lessonSections.find((section) => section.kind === kind) ?? lessonSections[0]
  )
}

function getQuestionOrdinal(index: number) {
  const question = labQuestions[index]
  const questions = getLessonQuestions(question.lessonKind)
  const ordinal = questions.findIndex((item) => item.index === index) + 1
  return {
    ordinal,
    total: questions.length,
  }
}

function getQuestionStatusClass(record: AnswerRecord | undefined) {
  if (!record) return 'empty'
  if (!record.submitted) return 'progress'
  return record.correct ? 'correct' : 'incorrect'
}

function getQuestionStatus(record: AnswerRecord | undefined) {
  if (!record) return 'Not started'
  if (!record.submitted) return 'In progress'
  return record.correct ? 'Correct' : 'Incorrect'
}

function CurlConceptDiagram({
  kind,
  label,
}: {
  kind: 'positive' | 'zero' | 'negative'
  label: string
}) {
  const isZero = kind === 'zero'
  const isNegative = kind === 'negative'
  const caption = isZero ? 'no turn' : isNegative ? 'clockwise' : 'counterclockwise'
  const Icon = isZero ? Minus : isNegative ? RotateCw : RotateCcw

  return (
    <div className={`curl-concept-diagram curl-concept-${kind}`}>
      <Icon className="curl-diagram-icon" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {caption}
      </span>
    </div>
  )
}

function DivergenceConceptDiagram({
  kind,
  label,
}: {
  kind: 'positive' | 'zero' | 'negative'
  label: string
}) {
  const caption =
    kind === 'positive' ? 'blob expands' : kind === 'negative' ? 'blob contracts' : 'same area'

  return (
    <div className={`divergence-concept-diagram divergence-concept-${kind}`}>
      <span className="divergence-blob-diagram" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>
        <strong>{label}</strong>
        {caption}
      </span>
    </div>
  )
}

function LocalMeasurementsIntro({ action }: { action?: ReactNode }) {
  return (
    <div className="lab-concept">
      <div className="lab-concept-copy">
        <strong>Fields have local stories.</strong>
        <span>
          At one point, a vector field can spin a tiny wheel, expand a tiny blob,
          compress it, or simply carry it along. These labs teach you to predict
          first, then test with a probe.
        </span>
      </div>
      <div className="local-concept-grid" aria-label="Local measurement guide">
        <div className="local-concept-card">
          <CurlConceptDiagram kind="positive" label="curl" />
          <p>Wheel test: does the nearby flow twist?</p>
        </div>
        <div className="local-concept-card">
          <DivergenceConceptDiagram kind="positive" label="divergence" />
          <p>Blob test: does the nearby flow change area?</p>
        </div>
      </div>
      <p>
        The whole pattern can be misleading. Each question asks what happens in
        a tiny neighborhood around the marked point.
      </p>
      {action}
    </div>
  )
}

function LessonConcept({ lessonKind }: { lessonKind: LessonKind }) {
  if (lessonKind === 'divergence') {
    return (
      <div className="lab-concept">
        <div className="lab-concept-copy">
          <strong>Divergence is local area change.</strong>
          <span>
            Imagine placing a tiny blob at a point. Divergence says whether the
            nearby arrows would make that blob expand, contract, or keep about
            the same area.
          </span>
        </div>
        <div className="curl-concept-grid" aria-label="Divergence sign guide">
          <DivergenceConceptDiagram kind="positive" label="positive" />
          <DivergenceConceptDiagram kind="zero" label="zero" />
          <DivergenceConceptDiagram kind="negative" label="negative" />
        </div>
        <p>
          Shape change is not enough. A blob can stretch or rotate while its
          area stays the same; divergence checks only local spreading or piling
          up.
        </p>
      </div>
    )
  }

  if (lessonKind === 'compare') {
    return (
      <div className="lab-concept">
        <div className="lab-concept-copy">
          <strong>Curl and divergence are different tests.</strong>
          <span>
            Use the wheel and blob together. A field can spin without spreading,
            spread without spinning, compress, or do neither.
          </span>
        </div>
        <div className="local-concept-grid" aria-label="Comparison guide">
          <div className="local-concept-card">
            <CurlConceptDiagram kind="positive" label="curl" />
            <p>Wheel turns: local spin.</p>
          </div>
          <div className="local-concept-card">
            <DivergenceConceptDiagram kind="negative" label="divergence" />
            <p>Blob changes area: expansion or compression.</p>
          </div>
        </div>
        <p>
          In the checkpoint, the useful question is not “does it move?” It is
          “which tiny test object changes?”
        </p>
      </div>
    )
  }

  return (
    <div className="lab-concept">
      <div className="lab-concept-copy">
        <strong>Curl is local spin.</strong>
        <span>
          Imagine placing a tiny paddle wheel at a point. Curl says whether the
          nearby arrows would twist that wheel, and which way it would turn.
        </span>
      </div>
      <div className="curl-concept-grid" aria-label="Curl sign guide">
        <CurlConceptDiagram kind="positive" label="positive" />
        <CurlConceptDiagram kind="zero" label="zero" />
        <CurlConceptDiagram kind="negative" label="negative" />
      </div>
      <p>
        Big circular paths are not the point. A field can stretch, slide, or
        flow in circles; the probe checks the tiny turning effect right where
        you place it.
      </p>
    </div>
  )
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visualizationRef = useRef<HTMLElement | null>(null)
  const tracersRef = useRef<Tracer[]>([])
  const particlesRef = useRef<Particle[]>([])
  const lastFrameTimeRef = useRef<number | null>(null)
  const [dx, setDx] = useState(presets[0].dx)
  const [dy, setDy] = useState(presets[0].dy)
  const [colorMode, setColorMode] = useState<ColorMode>('flow')
  const [seedingMode, setSeedingMode] = useState<SeedingMode>('uniform')
  const [lineDensity, setLineDensity] = useState(100)
  const [isPlaying, setIsPlaying] = useState(true)
  const [autoRandomize, setAutoRandomize] = useState(false)
  const [showFieldArrows, setShowFieldArrows] = useState(true)
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const [labPhase, setLabPhase] = useState<LabPhase>('predict')
  const [panelMode, setPanelMode] = useState<LabPanelMode>('intro')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const [answerRecords, setAnswerRecords] = useState<
    Record<number, AnswerRecord>
  >({})
  const [nearbyMarker, setNearbyMarker] = useState<string | null>(null)
  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([])
  const [probeEnabled, setProbeEnabled] = useState(false)
  const [probe, setProbe] = useState<ProbeState>({
    x: 0,
    y: 0,
    curl: 0,
    divergence: 0,
    visible: false,
  })
  const activeQuestion = labQuestions[activeQuestionIndex]
  const activeLesson = getLessonSection(activeQuestion.lessonKind)
  const activeQuestionOrdinal = getQuestionOrdinal(activeQuestionIndex)
  const activeAnswer = answerRecords[activeQuestionIndex]
  const selectedOption = activeAnswer?.selectedOption ?? null
  const answerSubmitted = activeAnswer?.submitted ?? false
  const canUseProbe = labPhase === 'predict' && selectedOption !== null
  const canSubmit = labPhase === 'investigate' && selectedOption !== null

  const field = useMemo<Field>(() => {
    const fx = compileExpression(dx)
    const fy = compileExpression(dy)
    return (x, y, t) => ({ x: fx(x, y, t), y: fy(x, y, t) })
  }, [dx, dy])

  const redraw = useCallback(
    (time = performance.now(), deltaSeconds = 0) => {
      if (canvasRef.current) {
        drawVectorField(
          canvasRef.current,
          field,
          colorMode,
          seedingMode,
          lineDensity,
          time,
          activeQuestionIndex,
          tracersRef.current,
          particlesRef.current,
          deltaSeconds,
          showFieldArrows,
        )
      }
    },
    [
      activeQuestionIndex,
      colorMode,
      field,
      lineDensity,
      seedingMode,
      showFieldArrows,
    ],
  )

  const syncMarkerPositions = useCallback(() => {
    if (!canvasRef.current || !visualizationRef.current) {
      setMarkerPositions([])
      return
    }

    const { rect, originX, originY, scale } = getCanvasTransform(
      canvasRef.current,
    )
    const sectionRect = visualizationRef.current.getBoundingClientRect()
    const t = performance.now() / 1000

    setMarkerPositions(
      activeQuestion.markers.map((marker) => ({
        ...marker,
        curl: calculateCurl(field, marker, t),
        divergence: calculateDivergence(field, marker, t),
        left: rect.left - sectionRect.left + originX + marker.x * scale,
        top: rect.top - sectionRect.top + originY - marker.y * scale,
      })),
    )
  }, [activeQuestion, field])

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncMarkerPositions)
    return () => window.cancelAnimationFrame(frame)
  }, [syncMarkerPositions])

  useEffect(() => {
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
  }, [field, lineDensity, seedingMode])

  const randomizeField = useCallback(() => {
    const next = randomField()
    setDx(next.dx)
    setDy(next.dy)
    setColorMode(next.colorMode ?? pick(generatedColorModes))
    setProbe((current) => ({ ...current, visible: false }))
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
  }, [])

  useEffect(() => {
    let frame = 0

    const tick = (time: number) => {
      const previous = lastFrameTimeRef.current ?? time
      const deltaSeconds = isPlaying ? (time - previous) / 1000 : 0
      lastFrameTimeRef.current = time
      redraw(time, deltaSeconds)
      if (isPlaying) frame = requestAnimationFrame(tick)
    }

    const handleResize = () => {
      tracersRef.current = []
      particlesRef.current = []
      redraw()
      window.requestAnimationFrame(syncMarkerPositions)
    }

    lastFrameTimeRef.current = null
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [isPlaying, redraw, syncMarkerPositions])

  useEffect(() => {
    if (!autoRandomize) return

    const interval = window.setInterval(randomizeField, 12000)
    return () => window.clearInterval(interval)
  }, [autoRandomize, randomizeField])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isEditing) return

      if (event.code === 'Space') {
        event.preventDefault()
        setIsPlaying((value) => !value)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const applyPreset = (name: string) => {
    const preset = presets.find((item) => item.name === name)
    if (!preset) return
    setDx(preset.dx)
    setDy(preset.dy)
  }

  const resetFlow = () => {
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
    redraw(performance.now(), 0.035)
  }

  const updateProbe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!probeEnabled || !canvasRef.current || !visualizationRef.current) return

    const fieldPoint = screenToField(
      canvasRef.current,
      event.clientX,
      event.clientY,
    )
    const sectionRect = visualizationRef.current.getBoundingClientRect()
    const t = performance.now() / 1000
    const curl = calculateCurl(field, fieldPoint, t)
    const divergence = calculateDivergence(field, fieldPoint, t)
    const closestMarker = activeQuestion.markers.reduce<{
      label: string
      distance: number
    } | null>((closest, marker) => {
      const distance = Math.hypot(fieldPoint.x - marker.x, fieldPoint.y - marker.y)
      if (!closest || distance < closest.distance) {
        return { label: marker.label, distance }
      }
      return closest
    }, null)

    setProbe({
      x: event.clientX - sectionRect.left,
      y: event.clientY - sectionRect.top,
      curl,
      divergence,
      visible: true,
    })
    setNearbyMarker(
      closestMarker && closestMarker.distance < 0.42 ? closestMarker.label : null,
    )
  }

  const hideProbe = () => {
    setProbe((current) => ({ ...current, visible: false }))
    setNearbyMarker(null)
  }

  const primaryProbeValue =
    activeQuestion.metric === 'divergence' ? probe.divergence : probe.curl
  const probeMagnitude =
    activeQuestion.metric === 'both'
      ? Math.min(4, Math.max(Math.abs(probe.curl), Math.abs(probe.divergence)))
      : Math.min(4, Math.abs(primaryProbeValue))
  const probeIntensity = Math.min(1, probeMagnitude / 4)
  const probeLabel =
    labPhase !== 'investigate'
      ? ''
      : activeQuestion.metric === 'both'
        ? `curl ${formatMetricValue(probe.curl)} | div ${formatMetricValue(probe.divergence)}`
        : formatMetricValue(primaryProbeValue)
  const probeHue =
    activeQuestion.metric === 'curl'
      ? probe.curl >= 0
        ? 181
        : 23
      : activeQuestion.metric === 'divergence'
        ? probe.divergence >= 0
          ? 181
          : 23
        : 196
  const divergenceScaleStart = probe.divergence > 0.05 ? 0.58 : probe.divergence < -0.05 ? 1.08 : 0.84
  const divergenceScaleEnd = probe.divergence > 0.05 ? 1.08 : probe.divergence < -0.05 ? 0.58 : 0.84
  const probeStyle = {
    left: `${probe.x}px`,
    top: `${probe.y}px`,
    '--probe-duration': `${Math.max(0.28, 1.7 / (0.25 + probeMagnitude))}s`,
    '--probe-direction': probe.curl >= 0 ? 'reverse' : 'normal',
    '--probe-intensity': probeIntensity,
    '--probe-hue': probeHue,
    '--blob-start': divergenceScaleStart,
    '--blob-end': divergenceScaleEnd,
  } as CSSProperties
  const fieldDetailsRevealed = labPhase !== 'predict' || answerSubmitted
  const displayedDx = fieldDetailsRevealed ? dx : 'hidden until probe'
  const displayedDy = fieldDetailsRevealed ? dy : 'hidden until probe'
  const presetMenuValue =
    fieldDetailsRevealed
      ? presets.find((preset) => preset.dx === dx && preset.dy === dy)?.name ?? ''
      : 'lab-field'
  const presetMenuOptions = [
    { value: 'lab-field', label: 'Lab field' },
    { value: '', label: 'Custom' },
    ...presets.map((preset) => ({ value: preset.name, label: preset.name })),
  ]
  const answeredCount = Object.values(answerRecords).filter(
    (record) => record.submitted,
  ).length
  const progressLabel =
    panelMode === 'intro' && !hasSeenIntro
      ? 'Intro'
      : `${activeLesson.shortTitle} ${activeQuestionOrdinal.ordinal}/${activeQuestionOrdinal.total}`

  const startLab = () => {
    setHasSeenIntro(true)
    const firstQuestion = labQuestions[0]
    setActiveQuestionIndex(0)
    setDx(firstQuestion.field.dx)
    setDy(firstQuestion.field.dy)
    setColorMode('flow')
    setSeedingMode('uniform')
    setShowFieldArrows(true)
    setPanelMode('question')
    setPanelCollapsed(false)
    setLabPhase(answerRecords[0]?.submitted ? 'explain' : 'predict')
    setProbeEnabled(false)
    hideProbe()
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
  }

  const selectOption = (option: string) => {
    if (labPhase !== 'predict') return
    setAnswerRecords((current) => ({
      ...current,
      [activeQuestionIndex]: {
        selectedOption: option,
        submitted: false,
        correct: false,
      },
    }))
  }

  const startInvestigation = () => {
    if (!canUseProbe) return
    setLabPhase('investigate')
    setSeedingMode(
      activeQuestion.metric === 'divergence' ? 'divergence' : 'uniform',
    )
    setProbeEnabled(true)
    hideProbe()
  }

  const submitAnswer = () => {
    if (!canSubmit || !selectedOption) return
    setAnswerRecords((current) => ({
      ...current,
      [activeQuestionIndex]: {
        selectedOption,
        submitted: true,
        correct: selectedOption === activeQuestion.answer,
      },
    }))
    setLabPhase('explain')
    setProbeEnabled(false)
    hideProbe()
  }

  const goToQuestion = (index: number) => {
    const record = answerRecords[index]
    const question = labQuestions[index]
    setActiveQuestionIndex(index)
    setDx(question.field.dx)
    setDy(question.field.dy)
    setColorMode('flow')
    setSeedingMode('uniform')
    setShowFieldArrows(true)
    setHasSeenIntro(true)
    setPanelMode('question')
    setPanelCollapsed(false)
    setLabPhase(record?.submitted ? 'explain' : 'predict')
    setProbeEnabled(false)
    hideProbe()
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
  }

  const goToNextQuestion = () => {
    goToQuestion((activeQuestionIndex + 1) % labQuestions.length)
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Vector field controls">
        <div className="brand">
          <Waves aria-hidden="true" />
          <span>Vector Fields</span>
        </div>

        <label className="formula-control formula-control-locked">
          <span>dx</span>
          <input
            value={displayedDx}
            readOnly
            aria-readonly="true"
            title={
              fieldDetailsRevealed
                ? 'The guided lab controls this field'
                : 'Make a prediction before seeing the formula'
            }
          />
        </label>

        <label className="formula-control formula-control-locked">
          <span>dy</span>
          <input
            value={displayedDy}
            readOnly
            aria-readonly="true"
            title={
              fieldDetailsRevealed
                ? 'The guided lab controls this field'
                : 'Make a prediction before seeing the formula'
            }
          />
        </label>

        <IntegratedMenu
          label="Preset vector field"
          value={presetMenuValue}
          options={presetMenuOptions}
          onChange={(nextValue) => {
            if (nextValue) applyPreset(nextValue)
          }}
          disabled
        />

        <IntegratedMenu
          label="Color mode"
          value={colorMode}
          options={colorModeOptions}
          onChange={(nextValue) => setColorMode(nextValue as ColorMode)}
        />

        <div className="seed-toggle" aria-label="Flow seeding mode">
          <button
            type="button"
            aria-pressed={seedingMode === 'uniform'}
            onClick={() => setSeedingMode('uniform')}
          >
            Uniform
          </button>
          <button
            type="button"
            aria-pressed={seedingMode === 'divergence'}
            onClick={() => setSeedingMode('divergence')}
          >
            Divergence
          </button>
          <button
            type="button"
            aria-pressed={seedingMode === 'particle'}
            onClick={() => setSeedingMode('particle')}
          >
            Particle
          </button>
        </div>

        <LineDensitySlider value={lineDensity} onChange={setLineDensity} />

        <button type="button" className="icon-button" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? 'Pause flow' : 'Play flow'}>
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => setShowFieldArrows((value) => !value)}
          aria-label={showFieldArrows ? 'Hide field arrows' : 'Show field arrows'}
          aria-pressed={showFieldArrows}
          title="Field arrows"
        >
          <Navigation2 aria-hidden="true" />
        </button>

        <button type="button" className="icon-button" onClick={randomizeField} aria-label="Randomize field" title="Randomize field" disabled>
          <Dices aria-hidden="true" />
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => {
            if (!autoRandomize) randomizeField()
            setAutoRandomize((value) => !value)
          }}
          aria-label={autoRandomize ? 'Stop auto randomize' : 'Start auto randomize'}
          aria-pressed={autoRandomize}
          title="Auto randomize"
          disabled
        >
          <Sparkles aria-hidden="true" />
        </button>

        <button type="button" className="icon-button" onClick={resetFlow} aria-label="Redraw field">
          <RotateCcw aria-hidden="true" />
        </button>
      </header>

      <aside className="probe-sidebar" aria-label="Visualization tools">
        <button
          type="button"
          className="probe-tool-button"
          aria-label={`${activeQuestion.metric === 'divergence' ? 'Divergence' : activeQuestion.metric === 'both' ? 'Comparison' : 'Curl'} probe`}
          aria-pressed={probeEnabled}
          title={
            labPhase === 'investigate'
              ? `${activeQuestion.metric === 'divergence' ? 'Divergence' : activeQuestion.metric === 'both' ? 'Comparison' : 'Curl'} probe`
              : 'Choose an answer and use the lab panel to turn on the probe'
          }
          disabled={labPhase !== 'investigate'}
          onClick={() => {
            setProbeEnabled((enabled) => !enabled)
            hideProbe()
          }}
        >
          {activeQuestion.metric === 'divergence' ? (
            <DivergenceProbeIcon />
          ) : activeQuestion.metric === 'both' ? (
            <CompareProbeIcon />
          ) : (
            <CurlProbeIcon />
          )}
        </button>
      </aside>

      <section
        ref={visualizationRef}
        className={probeEnabled ? 'visualization probe-active' : 'visualization'}
        aria-label="Vector field visualization"
      >
        <canvas
          ref={canvasRef}
          onPointerMove={updateProbe}
          onPointerLeave={hideProbe}
        />
        {markerPositions.map((marker) => {
          const active = nearbyMarker === marker.label

          return (
            <div
              key={marker.label}
              className={active ? 'field-marker field-marker-active' : 'field-marker'}
              style={{ left: marker.left, top: marker.top }}
              aria-label={`Point ${marker.label}`}
            >
              <span>{marker.label}</span>
              {labPhase === 'investigate' && active ? (
                <strong>
                  {activeQuestion.metric === 'divergence'
                    ? formatMetricValue(marker.divergence)
                    : activeQuestion.metric === 'both'
                      ? `c ${formatMetricValue(marker.curl)} | d ${formatMetricValue(marker.divergence)}`
                      : formatMetricValue(marker.curl)}
                </strong>
              ) : null}
            </div>
          )
        })}
        {probeEnabled && probe.visible ? (
          <div
            className={`metric-probe metric-probe-${activeQuestion.metric}`}
            style={probeStyle}
            data-reading={probeLabel}
            aria-hidden="true"
          >
            {activeQuestion.metric === 'divergence' ? (
              <span className="divergence-probe-blob" />
            ) : activeQuestion.metric === 'both' ? (
              <span className="comparison-probe-pair">
                <CurlProbeIcon framed={false} mirrored={probe.curl >= 0} />
                <span className="divergence-probe-blob" />
              </span>
            ) : (
              <CurlProbeIcon framed={false} mirrored={probe.curl >= 0} />
            )}
          </div>
        ) : null}

        {panelCollapsed ? (
          <button
            type="button"
            className="lab-panel-collapsed"
            onClick={() => setPanelCollapsed(false)}
            aria-label="Expand lab panel"
          >
            <span>
              <strong>{labTitle}</strong>
              <em>{progressLabel}</em>
            </span>
            <ChevronUp aria-hidden="true" />
          </button>
        ) : (
          <aside className="lab-panel" aria-label="Guided lab panel">
            <div className="lab-panel-header">
              <div>
                <span>{labTitle}</span>
                <strong>{progressLabel}</strong>
              </div>
              <div className="lab-panel-actions">
                {panelMode === 'intro' ? null : panelMode !== 'question' ? (
                  <button
                    type="button"
                    className="lab-icon-button"
                    onClick={() => setPanelMode('question')}
                    aria-label="Back to question"
                  >
                    <ArrowLeft aria-hidden="true" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="lab-text-button"
                      onClick={() => setPanelMode('concept')}
                    >
                      {activeQuestion.lessonKind === 'curl'
                        ? 'What is curl?'
                        : activeQuestion.lessonKind === 'divergence'
                          ? 'What is divergence?'
                          : 'Compare'}
                    </button>
                    <button
                      type="button"
                      className="lab-icon-button"
                      onClick={() => setPanelMode('menu')}
                      aria-label="Open lab menu"
                    >
                      <ListChecks aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="lab-icon-button"
                  onClick={() => setPanelCollapsed(true)}
                  aria-label="Collapse lab panel"
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
            </div>

            {panelMode === 'intro' || panelMode === 'concept' ? (
              panelMode === 'intro' ? (
                <LocalMeasurementsIntro
                  action={
                  <button
                    type="button"
                    className="lab-primary-button lab-start-button"
                    onClick={startLab}
                  >
                    Start Curl
                    <ArrowRight aria-hidden="true" />
                  </button>
                  }
                />
              ) : (
                <LessonConcept lessonKind={activeQuestion.lessonKind} />
              )
            ) : panelMode === 'menu' ? (
              <div className="lab-menu">
                <div className="lab-menu-summary">
                  <span>{answeredCount} submitted</span>
                  <strong>{lessonSections.length} lesson steps</strong>
                </div>
                <button
                  type="button"
                  className="lab-menu-row"
                  onClick={() => {
                    setPanelMode('intro')
                    setPanelCollapsed(false)
                  }}
                >
                  <span>0</span>
                  <strong>Local Measurements</strong>
                  <em className="lab-status lab-status-correct">
                    {hasSeenIntro ? 'Complete' : 'Intro'}
                  </em>
                </button>
                {lessonSections
                  .filter(
                    (section): section is LessonSection & { kind: LessonKind } =>
                      section.kind !== 'intro',
                  )
                  .map((section) => {
                    const questions = getLessonQuestions(section.kind)
                    const submitted = questions.filter(
                      ({ index }) => answerRecords[index]?.submitted,
                    ).length

                    return (
                      <div className="lab-menu-section" key={section.kind}>
                        <div className="lab-menu-section-title">
                          <strong>{section.title}</strong>
                          <span>
                            {submitted}/{questions.length}
                          </span>
                        </div>
                        {questions.map(({ question, index }, questionIndex) => {
                          const record = answerRecords[index]
                          const status = getQuestionStatus(record)
                          const active = index === activeQuestionIndex
                          const statusClass = getQuestionStatusClass(record)

                          return (
                            <button
                              key={`${question.lessonKind}-${question.title}`}
                              type="button"
                              className={
                                active
                                  ? 'lab-menu-row lab-menu-row-active'
                                  : 'lab-menu-row'
                              }
                              onClick={() => goToQuestion(index)}
                            >
                              <span>{questionIndex + 1}</span>
                              <strong>{question.title}</strong>
                              <em className={`lab-status lab-status-${statusClass}`}>
                                {status}
                              </em>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="lab-question">
                <div className="lab-phase-row">
                  <span className={`lab-phase lab-phase-${labPhase}`}>
                    {labPhase}
                  </span>
                  <span>{activeQuestion.title}</span>
                </div>
                <p>{activeQuestion.prompt}</p>
                {labPhase === 'predict' ? (
                  <span className="lab-hint">
                    Predict from the motion and marker positions first. The
                    formula is hidden until you turn on the probe.
                  </span>
                ) : (
                  <span className="lab-hint lab-hint-revealed">
                    {activeQuestion.revealedInsight}
                  </span>
                )}
                <div className="lab-options" role="radiogroup">
                  {activeQuestion.options.map((option) => {
                    const selected = selectedOption === option
                    const correct = answerSubmitted && option === activeQuestion.answer
                    const wrong =
                      answerSubmitted && selected && option !== activeQuestion.answer
                    const className = [
                      'lab-option',
                      selected ? 'lab-option-selected' : '',
                      correct ? 'lab-option-correct' : '',
                      wrong ? 'lab-option-incorrect' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')

                    return (
                      <button
                        key={option}
                        type="button"
                        className={className}
                        role="radio"
                        aria-checked={selected}
                        disabled={labPhase !== 'predict'}
                        onClick={() => selectOption(option)}
                      >
                        <span>{option}</span>
                        {selected ? <Check aria-hidden="true" /> : null}
                      </button>
                    )
                  })}
                </div>

                {labPhase === 'explain' && activeAnswer ? (
                  <div
                    className={
                      activeAnswer.correct
                        ? 'lab-feedback lab-feedback-correct'
                        : 'lab-feedback lab-feedback-incorrect'
                    }
                  >
                    <strong>
                      {activeAnswer.correct ? 'Correct' : 'Not quite'}
                    </strong>
                    <span>{activeQuestion.explanation}</span>
                  </div>
                ) : null}

                <div className="lab-controls">
                  {labPhase === 'predict' ? (
                    <button
                      type="button"
                      className="lab-primary-button"
                      disabled={!canUseProbe}
                      onClick={startInvestigation}
                    >
                      Use Probe
                    </button>
                  ) : null}
                  {labPhase === 'investigate' ? (
                    <button
                      type="button"
                      className="lab-primary-button"
                      disabled={!canSubmit}
                      onClick={submitAnswer}
                    >
                      Submit
                    </button>
                  ) : null}
                  {labPhase === 'explain' ? (
                    <button
                      type="button"
                      className="lab-primary-button"
                      onClick={goToNextQuestion}
                    >
                      Next
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        )}
      </section>
    </main>
  )
}

export default App
