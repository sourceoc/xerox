// Sistema seguro de armazenamento de tokens e dados sensíveis
class SecureStorage {
    constructor() {
        this.storageKey = 'xerox-secure-data';
        this.tokenKey = 'xerox-encrypted-tokens';
        this.salt = 'xerox_secure_salt_2025';
    }

    // Gerar chave de criptografia baseada em informações do usuário
    async generateUserKey() {
        const userInfo = {
            userAgent: navigator.userAgent.substring(0, 50),
            language: navigator.language,
            platform: navigator.platform,
            timestamp: Math.floor(Date.now() / (1000 * 60 * 60 * 24)) // Dia atual
        };
        
        const keyMaterial = JSON.stringify(userInfo) + this.salt;
        return await CryptoUtils.hash(keyMaterial);
    }

    // Criptografar dados sensíveis
    async encryptSensitiveData(data) {
        try {
            const userKey = await this.generateUserKey();
            const encrypted = await CryptoUtils.encrypt(JSON.stringify(data), userKey);
            return encrypted;
        } catch (error) {
            window.errorHandler?.captureException(error, {
                component: 'secure-storage',
                method: 'encryptSensitiveData'
            });
            throw error;
        }
    }

    // Descriptografar dados sensíveis
    async decryptSensitiveData(encryptedData) {
        try {
            if (!encryptedData) return null;
            
            const userKey = await this.generateUserKey();
            const decrypted = await CryptoUtils.decrypt(encryptedData, userKey);
            return JSON.parse(decrypted);
        } catch (error) {
            window.errorHandler?.captureException(error, {
                component: 'secure-storage',
                method: 'decryptSensitiveData'
            });
            // Retornar null se não conseguir descriptografar (dados corrompidos)
            return null;
        }
    }

    // Salvar token GitHub de forma segura
    async saveGitHubToken(token, repository) {
        try {
            const sensitiveData = {
                token: this.obfuscateToken(token),
                repository: repository,
                timestamp: Date.now(),
                version: '1.0'
            };

            const encrypted = await this.encryptSensitiveData(sensitiveData);
            sessionStorage.setItem(this.tokenKey, encrypted);
            
            return true;
        } catch (error) {
            window.errorHandler?.captureException(error, {
                component: 'secure-storage',
                method: 'saveGitHubToken'
            });
            return false;
        }
    }

    // Recuperar token GitHub
    async getGitHubToken() {
        try {
            const encrypted = sessionStorage.getItem(this.tokenKey);
            if (!encrypted) return null;

            const sensitiveData = await this.decryptSensitiveData(encrypted);
            if (!sensitiveData) return null;

            return {
                token: this.deobfuscateToken(sensitiveData.token),
                repository: sensitiveData.repository,
                timestamp: sensitiveData.timestamp
            };
        } catch (error) {
            window.errorHandler?.captureException(error, {
                component: 'secure-storage',
                method: 'getGitHubToken'
            });
            return null;
        }
    }

    // Obfuscar token para evitar detecção
    obfuscateToken(token) {
        if (!token) return '';
        
        // Dividir o token e embaralhar
        const parts = [];
        for (let i = 0; i < token.length; i += 8) {
            parts.push(token.substring(i, i + 8));
        }
        
        // Adicionar partes falsas e embaralhar
        const obfuscated = {
            p: parts.reverse(),
            d: Array(parts.length).fill(0).map(() => Math.random().toString(36).substring(7)),
            l: token.length,
            c: Date.now()
        };
        
        return btoa(JSON.stringify(obfuscated));
    }

    // Desobfuscar token
    deobfuscateToken(obfuscatedToken) {
        if (!obfuscatedToken) return '';
        
        try {
            const obfuscated = JSON.parse(atob(obfuscatedToken));
            return obfuscated.p.reverse().join('');
        } catch (error) {
            return '';
        }
    }

    // Limpar dados sensíveis
    clearSensitiveData() {
        sessionStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.storageKey);
    }

    // Verificar se token está válido (não expirado)
    async isTokenValid() {
        const tokenData = await this.getGitHubToken();
        if (!tokenData) return false;

        // Verificar se não está muito antigo (24 horas)
        const maxAge = 24 * 60 * 60 * 1000;
        return (Date.now() - tokenData.timestamp) < maxAge;
    }

    // Criar proxy seguro para requisições GitHub
    async createSecureGitHubRequest(url, options = {}) {
        const tokenData = await this.getGitHubToken();
        if (!tokenData || !tokenData.token) {
            throw new Error('Token GitHub não configurado ou inválido');
        }

        // Usar token obfuscado nas headers
        const secureOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${tokenData.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Xerox-System-v2.0.0',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        };

        return { url, options: secureOptions };
    }

    // Método para testar conectividade GitHub
    async testGitHubConnection() {
        try {
            const tokenData = await this.getGitHubToken();
            if (!tokenData) return { success: false, error: 'Token não configurado' };

            const { url, options } = await this.createSecureGitHubRequest(
                `https://api.github.com/repos/${tokenData.repository}`,
                { method: 'GET' }
            );

            const response = await fetch(url, options);
            
            if (response.ok) {
                const data = await response.json();
                return { 
                    success: true, 
                    repository: data.full_name,
                    private: data.private 
                };
            } else {
                return { 
                    success: false, 
                    error: `HTTP ${response.status}: ${response.statusText}` 
                };
            }
        } catch (error) {
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    // Salvar configurações não-sensíveis
    savePublicConfig(config) {
        const publicConfig = {
            repositorio: config.repositorio,
            ultimaAtualizacao: config.ultimaAtualizacao,
            autoSync: config.autoSync || false,
            syncInterval: config.syncInterval || 300000 // 5 minutos
        };

        localStorage.setItem('xerox-public-config', JSON.stringify(publicConfig));
    }

    // Carregar configurações não-sensíveis
    getPublicConfig() {
        try {
            const config = localStorage.getItem('xerox-public-config');
            return config ? JSON.parse(config) : {};
        } catch {
            return {};
        }
    }

    // Validar formato do token GitHub
    validateGitHubToken(token) {
        if (!token) return { valid: false, error: 'Token vazio' };
        
        // Verificar padrões de token GitHub
        const patterns = {
            classic: /^ghp_[a-zA-Z0-9]{36}$/,
            finegrained: /^github_pat_[a-zA-Z0-9_]{82}$/,
            app: /^ghs_[a-zA-Z0-9]{36}$/
        };

        const tokenType = Object.keys(patterns).find(type => patterns[type].test(token));
        
        if (!tokenType) {
            return { 
                valid: false, 
                error: 'Formato de token inválido. Use um Personal Access Token válido.' 
            };
        }

        return { valid: true, type: tokenType };
    }

    // Mascarar token para exibição
    maskToken(token) {
        if (!token || token.length < 8) return '****';
        return token.substring(0, 4) + '*'.repeat(token.length - 8) + token.substring(token.length - 4);
    }
}

// Instância global
window.SecureStorage = SecureStorage;
window.secureStorage = new SecureStorage();