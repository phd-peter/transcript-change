'use client'

import { useState, useRef } from 'react'
import ImageUploader from './components/ImageUploader'
import MaskingCanvas from './components/MaskingCanvas'
import ResultTable from './components/ResultTable'

interface MaskRegion {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ProcessedData {
  headers: string[]
  csv_data: any[][]
  raw_data: any
}

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null)
  const [maskRegions, setMaskRegions] = useState<MaskRegion[]>([])
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFileUploaded = (filename: string, info: { width: number; height: number }) => {
    setUploadedFile(filename)
    setImageInfo(info)
    setMaskRegions([])
    setProcessedData(null)
  }

  const handleMaskRegionsChange = (regions: MaskRegion[]) => {
    setMaskRegions(regions)
  }

  const handleProcess = async () => {
    if (!uploadedFile || maskRegions.length === 0) {
      alert('파일을 업로드하고 마스킹 영역을 선택해주세요.')
      return
    }

    setIsProcessing(true)
    try {
      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: uploadedFile,
          mask_regions: maskRegions,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      setProcessedData(result)
    } catch (error) {
      console.error('처리 중 오류:', error)
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetAll = () => {
    setUploadedFile(null)
    setImageInfo(null)
    setMaskRegions([])
    setProcessedData(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Transcript Change
          </h1>
          <p className="text-gray-600">
            이미지를 업로드하고 마스킹 처리하여 표 데이터를 추출하세요
          </p>
        </div>

        {/* 단계별 UI */}
        <div className="space-y-8">
          {/* 1단계: 파일 업로드 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">1단계: 이미지 업로드</h2>
            <ImageUploader onFileUploaded={handleFileUploaded} />
            {uploadedFile && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg">
                <p className="text-green-800">
                  ✅ 파일 업로드 완료: {uploadedFile}
                  {imageInfo && ` (${imageInfo.width}x${imageInfo.height})`}
                </p>
              </div>
            )}
          </div>

          {/* 2단계: 마스킹 */}
          {uploadedFile && imageInfo && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">2단계: 마스킹 영역 선택</h2>
              <p className="text-gray-600 mb-4">
                이미지에서 마스킹할 영역을 클릭하여 선택하세요. (좌상단 → 우하단 순서로 클릭)
              </p>
              <MaskingCanvas
                filename={uploadedFile}
                imageInfo={imageInfo}
                onMaskRegionsChange={handleMaskRegionsChange}
              />
              {maskRegions.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-blue-800 font-medium">선택된 마스킹 영역: {maskRegions.length}개</p>
                  <div className="text-sm text-blue-600 mt-2">
                    {maskRegions.map((region, index) => (
                      <div key={index}>
                        영역 {index + 1}: ({region.x1}, {region.y1}) → ({region.x2}, {region.y2})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3단계: 처리 버튼 */}
          {uploadedFile && maskRegions.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">3단계: 데이터 추출</h2>
              <div className="flex gap-4">
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? '처리 중...' : '데이터 추출 시작'}
                </button>
                <button
                  onClick={resetAll}
                  className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
                >
                  처음부터 다시
                </button>
              </div>
            </div>
          )}

          {/* 4단계: 결과 표시 */}
          {processedData && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">추출 결과</h2>
              <ResultTable data={processedData} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}