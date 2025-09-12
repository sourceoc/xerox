// Sistema avançado de sanitização XSS
class XSSSanitizer {
    constructor() {
        // Configuração de sanitização
        this.config = {
            allowedTags: ['b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br'],
            allowedAttributes: ['class', 'id', 'data-*'],
            maxLength: 10000,
            strictMode: true
        };

        // Padrões perigosos
        this.dangerousPatterns = [
            /<script[^>]*>[\s\S]*?<\/script>/gi,
            /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
            /<object[^>]*>[\s\S]*?<\/object>/gi,
            /<embed[^>]*>/gi,
            /<link[^>]*>/gi,
            /<style[^>]*>[\s\S]*?<\/style>/gi,
            /javascript:/gi,
            /vbscript:/gi,
            /data:/gi,
            /on\w+\s*=/gi,
            /expression\s*\(/gi,
            /behavior\s*:/gi,
            /<meta[^>]*>/gi,
            /<base[^>]*>/gi
        ];

        // Atributos perigosos
        this.dangerousAttributes = [
            'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
            'onchange', 'onsubmit', 'onreset', 'onselect', 'onunload',
            'onkeypress', 'onkeydown', 'onkeyup', 'onmousedown',
            'onmouseup', 'onmousemove', 'onmouseout', 'ondblclick',
            'ondragstart', 'ondrop', 'onerror', 'onabort', 'oncanplay',
            'oncanplaythrough', 'onended', 'onloadeddata', 'onloadedmetadata',
            'onloadstart', 'onpause', 'onplay', 'onplaying', 'onprogress',
            'onratechange', 'onseeked', 'onseeking', 'onstalled',
            'onsuspend', 'ontimeupdate', 'onvolumechange', 'onwaiting',
            'href', 'src', 'action', 'formaction', 'background',
            'codebase', 'dynsrc', 'lowsrc'
        ];

        // Entidades HTML
        this.htmlEntities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };
    }

    // Método principal de sanitização
    sanitize(input, options = {}) {
        if (typeof input !== 'string') {
            return '';
        }

        const config = { ...this.config, ...options };
        let sanitized = input;

        try {
            // Verificar comprimento
            if (sanitized.length > config.maxLength) {
                sanitized = sanitized.substring(0, config.maxLength);
            }

            // Remover padrões perigosos
            sanitized = this.removeDangerousPatterns(sanitized);

            // Sanitizar atributos
            sanitized = this.sanitizeAttributes(sanitized);

            // Escape de caracteres HTML se em modo estrito
            if (config.strictMode) {
                sanitized = this.escapeHtml(sanitized);
            } else {
                // Filtrar tags permitidas
                sanitized = this.filterAllowedTags(sanitized, config.allowedTags);
            }

            // Verificações finais de segurança
            sanitized = this.finalSecurityCheck(sanitized);

            return sanitized.trim();

        } catch (error) {
            // Em caso de erro, retornar string escapada
            window.errorHandler?.captureException(error, {
                component: 'xss-sanitizer',
                method: 'sanitize',
                input: input.substring(0, 100)
            });
            return this.escapeHtml(input);
        }
    }

    // Remover padrões perigosos
    removeDangerousPatterns(input) {
        let cleaned = input;

        this.dangerousPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        // Remover comentários HTML
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

        // Remover CDATA
        cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

        return cleaned;
    }

    // Sanitizar atributos perigosos
    sanitizeAttributes(input) {
        let cleaned = input;

        this.dangerousAttributes.forEach(attr => {
            const pattern = new RegExp(`\\s${attr}\\s*=\\s*['""][^'"]*['""']`, 'gi');
            cleaned = cleaned.replace(pattern, '');
        });

        return cleaned;
    }

    // Filtrar apenas tags permitidas
    filterAllowedTags(input, allowedTags) {
        const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
        
        return input.replace(tagPattern, (match, tagName) => {
            if (allowedTags.includes(tagName.toLowerCase())) {
                return match;
            }
            return '';
        });
    }

    // Escape de caracteres HTML
    escapeHtml(input) {
        return input.replace(/[&<>"'`=\/]/g, (char) => {
            return this.htmlEntities[char] || char;
        });
    }

    // Verificação final de segurança
    finalSecurityCheck(input) {
        let cleaned = input;

        // Remover múltiplos espaços em branco
        cleaned = cleaned.replace(/\s+/g, ' ');

        // Remover caracteres de controle perigosos
        cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        // Verificar sequências suspeitas
        const suspiciousPatterns = [
            /\\x[0-9a-f]{2}/gi,
            /\\u[0-9a-f]{4}/gi,
            /\\[rnt]/gi,
            /%[0-9a-f]{2}/gi
        ];

        suspiciousPatterns.forEach(pattern => {
            if (pattern.test(cleaned)) {
                cleaned = this.escapeHtml(cleaned);
            }
        });

        return cleaned;
    }

