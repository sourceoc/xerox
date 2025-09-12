// Sistema de Error Boundaries e tratamento de erros
class ErrorHandler {
    constructor() {
        this.errorCount = 0;
        this.maxErrors = 10;
        this.errorLog = [];
        this.criticalErrors = [];
        this.setupGlobalErrorHandlers();
    }

    setupGlobalErrorHandlers() {
        // Capturar erros JavaScript não tratados
        window.addEventListener('error', (event) => {
            this.handleError({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                stack: event.error?.stack
            });
        });

        // Capturar promises rejeitadas não tratadas
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError({
                type: 'promise',
                message: event.reason?.message || 'Unhandled Promise Rejection',
                reason: event.reason,
                stack: event.reason?.stack
            });
            
            // Prevenir que o erro apareça no console
            event.preventDefault();
        });

        // Capturar erros de recursos (imagens, scripts, etc)
        window.addEventListener('error', (event) => {
            if (event.target !== window) {
                this.handleError({
                    type: 'resource',
                    message: `Failed to load resource: ${event.target.src || event.target.href}`,
                    element: event.target.tagName,
                    source: event.target.src || event.target.href
                });
            }
        }, true);
    }

    handleError(errorInfo) {
        this.errorCount++;
        
        const errorData = {
            ...errorInfo,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            userId: this.getCurrentUserId()
        };

        // Adicionar ao log
        this.errorLog.push(errorData);
        
        // Manter apenas os últimos 50 erros
        if (this.errorLog.length > 50) {
            this.errorLog.shift();
        }

        // Verificar se é um erro crítico
        if (this.isCriticalError(errorInfo)) {
            this.criticalErrors.push(errorData);
            this.handleCriticalError(errorData);
        }

        // Log para desenvolvimento
        if (process?.env?.NODE_ENV === 'development') {
            console.error('Error captured by ErrorHandler:', errorData);
        }

        // Reportar erro se configurado
        this.reportError(errorData);

        // Verificar se deve mostrar fallback UI
        if (this.shouldShowFallback()) {
            this.showErrorFallback(errorData);
        }
    }

    isCriticalError(errorInfo) {
        const criticalPatterns = [
            /chunk load failed/i,
            /loading chunk/i,
            /network error/i,
            /script error/i,
            /auth/i,
            /token/i,
            /session/i,
            /storage/i
        ];

        return criticalPatterns.some(pattern => 
            pattern.test(errorInfo.message) || 
            pattern.test(errorInfo.filename || '')
        );
    }

    handleCriticalError(errorData) {
        // Tentar recuperação automática
        this.attemptRecovery(errorData);
        
        // Notificar usuário de forma não intrusiva
        if (typeof ToastSystem !== 'undefined') {
            ToastSystem.error('Ocorreu um erro crítico. Tentando recuperar automaticamente...');
        }
        
        // Salvar estado atual antes de possível crash
        this.saveEmergencyState();
    }

    attemptRecovery(errorData) {
        try {
            switch (errorData.type) {
                case 'storage':
                    this.recoverStorage();
                    break;
                    
                case 'network':
                    this.recoverNetwork();
                    break;
                    
                case 'auth':
                    this.recoverAuth();
                    break;
                    
                default:
                    this.genericRecovery();
                    break;
            }
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
            this.showEmergencyFallback();
        }
    }

    recoverStorage() {
        try {
            // Tentar limpar storage corrompido
            const testKey = 'storage-test-' + Date.now();
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (error) {
            // Storage está corrompido, mostrar aviso
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.warning('Problemas detectados no armazenamento. Alguns dados podem ser perdidos.');
            }
        }
    }

    recoverNetwork() {
        // Tentar reconectar ou usar cache
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'NETWORK_ERROR_RECOVERY'
            });
        }
    }

    recoverAuth() {
        // Tentar reautenticar silenciosamente
        setTimeout(() => {
            if (window.sistema?.auth) {
                window.sistema.auth.getCurrentUser().catch(() => {
                    // Falha na reautenticação, redirecionar para login
                    window.sistema.auth.showLoginModal();
                });
            }
        }, 1000);
    }

    genericRecovery() {
        // Recarregar recursos críticos
        this.reloadCriticalResources();
    }

    reloadCriticalResources() {
        try {
            // Recarregar scripts críticos se necessário
            const scripts = ['js/crypto-utils.js', 'js/auth.js', 'js/validation.js'];
            scripts.forEach(script => {
                const existingScript = document.querySelector(`script[src="${script}"]`);
                if (!existingScript) {
                    const newScript = document.createElement('script');
                    newScript.src = script + '?t=' + Date.now();
                    newScript.onerror = () => this.showEmergencyFallback();
                    document.head.appendChild(newScript);
                }
            });
        } catch (error) {
            console.error('Failed to reload critical resources:', error);
        }
    }

    shouldShowFallback() {
        return this.errorCount >= this.maxErrors || 
               this.criticalErrors.length >= 3;
    }

    showErrorFallback(errorData) {
        // Criar UI de fallback
        const fallbackDiv = document.createElement('div');
        fallbackDiv.id = 'error-fallback';
        fallbackDiv.className = 'error-fallback';
        fallbackDiv.innerHTML = `
            <div class="error-fallback-content">
                <h2>⚠️ Sistema Temporariamente Indisponível</h2>
                <p>Detectamos alguns problemas técnicos. Nossa equipe foi notificada.</p>
                <div class="error-actions">
                    <button onclick="location.reload()" class="btn btn-primary">
                        🔄 Recarregar Página
                    </button>
                    <button onclick="this.clearStorage()" class="btn btn-secondary">
                        🗑️ Limpar Cache
                    </button>
                    <details class="error-details">
                        <summary>Detalhes Técnicos</summary>
                        <pre>${JSON.stringify(errorData, null, 2)}</pre>
                    </details>
                </div>
            </div>
        `;

        // Adicionar estilos inline para garantir que funcionem
        const style = document.createElement('style');
        style.textContent = `
            .error-fallback {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .error-fallback-content {
                background: #1a1a1a;
                padding: 2rem;
                border-radius: 8px;
                max-width: 500px;
                text-align: center;
                border: 2px solid #dc3545;
            }
            .error-fallback h2 {
                color: #dc3545;
                margin-bottom: 1rem;
            }
            .error-actions {
                margin-top: 2rem;
                display: flex;
                gap: 1rem;
                justify-content: center;
                flex-wrap: wrap;
            }
            .error-fallback .btn {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                text-decoration: none;
                display: inline-block;
            }
            .error-fallback .btn-primary {
                background: #007bff;
                color: white;
            }
            .error-fallback .btn-secondary {
                background: #6c757d;
                color: white;
            }
            .error-details {
                margin-top: 1rem;
                text-align: left;
            }
            .error-details pre {
                background: #2d2d2d;
                padding: 1rem;
                border-radius: 4px;
                overflow: auto;
                max-height: 200px;
                font-size: 12px;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(fallbackDiv);

        // Adicionar método para limpar storage
        window.clearStorage = () => {
            try {
                localStorage.clear();
                sessionStorage.clear();
                location.reload();
            } catch (error) {
                location.reload();
            }
        };
    }

    showEmergencyFallback() {
        document.body.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: #1a1a1a;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                text-align: center;
            ">
                <div>
                    <h1 style="color: #dc3545; margin-bottom: 1rem;">🚨 Erro Crítico</h1>
                    <p>O sistema encontrou um erro crítico e precisa ser recarregado.</p>
                    <button onclick="location.reload()" style="
                        margin-top: 2rem;
                        padding: 1rem 2rem;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 1rem;
                    ">Recarregar Sistema</button>
                </div>
            </div>
        `;
    }

    saveEmergencyState() {
        try {
            const emergencyState = {
                timestamp: new Date().toISOString(),
                url: window.location.href,
                errorCount: this.errorCount,
                lastErrors: this.errorLog.slice(-5)
            };
            
            localStorage.setItem('emergency-state', JSON.stringify(emergencyState));
        } catch (error) {
            console.error('Failed to save emergency state:', error);
        }
    }

    reportError(errorData) {
        // Reportar erro para serviço de logging se configurado
        try {
            // Aqui você poderia enviar para um serviço como Sentry, LogRocket, etc.
            if (window.errorReportingEndpoint) {
                fetch(window.errorReportingEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(errorData)
                }).catch(() => {
                    // Falha silenciosa no reporting
                });
            }
        } catch (error) {
            console.error('Failed to report error:', error);
        }
    }

    getCurrentUserId() {
        try {
            const currentUser = JSON.parse(sessionStorage.getItem('current-user') || '{}');
            return currentUser.username || 'anonymous';
        } catch {
            return 'anonymous';
        }
    }

    // Método para componentes reportarem erros manualmente
    captureException(error, context = {}) {
        this.handleError({
            type: 'manual',
            message: error.message,
            stack: error.stack,
            context,
            error
        });
    }

    // Wrapper para funções que podem gerar erros
    withErrorBoundary(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.captureException(error, { ...context, args });
                throw error;
            }
        };
    }

    // Método para obter estatísticas de erro
    getErrorStats() {
        return {
            totalErrors: this.errorCount,
            criticalErrors: this.criticalErrors.length,
            recentErrors: this.errorLog.slice(-10),
            errorTypes: this.getErrorTypesCount()
        };
    }

    getErrorTypesCount() {
        const types = {};
        this.errorLog.forEach(error => {
            types[error.type] = (types[error.type] || 0) + 1;
        });
        return types;
    }

    // Método para limpar logs antigos
    clearOldLogs(maxAge = 24 * 60 * 60 * 1000) {
        const cutoff = new Date(Date.now() - maxAge);
        this.errorLog = this.errorLog.filter(error => 
            new Date(error.timestamp) > cutoff
        );
        this.criticalErrors = this.criticalErrors.filter(error => 
            new Date(error.timestamp) > cutoff
        );
    }
}

// Instanciar globalmente
window.ErrorHandler = ErrorHandler;
window.errorHandler = new ErrorHandler();

// Cleanup periódico
setInterval(() => {
    window.errorHandler.clearOldLogs();
}, 60 * 60 * 1000); // A cada hora