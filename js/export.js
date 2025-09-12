class ExportSystem {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            const btnExportar = document.getElementById('btnExportar');
            if (btnExportar) {
                btnExportar.addEventListener('click', () => this.showExportModal());
            }

            const formExportar = document.getElementById('formExportar');
            if (formExportar) {
                formExportar.addEventListener('submit', (e) => this.handleExport(e));
            }

            const btnCancelarExportar = document.getElementById('btnCancelarExportar');
            if (btnCancelarExportar) {
                btnCancelarExportar.addEventListener('click', () => this.hideExportModal());
            }

            // Pré-configurar datas
            this.setupDefaultDates();
        });
    }

    showExportModal() {
        const modal = document.getElementById('modalExportar');
        if (modal) {
            modal.style.display = 'block';
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    hideExportModal() {
        const modal = document.getElementById('modalExportar');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    setupDefaultDates() {
        const hoje = new Date();
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        const periodoInicio = document.getElementById('periodoInicio');
        const periodoFim = document.getElementById('periodoFim');
        
        if (periodoInicio) {
            periodoInicio.value = primeiroDiaMes.toISOString().split('T')[0];
        }
        
        if (periodoFim) {
            periodoFim.value = hoje.toISOString().split('T')[0];
        }
    }

    async handleExport(event) {
        event.preventDefault();
        
        const loadingToast = ToastSystem.loading('Preparando exportação...');
        
        try {
            const formData = new FormData(event.target);
            const exportConfig = {
                tipo: formData.get('tipoRelatorio'),
                formato: formData.get('formatoExportar'),
                periodoInicio: formData.get('periodoInicio'),
                periodoFim: formData.get('periodoFim')
            };

            const data = await this.prepareData(exportConfig);
            await this.generateExport(data, exportConfig);
            
            ToastSystem.close(loadingToast);
            ToastSystem.success('Relatório exportado com sucesso!');
            this.hideExportModal();
            
        } catch (error) {
            ToastSystem.close(loadingToast);
            ToastSystem.error('Erro ao exportar relatório: ' + error.message);
            console.error('Erro na exportação:', error);
        }
    }

    async prepareData(config) {
        // Obter dados dos usuários
        const usuarios = sistema ? sistema.dados.usuarios : [];
        
        // Filtrar por período se especificado
        let dadosFiltrados = usuarios;
        if (config.periodoInicio || config.periodoFim) {
            dadosFiltrados = this.filterByDateRange(usuarios, config.periodoInicio, config.periodoFim);
        }

        // Preparar dados baseado no tipo de relatório
        switch (config.tipo) {
            case 'completo':
                return this.prepareCompleteReport(dadosFiltrados);
            case 'resumo':
                return this.prepareSummaryReport(dadosFiltrados);
            case 'cotas-baixas':
                return this.prepareLowQuotaReport(dadosFiltrados);
            case 'historico':
                return this.prepareHistoryReport(dadosFiltrados);
            default:
                return this.prepareCompleteReport(dadosFiltrados);
        }
    }

    filterByDateRange(usuarios, inicio, fim) {
        if (!inicio && !fim) return usuarios;
        
        const dataInicio = inicio ? new Date(inicio) : new Date('1900-01-01');
        const dataFim = fim ? new Date(fim) : new Date();
        dataFim.setHours(23, 59, 59, 999); // Incluir o dia inteiro
        
        return usuarios.map(usuario => {
            const historicoFiltrado = (usuario.historico || []).filter(item => {
                const dataItem = new Date(item.data);
                return dataItem >= dataInicio && dataItem <= dataFim;
            });
            
            return {
                ...usuario,
                historico: historicoFiltrado,
                cotaUsadaPeriodo: historicoFiltrado.reduce((sum, item) => sum + item.quantidade, 0)
            };
        });
    }

    prepareCompleteReport(usuarios) {
        return {
            titulo: 'Relatório Completo de Cotas',
            resumo: this.calculateSummary(usuarios),
            usuarios: usuarios.map(usuario => ({
                nome: usuario.nome,
                setor: usuario.setor,
                cotaTotal: usuario.cotaTotal,
                cotaUsada: usuario.cotaUsada,
                cotaRestante: usuario.cotaRestante,
                percentualUsado: ((usuario.cotaUsada / usuario.cotaTotal) * 100).toFixed(1),
                status: this.getStatusText(usuario.cotaUsada, usuario.cotaTotal),
                ultimoUso: this.getLastUsageDate(usuario.historico)
            })),
            historico: this.flattenHistory(usuarios),
            estatisticas: this.calculateStatistics(usuarios)
        };
    }

    prepareSummaryReport(usuarios) {
        const resumo = this.calculateSummary(usuarios);
        const estatisticas = this.calculateStatistics(usuarios);
        
        return {
            titulo: 'Resumo Executivo',
            periodo: this.getCurrentPeriod(),
            resumo,
            estatisticas,
            topUsuarios: usuarios
                .sort((a, b) => b.cotaUsada - a.cotaUsada)
                .slice(0, 10)
                .map(u => ({
                    nome: u.nome,
                    setor: u.setor,
                    cotaUsada: u.cotaUsada,
                    percentual: ((u.cotaUsada / u.cotaTotal) * 100).toFixed(1)
                })),
            alertas: this.generateAlerts(usuarios)
        };
    }

    prepareLowQuotaReport(usuarios) {
        const cotasBaixas = usuarios.filter(usuario => {
            const percentual = (usuario.cotaUsada / usuario.cotaTotal) * 100;
            return percentual >= 80;
        });

        return {
            titulo: 'Relatório de Cotas Baixas (≥80%)',
            total: cotasBaixas.length,
            usuarios: cotasBaixas.map(usuario => ({
                nome: usuario.nome,
                setor: usuario.setor,
                cotaTotal: usuario.cotaTotal,
                cotaUsada: usuario.cotaUsada,
                cotaRestante: usuario.cotaRestante,
                percentualUsado: ((usuario.cotaUsada / usuario.cotaTotal) * 100).toFixed(1),
                diasRestantes: this.estimateDaysRemaining(usuario)
            }))
        };
    }

    prepareHistoryReport(usuarios) {
        const historico = this.flattenHistory(usuarios);
        const historicoOrdenado = historico.sort((a, b) => new Date(b.data) - new Date(a.data));

        return {
            titulo: 'Histórico de Consumo',
            totalRegistros: historico.length,
            historico: historicoOrdenado.map(item => ({
                data: Utils.formatDate(item.data),
                usuario: item.usuario,
                setor: item.setor,
                quantidade: item.quantidade,
                tipo: item.tipo,
                descricao: item.descricao
            })),
            consumoPorDia: this.groupConsumptionByDate(historico),
            consumoPorSetor: this.groupConsumptionBySector(historico)
        };
    }

    async generateExport(data, config) {
        const filename = this.generateFilename(config);
        
        switch (config.formato) {
            case 'pdf':
                return this.exportToPDF(data, filename);
            case 'excel':
                return this.exportToExcel(data, filename);
            case 'csv':
                return this.exportToCSV(data, filename);
            case 'json':
                return this.exportToJSON(data, filename);
            default:
                throw new Error('Formato não suportado');
        }
    }

    exportToPDF(data, filename) {
        let htmlContent = this.generateHTMLReport(data);
        Utils.exportToPDF(htmlContent, filename);
    }

    exportToExcel(data, filename) {
        // Implementação básica - em produção usaria SheetJS ou similar
        const csvContent = this.generateCSVContent(data);
        Utils.downloadFile(csvContent, filename.replace('.xlsx', '.csv'), 'text/csv');
        ToastSystem.info('Arquivo salvo como CSV (Excel compatível)');
    }

    exportToCSV(data, filename) {
        const csvContent = this.generateCSVContent(data);
        Utils.downloadFile(csvContent, filename, 'text/csv');
    }

    exportToJSON(data, filename) {
        const jsonContent = JSON.stringify(data, null, 2);
        Utils.downloadFile(jsonContent, filename, 'application/json');
    }

    generateHTMLReport(data) {
        let html = `
            <div class="report-header">
                <h1>${data.titulo}</h1>
                <p><strong>Data de Geração:</strong> ${Utils.formatDateTime(new Date())}</p>
            </div>
        `;

        if (data.resumo) {
            html += this.generateSummaryHTML(data.resumo);
        }

        if (data.usuarios) {
            html += this.generateUsersTableHTML(data.usuarios);
        }

        if (data.historico) {
            html += this.generateHistoryTableHTML(data.historico);
        }

        if (data.estatisticas) {
            html += this.generateStatisticsHTML(data.estatisticas);
        }

        return html;
    }

    generateSummaryHTML(resumo) {
        return `
            <div class="report-section">
                <h2>Resumo Geral</h2>
                <table>
                    <tr><td><strong>Total de Usuários:</strong></td><td>${resumo.totalUsuarios}</td></tr>
                    <tr><td><strong>Cota Total:</strong></td><td>${Utils.formatNumber(resumo.cotaTotal)}</td></tr>
                    <tr><td><strong>Cota Utilizada:</strong></td><td>${Utils.formatNumber(resumo.cotaUtilizada)}</td></tr>
                    <tr><td><strong>Cota Restante:</strong></td><td>${Utils.formatNumber(resumo.cotaRestante)}</td></tr>
                    <tr><td><strong>Percentual Utilizado:</strong></td><td>${resumo.percentualUtilizado}%</td></tr>
                </table>
            </div>
        `;
    }

    generateUsersTableHTML(usuarios) {
        let html = `
            <div class="report-section">
                <h2>Detalhamento por Usuário</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Setor</th>
                            <th>Cota Total</th>
                            <th>Cota Usada</th>
                            <th>Cota Restante</th>
                            <th>% Utilizada</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        usuarios.forEach(usuario => {
            html += `
                <tr>
                    <td>${usuario.nome}</td>
                    <td>${usuario.setor}</td>
                    <td>${Utils.formatNumber(usuario.cotaTotal)}</td>
                    <td>${Utils.formatNumber(usuario.cotaUsada)}</td>
                    <td>${Utils.formatNumber(usuario.cotaRestante)}</td>
                    <td>${usuario.percentualUsado}%</td>
                    <td>${usuario.status}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    generateCSVContent(data) {
        if (data.usuarios) {
            const headers = ['Nome', 'Setor', 'Cota Total', 'Cota Usada', 'Cota Restante', '% Utilizada', 'Status'];
            let csv = headers.join(',') + '\n';
            
            data.usuarios.forEach(usuario => {
                const row = [
                    usuario.nome,
                    usuario.setor,
                    usuario.cotaTotal,
                    usuario.cotaUsada,
                    usuario.cotaRestante,
                    usuario.percentualUsado + '%',
                    usuario.status || this.getStatusText(usuario.cotaUsada, usuario.cotaTotal)
                ];
                csv += row.map(field => `"${field}"`).join(',') + '\n';
            });
            
            return csv;
        }
        
        return Utils.createCSV(data.usuarios || []);
    }

    calculateSummary(usuarios) {
        const totalUsuarios = usuarios.length;
        const cotaTotal = usuarios.reduce((sum, u) => sum + u.cotaTotal, 0);
        const cotaUtilizada = usuarios.reduce((sum, u) => sum + u.cotaUsada, 0);
        const cotaRestante = cotaTotal - cotaUtilizada;
        const percentualUtilizado = cotaTotal > 0 ? ((cotaUtilizada / cotaTotal) * 100).toFixed(1) : '0.0';

        return {
            totalUsuarios,
            cotaTotal,
            cotaUtilizada,
            cotaRestante,
            percentualUtilizado
        };
    }

    calculateStatistics(usuarios) {
        const consumos = usuarios.map(u => u.cotaUsada).filter(c => c > 0);
        
        return {
            mediaConsumo: consumos.length > 0 ? (consumos.reduce((a, b) => a + b, 0) / consumos.length).toFixed(1) : 0,
            maiorConsumo: Math.max(...consumos, 0),
            menorConsumo: Math.min(...consumos.filter(c => c > 0), 0),
            usuariosAtivos: consumos.length,
            usuariosInativos: usuarios.length - consumos.length
        };
    }

    flattenHistory(usuarios) {
        const historico = [];
        
        usuarios.forEach(usuario => {
            if (usuario.historico && usuario.historico.length > 0) {
                usuario.historico.forEach(item => {
                    historico.push({
                        ...item,
                        usuario: usuario.nome,
                        setor: usuario.setor
                    });
                });
            }
        });
        
        return historico;
    }

    getStatusText(cotaUsada, cotaTotal) {
        const percentual = (cotaUsada / cotaTotal) * 100;
        if (percentual >= 90) return 'Crítico';
        if (percentual >= 80) return 'Alto';
        if (percentual >= 60) return 'Médio';
        if (percentual > 0) return 'Baixo';
        return 'Não utilizado';
    }

    getLastUsageDate(historico) {
        if (!historico || historico.length === 0) return 'Nunca';
        const ultimaData = historico
            .map(h => new Date(h.data))
            .sort((a, b) => b - a)[0];
        return Utils.formatDate(ultimaData);
    }

    generateFilename(config) {
        const timestamp = new Date().toISOString().split('T')[0];
        const tipo = config.tipo.replace('-', '_');
        const extensao = config.formato === 'excel' ? 'xlsx' : config.formato;
        return `relatorio_${tipo}_${timestamp}.${extensao}`;
    }

    getCurrentPeriod() {
        const agora = new Date();
        const mesAtual = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return `Período: ${mesAtual}`;
    }

    generateAlerts(usuarios) {
        const alertas = [];
        
        usuarios.forEach(usuario => {
            const percentual = (usuario.cotaUsada / usuario.cotaTotal) * 100;
            
            if (percentual >= 90) {
                alertas.push(`🚨 ${usuario.nome} - Cota quase esgotada (${percentual.toFixed(1)}%)`);
            } else if (percentual >= 80) {
                alertas.push(`⚠️ ${usuario.nome} - Cota alta (${percentual.toFixed(1)}%)`);
            }
            
            if (usuario.cotaUsada === 0) {
                alertas.push(`❓ ${usuario.nome} - Nenhum uso registrado`);
            }
        });
        
        return alertas;
    }

    estimateDaysRemaining(usuario) {
        if (!usuario.historico || usuario.historico.length === 0) return 'N/A';
        
        // Calcular média diária dos últimos 30 dias
        const agora = new Date();
        const dataLimite = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const consumoRecente = usuario.historico
            .filter(h => new Date(h.data) >= dataLimite)
            .reduce((sum, h) => sum + h.quantidade, 0);
        
        if (consumoRecente === 0) return 'N/A';
        
        const diasComConsumo = Math.min(30, usuario.historico.length);
        const mediaDiaria = consumoRecente / diasComConsumo;
        
        if (mediaDiaria === 0) return 'N/A';
        
        const diasRestantes = Math.ceil(usuario.cotaRestante / mediaDiaria);
        return diasRestantes > 0 ? `${diasRestantes} dias` : 'Esgotada';
    }

    groupConsumptionByDate(historico) {
        const grupos = {};
        
        historico.forEach(item => {
            const data = item.data;
            if (!grupos[data]) {
                grupos[data] = 0;
            }
            grupos[data] += item.quantidade;
        });
        
        return grupos;
    }

    groupConsumptionBySector(historico) {
        const grupos = {};
        
        historico.forEach(item => {
            const setor = item.setor;
            if (!grupos[setor]) {
                grupos[setor] = 0;
            }
            grupos[setor] += item.quantidade;
        });
        
        return grupos;
    }
}

// Inicializar sistema de exportação
const exportSystem = new ExportSystem();