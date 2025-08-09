'use client'

import { useState, useEffect } from 'react'
import MaskingCanvas from './MaskingCanvas'

interface UploadedFileInfo {
  filename: string
  original_name: string
  width: number
  height: number
}

interface MaskRegion {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ImageMaskData {
  filename: string
  mask_regions: MaskRegion[]
}

interface MultiImageManagerProps {
  uploadedFiles: UploadedFileInfo[]
  onMaskingComplete: (imagesMaskData: ImageMaskData[]) => void
}

export default function MultiImageManager({ uploadedFiles, onMaskingComplete }: MultiImageManagerProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imagesMaskData, setImagesMaskData] = useState<Map<string, MaskRegion[]>>(new Map())
  const [completedImages, setCompletedImages] = useState<Set<string>>(new Set())
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(true)

  const currentImage = uploadedFiles[currentImageIndex]

  // Unified validation function for mask completion
  const canCompleteCurrentImage = (): boolean => {
    if (!currentImage) return false
    if (completedImages.has(currentImage.filename)) return false
    
    const regions = imagesMaskData.get(currentImage.filename) || []
    return regions.length > 0
  }

  // State consistency validation for debugging
  const validateStateConsistency = (): void => {
    if (process.env.NODE_ENV === 'development') {
      // Check that all completed images have mask data
      completedImages.forEach(filename => {
        const regions = imagesMaskData.get(filename) || []
        if (regions.length === 0) {
          console.warn(`State inconsistency: ${filename} marked as completed but has no mask regions`)
        }
      })
      
      // Check that images with mask data are properly tracked
      imagesMaskData.forEach((regions, filename) => {
        if (regions.length > 0 && !completedImages.has(filename)) {
          console.info(`State info: ${filename} has mask regions but not marked as completed`)
        }
      })
    }
  }

  const handleMaskRegionsChange = (regions: MaskRegion[]) => {
    if (!currentImage) return
    
    const newImagesMaskData = new Map(imagesMaskData)
    newImagesMaskData.set(currentImage.filename, regions)
    setImagesMaskData(newImagesMaskData)
  }

  const markImageComplete = () => {
    if (!canCompleteCurrentImage()) {
      alert('마스킹 영역을 먼저 선택해주세요.')
      return
    }

    const newCompletedImages = new Set(completedImages)
    newCompletedImages.add(currentImage.filename)
    setCompletedImages(newCompletedImages)

    // 자동 이동 설정이 활성화된 경우에만 다음 이미지로 이동
    if (autoMoveEnabled) {
      const nextIndex = findNextIncompleteImage()
      if (nextIndex !== -1) {
        setCurrentImageIndex(nextIndex)
      }
    }
  }

  const markImageCompleteAndStartBatch = () => {
    if (!canCompleteCurrentImage()) {
      alert('마스킹 영역을 먼저 선택해주세요.')
      return
    }

    // 현재 이미지 완료 처리
    const newCompletedImages = new Set(completedImages)
    newCompletedImages.add(currentImage.filename)
    setCompletedImages(newCompletedImages)

    // 모든 마스킹 데이터 준비
    const allMaskData: ImageMaskData[] = uploadedFiles.map(file => ({
      filename: file.filename,
      mask_regions: imagesMaskData.get(file.filename) || []
    }))

    // 일괄 처리 시작
    onMaskingComplete(allMaskData)
  }

  const findNextIncompleteImage = (): number => {
    for (let i = 0; i < uploadedFiles.length; i++) {
      if (!completedImages.has(uploadedFiles[i].filename)) {
        return i
      }
    }
    return -1
  }

  const handleCompleteAllMasking = () => {
    if (completedImages.size !== uploadedFiles.length) {
      alert('모든 이미지의 마스킹을 완료해주세요.')
      return
    }

    const allMaskData: ImageMaskData[] = uploadedFiles.map(file => ({
      filename: file.filename,
      mask_regions: imagesMaskData.get(file.filename) || []
    }))

    onMaskingComplete(allMaskData)
  }

