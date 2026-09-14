import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { reportError } from '../api/system';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Ловит ошибки рендера, отправляет в трекер (см. план "Трекинг ошибок") и показывает фолбэк. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError({
      message: error.message || 'Ошибка рендера',
      stack: `${error.stack ?? ''}\n--- componentStack ---${info.componentStack ?? ''}`,
      url: window.location.href,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Result
        status="error"
        title="Что-то пошло не так"
        subTitle="Мы уже зафиксировали ошибку. Попробуйте перезагрузить страницу."
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            Перезагрузить
          </Button>
        }
      />
    );
  }
}
