class SistemaXerox {
    constructor() {
        this.dados = null;
        this.usuarioEditando = null;
        this.usuarioHistorico = null;
        this.init();
    }

    async init() {
        await this.carregarDados();
        this.configurarEventos();
        this.renderizar();
    }

    async carregarDados() {
        try {
            const response = await fetch('data.json');
            this.dados = await response.json();
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.dados = {
                usuarios: [],
                configuracoes: {
                    tokenGithub: '',
                    repositorio: '',
                    ultimaAtualizacao: new Date().toISOString()
                }
            };
        }
    }

    configurarEventos() {
        // Botões principais
        document.getElementById('btnConfiguracoes').addEventListener('click', () => this.abrirModalConfiguracoes());
        document.getElementById('btnSincronizar').addEventListener('click', () => this.sincronizarDados());
        document.getElementById('btnNovoUsuario').addEventListener('click', () => this.abrirModalUsuario());

        // Filtros
        document.getElementById('filtroNome').addEventListener('input', () => this.filtrarUsuarios());
        document.getElementById('filtroSetor').addEventListener('change', () => this.filtrarUsuarios());

        // Modais
        this.configurarModal('modalConfiguracoes', 'formConfiguracoes');
        this.configurarModal('modalUsuario', 'formUsuario');
        this.configurarModal('modalHistorico');
        this.configurarModal('modalNovoGasto', 'formNovoGasto');

        // Forms
        document.getElementById('formConfiguracoes').addEventListener('submit', (e) => this.salvarConfiguracoes(e));
        document.getElementById('formUsuario').addEventListener('submit', (e) => this.salvarUsuario(e));
        document.getElementById('formNovoGasto').addEventListener('submit', (e) => this.salvarNovoGasto(e));

        // Botões de cancelar
        document.getElementById('btnCancelar').addEventListener('click', () => this.fecharModal('modalUsuario'));
        document.getElementById('btnCancelarGasto').addEventListener('click', () => this.fecharModal('modalNovoGasto'));

        // Botão novo gasto no histórico
        document.getElementById('btnNovoGasto').addEventListener('click', () => this.abrirModalNovoGasto());
    }

