'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import axios from 'axios'

interface ExtractedData {
  id: string
  session_id?: string
  filename: string
  original_filename: string
  status: string
  created_at: string
  processed_csv_data?: {
    headers: string[]
    rows: any[][]
  }
  error_message?: string
}

interface UserSession {
  id: string
  session_name: string
  total_images: number
  successful_images: number
  failed_images: number
  status: string
  created_at: string
}

interface UserDataResponse {
  data: ExtractedData[]
  total_count: number
  sessions: UserSession[]
}

export default function UserDashboard() {
  const { user, logout } = useAuth()
  const [userData, setUserData] = useState<UserDataResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/user/data`)
      setUserData(response.data)
    } catch (error) {
      console.error('Error fetching user data:', error)
      // 인증 오류시 로그아웃 처리
      if (error.response?.status === 401 || error.response?.status === 403) {
        logout()
      }
    } finally {
      setLoading(false)
    }
  }

  const downloadCSV = (data: ExtractedData[]) => {
    if (!data.length) return

    const headers = ['파일명', '반출내용', '구매방법', '구매품명', '길이', '개수', '처리일시']
    const rows = []

    data.forEach(item => {
      if (item.processed_csv_data?.rows) {
        item.processed_csv_data.rows.forEach(row => {
          rows.push([
            ...row,
            format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss')
          ])
        })
      }
    })

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `extracted_data_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredData = selectedSession
    ? userData?.data.filter(item => item.session_id === selectedSession) || []
    : userData?.data || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3">데이터를 불러오는 중...</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">내 데이터</h2>
          <p className="text-gray-600 mt-1">
            {user?.display_name || user?.email}님의 추출 데이터 ({userData?.total_count || 0}개)
          </p>
        </div>
        <button
          onClick={logout}
          className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
        >
          로그아웃
        </button>
      </div>

      {/* 세션 필터 */}
      {userData?.sessions && userData.sessions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">세션별 필터</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSession(null)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedSession === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체 ({userData.total_count})
            </button>
            {userData.sessions.map(session => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session.id)}
                className={`px-3 py-1 rounded-full text-sm ${
                  selectedSession === session.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {session.session_name} ({session.successful_images})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      {filteredData.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => downloadCSV(filteredData)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            CSV 다운로드 ({filteredData.length}개 파일)
          </button>
        </div>
      )}

      {/* 데이터 테이블 */}
      {filteredData.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  파일명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  추출된 행 수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  처리일시
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {item.original_filename}
                    </div>
                    <div className="text-sm text-gray-500">{item.filename}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      item.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : item.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.status === 'completed' ? '완료' : 
                       item.status === 'failed' ? '실패' : '처리중'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.processed_csv_data?.rows?.length || 0}개
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {item.status === 'completed' && item.processed_csv_data?.rows && (
                      <button
                        onClick={() => downloadCSV([item])}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        다운로드
                      </button>
                    )}
                    {item.status === 'failed' && (
                      <span className="text-red-600" title={item.error_message}>
                        오류 확인
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">아직 추출된 데이터가 없습니다</h3>
            <p className="text-gray-600">
              이미지를 업로드하고 데이터를 추출해보세요!
            </p>
          </div>
        </div>
      )}
    </div>
  )
}