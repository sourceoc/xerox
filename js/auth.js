class AuthSystem {
    constructor() {
        this.sessionKey = 'xerox-session';
        this.adminKey = 'xerox-admin-hash';
        this.sessionTimeout = 8 * 60 * 60 * 1000; // 8 horas
        this.rateLimitKey = 'xerox-rate-limit';
        this.maxAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000; // 15 minutos
        this.initializeDefaultAdmin();
    }

    initializeDefaultAdmin() {
        const existingAdmin = localStorage.getItem(this.adminKey);
        if (!existingAdmin) {
            // Senha padrão: admin123
            const defaultPasswordHash = this.hashPassword('admin123');
            const adminData = {
                username: 'admin',
                passwordHash: defaultPasswordHash,
                createdAt: Date.now(),
                permissions: ['read', 'write', 'delete', 'admin']
            };
            localStorage.setItem(this.adminKey, JSON.stringify(adminData));
        }
    }

    hashPassword(password) {
        return CryptoUtils.hash(password + 'salt_xerox_2025');
    }

    checkRateLimit() {
        const rateLimitData = JSON.parse(localStorage.getItem(this.rateLimitKey) || '{}');
        const now = Date.now();
        
        // Limpar tentativas antigas (mais de 15 minutos)
        if (rateLimitData.lockedUntil && now > rateLimitData.lockedUntil) {
            localStorage.removeItem(this.rateLimitKey);
            return { allowed: true, remainingAttempts: this.maxAttempts };
        }
        
        // Verificar se está bloqueado
        if (rateLimitData.lockedUntil && now < rateLimitData.lockedUntil) {
            const timeLeft = Math.ceil((rateLimitData.lockedUntil - now) / 1000 / 60);
            return { 
                allowed: false, 
                message: `Muitas tentativas. Tente novamente em ${timeLeft} minutos.`,
                timeLeft: timeLeft
            };
        }
        
        // Limpar tentativas antigas (mais de 1 hora sem lockout)
        if (rateLimitData.lastAttempt && (now - rateLimitData.lastAttempt) > 60 * 60 * 1000) {
            localStorage.removeItem(this.rateLimitKey);
            return { allowed: true, remainingAttempts: this.maxAttempts };
        }
        
        const attempts = rateLimitData.attempts || 0;
        const remaining = this.maxAttempts - attempts;
        
        return { 
            allowed: remaining > 0, 
            remainingAttempts: remaining,
            message: remaining <= 2 && remaining > 0 ? `Atenção: ${remaining} tentativas restantes` : null
        };
    }

    recordFailedAttempt() {
        const rateLimitData = JSON.parse(localStorage.getItem(this.rateLimitKey) || '{}');
        const now = Date.now();
        
        rateLimitData.attempts = (rateLimitData.attempts || 0) + 1;
        rateLimitData.lastAttempt = now;
        
        if (rateLimitData.attempts >= this.maxAttempts) {
            rateLimitData.lockedUntil = now + this.lockoutTime;
        }
        
        localStorage.setItem(this.rateLimitKey, JSON.stringify(rateLimitData));
    }

    clearRateLimit() {
        localStorage.removeItem(this.rateLimitKey);
    }

    async login(username, password) {
        try {
            // Verificar rate limiting
            const rateCheck = this.checkRateLimit();
            if (!rateCheck.allowed) {
                return { success: false, message: rateCheck.message };
            }

            const adminData = JSON.parse(localStorage.getItem(this.adminKey) || '{}');
            
            if (adminData.username === username && 
                adminData.passwordHash === this.hashPassword(password)) {
                
                // Login bem-sucedido - limpar rate limiting
                this.clearRateLimit();
                
                const sessionData = {
                    username: username,
                    loginTime: Date.now(),
                    expiresAt: Date.now() + this.sessionTimeout,
                    permissions: adminData.permissions
                };

                const encryptedSession = await CryptoUtils.encrypt(
                    JSON.stringify(sessionData), 
                    password
                );
                
                sessionStorage.setItem(this.sessionKey, encryptedSession);
                sessionStorage.setItem(this.sessionKey + '_pwd', CryptoUtils.hash(password));
                
                return { success: true, user: sessionData };
            }
            
            // Login falhou - registrar tentativa
            this.recordFailedAttempt();
            
            // Verificar se ainda tem tentativas ou se foi bloqueado
            const newRateCheck = this.checkRateLimit();
            let message = 'Credenciais inválidas';
            
            if (!newRateCheck.allowed) {
                message = newRateCheck.message;
            } else if (newRateCheck.message) {
                message += '. ' + newRateCheck.message;
            }
            
            return { success: false, message: message };
        } catch (error) {
            console.error('Erro no login:', error);
            return { success: false, message: 'Erro interno do sistema' };
        }
    }

    async logout() {
        sessionStorage.removeItem(this.sessionKey);
        sessionStorage.removeItem(this.sessionKey + '_pwd');
        window.location.reload();
    }

    async getCurrentUser() {
        try {
            const encryptedSession = sessionStorage.getItem(this.sessionKey);
            const passwordHash = sessionStorage.getItem(this.sessionKey + '_pwd');
            
            if (!encryptedSession || !passwordHash) {
                return null;
            }

            const adminData = JSON.parse(localStorage.getItem(this.adminKey) || '{}');
            if (!adminData.passwordHash) return null;

            // Usar o hash da senha armazenado para descriptografar
            const decryptionKey = this.deriveDecryptionKey(passwordHash);
            const sessionData = JSON.parse(await CryptoUtils.decrypt(encryptedSession, decryptionKey));
            
            if (Date.now() > sessionData.expiresAt) {
                this.logout();
                return null;
            }

            return sessionData;
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
            this.logout();
            return null;
        }
    }

    deriveDecryptionKey(passwordHash) {
        // Deriva uma chave de descriptografia a partir do hash da senha
        return passwordHash.substring(0, 32) + 'xerox_decrypt_key';
    }

    async changePassword(currentPassword, newPassword) {
        try {
            const user = await this.getCurrentUser();
            if (!user) {
                return { success: false, message: 'Usuário não autenticado' };
            }

            const adminData = JSON.parse(localStorage.getItem(this.adminKey) || '{}');
            
            if (adminData.passwordHash !== this.hashPassword(currentPassword)) {
                return { success: false, message: 'Senha atual incorreta' };
            }

            adminData.passwordHash = this.hashPassword(newPassword);
            adminData.updatedAt = Date.now();
            
            localStorage.setItem(this.adminKey, JSON.stringify(adminData));
            
            // Atualizar sessão
            await this.logout();
            await this.login(adminData.username, newPassword);
            
            return { success: true, message: 'Senha alterada com sucesso' };
        } catch (error) {
            console.error('Erro ao alterar senha:', error);
            return { success: false, message: 'Erro interno do sistema' };
        }
    }

    hasPermission(permission) {
        const user = JSON.parse(sessionStorage.getItem('current-user') || '{}');
        return user.permissions && user.permissions.includes(permission);
    }

    showLoginModal() {
        const loginModal = document.getElementById('modalLogin');
        if (loginModal) {
            loginModal.style.display = 'block';
        }
    }

    hideLoginModal() {
        const loginModal = document.getElementById('modalLogin');
        if (loginModal) {
            loginModal.style.display = 'none';
        }
    }
}

// Sistema de proteção de rotas
class RouteProtection {
    static async checkAuth() {
        const auth = new AuthSystem();
        const user = await auth.getCurrentUser();
        
        if (!user) {
            auth.showLoginModal();
            return false;
        }
        
        // Atualizar informações do usuário na interface
        RouteProtection.updateUserInfo(user);
        return true;
    }

    static updateUserInfo(user) {
        sessionStorage.setItem('current-user', JSON.stringify(user));
        
        // Atualizar elementos da interface
        const userInfo = document.querySelector('.user-info');
        if (userInfo) {
            userInfo.textContent = `👤 ${user.username}`;
        }

        const logoutBtn = document.getElementById('btnLogout');
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-block';
        }
    }

    static async requirePermission(permission) {
        const isAuthenticated = await RouteProtection.checkAuth();
        if (!isAuthenticated) return false;

        const auth = new AuthSystem();
        if (!auth.hasPermission(permission)) {
            ToastSystem.show('Você não tem permissão para esta ação', 'error');
            return false;
        }
        
        return true;
    }
}