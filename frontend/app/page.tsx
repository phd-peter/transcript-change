'use client'

import { useState, useRef } from 'react'
import Cookies from 'js-cookie'
import ImageUploader from './components/ImageUploader'
import MaskingCanvas from './components/MaskingCanvas'
import ResultTable from './components/ResultTable'
import MultiImageManager from './components/MultiImageManager'
import AuthComponent from './components/AuthComponent'
import UserDashboard from './components/UserDashboard'
import { useAuth } from './context/AuthContext'

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

interface UploadedFileInfo {
  filename: string
  original_name: string
  width: number
  height: number
}

interface ImageMaskData {
  filename: string
  mask_regions: MaskRegion[]
}

interface BatchProcessedData {
  success: boolean
  total_images: number
  successful_images: number
  failed_images: number
  headers: string[]
  csv_data: any[][]
  results: any[]
  failed_files: string[]
}

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  
  // 모드 선택
  const [mode, setMode] = useState<'single' | 'multiple' | 'dashboard'>('single')
  const [showAuth, setShowAuth] = useState(false)
  
  // 단일 이미지 모드 상태
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null)
  const [maskRegions, setMaskRegions] = useState<MaskRegion[]>([])
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // 다중 이미지 모드 상태
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([])
  const [batchProcessedData, setBatchProcessedData] = useState<BatchProcessedData | null>(null)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)

  const handleFileUploaded = (filename: string, info: { width: number; height: number }) => {
    setUploadedFile(filename)
    setImageInfo(info)
    setMaskRegions([])
    setProcessedData(null)
  }

  const handleMultipleFilesUploaded = (files: UploadedFileInfo[]) => {
    setUploadedFiles(files)
    setBatchProcessedData(null)
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
      const headers: any = {
        'Content-Type': 'application/json'
      }
      
      // 로그인한 사용자만 토큰 추가
      if (user) {
        headers['Authorization'] = `Bearer ${Cookies.get('auth_token') || ''}`
      }

      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: uploadedFile,
          mask_regions: maskRegions,
          session_name: user ? `Single Processing ${new Date().toLocaleString()}` : undefined
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

  const handleBatchProcess = async (imagesMaskData: ImageMaskData[]) => {
    if (!user) {
      alert('로그인이 필요합니다.')
      setShowAuth(true)
      return
    }

    setIsBatchProcessing(true)
    try {
      const response = await fetch('http://localhost:8000/process-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Cookies.get('auth_token') || ''}`
        },
        body: JSON.stringify({
          images: imagesMaskData,
          session_name: `Batch Processing ${new Date().toLocaleString()}`
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      setBatchProcessedData(result)
    } catch (error) {
      console.error('일괄 처리 중 오류:', error)
      alert('일괄 처리 중 오류가 발생했습니다.')
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const resetAll = () => {
    setUploadedFile(null)
    setImageInfo(null)
    setMaskRegions([])
    setProcessedData(null)
    setUploadedFiles([])
    setBatchProcessedData(null)
  }

  const switchMode = (newMode: 'single' | 'multiple' | 'dashboard') => {
    // 다중 이미지 모드나 대시보드 선택 시 로그인 확인
    if ((newMode === 'multiple' || newMode === 'dashboard') && !user) {
      setShowAuth(true)
      return
    }
    
    resetAll()
    setMode(newMode)
  }

  // 로딩 중일 때
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 인증 모달
  if (showAuth && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <AuthComponent onClose={() => setShowAuth(false)} />
      </div>
    )
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
          
          {/* 사용자 정보 및 로그인 버튼 */}
          <div className="mt-4 flex justify-center items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-gray-700">
                  👋 안녕하세요, {user.display_name || user.email}님!
                </span>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                로그인 / 회원가입
              </button>
            )}
          </div>
          
          {/* 모드 선택 */}
          <div className="mt-6 flex justify-center">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => switchMode('single')}
                className={`px-4 py-2 rounded-md font-medium ${
                  mode === 'single'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                단일 이미지 모드
              </button>
              <button
                onClick={() => switchMode('multiple')}
                className={`px-4 py-2 rounded-md font-medium ${
                  mode === 'multiple'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                다중 이미지 모드
              </button>
              {user && (
                <button
                  onClick={() => switchMode('dashboard')}
                  className={`px-4 py-2 rounded-md font-medium ${
                    mode === 'dashboard'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  내 데이터
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 단계별 UI */}
        <div className="space-y-8">
          {mode === 'dashboard' ? (
            <UserDashboard />
          ) : mode === 'single' ? (
            <>
              {/* 단일 이미지 모드 */}
              {/* 1단계: 파일 업로드 */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">1단계: 이미지 업로드</h2>
                <ImageUploader onFileUploaded={handleFileUploaded} multiple={false} />
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
                  {!user && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="text-blue-800 font-medium mb-2">🔓 단일 이미지 모드는 로그인 없이 사용 가능합니다!</h3>
                      <p className="text-blue-700 text-sm">
                        • 바로 데이터 추출이 가능합니다<br/>
                        • 로그인하시면 데이터가 저장되어 나중에 다시 확인할 수 있습니다<br/>
                        • 다중 이미지 처리를 원하시면 로그인이 필요합니다
                      </p>
                    </div>
                  )}
                  {user && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800">
                        ✅ 로그인된 상태입니다. 추출된 데이터가 자동으로 저장됩니다.
                      </p>
                    </div>
                  )}
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
            </>
          ) : (
            <>
              {/* 다중 이미지 모드 */}
              {/* 1단계: 파일 업로드 */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">1단계: 다중 이미지 업로드</h2>
                <ImageUploader onMultipleFilesUploaded={handleMultipleFilesUploaded} multiple={true} />
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg">
                    <p className="text-green-800 font-medium">
                      ✅ {uploadedFiles.length}개 파일 업로드 완료
                    </p>
                    <div className="mt-2 text-sm text-green-700">
                      {uploadedFiles.map((file, index) => (
                        <div key={file.filename} className="flex justify-between">
                          <span>{file.original_name}</span>
                          <span>{file.width} × {file.height}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2단계: 다중 이미지 마스킹 */}
              {uploadedFiles.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4">2단계: 각 이미지별 마스킹</h2>
                  <p className="text-gray-600 mb-4">
                    각 이미지별로 마스킹 영역을 선택하세요. 모든 이미지의 마스킹이 완료되면 일괄 처리를 시작할 수 있습니다.
                  </p>
                  {!user ? (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h3 className="text-red-800 font-medium mb-2">🔒 다중 이미지 모드는 로그인이 필요합니다</h3>
                      <p className="text-red-700 text-sm mb-3">
                        다중 이미지 처리 결과를 안전하게 저장하고 관리하기 위해 회원가입/로그인이 필요합니다.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowAuth(true)}
                          className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
                        >
                          로그인하기
                        </button>
                        <button
                          onClick={() => switchMode('single')}
                          className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600"
                        >
                          단일 이미지 모드로 이동
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800">
                        ✅ 로그인된 상태입니다. 일괄 처리 결과가 자동으로 저장됩니다.
                      </p>
                    </div>
                  )}
                  {user && (
                    <MultiImageManager
                      uploadedFiles={uploadedFiles}
                      onMaskingComplete={handleBatchProcess}
                    />
                  )}
                </div>
              )}

              {/* 3단계: 일괄 처리 진행 상황 */}
              {isBatchProcessing && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4">일괄 처리 중...</h2>
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <span className="ml-4 text-lg">이미지들을 처리하고 있습니다...</span>
                  </div>
                </div>
              )}

              {/* 4단계: 일괄 처리 결과 */}
              {batchProcessedData && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4">일괄 처리 결과</h2>
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-lg font-medium text-green-800 mb-2">처리 완료!</h3>
                    <div className="text-sm text-green-700 space-y-1">
                      <p><strong>총 이미지:</strong> {batchProcessedData.total_images}개</p>
                      <p><strong>성공:</strong> {batchProcessedData.successful_images}개</p>
                      <p><strong>실패:</strong> {batchProcessedData.failed_images}개</p>
                      <p><strong>추출된 데이터 행 수:</strong> {batchProcessedData.csv_data.length}개</p>
                      {batchProcessedData.failed_files.length > 0 && (
                        <p><strong>실패한 파일:</strong> {batchProcessedData.failed_files.join(', ')}</p>
                      )}
                    </div>
                  </div>
                  <ResultTable data={batchProcessedData} />
                </div>
              )}
              
              {/* 다시 시작 버튼 */}
              {(uploadedFiles.length > 0 || batchProcessedData) && (
                <div className="text-center">
                  <button
                    onClick={resetAll}
                    className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
                  >
                    처음부터 다시
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}