  const getCurrentImageMaskRegions = (): MaskRegion[] => {
    return currentImage ? imagesMaskData.get(currentImage.filename) || [] : []
  }

  // State consistency validation effect
  useEffect(() => {
    validateStateConsistency()
  }, [imagesMaskData, completedImages])

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 키보드 네비게이션 비활성화
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (currentImageIndex > 0) {
            setCurrentImageIndex(currentImageIndex - 1)
          }
          break
        
        case 'ArrowRight':
          e.preventDefault()
          if (currentImageIndex < uploadedFiles.length - 1) {
            setCurrentImageIndex(currentImageIndex + 1)
          }
          break
        
        case ' ': // 스페이스바
          e.preventDefault()
          if (canCompleteCurrentImage()) {
            if (currentImageIndex === uploadedFiles.length - 1 && completedImages.size === uploadedFiles.length - 1) {
              markImageCompleteAndStartBatch()
            } else {
              markImageComplete()
            }
          } else {
            // Provide feedback when space key cannot complete masking
            if (!currentImage) {
              console.log('Space key: No current image selected')
            } else if (completedImages.has(currentImage.filename)) {
              console.log('Space key: Image already completed')
            } else {
              const regions = imagesMaskData.get(currentImage.filename) || []
              if (regions.length === 0) {
                console.log('Space key: No mask regions selected - please select masking areas first')
              }
            }
          }
          break
        
