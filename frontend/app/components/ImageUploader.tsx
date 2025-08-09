'use client'

import { useState } from 'react'
import Cookies from 'js-cookie'

interface UploadedFileInfo {
  filename: string
  original_name: string
  width: number
  height: number
}

interface ImageUploaderProps {
  onFileUploaded?: (filename: string, info: { width: number; height: number }) => void
  onMultipleFilesUploaded?: (files: UploadedFileInfo[]) => void
  multiple?: boolean
}

export default function ImageUploader({ onFileUploaded, onMultipleFilesUploaded, multiple = false }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'))
    
    if (imageFiles.length === 0) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    setIsUploading(true)
    const token = Cookies.get('auth_token')
    try {
      if (multiple && imageFiles.length > 1) {
        // 다중 파일 업로드
        const formData = new FormData()
        imageFiles.forEach(file => {
          formData.append('files', file)
        })

        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch('http://localhost:8000/upload-multiple', {
          method: 'POST',
          headers,
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        onMultipleFilesUploaded?.(result.uploaded_files)
      } else {
        // 단일 파일 업로드 (기존 방식)
        const file = imageFiles[0]
        const formData = new FormData()
        formData.append('file', file)

        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch('http://localhost:8000/upload', {
          method: 'POST',
          headers,
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        
        // 파일 정보 가져오기
        const infoHeaders: HeadersInit = {}
        if (token) {
          infoHeaders['Authorization'] = `Bearer ${token}`
        }
        
        const infoResponse = await fetch(`http://localhost:8000/files/${result.filename}`, {
          headers: infoHeaders
        })
        const info = await infoResponse.json()
        
        onFileUploaded?.(result.filename, { width: info.width, height: info.height })
      }
    } catch (error) {
      console.error('업로드 오류:', error)
      alert('파일 업로드 중 오류가 발생했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files)
    }
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver 
          ? 'border-blue-400 bg-blue-50' 
          : 'border-gray-300 hover:border-gray-400'
      }`}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
    >
      {isUploading ? (
        <div className="text-blue-600">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p>파일 업로드 중...</p>
        </div>
      ) : (
        <>
          <div className="text-gray-600 mb-4">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-900 mb-2">
            {multiple ? '다중 이미지 파일을 드래그하거나 클릭하여 업로드' : '이미지 파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            PNG, JPG, JPEG 파일을 지원합니다 {multiple && '(여러 파일 선택 가능)'}
          </p>
          <input
            type="file"
            accept="image/*"
            multiple={multiple}
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
          >
            파일 선택
          </label>
        </>
      )}
    </div>
  )
}