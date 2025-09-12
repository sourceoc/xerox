class ValidationSystem {
    constructor() {
        this.rules = new Map();
        this.messages = new Map();
        this.setupDefaultMessages();
    }

    setupDefaultMessages() {
        this.messages.set('required', 'Este campo é obrigatório');
        this.messages.set('email', 'Digite um email válido');
        this.messages.set('min', 'Valor mínimo é {min}');
        this.messages.set('max', 'Valor máximo é {max}');
        this.messages.set('minLength', 'Mínimo de {minLength} caracteres');
        this.messages.set('maxLength', 'Máximo de {maxLength} caracteres');
        this.messages.set('pattern', 'Formato inválido');
        this.messages.set('number', 'Digite apenas números');
        this.messages.set('integer', 'Digite apenas números inteiros');
        this.messages.set('positive', 'Digite um valor positivo');
        this.messages.set('date', 'Digite uma data válida');
        this.messages.set('match', 'Os valores não coincidem');
        this.messages.set('unique', 'Este valor já existe');
        this.messages.set('custom', 'Valor inválido');
    }

    addRule(fieldName, rule, message = null) {
        if (!this.rules.has(fieldName)) {
            this.rules.set(fieldName, []);
        }
        
        this.rules.get(fieldName).push(rule);
        
        if (message) {
            this.messages.set(`${fieldName}_${rule.type}`, message);
        }
    }

    validate(data, fieldName = null) {
        const errors = {};
        const fieldsToValidate = fieldName ? [fieldName] : Object.keys(data);
        
        fieldsToValidate.forEach(field => {
            const fieldRules = this.rules.get(field) || [];
            const value = data[field];
            
            fieldRules.forEach(rule => {
                const result = this.executeRule(rule, value, data, field);
                if (!result.isValid) {
                    if (!errors[field]) errors[field] = [];
                    errors[field].push(result.message);
                }
            });
        });
        
        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    executeRule(rule, value, allData, fieldName) {
        switch (rule.type) {
            case 'required':
                return this.validateRequired(value, rule, fieldName);
            case 'email':
                return this.validateEmail(value, rule, fieldName);
            case 'min':
                return this.validateMin(value, rule, fieldName);
            case 'max':
                return this.validateMax(value, rule, fieldName);
            case 'minLength':
                return this.validateMinLength(value, rule, fieldName);
            case 'maxLength':
                return this.validateMaxLength(value, rule, fieldName);
            case 'pattern':
                return this.validatePattern(value, rule, fieldName);
            case 'number':
                return this.validateNumber(value, rule, fieldName);
            case 'integer':
                return this.validateInteger(value, rule, fieldName);
            case 'positive':
                return this.validatePositive(value, rule, fieldName);
            case 'date':
                return this.validateDate(value, rule, fieldName);
            case 'match':
                return this.validateMatch(value, rule, fieldName, allData);
            case 'unique':
                return this.validateUnique(value, rule, fieldName, allData);
            case 'custom':
                return this.validateCustom(value, rule, fieldName, allData);
            default:
                return { isValid: true };
        }
    }

    validateRequired(value, rule, fieldName) {
        const isValid = value !== null && value !== undefined && value !== '';
        return {
            isValid,
            message: isValid ? '' : this.getMessage('required', rule, fieldName)
        };
    }

    validateEmail(value, rule, fieldName) {
        if (!value) return { isValid: true }; // Optional field
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(value);
        return {
            isValid,
            message: isValid ? '' : this.getMessage('email', rule, fieldName)
        };
    }

    validateMin(value, rule, fieldName) {
        if (!value && value !== 0) return { isValid: true }; // Optional field
        
        const numValue = Number(value);
        const isValid = !isNaN(numValue) && numValue >= rule.min;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('min', rule, fieldName)
        };
    }

    validateMax(value, rule, fieldName) {
        if (!value && value !== 0) return { isValid: true }; // Optional field
        
        const numValue = Number(value);
        const isValid = !isNaN(numValue) && numValue <= rule.max;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('max', rule, fieldName)
        };
    }

    validateMinLength(value, rule, fieldName) {
        if (!value) return { isValid: true }; // Optional field
        
        const isValid = String(value).length >= rule.minLength;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('minLength', rule, fieldName)
        };
    }

    validateMaxLength(value, rule, fieldName) {
        if (!value) return { isValid: true }; // Optional field
        
        const isValid = String(value).length <= rule.maxLength;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('maxLength', rule, fieldName)
        };
    }

    validatePattern(value, rule, fieldName) {
        if (!value) return { isValid: true }; // Optional field
        
        const regex = new RegExp(rule.pattern);
        const isValid = regex.test(value);
        return {
            isValid,
            message: isValid ? '' : this.getMessage('pattern', rule, fieldName)
        };
    }

    validateNumber(value, rule, fieldName) {
        if (!value && value !== 0) return { isValid: true }; // Optional field
        
        const isValid = !isNaN(Number(value)) && isFinite(Number(value));
        return {
            isValid,
            message: isValid ? '' : this.getMessage('number', rule, fieldName)
        };
    }

    validateInteger(value, rule, fieldName) {
        if (!value && value !== 0) return { isValid: true }; // Optional field
        
        const numValue = Number(value);
        const isValid = !isNaN(numValue) && Number.isInteger(numValue);
        return {
            isValid,
            message: isValid ? '' : this.getMessage('integer', rule, fieldName)
        };
    }

    validatePositive(value, rule, fieldName) {
        if (!value && value !== 0) return { isValid: true }; // Optional field
        
        const numValue = Number(value);
        const isValid = !isNaN(numValue) && numValue > 0;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('positive', rule, fieldName)
        };
    }

    validateDate(value, rule, fieldName) {
        if (!value) return { isValid: true }; // Optional field
        
        const date = new Date(value);
        const isValid = date instanceof Date && !isNaN(date);
        return {
            isValid,
            message: isValid ? '' : this.getMessage('date', rule, fieldName)
        };
    }

    validateMatch(value, rule, fieldName, allData) {
        const matchValue = allData[rule.matchField];
        const isValid = value === matchValue;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('match', rule, fieldName)
        };
    }

    validateUnique(value, rule, fieldName, allData) {
        if (!value) return { isValid: true }; // Optional field
        
        // Esta validação precisa ser implementada com base nos dados existentes
        // Por enquanto, sempre retorna válido
        const isValid = true;
        return {
            isValid,
            message: isValid ? '' : this.getMessage('unique', rule, fieldName)
        };
    }

    validateCustom(value, rule, fieldName, allData) {
        const isValid = rule.validator(value, allData, fieldName);
        return {
            isValid,
            message: isValid ? '' : (rule.message || this.getMessage('custom', rule, fieldName))
        };
    }

    getMessage(ruleType, rule, fieldName) {
        const customKey = `${fieldName}_${ruleType}`;
        const message = this.messages.get(customKey) || this.messages.get(ruleType) || 'Valor inválido';
        
        // Substituir placeholders
        return message.replace(/\{(\w+)\}/g, (match, key) => {
            return rule[key] || match;
        });
    }

    setupFormValidation(formId) {
        const form = document.getElementById(formId);
        if (!form) return;

        // Validação em tempo real
        form.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                this.validateField(e.target);
            }
        });

        // Validação no submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            
            const result = this.validate(data);
            
            if (result.isValid) {
                form.dispatchEvent(new CustomEvent('validationSuccess', { detail: data }));
            } else {
                this.showErrors(result.errors);
                form.dispatchEvent(new CustomEvent('validationError', { detail: result.errors }));
            }
        });
    }

    validateField(field) {
        const fieldName = field.name || field.id;
        if (!fieldName) return;

        const form = field.closest('form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);

        const result = this.validate(data, fieldName);
        this.showFieldError(field, result.errors[fieldName] || []);
        
        return result.isValid;
    }

    showErrors(errors) {
        // Limpar erros anteriores
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));

        // Mostrar novos erros
        Object.keys(errors).forEach(fieldName => {
            const field = document.querySelector(`[name="${fieldName}"], #${fieldName}`);
            if (field) {
                this.showFieldError(field, errors[fieldName]);
            }
        });
    }

    showFieldError(field, messages = []) {
        // Remover erro anterior
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
        
        field.classList.remove('error');

        if (messages.length > 0) {
            field.classList.add('error');
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            errorDiv.innerHTML = messages.map(msg => `<span>${msg}</span>`).join('');
            
            // Inserir após o campo
            field.parentNode.insertBefore(errorDiv, field.nextSibling);
        }
    }

    clearErrors() {
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    }
}

