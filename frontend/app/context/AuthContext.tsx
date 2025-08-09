'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import axios from 'axios'

interface User {
  id: string
  email: string
  display_name: string
  created_at: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 토큰 설정 함수
  const setAuthToken = (authToken: string) => {
    setToken(authToken)
    Cookies.set('auth_token', authToken, { expires: 1 }) // 1일 유효
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`
  }

  // 토큰 제거 함수
  const removeAuthToken = () => {
    setToken(null)
    Cookies.remove('auth_token')
    delete axios.defaults.headers.common['Authorization']
  }

  // 사용자 정보 가져오기
  const fetchUserInfo = async (authToken: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setUser(response.data)
    } catch (error) {
      console.error('Failed to fetch user info:', error)
      removeAuthToken()
      setUser(null)
    }
  }

  // 초기화: 저장된 토큰 확인
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = Cookies.get('auth_token')
      if (savedToken) {
        setAuthToken(savedToken)
        await fetchUserInfo(savedToken)
      }
      setLoading(false)
    }

    initAuth()
  }, [])

  // 로그인
  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password
      })

      const { access_token, user: userData } = response.data
      setAuthToken(access_token)
      setUser(userData)
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || '로그인에 실패했습니다.')
    }
  }

  // 회원가입
  const register = async (email: string, password: string, displayName?: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        email,
        password,
        display_name: displayName
      })

      const { access_token, user: userData } = response.data
      setAuthToken(access_token)
      setUser(userData)
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || '회원가입에 실패했습니다.')
    }
  }

  // 로그아웃
  const logout = () => {
    removeAuthToken()
    setUser(null)
  }

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}