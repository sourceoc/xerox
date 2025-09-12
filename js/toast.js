class ToastSystem {
    static container = null;
    static toastQueue = [];
    static maxToasts = 5;

    static init() {
        if (!ToastSystem.container) {
            ToastSystem.container = document.createElement('div');
            ToastSystem.container.id = 'toast-container';
            ToastSystem.container.className = 'toast-container';
            document.body.appendChild(ToastSystem.container);
        }
    }

    static show(message, type = 'info', duration = 5000, actions = null) {
        ToastSystem.init();

        // Limitar número de toasts
        if (ToastSystem.toastQueue.length >= ToastSystem.maxToasts) {
            const oldestToast = ToastSystem.toastQueue.shift();
            if (oldestToast && oldestToast.element) {
                oldestToast.element.remove();
            }
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = ToastSystem.getIcon(type);
        
        let actionsHtml = '';
        if (actions && actions.length > 0) {
            actionsHtml = '<div class="toast-actions">';
            actions.forEach(action => {
                actionsHtml += `<button class="toast-btn" onclick="${action.callback}">${action.text}</button>`;
            });
            actionsHtml += '</div>';
        }

        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">${icon}</div>
                <div class="toast-message">${message}</div>
                <button class="toast-close" onclick="ToastSystem.close(this)">×</button>
            </div>
            ${actionsHtml}
        `;

        toast.style.transform = 'translateX(400px)';
        toast.style.opacity = '0';
        
        ToastSystem.container.appendChild(toast);

        // Animação de entrada
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        // Auto-close
        const timeout = setTimeout(() => {
            ToastSystem.close(toast);
        }, duration);

        const toastObj = {
            element: toast,
            timeout: timeout,
            type: type,
            message: message
        };

        ToastSystem.toastQueue.push(toastObj);

        return toastObj;
    }

    static close(toastElement) {
        if (typeof toastElement === 'string') {
            // Se foi passado um seletor
            toastElement = document.querySelector(toastElement);
        } else if (toastElement.classList && !toastElement.classList.contains('toast')) {
            // Se foi passado o botão de fechar
            toastElement = toastElement.closest('.toast');
        }

        if (!toastElement) return;

        // Animação de saída
        toastElement.style.transform = 'translateX(400px)';
        toastElement.style.opacity = '0';

        setTimeout(() => {
            if (toastElement.parentNode) {
                toastElement.parentNode.removeChild(toastElement);
            }
            
            // Remover da queue
            ToastSystem.toastQueue = ToastSystem.toastQueue.filter(
                toast => toast.element !== toastElement
            );
        }, 300);
    }

    static getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            loading: '⏳'
        };
        return icons[type] || icons.info;
    }

    static success(message, duration = 4000, actions = null) {
        return ToastSystem.show(message, 'success', duration, actions);
    }

    static error(message, duration = 6000, actions = null) {
        return ToastSystem.show(message, 'error', duration, actions);
    }

    static warning(message, duration = 5000, actions = null) {
        return ToastSystem.show(message, 'warning', duration, actions);
    }

    static info(message, duration = 4000, actions = null) {
        return ToastSystem.show(message, 'info', duration, actions);
    }

    static loading(message, actions = null) {
        return ToastSystem.show(message, 'loading', 0, actions); // Não remove automaticamente
    }

    static confirm(message, onConfirm, onCancel = null) {
        const actions = [
            {
                text: 'Confirmar',
                callback: `(function() { 
                    ToastSystem.close(event.target.closest('.toast')); 
                    (${onConfirm.toString()})(); 
                })()`
            },
            {
                text: 'Cancelar',
                callback: `(function() { 
                    ToastSystem.close(event.target.closest('.toast')); 
                    ${onCancel ? `(${onCancel.toString()})();` : ''}
                })()`
            }
        ];

        return ToastSystem.show(message, 'warning', 0, actions);
    }

    static clearAll() {
        ToastSystem.toastQueue.forEach(toast => {
            if (toast.timeout) {
                clearTimeout(toast.timeout);
            }
            if (toast.element && toast.element.parentNode) {
                toast.element.parentNode.removeChild(toast.element);
            }
        });
        ToastSystem.toastQueue = [];
    }

    static updateToast(toastObj, newMessage, newType = null) {
        if (!toastObj || !toastObj.element) return;

        const messageElement = toastObj.element.querySelector('.toast-message');
        const iconElement = toastObj.element.querySelector('.toast-icon');
        
        if (messageElement) {
            messageElement.textContent = newMessage;
        }

        if (newType && newType !== toastObj.type) {
            toastObj.element.className = `toast toast-${newType}`;
            if (iconElement) {
                iconElement.textContent = ToastSystem.getIcon(newType);
            }
            toastObj.type = newType;
        }

        toastObj.message = newMessage;
    }
}