    // Sanitização específica para diferentes contextos
    sanitizeForAttribute(input) {
        return this.sanitize(input, {
            strictMode: true,
            allowedTags: [],
            maxLength: 1000
        });
    }

    sanitizeForUrl(input) {
        try {
            const url = new URL(input);
            
            // Verificar protocolo
            if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
                return '';
            }

            return url.toString();
        } catch {
            return '';
        }
    }

    sanitizeForFilename(input) {
        // Caracteres permitidos em nomes de arquivo
        return input.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
    }

    sanitizeForSearch(input) {
        return this.sanitize(input, {
            strictMode: true,
            maxLength: 500
        });
    }

    sanitizeForDisplay(input, allowBasicFormatting = false) {
        if (allowBasicFormatting) {
            return this.sanitize(input, {
                strictMode: false,
                allowedTags: ['b', 'i', 'em', 'strong', 'br'],
                maxLength: 5000
            });
        }
        return this.sanitize(input);
    }

    // Validação de entrada
    validateInput(input, rules = {}) {
        const validation = {
            isValid: true,
            errors: [],
            sanitized: ''
        };

        try {
            // Verificar se é string
            if (typeof input !== 'string') {
                validation.isValid = false;
                validation.errors.push('Input deve ser uma string');
                return validation;
            }

            // Verificar comprimento mínimo
            if (rules.minLength && input.length < rules.minLength) {
                validation.isValid = false;
                validation.errors.push(`Comprimento mínimo: ${rules.minLength}`);
            }

            // Verificar comprimento máximo
            if (rules.maxLength && input.length > rules.maxLength) {
                validation.isValid = false;
                validation.errors.push(`Comprimento máximo: ${rules.maxLength}`);
            }

            // Verificar padrões obrigatórios
            if (rules.pattern && !rules.pattern.test(input)) {
                validation.isValid = false;
                validation.errors.push('Formato inválido');
            }

            // Verificar se contém padrões perigosos
            const hasDangerousContent = this.dangerousPatterns.some(pattern => 
                pattern.test(input)
            );

            if (hasDangerousContent) {
                validation.isValid = false;
                validation.errors.push('Conteúdo potencialmente perigoso detectado');
            }

            // Sanitizar mesmo se inválido
            validation.sanitized = this.sanitize(input, rules.sanitizeOptions || {});

            return validation;

        } catch (error) {
            window.errorHandler?.captureException(error, {
                component: 'xss-sanitizer',
                method: 'validateInput'
            });

            validation.isValid = false;
            validation.errors.push('Erro na validação');
            validation.sanitized = this.escapeHtml(input || '');
            
            return validation;
        }
    }

    // Sanitização em lote
    sanitizeBatch(inputs, options = {}) {
        if (!Array.isArray(inputs)) {
            return [];
        }

        return inputs.map(input => this.sanitize(input, options));
    }

    // Método para sanitizar objeto completo
    sanitizeObject(obj, fieldRules = {}) {
        if (!obj || typeof obj !== 'object') {
            return {};
        }

        const sanitized = {};

        for (const [key, value] of Object.entries(obj)) {
            const rules = fieldRules[key] || {};
            
            if (typeof value === 'string') {
                sanitized[key] = this.sanitize(value, rules);
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeObject(value, rules.nested || {});
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    // Configuração personalizada
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    // Método para teste de segurança
    testSecurity(input) {
        const results = {
            original: input,
            dangerousPatterns: [],
            dangerousAttributes: [],
            sanitized: '',
            riskLevel: 'low'
        };

        // Verificar padrões perigosos
        this.dangerousPatterns.forEach((pattern, index) => {
            if (pattern.test(input)) {
                results.dangerousPatterns.push({
                    index,
                    pattern: pattern.toString(),
                    matches: input.match(pattern)
                });
            }
        });

        // Verificar atributos perigosos
        this.dangerousAttributes.forEach(attr => {
            const pattern = new RegExp(attr, 'gi');
            if (pattern.test(input)) {
                results.dangerousAttributes.push(attr);
            }
        });

        // Calcular nível de risco
        const dangerCount = results.dangerousPatterns.length + results.dangerousAttributes.length;
        if (dangerCount === 0) {
            results.riskLevel = 'low';
        } else if (dangerCount <= 2) {
            results.riskLevel = 'medium';
        } else {
            results.riskLevel = 'high';
        }

        results.sanitized = this.sanitize(input);

        return results;
    }
}

// Instância global
window.XSSSanitizer = XSSSanitizer;
window.xssSanitizer = new XSSSanitizer();