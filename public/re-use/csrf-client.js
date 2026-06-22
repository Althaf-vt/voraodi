(function () {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (!meta) {
        return;
    }

    const token = meta.getAttribute('content');
    if (!token) {
        return;
    }

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        init = init || {};
        const method = (init.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
            const headers = new Headers(init.headers || {});
            if (!headers.has('X-CSRF-Token')) {
                headers.set('X-CSRF-Token', token);
            }
            init.headers = headers;
        }
        return originalFetch.call(this, input, init);
    };

    if (window.jQuery) {
        window.jQuery.ajaxSetup({
            beforeSend(xhr, settings) {
                const type = (settings.type || 'GET').toUpperCase();
                if (type !== 'GET' && type !== 'HEAD' && type !== 'OPTIONS') {
                    xhr.setRequestHeader('X-CSRF-Token', token);
                }
            },
        });
    }
})();
