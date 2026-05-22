import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  Waves,
} from 'lucide-react'
import './App.css'

type Vector = { x: number; y: number }
type Field = (x: number, y: number, t: number) => Vector

type Preset = {
  name: string
  dx: string
  dy: string
}

const presets: Preset[] = [
  { name: 'Curl', dx: '-y', dy: 'x' },
  { name: 'Source', dx: 'x', dy: 'y' },
  { name: 'Sink', dx: '-x', dy: '-y' },
  { name: 'Shear', dx: 'y', dy: '0.35 * sin(x)' },
  { name: 'Saddle', dx: 'x', dy: '-y' },
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

function makeSeed(index: number, count: number, aspect: number) {
  const columns = Math.ceil(Math.sqrt(count * aspect))
  const rows = Math.ceil(count / columns)
  const col = index % columns
  const row = Math.floor(index / columns)
  const jitterX = Math.sin(index * 91.7) * 0.34
  const jitterY = Math.cos(index * 57.3) * 0.34

  return {
    x: ((col + 0.5 + jitterX) / columns - 0.5) * 7.2 * aspect,
    y: ((row + 0.5 + jitterY) / rows - 0.5) * 7.2,
  }
}

function drawVectorField(
  canvas: HTMLCanvasElement,
  field: Field,
  time: number,
  lessonIndex: number,
) {
  const context = canvas.getContext('2d')
  if (!context) return

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
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

  context.lineWidth = 1
  context.strokeStyle = '#e8eef2'
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

  context.strokeStyle = '#cfdbe2'
  context.beginPath()
  context.moveTo(0, originY)
  context.lineTo(width, originY)
  context.moveTo(originX, 0)
  context.lineTo(originX, height)
  context.stroke()

  const lineCount = width < 720 ? 180 : 320
  const t = time / 1000
  for (let i = 0; i < lineCount; i += 1) {
    let point = makeSeed(i, lineCount, aspect)
    const drift = ((time * 0.00018 + i * 0.011) % 1) * 1.2
    for (let warmup = 0; warmup < 5; warmup += 1) {
      const vector = clampMagnitude(field(point.x, point.y, t))
      point = {
        x: point.x + vector.x * 0.045 * drift,
        y: point.y + vector.y * 0.045 * drift,
      }
    }

    const hue = (178 + i * 0.41 + lessonIndex * 24) % 360
    context.strokeStyle = `hsla(${hue}, 78%, 45%, 0.64)`
    context.lineWidth = 1.55
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()

    for (let step = 0; step < 10; step += 1) {
      const screen = toScreen(point)
      if (step === 0) context.moveTo(screen.x, screen.y)
      else context.lineTo(screen.x, screen.y)

      const vector = clampMagnitude(field(point.x, point.y, t))
      point = {
        x: point.x + vector.x * 0.055,
        y: point.y + vector.y * 0.055,
      }
    }

    context.stroke()
  }

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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [dx, setDx] = useState(presets[0].dx)
  const [dy, setDy] = useState(presets[0].dy)
  const [isPlaying, setIsPlaying] = useState(true)
  const [lessonIndex, setLessonIndex] = useState(0)

  const field = useMemo<Field>(() => {
    const fx = compileExpression(dx)
    const fy = compileExpression(dy)
    return (x, y, t) => ({ x: fx(x, y, t), y: fy(x, y, t) })
  }, [dx, dy])

  const redraw = useCallback(
    (time = performance.now()) => {
      if (canvasRef.current) drawVectorField(canvasRef.current, field, time, lessonIndex)
    },
    [field, lessonIndex],
  )

  useEffect(() => {
    let frame = 0

    const tick = (time: number) => {
      redraw(time)
      if (isPlaying) frame = requestAnimationFrame(tick)
    }

    const handleResize = () => redraw()

    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [isPlaying, redraw])

  const applyPreset = (name: string) => {
    const preset = presets.find((item) => item.name === name)
    if (!preset) return
    setDx(preset.dx)
    setDy(preset.dy)
  }

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

        <select
          aria-label="Preset vector field"
          onChange={(event) => applyPreset(event.target.value)}
          value={presets.find((preset) => preset.dx === dx && preset.dy === dy)?.name ?? ''}
        >
          <option value="">Custom</option>
          {presets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>

        <button type="button" className="icon-button" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? 'Pause flow' : 'Play flow'}>
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>

        <button type="button" className="icon-button" onClick={() => redraw()} aria-label="Redraw field">
          <RotateCcw aria-hidden="true" />
        </button>
      </header>

      <section className="visualization" aria-label="Vector field visualization">
        <canvas ref={canvasRef} />
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
