'use client'

interface ProcessedData {
  headers: string[]
  csv_data: any[][]
  raw_data: any
  filename: string
  masked_filename: string
  mask_regions_count: number
}

interface ResultTableProps {
  data: ProcessedData
}

export default function ResultTable({ data }: ResultTableProps) {
  const downloadCSV = () => {
    const csvContent = [
      data.headers.join(','),
      ...data.csv_data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `extracted_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    link.click()
  }

  const copyToClipboard = async () => {
    const csvContent = [
      data.headers.join('\t'),
      ...data.csv_data.map(row => row.join('\t'))
    ].join('\n')

    try {
      await navigator.clipboard.writeText(csvContent)
      alert('클립보드에 복사되었습니다!')
    } catch (error) {
      console.error('클립보드 복사 실패:', error)
      alert('클립보드 복사에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      {/* 처리 정보 */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-lg font-medium text-green-800 mb-2">처리 완료!</h3>
        <div className="text-sm text-green-700 space-y-1">
          <p><strong>원본 파일:</strong> {data.filename}</p>
          <p><strong>마스킹된 파일:</strong> {data.masked_filename}</p>
          <p><strong>마스킹 영역 수:</strong> {data.mask_regions_count}개</p>
          <p><strong>추출된 데이터 행 수:</strong> {data.csv_data.length}개</p>
        </div>
      </div>

      {/* 액션 버튼들 */}
      <div className="flex gap-4">
        <button
          onClick={downloadCSV}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV 다운로드
        </button>
        <button
          onClick={copyToClipboard}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          클립보드 복사
        </button>
      </div>

      {/* 데이터 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {data.headers.map((header, index) => (
                <th
                  key={index}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.csv_data.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-300"
                  >
                    {cell || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 원시 데이터 (개발자용) */}
      <details className="bg-gray-50 rounded-lg p-4">
        <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
          원시 데이터 보기 (개발자용)
        </summary>
        <div className="mt-4">
          <pre className="bg-gray-800 text-green-400 p-4 rounded text-xs overflow-x-auto">
            {JSON.stringify(data.raw_data, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  )
}