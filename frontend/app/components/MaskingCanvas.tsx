'use client'

import { useState, useRef, useEffect } from 'react'

interface MaskRegion {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface MaskingCanvasProps {
  filename: string
  imageInfo: { width: number; height: number }
  onMaskRegionsChange: (regions: MaskRegion[]) => void
}

export default function MaskingCanvas({ filename, imageInfo, onMaskRegionsChange }: MaskingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [maskRegions, setMaskRegions] = useState<MaskRegion[]>([])
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([])
  const [scale, setScale] = useState(1)
  const [isImageLoaded, setIsImageLoaded] = useState(false)

  // 캔버스 최대 크기
  const maxCanvasWidth = 800
  const maxCanvasHeight = 600

  useEffect(() => {
    // 이미지 로드
    const img = new Image()
    img.onload = () => {
      // 이미지 비율에 맞게 캔버스 크기 조정
      const scaleX = maxCanvasWidth / imageInfo.width
      const scaleY = maxCanvasHeight / imageInfo.height
      const newScale = Math.min(scaleX, scaleY, 1) // 1보다 크지 않게 제한
      
      setScale(newScale)
      setIsImageLoaded(true)
      drawCanvas()
    }
    img.src = `http://localhost:8000/uploads/${filename}`
    imageRef.current = img
  }, [filename, imageInfo])

  useEffect(() => {
    if (isImageLoaded) {
      drawCanvas()
    }
  }, [maskRegions, currentPoints, isImageLoaded])

  const drawCanvas = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 캔버스 크기 설정
    const displayWidth = imageInfo.width * scale
    const displayHeight = imageInfo.height * scale
    canvas.width = displayWidth
    canvas.height = displayHeight

    // 이미지 그리기
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight)

    // 마스킹 영역 그리기
    maskRegions.forEach((region, index) => {
      ctx.strokeStyle = '#ef4444'
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'
      ctx.lineWidth = 2

      const x1 = region.x1 * scale
      const y1 = region.y1 * scale
      const x2 = region.x2 * scale
      const y2 = region.y2 * scale

      // 사각형 그리기
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

      // 영역 번호 표시
      ctx.fillStyle = '#ef4444'
      ctx.font = '16px Arial'
      ctx.fillText(`${index + 1}`, x1 + 5, y1 + 20)
    })

    // 현재 선택 중인 점들 그리기
    currentPoints.forEach((point, index) => {
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(point.x * scale, point.y * scale, 5, 0, 2 * Math.PI)
      ctx.fill()

      ctx.fillStyle = '#1d4ed8'
      ctx.font = '12px Arial'
      ctx.fillText(`P${index + 1}`, point.x * scale + 8, point.y * scale - 8)
    })
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / scale)
    const y = Math.round((e.clientY - rect.top) / scale)

    const newCurrentPoints = [...currentPoints, { x, y }]
    setCurrentPoints(newCurrentPoints)

    // 두 점이 선택되면 마스킹 영역 생성
    if (newCurrentPoints.length === 2) {
      const newRegion: MaskRegion = {
        x1: Math.min(newCurrentPoints[0].x, newCurrentPoints[1].x),
        y1: Math.min(newCurrentPoints[0].y, newCurrentPoints[1].y),
        x2: Math.max(newCurrentPoints[0].x, newCurrentPoints[1].x),
        y2: Math.max(newCurrentPoints[0].y, newCurrentPoints[1].y),
      }

      const newMaskRegions = [...maskRegions, newRegion]
      setMaskRegions(newMaskRegions)
      setCurrentPoints([])
      onMaskRegionsChange(newMaskRegions)
    }
  }

  const clearLastRegion = () => {
    if (maskRegions.length > 0) {
      const newMaskRegions = maskRegions.slice(0, -1)
      setMaskRegions(newMaskRegions)
      onMaskRegionsChange(newMaskRegions)
    }
  }

  const clearAllRegions = () => {
    setMaskRegions([])
    setCurrentPoints([])
    onMaskRegionsChange([])
  }

  const cancelCurrentSelection = () => {
    setCurrentPoints([])
  }

  if (!isImageLoaded) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">이미지 로딩 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={clearLastRegion}
          disabled={maskRegions.length === 0}
          className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          마지막 영역 제거
        </button>
        <button
          onClick={clearAllRegions}
          disabled={maskRegions.length === 0}
          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          모든 영역 제거
        </button>
        <button
          onClick={cancelCurrentSelection}
          disabled={currentPoints.length === 0}
          className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          현재 선택 취소
        </button>
      </div>
      
      <div className="border rounded-lg overflow-hidden bg-gray-100 inline-block">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
          style={{ display: 'block' }}
        />
      </div>
      
      <div className="text-sm text-gray-600">
        <p>• 마스킹할 영역의 좌상단과 우하단을 순서대로 클릭하세요</p>
        <p>• 현재 선택된 점: {currentPoints.length}/2</p>
        <p>• 이미지 크기: {imageInfo.width} × {imageInfo.height}</p>
        <p>• 표시 비율: {Math.round(scale * 100)}%</p>
      </div>
    </div>
  )
}