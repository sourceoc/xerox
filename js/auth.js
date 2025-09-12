class AuthSystem {
    constructor() {
        this.sessionKey = 'xerox-session';
        this.adminKey = 'xerox-admin-hash';
        this.sessionTimeout = 8 * 60 * 60 * 1000; // 8 horas
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

    async login(username, password) {
        try {
            const adminData = JSON.parse(localStorage.getItem(this.adminKey) || '{}');
            
            if (adminData.username === username && 
                adminData.passwordHash === this.hashPassword(password)) {
                
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
            
            return { success: false, message: 'Credenciais inválidas' };
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

            // Para descriptografar, precisamos "reverter" o hash (simulação)
            const adminData = JSON.parse(localStorage.getItem(this.adminKey) || '{}');
            if (!adminData.passwordHash) return null;

            // Verificar se a sessão ainda é válida
            const sessionData = JSON.parse(await CryptoUtils.decrypt(encryptedSession, 'admin123'));
            
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