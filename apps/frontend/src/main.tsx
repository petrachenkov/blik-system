import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './shared/auth/AuthContext';
import { ThemeProvider, useThemeMode } from './shared/theme/ThemeContext';
import { FeatureFlagsProvider } from './shared/flags/FeatureFlagsContext';
import { ErrorBoundary } from './shared/errors/ErrorBoundary';
import { installGlobalErrorReporting } from './shared/errors/globalErrorReporting';
import { App } from './app/App';
import './shared/styles/mobile-card-header.css';

installGlobalErrorReporting();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ThemedApp() {
  const { effective } = useThemeMode();

  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: effective === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2b6cb0',
          borderRadius: 8,
          fontSize: 14,
        },
        components: {
          Card: { borderRadiusLG: 12 },
          Menu: { darkItemBg: '#101a2b', darkItemSelectedBg: '#2b6cb0' },
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <FeatureFlagsProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </FeatureFlagsProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </StrictMode>,
);
