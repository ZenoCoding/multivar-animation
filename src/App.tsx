import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Dices,
  Navigation2,
  Pause,
  Play,
  RotateCcw,
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
  hueOffset: number
}
type Particle = {
  id: number
  x: number
  y: number
  hueOffset: number
}
type ProbeState = {
  x: number
  y: number
  curl: number
  visible: boolean
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

const lessons = [
  'Explore direction',
  'Notice local spin',
  'Compare divergence',
  'Trace a path',
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
    hueOffset: (id * 137.508) % 360,
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
    hueOffset: (id * 0.41) % 360,
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

function getLineColor(
  mode: ColorMode,
  vector: Vector,
  speed: number,
  tracer: Tracer,
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

  const hue = (178 + tracer.hueOffset + lessonIndex * 24) % 360
  return `hsla(${hue}, 78%, 45%, 0.64)`
}

function getParticleColor(
  mode: ColorMode,
  vector: Vector,
  speed: number,
  particle: Particle,
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

  const hue = (185 + particle.hueOffset * 0.08 + lessonIndex * 14) % 360
  return `hsla(${hue}, 68%, 55%, 0.88)`
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
          particle,
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
      particle.hueOffset = fresh.hueOffset
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
      particle.hueOffset = fresh.hueOffset
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
      tracer,
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
}

function IntegratedMenu({ label, value, options, onChange }: IntegratedMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!isOpen) return

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
  }, [isOpen])

  return (
    <div className="integrated-menu" ref={menuRef}>
      <button
        type="button"
        className="menu-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen ? (
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
  const [lessonIndex, setLessonIndex] = useState(0)
  const [probeEnabled, setProbeEnabled] = useState(false)
  const [probe, setProbe] = useState<ProbeState>({
    x: 0,
    y: 0,
    curl: 0,
    visible: false,
  })

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
          lessonIndex,
          tracersRef.current,
          particlesRef.current,
          deltaSeconds,
          showFieldArrows,
        )
      }
    },
    [colorMode, field, lessonIndex, lineDensity, seedingMode, showFieldArrows],
  )

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
    }

    lastFrameTimeRef.current = null
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [isPlaying, redraw])

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
      } else if (event.key.toLowerCase() === 'r') {
        randomizeField()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [randomizeField])

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
    const curl = calculateCurl(field, fieldPoint, performance.now() / 1000)

    setProbe({
      x: event.clientX - sectionRect.left,
      y: event.clientY - sectionRect.top,
      curl,
      visible: true,
    })
  }

  const hideProbe = () => {
    setProbe((current) => ({ ...current, visible: false }))
  }

  const probeMagnitude = Math.min(4, Math.abs(probe.curl))
  const probeIntensity = Math.min(1, probeMagnitude / 4)
  const probeLabel =
    Math.abs(probe.curl) >= 10
      ? probe.curl.toFixed(0)
      : probe.curl.toFixed(2)
  const probeStyle = {
    left: `${probe.x}px`,
    top: `${probe.y}px`,
    '--probe-duration': `${Math.max(0.28, 1.7 / (0.25 + probeMagnitude))}s`,
    '--probe-direction': probe.curl >= 0 ? 'reverse' : 'normal',
    '--probe-intensity': probeIntensity,
    '--probe-hue': probe.curl >= 0 ? 181 : 23,
  } as CSSProperties
  const presetMenuValue =
    presets.find((preset) => preset.dx === dx && preset.dy === dy)?.name ?? ''
  const presetMenuOptions = [
    { value: '', label: 'Custom' },
    ...presets.map((preset) => ({ value: preset.name, label: preset.name })),
  ]

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Vector field controls">
        <div className="brand">
          <Waves aria-hidden="true" />
          <span>Vector Fields</span>
        </div>

        <label className="formula-control">
          <span>dx</span>
          <input value={dx} onChange={(event) => setDx(event.target.value)} />
        </label>

        <label className="formula-control">
          <span>dy</span>
          <input value={dy} onChange={(event) => setDy(event.target.value)} />
        </label>

        <IntegratedMenu
          label="Preset vector field"
          value={presetMenuValue}
          options={presetMenuOptions}
          onChange={(nextValue) => {
            if (nextValue) applyPreset(nextValue)
          }}
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

        <button type="button" className="icon-button" onClick={randomizeField} aria-label="Randomize field" title="Randomize field">
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
          aria-label="Toggle curl probe"
          aria-pressed={probeEnabled}
          title="Curl probe"
          onClick={() => {
            setProbeEnabled((enabled) => !enabled)
            hideProbe()
          }}
        >
          <CurlProbeIcon />
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
        {probeEnabled && probe.visible ? (
          <div
            className="curl-probe"
            style={probeStyle}
            data-curl={probeLabel}
            aria-hidden="true"
          >
            <CurlProbeIcon framed={false} mirrored={probe.curl >= 0} />
          </div>
        ) : null}
      </section>

      <nav className="lesson-bar" aria-label="Lesson navigation">
        <button
          type="button"
          className="icon-button"
          onClick={() => setLessonIndex((value) => Math.max(0, value - 1))}
          disabled={lessonIndex === 0}
          aria-label="Previous lesson"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <span>{lessons[lessonIndex]}</span>
        <button
          type="button"
          className="icon-button"
          onClick={() => setLessonIndex((value) => Math.min(lessons.length - 1, value + 1))}
          disabled={lessonIndex === lessons.length - 1}
          aria-label="Next lesson"
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </nav>
    </main>
  )
}

export default App
