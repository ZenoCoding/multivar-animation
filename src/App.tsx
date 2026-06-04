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
  Trash2,
  MoveUpRight,
} from 'lucide-react'
import './App.css'

type Vector = { x: number; y: number }
type Field = (x: number, y: number, t: number, out?: Vector) => Vector
type ColorMode = 'flow' | 'speed' | 'angle'
type SeedingMode = 'streamlines' | 'particle'
type Tracer = {
  id: number
  seedIndex: number
  age: number
  maxAge: number
  targetLength: number
  dying: boolean
  points: Vector[]
}
type Particle = {
  id: number
  x: number
  y: number
  px: number
  py: number
}
type ProbeState = {
  x: number
  y: number
  fieldX: number
  fieldY: number
  vx: number
  vy: number
  curl: number
  divergence: number
  visible: boolean
}

interface PlacedProbe {
  id: string
  fieldX: number
  fieldY: number
  metric: ProbeMetric
}

interface SyncedPlacedProbe extends PlacedProbe {
  x: number
  y: number
  vx: number
  vy: number
  curl: number
  divergence: number
}

type LabPhase = 'predict' | 'investigate' | 'explain'
type LabPanelMode = 'intro' | 'question' | 'concept' | 'menu'
type LessonKind = 'curl' | 'divergence' | 'compare'
type ProbeMetric = 'curl' | 'divergence' | 'both' | 'vector'

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
  field?: Field
  renderHints?: FieldRenderHints
}

type IntegratedMenuOption = {
  value: string
  label: string
  menuLabel?: string
}

type DivergenceFeature = Vector & {
  value: number
  kind: 'source' | 'sink'
}

type FieldRenderHints = {
  divergenceFeatures?: DivergenceFeature[]
  sourceSeeds?: Vector[]
  avoidedSeedPoints?: Vector[]
}

type TracerSeed = {
  point: Vector
  sourceSeed: boolean
}

const pointChargeRadius = 0.24
const sourceTracerSpawnDelayMax = 2.8
const pointCharges = [
  { x: -3.55, y: 2.25, strength: 1 },
  { x: -1.25, y: 1.65, strength: -1 },
  { x: 1.35, y: 2.18, strength: 1 },
  { x: 3.62, y: 1.62, strength: -1 },
  { x: -3.72, y: -1.78, strength: -1 },
  { x: -1.35, y: -2.32, strength: 1 },
  { x: 1.42, y: -1.7, strength: -1 },
  { x: 3.7, y: -2.28, strength: 1 },
] as const

const pointChargeFeatures: DivergenceFeature[] = pointCharges.map((charge) => ({
  x: charge.x,
  y: charge.y,
  value: charge.strength * 2.8,
  kind: charge.strength > 0 ? 'source' : 'sink',
}))

const pointChargeRenderHints: FieldRenderHints = {
  divergenceFeatures: pointChargeFeatures,
  sourceSeeds: pointChargeFeatures
    .filter((feature) => feature.kind === 'source')
    .map(({ x, y }) => ({ x, y })),
  avoidedSeedPoints: pointChargeFeatures.map(({ x, y }) => ({ x, y })),
}

function eightPointChargeField(x: number, y: number, _t: number, out?: Vector) {
  let fx = 0
  let fy = 0
  for (let i = 0; i < pointCharges.length; i++) {
    const charge = pointCharges[i]
    const dx = x - charge.x
    const dy = y - charge.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0) continue

    const denominator = Math.max(distance, pointChargeRadius) ** 3
    fx += (charge.strength * dx) / denominator
    fy += (charge.strength * dy) / denominator
  }
  if (out) {
    out.x = fx
    out.y = fy
    return out
  }
  return { x: fx, y: fy }
}