    configurarModal(modalId, formId = null) {
        const modal = document.getElementById(modalId);
        const closeBtn = modal.querySelector('.close');

        closeBtn.addEventListener('click', () => this.fecharModal(modalId));

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.fecharModal(modalId);
            }
        });

        if (formId) {
            const form = document.getElementById(formId);
            form.addEventListener('submit', (e) => e.preventDefault());
        }
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

        document.getElementById('totalUsuarios').textContent = totalUsuarios;
        document.getElementById('cotaTotal').textContent = cotaTotal.toLocaleString();
        document.getElementById('cotaUtilizada').textContent = cotaUsada.toLocaleString();
        document.getElementById('cotaRestante').textContent = cotaRestante.toLocaleString();
    }

    atualizarFiltroSetores() {
        const setores = [...new Set(this.dados.usuarios.map(user => user.setor))];
        const select = document.getElementById('filtroSetor');
        
        select.innerHTML = '<option value="">Todos os setores</option>';
        setores.forEach(setor => {
            const option = document.createElement('option');
            option.value = setor;
            option.textContent = setor;
            select.appendChild(option);
        });
    }

    renderizarTabelaUsuarios() {
        const tbody = document.querySelector('#tabelaUsuarios tbody');
        tbody.innerHTML = '';

        const usuariosFiltrados = this.filtrarUsuariosDados();

        usuariosFiltrados.forEach(usuario => {
            const row = this.criarLinhaUsuario(usuario);
            tbody.appendChild(row);
        });
    }

    criarLinhaUsuario(usuario) {
        const row = document.createElement('tr');
        const percentual = (usuario.cotaUsada / usuario.cotaTotal * 100).toFixed(1);
        
        let classProgressBar = 'progress-low';
        if (percentual > 80) classProgressBar = 'progress-critical';
        else if (percentual > 60) classProgressBar = 'progress-high';
        else if (percentual > 40) classProgressBar = 'progress-medium';

        row.innerHTML = `
            <td>${usuario.nome}</td>
            <td>${usuario.setor}</td>
            <td>${usuario.cotaTotal.toLocaleString()}</td>
            <td>${usuario.cotaUsada.toLocaleString()}</td>
            <td>${usuario.cotaRestante.toLocaleString()}</td>
            <td>
                <div>${percentual}%</div>
                <div class="progress-bar">
                    <div class="progress-fill ${classProgressBar}" style="width: ${percentual}%"></div>
                </div>
            </td>
            <td>
                <button class="btn btn-info" onclick="sistema.abrirHistorico(${usuario.id})">📊 Histórico</button>
                <button class="btn btn-secondary" onclick="sistema.editarUsuario(${usuario.id})">✏️ Editar</button>
                <button class="btn btn-danger" onclick="sistema.excluirUsuario(${usuario.id})">🗑️ Excluir</button>
            </td>
        `;

        return row;
    }

    filtrarUsuariosDados() {
        const filtroNome = document.getElementById('filtroNome').value.toLowerCase();
        const filtroSetor = document.getElementById('filtroSetor').value;

        return this.dados.usuarios.filter(usuario => {
            const matchNome = usuario.nome.toLowerCase().includes(filtroNome);
            const matchSetor = !filtroSetor || usuario.setor === filtroSetor;
            return matchNome && matchSetor;
        });
    }

    filtrarUsuarios() {
        this.renderizarTabelaUsuarios();
    }

    // Modais
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
            const data = new Date(item.data).toLocaleDateString('pt-BR');
            
            row.innerHTML = `
                <td>${data}</td>
                <td>${item.quantidade.toLocaleString()}</td>
                <td>${item.tipo}</td>
                <td>${item.descricao}</td>
                <td>
                    <button class="btn btn-danger" onclick="sistema.excluirGasto(${index})">🗑️ Excluir</button>
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

    abrirModal(modalId) {
        document.getElementById(modalId).style.display = 'block';
    }

    fecharModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    // Ações CRUD
    salvarConfiguracoes(e) {
        e.preventDefault();
        
        this.dados.configuracoes.tokenGithub = document.getElementById('tokenGithub').value;
        this.dados.configuracoes.repositorio = document.getElementById('repositorio').value;
        this.dados.configuracoes.ultimaAtualizacao = new Date().toISOString();
        
        this.salvarDadosLocal();
        this.fecharModal('modalConfiguracoes');
        this.mostrarMensagem('Configurações salvas com sucesso!', 'success');
    }

    salvarUsuario(e) {
        e.preventDefault();
        
        const nome = document.getElementById('nomeUsuario').value;
        const setor = document.getElementById('setorUsuario').value;
        const cotaTotal = parseInt(document.getElementById('cotaTotalUsuario').value);

        if (this.usuarioEditando) {
            this.usuarioEditando.nome = nome;
            this.usuarioEditando.setor = setor;
            this.usuarioEditando.cotaTotal = cotaTotal;
            this.usuarioEditando.cotaRestante = cotaTotal - this.usuarioEditando.cotaUsada;
        } else {
            const novoUsuario = {
                id: Date.now(),
                nome,
                setor,
                cotaTotal,
                cotaUsada: 0,
                cotaRestante: cotaTotal,
                historico: []
            };
            this.dados.usuarios.push(novoUsuario);
        }

        this.salvarDadosLocal();
        this.renderizar();
        this.fecharModal('modalUsuario');
        this.mostrarMensagem('Usuário salvo com sucesso!', 'success');
    }

    editarUsuario(idUsuario) {
        const usuario = this.dados.usuarios.find(u => u.id === idUsuario);
        if (usuario) {
            this.abrirModalUsuario(usuario);
        }
    }

    excluirUsuario(idUsuario) {
        if (confirm('Tem certeza que deseja excluir este usuário?')) {
            this.dados.usuarios = this.dados.usuarios.filter(u => u.id !== idUsuario);
            this.salvarDadosLocal();
            this.renderizar();
            this.mostrarMensagem('Usuário excluído com sucesso!', 'success');
        }
    }

    salvarNovoGasto(e) {
        e.preventDefault();
        
        if (!this.usuarioHistorico) return;

        const data = document.getElementById('dataGasto').value;
        const quantidade = parseInt(document.getElementById('quantidadeGasto').value);
        const tipo = document.getElementById('tipoGasto').value;
        const descricao = document.getElementById('descricaoGasto').value;

        const novoGasto = {
            data,
            quantidade,
            tipo,
            descricao
        };

        if (!this.usuarioHistorico.historico) {
            this.usuarioHistorico.historico = [];
        }

        this.usuarioHistorico.historico.push(novoGasto);
        this.usuarioHistorico.cotaUsada += quantidade;
        this.usuarioHistorico.cotaRestante = this.usuarioHistorico.cotaTotal - this.usuarioHistorico.cotaUsada;

        this.salvarDadosLocal();
        this.renderizar();
        this.renderizarTabelaHistorico(this.usuarioHistorico.historico);
        this.fecharModal('modalNovoGasto');
        this.mostrarMensagem('Gasto adicionado com sucesso!', 'success');
    }

    excluirGasto(index) {
        if (!this.usuarioHistorico || !confirm('Tem certeza que deseja excluir este gasto?')) return;

        const gasto = this.usuarioHistorico.historico[index];
        this.usuarioHistorico.cotaUsada -= gasto.quantidade;
        this.usuarioHistorico.cotaRestante = this.usuarioHistorico.cotaTotal - this.usuarioHistorico.cotaUsada;
        
        this.usuarioHistorico.historico.splice(index, 1);

        this.salvarDadosLocal();
        this.renderizar();
        this.renderizarTabelaHistorico(this.usuarioHistorico.historico);
        this.mostrarMensagem('Gasto removido com sucesso!', 'success');
    }

    // Armazenamento Local
    salvarDadosLocal() {
        localStorage.setItem('sistemaXeroxDados', JSON.stringify(this.dados));
    }

    carregarDadosLocal() {
        const dados = localStorage.getItem('sistemaXeroxDados');
        if (dados) {
            this.dados = JSON.parse(dados);
            return true;
        }
        return false;
    }

    // Sincronização com GitHub
    async sincronizarDados() {
        const btnSincronizar = document.getElementById('btnSincronizar');
        const textoOriginal = btnSincronizar.innerHTML;
        
        btnSincronizar.innerHTML = '<div class="loading"></div> Sincronizando...';
        btnSincronizar.disabled = true;

        try {
            if (!this.dados.configuracoes.tokenGithub || !this.dados.configuracoes.repositorio) {
                throw new Error('Configure o token do GitHub e o repositório nas configurações');
            }

            // Tentar baixar dados do GitHub primeiro
            await this.baixarDadosGithub();
            
            // Depois enviar dados locais
            await this.enviarDadosGithub();
            
            this.mostrarMensagem('Dados sincronizados com sucesso!', 'success');
        } catch (error) {
            console.error('Erro na sincronização:', error);
            this.mostrarMensagem(`Erro na sincronização: ${error.message}`, 'error');
        } finally {
            btnSincronizar.innerHTML = textoOriginal;
            btnSincronizar.disabled = false;
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
            message: `Atualização automática - ${new Date().toLocaleString('pt-BR')}`,
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

    // Utilitários
    mostrarMensagem(texto, tipo = 'success') {
        const mensagem = document.createElement('div');
        mensagem.className = `${tipo}-message`;
        mensagem.textContent = texto;
        
        document.body.insertBefore(mensagem, document.body.firstChild);
        
        setTimeout(() => {
            mensagem.remove();
        }, 5000);
    }
}

// Inicializar sistema
let sistema;
document.addEventListener('DOMContentLoaded', () => {
    sistema = new SistemaXerox();
});

// Carregar dados locais se existirem
window.addEventListener('load', () => {
    if (sistema && sistema.carregarDadosLocal()) {
        sistema.renderizar();
    }
});