        case 'Enter':
          e.preventDefault()
          if (completedImages.size === uploadedFiles.length) {
            handleCompleteAllMasking()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentImageIndex, uploadedFiles.length, completedImages, currentImage])

  if (!uploadedFiles.length) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* 이미지 선택 탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {uploadedFiles.map((file, index) => {
            const isActive = index === currentImageIndex
            const isCompleted = completedImages.has(file.filename)
            const hasMasking = (imagesMaskData.get(file.filename) || []).length > 0
            
            return (
              <button
                key={file.filename}
                onClick={() => setCurrentImageIndex(index)}
                className={`
                  whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm rounded-t-lg transition-all
                  ${isActive 
                    ? 'border-blue-500 text-blue-600 bg-blue-50' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                  ${isCompleted ? 'bg-green-50' : ''}
                `}
              >
                <div className="flex items-center space-x-3">
                  {/* 썸네일 이미지 */}
                  <div className="relative">
                    <img
                      src={`http://localhost:8000/uploads/${file.filename}`}
                      alt={file.original_name}
                      className="w-8 h-8 object-cover rounded border-2 border-gray-200"
                    />
                    {/* 상태 아이콘 오버레이 */}
                    <div className="absolute -top-1 -right-1">
                      {isCompleted && (
                        <span className="text-green-600 text-xs bg-white rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                      )}
                      {!isCompleted && hasMasking && (
                        <span className="text-yellow-600 text-xs bg-white rounded-full w-4 h-4 flex items-center justify-center">◐</span>
                      )}
                      {!isCompleted && !hasMasking && (
                        <span className="text-gray-400 text-xs bg-white rounded-full w-4 h-4 flex items-center justify-center">○</span>
                      )}
                    </div>
                  </div>
                  
                  {/* 파일명과 마스킹 영역 수 */}
                  <div className="flex flex-col items-start">
                    <span className="text-xs truncate max-w-20">{file.original_name}</span>
                    {hasMasking && (
                      <span className="text-xs text-gray-400">
                        {(imagesMaskData.get(file.filename) || []).length}개 영역
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>
      </div>

      {/* 진행 상황 표시 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-blue-800">마스킹 진행 상황</h3>
          <span className="text-blue-600 font-semibold">
            {completedImages.size} / {uploadedFiles.length} 완료
          </span>
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedImages.size / uploadedFiles.length) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-xs text-blue-600 space-y-1">
            <div className="flex flex-wrap gap-4">
              <span><kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs">←→</kbd> 이미지 이동</span>
              <span>
                <kbd className={`px-1 py-0.5 rounded text-xs ${
                  canCompleteCurrentImage() 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-500'
                }`}>Space</kbd> 
                <span className={canCompleteCurrentImage() ? 'text-green-700' : 'text-gray-500'}>
                  마스킹 완료 {canCompleteCurrentImage() ? '(가능)' : '(마스킹 필요)'}
                </span>
              </span>
              <span><kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs">Enter</kbd> 일괄처리</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-blue-700">
              <input
                type="checkbox"
                checked={autoMoveEnabled}
                onChange={(e) => setAutoMoveEnabled(e.target.checked)}
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              자동 이동
            </label>
          </div>
        </div>
      </div>

      {/* 현재 이미지 마스킹 */}
      {currentImage && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">
                {currentImage.original_name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{currentImage.width} × {currentImage.height}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  completedImages.has(currentImage.filename)
                    ? 'bg-green-100 text-green-800'
                    : getCurrentImageMaskRegions().length > 0
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {completedImages.has(currentImage.filename)
                    ? '✓ 완료'
                    : getCurrentImageMaskRegions().length > 0
                    ? `${getCurrentImageMaskRegions().length}개 영역 선택됨`
                    : '마스킹 대기'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {currentImageIndex + 1}
              </div>
              <div className="text-xs text-gray-500">
                / {uploadedFiles.length}
              </div>
            </div>
          </div>
          
          <MaskingCanvas
            filename={currentImage.filename}
            imageInfo={{ width: currentImage.width, height: currentImage.height }}
            onMaskRegionsChange={handleMaskRegionsChange}
            initialMaskRegions={getCurrentImageMaskRegions()}
          />

          <div className="mt-4 flex gap-3 items-center">
            {/* 네비게이션 버튼들 (좌측) */}
            <div className="flex gap-2">
              {currentImageIndex > 0 && (
                <button
                  onClick={() => setCurrentImageIndex(currentImageIndex - 1)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center gap-2"
                >
                  <span>←</span> 이전
                </button>
              )}
              
              {currentImageIndex < uploadedFiles.length - 1 && (
                <button
                  onClick={() => setCurrentImageIndex(currentImageIndex + 1)}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center gap-2"
                >
                  다음 <span>→</span>
                </button>
              )}
            </div>

            {/* 구분선 */}
            {((currentImageIndex > 0) || (currentImageIndex < uploadedFiles.length - 1)) && (
              <div className="h-6 w-px bg-gray-300"></div>
            )}

            {/* 마스킹 완료 버튼 (우측) */}
            {currentImageIndex === uploadedFiles.length - 1 && completedImages.size === uploadedFiles.length - 1 ? (
              // 마지막 이미지이고 다른 모든 이미지가 완료된 경우
              <button
                onClick={markImageCompleteAndStartBatch}
                disabled={completedImages.has(currentImage.filename)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {completedImages.has(currentImage.filename) ? '✓ 완료됨' : '마스킹 완료 & 일괄처리 시작'}
              </button>
            ) : (
              // 일반 마스킹 완료 버튼
              <button
                onClick={markImageComplete}
                disabled={completedImages.has(currentImage.filename)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {completedImages.has(currentImage.filename) ? '✓ 완료됨' : '마스킹 완료'}
              </button>
            )}
          </div>

          {/* 현재 이미지 마스킹 정보 */}
          {getCurrentImageMaskRegions().length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800 font-medium">
                선택된 마스킹 영역: {getCurrentImageMaskRegions().length}개
              </p>
              <div className="text-sm text-blue-600 mt-2">
                {getCurrentImageMaskRegions().map((region, index) => (
                  <div key={index}>
                    영역 {index + 1}: ({region.x1}, {region.y1}) → ({region.x2}, {region.y2})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 전체 완료 버튼 */}
      {completedImages.size === uploadedFiles.length && uploadedFiles.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-green-800 mb-2">
            🎉 모든 이미지 마스킹 완료!
          </h3>
          <p className="text-green-700 mb-4">
            이제 일괄 처리를 시작할 수 있습니다.
          </p>
          <button
            onClick={handleCompleteAllMasking}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium"
          >
            일괄 처리 시작
          </button>
        </div>
      )}
    </div>
  )
}