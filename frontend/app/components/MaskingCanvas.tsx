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
  initialMaskRegions?: MaskRegion[]
}

export default function MaskingCanvas({ 
  filename, 
  imageInfo, 
  onMaskRegionsChange, 
  initialMaskRegions
}: MaskingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [maskRegions, setMaskRegions] = useState<MaskRegion[]>(initialMaskRegions || [])
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([])
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [imageLoadError, setImageLoadError] = useState(false)

  // 고정된 캔버스 크기
  const canvasWidth = 800
  const canvasHeight = 600

  useEffect(() => {
    console.log('MaskingCanvas: Starting image load for', filename)
    // 파일이 바뀔 때만 초기 마스크를 반영
    setMaskRegions(initialMaskRegions || [])
    setCurrentPoints([])
    setIsImageLoaded(false)
    setImageLoadError(false)

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      console.log('MaskingCanvas: Image loaded successfully', {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        expectedWidth: imageInfo.width,
        expectedHeight: imageInfo.height,
      })

      imageRef.current = img
      setIsImageLoaded(true)
      setImageLoadError(false)

      // 약간의 지연 후 캔버스 그리기 (중복 실행 방지 위해 cleanup 제공)
      const id = window.setTimeout(() => {
        drawCanvas()
      }, 100)
      ;(img as any)._tcTimeoutId = id
    }

    img.onerror = (error) => {
      console.error('MaskingCanvas: Image load failed', error)
      setImageLoadError(true)
      setIsImageLoaded(false)
    }

    img.src = `http://localhost:8000/uploads/${filename}`

    // cleanup
    return () => {
      // 타임아웃 정리
      const prev = imageRef.current as any
      if (prev && prev._tcTimeoutId) {
        clearTimeout(prev._tcTimeoutId)
      }
      imageRef.current = null
    }
  }, [filename, imageInfo.width, imageInfo.height])

  // 외부에서 initialMaskRegions 변경을 별도로 감시하지 않음 (부모 렌더 루프 방지)

  useEffect(() => {
    if (!isImageLoaded) return
    // requestAnimationFrame으로 프레임당 1회로 제한
    const id = requestAnimationFrame(() => drawCanvas())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImageLoaded, maskRegions, currentPoints])

  const drawCanvas = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    
    if (!canvas || !img || !isImageLoaded) {
      console.log('MaskingCanvas: Cannot draw - missing resources', {
        canvas: !!canvas,
        img: !!img,
        isImageLoaded
      })
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 캔버스 크기 설정
    canvas.width = canvasWidth
    canvas.height = canvasHeight

    // 배경을 흰색으로 채우기 + 이전 프레임 지우기
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    ctx.restore()

    // 이미지를 캔버스에 맞게 스케일링하여 그리기
    const scaleX = canvasWidth / imageInfo.width
    const scaleY = canvasHeight / imageInfo.height
    const scale = Math.min(scaleX, scaleY)
    
    const scaledWidth = imageInfo.width * scale
    const scaledHeight = imageInfo.height * scale
    const offsetX = (canvasWidth - scaledWidth) / 2
    const offsetY = (canvasHeight - scaledHeight) / 2

    console.log('MaskingCanvas: Drawing with scale', {
      scale,
      scaledWidth,
      scaledHeight,
      offsetX,
      offsetY
    })

    ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)

    // 마스킹 영역 그리기
    maskRegions.forEach((region, index) => {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)'
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2

      const x1 = offsetX + (region.x1 * scale)
      const y1 = offsetY + (region.y1 * scale)
      const x2 = offsetX + (region.x2 * scale)
      const y2 = offsetY + (region.y2 * scale)

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
      
      const x = offsetX + (point.x * scale)
      const y = offsetY + (point.y * scale)
      
      ctx.arc(x, y, 8, 0, 2 * Math.PI)
      ctx.fill()

      ctx.fillStyle = '#1d4ed8'
      ctx.font = '14px Arial'
      ctx.fillText(`${index + 1}`, x + 12, y - 8)
    })
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !isImageLoaded) {
      console.log('MaskingCanvas: Click ignored - not ready')
      return
    }

    // 브라우저(CSS) 좌표를 캔버스 내부 좌표로 변환
    const rect = canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    const scaleToCanvasX = canvas.width / rect.width
    const scaleToCanvasY = canvas.height / rect.height
    const clickX = cssX * scaleToCanvasX
    const clickY = cssY * scaleToCanvasY

    // 스케일 계산
    const scaleX = canvasWidth / imageInfo.width
    const scaleY = canvasHeight / imageInfo.height
    const scale = Math.min(scaleX, scaleY)
    
    const scaledWidth = imageInfo.width * scale
    const scaledHeight = imageInfo.height * scale
    const offsetX = (canvasWidth - scaledWidth) / 2
    const offsetY = (canvasHeight - scaledHeight) / 2

    // 이미지 영역 내부 클릭인지 확인
    if (clickX < offsetX || clickX > offsetX + scaledWidth || 
        clickY < offsetY || clickY > offsetY + scaledHeight) {
      console.log('MaskingCanvas: Click outside image area')
      return
    }

    // 이미지 좌표로 변환 (캔버스 좌표계를 기반으로 계산)
    const imageX = Math.round((clickX - offsetX) / scale)
    const imageY = Math.round((clickY - offsetY) / scale)

    console.log('MaskingCanvas: Valid click detected', {
      clickX,
      clickY,
      imageX,
      imageY,
      scale,
      currentPointsLength: currentPoints.length
    })

    const newCurrentPoints = [...currentPoints, { x: imageX, y: imageY }]
    setCurrentPoints(newCurrentPoints)

    // 두 점이 선택되면 마스킹 영역 생성
    if (newCurrentPoints.length === 2) {
      const newRegion: MaskRegion = {
        x1: Math.min(newCurrentPoints[0].x, newCurrentPoints[1].x),
        y1: Math.min(newCurrentPoints[0].y, newCurrentPoints[1].y),
        x2: Math.max(newCurrentPoints[0].x, newCurrentPoints[1].x),
        y2: Math.max(newCurrentPoints[0].y, newCurrentPoints[1].y),
      }

      console.log('MaskingCanvas: New region created', newRegion)
      
      const newMaskRegions = [...maskRegions, newRegion]
      setMaskRegions(newMaskRegions)
      setCurrentPoints([])
      onMaskRegionsChange(newMaskRegions)
    }
  }

  const clearAllRegions = () => {
    setMaskRegions([])
    setCurrentPoints([])
    onMaskRegionsChange([])
  }

  const clearLastRegion = () => {
    const newRegions = maskRegions.slice(0, -1)
    setMaskRegions(newRegions)
    onMaskRegionsChange(newRegions)
  }

  const cancelCurrentSelection = () => {
    setCurrentPoints([])
  }

  if (imageLoadError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium mb-2">이미지 로드 실패</h3>
          <p className="text-red-700 text-sm">
            이미지를 불러올 수 없습니다: {filename}
          </p>
          <p className="text-red-600 text-xs mt-2">
            백엔드 서버가 실행 중인지 확인해주세요.
          </p>
        </div>
      </div>
    )
  }

  if (!isImageLoaded) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center items-center h-64 bg-gray-100 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <span className="text-gray-600">이미지 로딩 중...</span>
            <p className="text-xs text-gray-500 mt-1">{filename}</p>
          </div>
        </div>
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
          마지막 영역 제거 ({maskRegions.length})
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
          현재 선택 취소 ({currentPoints.length})
        </button>
      </div>
      
      <div className="text-sm text-gray-600">
        이미지에서 마스킹할 영역의 좌상단과 우하단을 순서대로 클릭하세요.
        {currentPoints.length === 0 && " (첫 번째 점을 클릭하세요)"}
        {currentPoints.length === 1 && " (두 번째 점을 클릭하세요)"}
      </div>
      
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-100 inline-block">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onClick={handleCanvasClick}
          className="cursor-crosshair block"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      <div className="text-xs text-gray-500 grid grid-cols-2 gap-2">
        <div>이미지: {imageInfo.width} × {imageInfo.height}</div>
        <div>캔버스: {canvasWidth} × {canvasHeight}</div>
        <div>현재 점: {currentPoints.length}개</div>
        <div>마스킹 영역: {maskRegions.length}개</div>
      </div>

      {maskRegions.length > 0 && (
        <div className="text-sm text-green-600">
          ✅ 선택된 마스킹 영역: {maskRegions.length}개
        </div>
      )}
    </div>
  )
}