// Validadores comuns prontos para uso
const CommonValidators = {
    usuario: new ValidationSystem(),
    
    setupUserValidation() {
        this.usuario.addRule('nomeUsuario', { type: 'required' });
        this.usuario.addRule('nomeUsuario', { type: 'minLength', minLength: 2 });
        this.usuario.addRule('nomeUsuario', { type: 'maxLength', maxLength: 100 });
        
        this.usuario.addRule('setorUsuario', { type: 'required' });
        this.usuario.addRule('setorUsuario', { type: 'minLength', minLength: 2 });
        
        this.usuario.addRule('cotaTotalUsuario', { type: 'required' });
        this.usuario.addRule('cotaTotalUsuario', { type: 'number' });
        this.usuario.addRule('cotaTotalUsuario', { type: 'min', min: 1 });
        this.usuario.addRule('cotaTotalUsuario', { type: 'max', max: 10000 });
    },

    login: new ValidationSystem(),
    
    setupLoginValidation() {
        this.login.addRule('loginUsuario', { type: 'required' });
        this.login.addRule('loginUsuario', { type: 'minLength', minLength: 3 });
        
        this.login.addRule('loginSenha', { type: 'required' });
        this.login.addRule('loginSenha', { type: 'minLength', minLength: 3 });
    },

    gasto: new ValidationSystem(),
    
    setupGastoValidation() {
        this.gasto.addRule('dataGasto', { type: 'required' });
        this.gasto.addRule('dataGasto', { type: 'date' });
        
        this.gasto.addRule('quantidadeGasto', { type: 'required' });
        this.gasto.addRule('quantidadeGasto', { type: 'number' });
        this.gasto.addRule('quantidadeGasto', { type: 'positive' });
        this.gasto.addRule('quantidadeGasto', { type: 'integer' });
        
        this.gasto.addRule('tipoGasto', { type: 'required' });
        
        this.gasto.addRule('descricaoGasto', { type: 'required' });
        this.gasto.addRule('descricaoGasto', { type: 'minLength', minLength: 3 });
        this.gasto.addRule('descricaoGasto', { type: 'maxLength', maxLength: 200 });
    },

    senha: new ValidationSystem(),
    
    setupSenhaValidation() {
        this.senha.addRule('senhaAtual', { type: 'required' });
        
        this.senha.addRule('novaSenha', { type: 'required' });
        this.senha.addRule('novaSenha', { type: 'minLength', minLength: 6 });
        this.senha.addRule('novaSenha', { 
            type: 'pattern', 
            pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d@$!%*?&]{6,}$' 
        }, 'A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número');
        
        this.senha.addRule('confirmarSenha', { type: 'required' });
        this.senha.addRule('confirmarSenha', { type: 'match', matchField: 'novaSenha' });
    }
};

// Configurar validações padrão
CommonValidators.setupUserValidation();
CommonValidators.setupLoginValidation();
CommonValidators.setupGastoValidation();
CommonValidators.setupSenhaValidation();