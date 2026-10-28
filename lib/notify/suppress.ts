/** Reserved and test domains (RFC 2606) that must never receive real mail. */
export const RESERVED_EMAIL = /@([a-z0-9-]+\.)*(example\.(com|net|org)|[a-z0-9-]+\.(test|example|invalid|localhost))$/i;
