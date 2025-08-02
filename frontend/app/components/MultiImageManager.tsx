'use client'

import { useState } from 'react'
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

  const currentImage = uploadedFiles[currentImageIndex]

  const handleMaskRegionsChange = (regions: MaskRegion[]) => {
    if (!currentImage) return
    
    const newImagesMaskData = new Map(imagesMaskData)
    newImagesMaskData.set(currentImage.filename, regions)
    setImagesMaskData(newImagesMaskData)
  }

  const markImageComplete = () => {
    if (!currentImage) return
    
    const regions = imagesMaskData.get(currentImage.filename) || []
    if (regions.length === 0) {
      alert('마스킹 영역을 먼저 선택해주세요.')
      return
    }

    const newCompletedImages = new Set(completedImages)
    newCompletedImages.add(currentImage.filename)
    setCompletedImages(newCompletedImages)

    // 다음 이미지로 이동 (완료되지 않은 이미지가 있다면)
    const nextIndex = findNextIncompleteImage()
    if (nextIndex !== -1) {
      setCurrentImageIndex(nextIndex)
    }
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
                  whitespace-nowrap py-2 px-4 border-b-2 font-medium text-sm rounded-t-lg
                  ${isActive 
                    ? 'border-blue-500 text-blue-600 bg-blue-50' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                  ${isCompleted ? 'bg-green-50' : ''}
                `}
              >
                <div className="flex items-center space-x-2">
                  <span>{file.original_name}</span>
                  {isCompleted && (
                    <span className="text-green-600">✓</span>
                  )}
                  {!isCompleted && hasMasking && (
                    <span className="text-yellow-600">◐</span>
                  )}
                  {!isCompleted && !hasMasking && (
                    <span className="text-gray-400">○</span>
                  )}
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
        <div className="w-full bg-blue-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedImages.size / uploadedFiles.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* 현재 이미지 마스킹 */}
      {currentImage && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">
              {currentImage.original_name} 마스킹
            </h3>
            <span className="text-sm text-gray-500">
              {currentImage.width} × {currentImage.height}
            </span>
          </div>
          
          <MaskingCanvas
            filename={currentImage.filename}
            imageInfo={{ width: currentImage.width, height: currentImage.height }}
            onMaskRegionsChange={handleMaskRegionsChange}
            initialMaskRegions={getCurrentImageMaskRegions()}
          />

          <div className="mt-4 flex gap-4">
            <button
              onClick={markImageComplete}
              disabled={completedImages.has(currentImage.filename)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {completedImages.has(currentImage.filename) ? '완료됨' : '마스킹 완료'}
            </button>
            
            {currentImageIndex > 0 && (
              <button
                onClick={() => setCurrentImageIndex(currentImageIndex - 1)}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
              >
                이전 이미지
              </button>
            )}
            
            {currentImageIndex < uploadedFiles.length - 1 && (
              <button
                onClick={() => setCurrentImageIndex(currentImageIndex + 1)}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
              >
                다음 이미지
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