import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Đã xảy ra lỗi</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại hoặc quay về trang chủ.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleRetry} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Thử lại
            </Button>
            <Button onClick={this.handleGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Về trang chủ
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
