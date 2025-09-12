class Utils {
    static debounce(func, wait, immediate) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    }

    static formatNumber(num) {
        return new Intl.NumberFormat('pt-BR').format(num);
    }

    static formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    static formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('pt-BR');
    }

    static formatPercent(value, total) {
        if (total === 0) return '0%';
        return ((value / total) * 100).toFixed(1) + '%';
    }

    static getStatusClass(percentage) {
        if (percentage >= 80) return 'progress-critical';
        if (percentage >= 60) return 'progress-high';
        if (percentage >= 40) return 'progress-medium';
        return 'progress-low';
    }

    static getStatusBadge(percentage) {
        if (percentage >= 80) return 'critical';
        if (percentage >= 60) return 'high';
        if (percentage >= 40) return 'medium';
        return 'low';
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[<>]/g, '')
            .trim();
    }

    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validateNumber(value, min = 0, max = Infinity) {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
    }

    static generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    static copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                textArea.remove();
                return Promise.resolve();
            } catch (err) {
                textArea.remove();
                return Promise.reject(err);
            }
        }
    }

    static downloadFile(content, filename, contentType = 'text/plain') {
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(url);
    }

    static createCSV(data) {
        if (!Array.isArray(data) || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        return csvContent;
    }

    static exportToPDF(content, filename = 'relatorio.pdf') {
        // Implementação básica - em produção usaria jsPDF ou similar
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Relatório</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h1 { color: #333; text-align: center; }
                    .header { margin-bottom: 20px; }
                    .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🖨️ Sistema de Gerenciamento de Cotas Xerox</h1>
                    <p><strong>Data do Relatório:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
                ${content}
                <div class="footer">
                    <p>Gerado automaticamente pelo Sistema Xerox</p>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        
        // Aguardar carregamento e imprimir
        printWindow.onload = () => {
            printWindow.print();
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = Utils.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    static getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return total;
    }

    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    static isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    static calculateAge(birthDate) {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    }

    static showLoadingState(element, show = true) {
        if (!element) return;
        
        if (show) {
            element.classList.add('loading');
            element.disabled = true;
            const originalText = element.textContent;
            element.dataset.originalText = originalText;
            element.innerHTML = '<div class="loading-spinner"></div> Carregando...';
        } else {
            element.classList.remove('loading');
            element.disabled = false;
            if (element.dataset.originalText) {
                element.textContent = element.dataset.originalText;
                delete element.dataset.originalText;
            }
        }
    }

    static animateValue(element, start, end, duration = 1000) {
        const startTime = performance.now();
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * easeOutCubic);
            
            element.textContent = Utils.formatNumber(current);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        
        requestAnimationFrame(animate);
    }

    static createLoadingOverlay(message = 'Carregando...') {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        document.body.appendChild(overlay);
        return overlay;
    }

    static removeLoadingOverlay(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }
}