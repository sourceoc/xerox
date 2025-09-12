class SistemaXerox {
    constructor() {
        this.dados = null;
        this.usuarioEditando = null;
        this.usuarioHistorico = null;
        this.usuarioEditandoCota = null;
        this.auth = new AuthSystem();
        this.currentPage = 1;
        this.itemsPerPage = 25;
        this.sortField = null;
        this.sortDirection = 'asc';
        
        // Virtual scrolling
        this.virtualScrolling = {
            enabled: false,
            rowHeight: 60,
            containerHeight: 400,
            visibleRows: 10,
            startIndex: 0,
            endIndex: 0,
            scrollTop: 0
        };
        this.filtros = {
            nome: '',
            setor: '',
            dataInicio: '',
            dataFim: '',
            status: ''
        };
        
        // Para rastrear event listeners e evitar memory leaks
        this.eventListeners = [];
        this.boundMethods = {};
        this.timers = [];
        this.filterTimeout = null;
        this.syncInterval = null;
        
        this.init();
    }

    // Método para adicionar event listeners de forma rastreável
    addEventListenerSafe(element, event, handler, options = {}) {
        if (!element) return;
        
        const wrappedHandler = (...args) => handler(...args);
        element.addEventListener(event, wrappedHandler, options);
        
        this.eventListeners.push({
            element,
            event,
            handler: wrappedHandler,
            options
        });
    }

    // Método para remover todos os event listeners
    removeAllEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                console.warn('Erro ao remover event listener:', error);
            }
        });
        this.eventListeners = [];
    }

    // Método para criar métodos bound reutilizáveis
    getBoundMethod(methodName) {
        if (!this.boundMethods[methodName]) {
            this.boundMethods[methodName] = this[methodName].bind(this);
        }
        return this.boundMethods[methodName];
    }

    // Métodos para rastrear timers
    setTimeoutSafe(callback, delay) {
        const id = setTimeout(callback, delay);
        this.timers.push({ id, type: 'timeout' });
        return id;
    }

    setIntervalSafe(callback, delay) {
        const id = setInterval(callback, delay);
        this.timers.push({ id, type: 'interval' });
        return id;
    }

    async init() {
        await this.loadingState(true);
        
        try {
            // Envolver métodos críticos com error boundaries
            const safeVerificarAuth = window.errorHandler?.withErrorBoundary(
                this.verificarAutenticacao.bind(this), 
                { component: 'auth', method: 'verificarAutenticacao' }
            ) || this.verificarAutenticacao.bind(this);
            
            const safeCarregarDados = window.errorHandler?.withErrorBoundary(
                this.carregarDados.bind(this), 
                { component: 'data', method: 'carregarDados' }
            ) || this.carregarDados.bind(this);
            
            await safeVerificarAuth();
            await safeCarregarDados();
            
            // Configurações que podem falhar de forma não-crítica
            try {
                this.configurarEventos();
                this.configurarValidacoes();
                this.renderizar();
                this.configurarTemas();
            } catch (configError) {
                window.errorHandler?.captureException(configError, {
                    component: 'config',
                    method: 'init-configuration'
                });
                ToastSystem.warning('Algumas funcionalidades podem estar limitadas devido a erros de configuração');
            }
            
            ToastSystem.success('Sistema carregado com sucesso!');
        } catch (error) {
            console.error('Erro na inicialização:', error);
            window.errorHandler?.captureException(error, {
                component: 'system',
                method: 'init',
                critical: true
            });
            ToastSystem.error('Erro ao carregar o sistema: ' + error.message);
        } finally {
            await this.loadingState(false);
        }
    }

    async verificarAutenticacao() {
        const isAuthenticated = await RouteProtection.checkAuth();
        if (!isAuthenticated) {
            this.showLoginModal();
            return;
        }
        
        this.updateUserInterface();
    }

    updateUserInterface() {
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');
        const btnLogout = document.getElementById('btnLogout');
        
        if (userInfo) userInfo.classList.add('authenticated');
        if (userName) userName.textContent = '👤 admin';
        if (btnLogout) btnLogout.style.display = 'inline-block';
    }

    showLoginModal() {
        const modal = document.getElementById('modalLogin');
        if (modal) {
            modal.style.display = 'block';
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    async loadingState(show) {
        const container = document.querySelector('.container');
        if (!container) return;

        if (show) {
            const overlay = Utils.createLoadingOverlay('Carregando sistema...');
            container.appendChild(overlay);
        } else {
            const overlay = container.querySelector('.loading-overlay');
            if (overlay) Utils.removeLoadingOverlay(overlay);
        }
    }

    async carregarDados() {
        try {
            // Tentar carregar dados locais primeiro
            if (this.carregarDadosLocal()) {
                console.log('Dados carregados do localStorage');
                return;
            }
            
            // Carregar dados do arquivo JSON
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.dados = await response.json();
            this.salvarDadosLocal();
            
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            
            // Dados padrão em caso de erro
            this.dados = {
                usuarios: [],
                configuracoes: {
                    tokenGithub: '',
                    repositorio: '',
                    ultimaAtualizacao: new Date().toISOString()
                }
            };
            
            ToastSystem.warning('Dados padrão carregados devido a erro no carregamento');
        }
    }

    configurarEventos() {
        // Eventos principais
        this.setupMainEvents();
        
        // Eventos de formulários
        this.setupFormEvents();
        
        // Eventos de filtros com debounce
        this.setupFilterEvents();
        
        // Eventos de paginação
        this.setupPaginationEvents();
        
        // Eventos de ordenação
        this.setupSortingEvents();
        
        // Eventos de modais
        this.setupModalEvents();
        
        // Eventos de tema
        this.setupThemeEvents();
    }

    setupMainEvents() {
        this.addEventListenerSafe(document.getElementById('btnConfiguracoes'), 'click', () => {
            if (this.hasPermission('admin')) {
                this.abrirModalConfiguracoes();
            } else {
                ToastSystem.error('Acesso negado: permissões insuficientes');
            }
        });
        
        this.addEventListenerSafe(document.getElementById('btnSincronizar'), 'click', this.getBoundMethod('sincronizarDados'));
        this.addEventListenerSafe(document.getElementById('btnNovoUsuario'), 'click', this.getBoundMethod('abrirModalUsuario'));
        this.addEventListenerSafe(document.getElementById('btnLogout'), 'click', this.getBoundMethod('logout'));
        this.addEventListenerSafe(document.getElementById('btnLimparFiltros'), 'click', this.getBoundMethod('limparFiltros'));
    }

    setupFormEvents() {
        // Login
        const formLogin = document.getElementById('formLogin');
        if (formLogin) {
            CommonValidators.login.setupFormValidation('formLogin');
            formLogin.addEventListener('validationSuccess', (e) => this.handleLogin(e.detail));
            formLogin.addEventListener('validationError', (e) => {
                ToastSystem.error('Preencha todos os campos corretamente');
            });
        }

        // Usuário
        const formUsuario = document.getElementById('formUsuario');
        if (formUsuario) {
            CommonValidators.usuario.setupFormValidation('formUsuario');
            formUsuario.addEventListener('validationSuccess', (e) => this.salvarUsuario(e.detail));
        }

        // Gasto
        const formNovoGasto = document.getElementById('formNovoGasto');
        if (formNovoGasto) {
            CommonValidators.gasto.setupFormValidation('formNovoGasto');
            formNovoGasto.addEventListener('validationSuccess', (e) => this.salvarNovoGasto(e.detail));
        }

        // Alterar senha
        const formAlterarSenha = document.getElementById('formAlterarSenha');
        if (formAlterarSenha) {
            CommonValidators.senha.setupFormValidation('formAlterarSenha');
            formAlterarSenha.addEventListener('validationSuccess', (e) => this.alterarSenha(e.detail));
        }

        // Configurações
        const formConfiguracoes = document.getElementById('formConfiguracoes');
        formConfiguracoes?.addEventListener('submit', (e) => this.salvarConfiguracoes(e));

        // Editar cota
        const formEditarCota = document.getElementById('formEditarCota');
        formEditarCota?.addEventListener('submit', (e) => this.salvarEditarCota(e));
    }

    setupFilterEvents() {
        const filtroNome = document.getElementById('filtroNome');
        const filtroSetor = document.getElementById('filtroSetor');
        const filtroStatus = document.getElementById('filtroStatus');
        const filtroDataInicio = document.getElementById('filtroDataInicio');
        const filtroDataFim = document.getElementById('filtroDataFim');

        // Debounce para filtro de nome
        if (filtroNome) {
            const debouncedFilter = Utils.debounce(() => {
                this.filtros.nome = filtroNome.value.toLowerCase();
                this.aplicarFiltros();
            }, 300);
            
            filtroNome.addEventListener('input', debouncedFilter);
        }

        // Filtros instantâneos
        filtroSetor?.addEventListener('change', () => {
            this.filtros.setor = filtroSetor.value;
            this.aplicarFiltros();
        });

        filtroStatus?.addEventListener('change', () => {
            this.filtros.status = filtroStatus.value;
            this.aplicarFiltros();
        });

        filtroDataInicio?.addEventListener('change', () => {
            this.filtros.dataInicio = filtroDataInicio.value;
            this.aplicarFiltros();
        });

        filtroDataFim?.addEventListener('change', () => {
            this.filtros.dataFim = filtroDataFim.value;
            this.aplicarFiltros();
        });
    }

    setupPaginationEvents() {
        document.getElementById('btnPrimeiraPagina')?.addEventListener('click', () => this.irParaPagina(1));
        document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => this.irParaPagina(this.currentPage - 1));
        document.getElementById('btnProximaPagina')?.addEventListener('click', () => this.irParaPagina(this.currentPage + 1));
        document.getElementById('btnUltimaPagina')?.addEventListener('click', () => this.irParaPagina(this.getTotalPages()));
        
        document.getElementById('itensPorPagina')?.addEventListener('change', (e) => {
            this.itemsPerPage = parseInt(e.target.value) || 25;
            this.currentPage = 1;
            this.renderizarTabelaUsuarios();
        });
    }

    setupSortingEvents() {
        const headers = document.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            header.addEventListener('click', () => this.sortTable(header.dataset.sort));
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.sortTable(header.dataset.sort);
                }
            });
        });
    }

    setupModalEvents() {
        // Fechar modais clicando fora ou no X
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.fecharModal(e.target.id);
            } else if (e.target.classList.contains('close')) {
                this.fecharModal(e.target.closest('.modal').id);
            }
        });

        // Fechar modais com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modalsAbertos = document.querySelectorAll('.modal[style*="block"]');
                modalsAbertos.forEach(modal => this.fecharModal(modal.id));
            }
        });

        // Botões de cancelar
        document.querySelectorAll('[id^="btnCancelar"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) this.fecharModal(modal.id);
            });
        });

        // Configurar modais específicos
        document.getElementById('btnNovoGasto')?.addEventListener('click', () => this.abrirModalNovoGasto());
    }

    setupThemeEvents() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    configurarValidacoes() {
        // As validações já foram configuradas nos eventos dos formulários
        // Aqui podemos adicionar validações customizadas se necessário
        
        // Validação em tempo real para cota restante
        const novaCotaUsada = document.getElementById('novaCotaUsada');
        if (novaCotaUsada) {
            novaCotaUsada.addEventListener('input', () => this.atualizarCotaRestantePreview());
        }
    }

    configurarTemas() {
        // Carregar tema salvo
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.classList.toggle('dark', theme === 'dark');
        }
    }

    async handleLogin(data) {
        const loadingToast = ToastSystem.loading('Fazendo login...');
        
        try {
            const result = await this.auth.login(data.loginUsuario, data.loginSenha);
            ToastSystem.close(loadingToast);
            
            if (result.success) {
                ToastSystem.success(`Bem-vindo, ${result.user.username}!`);
                this.fecharModal('modalLogin');
                this.updateUserInterface();
            } else {
                ToastSystem.error(result.message);
            }
        } catch (error) {
            ToastSystem.close(loadingToast);
            ToastSystem.error('Erro interno no login');
            console.error('Erro no login:', error);
        }
    }

    async logout() {
        ToastSystem.confirm(
            'Tem certeza que deseja sair do sistema?',
            async () => {
                // Limpar todos os event listeners para prevenir memory leaks
                this.removeAllEventListeners();
                
                // Limpar intervalos e timeouts
                this.clearAllTimers();
                
                // Limpar dados sensíveis da memória
                this.dados = null;
                this.usuarioEditando = null;
                this.usuarioHistorico = null;
                this.usuarioEditandoCota = null;
                
                // Limpar bound methods
                this.boundMethods = {};
                
                await this.auth.logout();
                ToastSystem.success('Logout realizado com sucesso');
            }
        );
    }

    // Método para limpar todos os timers
    clearAllTimers() {
        // Limpar qualquer timeout ou interval armazenado
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
            this.filterTimeout = null;
        }
        
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        // Limpar qualquer outro timer que possa ter sido criado
        if (this.timers) {
            this.timers.forEach(timer => {
                if (timer.type === 'timeout') {
                    clearTimeout(timer.id);
                } else if (timer.type === 'interval') {
                    clearInterval(timer.id);
                }
            });
            this.timers = [];
        }
    }

    limparFiltros() {
        // Limpar campos de filtro
        document.getElementById('filtroNome').value = '';
        document.getElementById('filtroSetor').value = '';
        document.getElementById('filtroStatus').value = '';
        document.getElementById('filtroDataInicio').value = '';
        document.getElementById('filtroDataFim').value = '';
        
        // Resetar filtros internos
        this.filtros = {
            nome: '',
            setor: '',
            dataInicio: '',
            dataFim: '',
            status: ''
        };
        
        // Aplicar filtros vazios
        this.aplicarFiltros();
        ToastSystem.info('Filtros limpos');
    }

    aplicarFiltros() {
        this.currentPage = 1; // Resetar para primeira página
        this.renderizarTabelaUsuarios();
    }

    filtrarUsuariosDados() {
        let usuariosFiltrados = [...this.dados.usuarios];

        // Filtro por nome
        if (this.filtros.nome) {
            usuariosFiltrados = usuariosFiltrados.filter(usuario =>
                usuario.nome.toLowerCase().includes(this.filtros.nome)
            );
        }

        // Filtro por setor
        if (this.filtros.setor) {
            usuariosFiltrados = usuariosFiltrados.filter(usuario =>
                usuario.setor === this.filtros.setor
            );
        }

        // Filtro por status
        if (this.filtros.status) {
            usuariosFiltrados = usuariosFiltrados.filter(usuario => {
                const percentual = (usuario.cotaUsada / usuario.cotaTotal) * 100;
                
                switch (this.filtros.status) {
                    case 'baixa':
                        return percentual < 20;
                    case 'media':
                        return percentual >= 20 && percentual <= 60;
                    case 'alta':
                        return percentual > 60;
                    default:
                        return true;
                }
            });
        }

        // Filtro por período (baseado no histórico)
        if (this.filtros.dataInicio || this.filtros.dataFim) {
            usuariosFiltrados = usuariosFiltrados.filter(usuario => {
                if (!usuario.historico || usuario.historico.length === 0) return false;
                
                return usuario.historico.some(item => {
                    const dataItem = new Date(item.data);
                    const dataInicio = this.filtros.dataInicio ? new Date(this.filtros.dataInicio) : null;
                    const dataFim = this.filtros.dataFim ? new Date(this.filtros.dataFim) : null;
                    
                    if (dataInicio && dataItem < dataInicio) return false;
                    if (dataFim && dataItem > dataFim) return false;
                    return true;
                });
            });
        }

        return usuariosFiltrados;
    }

    sortTable(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }

        // Atualizar indicadores visuais
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        const currentHeader = document.querySelector(`th[data-sort="${field}"]`);
        if (currentHeader) {
            currentHeader.classList.add(`sort-${this.sortDirection}`);
        }

        this.renderizarTabelaUsuarios();
    }

    sortUsers(usuarios) {
        if (!this.sortField) return usuarios;

        return usuarios.sort((a, b) => {
            let valueA = a[this.sortField];
            let valueB = b[this.sortField];

            // Tratamento especial para percentual
            if (this.sortField === 'percentual') {
                valueA = (a.cotaUsada / a.cotaTotal) * 100;
                valueB = (b.cotaUsada / b.cotaTotal) * 100;
            }

            // Tratamento para strings
            if (typeof valueA === 'string') {
                valueA = valueA.toLowerCase();
                valueB = valueB.toLowerCase();
            }

            let comparison = 0;
            if (valueA > valueB) {
                comparison = 1;
            } else if (valueA < valueB) {
                comparison = -1;
            }

            return this.sortDirection === 'desc' ? comparison * -1 : comparison;
        });
    }

    irParaPagina(pagina) {
        const totalPages = this.getTotalPages();
        
        if (pagina < 1 || pagina > totalPages) return;
        
        this.currentPage = pagina;
        this.renderizarTabelaUsuarios();
    }

    getTotalPages() {
        const usuariosFiltrados = this.filtrarUsuariosDados();
        return Math.ceil(usuariosFiltrados.length / this.itemsPerPage);
    }

    getPaginatedUsers(usuarios) {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        return usuarios.slice(startIndex, endIndex);
    }

    updatePaginationInfo() {
        const usuariosFiltrados = this.filtrarUsuariosDados();
        const totalUsers = usuariosFiltrados.length;
        const totalPages = this.getTotalPages();
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIndex = Math.min(this.currentPage * this.itemsPerPage, totalUsers);

        // Atualizar info de paginação
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Mostrando ${startIndex}-${endIndex} de ${totalUsers} usuários`;
        }

        const paginaAtual = document.getElementById('paginaAtual');
        if (paginaAtual) {
            paginaAtual.textContent = `Página ${this.currentPage} de ${totalPages}`;
        }

        // Atualizar botões de navegação
        const btnPrimeira = document.getElementById('btnPrimeiraPagina');
        const btnAnterior = document.getElementById('btnPaginaAnterior');
        const btnProxima = document.getElementById('btnProximaPagina');
        const btnUltima = document.getElementById('btnUltimaPagina');

        if (btnPrimeira) btnPrimeira.disabled = this.currentPage <= 1;
        if (btnAnterior) btnAnterior.disabled = this.currentPage <= 1;
        if (btnProxima) btnProxima.disabled = this.currentPage >= totalPages;
        if (btnUltima) btnUltima.disabled = this.currentPage >= totalPages;
    }

    renderizar() {
        this.atualizarDashboard();
        this.atualizarFiltroSetores();
        this.renderizarTabelaUsuarios();
    }

    atualizarDashboard() {
        const totalUsuarios = this.dados.usuarios.length;
        const cotaTotal = this.dados.usuarios.reduce((sum, user) => sum + user.cotaTotal, 0);
        const cotaUsada = this.dados.usuarios.reduce((sum, user) => sum + user.cotaUsada, 0);
        const cotaRestante = cotaTotal - cotaUsada;

        // Animar os valores
        Utils.animateValue(document.getElementById('totalUsuarios'), 0, totalUsuarios, 800);
        Utils.animateValue(document.getElementById('cotaTotal'), 0, cotaTotal, 1000);
        Utils.animateValue(document.getElementById('cotaUtilizada'), 0, cotaUsada, 1200);
        Utils.animateValue(document.getElementById('cotaRestante'), 0, cotaRestante, 1400);
    }

    atualizarFiltroSetores() {
        const setores = [...new Set(this.dados.usuarios.map(user => user.setor))];
        const select = document.getElementById('filtroSetor');
        
        if (select) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Todos os setores</option>';
            
            setores.forEach(setor => {
                const option = document.createElement('option');
                option.value = setor;
                option.textContent = setor;
                if (setor === valorAtual) option.selected = true;
                select.appendChild(option);
            });
        }
    }

    renderizarTabelaUsuarios() {
        const tbody = document.querySelector('#tabelaUsuarios tbody');
        if (!tbody) return;

        // Aplicar filtros e ordenação
        let usuariosFiltrados = this.filtrarUsuariosDados();
        usuariosFiltrados = this.sortUsers(usuariosFiltrados);

        // Verificar se deve usar virtual scrolling (para grandes volumes de dados)
        if (usuariosFiltrados.length > 100) {
            this.renderWithVirtualScrolling(tbody, usuariosFiltrados);
        } else {
            this.renderWithPagination(tbody, usuariosFiltrados);
        }
    }

    renderWithVirtualScrolling(tbody, usuarios) {
        this.virtualScrolling.enabled = true;
        const container = tbody.parentElement;
        const tableContainer = container.parentElement;
        
        // Configurar container para virtual scrolling
        if (!container.classList.contains('virtual-scroll-container')) {
            container.classList.add('virtual-scroll-container');
            container.style.height = this.virtualScrolling.containerHeight + 'px';
            container.style.overflowY = 'auto';
            container.style.position = 'relative';
            
            // Adicionar spacer div
            this.virtualScrollSpacer = document.createElement('div');
            this.virtualScrollSpacer.style.height = (usuarios.length * this.virtualScrolling.rowHeight) + 'px';
            this.virtualScrollSpacer.style.position = 'absolute';
            this.virtualScrollSpacer.style.top = '0';
            this.virtualScrollSpacer.style.width = '100%';
            this.virtualScrollSpacer.style.pointerEvents = 'none';
            container.insertBefore(this.virtualScrollSpacer, container.firstChild);
            
            // Adicionar event listener para scroll
            this.addEventListenerSafe(container, 'scroll', this.getBoundMethod('handleVirtualScroll'));
        }

        this.allUsers = usuarios;
        this.updateVirtualScrollView();
    }

    renderWithPagination(tbody, usuarios) {
        this.virtualScrolling.enabled = false;
        const container = tbody.parentElement;
        
        // Remover virtual scrolling se estava ativo
        if (container.classList.contains('virtual-scroll-container')) {
            container.classList.remove('virtual-scroll-container');
            container.style.height = 'auto';
            container.style.overflowY = 'visible';
            container.style.position = 'static';
            
            if (this.virtualScrollSpacer) {
                this.virtualScrollSpacer.remove();
                this.virtualScrollSpacer = null;
            }
        }

        // Paginação tradicional
        const usuariosPaginados = this.getPaginatedUsers(usuarios);

        // Limpar tabela
        tbody.innerHTML = '';

        // Renderizar usuários
        usuariosPaginados.forEach(usuario => {
            const row = this.criarLinhaUsuario(usuario);
            tbody.appendChild(row);
        });

        // Atualizar paginação
        this.updatePaginationInfo();

        // Se não há usuários, mostrar mensagem
        if (usuariosPaginados.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="7" class="no-data">
                    ${usuarios.length === 0 ? 
                        '🔍 Nenhum usuário encontrado com os filtros aplicados' : 
                        '📄 Nenhum usuário nesta página'
                    }
                </td>
            `;
            tbody.appendChild(row);
        }
    }

    handleVirtualScroll(e) {
        if (!this.virtualScrolling.enabled) return;
        
        const container = e.target;
        this.virtualScrolling.scrollTop = container.scrollTop;
        
        // Debounce para otimizar performance
        if (this.virtualScrollTimeout) {
            clearTimeout(this.virtualScrollTimeout);
        }
        
        this.virtualScrollTimeout = this.setTimeoutSafe(() => {
            this.updateVirtualScrollView();
        }, 16); // ~60fps
    }

    updateVirtualScrollView() {
        if (!this.allUsers || !this.virtualScrolling.enabled) return;

        const tbody = document.querySelector('#tabelaUsuarios tbody');
        if (!tbody) return;

        // Calcular quais itens devem ser visíveis
        const scrollTop = this.virtualScrolling.scrollTop;
        const containerHeight = this.virtualScrolling.containerHeight;
        const rowHeight = this.virtualScrolling.rowHeight;

        const startIndex = Math.floor(scrollTop / rowHeight);
        const endIndex = Math.min(
            startIndex + Math.ceil(containerHeight / rowHeight) + 1,
            this.allUsers.length
        );

        // Adicionar buffer para scroll suave
        const buffer = 3;
        const bufferedStartIndex = Math.max(0, startIndex - buffer);
        const bufferedEndIndex = Math.min(this.allUsers.length, endIndex + buffer);

        this.virtualScrolling.startIndex = bufferedStartIndex;
        this.virtualScrolling.endIndex = bufferedEndIndex;

        // Limpar tbody
        tbody.innerHTML = '';

        // Criar container para as linhas visíveis
        const visibleContainer = document.createElement('div');
        visibleContainer.style.transform = `translateY(${bufferedStartIndex * rowHeight}px)`;
        visibleContainer.style.position = 'absolute';
        visibleContainer.style.top = '0';
        visibleContainer.style.width = '100%';

        // Renderizar apenas as linhas visíveis
        for (let i = bufferedStartIndex; i < bufferedEndIndex; i++) {
            const usuario = this.allUsers[i];
            if (usuario) {
                const row = this.criarLinhaUsuario(usuario);
                row.style.height = rowHeight + 'px';
                row.style.boxSizing = 'border-box';
                visibleContainer.appendChild(row);
            }
        }

        tbody.appendChild(visibleContainer);
    }

    criarLinhaUsuario(usuario) {
        const row = document.createElement('tr');
        const percentual = (usuario.cotaUsada / usuario.cotaTotal * 100).toFixed(1);
        
        const progressClass = Utils.getStatusClass(parseFloat(percentual));
        const statusBadge = Utils.getStatusBadge(parseFloat(percentual));

        row.innerHTML = `
            <td>
                <strong>${Utils.sanitizeInput(usuario.nome)}</strong>
            </td>
            <td>
                <span class="status-badge ${statusBadge}">
                    ${Utils.sanitizeInput(usuario.setor)}
                </span>
            </td>
            <td>${Utils.formatNumber(usuario.cotaTotal)}</td>
            <td>${Utils.formatNumber(usuario.cotaUsada)}</td>
            <td>${Utils.formatNumber(usuario.cotaRestante)}</td>
            <td>
                <div>${percentual}%</div>
                <div class="progress-container">
                    <div class="progress-bar-enhanced ${progressClass}" 
                         style="width: ${Math.min(percentual, 100)}%"
                         title="${percentual}% utilizado">
                        ${percentual}%
                    </div>
                </div>
            </td>
            <td>
                <div class="table-actions">
                    <button class="action-btn view" onclick="sistema.abrirHistorico(${usuario.id})" 
                            title="Ver histórico" aria-label="Ver histórico de ${usuario.nome}">
                        📊 Histórico
                    </button>
                    <button class="action-btn quota" onclick="sistema.editarCotaUsada(${usuario.id})" 
                            title="Editar cota" aria-label="Editar cota de ${usuario.nome}">
                        📝 Cota
                    </button>
                    <button class="action-btn edit" onclick="sistema.editarUsuario(${usuario.id})" 
                            title="Editar usuário" aria-label="Editar dados de ${usuario.nome}">
                        ✏️ Editar
                    </button>
                    <button class="action-btn delete" onclick="sistema.excluirUsuario(${usuario.id})" 
                            title="Excluir usuário" aria-label="Excluir ${usuario.nome}">
                        🗑️ Excluir
                    </button>
                </div>
            </td>
        `;

        // Adicionar atributos de acessibilidade
        row.setAttribute('role', 'row');
        row.querySelectorAll('td').forEach(td => td.setAttribute('role', 'cell'));

        return row;
    }

    // Métodos existentes adaptados...
    
    abrirModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            modal.setAttribute('aria-hidden', 'false');
            
            // Focar no primeiro elemento focável
            const focusable = modal.querySelector('input, button, select, textarea, [tabindex]');
            if (focusable) {
                setTimeout(() => focusable.focus(), 100);
            }
        }
    }

    fecharModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    hasPermission(permission) {
        // Por enquanto, sempre retorna true para admin
        return true;
    }

    // Métodos de CRUD e outras funcionalidades existentes...
    // (mantidos do código original mas adaptados para usar as novas funcionalidades)

    salvarDadosLocal() {
        try {
            localStorage.setItem('sistemaXeroxDados', JSON.stringify(this.dados));
        } catch (error) {
            console.error('Erro ao salvar dados locais:', error);
            ToastSystem.error('Erro ao salvar dados localmente');
        }
    }

    carregarDadosLocal() {
        try {
            const dados = localStorage.getItem('sistemaXeroxDados');
            if (dados) {
                this.dados = JSON.parse(dados);
                return true;
            }
        } catch (error) {
            console.error('Erro ao carregar dados locais:', error);
        }
        return false;
    }

    // Métodos CRUD e funcionalidades principais
    
    abrirModalConfiguracoes() {
        document.getElementById('tokenGithub').value = this.dados.configuracoes.tokenGithub || '';
        document.getElementById('repositorio').value = this.dados.configuracoes.repositorio || '';
        this.abrirModal('modalConfiguracoes');
    }

    abrirModalUsuario(usuario = null) {
        this.usuarioEditando = usuario;
        
        if (usuario) {
            document.getElementById('tituloModalUsuario').textContent = '✏️ Editar Usuário';
            document.getElementById('nomeUsuario').value = usuario.nome;
            document.getElementById('setorUsuario').value = usuario.setor;
            document.getElementById('cotaTotalUsuario').value = usuario.cotaTotal;
        } else {
            document.getElementById('tituloModalUsuario').textContent = '👤 Novo Usuário';
            document.getElementById('formUsuario').reset();
        }
        
        this.abrirModal('modalUsuario');
    }

    abrirHistorico(idUsuario) {
        const usuario = this.dados.usuarios.find(u => u.id === idUsuario);
        if (!usuario) return;

        this.usuarioHistorico = usuario;
        document.getElementById('tituloModalHistorico').textContent = `📊 Histórico de ${usuario.nome}`;
        
        this.renderizarTabelaHistorico(usuario.historico || []);
        this.abrirModal('modalHistorico');
    }

    renderizarTabelaHistorico(historico) {
        const tbody = document.querySelector('#tabelaHistorico tbody');
        tbody.innerHTML = '';

        historico.sort((a, b) => new Date(b.data) - new Date(a.data));

        historico.forEach((item, index) => {
            const row = document.createElement('tr');
            const data = Utils.formatDate(item.data);
            
            row.innerHTML = `
                <td>${data}</td>
                <td>${Utils.formatNumber(item.quantidade)}</td>
                <td>${Utils.sanitizeInput(item.tipo)}</td>
                <td>${Utils.sanitizeInput(item.descricao)}</td>
                <td>
                    <button class="action-btn delete" onclick="sistema.excluirGasto(${index})" 
                            title="Excluir gasto">
                        🗑️ Excluir
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    abrirModalNovoGasto() {
        document.getElementById('dataGasto').value = new Date().toISOString().split('T')[0];
        document.getElementById('formNovoGasto').reset();
        this.abrirModal('modalNovoGasto');
    }

    editarCotaUsada(idUsuario) {
        const usuario = this.dados.usuarios.find(u => u.id === idUsuario);
        if (!usuario) return;

        this.usuarioEditandoCota = usuario;
        
        document.getElementById('tituloModalEditarCota').textContent = `📝 Editar Cota de ${usuario.nome}`;
        document.getElementById('cotaAtualUsada').value = usuario.cotaUsada;
        document.getElementById('novaCotaUsada').value = usuario.cotaUsada;
        document.getElementById('cotaTotalInfo').textContent = Utils.formatNumber(usuario.cotaTotal);
        document.getElementById('novaCotaRestanteInfo').textContent = Utils.formatNumber(usuario.cotaRestante);
        document.getElementById('motivoAlteracao').value = '';
        
        this.abrirModal('modalEditarCota');
    }

    atualizarCotaRestantePreview() {
        if (!this.usuarioEditandoCota) return;
        
        const novaCotaUsada = parseInt(document.getElementById('novaCotaUsada').value) || 0;
        const cotaTotal = this.usuarioEditandoCota.cotaTotal;
        const novaCotaRestante = cotaTotal - novaCotaUsada;
        
        const span = document.getElementById('novaCotaRestanteInfo');
        span.textContent = Utils.formatNumber(novaCotaRestante);
        
        // Mudar cor se for negativo
        span.style.color = novaCotaRestante < 0 ? '#dc3545' : '#007bff';
    }

    editarUsuario(idUsuario) {
        const usuario = this.dados.usuarios.find(u => u.id === idUsuario);
        if (usuario) {
            this.abrirModalUsuario(usuario);
        }
    }

    excluirUsuario(idUsuario) {
        const usuario = this.dados.usuarios.find(u => u.id === idUsuario);
        if (!usuario) return;

        ToastSystem.confirm(
            `Tem certeza que deseja excluir o usuário "${usuario.nome}"?`,
            () => {
                this.dados.usuarios = this.dados.usuarios.filter(u => u.id !== idUsuario);
                this.salvarDadosLocal();
                this.renderizar();
                ToastSystem.success('Usuário excluído com sucesso!');
            }
        );
    }

    excluirGasto(index) {
        if (!this.usuarioHistorico) return;

        ToastSystem.confirm(
            'Tem certeza que deseja excluir este gasto?',
            () => {
                const gasto = this.usuarioHistorico.historico[index];
                this.usuarioHistorico.cotaUsada -= gasto.quantidade;
                this.usuarioHistorico.cotaRestante = this.usuarioHistorico.cotaTotal - this.usuarioHistorico.cotaUsada;
                
                this.usuarioHistorico.historico.splice(index, 1);

                this.salvarDadosLocal();
                this.renderizar();
                this.renderizarTabelaHistorico(this.usuarioHistorico.historico);
                ToastSystem.success('Gasto removido com sucesso!');
            }
        );
    }

    salvarConfiguracoes(e) {
        e.preventDefault();
        
        this.dados.configuracoes.tokenGithub = document.getElementById('tokenGithub').value;
        this.dados.configuracoes.repositorio = document.getElementById('repositorio').value;
        this.dados.configuracoes.ultimaAtualizacao = new Date().toISOString();
        
        this.salvarDadosLocal();
        this.fecharModal('modalConfiguracoes');
        ToastSystem.success('Configurações salvas com sucesso!');
    }

    salvarUsuario(data) {
        const nome = Utils.sanitizeInput(data.nomeUsuario);
        const setor = Utils.sanitizeInput(data.setorUsuario);
        const cotaTotal = parseInt(data.cotaTotalUsuario);

        if (this.usuarioEditando) {
            this.usuarioEditando.nome = nome;
            this.usuarioEditando.setor = setor;
            this.usuarioEditando.cotaTotal = cotaTotal;
            this.usuarioEditando.cotaRestante = cotaTotal - this.usuarioEditando.cotaUsada;
            ToastSystem.success('Usuário atualizado com sucesso!');
        } else {
            const novoUsuario = {
                id: Utils.generateId(),
                nome,
                setor,
                cotaTotal,
                cotaUsada: 0,
                cotaRestante: cotaTotal,
                historico: []
            };
            this.dados.usuarios.push(novoUsuario);
            ToastSystem.success('Novo usuário criado com sucesso!');
        }

        this.salvarDadosLocal();
        this.renderizar();
        this.fecharModal('modalUsuario');
    }

    salvarNovoGasto(data) {
        if (!this.usuarioHistorico) return;

        const novoGasto = {
            data: data.dataGasto,
            quantidade: parseInt(data.quantidadeGasto),
            tipo: data.tipoGasto,
            descricao: Utils.sanitizeInput(data.descricaoGasto)
        };

        if (!this.usuarioHistorico.historico) {
            this.usuarioHistorico.historico = [];
        }

        this.usuarioHistorico.historico.push(novoGasto);
        this.usuarioHistorico.cotaUsada += novoGasto.quantidade;
        this.usuarioHistorico.cotaRestante = this.usuarioHistorico.cotaTotal - this.usuarioHistorico.cotaUsada;

        this.salvarDadosLocal();
        this.renderizar();
        this.renderizarTabelaHistorico(this.usuarioHistorico.historico);
        this.fecharModal('modalNovoGasto');
        ToastSystem.success('Gasto adicionado com sucesso!');
    }

    salvarEditarCota(e) {
        e.preventDefault();
        
        if (!this.usuarioEditandoCota) return;

        const novaCotaUsada = parseInt(document.getElementById('novaCotaUsada').value);
        const motivoAlteracao = Utils.sanitizeInput(document.getElementById('motivoAlteracao').value);
        const cotaAnterior = this.usuarioEditandoCota.cotaUsada;

        // Atualizar dados do usuário
        this.usuarioEditandoCota.cotaUsada = novaCotaUsada;
        this.usuarioEditandoCota.cotaRestante = this.usuarioEditandoCota.cotaTotal - novaCotaUsada;

        // Adicionar entrada no histórico
        if (!this.usuarioEditandoCota.historico) {
            this.usuarioEditandoCota.historico = [];
        }

        this.usuarioEditandoCota.historico.push({
            data: new Date().toISOString().split('T')[0],
            quantidade: novaCotaUsada - cotaAnterior,
            tipo: 'ajuste',
            descricao: `Ajuste manual: ${motivoAlteracao} (de ${Utils.formatNumber(cotaAnterior)} para ${Utils.formatNumber(novaCotaUsada)})`
        });

        this.salvarDadosLocal();
        this.renderizar();
        this.fecharModal('modalEditarCota');
        ToastSystem.success(`Cota de ${this.usuarioEditandoCota.nome} atualizada com sucesso!`);
        this.usuarioEditandoCota = null;
    }

    alterarSenha(data) {
        // Validar senhas
        if (data.novaSenha !== data.confirmarSenha) {
            ToastSystem.error('As senhas não coincidem');
            return;
        }

        const loadingToast = ToastSystem.loading('Alterando senha...');
        
        this.auth.changePassword(data.senhaAtual, data.novaSenha)
            .then(result => {
                ToastSystem.close(loadingToast);
                if (result.success) {
                    ToastSystem.success(result.message);
                    this.fecharModal('modalAlterarSenha');
                } else {
                    ToastSystem.error(result.message);
                }
            })
            .catch(error => {
                ToastSystem.close(loadingToast);
                ToastSystem.error('Erro ao alterar senha');
                console.error('Erro:', error);
            });
    }

    async sincronizarDados() {
        const btnSincronizar = document.getElementById('btnSincronizar');
        const textoOriginal = btnSincronizar.innerHTML;
        
        Utils.showLoadingState(btnSincronizar, true);

        try {
            if (!this.dados.configuracoes.tokenGithub || !this.dados.configuracoes.repositorio) {
                throw new Error('Configure o token do GitHub e o repositório nas configurações');
            }

            // Tentar baixar dados do GitHub primeiro
            await this.baixarDadosGithub();
            
            // Depois enviar dados locais
            await this.enviarDadosGithub();
            
            ToastSystem.success('Dados sincronizados com sucesso!');
        } catch (error) {
            console.error('Erro na sincronização:', error);
            ToastSystem.error(`Erro na sincronização: ${error.message}`);
        } finally {
            Utils.showLoadingState(btnSincronizar, false);
        }
    }

    async baixarDadosGithub() {
        const { tokenGithub, repositorio } = this.dados.configuracoes;
        
        try {
            const response = await fetch(`https://api.github.com/repos/${repositorio}/contents/data.json`, {
                headers: {
                    'Authorization': `token ${tokenGithub}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const dadosGithub = JSON.parse(atob(data.content));
                
                // Mesclar dados (priorizar dados mais recentes)
                const dataLocal = new Date(this.dados.configuracoes.ultimaAtualizacao);
                const dataGithub = new Date(dadosGithub.configuracoes.ultimaAtualizacao);
                
                if (dataGithub > dataLocal) {
                    this.dados = dadosGithub;
                    this.salvarDadosLocal();
                    this.renderizar();
                    ToastSystem.info('Dados atualizados do GitHub');
                }
            }
        } catch (error) {
            console.log('Arquivo não existe no GitHub ou erro na requisição:', error);
        }
    }

    async enviarDadosGithub() {
        const { tokenGithub, repositorio } = this.dados.configuracoes;
        
        this.dados.configuracoes.ultimaAtualizacao = new Date().toISOString();
        
        // Verificar se o arquivo já existe
        let sha = null;
        try {
            const response = await fetch(`https://api.github.com/repos/${repositorio}/contents/data.json`, {
                headers: {
                    'Authorization': `token ${tokenGithub}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                sha = data.sha;
            }
        } catch (error) {
            console.log('Arquivo não existe, será criado');
        }

        // Enviar dados
        const body = {
            message: `Atualização automática - ${Utils.formatDateTime(new Date())}`,
            content: btoa(JSON.stringify(this.dados, null, 2))
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(`https://api.github.com/repos/${repositorio}/contents/data.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${tokenGithub}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao enviar dados para o GitHub');
        }

        this.salvarDadosLocal();
    }
}

// Inicializar sistema quando o DOM estiver pronto
let sistema;
document.addEventListener('DOMContentLoaded', () => {
    sistema = new SistemaXerox();
});

// Carregar dados locais quando a janela carregar
window.addEventListener('load', () => {
    if (sistema && sistema.carregarDadosLocal()) {
        sistema.renderizar();
    }
});