const presets: Preset[] = [
  { name: 'Curl', dx: '-y', dy: 'x' },
  { name: 'Source', dx: 'x', dy: 'y' },
  { name: 'Sink', dx: '-x', dy: '-y' },
  { name: 'Shear', dx: 'y', dy: '0.35 * sin(x)' },
  { name: 'Saddle', dx: 'x', dy: '-y' },
  {
    name: '8 Charges',
    dx: 'sum(q_i * (x - x_i) / r_i^3)',
    dy: 'sum(q_i * (y - y_i) / r_i^3)',
    colorMode: 'speed',
    field: eightPointChargeField,
    renderHints: pointChargeRenderHints,
  },
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
      'Compared with the blob center, nearby arrows carry each edge outward. The blob would grow in area, so the divergence is positive.',
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
      'Compared with the blob center, nearby arrows carry the edges inward. The blob would shrink in area, so the divergence is negative.',
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
    title: 'Field A',
    field: { dx: '-y', dy: 'x' },
    markers: [{ label: 'A', x: 1.6, y: 1.4 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Spin and expansion', 'Neither'],
    answer: 'Spin',
    explanation:
      'The tiny wheel turns, but the tiny blob keeps its area. This field has curl without divergence.',
    revealedInsight: 'Compare the wheel and blob: spin can happen without spreading.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Field B',
    field: { dx: 'x', dy: 'y' },
    markers: [{ label: 'A', x: -1.25, y: 1.15 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Spin and expansion', 'Neither'],
    answer: 'Expansion',
    explanation:
      'The tiny blob expands while the tiny wheel does not get twisted. This field has divergence without curl.',
    revealedInsight: 'The blob grows here, but there is no local wheel spin.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Field C',
    field: { dx: '-x', dy: '-y' },
    markers: [{ label: 'A', x: 1.35, y: -1.05 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Spin and expansion', 'Neither'],
    answer: 'Compression',
    explanation:
      'The tiny blob contracts while the tiny wheel does not turn. Negative divergence means local compression.',
    revealedInsight: 'The blob shrinks here, but the wheel does not spin.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Field D',
    field: { dx: 'x', dy: '-y' },
    markers: [{ label: 'A', x: 1.4, y: 1.2 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Spin and expansion', 'Neither'],
    answer: 'Neither',
    explanation:
      'The tiny shape stretches and squeezes, but it does not spin and its area does not change overall.',
    revealedInsight: 'Deformation can look dramatic while curl and divergence are both zero.',
  },
  {
    lessonKind: 'compare',
    metric: 'both',
    title: 'Field E',
    field: { dx: 'x - y', dy: 'x + y' },
    markers: [{ label: 'A', x: -1.25, y: -1.05 }],
    prompt: 'Which local effect is happening at A?',
    options: ['Spin', 'Expansion', 'Compression', 'Spin and expansion', 'Neither'],
    answer: 'Spin and expansion',
    explanation:
      'The wheel turns and the blob expands. Curl and divergence are separate local tests, so one field can have both.',
    revealedInsight: 'Both test objects change here: the wheel turns and the blob grows.',
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
const tickValues = [10, 30, 50, 70, 90, 100, 160, 220, 280, 340, 400]
const densityMin = 10
const densityMax = 400
const lineTracerBaseCount = {
  compact: 700,
  wide: 1400,
}
const lineTracerLengthScale = 2
const particleDropProbability = 0.009
const particleIntegrationStep = 0.012
const particleFadeAlpha = 0.075
const divergenceFeatureThreshold = 0.18

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
  let closest = tickValues[0]
  let minDiff = Math.abs(value - closest)
  for (let i = 1; i < tickValues.length; i++) {
    const diff = Math.abs(value - tickValues[i])
    if (diff < minDiff) {
      minDiff = diff
      closest = tickValues[i]
    }
  }
  return closest
}

function lineCountForWidth(width: number, density: number) {
  const baseCount =
    width < 720 ? lineTracerBaseCount.compact : lineTracerBaseCount.wide
  return Math.round(baseCount * (density / 100))
}

const lineTracerLengthMultiplier = 0.6
const lineTracerSpeedMultiplier = 0.6

function lineTracerTargetLength(speed: number) {
  return Math.round(
    (12 + Math.min(28, speed * 10)) *
      lineTracerLengthScale *
      lineTracerLengthMultiplier,
  )
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
    // Test execution with dummy inputs to catch reference/type errors at compile time
    fn(0, 0, 0, ...values)
  } catch {
    return () => 0
  }

  return (x: number, y: number, t: number) => {
    const value = Number(fn(x, y, t, ...values))
    return Number.isFinite(value) ? value : 0
  }
}

function clampMagnitude(vector: Vector) {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) return { x: 0, y: 0 }
  const scale = Math.min(2, magnitude) / magnitude
  return { x: vector.x * scale, y: vector.y * scale }
}

function clampMagnitudeOut(vx: number, vy: number, out: Vector) {
  const magnitude = Math.hypot(vx, vy)
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) {
    out.x = 0
    out.y = 0
    return out
  }
  const scale = Math.min(2, magnitude) / magnitude
  out.x = vx * scale
  out.y = vy * scale
  return out
}


function clampParticleVelocityOut(vx: number, vy: number, out: Vector) {
  const magnitude = Math.hypot(vx, vy)
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) {
    out.x = 0
    out.y = 0
    return out
  }
  const scale = Math.min(4, magnitude) / magnitude
  out.x = vx * scale
  out.y = vy * scale
  return out
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

function seededRandom(seed: number, salt = 0) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
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

function makeSourceSeed(seedIndex: number, sourceSeeds: Vector[]) {
  const source = sourceSeeds[Math.floor(seededRandom(seedIndex, 1) * sourceSeeds.length)]
  const angle = seededRandom(seedIndex, 2) * Math.PI * 2
  const radius = pointChargeRadius * (0.06 + seededRandom(seedIndex, 3) * 0.16)

  return {
    x: source.x + Math.cos(angle) * radius,
    y: source.y + Math.sin(angle) * radius,
  }
}

function isNearAnyPoint(point: Vector, centers: Vector[], radius: number) {
  return centers.some(
    (center) => Math.hypot(point.x - center.x, point.y - center.y) < radius,
  )
}

function makeTracerSeed(
  seedIndex: number,
  aspect: number,
  renderHints?: FieldRenderHints,
): TracerSeed {
  const sourceSeeds = renderHints?.sourceSeeds ?? []
  const useSourceSeed =
    sourceSeeds.length > 0 && seededRandom(seedIndex, 4) < 0.68

  if (useSourceSeed) {
    return {
      point: makeSourceSeed(seedIndex, sourceSeeds),
      sourceSeed: true,
    }
  }

  const avoidedSeedPoints = renderHints?.avoidedSeedPoints ?? []
  let seed = makeUniformSeed(seedIndex, aspect)

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    if (
      avoidedSeedPoints.length === 0 ||
      !isNearAnyPoint(seed, avoidedSeedPoints, pointChargeRadius * 1.15)
    ) {
      return { point: seed, sourceSeed: false }
    }

    seed = makeUniformSeed(seedIndex + attempt * 997, aspect)
  }

  return { point: seed, sourceSeed: false }
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
    px: point.x,
    py: point.y,
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

function makeTracer(
  id: number,
  seedIndex: number,
  aspect: number,
  field: Field,
  t: number,
  renderHints?: FieldRenderHints,
  warmupSteps = 0,
  initialAge = warmupSteps * 0.045,
): Tracer {
  const isInside = isInUniformLineDomain
  const seed = makeTracerSeed(seedIndex, aspect, renderHints)
  let head = seed.point

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
  const targetLength = lineTracerTargetLength(speed)
  const sourceDelay = seed.sourceSeed
    ? seededRandom(seedIndex, 5) * sourceTracerSpawnDelayMax
    : 0
  const points = [head]

  return {
    id,
    seedIndex,
    age: seed.sourceSeed ? -sourceDelay : initialAge,
    maxAge: 4.6 + ((Math.sin(id * 12.9898 + seedIndex * 0.017) + 1) * 2.4),
    targetLength,
    dying: false,
    points,
  }
}

function resetTracers(
  count: number,
  aspect: number,
  field: Field,
  t: number,
  renderHints?: FieldRenderHints,
) {
  return Array.from({ length: count }, (_, index) => {
    // Generate a pseudo-random initial age between -3.5 and 4.5.
    // Negative values act as a start delay (spawn delay) so they don't all grow at once.
    // Positive values start growing immediately but are already partially aged to stagger lifetimes.
    const rand = seededRandom(index, 6)
    const initialAge = rand * 8.0 - 3.5
    return makeTracer(
      index,
      index,
      aspect,
      field,
      t,
      renderHints,
      0,
      initialAge,
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

function CompareProbeIcon({ framed = true }: { framed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="compare-tool-icon-svg">
      {framed ? <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /> : null}
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="4.0" strokeDasharray="1.5 1.5" />
      <path d="M17.2 8.0 a6.6 6.6 0 1 0 0.8 5.6" />
      <path d="M17.5 5.5 v2.8 h-2.8" />
    </svg>
  )
}


function getTracerHue(
  mode: ColorMode,
  vx: number,
  vy: number,
  speed: number,
  point: Vector,
  timeSeconds: number,
  lessonIndex: number,
) {
  if (mode === 'speed') {
    const hue = 225 - Math.min(185, speed * 40)
    return Math.max(0, Math.min(359, Math.round(hue)))
  }

  if (mode === 'angle') {
    const hue = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360
    return Math.max(0, Math.min(359, Math.round(hue)))
  }

  const hue = getFlowHue(point, timeSeconds, lessonIndex)
  return Math.max(0, Math.min(359, Math.round(((hue % 360) + 360) % 360)))
}

function getTracerColorStr(mode: ColorMode, hue: number) {
  if (mode === 'speed') {
    const speed = (225 - hue) / 40
    const lightness = 46 + Math.min(12, speed * 3)
    return `hsla(${hue}, 82%, ${lightness}%, 0.66)`
  }

  if (mode === 'angle') {
    return `hsla(${hue}, 76%, 48%, 0.64)`
  }

  return `hsla(${hue}, 78%, 45%, 0.64)`
}

const tracerHueGroups = Array.from({ length: 360 }, () => [] as Tracer[])

function getTracerLineColorSample(
  mode: ColorMode,
  field: Field,
  points: Vector[],
  t: number,
  fallbackVectorX: number,
  fallbackVectorY: number,
  fallbackSpeed: number,
  tempV: Vector,
  perfScale = 1.0,
) {
  if (mode !== 'speed') {
    return { vx: fallbackVectorX, vy: fallbackVectorY, speed: fallbackSpeed }
  }

  let vx = fallbackVectorX
  let vy = fallbackVectorY
  let speed = Number.isFinite(fallbackSpeed) ? fallbackSpeed : 0
  
  const maxSamples = perfScale < 0.5 ? 1 : perfScale < 0.85 ? 3 : 6
  if (maxSamples <= 1) {
    return { vx, vy, speed }
  }

  const stride = Math.max(1, Math.floor(points.length / maxSamples))

  for (let index = 0; index < points.length; index += stride) {
    const point = points[index]
    field(point.x, point.y, t, tempV)
    const sampledSpeed = Math.hypot(tempV.x, tempV.y)

    if (Number.isFinite(sampledSpeed) && sampledSpeed > speed) {
      vx = tempV.x
      vy = tempV.y
      speed = sampledSpeed
    }
  }

  return { vx, vy, speed }
}


function getParticleHue(
  mode: ColorMode,
  vx: number,
  vy: number,
  speed: number,
  px: number,
  py: number,
  t: number,
  lessonIndex: number,
) {
  if (mode === 'speed') {
    const hue = 225 - Math.min(185, speed * 40)
    return Math.max(0, Math.min(359, Math.round(hue)))
  }
  if (mode === 'angle') {
    const hue = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360
    return Math.max(0, Math.min(359, Math.round(hue)))
  }
  const phase = px * 0.68 - py * 0.46 + t * 0.7
  const hue =
    188 +
    Math.sin(phase) * 58 +
    Math.sin(phase * 0.47 + 1.2) * 22 +
    lessonIndex * 14

  return Math.max(0, Math.min(359, Math.round(((hue % 360) + 360) % 360)))
}

const particleHueGroups = Array.from({ length: 360 }, () => [] as number[])

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
  context.beginPath()
  for (let x = originX % scale; x < width; x += scale) {
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }
  for (let y = originY % scale; y < height; y += scale) {
    context.moveTo(0, y)
    context.lineTo(width, y)
  }
  context.stroke()

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
  density: number,
  time: number,
  lessonIndex: number,
  particles: Particle[],
  deltaSeconds: number,
  showFieldArrows: boolean,
  showDivergenceEmphasis: boolean,
  renderHints?: FieldRenderHints,
  perfScale = 1.0,
  lastActiveParticleCountRef?: React.MutableRefObject<number>,
  suspendSpawning = false,
) {
  const prepared = prepareCanvas(canvas)
  if (!prepared) return

  const { context, width, height, scale, originX, originY, toScreen, resized } =
    prepared

  if (suspendSpawning) {
    context.fillStyle = `rgba(255, 255, 255, ${particleFadeAlpha * 2.5})`
    context.fillRect(0, 0, width, height)
    drawGrid(context, width, height, originX, originY, scale, 0.32)
    return
  }
  const aspect = width / height
  const particleCount = particleCountForWidth(width, density)
  const activeParticleCount = Math.round(particleCount * perfScale)
  const t = time / 1000
  const shouldReset = resized || particles.length !== particleCount

  if (shouldReset) {
    particles.splice(0, particles.length, ...resetParticles(particleCount, aspect))
    if (lastActiveParticleCountRef) {
      lastActiveParticleCountRef.current = activeParticleCount
    }
  }

  if (shouldReset) {
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#ffffff'
  } else {
    context.fillStyle = `rgba(255, 255, 255, ${particleFadeAlpha})`
  }
  context.fillRect(0, 0, width, height)
  drawGrid(context, width, height, originX, originY, scale, 0.32)
  if (showDivergenceEmphasis) {
    drawDivergenceEmphasis(
      context,
      aspect,
      scale,
      toScreen,
      field,
      t,
      time,
      renderHints?.divergenceFeatures,
      perfScale,
    )
  }

  const frameScale = Math.min(3, Math.max(0, deltaSeconds * 60))
  const h = particleIntegrationStep * Math.max(0.25, frameScale || 1)
  const dropChance = Math.min(0.22, particleDropProbability * Math.max(1, frameScale))
  const particleSize = width < 720 ? 1.2 : 1.05

  // Clear pre-allocated hue groups
  for (let i = 0; i < 360; i++) {
    particleHueGroups[i].length = 0
  }

  // Pre-allocate temporary vectors for integration
  const tempV = { x: 0, y: 0 }
  const k1 = { x: 0, y: 0 }
  const k2 = { x: 0, y: 0 }
  const k3 = { x: 0, y: 0 }
  const k4 = { x: 0, y: 0 }

  const lastActiveCount = lastActiveParticleCountRef ? lastActiveParticleCountRef.current : 0

  context.globalCompositeOperation = 'source-over'
  for (let i = 0; i < activeParticleCount; i++) {
    const particle = particles[i]
    if (!particle) continue

    // Seed newly activated particles fresh so they don't jump from old stale coordinates
    if (lastActiveParticleCountRef && i >= lastActiveCount) {
      const fresh = makeParticle(particle.id, aspect)
      particle.x = fresh.x
      particle.y = fresh.y
      particle.px = fresh.x
      particle.py = fresh.y
    }

    if (isInDomain(particle, aspect)) {
      field(particle.x, particle.y, t, tempV)
      const speed = Math.hypot(tempV.x, tempV.y)
      const screenX = originX + particle.x * scale
      const screenY = originY - particle.y * scale
      const screenPrevX = originX + particle.px * scale
      const screenPrevY = originY - particle.py * scale

      const onScreen =
        (screenX >= -2 && screenX <= width + 2 && screenY >= -2 && screenY <= height + 2) ||
        (screenPrevX >= -2 && screenPrevX <= width + 2 && screenPrevY >= -2 && screenPrevY <= height + 2)

      if (onScreen) {
        const hue = getParticleHue(
          colorMode,
          tempV.x,
          tempV.y,
          speed,
          particle.x,
          particle.y,
          t,
          lessonIndex,
        )
        particleHueGroups[hue].push(screenPrevX, screenPrevY, screenX, screenY)
      }
    }

    if (deltaSeconds <= 0) continue

    if (!isInDomain(particle, aspect) || Math.random() < dropChance) {
      const fresh = makeParticle(particle.id, aspect)
      particle.x = fresh.x
      particle.y = fresh.y
      particle.px = fresh.x
      particle.py = fresh.y
      continue
    }

    // Adaptive integration based on performance scale to reduce field evaluation load
    let nextX: number
    let nextY: number

    if (perfScale >= 0.75) {
      // Inlined Runge-Kutta RK4 step with zero object allocations (4 field calls)
      field(particle.x, particle.y, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k1)

      field(particle.x + k1.x * h * 0.5, particle.y + k1.y * h * 0.5, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k2)

      field(particle.x + k2.x * h * 0.5, particle.y + k2.y * h * 0.5, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k3)

      field(particle.x + k3.x * h, particle.y + k3.y * h, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k4)

      nextX = particle.x + (k1.x + k2.x * 2 + k3.x * 2 + k4.x) * (h / 6)
      nextY = particle.y + (k1.y + k2.y * 2 + k3.y * 2 + k4.y) * (h / 6)
    } else if (perfScale >= 0.4) {
      // Midpoint method RK2 (2 field calls)
      field(particle.x, particle.y, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k1)

      field(particle.x + k1.x * h * 0.5, particle.y + k1.y * h * 0.5, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k2)

      nextX = particle.x + k2.x * h
      nextY = particle.y + k2.y * h
    } else {
      // Euler method (1 field call)
      field(particle.x, particle.y, t, tempV)
      clampParticleVelocityOut(tempV.x, tempV.y, k1)

      nextX = particle.x + k1.x * h
      nextY = particle.y + k1.y * h
    }

    tempV.x = nextX
    tempV.y = nextY
    if (isInDomain(tempV, aspect)) {
      particle.px = particle.x
      particle.py = particle.y
      particle.x = nextX
      particle.y = nextY
    } else {
      const fresh = makeParticle(particle.id, aspect)
      particle.x = fresh.x
      particle.y = fresh.y
      particle.px = fresh.x
      particle.py = fresh.y
    }
  }

  if (lastActiveParticleCountRef) {
    lastActiveParticleCountRef.current = activeParticleCount
  }

  // Draw batched particles by hue as line segments
  let getParticleColorStr: (hue: number) => string
  if (colorMode === 'speed') {
    getParticleColorStr = (hue) => `hsla(${hue}, 88%, 53%, 0.9)`
  } else if (colorMode === 'angle') {
    getParticleColorStr = (hue) => `hsla(${hue}, 92%, 56%, 0.92)`
  } else {
    getParticleColorStr = (hue) => `hsla(${hue}, 68%, 55%, 0.88)`
  }

  context.lineWidth = particleSize
  context.lineCap = 'round'
  for (let hue = 0; hue < 360; hue++) {
    const coords = particleHueGroups[hue]
    if (coords.length === 0) continue

    context.strokeStyle = getParticleColorStr(hue)
    context.beginPath()
    for (let i = 0; i < coords.length; i += 4) {
      context.moveTo(coords[i], coords[i + 1])
      context.lineTo(coords[i + 2], coords[i + 3])
    }
    context.stroke()
  }

  if (showFieldArrows) {
    drawFieldArrows(context, width, height, originX, originY, scale, field, t, perfScale)
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
  perfScale = 1.0,
) {
  const xMin = Math.ceil(-originX / scale)
  const xMax = Math.floor((width - originX) / scale)
  const yMin = Math.ceil((originY - height) / scale)
  const yMax = Math.floor(originY / scale)

  context.lineWidth = 1.6
  context.strokeStyle = '#23313a'
  context.fillStyle = '#23313a'
  context.beginPath()

  const arrowHeads: number[] = []
  const tempV = { x: 0, y: 0 }
  const step = perfScale < 0.6 ? 2 : 1

  for (let x = xMin; x <= xMax; x += step) {
    for (let y = yMin; y <= yMax; y += step) {
      const sx = originX + x * scale
      const sy = originY - y * scale
      field(x, y, t, tempV)
      const magnitude = Math.hypot(tempV.x, tempV.y)
      if (magnitude < 0.001) continue

      const length = Math.min(45, 8 + magnitude * 5)
      const angle = Math.atan2(-tempV.y, tempV.x)
      const ex = sx + Math.cos(angle) * length
      const ey = sy + Math.sin(angle) * length

      context.moveTo(sx, sy)
      context.lineTo(ex, ey)

      arrowHeads.push(ex, ey, angle)
    }
  }
  context.stroke()

  context.beginPath()
  for (let i = 0; i < arrowHeads.length; i += 3) {
    const ex = arrowHeads[i]
    const ey = arrowHeads[i + 1]
    const angle = arrowHeads[i + 2]
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
  }
  context.fill()
}

function findDivergenceFeatures(field: Field, aspect: number, t: number, perfScale = 1.0): DivergenceFeature[] {
  const xLimit = visibleHalfRange * aspect
  const yLimit = visibleHalfRange
  const xSteps = perfScale < 0.6 ? 11 : 17
  const ySteps = perfScale < 0.6 ? 9 : 13
  const candidates: DivergenceFeature[] = []
  let total = 0
  let count = 0
  let minValue = Number.POSITIVE_INFINITY
  let maxValue = Number.NEGATIVE_INFINITY

  for (let yi = 0; yi < ySteps; yi += 1) {
    const y = -yLimit + (yi / (ySteps - 1)) * yLimit * 2
    for (let xi = 0; xi < xSteps; xi += 1) {
      const x = -xLimit + (xi / (xSteps - 1)) * xLimit * 2
      const value = calculateDivergence(field, { x, y }, t)
      if (!Number.isFinite(value)) continue

      total += value
      count += 1
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
      if (Math.abs(value) >= divergenceFeatureThreshold) {
        candidates.push({
          x,
          y,
          value,
          kind: (value > 0 ? 'source' : 'sink') as 'source' | 'sink',
        })
      }
    }
  }

  if (count > 0) {
    const average = total / count
    if (
      Math.abs(average) >= divergenceFeatureThreshold &&
      maxValue - minValue < 0.08
    ) {
      return [
        {
          x: 0,
          y: 0,
          value: average,
          kind: (average > 0 ? 'source' : 'sink') as 'source' | 'sink',
        },
      ]
    }
  }

  const features: DivergenceFeature[] = []
  const sorted = candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  for (const candidate of sorted) {
    if (
      features.filter((feature) => feature.kind === candidate.kind).length >= 4
    ) {
      continue
    }
    if (
      features.some(
        (feature) =>
          feature.kind === candidate.kind &&
          Math.hypot(feature.x - candidate.x, feature.y - candidate.y) < 1.45,
      )
    ) {
      continue
    }

    features.push(candidate)
    if (features.length >= 8) break
  }

  if (features.length === 0 && count > 0) {
    const average = total / count
    if (Math.abs(average) >= divergenceFeatureThreshold) {
      features.push({
        x: 0,
        y: 0,
        value: average,
        kind: (average > 0 ? 'source' : 'sink') as 'source' | 'sink',
      })
    }
  }

  return features
}

let cachedDivergenceField: Field | null = null
let cachedDivergenceFeatures: DivergenceFeature[] = []
let cachedDivergenceAspect = 0
let lastDivergenceCalcTime = 0
let cachedFieldIsStatic = false

function drawDivergenceEmphasis(
  context: CanvasRenderingContext2D,
  aspect: number,
  scale: number,
  toScreen: (point: Vector) => Vector,
  field: Field,
  t: number,
  timeMs: number,
  divergenceFeatures?: DivergenceFeature[],
  perfScale = 1.0,
) {
  let features = divergenceFeatures
  if (!features) {
    const fieldChanged = field !== cachedDivergenceField
    const aspectChanged = aspect !== cachedDivergenceAspect

    if (fieldChanged) {
      // Test field with different times to check if it is static
      const v1 = field(1.2, 1.2, 0)
      const v2 = field(1.2, 1.2, 10.0)
      cachedFieldIsStatic = Math.abs(v1.x - v2.x) < 1e-7 && Math.abs(v1.y - v2.y) < 1e-7
      cachedDivergenceField = field
    }

    const shouldRecompute =
      fieldChanged ||
      aspectChanged ||
      (!cachedFieldIsStatic && timeMs - lastDivergenceCalcTime > (perfScale < 0.6 ? 800 : 250))

    if (shouldRecompute) {
      cachedDivergenceFeatures = findDivergenceFeatures(field, aspect, t, perfScale)
      cachedDivergenceAspect = aspect
      lastDivergenceCalcTime = timeMs
    }
    features = cachedDivergenceFeatures
  }

  if (features.length === 0) return

  context.save()
  for (const feature of features) {
    const screen = toScreen(feature)
    const intensity = Math.min(1, Math.abs(feature.value) / 2.8)
    const hue = feature.kind === 'source' ? 181 : 23
    const radius = (0.42 + intensity * 0.28) * scale
    const gradient = context.createRadialGradient(
      screen.x,
      screen.y,
      radius * 0.16,
      screen.x,
      screen.y,
      radius,
    )

    gradient.addColorStop(0, `hsla(${hue}, 78%, 55%, ${0.15 + intensity * 0.1})`)
    gradient.addColorStop(0.58, `hsla(${hue}, 80%, 54%, ${0.08 + intensity * 0.06})`)
    gradient.addColorStop(1, `hsla(${hue}, 82%, 54%, 0)`)
    context.fillStyle = gradient
    context.beginPath()
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = `hsla(${hue}, 72%, 39%, ${0.36 + intensity * 0.22})`
    context.lineWidth = 1.4
    context.setLineDash([5, 5])
    context.beginPath()
    context.arc(screen.x, screen.y, radius * 0.55, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])

    context.fillStyle = `hsla(${hue}, 72%, 34%, ${0.8 + intensity * 0.12})`
    context.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(feature.kind === 'source' ? '+' : '-', screen.x, screen.y)
  }
  context.restore()
}

function drawVectorField(
  canvas: HTMLCanvasElement,
  field: Field,
  colorMode: ColorMode,
  seedingMode: SeedingMode,
  density: number,
  time: number,
  lessonIndex: number,
  tracers: Tracer[],
  particles: Particle[],
  deltaSeconds: number,
  showFieldArrows: boolean,
  showDivergenceEmphasis: boolean,
  renderHints?: FieldRenderHints,
  perfScale = 1.0,
  lastActiveLineCountRef?: React.MutableRefObject<number>,
  lastActiveParticleCountRef?: React.MutableRefObject<number>,
  suspendSpawning = false,
) {
  if (seedingMode === 'particle') {
    drawParticleField(
      canvas,
      field,
      colorMode,
      density,
      time,
      lessonIndex,
      particles,
      deltaSeconds,
      showFieldArrows,
      showDivergenceEmphasis,
      renderHints,
      perfScale,
      lastActiveParticleCountRef,
      suspendSpawning,
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
  const t = time / 1000

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  drawGrid(context, width, height, originX, originY, scale)
  if (showDivergenceEmphasis) {
    drawDivergenceEmphasis(
      context,
      aspect,
      scale,
      toScreen,
      field,
      t,
      time,
      renderHints?.divergenceFeatures,
      perfScale,
    )
  }

  const lineCount = lineCountForWidth(width, density)
  const activeLineCount = Math.round(lineCount * perfScale)
  const shouldResetTracers = tracers.length !== lineCount
  if (shouldResetTracers) {
    tracers.splice(
      0,
      tracers.length,
      ...resetTracers(lineCount, aspect, field, t, renderHints),
    )
    if (lastActiveLineCountRef) {
      lastActiveLineCountRef.current = activeLineCount
    }
  }

  // Clear pre-allocated hue groups
  for (let i = 0; i < 360; i++) {
    tracerHueGroups[i].length = 0
  }

  // Pre-allocate temporary vectors to reuse for all tracers
  const tempV = { x: 0, y: 0 }
  const vector = { x: 0, y: 0 }

  const lastActiveCount = lastActiveLineCountRef ? lastActiveLineCountRef.current : 0

  const stepSeconds = Math.min(0.045, Math.max(0, deltaSeconds))
  for (let i = 0; i < activeLineCount; i++) {
    const tracer = tracers[i]
    if (!tracer) continue

    // Re-seed newly activated tracers fresh so they don't jump or look weird
    if (!suspendSpawning && lastActiveLineCountRef && i >= lastActiveCount) {
      const fresh = makeTracer(
        tracer.id,
        tracer.seedIndex + lineCount,
        aspect,
        field,
        t,
        renderHints,
        0,
        0,
      )
      tracer.seedIndex = fresh.seedIndex
      tracer.age = fresh.age
      tracer.maxAge = fresh.maxAge
      tracer.targetLength = fresh.targetLength
      tracer.dying = fresh.dying
      tracer.points = fresh.points
    }

    if (stepSeconds > 0 && (tracer.dying || suspendSpawning)) {
      if (tracer.points.length > 1) {
        tracer.points.shift()
      } else {
        if (!suspendSpawning) {
          const fresh = makeTracer(
            tracer.id,
            tracer.seedIndex + lineCount,
            aspect,
            field,
            t,
            renderHints,
            0,
            0,
          )
          tracer.seedIndex = fresh.seedIndex
          tracer.age = fresh.age
          tracer.maxAge = fresh.maxAge
          tracer.targetLength = fresh.targetLength
          tracer.dying = fresh.dying
          tracer.points = fresh.points
        }
      }
      continue
    }

    if (tracer.age < 0) {
      if (stepSeconds > 0) tracer.age = Math.min(0, tracer.age + stepSeconds)
      continue
    }

    const head = tracer.points[tracer.points.length - 1]
    field(head.x, head.y, t, tempV)
    clampMagnitudeOut(tempV.x, tempV.y, vector)
    const speed = Math.hypot(tempV.x, tempV.y)
    const moving = Math.hypot(vector.x, vector.y) > 0.0001

    if (stepSeconds > 0 && !tracer.dying) {
      tracer.age += stepSeconds

      const next = {
        x: head.x + vector.x * stepSeconds * 1.6 * lineTracerSpeedMultiplier,
        y: head.y + vector.y * stepSeconds * 1.6 * lineTracerSpeedMultiplier,
      }

      const nextInDomain = isInUniformLineDomain(next, aspect)

      if (
        nextInDomain &&
        moving &&
        tracer.age < tracer.maxAge
      ) {
        tracer.points.push(next)
      } else {
        tracer.dying = true
      }
    }

    if (!tracer.dying) {
      while (tracer.points.length > tracer.targetLength) tracer.points.shift()
    }

    if (tracer.points.length < 2) continue

    const colorSample = getTracerLineColorSample(
      colorMode,
      field,
      tracer.points,
      t,
      tempV.x,
      tempV.y,
      speed,
      tempV,
      perfScale,
    )

    const hue = getTracerHue(
      colorMode,
      colorSample.vx,
      colorSample.vy,
      colorSample.speed,
      head,
      t,
      lessonIndex,
    )

    tracerHueGroups[hue].push(tracer)
  }

  if (lastActiveLineCountRef) {
    lastActiveLineCountRef.current = activeLineCount
  }

  // Draw batched tracer strokes
  context.lineWidth = 1.55
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (let hue = 0; hue < 360; hue++) {
    const group = tracerHueGroups[hue]
    if (group.length === 0) continue

    context.strokeStyle = getTracerColorStr(colorMode, hue)
    context.beginPath()
    for (let i = 0; i < group.length; i++) {
      drawPath(context, group[i].points, toScreen)
    }
    context.stroke()
  }

  if (showFieldArrows) {
    drawFieldArrows(context, width, height, originX, originY, scale, field, t, perfScale)
  }
}

type DensitySliderProps = {
  value: number
  onChange: (value: number) => void
}

function DensitySlider({ value, onChange }: DensitySliderProps) {
  const lastHapticValueRef = useRef(value)
  const currentIndex = useMemo(() => {
    const idx = tickValues.indexOf(value)
    if (idx !== -1) return idx
    // Fallback to find closest
    let closestIdx = 0
    let minDiff = Math.abs(value - tickValues[0])
    for (let i = 1; i < tickValues.length; i++) {
      const diff = Math.abs(value - tickValues[i])
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }
    return closestIdx
  }, [value])

  const progress = currentIndex / (tickValues.length - 1)

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
      const exactIndex = nextProgress * (tickValues.length - 1)
      const index = Math.round(exactIndex)
      commitValue(tickValues[index])
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
      const nextIndex = Math.min(tickValues.length - 1, currentIndex + 1)
      commitValue(tickValues[nextIndex])
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = Math.max(0, currentIndex - 1)
      commitValue(tickValues[nextIndex])
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      const nextIndex = Math.min(tickValues.length - 1, currentIndex + 2)
      commitValue(tickValues[nextIndex])
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      const nextIndex = Math.max(0, currentIndex - 2)
      commitValue(tickValues[nextIndex])
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
        aria-label="Density"
        aria-valuemin={densityMin}
        aria-valuemax={densityMax}
        aria-valuenow={value}
        aria-valuetext={`${(value / 100).toFixed(1)}x density`}
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
        <span>Density</span>
        <strong>{`${(value / 100).toFixed(1)}x`}</strong>
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

function formatCompactValue(value: number) {
  const formatted = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2)
  if (value > 0.005) {
    return `+${formatted}`
  }
  if (value < -0.005) {
    return formatted
  }
  return '0.00'
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

function getProbeReadingLabel(
  metric: ProbeMetric,
  curl: number,
  divergence: number,
) {
  if (metric === 'vector') {
    return 'vector telemetry'
  }
  if (metric === 'both') {
    return `curl: ${formatCompactValue(curl)} | div: ${formatCompactValue(divergence)}`
  }
  return metric === 'divergence'
    ? `div: ${formatCompactValue(divergence)}`
    : `curl: ${formatCompactValue(curl)}`
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
            spread without spinning, do both, compress, or do neither.
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

function decodeURLParam(val: string): string {
  if (!val) return ''
  
  // Clean up mangled form-urlencoded patterns (like '+++', '+*+', etc.)
  const cleaned = val
    .replace(/\+\+\+/g, ' + ')
    .replace(/\+\*\+/g, ' * ')
    .replace(/\+\/\+/g, ' / ')
    .replace(/\+-+/g, ' - ')
    .replace(/\+,+/g, ', ')
    .replace(/,\+\+/g, ', + ')
    .replace(/,\+/g, ', ')
    .replace(/\(\+/g, '( ')
    .replace(/\+\)/g, ' )')

  try {
    return decodeURIComponent(cleaned)
  } catch {
    return cleaned
  }
}

function getInitialURLParams() {
  if (typeof window === 'undefined') {
    return {
      dx: presets[0].dx,
      dy: presets[0].dy,
      colorMode: 'flow' as ColorMode,
      seedingMode: 'streamlines' as SeedingMode,
      density: 100,
    }
  }

  const query: Record<string, string> = {}
  const search = window.location.search
  if (search && search.charAt(0) === '?') {
    const pairs = search.substring(1).split('&')
    for (const pair of pairs) {
      const eq = pair.indexOf('=')
      if (eq !== -1) {
        const key = pair.substring(0, eq)
        const val = pair.substring(eq + 1)
        query[key] = val
      }
    }
  }

  const dxParam = query['dx'] ? decodeURLParam(query['dx']) : null
  const dyParam = query['dy'] ? decodeURLParam(query['dy']) : null
  const colorModeParam = query['colorMode'] ? decodeURIComponent(query['colorMode']) : null
  const seedingModeParam = query['seedingMode'] ? decodeURIComponent(query['seedingMode']) : null
  const densityParam = query['density'] ? decodeURIComponent(query['density']) : null

  return {
    dx: dxParam !== null ? dxParam : presets[0].dx,
    dy: dyParam !== null ? dyParam : presets[0].dy,
    colorMode: (colorModeParam === 'flow' || colorModeParam === 'speed' || colorModeParam === 'angle' ? colorModeParam : 'flow') as ColorMode,
    seedingMode: (seedingModeParam === 'streamlines' || seedingModeParam === 'particle' ? seedingModeParam : 'streamlines') as SeedingMode,
    density: densityParam !== null && !isNaN(Number(densityParam))
      ? Math.max(10, Math.min(400, Number(densityParam)))
      : 100,
  }
}

function blendFields(
  oldField: Field,
  newField: Field,
  startTime: number,
  time: number,
  duration = 800
): Field {
  const elapsed = time - startTime
  const alpha = Math.min(1, Math.max(0, elapsed / duration))

  if (alpha >= 1) {
    return newField
  }

  const easeAlpha = alpha < 0.5
    ? 4 * alpha * alpha * alpha
    : 1 - Math.pow(-2 * alpha + 2, 3) / 2

  return (x, y, t, out) => {
    const vOld = oldField(x, y, t)
    const vNew = newField(x, y, t)
    const rx = (1 - easeAlpha) * vOld.x + easeAlpha * vNew.x
    const ry = (1 - easeAlpha) * vOld.y + easeAlpha * vNew.y
    if (out) {
      out.x = rx
      out.y = ry
      return out
    }
    return { x: rx, y: ry }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visualizationRef = useRef<HTMLElement | null>(null)
  const tracersRef = useRef<Tracer[]>([])
  const particlesRef = useRef<Particle[]>([])
  const lastFrameTimeRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const perfScaleRef = useRef(1.0)
  const frameTimeFilteredRef = useRef(16.6)
  const lastActiveLineCountRef = useRef(0)
  const lastActiveParticleCountRef = useRef(0)
  const transitionFieldOldRef = useRef<Field | null>(null)
  const transitionStartTimeRef = useRef<number | null>(null)
  const previousFieldRef = useRef<Field | null>(null)
  const initialParams = useMemo(() => getInitialURLParams(), [])
  const [dx, setDx] = useState(initialParams.dx)
  const [dy, setDy] = useState(initialParams.dy)
  const [colorMode, setColorMode] = useState<ColorMode>(initialParams.colorMode)
  const [seedingMode, setSeedingMode] = useState<SeedingMode>(initialParams.seedingMode)
  const [showDivergenceEmphasis, setShowDivergenceEmphasis] = useState(false)
  const [density, setDensity] = useState(initialParams.density)
  const [isPlaying, setIsPlaying] = useState(true)
  const [autoRandomize, setAutoRandomize] = useState(false)
  const [showFieldArrows, setShowFieldArrows] = useState(true)
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const [labStarted, setLabStarted] = useState(false)
  const [labPhase, setLabPhase] = useState<LabPhase>('predict')
  const [panelMode, setPanelMode] = useState<LabPanelMode>('intro')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [welcomePage, setWelcomePage] = useState(1)
  const [isDismissing, setIsDismissing] = useState(false)
  const exploreBtnRef = useRef<HTMLButtonElement | null>(null)

  const dismissWelcome = useCallback(() => {
    setIsDismissing(true)
  }, [])

  const handleExplosionComplete = useCallback(() => {
    setShowWelcome(false)
  }, [])
  const [answerRecords, setAnswerRecords] = useState<
    Record<number, AnswerRecord>
  >({})
  const [nearbyMarker, setNearbyMarker] = useState<string | null>(null)
  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([])
  const [probeEnabled, setProbeEnabled] = useState(false)
  const [hasProbeReading, setHasProbeReading] = useState(false)
  const [probe, setProbe] = useState<ProbeState>({
    x: 0,
    y: 0,
    fieldX: 0,
    fieldY: 0,
    vx: 0,
    vy: 0,
    curl: 0,
    divergence: 0,
    visible: false,
  })
  const [playgroundMetric, setPlaygroundMetric] = useState<ProbeMetric>('both')
  const [placedProbes, setPlacedProbes] = useState<PlacedProbe[]>([])
  const [syncedPlacedProbes, setSyncedPlacedProbes] = useState<SyncedPlacedProbe[]>([])
  const activeQuestion = labQuestions[activeQuestionIndex]
  const activeMetric = labStarted ? activeQuestion.metric : playgroundMetric
  const activeLesson = getLessonSection(activeQuestion.lessonKind)
  const activeQuestionOrdinal = getQuestionOrdinal(activeQuestionIndex)
  const activeAnswer = answerRecords[activeQuestionIndex]
  const selectedOption = activeAnswer?.selectedOption ?? null
  const answerSubmitted = activeAnswer?.submitted ?? false
  const canUseProbe = labPhase === 'predict' && selectedOption !== null
  const canSubmit = labPhase === 'investigate' && selectedOption !== null
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.dx === dx && preset.dy === dy),
    [dx, dy],
  )

  const field = useMemo<Field>(() => {
    if (selectedPreset?.field) return selectedPreset.field

    const fx = compileExpression(dx)
    const fy = compileExpression(dy)
    return (x, y, t, out) => {
      const vx = fx(x, y, t)
      const vy = fy(x, y, t)
      if (out) {
        out.x = vx
        out.y = vy
        return out
      }
      return { x: vx, y: vy }
    }
  }, [dx, dy, selectedPreset])

  const getTransitionField = useCallback((time: number): Field => {
    const targetField = field
    const oldField = transitionFieldOldRef.current
    const startTime = transitionStartTimeRef.current

    if (!oldField || startTime === null) {
      return targetField
    }

    const elapsed = time - startTime
    const duration = 800 // 800ms morph duration
    const alpha = Math.min(1, Math.max(0, elapsed / duration))

    if (alpha >= 1) {
      transitionFieldOldRef.current = null
      transitionStartTimeRef.current = null
      return targetField
    }

    const easeAlpha = alpha < 0.5
      ? 4 * alpha * alpha * alpha
      : 1 - Math.pow(-2 * alpha + 2, 3) / 2

    return (x, y, t, out) => {
      const vOld = oldField(x, y, t)
      const vNew = targetField(x, y, t)
      const rx = (1 - easeAlpha) * vOld.x + easeAlpha * vNew.x
      const ry = (1 - easeAlpha) * vOld.y + easeAlpha * vNew.y
      if (out) {
        out.x = rx
        out.y = ry
        return out
      }
      return { x: rx, y: ry }
    }
  }, [field])

  useEffect(() => {
    if (field !== previousFieldRef.current) {
      if (previousFieldRef.current) {
        const now = performance.now()
        // If already transitioning, capture the blended state at this instant;
        // otherwise, capture the previous target field.
        const oldActiveField =
          transitionFieldOldRef.current && transitionStartTimeRef.current !== null
            ? blendFields(
                transitionFieldOldRef.current,
                previousFieldRef.current,
                transitionStartTimeRef.current,
                now
              )
            : previousFieldRef.current

        transitionFieldOldRef.current = oldActiveField
        transitionStartTimeRef.current = now
      }
      previousFieldRef.current = field
    }
  }, [field])

  const redraw = useCallback(
    (time = performance.now(), deltaSeconds = 0) => {
      if (canvasRef.current) {
        const activeField = getTransitionField(time)
        drawVectorField(
          canvasRef.current,
          activeField,
          colorMode,
          seedingMode,
          density,
          time,
          activeQuestionIndex,
          tracersRef.current,
          particlesRef.current,
          deltaSeconds,
          showFieldArrows,
          showDivergenceEmphasis,
          selectedPreset?.renderHints,
          perfScaleRef.current,
          lastActiveLineCountRef,
          lastActiveParticleCountRef,
          isDismissing,
        )
      }
    },
    [
      activeQuestionIndex,
      colorMode,
      getTransitionField,
      density,
      seedingMode,
      selectedPreset,
      showDivergenceEmphasis,
      showFieldArrows,
      isDismissing,
    ],
  )

  const syncPositions = useCallback(() => {
    if (!canvasRef.current || !visualizationRef.current) {
      setMarkerPositions([])
      setSyncedPlacedProbes([])
      return
    }

    const { rect, originX, originY, scale } = getCanvasTransform(
      canvasRef.current,
    )
    const sectionRect = visualizationRef.current.getBoundingClientRect()
    const now = performance.now()
    const t = now / 1000
    const activeField = getTransitionField(now)

    if (labStarted) {
      setMarkerPositions(
        activeQuestion.markers.map((marker) => ({
          ...marker,
          curl: calculateCurl(activeField, marker, t),
          divergence: calculateDivergence(activeField, marker, t),
          left: rect.left - sectionRect.left + originX + marker.x * scale,
          top: rect.top - sectionRect.top + originY - marker.y * scale,
        })),
      )
    } else {
      setMarkerPositions([])
    }

    setSyncedPlacedProbes(
      placedProbes.map((probe) => {
        const vel = activeField(probe.fieldX, probe.fieldY, t)
        const curl = calculateCurl(activeField, { x: probe.fieldX, y: probe.fieldY }, t)
        const divergence = calculateDivergence(activeField, { x: probe.fieldX, y: probe.fieldY }, t)
        return {
          ...probe,
          x: rect.left - sectionRect.left + originX + probe.fieldX * scale,
          y: rect.top - sectionRect.top + originY - probe.fieldY * scale,
          vx: vel.x,
          vy: vel.y,
          curl,
          divergence,
        }
      })
    )
  }, [activeQuestion, getTransitionField, labStarted, placedProbes])

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncPositions)
    return () => window.cancelAnimationFrame(frame)
  }, [syncPositions])

  useEffect(() => {
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
    lastActiveLineCountRef.current = 0
    lastActiveParticleCountRef.current = 0
  }, [density, seedingMode])

  const randomizeField = useCallback(() => {
    const next = randomField()
    setDx(next.dx)
    setDy(next.dy)
    setColorMode(next.colorMode ?? pick(generatedColorModes))
    setShowDivergenceEmphasis(false)
    setProbe((current) => ({ ...current, visible: false }))
  }, [])

  useEffect(() => {
    let frame = 0

    const tick = (time: number) => {
      const previous = lastFrameTimeRef.current ?? time
      const deltaSeconds = isPlaying ? (time - previous) / 1000 : 0
      lastFrameTimeRef.current = time

      if (isPlaying && previous !== time) {
        const frameTime = time - previous
        const clampedFrameTime = Math.min(150, frameTime)
        
        // Low-pass filter to smooth frame times and filter spikes
        frameTimeFilteredRef.current = frameTimeFilteredRef.current * 0.95 + clampedFrameTime * 0.05
        
        // Dynamic scaling: target 30fps (approx 33ms per frame).
        // If frame time is consistently above 35ms (~28fps), scale quality down.
        // If frame time is consistently below 22ms (~45fps), scale quality up.
        if (frameTimeFilteredRef.current > 35.0) {
          perfScaleRef.current = Math.max(0.25, perfScaleRef.current - 0.005)
        } else if (frameTimeFilteredRef.current < 22.0) {
          perfScaleRef.current = Math.min(1.0, perfScaleRef.current + 0.003)
        }
      }

      redraw(time, deltaSeconds)
      if (isPlaying) frame = requestAnimationFrame(tick)
    }

    const handleResize = () => {
      tracersRef.current = []
      particlesRef.current = []
      lastActiveLineCountRef.current = 0
      lastActiveParticleCountRef.current = 0
      redraw()
      window.requestAnimationFrame(syncPositions)
    }

    lastFrameTimeRef.current = null
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [isPlaying, redraw, syncPositions])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('dx', dx)
    params.set('dy', dy)
    if (colorMode !== 'flow') params.set('colorMode', colorMode)
    if (seedingMode !== 'streamlines') params.set('seedingMode', seedingMode)
    if (density !== 100) params.set('density', String(density))

    const newSearch = params.toString().replace(/\+/g, '%20')
    const newURL = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`
    window.history.replaceState(null, '', newURL)
  }, [dx, dy, colorMode, seedingMode, density])

  useEffect(() => {
    if (!autoRandomize) return

    const interval = window.setInterval(randomizeField, 12000)
    return () => window.clearInterval(interval)
  }, [autoRandomize, randomizeField])

  useEffect(() => {
    if (!showWelcome) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (welcomePage === 1) {
          setWelcomePage(2)
        } else {
          dismissWelcome()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showWelcome, welcomePage, dismissWelcome])

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
    if (preset.colorMode) setColorMode(preset.colorMode)
  }

  const resetFlow = () => {
    tracersRef.current = []
    particlesRef.current = []
    lastFrameTimeRef.current = null
    lastActiveLineCountRef.current = 0
    lastActiveParticleCountRef.current = 0
    redraw(performance.now(), 0.035)
  }

  const openLabIntro = () => {
    setLabStarted(true)
    setPanelMode('intro')
    setPanelCollapsed(false)
    setProbeEnabled(false)
    setPlacedProbes([])
    hideProbe()
  }

  const updateProbe = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!probeEnabled || !canvasRef.current || !visualizationRef.current) return

    const fieldPoint = screenToField(
      canvasRef.current,
      event.clientX,
      event.clientY,
    )
    const sectionRect = visualizationRef.current.getBoundingClientRect()
    const now = performance.now()
    const t = now / 1000
    const activeField = getTransitionField(now)
    const curl = calculateCurl(activeField, fieldPoint, t)
    const divergence = calculateDivergence(activeField, fieldPoint, t)
    const vel = activeField(fieldPoint.x, fieldPoint.y, t)
    const closestMarker = labStarted
      ? activeQuestion.markers.reduce<{
          label: string
          distance: number
        } | null>((closest, marker) => {
          const distance = Math.hypot(fieldPoint.x - marker.x, fieldPoint.y - marker.y)
          if (!closest || distance < closest.distance) {
            return { label: marker.label, distance }
          }
          return closest
        }, null)
      : null

    setProbe({
      x: event.clientX - sectionRect.left,
      y: event.clientY - sectionRect.top,
      fieldX: fieldPoint.x,
      fieldY: fieldPoint.y,
      vx: vel.x,
      vy: vel.y,
      curl,
      divergence,
      visible: true,
    })
    setHasProbeReading(true)
    setNearbyMarker(
      closestMarker && closestMarker.distance < 0.42 ? closestMarker.label : null,
    )
  }

  const startProbeGesture = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!probeEnabled) return
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic pointer events do not create an active pointer capture.
    }
    updateProbe(event)
  }

  const endProbeGesture = (event: PointerEvent<HTMLCanvasElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore unmatched synthetic pointer capture events.
    }

    if (pointerStartRef.current && probeEnabled && canvasRef.current) {
      const elapsed = performance.now() - pointerStartRef.current.time
      const dist = Math.hypot(
        event.clientX - pointerStartRef.current.x,
        event.clientY - pointerStartRef.current.y,
      )
      if (elapsed < 300 && dist < 6) {
        const fieldPoint = screenToField(
          canvasRef.current,
          event.clientX,
          event.clientY,
        )
        const newProbe: PlacedProbe = {
          id: Math.random().toString(36).substr(2, 9),
          fieldX: fieldPoint.x,
          fieldY: fieldPoint.y,
          metric: activeMetric,
        }
        setPlacedProbes((current) => [...current, newProbe])
      }
    }
    pointerStartRef.current = null
  }

  const hideProbe = () => {
    setProbe((current) => ({ ...current, visible: false }))
    setNearbyMarker(null)
  }

  const primaryProbeValue =
    activeMetric === 'divergence'
      ? probe.divergence
      : activeMetric === 'vector'
        ? Math.hypot(probe.vx, probe.vy)
        : probe.curl
  const probeMagnitude =
    activeMetric === 'both'
      ? Math.min(4, Math.max(Math.abs(probe.curl), Math.abs(probe.divergence)))
      : Math.min(4, Math.abs(primaryProbeValue))
  const probeIntensity = Math.min(1, probeMagnitude / 4)
  const probeLabel =
    !labStarted || labPhase === 'investigate'
      ? getProbeReadingLabel(activeMetric, probe.curl, probe.divergence)
      : ''
  const probeHue =
    activeMetric === 'curl'
      ? probe.curl >= 0
        ? 181
        : 23
      : activeMetric === 'divergence'
        ? probe.divergence >= 0
          ? 181
          : 23
        : activeMetric === 'vector'
          ? 265
          : 196
  const divergenceScaleStart = probe.divergence > 0.08 ? 0.32 : probe.divergence < -0.08 ? 1.08 : 0.84
  const divergenceScaleEnd = probe.divergence > 0.08 ? 1.08 : probe.divergence < -0.08 ? 0.32 : 0.84
  const probeStyle = {
    left: `${probe.x}px`,
    top: `${probe.y}px`,
    '--probe-duration': `${Math.max(0.28, 1.7 / (0.25 + probeMagnitude))}s`,
    '--probe-direction': probe.curl >= 0 ? 'reverse' : 'normal',
    '--probe-play-state': Math.abs(probe.curl) <= 0.08 ? 'paused' : 'running',
    '--probe-divergence-animation': Math.abs(probe.divergence) <= 0.08 ? 'none' : 'divergence-probe-pulse',
    '--probe-divergence-ring-animation': Math.abs(probe.divergence) <= 0.08 ? 'none' : 'divergence-probe-ring',
    '--probe-intensity': probeIntensity,
    '--probe-hue': probeHue,
    '--blob-start': divergenceScaleStart,
    '--blob-end': divergenceScaleEnd,
  } as CSSProperties
  const fieldDetailsRevealed = !labStarted || answerSubmitted || hasProbeReading
  const displayedDx = fieldDetailsRevealed ? dx : 'hidden until probe'
  const displayedDy = fieldDetailsRevealed ? dy : 'hidden until probe'
  const presetMenuValue =
    !labStarted || fieldDetailsRevealed
      ? presets.find((preset) => preset.dx === dx && preset.dy === dy)?.name ?? ''
      : 'lab-field'
  const presetMenuOptions = [
    ...(labStarted ? [{ value: 'lab-field', label: 'Lab field' }] : []),
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
    setLabStarted(true)
    setHasSeenIntro(true)
    const firstQuestion = labQuestions[0]
    setActiveQuestionIndex(0)
    setDx(firstQuestion.field.dx)
    setDy(firstQuestion.field.dy)
    setColorMode('flow')
    setSeedingMode('streamlines')
    setShowDivergenceEmphasis(false)
    setShowFieldArrows(true)
    setPanelMode('question')
    setPanelCollapsed(false)
    setLabPhase(answerRecords[0]?.submitted ? 'explain' : 'predict')
    setProbeEnabled(false)
    setHasProbeReading(Boolean(answerRecords[0]?.submitted))
    setPlacedProbes([])
    hideProbe()
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
    setSeedingMode('streamlines')
    setShowDivergenceEmphasis(activeQuestion.metric !== 'curl')
    setProbeEnabled(true)
    setHasProbeReading(false)
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
    setHasProbeReading(true)
    setProbeEnabled(false)
    hideProbe()
  }

  const resetActiveAnswer = () => {
    setAnswerRecords((current) => {
      const next = { ...current }
      delete next[activeQuestionIndex]
      return next
    })
    setLabPhase('predict')
    setHasProbeReading(false)
    setProbeEnabled(false)
    hideProbe()
  }

  const resetAllAnswers = () => {
    setAnswerRecords({})
    const question = labQuestions[0]
    setActiveQuestionIndex(0)
    setDx(question.field.dx)
    setDy(question.field.dy)
    setColorMode('flow')
    setSeedingMode('streamlines')
    setShowDivergenceEmphasis(false)
    setShowFieldArrows(true)
    setLabStarted(true)
    setHasSeenIntro(true)
    setPanelMode('question')
    setPanelCollapsed(false)
    setLabPhase('predict')
    setProbeEnabled(false)
    setHasProbeReading(false)
    hideProbe()
  }

  const goToQuestion = (index: number) => {
    const record = answerRecords[index]
    const question = labQuestions[index]
    setActiveQuestionIndex(index)
    setDx(question.field.dx)
    setDy(question.field.dy)
    setColorMode('flow')
    setSeedingMode('streamlines')
    setShowDivergenceEmphasis(false)
    setShowFieldArrows(true)
    setLabStarted(true)
    setHasSeenIntro(true)
    setPanelMode('question')
    setPanelCollapsed(false)
    setLabPhase(record?.submitted ? 'explain' : 'predict')
    setProbeEnabled(false)
    setHasProbeReading(Boolean(record?.submitted))
    setPlacedProbes([])
    hideProbe()
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

        <label className={`formula-control${labStarted ? ' formula-control-locked' : ''}`}>
          <span>dx</span>
          <input
            value={displayedDx}
            onChange={(e) => {
              if (!labStarted) {
                setDx(e.target.value)
              }
            }}
            readOnly={labStarted}
            aria-readonly={labStarted}
            title={
              !labStarted
                ? 'Edit dx formula'
                : fieldDetailsRevealed
                  ? 'The guided lab controls this field'
                  : 'Make a prediction before seeing the formula'
            }
          />
        </label>

        <label className={`formula-control${labStarted ? ' formula-control-locked' : ''}`}>
          <span>dy</span>
          <input
            value={displayedDy}
            onChange={(e) => {
              if (!labStarted) {
                setDy(e.target.value)
              }
            }}
            readOnly={labStarted}
            aria-readonly={labStarted}
            title={
              !labStarted
                ? 'Edit dy formula'
                : fieldDetailsRevealed
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
          disabled={labStarted}
        />

        <IntegratedMenu
          label="Color mode"
          value={colorMode}
          options={colorModeOptions}
          onChange={(nextValue) => setColorMode(nextValue as ColorMode)}
        />

        <div className="seed-toggle" aria-label="Flow rendering mode">
          <button
            type="button"
            aria-pressed={seedingMode === 'streamlines'}
            onClick={() => setSeedingMode('streamlines')}
          >
            Streamlines
          </button>
          <button
            type="button"
            aria-pressed={seedingMode === 'particle'}
            onClick={() => setSeedingMode('particle')}
          >
            Particle
          </button>
        </div>

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={() => setShowDivergenceEmphasis((value) => !value)}
          aria-label={
            showDivergenceEmphasis
              ? 'Hide source and sink emphasis'
              : 'Show source and sink emphasis'
          }
          aria-pressed={showDivergenceEmphasis}
          data-tooltip="Source/sink emphasis"
        >
          <DivergenceProbeIcon framed={false} />
        </button>

        <DensitySlider value={density} onChange={setDensity} />

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={() => setIsPlaying((value) => !value)}
          aria-label={isPlaying ? 'Pause flow' : 'Play flow'}
          data-tooltip={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={() => setShowFieldArrows((value) => !value)}
          aria-label={showFieldArrows ? 'Hide field arrows' : 'Show field arrows'}
          aria-pressed={showFieldArrows}
          data-tooltip="Field arrows"
        >
          <Navigation2 aria-hidden="true" />
        </button>

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={randomizeField}
          aria-label="Randomize field"
          data-tooltip="Randomize field"
          disabled={labStarted}
        >
          <Dices aria-hidden="true" />
        </button>

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={() => {
            if (!autoRandomize) randomizeField()
            setAutoRandomize((value) => !value)
          }}
          aria-label={autoRandomize ? 'Stop auto randomize' : 'Start auto randomize'}
          aria-pressed={autoRandomize}
          data-tooltip={autoRandomize ? 'Stop auto-randomize' : 'Auto-randomize'}
          disabled={labStarted}
        >
          <Sparkles aria-hidden="true" />
        </button>

        <button
          type="button"
          className="icon-button tooltip-bottom"
          onClick={resetFlow}
          aria-label="Redraw field"
          data-tooltip="Redraw field"
        >
          <RotateCcw aria-hidden="true" />
        </button>
      </header>

      <aside className="probe-sidebar" aria-label="Visualization tools">
        <div className="probe-sidebar-label">Probes</div>
        <div className="probe-sidebar-divider" />
        {labStarted ? (
          <button
            type="button"
            className="probe-tool-button tooltip-left"
            aria-label={`${activeMetric === 'divergence' ? 'Divergence' : activeMetric === 'both' ? 'Comparison' : 'Curl'} probe`}
            aria-pressed={probeEnabled}
            data-tooltip={
              labPhase === 'investigate'
                ? `${activeMetric === 'divergence' ? 'Divergence' : activeMetric === 'both' ? 'Comparison' : 'Curl'} probe`
                : 'Choose an answer first'
            }
            disabled={labPhase !== 'investigate'}
            onClick={() => {
              setProbeEnabled((enabled) => !enabled)
              hideProbe()
            }}
          >
            {activeMetric === 'divergence' ? (
              <DivergenceProbeIcon />
            ) : activeMetric === 'both' ? (
              <CompareProbeIcon />
            ) : (
              <CurlProbeIcon />
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="probe-tool-button tooltip-left"
              aria-label="Curl probe"
              aria-pressed={probeEnabled && playgroundMetric === 'curl'}
              data-tooltip="Curl probe"
              onClick={() => {
                if (probeEnabled && playgroundMetric === 'curl') {
                  setProbeEnabled(false)
                } else {
                  setPlaygroundMetric('curl')
                  setProbeEnabled(true)
                }
                hideProbe()
              }}
            >
              <CurlProbeIcon />
            </button>
            <button
              type="button"
              className="probe-tool-button tooltip-left"
              aria-label="Divergence probe"
              aria-pressed={probeEnabled && playgroundMetric === 'divergence'}
              data-tooltip="Divergence probe"
              onClick={() => {
                if (probeEnabled && playgroundMetric === 'divergence') {
                  setProbeEnabled(false)
                } else {
                  setPlaygroundMetric('divergence')
                  setProbeEnabled(true)
                }
                hideProbe()
              }}
            >
              <DivergenceProbeIcon />
            </button>
            <button
              type="button"
              className="probe-tool-button tooltip-left"
              aria-label="Comparison probe"
              aria-pressed={probeEnabled && playgroundMetric === 'both'}
              data-tooltip="Comparison probe"
              onClick={() => {
                if (probeEnabled && playgroundMetric === 'both') {
                  setProbeEnabled(false)
                } else {
                  setPlaygroundMetric('both')
                  setProbeEnabled(true)
                }
                hideProbe()
              }}
            >
              <CompareProbeIcon />
            </button>
            <button
              type="button"
              className="probe-tool-button tooltip-left"
              aria-label="Vector probe"
              aria-pressed={probeEnabled && playgroundMetric === 'vector'}
              data-tooltip="Vector probe"
              onClick={() => {
                if (probeEnabled && playgroundMetric === 'vector') {
                  setProbeEnabled(false)
                } else {
                  setPlaygroundMetric('vector')
                  setProbeEnabled(true)
                }
                hideProbe()
              }}
            >
              <MoveUpRight aria-hidden="true" style={{ width: '16px', height: '16px', strokeWidth: '2.5' }} />
            </button>
          </>
        )}
        {placedProbes.length > 0 ? (
          <button
            type="button"
            className="probe-tool-button clear-probes-button tooltip-left"
            onClick={() => setPlacedProbes([])}
            aria-label="Clear all placed probes"
            data-tooltip="Clear all placed probes"
            style={{ color: '#a14a25' }}
          >
            <Trash2 aria-hidden="true" />
          </button>
        ) : null}
      </aside>

      <section
        ref={visualizationRef}
        className={probeEnabled ? 'visualization probe-active' : 'visualization'}
        aria-label="Vector field visualization"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startProbeGesture}
          onPointerMove={updateProbe}
          onPointerUp={endProbeGesture}
          onPointerCancel={endProbeGesture}
          onPointerLeave={hideProbe}
        />
        {labStarted ? markerPositions.map((marker) => {
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
                  {getProbeReadingLabel(
                    activeMetric,
                    marker.curl,
                    marker.divergence,
                  )}
                </strong>
              ) : null}
            </div>
          )
        }) : null}
        {probeEnabled && probe.visible ? (
          <div
            className={`metric-probe metric-probe-${activeMetric}`}
            style={probeStyle}
            data-reading={activeMetric === 'both' || activeMetric === 'vector' ? '' : probeLabel}
            aria-hidden="true"
          >
            {activeMetric === 'divergence' ? (
              <span className="divergence-probe-blob" />
            ) : activeMetric === 'both' ? (
              <>
                <span className="both-probe-curl-ring">
                  <svg className="both-probe-curl-ring-svg" viewBox="0 0 100 100" width="100%" height="100%">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="0.85" strokeDasharray="1 2" />
                    <polygon points="54,4 47,1.2 48,6.8" fill="currentColor" />
                    <polygon points="46,96 53,93.2 52,98.8" fill="currentColor" />
                  </svg>
                </span>
                <span className="divergence-probe-blob" />
                <span className="comparison-probe-readout">
                  <em>curl: {formatCompactValue(probe.curl)}</em>
                  <em>div: {formatCompactValue(probe.divergence)}</em>
                </span>
              </>
            ) : activeMetric === 'vector' ? (
              <>
                {(() => {
                  const angle = Math.atan2(probe.vy, probe.vx)
                  const speed = Math.hypot(probe.vx, probe.vy)
                  const length = Math.max(12, Math.min(45, speed * 15))
                  return (
                    <svg
                      className="vector-probe-arrow"
                      style={{ transform: `rotate(${-angle}rad)` }}
                      width="100"
                      height="100"
                      viewBox="0 0 100 100"
                    >
                      <line
                        x1="50"
                        y1="50"
                        x2={50 + length}
                        y2="50"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <polygon points={`${50 + length},50 ${50 + length - 7},46 ${50 + length - 7},54`} fill="currentColor" />
                      <circle cx="50" cy="50" r="3.5" fill="currentColor" />
                    </svg>
                  )
                })()}
                <span className="vector-probe-readout">
                  <span className="vector-readout-item">
                    <strong>Pos:</strong> ({probe.fieldX.toFixed(2)}, {probe.fieldY.toFixed(2)})
                  </span>
                  <span className="vector-readout-item">
                    <strong>Vel:</strong> ({probe.vx.toFixed(2)}, {probe.vy.toFixed(2)})
                  </span>
                  <span className="vector-readout-item">
                    <strong>Curl:</strong> {probe.curl.toFixed(2)}
                  </span>
                  <span className="vector-readout-item">
                    <strong>Div:</strong> {probe.divergence.toFixed(2)}
                  </span>
                </span>
              </>
            ) : (
              <CurlProbeIcon framed={false} mirrored={probe.curl >= 0} />
            )}
          </div>
        ) : null}

        {syncedPlacedProbes.map((placed) => {
          const placedMagnitude =
            placed.metric === 'both'
              ? Math.min(4, Math.max(Math.abs(placed.curl), Math.abs(placed.divergence)))
              : Math.min(
                  4,
                  Math.abs(
                    placed.metric === 'divergence'
                      ? placed.divergence
                      : placed.metric === 'vector'
                        ? Math.hypot(placed.vx, placed.vy)
                        : placed.curl,
                  ),
                )
          const placedIntensity = Math.min(1, placedMagnitude / 4)
          const placedLabel = getProbeReadingLabel(placed.metric, placed.curl, placed.divergence)
          const placedHue =
            placed.metric === 'curl'
              ? placed.curl >= 0
                ? 181
                : 23
              : placed.metric === 'divergence'
                ? placed.divergence >= 0
                  ? 181
                  : 23
                : placed.metric === 'vector'
                  ? 265
                  : 196
          const divScaleStart = placed.divergence > 0.08 ? 0.32 : placed.divergence < -0.08 ? 1.08 : 0.84
          const divScaleEnd = placed.divergence > 0.08 ? 1.08 : placed.divergence < -0.08 ? 0.32 : 0.84
          const placedStyle = {
            left: `${placed.x}px`,
            top: `${placed.y}px`,
            '--probe-duration': `${Math.max(0.28, 1.7 / (0.25 + placedMagnitude))}s`,
            '--probe-direction': placed.curl >= 0 ? 'reverse' : 'normal',
            '--probe-play-state': Math.abs(placed.curl) <= 0.08 ? 'paused' : 'running',
            '--probe-divergence-animation': Math.abs(placed.divergence) <= 0.08 ? 'none' : 'divergence-probe-pulse',
            '--probe-divergence-ring-animation': Math.abs(placed.divergence) <= 0.08 ? 'none' : 'divergence-probe-ring',
            '--probe-intensity': placedIntensity,
            '--probe-hue': placedHue,
            '--blob-start': divScaleStart,
            '--blob-end': divScaleEnd,
          } as CSSProperties

          return (
            <div
              key={placed.id}
              className={`metric-probe metric-probe-${placed.metric} placed-probe`}
              style={placedStyle}
              data-reading={placed.metric === 'both' || placed.metric === 'vector' ? '' : placedLabel}
              onClick={(e) => {
                e.stopPropagation()
                setPlacedProbes((current) => current.filter((p) => p.id !== placed.id))
              }}
              title="Click to remove probe"
            >

              {placed.metric === 'divergence' ? (
                <span className="divergence-probe-blob" />
              ) : placed.metric === 'both' ? (
                <>
                  <span className="both-probe-curl-ring">
                    <svg className="both-probe-curl-ring-svg" viewBox="0 0 100 100" width="100%" height="100%">
                      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="0.85" strokeDasharray="1 2" />
                      <polygon points="54,4 47,1.2 48,6.8" fill="currentColor" />
                      <polygon points="46,96 53,93.2 52,98.8" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="divergence-probe-blob" />
                  <span className="comparison-probe-readout">
                    <em>curl: {formatCompactValue(placed.curl)}</em>
                    <em>div: {formatCompactValue(placed.divergence)}</em>
                  </span>
                </>
              ) : placed.metric === 'vector' ? (
                <>
                  {(() => {
                    const angle = Math.atan2(placed.vy, placed.vx)
                    const speed = Math.hypot(placed.vx, placed.vy)
                    const length = Math.max(12, Math.min(45, speed * 15))
                    return (
                      <svg
                        className="vector-probe-arrow"
                        style={{ transform: `rotate(${-angle}rad)` }}
                        width="100"
                        height="100"
                        viewBox="0 0 100 100"
                      >
                        <line
                          x1="50"
                          y1="50"
                          x2={50 + length}
                          y2="50"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <polygon points={`${50 + length},50 ${50 + length - 7},46 ${50 + length - 7},54`} fill="currentColor" />
                        <circle cx="50" cy="50" r="3.5" fill="currentColor" />
                      </svg>
                    )
                  })()}
                  <span className="vector-probe-readout">
                    <span className="vector-readout-item">
                      <strong>Pos:</strong> ({placed.fieldX.toFixed(2)}, {placed.fieldY.toFixed(2)})
                    </span>
                    <span className="vector-readout-item">
                      <strong>Vel:</strong> ({placed.vx.toFixed(2)}, {placed.vy.toFixed(2)})
                    </span>
                    <span className="vector-readout-item">
                      <strong>Curl:</strong> {placed.curl.toFixed(2)}
                    </span>
                    <span className="vector-readout-item">
                      <strong>Div:</strong> {placed.divergence.toFixed(2)}
                    </span>
                  </span>
                </>
              ) : (
                <CurlProbeIcon framed={false} mirrored={placed.curl >= 0} />
              )}
            </div>
          )
        })}

        {!labStarted ? (
          <button
            type="button"
            className="lab-panel-collapsed lab-start-entry"
            onClick={openLabIntro}
            aria-label="Start guided lab"
          >
            <span>
              <strong>Guided Lab</strong>
              <em>Start</em>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        ) : panelCollapsed ? (
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
                    className="lab-icon-button tooltip-bottom"
                    onClick={() => setPanelMode('question')}
                    aria-label="Back to question"
                    data-tooltip="Back to question"
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
                      className="lab-icon-button tooltip-bottom"
                      onClick={() => setPanelMode('menu')}
                      aria-label="Open lab menu"
                      data-tooltip="Open lab menu"
                    >
                      <ListChecks aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="lab-icon-button tooltip-bottom"
                  onClick={() => setPanelCollapsed(true)}
                  aria-label="Collapse lab panel"
                  data-tooltip="Collapse lab panel"
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
                  {answeredCount > 0 && (
                    <button
                      type="button"
                      className="lab-reset-all-button"
                      onClick={resetAllAnswers}
                      title="Reset all tutorial answers"
                    >
                      <RotateCcw aria-hidden="true" />
                      Reset All
                    </button>
                  )}
                  <strong>{labQuestions.length} questions</strong>
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
                    <div style={{ display: 'flex', width: '100%', gap: '8px', justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        className="lab-secondary-button"
                        onClick={resetActiveAnswer}
                      >
                        <RotateCcw aria-hidden="true" />
                        Retry
                      </button>
                      <button
                        type="button"
                        className="lab-primary-button"
                        onClick={goToNextQuestion}
                      >
                        Next
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        )}
      </section>
      <div className="app-version">v{__APP_VERSION__}</div>
      {showWelcome && (
        <div
          className={`welcome-overlay${isDismissing ? ' welcome-dismissing' : ''}`}
          onClick={() => {
            if (welcomePage === 1) {
              setWelcomePage(2)
            } else {
              dismissWelcome()
            }
          }}
        >
          <ExplosionCanvas
            active={isDismissing}
            buttonElement={exploreBtnRef.current}
            onComplete={handleExplosionComplete}
            colorMode={colorMode}
            activeQuestionIndex={activeQuestionIndex}
          />
          <div className={`welcome-card${isDismissing ? ' welcome-dismissing' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="welcome-title">
            {welcomePage === 1 ? (
              <>
                <h2 id="welcome-title">
                  <Waves aria-hidden="true" />
                  Hello Dr. Chaudri!
                </h2>
                <div className="welcome-body">
                  <p className="welcome-highlight">I hope you enjoy our Multivariable Calculus final project.</p>
                  <p>
                    One of the most difficult concepts to visualize for students are vector fields. As well as divergence, curl, and all that follow. We wanted to give students a way to understand these vector fields that was both beautiful and practical. You can either use this tool with the guided lessons to build your intuition, or just enjoy the beauty of math.
                  </p>
                  <p>
                    There's lots to explore here, and we hope you enjoy using this project as much as we did creating it.
                  </p>
                </div>
                <div className="welcome-footer">
                  <div className="welcome-signatures">
                    — Alex, Brian, Jason, Mihir, Rakhi and Tycho
                  </div>
                  <div className="welcome-dots">
                    <span className="welcome-dot active" onClick={() => setWelcomePage(1)} aria-label="Page 1" />
                    <span className="welcome-dot" onClick={() => setWelcomePage(2)} aria-label="Page 2" />
                  </div>
                  <button
                    type="button"
                    className="welcome-btn"
                    onClick={() => setWelcomePage(2)}
                  >
                    <span>Next</span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="welcome-title">
                  <Sparkles aria-hidden="true" />
                  Credits & Inspiration
                </h2>
                <div className="welcome-body">
                  <p style={{ lineHeight: '1.9' }}>
                    Credit to 3Blue1Brown for his video on{' '}
                    <a
                      href="https://www.youtube.com/watch?v=rB83DpBJQsE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="welcome-chip chip-yt"
                    >
                      <YouTubeIcon />
                      <span>Divergence and Curl</span>
                    </a>{' '}
                    and Anvaka for their simulation tool{' '}
                    <a
                      href="https://github.com/anvaka/fieldplay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="welcome-chip chip-gh"
                    >
                      <GitHubIcon />
                      <span>anvaka/fieldplay</span>
                    </a>
                    . This work is heavily inspired by their efforts.
                  </p>
                  <div className="welcome-team-info">
                    <p style={{ margin: '8px 0' }}>
                      <strong>Developer:</strong> Tycho Young
                    </p>
                    <p style={{ margin: '8px 0' }}>
                      <strong>Product Design & Review:</strong> Mihir Das, Jason Lee, Brian Lin, Rakhi Pamula, and Alex Wu
                    </p>
                  </div>
                </div>
                <div className="welcome-footer">
                  <button
                    type="button"
                    className="welcome-btn welcome-secondary-btn"
                    onClick={() => setWelcomePage(1)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    <span>Back</span>
                  </button>
                  <div className="welcome-dots">
                    <span className="welcome-dot" onClick={() => setWelcomePage(1)} aria-label="Page 1" />
                    <span className="welcome-dot active" onClick={() => setWelcomePage(2)} aria-label="Page 2" />
                  </div>
                  <button
                    ref={exploreBtnRef}
                    type="button"
                    className="welcome-btn"
                    onClick={dismissWelcome}
                  >
                    <span>Explore Project</span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{ color: '#FF0000', display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.507 9.388.507 9.388.507s7.518 0 9.388-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837z" />
    <polygon points="9.545 15.568 15.818 12 9.545 8.432" fill="#FFFFFF" />
  </svg>
)

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.197 22 16.44 22 12.017 22 6.484 17.522 2 12 2z" />
  </svg>
)

interface ExplosionCanvasProps {
  active: boolean
  buttonElement: HTMLButtonElement | null
  onComplete: () => void
  colorMode: ColorMode
  activeQuestionIndex: number
}

function ExplosionCanvas({ active, buttonElement, onComplete, colorMode, activeQuestionIndex }: ExplosionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return

    if (!canvasRef.current || !buttonElement) {
      onComplete()
      return
    }

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const btnRect = buttonElement.getBoundingClientRect()
    const startX = btnRect.left + btnRect.width / 2
    const startY = btnRect.top + btnRect.height / 2

    const width = window.innerWidth
    const height = window.innerHeight
    const originX = width / 2
    const originY = height / 2
    const scale = Math.min(width, height) / 8.2

    const toScreen = (point: Vector) => ({
      x: originX + point.x * scale,
      y: originY - point.y * scale,
    })

    const mathStartX = (startX - originX) / scale
    const mathStartY = (originY - startY) / scale

    type ExplosionTracer = {
      points: Vector[]
      age: number
      maxAge: number
      targetLength: number
      dying: boolean
      alpha: number
      seedAngle: number
    }

    const tracers: ExplosionTracer[] = []

    // Initialize 30 streamlines flowing outwards
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + (Math.random() - 0.5) * 0.12
      const offsetRadius = 0.04 + Math.random() * 0.12
      const startPoint = {
        x: mathStartX + Math.cos(angle) * offsetRadius,
        y: mathStartY + Math.sin(angle) * offsetRadius,
      }

      tracers.push({
        points: [startPoint],
        age: 0,
        maxAge: 0.9 + Math.random() * 0.7, // 0.9s to 1.6s lifetime
        targetLength: 20 + Math.floor(Math.random() * 12),
        dying: false,
        alpha: 1.0,
        seedAngle: angle,
      })
    }

    const drawPathLocal = (pts: Vector[]) => {
      let previousScreen: Vector | null = null
      pts.forEach((point, pointIndex) => {
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

    const getExplosionColor = (mode: ColorMode, hue: number, alpha: number) => {
      if (mode === 'speed') {
        const s = (225 - hue) / 40
        const lightness = 46 + Math.min(12, s * 3)
        return `hsla(${hue}, 82%, ${lightness}%, ${0.66 * alpha})`
      }
      if (mode === 'angle') {
        return `hsla(${hue}, 76%, 48%, ${0.64 * alpha})`
      }
      return `hsla(${hue}, 78%, 45%, ${0.64 * alpha})`
    }

    // A beautiful vector field centered at the button: radial expansion with swirl and waves
    const explosionField = (x: number, y: number, seedAngle: number) => {
      const dx = x - mathStartX
      const dy = y - mathStartY
      const dist = Math.hypot(dx, dy) || 0.0001

      // Radial speed decays as it expands, vortex swirl is steady
      const radialSpeed = 5.2 / (dist + 0.7)
      const swirlSpeed = 2.2

      // Wave ripple factor
      const wave = Math.sin(dist * 1.8) * 0.4

      return {
        x: Math.cos(seedAngle) * radialSpeed - dy * swirlSpeed + Math.sin(y) * wave,
        y: Math.sin(seedAngle) * radialSpeed + dx * swirlSpeed + Math.cos(x) * wave,
      }
    }

    let lastTime = performance.now()
    let animationId: number

    const updateAndDraw = (now: number) => {
      const dt = Math.min(0.03, (now - lastTime) / 1000)
      lastTime = now

      context.clearRect(0, 0, canvas.width, canvas.height)

      let activeCount = 0

      // Match system streamline visual styling EXACTLY
      context.lineWidth = 1.55
      context.lineCap = 'round'
      context.lineJoin = 'round'

      for (let i = 0; i < tracers.length; i++) {
        const tracer = tracers[i]
        if (tracer.alpha <= 0) continue

        activeCount++

        if (!tracer.dying) {
          tracer.age += dt

          const head = tracer.points[tracer.points.length - 1]
          const v = explosionField(head.x, head.y, tracer.seedAngle)

          const next = {
            x: head.x + v.x * dt,
            y: head.y + v.y * dt,
          }

          tracer.points.push(next)

          if (tracer.age >= tracer.maxAge) {
            tracer.dying = true
          }
        } else {
          // If dying, fade out alpha and shrink points from tail
          tracer.alpha -= dt * 2.2
          if (tracer.points.length > 1) {
            tracer.points.shift()
          }
        }

        // Limit points to target length
        while (tracer.points.length > tracer.targetLength) {
          tracer.points.shift()
        }

        // Draw tracer path matching native style
        const pts = tracer.points
        if (pts.length >= 2) {
          const head = pts[pts.length - 1]
          const v = explosionField(head.x, head.y, tracer.seedAngle)
          const speed = Math.hypot(v.x, v.y)
          const hue = getTracerHue(colorMode, v.x, v.y, speed, head, now / 1000, activeQuestionIndex)

          context.strokeStyle = getExplosionColor(colorMode, hue, tracer.alpha)
          context.beginPath()
          drawPathLocal(pts)
          context.stroke()
        }
      }

      if (activeCount > 0) {
        animationId = requestAnimationFrame(updateAndDraw)
      } else {
        onComplete()
      }
    }

    animationId = requestAnimationFrame(updateAndDraw)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [active, buttonElement, onComplete, colorMode, activeQuestionIndex])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 10005,
      }}
    />
  )
}

export default App
