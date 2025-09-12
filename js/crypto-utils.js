class CryptoUtils {
    static generateKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async encrypt(text, password) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            
            const passwordBuffer = encoder.encode(password);
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                passwordBuffer,
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256',
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedData = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            const encryptedArray = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
            encryptedArray.set(salt, 0);
            encryptedArray.set(iv, salt.length);
            encryptedArray.set(new Uint8Array(encryptedData), salt.length + iv.length);

            return btoa(String.fromCharCode(...encryptedArray));
        } catch (error) {
            console.error('Erro na criptografia:', error);
            throw error;
        }
    }

    static async decrypt(encryptedText, password) {
        try {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            
            const encryptedArray = new Uint8Array(atob(encryptedText).split('').map(c => c.charCodeAt(0)));
            
            const salt = encryptedArray.slice(0, 16);
            const iv = encryptedArray.slice(16, 28);
            const data = encryptedArray.slice(28);

            const passwordBuffer = encoder.encode(password);
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                passwordBuffer,
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256',
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            const decryptedData = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            return decoder.decode(decryptedData);
        } catch (error) {
            console.error('Erro na descriptografia:', error);
            throw error;
        }
    }

    static hash(text) {
        let hash = 0;
        if (text.length === 0) return hash;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }
}